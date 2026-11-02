# تحديث Bruno والنشر من GitHub

المستخدم أكد تشغيل التطبيق على EC2 وربطه بـRDS وS3. إعداد Actions هنا يحتاج ضبط الاتصال بالسيرفر ثم أول نشر ناجح لإثبات عمله.

## Bruno عند فريق الموبايل

المجموعة موجودة داخل نفس المستودع في مجلد `bruno`، ومقسمة إلى Auth وProfile ومكتبة المحتوى وغيرها داخل reference. افتح المجلد من Bruno باستخدام Open Collection، بدل استيراد نسخة منفصلة.

أول مرة من Terminal:

```bash
git clone https://github.com/MohamedHamdy2003/Motion-Fitness-Platform.git
cd Motion-Fitness-Platform
```

بعدها افتح مجلد bruno الموجود داخل النسخة دي. للحصول على آخر APIs على نسخة الفريق النظيفة من main:

```bash
git switch main
git pull --ff-only origin main
```

لو الملفات لم تظهر فورًا، أعد فتح المجموعة. يمكن استخدام Pull داخل Git UI في Bruno أيضًا. GitHub لا يدفع التغييرات تلقائيًا إلى تطبيق Bruno المفتوح؛ كل شخص يحتاج Pull.

`baseUrl` متغير على مستوى البيئة في كل طلبات المجموعة. اختار `local` للتشغيل المحلي أو `production` للسيرفر `https://13.49.114.20/api/v1`. بيئة `staging` تظل عنوانًا placeholder حتى تجهيز staging فعلي. قيم البريد والتوكنات في الملفات المشتركة فارغة؛ أدخل القيم محليًا أو أنشئ `production.local.bru`، واللاحقة `.local.bru` مستثناة من Git. لا تحفظ أسرارًا في البيئة المشتركة ولا تستخدم force add لرفعها.

أي API جديدة لازم يتضاف لها request في Bruno مع نفس PR. أمر `npm run bruno:check` داخل CI يمنع الدمج لو أي route في controllers ليس له request. الفحص يغطي method/path؛ لا يولد أمثلة body تلقائيًا ولا يثبت صحة كل الحقول. ما زال CI يشغّل مجموعة smoke على قاعدة اختبار ورسائل capture. لا تشغّل smoke على الإنتاج.

## GitHub Actions إلى EC2 عبر SSM ومستخدم IAM مخصص

بعد push إلى main، Green CI يشغل backend-checks وprivate-ai-checks. بعد نجاح الاثنين يبدأ Deploy EC2 لنفس commit. PR وdev لا ينشران. يتم تخطي commit قديم إذا تقدم main، ومنع تداخل عمليات النشر، وعدم إلغاء نشر جارٍ بسبب push جديد.

حساب AWS الحالي يحجب Identity Providers خلف Advanced features، لذلك يستخدم GitHub مفاتيح مستخدم IAM مخصص لإرسال أمر AWS Systems Manager. تحفظ المفاتيح في Environment Secrets، ويظل port 22 مقصورًا على My IP. لا يحتاج هذا المسار إعداد OIDC أو ترقية الحساب من أجل Identity Providers. المستخدم على EC2 هو ec2-user؛ السكربت يخفض صلاحيات SSM من root إلى هذا المستخدم قبل Git وDocker.

### ذاكرة EC2 قبل أول بناء

بناء Docker للصورة على EC2 يحتاج ذاكرة إضافية. أول محاولة أثبتت أن instance يحتوي حوالي 913MiB RAM وبدون Swap؛ سجل kernel أكد نفاد الذاكرة أثناء بناء الصورة، ما أدى لتعطل Docker مؤقتًا. التطبيق رجع على الصورة القديمة، وملف SHA لم يتغير. قبل إعادة النشر أضف Swap بحجم 2GiB؛ فحص القرص أظهر مساحة كافية:

```bash
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
swapon --show
```

لو `/swapfile` موجود بالفعل، افحصه بـ`swapon --show` ولا تعِد إنشاؤه. الـSwap يستخدم قرابة 2GiB من قرص EBS ويكون أبطأ من RAM. لا تعِد النشر إلا بعد ظهور swap في `free -h`.

الإعداد المؤكد:

- AWS account: `290181458132`.
- Region: `eu-north-1`؛ `eu-north-1a` هي Availability Zone وليست Region.
- Instance: `i-04f68383f87a22a33`.
- Project: `/home/ec2-user/Motion-Fitness-Platform`.
- Public API: `https://13.49.114.20/api/v1`؛ تم اختبار health/ready عبر HTTPS مع التحقق من الشهادة في 2 نوفمبر 2026: ready وdatabase CONNECTED.
- بيانات التطبيق في `.env.aws` وشهادة RDS في `.local/rds-ca.pem` على السيرفر فقط.

