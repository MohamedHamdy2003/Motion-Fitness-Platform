# نشر Motion على AWS EC2 + RDS + S3

تحديث 1 نوفمبر 2026: المستخدم جهز الخدمات واختبر اتصال EC2 بـRDS وS3. الملفات هنا تجهز نشر التطبيق؛ لم يتم الدخول إلى السيرفر أو نشر Motion من هذه المحادثة. Oracle وNeon لم يعودا هدف النشر الحالي.

## المطلوب على EC2

- Amazon Linux 2023 x86_64 (تم تأكيده) مع Docker Engine وCompose plugin وGit وcurl وflock. الصورة تدعم البناء على x86_64 أو ARM64 حسب الجهاز.
- IAM Instance Profile مرفق بـEC2. داخل Docker bridge يجب أن يصل AWS SDK إلى IMDSv2؛ راجع hop limit=2 وHttpTokens=required. لا تحتاج وضع Access Keys ثابتة في GitHub أو داخل التطبيق.
- RDS PostgreSQL، مع سماح Security Group باتصال EC2 بمنفذ 5432. استخدم اسم RDS endpoint الأصلي للتحقق من شهادة TLS.
- Bucket خاص في نفس المنطقة المحددة في S3_REGION؛ اترك S3_ENDPOINT فارغًا وS3_AUTH_MODE=iam.
- مستخدم النشر يملك صلاحية تشغيل Docker والكتابة إلى checkout؛ صلاحية Docker قوية ويجب تخصيص الوصول إليها.

## تثبيت Docker على Amazon Linux 2023

نفذ داخل جلسة SSH على EC2. لا تحتاج تثبيت Node.js أو PostgreSQL على EC2؛ Node داخل الصورة، وقاعدة البيانات على RDS PostgreSQL كما تم تأكيده.

```bash
# تثبيت Docker وGit وأداة قفل النشر
sudo dnf install -y docker git util-linux
# تشغيل Docker تلقائيًا مع السيرفر
sudo systemctl enable --now docker
# السماح لمستخدم SSH الحالي بتشغيل Docker
sudo usermod -aG docker "$USER"
# تثبيت Compose plugin لجميع المستخدمين
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl --fail --show-error --location https://github.com/docker/compose/releases/download/v5.6.0/docker-compose-linux-x86_64 --output /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
```

اخرج من SSH وادخل من جديد لتفعيل المجموعة، ثم:

```bash
docker version
docker compose version
docker run --rm hello-world
```

