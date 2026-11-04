# APIs المشروع القابلة للاختبار

آخر مراجعة للمستند: 4 نوفمبر 2026. آخر فحص صحة إنتاج موثق: 2 نوفمبر 2026. عنوان الإنتاج:

```text
https://13.49.114.20/api/v1
```

فحص المستخدم `GET /health/ready` مباشرة من الإنتاج وكانت النتيجة `ready` وقاعدة البيانات `CONNECTED`. حالة `CONFIGURED_UNVERIFIED` تعني أن فحص الجاهزية لا يرسل بريدًا تجريبيًا؛ تسليم Gmail OTP حقيقي قُبل في اختبار سابق. إعادة الصياغة بالذكاء الاصطناعي غير مفعّلة. هذه مراجعة للكود وطلبات Bruno وحالة الجاهزية، وليست اختبارًا مباشرًا لكل endpoint على بيانات الإنتاج.

## كيف تختبر

كل طلبات Bruno تستخدم `{{baseUrl}}`. اختار Environment باسم `production` لاختبار EC2، أو `local` عند تشغيل API محليًا. بيئة production في المستودع تستخدم العنوان أعلاه؛ اعمل Pull لآخر `main` لو نسخة Bruno عندك قديمة.

طلبات الحسابات المحمية تحتاج `Authorization: Bearer {{accessToken}}` وبريدًا مؤكدًا. التسجيل يرسل OTP ولا يصدر جلسة؛ أكّد البريد ثم سجّل الدخول للحصول على access token. الحساب غير المؤكد لا يستطيع استخدام المسارات المحمية، حتى لو كان لديه token قديم. لا تشغّل طلبات مجموعة `bruno/smoke` على الإنتاج: هي تغيّر بيانات، وتسجيلها مصمم للاختبار المحلي/Capture.

التصنيفات في الجداول:

- **مباشر:** يعمل دون إعداد طرف ثالث، ويكفيه اتصال API/قاعدة البيانات.
- **حساب:** يحتاج حساب Motion مسجلًا، وبعضها يتطلب تأكيد البريد أو تسجيل الدخول.
- **إعداد/صلاحية:** يحتاج مزودًا خارجيًا أو دورًا خاصًا. قد يكون المسار موجودًا لكن يفشل بشكل متوقع إذا الشرط غير متوفر.

## الصحة

| Method | Endpoint        | الوظيفة                                                                                                          | المتطلبات والاختبار                                                                              |
| ------ | --------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| GET    | `/health`       | يتأكد أن خادم HTTP يعمل ويعرض إصدار API.                                                                         | مباشر؛ Bruno: `Health/01-liveness`.                                                              |
| GET    | `/health/ready` | يفحص اتصال PostgreSQL ووجود بيانات lookup الأساسية وعدم وجود migrations معلقة، ويعرض حالة البريد وAI بشكل منفصل. | مباشر؛ Bruno: `Health/02-readiness`. هذا هو الفحص الوحيد الذي تحققت منه مباشرة الآن على الإنتاج. |

## التسجيل والجلسات وOAuth

