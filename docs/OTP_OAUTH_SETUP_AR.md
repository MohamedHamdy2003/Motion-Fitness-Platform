# تشغيل OTP وتسجيل الدخول الخارجي

## البريد

- التسجيل وإعادة إرسال التأكيد يرسلان كودًا من 6 أرقام صالحًا 10 دقائق.
- تأكيد البريد: POST /auth/verify-email مع email وcode كنص للحفاظ على الأصفار في البداية.
- نسيان الباسورد: POST /auth/forgot-password مع email.
- تحقق من الكود عبر POST /auth/verify-reset-code مع email وcode. الاستجابة تتضمن resetToken صالحًا خمس دقائق ولمرة واحدة.
- غيّر الباسورد عبر POST /auth/reset-password مع token (قيمة resetToken) وnewPassword وconfirmPassword.
- الحد خمسة تخمينات للكود، وانتظار دقيقة لإعادة الإرسال، وستة طلبات لكل هوية خلال 15 دقيقة. الكود الجديد يلغي القديم. إصدار كود استعادة جديد يلغي تصريح الاستعادة السابق أيضًا.
- الأكواد مخزنة كـHMAC بمفتاح سري، ومحتوى البريد مشفر في طابور الإرسال. لا ترسل الكود أو تصريح الاستعادة للسجلات.
- لا توجد حاجة إلى VERIFY_LINK_BASE أو RESET_LINK_BASE. وضع capture للاختبارات فقط؛ smtp للإرسال الحقيقي. رسائل الاختبار السابقة لا تنتقل تلقائيًا إلى SMTP.

## Google على Android

الموجود محليًا: معرفان Google Client IDs. صيغة المعرف وحدها لا تثبت نوعه أو صحة ربط تطبيقه؛ راجع Google Cloud Console.

1. جهز OAuth consent screen وTest users إن كان التطبيق في Testing.
2. أنشئ Android OAuth client باسم package المطابق للتطبيق وبصمة SHA-1 لشهادة التوقيع. جهز بصمات debug وrelease وPlay App Signing بحسب النسخ المستخدمة.
3. جهز Web OAuth client في نفس المشروع؛ التطبيق يستخدمه كـserverClientId مع Credential Manager لطلب ID token للـBackend.
4. GOOGLE_CLIENT_IDS قائمة مفصولة بفواصل تشمل الجمهور المتوقع للتوكن ومعرف العميل المسموح به إن ظهر في azp. لا نحتاج client secret لهذا المسار.
5. التطبيق يطلب POST /auth/challenges مع provider=GOOGLE وpurpose=SIGN_IN. يمرر nonce المستلم إلى Google، ثم يرسل idToken وchallengeId إلى POST /auth/google.
6. نختبر على جهاز: دخول جديد، دخول متكرر، توكن خاطئ، nonce معاد استخدامه، والخروج. النجاح يرجع توكنات Motion.

[دليل Android الرسمي](https://developer.android.com/identity/sign-in/credential-manager-siwg) — [التحقق على السيرفر](https://developers.google.com/identity/sign-in/web/backend-auth).

## Apple على iOS

إعدادات Apple المحلية فارغة حاليًا. Bundle ID وحده لا يكفي.

1. App ID مطابق للـBundle ID، مع تفعيل Sign in with Apple في حساب المطور وفي Signing & Capabilities داخل Xcode.
2. مفتاح Sign in with Apple بصيغة p8 مرتبط بالتطبيق، وTeam ID وKey ID.
3. ضع APPLE_CLIENT_IDS (Bundle ID للمسار الأصلي على iOS)، APPLE_TEAM_ID، APPLE_KEY_ID، APPLE_PRIVATE_KEY في .env فقط.
4. جهز APPLE_ENCRYPTION_KEY عشوائيًا بطول 32 بايت مكتوبة كـ64 حرف hex؛ ده لتشفير توكنات Apple المحفوظة لأغراض إلغاء الربط.
5. التطبيق يطلب challenge للمزود APPLE، ويضبط nonce بحيث تكون قيمة nonce داخل ID token مطابقة لقيمة التحدي. لا تضف hashing إضافيًا دون تنسيق مع عقد السيرفر.
6. يرسل idToken وauthorizationCode وchallengeId إلى POST /auth/apple. السيرفر يتحقق من التوكن ويبادل كود Apple ثم يصدر جلسة Motion.

[تفعيل capability](https://developer.apple.com/help/account/identifiers/enable-app-capabilities/) — [إنشاء المفتاح](https://developer.apple.com/help/account/capabilities/create-a-sign-in-with-apple-private-key/).

لو المقصود Apple Login على Android، ده مسار ويب منفصل يحتاج Services ID وHTTPS callback؛ استقبال callback لهذا المسار غير منفذ حاليًا. Google Login على iOS يحتاج iOS OAuth client مضبوطًا بالـBundle ID وإعداد URL scheme في التطبيق.

## الوصول إلى الـBackend

OAuth يحتاج تطبيق الموبايل نفسه؛ المشروع الحالي Backend. localhost على الموبايل يشير للموبايل، وليس الكمبيوتر. للتشغيل المنشور نحتاج عنوان API مع HTTPS موثوق. إعداد IP HTTPS على Oracle لم يُختبر بعد. لا ترسل مفاتيح أو ID tokens في المحادثة؛ اضبطها واختبرها من التطبيق أو الملفات المحلية.
