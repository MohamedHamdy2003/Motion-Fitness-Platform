# إعداد حسابات Motion وربطها بالمشروع خطوة بخطوة

تمت مراجعة المصادر الرسمية يوم 30 أكتوبر 2026. أسماء بعض القوائم ممكن تختلف قليلًا مع تحديث مواقع الخدمات.

الدليل ده تعليمات للإعداد، مش تأكيد إن الحسابات اتعملت أو اتربطت. كل القيم المكتوبة بين `< >` أمثلة لازم تستبدلها بقيمك.

**تحديث معتمد 31 أكتوبر 2026:** المستخدم اختار Public Server IP بدون شراء دومين. خطوات DNS أدناه اختيارية فقط، وليست مطلوبة لمسار IP. هنحتاج شهادة HTTPS عامة للـIP وتجديدًا آليًا؛ إعداد Caddy الحالي لا يُعتبر مفعّلًا لهذا المسار قبل ضبطه واختباره. السن أصبح أكبر من 18، والوزن الحالي بدون تاريخ أو سجل قياسات. [آخر القرارات](PRODUCT_DECISIONS_AR.md).

## 1. هنحتاج إيه وبأي ترتيب؟

| الترتيب | الخدمة          | دورها                                                                           |
| ------- | --------------- | ------------------------------------------------------------------------------- |
| 1       | Oracle Cloud    | تشغيل سيرفر الـAPI، وخدمة Mastra الخاصة عند تفعيلها                             |
| 2       | Neon            | حفظ بيانات PostgreSQL                                                           |
| 3       | DNS             | توصيل اسم السيرفر بعنوانه؛ Cloudflare لدومين تملكه أو DuckDNS لاسم تجريبي مجاني |
| 4       | Gmail           | إرسال تأكيد البريد واستعادة كلمة المرور                                         |
| 5       | Google Cloud    | إنشاء بيانات تسجيل الدخول باستخدام Google                                       |
| 6       | Apple Developer | إعداد تسجيل الدخول باستخدام Apple إذا عندك العضوية اللازمة                      |
| 7       | Object Storage  | حفظ صور الحسابات، وممكن يكون داخل حساب Oracle نفسه                              |
| 8       | مزوّد AI        | تشغيل إعادة صياغة الإصابات بعد اختيار المزوّد وسياسة البيانات                   |

GitHub متوصل بالفعل. مش محتاج حساب Firebase Authentication أو Neon Auth؛ تسجيل الدخول في Motion مسؤولية الـBackend الموجود.