| Method | Endpoint                       | الوظيفة                                                                | المتطلبات والاختبار                                                                                                                                                                                                        |
| ------ | ------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/register`               | ينشئ حسابًا ويرسل OTP تأكيد البريد؛ لا يصدر جلسة قبل التأكيد.          | يعيد `nextStep: VERIFY_EMAIL`. كلمة المرور الجديدة 8–128 حرفًا وبها رقم ورمز. البريد مُعد في الإنتاج لكن التسليم غير مُتحقق من health. بعد التأكيد استخدم تسجيل الدخول. البريد المكرر يعيد `409 EMAIL_ALREADY_REGISTERED`. |
| POST   | `/auth/login`                  | يسجل دخول المستخدم بعد تأكيد البريد ويصدر access/refresh tokens.       | قبل التأكيد يعيد `403 EMAIL_NOT_VERIFIED`. كلمة المرور الخاطئة تعيد `401 INVALID_CREDENTIALS` برسالة `Email or password is incorrect.` Bruno `Auth/04-login`.                                                              |
| POST   | `/auth/refresh`                | يدوّر refresh token ويصدر جلسة جديدة.                                  | يحتاج `refreshToken` صالحًا لحساب مؤكد؛ الحساب غير المؤكد يعيد `403 EMAIL_NOT_VERIFIED`، وإعادة استخدام token قديم تلغي عائلة الجلسة. Bruno `Auth/05-refresh`.                                                             |
| POST   | `/auth/verify-email`           | يؤكد البريد باستخدام OTP من ستة أرقام.                                 | OTP صالح خلال 10 دقائق وخمس محاولات؛ يحتاج وصول البريد. Bruno `Auth/06-verify-email`.                                                                                                                                      |
| POST   | `/auth/resend-verification`    | يطلب OTP جديدًا لتأكيد البريد.                                         | يرسل استجابة عامة؛ توجد مهلة 60 ثانية، والرسالة السابقة تبطل. Bruno `Auth/07-resend-verification`.                                                                                                                         |
| POST   | `/auth/forgot-password`        | يرسل OTP لاستعادة كلمة المرور دون كشف وجود البريد.                     | يحتاج وصول البريد؛ الاستجابة لا تكشف إن الحساب موجود. Bruno `Auth/08-forgot-password`.                                                                                                                                     |
| POST   | `/auth/verify-reset-code`      | يتحقق من OTP ويصدر reset token أحادي الاستخدام.                        | يحتاج OTP صالحًا؛ reset token صالح 5 دقائق. Bruno `Auth/01-verify-reset-code`.                                                                                                                                             |
| POST   | `/auth/reset-password`         | يغيّر كلمة المرور باستخدام reset token.                                | يتطلب `token`, `newPassword`, `confirmPassword` متطابقين؛ كلمة المرور الجديدة 8–128 حرفًا وبها رقم ورمز؛ يلغي الجلسات القائمة. Bruno `Auth/09-reset-password`.                                                             |
| POST   | `/auth/change-password`        | يغيّر كلمة مرور المستخدم الحالي.                                       | Bearer token وكلمة المرور الحالية؛ الجديدة 8–128 حرفًا وبها رقم ورمز؛ الخطأ في الحالية يعيد `Current password is incorrect.` ويلغي الجلسات عند النجاح. Bruno `Auth/10-change-password`.                                    |
| POST   | `/auth/logout`                 | يلغي الجلسة الحالية.                                                   | Bearer token؛ Bruno `Auth/41-logout`.                                                                                                                                                                                      |
| POST   | `/auth/logout-all`             | يلغي كل جلسات الحساب.                                                  | Bearer token؛ Bruno `Auth/42-logout-all`.                                                                                                                                                                                  |
| POST   | `/auth/challenges`             | يصدر challenge وnonce لتسجيل Google/Apple أو ربط الهوية وإعادة التحقق. | SIGN_IN عام؛ LINK وREAUTHENTICATE يحتاجان Bearer token. Bruno `Auth/11` و`13` و`16` و`18`.                                                                                                                                 |
| POST   | `/auth/google`                 | يتحقق من Google ID token وchallenge ويسجل/يدخل المستخدم.               | يحتاج تنفيذ Google Sign-In داخل تطبيق Android وإرسال idToken الحقيقي وchallengeId؛ Bruno وحده لا يصدر idToken. لا أعتبر تسجيل دخول Google مكتملًا بمجرد إصدار challenge. Bruno `Auth/12`.                                  |
| POST   | `/auth/apple`                  | يتحقق من Apple ID token وauthorization code.                           | غير جاهز للاختبار الحقيقي حاليًا؛ إعداد Apple مؤجل، ويلزم حساب Apple Developer وإعداد المفاتيح والتطبيق. Bruno `Auth/14`.                                                                                                  |
| POST   | `/auth/reauthenticate`         | يصدر إثباتًا قصير الصلاحية لعملية حساسة عبر كلمة مرور أو مزود اجتماعي. | Bearer token؛ مزود اجتماعي يحتاج idToken وchallenge. Bruno `Auth/15–17`.                                                                                                                                                   |
| POST   | `/auth/identities/google/link` | يربط هوية Google بالحساب الحالي.                                       | Bearer token + إثبات إعادة تحقق + Google challenge/token حقيقي. Bruno `Auth/18–19`.                                                                                                                                        |
| POST   | `/auth/identities/apple/link`  | يربط هوية Apple بالحساب الحالي.                                        | غير جاهز حتى تهيئة Apple؛ Bearer token وإثبات إعادة تحقق وبيانات Apple. Bruno `Auth/18` و`20`.                                                                                                                             |

## الحساب والملف والإعدادات

| Method | Endpoint               | الوظيفة                                                                   | المتطلبات والاختبار                                                                                                                                                        |
| ------ | ---------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/me/account-deletion` | يطلب حذف الحساب، ويلغي الجلسات فورًا ويعيد tracking token.                | Bearer token وإثبات إعادة تحقق لغرض DELETE. التنفيذ النهائي يتبع إعداد retention والمهمة الخلفية؛ لا يعني قبول الطلب حذفًا فوريًا لكل بيانات المزودين. Bruno `Account/43`. |
| GET    | `/me/account-deletion` | يستعلم عن حالة طلب حذف الحساب دون إرجاع بيانات الحساب.                    | أرسل `X-Deletion-Token` من الاستجابة السابقة، دون Bearer. Bruno `Account/44`.                                                                                              |
| GET    | `/me`                  | يعيد المستخدم والملف والإصابات والتفضيلات وحالة matching.                 | Bearer token؛ Bruno `Profile/21`.                                                                                                                                          |
| PATCH  | `/me`                  | يعدّل حقول الملف مثل الاسم والطول والوزن الحالي، مع رقم المراجعة المتوقع. | Bearer token و`expectedRevision`؛ الوزن الحالي بلا تاريخ أو سجل قياسات. Bruno `Profile/22`.                                                                                |
| PUT    | `/me/onboarding`       | يحفظ بيانات التهيئة ووزن البداية في معاملة واحدة.                         | Bearer token، عمر أكبر من 18، وكل الحقول المطلوبة؛ `Idempotency-Key` موصى به/مطلوب للمعاملة. Bruno `Profile/23`.                                                           |
| GET    | `/me/settings`         | يعيد تفضيلات العرض والتذكيرات وساعات الهدوء.                              | Bearer token؛ التذكيرات إعداد محفوظ ولا يرسل Push. Bruno `Settings/24`.                                                                                                    |
| PATCH  | `/me/settings`         | يحدّث theme والتذكيرات وساعات الهدوء.                                     | Bearer token و`expectedVersion`؛ Bruno `Settings/25`.                                                                                                                      |
| GET    | `/me/food-preferences` | يعرض تفضيلات واستبعادات الطعام والحساسية.                                 | Bearer token؛ Bruno `Food Preferences/26`.                                                                                                                                 |
| PUT    | `/me/food-preferences` | يستبدل الاختيارات مع رقم المراجعة.                                        | Bearer token، أكواد الحساسية ومعرفات الأطعمة الصالحة؛ كتالوج الأطعمة المنشور فارغ حاليًا، لذا لا تتوقع قائمة أطعمة إنتاجية. Bruno `Food Preferences/27`.                   |
| GET    | `/me/matching/status`  | يعرض حالة المطابقة.                                                       | Bearer token؛ يرجع حالة صادقة `PENDING` بسبب أن F05 غير منفذة، ولا ينشئ برنامجًا تدريبيًا. Bruno `Matching/37`.                                                            |

