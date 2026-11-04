# Motion Fitness Platform — Backend

خادم APIs لتطبيق لياقة يساعد المستخدمين على إدارة حساباتهم وملفاتهم وبرامج التمرين والتغذية.

## الأدوات الأساسية

**Node.js 24 · TypeScript · NestJS · PostgreSQL · TypeORM · Docker · Bruno**

يستخدم المشروع AWS EC2 لتشغيل الـAPI، وAmazon RDS لقاعدة البيانات، وAmazon S3 للملفات الخاصة. النشر مؤمّن بـHTTPS عبر Caddy، ويُفحص بواسطة GitHub Actions.

## تشغيل المشروع محليًا

المتطلبات: Node.js 24 وnpm وDocker Desktop.

```powershell
npm ci
node scripts/setup-local.cjs
docker compose up -d --wait postgres
npm run migration:run
npm run seed:lookups
npm run seed:content
npm run dev
```

عنوان الـAPI المحلي: `http://localhost:3100/api/v1`.

لإنشاء مستخدم محرر محتوى محلي، سجّل حسابًا ثم نفّذ:

```powershell
npm run dev:grant-editor -- user@example.com
```

ملف `.env` محلي ومُستبعد من Git. الإعداد المحلي يلتقط رسائل البريد للاختبار ولا يرسلها إلى Gmail.

## الاختبارات وBruno

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run bruno:check
```

لتشغيل اختبارات قاعدة البيانات، شغّل PostgreSQL وقاعدة اختبار اسمها ينتهي بـ`_test` ثم:

```powershell
npm run test:integration
```

لتجربة طلبات Bruno تلقائيًا، شغّل الـAPI محليًا ثم:

```powershell
npm run bruno
```

لفحوص خدمة الذكاء الاصطناعي المنفصلة:

```powershell
npm --prefix ai-service ci
npm --prefix ai-service run typecheck
npm --prefix ai-service test
npm --prefix ai-service run build
```

افتح مجلد `bruno/` في تطبيق Bruno للطلبات اليدوية. اختر `local` للتطوير. طلبات `reference` مرتبة حسب المجال، ومنها `Auth` و`Profile` و`Admin Food Library`؛ أما `smoke` فتجربة آلية ببيانات مؤقتة ولا تُشغّل على الإنتاج.

## ما الذي يقدمه التطبيق؟

- تسجيل ودخول وحماية جلسات الحساب.
- تأكيد البريد واستعادة كلمة المرور باستخدام OTP.
- ملف شخصي وقياسات حالية وإصابات وتفضيلات المستخدم.
- إدارة محتوى التمارين والأطعمة والوسائط بصلاحيات إدارية.
- مكتبة طعام ووجبات F08 قيد العمل: بيانات USDA تُحمّل كمسودات للمراجعة.
- Google OAuth مهيأ من جهة الخادم؛ إتمامه يحتاج تطبيق Android يرسل `idToken` وبيانات التحدي.
- تسجيل Apple مؤجل. خدمة الذكاء الاصطناعي الخاصة موجودة، لكن مزود الإنتاج غير مفعّل.

## هيكل المشروع

```text
src/
  modules/                 APIs الحساب والملف والمحتوى والوسائط
  infrastructure/database/ إعداد PostgreSQL وMigrations وSeeders
  infrastructure/jobs/     البريد والمهام الخلفية
ai-service/                خدمة Mastra خاصة منفصلة
bruno/                      طلبات API والبيئات
deployment/                 Docker وCaddy وسكربتات AWS
.github/workflows/          فحوص GitHub Actions والنشر
docs/                       الخطة والأدلة وعقود API
test/                       اختبارات الوحدة والتكامل
```

## طريقة البناء

تستقبل NestJS طلبات REST وتتحقق من المدخلات والصلاحيات، ثم تتعامل مع PostgreSQL من خلال TypeORM واستعلامات SQL. قاعدة البيانات لا تنشئ الجداول تلقائيًا؛ التغييرات تُسجّل كـMigrations. خدمة Mastra داخلية منفصلة، ولا تتصل بقاعدة بيانات التطبيق مباشرة. مصدرها موجود، لكن خدمة الإنتاج ومزود الذكاء الاصطناعي غير مفعّلين حاليًا.

## قاعدة البيانات وملفات Seeder

- PostgreSQL هو مخزن الحسابات والملفات الشخصية والمحتوى والجلسات والمهام.
- `npm run migration:run` ينشئ أو يحدّث الجداول.
- `npm run seed:lookups` يضيف القوائم الأساسية مثل الأدوار ومناطق الجسم والحساسيات.
- `npm run seed:content` يستورد 17 طعامًا و6 أمثلة وجبات من USDA FoodData Central.
- الأطعمة والأقسام والوجبات المستوردة تبدأ كـ`DRAFT` وتحتاج مراجعة قبل النشر. مصدر البيانات وتاريخه مذكوران في [دليل F08](docs/F08_FOOD_MEAL_LIBRARY_AR.md).
- الطعام يرتبط بمكونات؛ أقسام الطعام تجمع بدائل بحصص؛ والوجبات تتكون من أعضاء هذه الأقسام. لا يقرر الخادم أن البدائل متساوية غذائيًا.
- النسخ المنشورة ثابتة؛ التعديلات تنشئ مراجعات أو نسخًا جديدة.

## النشر على AWS

```text
GitHub push إلى main → GitHub Actions: فحوص CI → AWS Systems Manager → EC2
EC2: Docker → NestJS API → PostgreSQL على RDS
EC2 IAM Role → S3 خاص
Caddy → HTTPS على عنوان IP → API
```

البيئة الحية: `https://13.49.114.20/api/v1`. لا نحتاج Domain أو DNS حاليًا.

GitHub Actions يشغّل CI على `dev` و`main`. النشر إلى EC2 يعمل فقط بعد push إلى `main` ونجاح الفحوص. حسب توجيه المستخدم، تبقى الميزات الجديدة على `dev` ولا تدمج إلى `main` إلا بعد طلب إصدار صريح؛ لذلك تطوير الميزة الحالية لا ينشر تلقائيًا على السيرفر.

تفاصيل الأوامر والحالة في [دليل AWS](docs/AWS_DEPLOYMENT_AR.md) و[دليل GitHub Actions](docs/GITHUB_AUTOMATION_AR.md).

## وثائق مفيدة

- [شرح حالة المشروع](docs/PROJECT_PROGRESS_AR.md)
- [جدول APIs](docs/APIS_ACTUAL_AR.md)
- [عقد API](docs/API_CONTRACT.md)
- [مكتبة الطعام والوجبات F08](docs/F08_FOOD_MEAL_LIBRARY_AR.md)
- [تشغيل الموبايل محليًا](docs/MOBILE_LOCAL_SETUP_AR.md)
- [خطة المشروع](Motion_Backend_Plan.md)

لا ترفع ملفات `.env` أو أسرار AWS أو كلمات المرور أو التوكنات إلى GitHub.