### 1. إصلاح اتصال SSM

وجود agent running لا يعني أن السيرفر Online في Systems Manager. السجل المرسل يتضمن أخطاء EC2RoleProvider وUpdateInstanceInformation لكنه مختصر؛ لا يمكن الجزم بالسبب من النص وحده.

من EC2 → Instances → اختر instance → Security → افتح IAM Role المرتبط به. داخل IAM → Permissions → Add permissions → Attach policies، أضف `AmazonSSMManagedInstanceCore` إذا لم تكن موجودة. حافظ على صلاحيات S3 الحالية ولا تستبدل الـRole.

على EC2:

```bash
sudo systemctl restart amazon-ssm-agent
sudo journalctl -u amazon-ssm-agent --since "2 minutes ago" --no-pager -l
```

افتح Systems Manager → Fleet Manager في eu-north-1 وتأكد من ظهور instance بحالة Online. إذا استمر الخطأ، راجع النص الكامل والصلاحيات ووجود اتصال HTTPS outbound على 443 إلى endpoints الخاصة بـssm وssmmessages في المنطقة. لا تحتاج فتح inbound جديد.

### 2. مستخدم IAM خاص بالنشر

IAM → IAM users → Create user، الاسم: motion-github-deploy. لا تفعّل Console access ولا ترفق AdministratorAccess. أكمل الإنشاء بدون صلاحيات واسعة.

افتح المستخدم → Permissions → Add permissions → Create inline policy → JSON. الصق محتوى [سياسة SSM](../deployment/github-ssm-policy.json)، وسمّها MotionDeploySSM.

السياسة تسمح بإرسال AWS-RunShellScript إلى instance المشروع المحدد وقراءة نتيجة الأمر. المستخدم يستطيع تشغيل أوامر على هذا السيرفر، لذلك مفاتيحه أسرار نشر مهمة. GetCommandInvocation يستخدم Resource * لقراءة نتيجة الأوامر. لا تحتاج إنشاء MotionGitHubDeployRole أو Identity provider؛ ملف github-oidc-trust.json خاص بمسار OIDC المؤجل ولا يستخدمه workflow الحالي.

### 3. إنشاء مفتاح النشر

داخل المستخدم → Security credentials → Access keys → Create access key. اختر Application running outside AWS إن ظهر، ثم أكمل الإقرار والوصف وأنشئ المفتاح.

انقل Access key ID وSecret access key مباشرة إلى GitHub Secrets في الخطوة التالية. لا ترسلهما في المحادثة أو تحفظهما في ملفات المشروع أو على EC2. Secret access key يظهر مرة واحدة؛ خزّن نسخة احتياطية في مدير كلمات مرور إذا احتجتها. لا تستخدم مفاتيح root.

### 4. إعدادات GitHub

تم إنشاء بيئة production وضبط branch policy لتسمح بـmain فقط. متغيراتها:

| الاسم            | القيمة                                 |
| ---------------- | -------------------------------------- |
| AWS_REGION       | eu-north-1                             |
| EC2_INSTANCE_ID  | i-04f68383f87a22a33                    |
| EC2_USER         | ec2-user                               |
| EC2_PROJECT_PATH | /home/ec2-user/Motion-Fitness-Platform |

داخل Settings → Environments → production → Environment secrets أضف:

- AWS_ACCESS_KEY_ID: قيمة Access key ID.
- AWS_SECRET_ACCESS_KEY: قيمة Secret access key.

متغير AWS_DEPLOY_ROLE_ARN القديم غير مستخدم، وكذلك EC2_HOST. لا تحتاج SSH Secrets. احتفظ بدور EC2 وصلاحيات S3 وSSM الحالية كما هي. عند تدوير المفتاح، أنشئ مفتاحًا بديلًا وحدّث الـSecrets واختبر النشر قبل تعطيل القديم؛ لا تترك مفاتيح غير مستخدمة فعّالة.

### 5. نقل تعديلات Caddy المحلية مرة واحدة

تم إدراج إعدادات Caddy التي أرسلها المستخدم في `deployment/Caddy.aws`، مع IP افتراضي وprofile shortlived. يمكن تغيير IP عبر API_DOMAIN في `.env.aws`. ملف Caddyfile القديم يظل لإعداد staging القديم؛ AWS يستخدم Caddy.aws. Compose يحتفظ بأسماء caddy_data وcaddy_config وباسم المشروع motion-aws للحفاظ على الشهادات. لا تستخدم docker compose down -v.

