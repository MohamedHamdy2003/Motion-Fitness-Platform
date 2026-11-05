# جداول القيم المرجعية وواجهات القراءة

## القيم المرجعية

قراءة الخيارات عامة ولا تحتاج تسجيل دخول. جميع المسارات تحت `/api/v1`، ولا ترسل body مع GET. قيم `fitness_levels` و`primary_goals` ليست محصورة في enum؛ القيم النشطة في الجدول هي المرجع. أكواد lookup المرسلة تقبل الأحرف الصغيرة والكبيرة وتُحوّل إلى uppercase قبل التحقق. القيمة غير الموجودة أو المعطلة تُرفض مع اسمها في رسالة الخطأ و`details`.

| جدول قاعدة البيانات   | GET العام                                                | تعديل Admin                                                                              |
| --------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `roles`               | `/references/roles`                                      | تعديل label/order فقط؛ الإضافة والحذف ممنوعان، والأدوار المعتمدة هي `USER` و`ADMIN` فقط. |
| `genders`             | `/references/genders` أو `/references/onboarding`        | `/admin/lookups/genders`                                                                 |
| `primary_goals`       | `/references/primary-goals` أو `/references/onboarding`  | `/admin/lookups/primary-goals`                                                           |
| `fitness_levels`      | `/references/fitness-levels` أو `/references/onboarding` | `/admin/lookups/fitness-levels`                                                          |
| `allergens`           | `/references/allergens`                                  | `/admin/lookups/allergens`                                                               |
| `body_areas_injuries` | `/references/body-areas`                                 | `/admin/lookups/body-areas-injuries`                                                     |

لإنشاء قيمة أرسل `POST /admin/lookups/{table}` مع `{ "code":"...", "label":"...", "display_order":1 }`. مناطق الإصابات يمكنها أيضًا استقبال `parent_code`. لتعديل الاسم أو الترتيب أرسل `PATCH /admin/lookups/{table}/{code}` مع الحقول المراد تعديلها؛ الكود ثابت بعد الإنشاء، وإرسال `active:true` يعيد تفعيل قيمة معطلة. استخدم `DELETE /admin/lookups/{table}/{code}` لتعطيلها منطقيًا وحفظ ارتباطاتها التاريخية. هذه الطلبات الثلاثة تحتاج Bearer token لمستخدم `ADMIN`.

القيم الحالية عند التأسيس: `genders`: `MALE`, `FEMALE`; `primary_goals`: `FAT_LOSS`, `STRENGTH_HYPERTROPHY`; `fitness_levels`: `BEGINNER`, `INTERMEDIATE`, `ADVANCED`; `roles`: `USER`, `ADMIN`; `allergens`: `MILK`, `EGG`, `PEANUT`, `TREE_NUT`, `SOY`, `WHEAT`, `FISH`, `CRUSTACEAN`, `SESAME`; و`body_areas_injuries`: `HEAD`, `NECK`, `SHOULDER`, `UPPER_ARM`, `ELBOW`, `FOREARM`, `WRIST`, `HAND`, `CHEST`, `UPPER_BACK`, `LOWER_BACK`, `ABDOMEN`, `HIP`, `THIGH`, `KNEE`, `LOWER_LEG`, `ANKLE`, `FOOT`.

جدول `body_areas_injuries` مرتبط بـ`user_injuries`، واسم مسار القراءة العام يظل `/references/body-areas` لتوافق تطبيق الموبايل. عند تعطيل خيار لا يظهر في GET العام ولا يُقبل كاختيار جديد.

## كتالوجات المحتوى

هذه بيانات يضيفها أو يعدلها الـAdmin، وليست قوائم أكواد صغيرة. القراءة الإدارية تتطلب Bearer token لمستخدم Admin:

| البيانات                                    | GET للقائمة                                                               | GET للتفاصيل                       | ملاحظات                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| الأطعمة المنشورة والمكونات المتاحة للاختيار | `/references/foods?search=&limit=30&offset=0`                             | —                                  | عام؛ يرجع `kind` بقيمة `FOOD` أو `INGREDIENT`.                                                                            |
| المكونات المتاحة                            | `/references/ingredients` و`/references/ingredients/:id`                  | —                                  | عامة؛ العناصر المؤرشفة لا تظهر. تعديل كتالوج المكونات متاح للـAdmin عبر `/admin/ingredients`.                             |
| أقسام الوجبات والوجبات المنشورة             | `/references/meal-sections`, `/references/meals`, `/references/meals/:id` | —                                  | عامة؛ تعرض الأقسام والوجبات المنشورة والمتاحة فقط. عناصر الوجبة من `meal_items` تظهر ضمن تفاصيل الوجبة.                   |
| المكونات `ingredients`                      | `/references/ingredients`                                                 | `/references/ingredients/:id`      | قراءة عامة للعناصر النشطة؛ الـAdmin يديرها عبر `/admin/ingredients` و`/admin/ingredients/:id` مع حفظ revisions.           |
| أقسام بدائل الطعام `food_exchange_groups`   | `/admin/food-sections`                                                    | `/admin/food-sections/:id`         | التفاصيل تتضمن نسخ القسم والأطعمة/الحصص المرتبطة.                                                                         |
| أقسام الوجبات `meal_sections`               | `/admin/meal-sections`                                                    | `/admin/meal-sections/:id`         | تشمل الأقسام مثل الإفطار.                                                                                                 |
| الوجبات `meals`                             | `/admin/meals`                                                            | `/admin/meals/:id`                 | الـAdmin ينشئ ويعدل وينشر ويؤرشف الوجبات؛ التعديل المنشور ينشئ نسخة جديدة.                                                |
| عناصر الوجبة `meal_items`                   | `/admin/meals/:id/items`                                                  | `/admin/meals/:id/items/:position` | CRUD منفصل للـAdmin؛ كل تعديل يحتاج `expectedRevision`. تعديل وجبة منشورة ينشئ مسودة جديدة حتى تظل النسخة المنشورة ثابتة. |
| التمارين `exercises`                        | `/admin/exercises`                                                        | `/admin/exercises/:id`             | المحتوى والإصدارات تظهر من خلال واجهة الإدارة.                                                                            |
| بيانات المستخدم الغذائية                    | `/me/food-preferences`                                                    | —                                  | تعرض الحساسية والأطعمة التي لا يفضلها أو يستبعدها المستخدم.                                                               |

كل طلبات GET لا تحتاج Request body. تستقبل القوائم المدعومة `limit` و`offset` كـquery parameters. تفاصيل الطلبات ذات body موجودة كأمثلة كاملة في ملفات Bruno، ومنها onboarding وإدارة الخيارات المرجعية وإنشاء/تعديل المكونات والوجبات والتفضيلات.

## ملفات Bruno

- القوائم العامة: `bruno/reference/References/`.
- إدارة القيم المرجعية للـAdmin: `bruno/reference/Admin Lookups/`.
- مكتبات الإدارة: `bruno/reference/Admin ingredients/` و`bruno/reference/Admin Food Library/` و`bruno/reference/Admin exercises/`.
- تفضيلات المستخدم: `bruno/reference/Food Preferences/`.
- طلب GET لا يرسل body؛ أما POST/PATCH/PUT فملفات Bruno تعرض body المثال المطلوب.

تُضاف القيم الثابتة بواسطة `npm run seed:lookups`. بيانات الطعام والوجبات والتمارين تُحمّل من أدوات محتوى المكتبات، وتظهر فقط حسب حالة النشر والإتاحة لكل API.
