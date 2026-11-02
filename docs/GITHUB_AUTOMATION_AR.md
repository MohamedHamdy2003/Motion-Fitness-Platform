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

لإعداد السيرفر، انسخ `bruno/environments/staging.bru` إلى `bruno/environments/production.local.bru`، وعدل baseUrl إلى عنوان API الفعلي شامل `/api/v1`، ثم اختر هذه البيئة. اللاحقة `.local.bru` مستثناة من Git لحفظ إعداداتك والتوكنات محليًا. لا تحفظ أسرارًا في البيئة المشتركة ولا تستخدم force add لرفعها.

أي API جديدة لازم يتضاف لها request في Bruno مع نفس PR. أمر `npm run bruno:check` داخل CI يمنع الدمج لو أي route في controllers ليس له request. الفحص يغطي method/path؛ لا يولد أمثلة body تلقائيًا ولا يثبت صحة كل الحقول. ما زال CI يشغّل مجموعة smoke على قاعدة اختبار ورسائل capture. لا تشغّل smoke على الإنتاج.

## GitHub Actions إلى EC2

بعد push إلى main، Green CI يشغل backend-checks وprivate-ai-checks. بعد نجاح الاثنين يبدأ Deploy EC2 لنفس commit. PR وdev لا ينشران. يتم تخطي commit قديم إذا تقدم main، ومنع تداخل عمليات النشر، وعدم إلغاء نشر جارٍ بسبب push جديد.

النشر الحالي يعتمد على Docker وملف `.env.aws` وشهادة `.local/rds-ca.pem` الموجودين بالفعل داخل مجلد المشروع على السيرفر. لو شغّلت التطبيق بطريقة مختلفة، طابقها أولًا قبل تفعيل هذا المسار. يتطلب checkout نظيفًا؛ لا يحذف تعديلاتك أو أسرار السيرفر.

### 1. مفتاح خاص بالنشر

على جهازك الشخصي، أنشئ مفتاحًا جديدًا في مسار غير مستخدم، واترك passphrase فارغة حتى يعمل بدون إدخال تفاعلي:

```bash
ssh-keygen -t ed25519 -f motion-actions -C motion-github-actions
```

على EC2، افتح الملف التالي وأضف محتوى `motion-actions.pub` في سطر جديد:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

مستخدم ec2-user يحتاج صلاحية Docker والكتابة لمجلد المشروع. المفتاح الخاص `motion-actions` يوضع فقط في GitHub Secret المذكور لاحقًا، ولا يرفع داخل المشروع.

### 2. التحقق من هوية السيرفر

من جلسة EC2 الموثوقة شغّل:

```bash
sudo cat /etc/ssh/ssh_host_ed25519_key.pub
```

كوّن سطر known_hosts باستخدام نفس الـIP أو hostname الذي ستضعه في EC2_HOST:

```text
YOUR_EC2_HOST ssh-ed25519 PUBLIC_HOST_KEY_FROM_SERVER
```

هذا مفتاح هوية السيرفر العام؛ مختلف عن مفتاح دخول النشر. نحفظه لتأكيد أن الاتصال يصل إلى السيرفر الصحيح. لا تستخدم StrictHostKeyChecking=no.

### 3. إعداد GitHub

داخل المستودع: Settings → Environments → New environment، الاسم `production`. لجعل النشر تلقائيًا، لا تضف required reviewers. لو تضيف قيود branches اسمح لـmain فقط.

أضف Environment variables:

| الاسم            | القيمة                                                      |
| ---------------- | ----------------------------------------------------------- |
| EC2_HOST         | Public IP أو hostname للسيرفر بدون http أو مسار             |
| EC2_USER         | ec2-user                                                    |
| EC2_PROJECT_PATH | المسار المطلق للمشروع، اعرفه بأمر pwd من داخله؛ بدون مسافات |

أضف Environment secrets:

| الاسم               | القيمة                                             |
| ------------------- | -------------------------------------------------- |
| EC2_SSH_PRIVATE_KEY | محتوى ملف motion-actions كاملًا مع سطري BEGIN وEND |
| EC2_SSH_KNOWN_HOSTS | سطر هوية السيرفر الذي جهزته                        |

اترك بيانات DB وSMTP ومفتاح JWT داخل `.env.aws` على EC2. لا يحتاج هذا workflow مفاتيح AWS؛ التطبيق يستخدم IAM Role الموجود.

### 4. وصول SSH

الـworkflow يستخدم GitHub-hosted Ubuntu runner واتصال SSH على port 22. فتح 80 و443 وحده لا يكفي. تأكد أن Security Group والشبكة يسمحان بوصول runner على 22. عنوان runner يتغير؛ لو الوصول مقصور على IP جهازك سيحدث timeout. لا توسع الوصول إلى الجميع لمجرد حل timeout؛ يمكن استخدام runner بعنوان ثابت أو الانتقال إلى AWS SSM إذا أردت عدم فتح SSH للـrunner.

### 5. أول تجربة

بعد دمج الملفات في main، راقب Actions → Green CI → Deploy EC2. لو بدأت قبل إعداد المتغيرات ستفشل خطوة النشر برسالة واضحة دون تغيير السيرفر؛ أكمل الإعداد ثم Re-run failed jobs لنفس التشغيل، طالما ما زال آخر commit في main.

على EC2 بعد نجاح النشر:

```bash
cat .local/aws-deployed-revision
curl --fail http://127.0.0.1:3100/api/v1/health/ready
```

الـSHA يجب أن يطابق commit المنشور. اختبار الجاهزية يفحص DB؛ جرّب OTP ورفع ملف منفصلًا للتحقق من SMTP وS3. يوجد انقطاع قصير أثناء استبدال الحاوية. عند فشل الجاهزية يحاول السكربت إعادة image السابقة؛ migrations لا يتم التراجع عنها تلقائيًا. لا تلغِ workflow أثناء النشر؛ قد يظل الأمر البعيد يعمل.

## المصادر

- [Bruno: مشاركة المجموعات وتحديثها عبر Git](https://blog.usebruno.com/share-bruno-collections).
- [GitHub: التحكم في ترتيب jobs وشروطها](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).
