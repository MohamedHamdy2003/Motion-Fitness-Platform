# تسجيل الدخول وربط Google

مسار `/auth/challenges` واحد، ويتغير هدفه حسب قيمة `purpose`. الـchallenge قصير الصلاحية (5 دقائق) ويُستخدم مرة واحدة. يعيد `challengeId` و`nonce` لربط محاولة Google بالطلب الذي بدأه التطبيق.

## تسجيل الدخول بحساب Google

1. يرسل التطبيق `POST /auth/challenges` من دون Bearer:

   ```json
   { "provider": "GOOGLE", "purpose": "SIGN_IN" }
   ```

2. يمرر التطبيق `nonce` إلى Google Sign-In، ثم يأخذ Google `idToken`.
3. يرسل التطبيق `POST /auth/google` وفيه `idToken` و`challengeId`.
4. يتحقق السيرفر من التوقيع والجمهور والـnonce، ثم يرجع access/refresh tokens الخاصة بـMotion.

## ربط Google بحساب Motion مفتوح بالفعل

الربط يضيف طريقة دخول أخرى للحساب الحالي؛ لا يدمج حسابين ولا ينقل بيانات بينهما. يحتاج كل من التحدي والطلب النهائي إلى Bearer token الخاص بحساب Motion الحالي.

1. أنشئ تحدي ربط:

   ```http
   POST /auth/challenges
   Authorization: Bearer <accessToken>
   ```

   ```json
   { "provider": "GOOGLE", "purpose": "LINK" }
   ```

2. مرر `nonce` العائد إلى Google Sign-In، لتحصل على `idToken` يخص حساب Google المراد ربطه.
3. أعد إثبات ملكية حساب Motion الحالي لتحصل على `reauthenticationToken`:
   - حساب كلمة مرور: `POST /auth/reauthenticate` مع `{"method":"PASSWORD","password":"<current password>","purpose":"LINK"}`.
   - حساب اجتماعي مربوط: اطلب تحديًا ثانيًا بـ`purpose: "REAUTHENTICATE"`، مرر nonce إلى مزود الحساب الحالي، ثم أرسل توكنه إلى `/auth/reauthenticate` مع `method` و`purpose: "LINK"`.
4. أكمل الربط:

   ```http
   POST /auth/identities/google/link
   Authorization: Bearer <accessToken>
   ```

   ```json
   {
     "idToken": "<Google idToken من تحدي LINK>",
     "challengeId": "<challengeId من تحدي LINK>",
     "reauthenticationToken": "<إثبات حديث لحساب Motion>"
   }
   ```

الاستجابة الناجحة `{ "status": "LINKED", "provider": "GOOGLE" }`. لو كانت هوية Google مرتبطة بحساب آخر، يرفض السيرفر الطلب بدل دمج الحسابين.

## ما معنى REAUTHENTICATE؟

`purpose: "REAUTHENTICATE"` يطلب إثباتًا جديدًا بهوية اجتماعية **مربوطة مسبقًا** بالحساب الحالي. بعده يرسل التطبيق التوكن إلى `POST /auth/reauthenticate`، فيصدر السيرفر تصريحًا قصيرًا لغرض مثل الربط أو حذف الحساب. لا ينشئ جلسة دخول جديدة ولا يربط الهوية وحده.

طلبات Bruno توضح الأمثلة في `bruno/reference/Auth/11-google-challenge.bru` و`18-link-challenge.bru` و`19-link-google-identity.bru`.