ملف compose الجديد لا ينشر port 3100 على المضيف، ويضبط TRUST_PROXY=true لوجود Caddy كوسيط واحد. إذا كان API_DOMAIN في ملف السيرفر موجودًا بقيمة قديمة أو غير صحيحة، عدّله إلى `13.49.114.20` قبل النشر. لا يلزم إضافته إن كان غائبًا لأن القيمة الافتراضية هي هذا IP.

**الأوامر التالية بعد دمج هذه التغييرات في main فقط، وتحت المتابعة لأول نشر.** لا تشغّل reset --hard. احفظ الملفات الحالية ثم stash محددًا للملفين اللذين عدّلتهما:

```bash
cd /home/ec2-user/Motion-Fitness-Platform
backup_dir=$(mktemp -d "$PWD/.local/pre-cicd.XXXXXX")
cp deployment/Caddyfile deployment/compose.aws.yaml "$backup_dir/"
git stash push -m "EC2 proxy configuration before managed deployment" -- deployment/Caddyfile deployment/compose.aws.yaml
git status --short
```

النسخة الاحتياطية تحفظ المحتوى الحالي والـstash يحفظ الـdiff؛ لا تعمل stash pop بعد التحديث لأن إعداداتك أصبحت في النسخة الجديدة. ملفات .bak غير المتتبعة يمكن تركها. الأوامر لا توقف الحاويات، لكن لا تعيد إنشاء Caddy بالإعداد القديم في الفترة بين stash وأول نشر جديد.

نشر Actions يحتاج tracked checkout نظيفًا وسيقف عند أي تعديلات أخرى. لا يحذف أو يعيد كتابة `.env.aws` أو شهادات RDS. لا تنفذ الخطوات قبل استعداد SSM وIAM ونسخة main الجديدة؛ تجهيزها لا يتطلب تعطيل التطبيق الحالي.

### 6. أول نشر والتحقق

بعد اكتمال IAM وظهور instance Online وتنظيف tracked checkout ودمج التغييرات، راقب Actions → Green CI → Deploy EC2. إذا بدأت العملية قبل إكمال الإعداد ستفشل؛ بعد الإصلاح استخدم Re-run failed jobs طالما commit لا يزال أحدث main.

النشر يتحقق من Caddy config، يبني API، ويشغّل migrations ثم يفحص جاهزية API. عند فشل API يحاول إعادة الصورة السابقة؛ DB migrations لا يتم التراجع عنها تلقائيًا. بعد ذلك يشغّل Caddy ويعيد تحميل الإعدادات. يوجد انقطاع قصير، وليس zero-downtime. فشل تشغيل Caddy يفشل العملية ولا يعيد DB أو إعدادات proxy القديمة تلقائيًا.

على EC2:

```bash
cd /home/ec2-user/Motion-Fitness-Platform
cat .local/aws-deployed-revision
curl --fail https://13.49.114.20/api/v1/health/ready
```

لا تستخدم -k؛ نريد التحقق من الشهادة. لو HTTPS لا يعمل بعد رغم جاهزية API، افحص Caddy logs وإصدار الشهادة والمنافذ 80/443 وثبات IP. بعد حذف host port لم يعد curl إلى 127.0.0.1:3100 صالحًا. لفحص الجاهزية داخل الحاوية:

```bash
MOTION_IMAGE="motion-api:$(git rev-parse HEAD)" docker compose --project-name motion-aws --env-file .env.aws -f deployment/compose.aws.yaml exec -T api node -e "fetch('http://127.0.0.1:3100/api/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
```

Actions يطبع command ID وحالته فقط. عند الفشل راجع Systems Manager → Run Command → command ID → Output داخل حساب AWS، ولا تنشر logs فيها أسرار. انتهاء انتظار GitHub أو إلغاؤه لا يضمن توقف الأمر البعيد؛ افحص حالته قبل إعادة المحاولة. يوجد قفل على السيرفر يمنع تحديثين متزامنين.

## المصادر

- [Bruno: مشاركة المجموعات وتحديثها عبر Git](https://blog.usebruno.com/share-bruno-collections).
- [AWS: صلاحيات SSM للـinstance](https://docs.aws.amazon.com/systems-manager/latest/userguide/setup-instance-permissions.html).
- [AWS: تشخيص اتصال SSM Agent](https://docs.aws.amazon.com/systems-manager/latest/userguide/troubleshooting-ssm-agent.html).
- [AWS: إدارة مفاتيح IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html).
- [Caddy: إعداد TLS وACME](https://caddyserver.com/docs/caddyfile/directives/tls).
