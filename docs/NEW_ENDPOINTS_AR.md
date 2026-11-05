# المسارات الجديدة لإدارة المراجع ومكتبة الطعام

كل المسارات تبدأ بـ`/api/v1`. قراءات `/references/*` عامة ولا تحتاج تسجيل دخول. مسارات `/admin/*` تحتاج Bearer token لمستخدم بدور `ADMIN`.

## القراءة العامة

| Method | Route                         | ماذا يفعل؟                                               | ما يحتاجه؟                                              |
| ------ | ----------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| GET    | `/references/roles`           | يعرض الأدوار المتاحة.                                    | لا body ولا تسجيل دخول. الأدوار ثابتة: `USER` و`ADMIN`. |
| GET    | `/references/genders`         | يعرض قيم النوع النشطة.                                   | لا body ولا تسجيل دخول.                                 |
| GET    | `/references/primary-goals`   | يعرض الأهداف النشطة.                                     | لا body ولا تسجيل دخول.                                 |
| GET    | `/references/fitness-levels`  | يعرض مستويات اللياقة النشطة.                             | لا body ولا تسجيل دخول.                                 |
| GET    | `/references/body-areas`      | يعرض مناطق الإصابات النشطة وعلاقاتها.                    | لا body ولا تسجيل دخول.                                 |
| GET    | `/references/allergens`       | يعرض أكواد الحساسية النشطة.                              | لا body ولا تسجيل دخول.                                 |
| GET    | `/references/onboarding`      | يعرض اختيارات التهيئة النشطة وسياسة العمر وأيام التدريب. | لا body ولا تسجيل دخول.                                 |
| GET    | `/references/foods`           | يبحث في الأطعمة المنشورة والمكونات المتاحة.              | اختياري: `search`, `limit`, `offset`.                   |
| GET    | `/references/ingredients`     | يعرض المكونات غير المؤرشفة.                              | اختياري: `search`, `limit`, `offset`.                   |
| GET    | `/references/ingredients/:id` | يعرض مكونًا واحدًا.                                      | `id` للمكون؛ لا body ولا تسجيل دخول.                    |
| GET    | `/references/meal-sections`   | يعرض أقسام الوجبات التي تحتوي وجبات منشورة ومتاحة.       | لا body ولا تسجيل دخول.                                 |
| GET    | `/references/meals`           | يعرض الوجبات المنشورة والمتاحة.                          | اختياري: `limit`, `offset`.                             |
| GET    | `/references/meals/:id`       | يعرض الوجبة المنشورة وعناصرها `meal_items`.              | `id` للوجبة؛ لا body ولا تسجيل دخول.                    |

## إدارة قيم lookup

| Method | Route                         | ماذا يفعل؟                                                          | ما يحتاجه؟                                                                              |
| ------ | ----------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| POST   | `/admin/lookups/:table`       | يضيف قيمة مرجعية.                                                   | Admin؛ body: `code`, `label`, `display_order`. مناطق الإصابات تقبل أيضًا `parent_code`. |
| PATCH  | `/admin/lookups/:table/:code` | يعدل الاسم أو ترتيب العرض؛ ويمكنه إعادة تفعيل قيمة بـ`active:true`. | Admin؛ body يتضمن الحقول المراد تعديلها. لا يمكن تغيير `code`.                          |
| DELETE | `/admin/lookups/:table/:code` | يعطل القيمة مع الاحتفاظ بالسجلات المرتبطة بها.                      | Admin؛ لا body.                                                                         |

القيم المدعومة في `:table`: `genders`, `primary-goals`, `fitness-levels`, `allergens`, `body-areas-injuries`. يمكن تعديل label والترتيب في `roles` فقط؛ لا يمكن إنشاء أو حذف الأدوار `USER` و`ADMIN`.
لا يمكن تعطيل آخر قيمة نشطة في جدول مطلوب، ولا تعطيل منطقة إصابة أب لها مناطق فرعية نشطة.

## إدارة المكونات والوجبات وعناصرها

| Method | Route                              | ماذا يفعل؟                                    | ما يحتاجه؟                                                                                               |
| ------ | ---------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/ingredients`               | يعرض قائمة المكونات وبياناتها.                | Admin؛ اختياري: `limit`, `offset`.                                                                       |
| POST   | `/admin/ingredients`               | ينشئ مكونًا.                                  | Admin؛ body: `slug`, و`content` التي تشمل `title`, `dietaryTags`, `allergenCodes`, `verificationStatus`. |
| GET    | `/admin/ingredients/:id`           | يعرض بيانات المكون وأكواد حساسياته.           | Admin؛ `id` للمكون.                                                                                      |
| PATCH  | `/admin/ingredients/:id`           | يعدل المكون وينشئ revision جديدًا عند الحاجة. | Admin؛ body: `expectedRevision`, `content`.                                                              |
| DELETE | `/admin/ingredients/:id`           | يؤرشف المكون مع حفظ البيانات السابقة.         | Admin؛ body: `expectedRevision`.                                                                         |
| GET    | `/admin/meals`                     | يعرض الوجبات وإصداراتها الحالية.              | Admin؛ اختياري: `limit`, `offset`.                                                                       |
| POST   | `/admin/meals`                     | ينشئ وجبة مع عناصرها.                         | Admin؛ body: `slug`, `sectionId`, `title`, و`items` (قائمة عناصر الوجبة).                                |
| GET    | `/admin/meals/:id`                 | يعرض الوجبة وكل إصداراتها وعناصر كل إصدار.    | Admin؛ `id` للوجبة.                                                                                      |
| PATCH  | `/admin/meals/:id`                 | يعدل بيانات الوجبة وقائمة عناصرها.            | Admin؛ body: `expectedRevision`, `sectionId`, `title`, `items`.                                          |
| POST   | `/admin/meals/:id/publish`         | ينشر مسودة الوجبة لتظهر في المراجع العامة.    | Admin؛ body: `expectedRevision`.                                                                         |
| DELETE | `/admin/meals/:id`                 | يؤرشف الوجبة.                                 | Admin؛ body: `expectedRevision`.                                                                         |
| GET    | `/admin/meals/:id/items`           | يعرض عناصر أحدث إصدار من الوجبة ورقم مراجعته. | Admin؛ لا body.                                                                                          |
| GET    | `/admin/meals/:id/items/:position` | يعرض عنصرًا واحدًا حسب ترتيبه في الوجبة.      | Admin؛ `position` ترتيب العنصر؛ لا body.                                                                 |
| POST   | `/admin/meals/:id/items`           | يضيف عنصرًا للوجبة.                           | Admin؛ body: `expectedRevision`, `item:{memberId,exchangeUnits,position}`.                               |
| PATCH  | `/admin/meals/:id/items/:position` | يعدل مكون العنصر أو وحداته أو ترتيبه.         | Admin؛ body: `expectedRevision` وحقل واحد على الأقل من `memberId`, `exchangeUnits`, `position`.          |
| DELETE | `/admin/meals/:id/items/:position` | يحذف عنصرًا من الوجبة.                        | Admin؛ body: `expectedRevision`.                                                                         |

تعديلات `meal_items` تتطلب أحدث `expectedRevision`. إذا كانت الوجبة منشورة، ينشئ السيرفر مسودة جديدة ويترك الإصدار المنشور كما هو. ملفات الطلبات الكاملة موجودة في مجموعة Bruno تحت `reference/References/` و`reference/Admin Lookups/` و`reference/Admin Food Library/`.