## إدارة مكتبة الأطعمة والوجبات — F08

هذه الواجهات موجودة في فرع تطوير الميزة، وتتطلب دور `ADMIN` أو `CONTENT_EDITOR`. Seeder يضيف الطعام والوجبات كمسودات؛ لا تظهر بيانات F08 في الإنتاج قبل دمج إصدار مصرح به على `main` ونشره. أمثلة Bruno في `Admin Food Library`.

| Method | Endpoint                           | الوظيفة                                        | شروط النشر                                               |
| ------ | ---------------------------------- | ---------------------------------------------- | -------------------------------------------------------- |
| GET    | `/admin/food-sections`             | قائمة مجموعات بدائل الطعام وحالة النسخة الأحدث | يدعم `limit` و`offset`                                   |
| POST   | `/admin/food-sections`             | إنشاء قسم مسودة بحصص ونسخ أطعمة                | يحتاج foodVersionId لكل عضو                              |
| GET    | `/admin/food-sections/:id`         | تفاصيل القسم والنسخ والأعضاء                   | يعرض حالة كل نسخة طعام                                   |
| POST   | `/admin/food-sections/:id/publish` | نشر نسخة القسم الأحدث                          | بديلان على الأقل وكل نسخ الطعام منشورة                   |
| GET    | `/admin/meal-sections`             | قائمة أنواع/أقسام الوجبات                      | breakfast وmain-meals أمثلة وليست تكافؤًا غذائيًا        |
| POST   | `/admin/meal-sections`             | إنشاء قسم وجبات                                | slug فريد                                                |
| GET    | `/admin/meals`                     | قائمة الوجبات وآخر نسخة                        | يدعم `limit` و`offset`                                   |
| POST   | `/admin/meals`                     | إنشاء وجبة مسودة بعناصر وحصص                   | كل عنصر يشير إلى عضو في قسم طعام                         |
| GET    | `/admin/meals/:id`                 | تفاصيل الوجبة والنسخ والعناصر                  | —                                                        |
| POST   | `/admin/meals/:id/publish`         | نشر نسخة الوجبة الأحدث                         | القسم والأطعمة وأقسام الطعام منشورة والوجبة تحتوي عنصرًا |

