# جداول القيم المرجعية وواجهات القراءة

## القيم الثابتة

| جدول قاعدة البيانات   | القيم الحالية                                                                                                                                                                      | GET الذي يعرضها                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `genders`             | `MALE`, `FEMALE`                                                                                                                                                                   | `GET /references/onboarding`                     |
| `roles`               | `USER`, `ADMIN`                                                                                                                                                                    | لا يعرضها API للمستخدم؛ تستخدم داخليًا للصلاحيات |
| `primary_goals`       | `FAT_LOSS`, `STRENGTH_HYPERTROPHY`                                                                                                                                                 | `GET /references/onboarding`                     |
| `fitness_levels`      | `BEGINNER`, `INTERMEDIATE`, `ADVANCED`                                                                                                                                             | `GET /references/onboarding`                     |
| `allergens`           | `MILK`, `EGG`, `PEANUT`, `TREE_NUT`, `SOY`, `WHEAT`, `FISH`, `CRUSTACEAN`, `SESAME`                                                                                                | `GET /references/allergens`                      |
| `body_areas_injuries` | `HEAD`, `NECK`, `SHOULDER`, `UPPER_ARM`, `ELBOW`, `FOREARM`, `WRIST`, `HAND`, `CHEST`, `UPPER_BACK`, `LOWER_BACK`, `ABDOMEN`, `HIP`, `THIGH`, `KNEE`, `LOWER_LEG`, `ANKLE`, `FOOT` | `GET /references/body-areas`                     |

الخيارات الشخصية لا تُعرض منفصلة لكل جدول: هدف المستخدم ومستوى لياقته ونوعه تأتي مجمعة من `/references/onboarding`. جدول `body_areas_injuries` مرتبط بـ`user_injuries`، واسم مسار الـAPI يظل `/references/body-areas` للمحافظة على توافق تطبيق الموبايل.

## كتالوجات المحتوى

هذه بيانات يضيفها أو يعدلها الـAdmin، وليست قوائم أكواد صغيرة. القراءة الإدارية تتطلب Bearer token لمستخدم Admin:

| البيانات                                    | GET للقائمة                                   | GET للتفاصيل               | ملاحظات                                                                                                         |
| ------------------------------------------- | --------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| الأطعمة المنشورة والمكونات المتاحة للاختيار | `/references/foods?search=&limit=30&offset=0` | —                          | يستخدمه التطبيق لاختيار الأطعمة في التفضيلات، ويرجع `kind` بقيمة `FOOD` أو `INGREDIENT`.                        |
| المكونات `ingredients`                      | `/admin/ingredients`                          | `/admin/ingredients/:id`   | يتضمن صف المكون أكواد الحساسية المسجلة له.                                                                      |
| أقسام بدائل الطعام `food_exchange_groups`   | `/admin/food-sections`                        | `/admin/food-sections/:id` | التفاصيل تتضمن نسخ القسم والأطعمة/الحصص المرتبطة.                                                               |
| أقسام الوجبات `meal_sections`               | `/admin/meal-sections`                        | `/admin/meal-sections/:id` | تشمل الأقسام مثل الإفطار.                                                                                       |
| الوجبات `meals`                             | `/admin/meals`                                | `/admin/meals/:id`         | التفاصيل تتضمن كل نسخ الوجبة وعناصرها من جدول `meal_items`. لا يوجد GET منفصل للعناصر لأنها تابعة لنسخة الوجبة. |
| التمارين `exercises`                        | `/admin/exercises`                            | `/admin/exercises/:id`     | المحتوى والإصدارات تظهر من خلال واجهة الإدارة.                                                                  |
| بيانات المستخدم الغذائية                    | `/me/food-preferences`                        | —                          | تعرض الحساسية والأطعمة التي لا يفضلها أو يستبعدها المستخدم.                                                     |

كل طلبات GET لا تحتاج Request body. تستقبل القوائم المدعومة `limit` و`offset` كـquery parameters. تفاصيل الطلبات ذات body موجودة كأمثلة كاملة في ملفات Bruno، ومنها onboarding وإنشاء/تعديل المكونات والوجبات والتفضيلات.

## ملفات Bruno

- القوائم العامة: `bruno/reference/References/`.
- مكتبات الإدارة: `bruno/reference/Admin ingredients/` و`bruno/reference/Admin Food Library/` و`bruno/reference/Admin exercises/`.
- تفضيلات المستخدم: `bruno/reference/Food Preferences/`.
- طلب GET لا يرسل body؛ أما POST/PATCH/PUT فملفات Bruno تعرض body المثال المطلوب.

تُضاف القيم الثابتة بواسطة `npm run seed:lookups`. بيانات الطعام والوجبات والتمارين تُحمّل من أدوات محتوى المكتبات، وتظهر فقط حسب حالة النشر والإتاحة لكل API.