الميزانية الحالية مجانية: ما تفعّلش اشتراكًا مدفوعًا أثناء الخطوات. إنشاء حساب Apple مجاني مختلف عن عضوية Developer؛ العضوية المعروضة حاليًا 99 دولارًا سنويًا أو المقابل المحلي. لو مش متاحة بالفعل، نأجّل تفعيل Apple لقرار مصروفات منفصل. [تفاصيل Apple](https://developer.apple.com/programs/).

## 2. اتفق مع مطوري الموبايل على معرّفات التطبيق

قبل Google وApple، اطلب منهم:

- **Android package name:** المعرّف الحقيقي للتطبيق، مثال توضيحي `com.company.motion`.
- **Android SHA-1:** بصمة شهادة debug، وبعدها شهادة الإصدار الفعلي. مطور Android يقدر يستخرجها باستخدام `gradlew signingReport` داخل مشروعه.
- **Android SHA-256:** هنحتاجها لاحقًا لروابط App Links؛ مختلفة عن SHA-1.
- **iOS Bundle ID:** المعرّف الحقيقي لتطبيق iOS.
- **روابط فتح التطبيق:** المسارات المطلوبة لتأكيد البريد واستعادة كلمة المرور.

الأسماء التوضيحية هنا مش معرّفات مسجّلة للمشروع.

## 3. إنشاء Oracle Cloud وتجهيز السيرفر

### إنشاء الحساب

1. افتح [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/) واختار إنشاء حساب مجاني.
2. اكتب بياناتك الحقيقية، وأكّد البريد والهاتف حسب خطوات التسجيل.
3. اختار **Home Region** بعناية؛ ما تفترضش إنك هتقدر تغيّرها لاحقًا. اختار منطقة قريبة من مستخدميك ومتاحة للحساب.
4. كمّل التحقق بالبطاقة إذا طلبه Oracle. ما تختارش ترقية **Pay As You Go**.
5. بعد الدخول، فعّل التحقق بخطوتين.

التجربة المؤقتة وموارد Always Free حاجتان مختلفتان. هنستخدم الموارد المكتوب عليها **Always Free eligible** فقط. توافرها مش مضمون، وOracle ممكن يسترد موارد خاملة. [شروط الحساب](https://www.oracle.com/cloud/free/faq/) · [حدود Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

### إنشاء السيرفر

1. اعمل Compartment باسم `motion-staging` لتنظيم موارد المشروع.
2. من **Networking → Virtual Cloud Networks** استخدم معالج إنشاء شبكة باتصال إنترنت، لو مفيش شبكة جاهزة.
3. من **Compute → Instances → Create instance** سمّي السيرفر `motion-api-staging`.
4. اختار صورة Ubuntu عليها أهلية Always Free، وشكل `VM.Standard.A1.Flex` إذا متاح مجانًا. البداية المقترحة **1 OCPU و6 GB RAM**؛ راجع إجمالي حسابك وتقدير التكلفة قبل الإنشاء.
5. اختار Public subnet وPublic IPv4. احتفظ بعنوان الـIP اللي هيظهر بعد الإنشاء.
6. جهّز SSH key pair واحتفظ بالمفتاح الخاص على جهازك. ده مختلف عن باسورد Oracle.
7. راجع إن الموارد داخل الحد المجاني. لو ظهر Out of capacity، ما تعالجش ده بترقية مدفوعة.

افتح في قواعد الشبكة TCP `80` و`443` للإنترنت، و`22` لعنوان الإنترنت الخاص بك فقط. هنراجع جدار الحماية داخل Ubuntu كمان. مش هنفتح `3100` أو `3001` أو منفذ قاعدة البيانات للعامة. [خطوات إنشاء VM الرسمية](https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/launchinginstance.htm).

الدخول من PowerShell على Windows، بعد استبدال المسارات والعنوان:

```powershell
ssh -i "C:\path\to\motion-ssh.key" ubuntu@<SERVER_PUBLIC_IP>
```

من هذه النقطة أوامر السيرفر في الدليل **Linux**، مش PowerShell.

## 4. إنشاء Neon وربط قاعدة البيانات

1. افتح [Neon Console](https://console.neon.tech/) وسجّل بحسابك.
2. اختار خطة **Free**، ثم أنشئ مشروعًا باسم `motion-staging`.
3. اختار منطقة قريبة من سيرفر Oracle. اسم الـbranch الافتراضي في Neon مش نفس فروع GitHub.
4. من **Connect** اختار قاعدة البيانات والمستخدم.
5. اختار اتصال **Direct / غير pooled** في الإعداد الحالي للمشروع. رابط pooled غالبًا فيه `-pooler`؛ مش هنستخدمه هنا لأن نفس الاتصال مسؤول عن migrations وقفل النشر أيضًا.
6. احتفظ برابط PostgreSQL في ملف الأسرار؛ الرابط يحتوي كلمة مرور.

Neon يعرض حاليًا خطة Free بدون بطاقة. طريقة استخراج الرابط موضحة في [دليل الاتصال](https://neon.com/docs/connect/connect-from-any-app)، وحدود الخطة في [التسعير](https://neon.com/pricing).

داخل `.env.staging` لاحقًا:

```dotenv
DATABASE_URL=postgresql://<USER>:<ENCODED_PASSWORD>@<DIRECT_HOST>/<DATABASE>?sslmode=verify-full
DATABASE_SSL=true
```

حافظ على ترميز الباسورد الموجود في الرابط. ما تستبدلش اسم المستخدم أو اسم القاعدة افتراضيًا بقيم مختلفة. المشروع بيستخدم التحقق من شهادة TLS؛ ما نعالجش أخطاء الاتصال بتعطيل التحقق.

**اختبار الربط:** بعد تشغيل السيرفر، `/api/v1/health/ready` لازم يرجع اتصال قاعدة البيانات `CONNECTED`.

## 5. إعداد DNS واسم الـAPI

DNS بيربط اسمًا سهلًا بعنوان الـIP. مش هو استضافة السيرفر، ومش قاعدة البيانات.

### لو عندك دومين بالفعل: Cloudflare

1. اعمل حساب على [Cloudflare](https://dash.cloudflare.com/).
2. أضف الدومين واختار خطة DNS المجانية.
3. راجع السجلات الحالية، خصوصًا سجلات البريد؛ ما تمسحهاش.
4. غيّر nameservers عند شركة تسجيل الدومين للقيم اللي Cloudflare يديها لك.
5. بعد تفعيل الدومين، من **DNS → Records → Add record** أضف:

| الحقل        | القيمة                      |
| ------------ | --------------------------- |
| Type         | `A`                         |
| Name         | `api-staging`               |
| IPv4 address | Public IPv4 لسيرفر Oracle   |
| Proxy status | `DNS only` في الإعداد الأول |
| TTL          | `Auto`                      |

هيبقى الاسم مثل `api-staging.your-domain.com`. ما تضفش سجل AAAA إلا لو IPv6 متجهّز فعليًا. إدارة DNS المجانية لا تعني شراء دومين مجاني. [إعداد nameservers](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/) · [إضافة سجل](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/).

### لو معندكش دومين وعايز staging بدون شراء

1. افتح [DuckDNS](https://www.duckdns.org/)، وسجّل الدخول بالطريقة المتاحة.
2. احجز اسمًا متاحًا للتجربة، مثال توضيحي `motion-staging-yourname.duckdns.org`.
3. حدّث سجل IPv4 ليشير **لسيرفر Oracle**؛ ما تسيبش عنوان جهازك اللي الموقع قد يكون اكتشفه تلقائيًا.
4. احتفظ بتوكن DuckDNS كسرّ لإدارة DNS؛ مش مطلوب داخل Backend.

DuckDNS بيقدم أسماء فرعية مجانية تشير للـIP المختار. لو عنوان السيرفر اتغير، لازم تحدّثه. ده عنوان staging، مش وعدًا بعنوان منتج دائم. [شرح الخدمة الرسمي](https://www.duckdns.org/about.jsp).

اختبر من جهازك:

```powershell
Resolve-DnsName <ACTUAL_API_HOSTNAME>
```

الناتج لازم يشير للـIP الصحيح قبل طلب شهادة HTTPS.

## 6. ربط السيرفر بالمشروع وتشغيل HTTPS

### تثبيت الأدوات وجلب الكود

ثبّت Docker Engine وCompose plugin على Ubuntu باستخدام [دليل Docker الرسمي](https://docs.docker.com/engine/install/ubuntu/)، ثم تأكد:

```bash
sudo docker version
sudo docker compose version
```

بعد تثبيت Git لو مش موجود:

```bash
git clone --branch main https://github.com/MohamedHamdy2003/Motion-Fitness-Platform.git
cd Motion-Fitness-Platform
cp .env.example .env.staging
touch .env.ai
chmod 600 .env.staging .env.ai
```

ملف `.env.ai` يفضل فارغًا والخدمة غير مفعّلة لحد تجهيز AI. ملفات الأسرار دي مستبعدة من Git.

### القيم الأساسية

افتح `.env.staging` بمحرر على السيرفر، وعدّل:

```dotenv
NODE_ENV=production
PORT=3100
API_DOMAIN=<ACTUAL_API_HOSTNAME_WITHOUT_HTTPS>
DATABASE_URL=<NEON_DIRECT_CONNECTION_URL>
DATABASE_SSL=true
JWT_SECRET=<GENERATED_RANDOM_SECRET>
JWT_ISSUER=motion-api
JWT_AUDIENCE=motion-mobile
TRUST_PROXY=true
MAIL_MODE=disabled
AI_RETENTION_APPROVED=false
DELETION_RETENTION_APPROVED=false
```

ولّد قيمة مستقلة لكل مفتاح مطلوب باستخدام الأمر التالي على السيرفر:

```bash
openssl rand -hex 32
```

استخدم ناتجًا لـJWT_SECRET، وناتجًا مختلفًا لكل من MAIL_ENCRYPTION_KEY وAPPLE_ENCRYPTION_KEY وAI_SERVICE_TOKEN عند إعدادها. لا تعيد استخدام نفس القيمة لكل المفاتيح.

السن أكبر من 18 ثابت في الكود، والوزن والطول قيم حالية في الملف الشخصي بدون تواريخ قياس أو سجل. لا توجد قائمة طرق قياس مطلوبة للإعداد.

### التشغيل

من جذر نسخة المشروع على السيرفر:

```bash
sudo docker compose --env-file .env.staging -f deployment/compose.staging.yaml build api
sudo docker compose --env-file .env.staging -f deployment/compose.staging.yaml up -d api proxy
```

`--env-file` هنا مهم عشان Compose يقرأ API_DOMAIN أيضًا. بدء السيرفر بيشغّل migrations وبيانات القوائم الأساسية تلقائيًا من أمر النشر الصريح.

Caddy الموجود في المشروع مسؤول عن HTTPS بعد صحة DNS ووصول المنافذ. افتح:

```text
https://<ACTUAL_API_HOSTNAME>/api/v1/health/ready
```

نجاح health يثبت تشغيل الأساس، لكنه لا يثبت ربط البريد وGoogle وApple. ومع MAIL_MODE=disabled، التسجيل المحلي واستعادة كلمة المرور بيرجعوا EMAIL_NOT_CONFIGURED لحد إعداد الإرسال.

## 7. إعداد Gmail للإرسال

1. اختار حساب Gmail مخصصًا لرسائل المشروع لو متاح.
2. من إعدادات أمان Google فعّل **2-Step Verification**.
3. افتح [App passwords](https://myaccount.google.com/apppasswords)، وأنشئ كلمة مرور تطبيق باسم `Motion staging`.
4. احتفظ بها مباشرة في إعدادات السيرفر؛ ما تستخدمش باسورد حساب Google العادي.

بعض أنواع الحسابات وسياسات الأمان لا تتيح App passwords. لو الاختيار مش ظاهر، ما تفترضش إن الباسورد العادي بديل. [تعليمات Google](https://support.google.com/accounts/answer/185833).

داخل `.env.staging`:

```dotenv
MAIL_MODE=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<SENDER_GMAIL_ADDRESS>
SMTP_PASSWORD=<APP_PASSWORD>
MAIL_FROM=<SENDER_GMAIL_ADDRESS>
MAIL_ENCRYPTION_KEY=<INDEPENDENT_64_HEX_CHARACTERS>
RESET_LINK_BASE=<APPROVED_RESET_LINK>
VERIFY_LINK_BASE=<APPROVED_VERIFY_LINK>
```

587 بيستخدم STARTTLS في الكود. هنختبر الوصول من VM لحساب الإرسال ومنه لعنوان اختبار تختاره.

**روابط التطبيق جزء مستقل:** اتفق مع مطوري الموبايل على الروابط، وخلي التطبيق يعالج `token` ويعرض شاشة التأكيد أو تغيير الباسورد. روابط HTTPS تحتاج Android App Links وiOS Universal Links وملفات إثبات الربط على الدومين. إضافة قيمة env لوحدها مش بتنشئ الشاشات أو ملفات الربط، وCaddy الحالي مش بيقدّمها تلقائيًا. [Android](https://developer.android.com/training/app-links/verify-applinks) · [iOS](https://developer.apple.com/documentation/xcode/supporting-associated-domains).

بعد تعديل إعدادات أي خدمة:

```bash
sudo docker compose --env-file .env.staging -f deployment/compose.staging.yaml up -d api
```

**الاختبار:** سجّل بعنوان بريد اختبار حقيقي تختاره، وتأكد إن الرسالة وصلت والرابط فتح الشاشة الصحيحة. QUEUED معناها الرسالة دخلت الطابور، مش تأكيد التسليم. لا تشغّل smoke بحسابات example.test مع Gmail الحقيقي.

## 8. إعداد تسجيل الدخول باستخدام Google

### إنشاء المشروع وشاشة الموافقة

1. افتح [Google Cloud Console](https://console.cloud.google.com/)، وأنشئ مشروعًا باسم `Motion` أو اختار مشروع المؤسسة المناسب.
2. افتح **Google Auth Platform**؛ قد يظهر عندك **APIs & Services → OAuth consent screen**.
3. كمّل Branding باسم التطبيق وبريد الدعم والتواصل.
4. اختار Audience مناسبًا؛ لحسابات Gmail العامة غالبًا External، وخلال التجربة أضف أعضاء الفريق ضمن Test users حسب إعدادات الشاشة.
5. خلي الصلاحيات المطلوبة لتسجيل الدخول فقط: `openid` و`email` و`profile`. إعداد Gmail SMTP السابق لا يحتاج صلاحية قراءة Gmail هنا.

النشر العام له متطلبات branding وبيانات وسياسة خصوصية حسب حالة التطبيق؛ ما تنشرش سياسة شكلية غير معتمدة. [إعداد OAuth](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) · [متطلبات النشر](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).

### إنشاء Client IDs

من **Clients → Create client** أو **Credentials → Create credentials → OAuth client ID**:

1. أنشئ **Web application** باسم `Motion Backend`. الـClient ID ده هو server client ID اللي هنستخدمه لطلب ID token موجه للـBackend.
2. أنشئ **Android** باستخدام package name وSHA-1 الحقيقيين. اعمل إعداد debug والإصدار بحسب شهادات الفريق.
3. أنشئ **iOS** باستخدام Bundle ID الحقيقي. مطور iOS يضبط client ID وURL scheme داخل مشروع Xcode. [إعداد clients](https://developers.google.com/workspace/guides/create-credentials) · [إعداد iOS](https://developers.google.com/identity/sign-in/ios/start-integrating).

اجمع IDs التي أنشأتها لهذا المشروع في:

```dotenv
GOOGLE_CLIENT_IDS=<WEB_CLIENT_ID>,<ANDROID_CLIENT_ID>,<IOS_CLIENT_ID>
```

لو عندك أكثر من Android client ضيف IDs الفعلية المطلوبة. الـBackend الحالي بيتحقق من audience ومن authorized party عند وجودها، لذلك نراجع مع الفريق قيم `aud` و`azp` قبل الاختبار. لا نضيف IDs لتطبيقات غير مملوكة للمشروع.

في Android، مطور التطبيق يستخدم Web client ID في `setServerClientId`، وnonce القادم من Motion في `setNonce`. [دليل Android الحالي](https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation).

### تجربة الربط

1. التطبيق يستدعي `POST /api/v1/auth/challenges` بالقيم `provider: GOOGLE` و`purpose: SIGN_IN`.
2. يستخدم nonce الراجع كما هو في طلب Google.
3. يرسل ID token وchallengeId إلى `POST /api/v1/auth/google`.
4. يستقبل توكنات Motion ويستخدمها في `GET /api/v1/me`.

مشروعنا الحالي بيتحقق من ID token المرسل من تطبيق الموبايل. **مسار `/auth/google` مش browser redirect callback**، فلا تسجله كعنوان تحويل OAuth. Google client secret مش مطلوب في إعداد التحقق الحالي. IDs الخاصة بالموبايل تُشارك مع المطورين؛ المفاتيح السرية ما بتدخلش التطبيق.

## 9. إعداد تسجيل الدخول باستخدام Apple

لو معندكش عضوية Developer مناسبة بالفعل، إنشاء Apple Account وحده لا يكمّل الخطوة دي. نقدر نكمّل بقية الخدمات ونترك Apple غير مفعّل بدل شراء اشتراك ضمن الميزانية المجانية. [العضويات والقدرات](https://developer.apple.com/programs/whats-included/).

### iOS native

1. افتح [Apple Developer Account](https://developer.apple.com/account/).
2. من **Certificates, Identifiers & Profiles → Identifiers** أنشئ أو اختار App ID بالـBundle ID الصحيح.
3. فعّل **Sign in with Apple**، وخلي مطور iOS يضيف نفس capability في Xcode والتوقيع المناسب. [القدرات المتاحة](https://developer.apple.com/help/account/reference/supported-capabilities-ios).
4. احتفظ بـTeam ID من بيانات العضوية.
5. من **Keys → +** أنشئ مفتاحًا لـSign in with Apple واربطه بالـprimary App ID.
6. نزّل ملف `.p8` واحتفظ بـKey ID. خزّن المفتاح في مكان آمن، وما ترفعهوش لـGitHub. [إنشاء المفتاح](https://developer.apple.com/help/account/capabilities/create-a-sign-in-with-apple-private-key/).

داخل `.env.staging`:

```dotenv
APPLE_CLIENT_IDS=<IOS_BUNDLE_ID>
APPLE_TEAM_ID=<TEAM_ID>
APPLE_KEY_ID=<KEY_ID>
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n<KEY_CONTENT>\n-----END PRIVATE KEY-----"
APPLE_ENCRYPTION_KEY=<INDEPENDENT_64_HEX_CHARACTERS>
```

المفتاح هنا محتوى `.p8` بصيغة مناسبة للإعدادات، مش مساره. الكود الحالي بيحوّل `\n` لأسطر ويولّد client secret بنفسه. نراجع تنسيق المفتاح محليًا بدون نشره في المحادثة.

التطبيق يطلب challenge لـAPPLE، ويستخدم nonce كما هو، ثم يرسل `idToken` و`authorizationCode` و`challengeId` إلى `/api/v1/auth/apple`. نختبر اتفاق الـSDK مع nonce لأن بعض المكتبات بتعمل hashing تلقائيًا.

### Apple من Android أو متصفح

المسار ده يحتاج **Services ID** مرتبطًا بالـprimary App ID، ودومين وReturn URL فعليًا. إنشاء Services ID يتم من Identifiers ثم تفعيل Sign in with Apple وضبط Domains وReturn URLs. [دليل Apple](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/).

**لسه محتاجين تنفيذ/تحديد استقبال web callback وربطه بالتطبيق لهذا المسار.** الـBackend الحالي عنده endpoint JSON لتسليم التوكنات، لكنه مش callback لنتيجة متصفح Apple. ما نكتبش `/api/v1/auth/apple` كـReturn URL ونعتبر التدفق اكتمل. لا تضف Services ID للقائمة إلا بعد تجهيز المسار واختباره.

## 10. إعداد تخزين صور الحساب

ممكن نستخدم **Oracle Object Storage** داخل نفس الحساب بدل إنشاء حساب استضافة إضافي.

1. افتح **Storage → Object Storage → Buckets** داخل compartment المشروع.
2. أنشئ bucket خاصًا باسم فريد مثل `motion-avatars-<unique-suffix>`، بنوع Standard وبدون إتاحة عامة. راجع حدود التخزين المجانية الفعلية في الحساب.
3. جهّز IAM user/group مخصصين للتخزين، بصلاحيات قراءة وكتابة وحذف objects داخل هذا الـbucket فقط. ما تستخدمش بيانات administrator للتطبيق. [مرجع الصلاحيات](https://docs.oracle.com/en-us/iaas/Content/Identity/Reference/objectstoragepolicyreference.htm).
4. من بيانات المستخدم أنشئ **Customer Secret Key** للـS3 compatibility API. احتفظ بـAccess Key وSecret Key. ده مختلف عن Oracle login أو OCI API signing key. [إعداد المفاتيح](https://docs.oracle.com/en-us/iaas/Content/Identity/access/working-with-customer-secret-keys.htm).
5. جهّز Lifecycle rule لحذف objects اللي اسمها يبدأ بـ`uploads/` بعد يوم، مع صلاحية تنفيذ lifecycle المطلوبة للخدمة. ما تطبّقهاش على `avatars/`. [دليل Lifecycle](https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/usinglifecyclepolicies.htm).

قيم الربط الموجودة في كود المشروع:

```dotenv
S3_ENDPOINT=<COMPATIBLE_VIRTUAL_HOSTED_SERVICE_ENDPOINT>
S3_REGION=<ORACLE_REGION_ID>
S3_BUCKET=<BUCKET_NAME>
S3_ACCESS_KEY_ID=<ACCESS_KEY>
S3_SECRET_ACCESS_KEY=<SECRET_KEY>
```

**نقطة توافق لازم نراجعها قبل التفعيل:** إعداد AWS SDK الحالي لا يفرض path style. Oracle عنده endpoint قديم/path style وvirtual-hosted endpoint، وشروط نطاق اسم الـbucket تختلف. نختار endpoint وشكل bucket المتوافقين حسب المنطقة؛ لو استخدمنا namespace/path-style endpoint نعدّل إعداد العميل ونتحقق منه قبل الربط. لا نفترض إن نسخ أي Object Storage URL يكفي. [توثيق Oracle للتوافق](https://docs.oracle.com/en-us/iaas/Content/Object/s3-virtual-style.htm).

**الاختبار:** upload intent ثم رفع bytes ثم finalize ثم قراءة الصورة بالرابط المؤقت. كمان نتأكد إن مستخدم تاني ما يقدرش يقرأها أو يربطها بحسابه.

## 11. Mastra ومزوّد الذكاء الاصطناعي

في التجهيز الحالي، Mastra خدمة خاصة موجودة في الكود وبتشتغل على السيرفر. مش لازم تعمل حساب Mastra Cloud أو سيرفر ثالث دلوقتي.

المطلوب قبل تفعيلها: اختيار مزوّد وموديل، مراجعة السماح بالاستخدام والتكلفة وسياسة التعامل مع أوصاف الإصابات، ثم إنشاء مفتاح API من حساب المزوّد المختار. المزوّد لسه مش محسوم، ولذلك مفيش اسم خدمة مفروض أو وعد باستخدام مجاني غير متحقق.

بعد الاتفاق، داخل `.env.ai`:

```dotenv
AI_MODEL=<APPROVED_PROVIDER/MODEL>
AI_SERVICE_TOKEN=<INDEPENDENT_RANDOM_SECRET>
AI_RETENTION_APPROVED=true
# Add the credential variable required by the chosen provider.
```

وفي `.env.staging`:

```dotenv
AI_REWRITE_URL=http://ai:3001/internal/v1/rewrite
AI_SERVICE_TOKEN=<SAME_SERVICE_TOKEN_AS_ENV_AI>
AI_RETENTION_APPROVED=true
```

`true` يتكتب بعد مراجعة سياسة البيانات والموافقة عليها، مش كخطوة لتجاوز خطأ إعداد. ممنوع وضع DATABASE_URL في `.env.ai`.

تشغيل الخدمة بعد جاهزيتها:

```bash
sudo docker compose --env-file .env.staging -f deployment/compose.staging.yaml --profile rewrite up -d --build api ai proxy
```

منفذ AI لا يظهر للعامة. نختبر المعاينة ببيانات اختبار غير حقيقية، ونؤكد إنها ما حفظتش إصابة قبل تأكيد المستخدم.

## 12. ربط Bruno بالمراحل دي

1. انسخ `bruno/environments/staging.bru` إلى `bruno/environments/staging.local.bru` على جهاز التطوير؛ النسخة الأخيرة مستبعدة من Git.
2. غيّر `baseUrl` للعنوان الحقيقي: `https://<HOST>/api/v1`.
3. اختار البيئة المحلية المخصصة من Bruno.
4. جرّب Health ثم التسجيل ببريد اختبار حقيقي ثم التأكيد والدخول وProfile والإصابات.
5. جرّب Google/Apple والتخزين وAI بعد تفعيل كل خدمة فعلًا.

القيمة الصحيحة لـbaseUrl لا تحتوي `/health` أو `/auth`؛ كل request بيضيف مساره.

## 13. إيه اللي تقدر تبعته هنا وإيه اللي يفضل في ملفات الأسرار؟

تقدر تبعت اسم المنطقة، Public IP، hostname، package name، Bundle ID وOAuth client IDs؛ دي هتفيدني في مراجعة الإعداد. بعد كل مرحلة قولي اسمها وإنها خلصت، عشان نراجع الربط الفعلي.

خلي كلمات المرور، DATABASE_URL، SSH private key، Gmail app password، ملف Apple `.p8`، ومفاتيح التخزين والـAI داخل ملفات الأسرار أو مدير أسرار. ما تحطهاش في الشات أو GitHub.

**أول خطوة عملية:** حساب Oracle وتوفّر VM مجانية، ثم Neon ورابط الاتصال المحفوظ بأمان. بعدها DNS وتشغيل HTTPS، ثم نفعل البريد وGoogle. Apple والتخزين والـAI ليهم مراحل التفعيل الموضحة فوق.
