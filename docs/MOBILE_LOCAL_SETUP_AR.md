# تشغيل Motion لفريق الموبايل

المتطلبات: Node.js 24، Git، Docker Desktop يعمل بوضع Linux containers، وBruno Desktop للتجربة اليدوية.

```powershell
# تنزيل main بعد دمج الإصدار
 git clone https://github.com/MohamedHamdy2003/Motion-Fitness-Platform.git
# الدخول للمشروع
 cd Motion-Fitness-Platform
# تثبيت المكتبات
 npm ci
# إنشاء إعدادات ومفاتيح محلية
 node scripts/setup-local.cjs
# تشغيل PostgreSQL وانتظار جاهزيتها
 docker compose up -d --wait postgres
# إنشاء وتحديث الجداول
 npm run migration:run
# إضافة الأدوار ومناطق الجسم والحساسية
 npm run seed:lookups
# استيراد الأطعمة والوجبات كمسودات قابلة للمراجعة
 npm run seed:content
# تشغيل السيرفر للتطوير
 npm run dev
```

اترك التيرمنال مفتوحًا. افحص http://localhost:3100/api/v1/health/ready.

في تيرمنال ثانٍ داخل المشروع:

```powershell
# اختبارات API آلية؛ السيرفر يعمل وMAIL_MODE=capture مع DATABASE_URL وMAIL_ENCRYPTION_KEY في .env
npm run bruno
# قراءة OTP محلي لحساب مسجل
npx tsx scripts/read-mail.ts athlete@example.test
# اختبارات الوحدة
npm test
# إنشاء قاعدة اختبارات منفصلة؛ مرة واحدة
 docker compose exec -T postgres createdb -U motion motion_test
# اختبارات PostgreSQL؛ تعدل قاعدة الاختبارات فقط
npm run test:integration
# معرفة IP الكمبيوتر على Windows
ipconfig
```

لتجربة F03: سجل حسابًا محليًا أولًا، ثم امنحه دور ADMIN على قاعدة تطوير محلية فقط:

```powershell
npm run dev:grant-admin -- athlete@example.test
```

افتح مجلد bruno كـCollection واختر local. طلبات الإدارة داخل Admin exercises وAdmin foods وAdmin ingredients وAdmin Media. استخدم accessToken للحساب، ومعرفات النتائج، وأحدث expectedRevision. الطلبات الإدارية لا تعمل بحساب Athlete عادي. [دليل F03](F03_CONTENT_AR.md).

الإعداد الافتراضي capture لا يرسل بريدًا خارجيًا. لتجربة Google ضَع GOOGLE_CLIENT_IDS في .env، واضبط Web client كـserverClientId في Android مع package وSHA-1 صحيحين. أعد تشغيل السيرفر بعد تعديل .env. [إعداد OTP وOAuth](OTP_OAUTH_SETUP_AR.md).

عنوان Android Emulator: http://10.0.2.2:3100/api/v1. الموبايل الحقيقي على نفس الشبكة: http://COMPUTER_IP:3100/api/v1. اسمح بمنفذ 3100 للشبكة الخاصة وHTTP في نسخة Android التجريبية. لا تفتح PostgreSQL للموبايل.

البيانات الغذائية تُضاف محليًا كمسودات من USDA FoodData Central. S3 مطلوب فقط للرفع والتحميل الحقيقي للملفات، وGmail مطلوب للبريد الحقيقي. Apple مؤجل وMastra غير مطلوب لاختبار F03 وGoogle. انظر [شرح مكتبة F08 ومصادرها](F08_FOOD_MEAL_LIBRARY_AR.md).

للتشغيل اليومي: docker compose up -d --wait postgres ثم npm run dev. أوقف السيرفر بـCtrl+C. البديل المبني: npm run build ثم npm start (بعد إيقاف dev). لإيقاف قاعدة البيانات دون حذف بياناتها: docker compose stop postgres.