## الإصابات والمراجع

| Method | Endpoint                 | الوظيفة                                                       | المتطلبات والاختبار                                                                                                                                           |
| ------ | ------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/me/injuries`           | يعرض الإصابات النشطة مع pagination.                           | Bearer token؛ Bruno `Injuries/28`.                                                                                                                            |
| POST   | `/me/injuries/rewrite`   | يطلب معاينة إعادة صياغة وصف الإصابة؛ لا يحفظ المعاينة.        | Bearer token. **غير متاح في الإنتاج حاليًا** لأن `AI_REWRITE_URL` أو موافقة الاحتفاظ غير مهيأة؛ المتوقع `503 AI_REWRITE_NOT_CONFIGURED`. Bruno `Injuries/29`. |
| POST   | `/me/injuries`           | يحفظ وصف إصابة أكده المستخدم.                                 | Bearer token، body area صالح و`confirmed:true`؛ يمكن إرسال Idempotency-Key. Bruno `Injuries/30`.                                                              |
| PATCH  | `/me/injuries/:id`       | يعدّل الإصابة مع `expectedVersion`.                           | Bearer token وملكية السجل؛ Bruno `Injuries/31`.                                                                                                               |
| DELETE | `/me/injuries/:id`       | يزيل/يعطّل الإصابة بعد تأكيد المستخدم وإرسال النسخة المتوقعة. | Bearer token و`confirmed:true` و`expectedVersion`؛ Bruno `Injuries/32`.                                                                                       |
| GET    | `/references/body-areas` | يعيد أكواد مناطق الجسم وارتباطها الهرمي.                      | Bearer token؛ Bruno `References/33`.                                                                                                                          |
| GET    | `/references/allergens`  | يعيد أكواد الحساسية الابتدائية.                               | Bearer token؛ Bruno `References/34`. الأكواد مرجعية للتطبيق وليست مراجعة طبية معتمدة.                                                                         |
| GET    | `/references/foods`      | يبحث في الأطعمة المرجعية المنشورة ويدعم pagination.           | Bearer token؛ Bruno `References/35`. القائمة فارغة حتى إدخال/نشر بيانات معتمدة.                                                                               |
| GET    | `/references/onboarding` | يعيد الخيارات والسياسة، ومنها الحد الأدنى للعمر.              | Bearer token؛ Bruno `References/36`.                                                                                                                          |

## الصور وملفات مكتبة المحتوى

| Method | Endpoint                      | الوظيفة                                                            | المتطلبات والاختبار                                                                                                                                                                                   |
| ------ | ----------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/media/upload-intents`       | ينشئ رابط S3 مؤقتًا لرفع صورة avatar.                              | Bearer token؛ JPEG/PNG/WebP حتى 5 MiB. ارفع bytes إلى `uploadUrl` باستخدام PUT ثم finalize. S3 مُربوط حسب إعداد المشروع، لكن health لا يختبره؛ افحص استجابة API وS3 في اختبار فعلي. Bruno `Media/38`. |
| POST   | `/media/:id/finalize`         | يتحقق من الصورة المرفوعة وينقلها إلى مفتاح نهائي غير قابل للتغيير. | Bearer token وID ناتج من upload-intent وbody `{}`؛ Bruno `Media/39`.                                                                                                                                  |
| GET    | `/media/:id`                  | يعيد metadata ورابط تنزيل مؤقت لصورة المستخدم الجاهزة.             | Bearer token وملكية الملف؛ الرابط صالح 5 دقائق. Bruno `Media/40`.                                                                                                                                     |
| POST   | `/admin/media/upload-intents` | يرفع صورة أو MP4 لمكتبة التمارين/الأطعمة.                          | Bearer token ودور ADMIN أو CONTENT_EDITOR؛ MIME مسموح وحجم حتى 100 MiB؛ يحتاج S3. Bruno `Admin Media/01-01`.                                                                                          |
| POST   | `/admin/media/:id/finalize`   | يفحص الملف المرفوع ويحوله إلى asset نهائي مشترك.                   | Bearer token ودور تحرير وS3؛ Bruno `Admin Media/01-02`.                                                                                                                                               |
| GET    | `/admin/media`                | يسرد ملفات المكتبة المعلقة أو الجاهزة للمحرر.                      | Bearer token ودور تحرير؛ Bruno `Admin Media/01-05`.                                                                                                                                                   |
| GET    | `/admin/media/:id`            | يعرض metadata أو رابطًا مؤقتًا لملف مكتبة.                         | Bearer token ودور تحرير؛ Bruno `Admin Media/01-03`.                                                                                                                                                   |
| DELETE | `/admin/media/:id`            | يؤرشف ملف مكتبة غير مستخدم في محتوى.                               | Bearer token ودور تحرير؛ الملف المرتبط بمراجعة يرجع `409 MEDIA_IN_USE`. Bruno `Admin Media/01-04`.                                                                                                    |