إصدار Compose مثبت حسب [تعليمات Docker الحالية](https://docs.docker.com/compose/install/linux/)؛ التثبيت اليدوي يحتاج تحديثًا يدويًا لاحقًا.

المستخدم أكد عدم وجود Domain أو HTTPS حتى الآن، ووجود Public IP ومنافذ 80/443 مفتوحة. فتح المنافذ لا ينشئ شهادة. يمكن إصدار شهادة IP موثوقة بدون شراء domain، لكن يجب إعداد ACME والتجديد الآلي وproxy والتحقق من ثبات IP؛ لم يتم تنفيذ ذلك على EC2 بعد. [توثيق Let's Encrypt لشهادات IP](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability).

## أول إعداد

نفذ من مجلد مناسب على EC2 بعد دمج الإصدار في main:

```bash
git clone https://github.com/MohamedHamdy2003/Motion-Fitness-Platform.git
cd Motion-Fitness-Platform
cp deployment/aws.env.example .env.aws
chmod 600 .env.aws
mkdir -p .local
curl --fail --show-error --location https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem --output .local/rds-ca.pem
chmod 644 .local/rds-ca.pem
```

عدّل .env.aws على السيرفر فقط:

- DATABASE_URL: المستخدم والباسورد وRDS endpoint واسم DB. اعمل URL encoding للباسورد؛ مثال # تصبح %23. TLS مضبوط عبر DATABASE_SSL=true والشهادة المركبة داخل الحاوية، ولا يتم تعطيل التحقق من الشهادة.
- JWT_SECRET: قيمة عشوائية قوية لا تقل عن 32 حرفًا، ثابتة بين النشرات.
- MAIL_MODE=smtp مع Gmail وMAIL_FROM ومفتاح MAIL_ENCRYPTION_KEY من 32 بايت hex. استخدم App Password جديدة إذا سبق رفع القديمة إلى Git.
- GOOGLE_CLIENT_IDS: معرفات Google المعتمدة. Apple مؤجل.
- S3_REGION وS3_BUCKET؛ اترك S3_ACCESS_KEY_ID وS3_SECRET_ACCESS_KEY فارغين.
- توليد مفتاح تشفير: `openssl rand -hex 32`. توليد JWT secret: `openssl rand -hex 48`. خزّن النتائج في ملف السيرفر ولا تنشرها في سجلات Actions.

الـIAM Role يحتاج s3:PutObject وs3:GetObject وs3:DeleteObject على مسارات uploads/ وavatars/ وlibrary/ داخل الـbucket. CopyObject يحتاج قراءة المصدر وكتابة الوجهة. لو مستخدم SSE-KMS راجع أيضًا صلاحيات مفتاح KMS. لا تجعل الـbucket عامًا؛ روابط الرفع والقراءة مؤقتة.

## الوصول والـHTTPS

الافتراضي API_BIND_ADDRESS=127.0.0.1 وAPI_HOST_PORT=3100. هذا مناسب لـreverse proxy على نفس EC2؛ لا يجعل التطبيق متاحًا للموبايل من الإنترنت بمفرده. لو تختبر باستخدام IP مباشرة يمكن تغيير bind إلى 0.0.0.0 والسماح بمنفذ 3100 لمصادر الاختبار في Security Group؛ هذا HTTP فقط. HTTPS عام موثوق يحتاج إعدادًا منفصلًا حسب اختيارك (proxy أو load balancer وشهادة). لا يوجد ادعاء أن IP HTTPS أصبح جاهزًا.

TRUST_PROXY=false افتراضيًا. فعّله فقط عند ضبط proxy موثوق ومنع الوصول المباشر الذي يسمح بتزوير عنوان العميل.

## أمر النشر الذي ستستدعيه GitHub Actions

بعد أن تعمل الـAction checkout للـcommit المقصود على EC2:

```bash
bash deployment/deploy-aws.sh "$(git rev-parse HEAD)"
```

السكربت:

1. يمنع نشرين متزامنين ويشترط checkout نظيفًا ومطابقًا للـSHA المطلوب.
2. يبني image باسم motion-api:COMMIT_SHA على EC2.
3. يشغّل migrations وseed:lookups مرة واحدة تحت قفل قاعدة البيانات، قبل استبدال التطبيق.
4. يشغّل الحاوية وينتظر health/ready. عند فشل الجاهزية يحاول إعادة الصورة السابقة ويخرج بكود فشل.
5. يسجل آخر commit ناجح في .local/aws-deployed-revision. لا يحذف الصور القديمة تلقائيًا.

الترقية على حاوية واحدة قد تسبب انقطاعًا قصيرًا؛ ليست zero-downtime. الرجوع للصورة السابقة لا يرجع migrations؛ صمم تغييرات DB متوافقة مع الإصدار السابق واستخدم snapshot/backup قبل تغييرات مدمرة. على أول نشر، الفشل يوقف الحاوية غير الجاهزة.

لـGitHub Actions التي تجهزها: استهدف main، انتظر نجاح Green CI على نفس SHA قبل النشر، استخدم concurrency للنشر، وتحقق من SSH host key. مفاتيح SSH إن استخدمتها تكون GitHub Secrets؛ بيانات RDS وSMTP تفضل محفوظة في .env.aws على EC2. لا تطبع env أو docker compose config دون --quiet. لا تجعل checkout غير موثوق من PR يعمل على سيرفر الإنتاج.

## التحقق بعد النشر

```bash
curl --fail http://127.0.0.1:3100/api/v1/health/ready
MOTION_IMAGE="motion-api:$(cat .local/aws-deployed-revision)" docker compose --project-name motion-aws --env-file .env.aws -f deployment/compose.aws.yaml ps
```

Health يتحقق من DB وmigrations؛ لا يثبت صلاحيات S3 أو تسليم Gmail. اختبر بعده OTP لحسابك، ثم upload-intent ورفع الملف عبر PUT وfinalize وقراءة الرابط من Bruno. اختبر Google من Android الحقيقي مع nonce. لا تشغل smoke fixtures على SMTP الإنتاجي.

## المصادر

- [AWS SDK credential chain وEC2 roles](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html)
- [IMDSv2 داخل containers](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-IMDS-new-instances.html)
- [RDS PostgreSQL TLS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html)