## إدارة المحتوى

كل المسارات التالية تحتاج Bearer token لمستخدم عليه `ADMIN` أو `CONTENT_EDITOR` في قاعدة البيانات. دون الدور سترجع `403 CONTENT_ACCESS_DENIED`. مكتبة المحتوى لا تحتوي بيانات تمارين/أطعمة إنتاجية جاهزة الآن؛ هذه APIs تعمل للتحرير عندما تجهّز محتوى ومحررًا.

| Method | Endpoint                                                   | الوظيفة                                    | المتطلبات والاختبار                                                                                               |
| ------ | ---------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/ingredients`                                       | يسرد المكونات والبيانات الغذائية المعروفة. | دور محرر؛ pagination؛ Bruno `Admin ingredients/01-01`.                                                            |
| POST   | `/admin/ingredients`                                       | ينشئ هوية مكون ومعلوماته الوصفية.          | دور محرر و`slug` فريد و`content` صالح؛ Bruno `Admin ingredients/01-03`.                                           |
| GET    | `/admin/ingredients/:id`                                   | يعرض مكونًا محددًا.                        | دور محرر؛ Bruno `Admin ingredients/01-02`.                                                                        |
| PATCH  | `/admin/ingredients/:id`                                   | يستبدل بيانات المكون بمراجعة متوقعة.       | دور محرر و`expectedRevision`؛ Bruno `Admin ingredients/01-04`.                                                    |
| DELETE | `/admin/ingredients/:id`                                   | يؤرشف المكون.                              | دور محرر ومراجعة متوقعة؛ Bruno `Admin ingredients/01-06`.                                                         |
| GET    | `/admin/exercises` و`/admin/foods`                         | يسرد مسودات/محتوى التمارين أو الأطعمة.     | دور محرر وpagination؛ Bruno `Admin exercises/01-01` و`Admin foods/01-01`.                                         |
| POST   | `/admin/exercises` و`/admin/foods`                         | ينشئ مسودة تمرين أو طعام.                  | دور محرر، `slug` فريد وpayload مطابق لنوع المحتوى؛ Bruno `Admin exercises/01-03` و`Admin foods/01-03`.            |
| GET    | `/admin/exercises/:id` و`/admin/foods/:id`                 | يعرض العنصر ومراجعاته.                     | دور محرر؛ Bruno `Admin exercises/01-02` و`Admin foods/01-02`.                                                     |
| PATCH  | `/admin/exercises/:id` و`/admin/foods/:id`                 | ينشئ مراجعة مسودة جديدة من محتوى كامل.     | دور محرر و`expectedRevision`؛ النسخة المنشورة لا تُكتب فوقها. Bruno `Admin exercises/01-04` و`Admin foods/01-04`. |
| POST   | `/admin/exercises/:id/publish` و`/admin/foods/:id/publish` | ينشر مراجعة مسودة.                         | دور محرر ومراجعة متوقعة؛ Bruno `Admin exercises/01-05` و`Admin foods/01-05`.                                      |
| DELETE | `/admin/exercises/:id` و`/admin/foods/:id`                 | يؤرشف هوية المحتوى مع حفظ التاريخ.         | دور محرر ومراجعة متوقعة؛ Bruno `Admin exercises/01-06` و`Admin foods/01-06`.                                      |

## ما يعنيه «قابل للاختبار فعليًا» هنا

- فحص الجاهزية على الإنتاج ناجح وقاعدة البيانات متصلة.
- مسارات الحساب والملف والمراجع تعمل على الإنتاج عند استخدام حساب وبيانات صالحة؛ بعضها يحتاج بريد OTP أو حالة حساب معينة.
- إعداد البريد يظهر `CONFIGURED_UNVERIFIED`: لا تعتبر نجاح إنشاء queue دليلًا على وصول الرسالة. اختبر OTP لحساب تملكه.
- Google يتطلب ID token حقيقيًا من تطبيق Android وإعداد Client IDs؛ طلب challenge في Bruno وحده لا يختبر تسجيل Google الكامل. Apple مؤجل.
- إعادة صياغة الإصابة غير جاهزة على الإنتاج الآن؛ فحص الجاهزية يقول `AI_REWRITE: NOT_CONFIGURED`.
- S3 مستخدم لرفع الصور وملفات المكتبة؛ health لا يجري upload. اختبر upload-intent ثم PUT ثم finalize بملف تملكه.
- واجهات الإدارة ليست عامة: تحتاج دور محرر. الطعام والوجبات في F08 تبدأ كمسودات، ولا تظهر في مرجع الطعام العام إلا بعد نشر الطعام.
- Bruno `reference` يوثق الطلبات، أما `smoke` فهو اختبار آلي ببيانات اصطناعية وMAIL capture للاستخدام المحلي/CI. لا تشغّل مجموعة smoke على الإنتاج.

الطلبات مرتبة في [مجموعة Bruno](../bruno) وشرح استخدام البيئات في [دليل GitHub وBruno](GITHUB_AUTOMATION_AR.md). العقد التفصيلي وأشكال البيانات في [API_CONTRACT.md](API_CONTRACT.md).
