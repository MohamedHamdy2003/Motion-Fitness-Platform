# شغل 18 نوفمبر 2026

تم إصلاح حفظ وصف المكوّن وتحديث الخطة. لا توجد endpoints جديدة اليوم.

| Endpoint                               | الوظيفة والتغيير                                                                                                | شكل الاستجابة                                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| PATCH /api/v1/admin/ingredients/:id    | للأدمن: غياب content.description يحافظ على الوصف، النص يستبدله، وnull يمسحه. بقية حقول content المطلوبة كما هي. | {id, slug, title, description, dietary_tags, verification_status, metadata_version, archived}              |
| GET /api/v1/references/ingredients/:id | قراءة المكوّن ووصفه بعد التعديل.                                                                                | {item:{id, slug, title, description, dietary_tags, verification_status, metadata_version, allergen_codes}} |
| GET /api/v1/references/foods           | البحث بالاسم أو الوصف وإرجاع الوصف المحفوظ.                                                                     | {items:[{id,name,kind,description}],limit,offset,contentStatus}                                            |

Bruno: تم توضيح سلوك description في Admin ingredients / edit. آخر إصلاحات main، ومنها إزالة Idempotency-Key، أُدرجت ضمن فرع المراجعة الموجّه إلى dev.

الميزة التالية في الخطة F05: اختيار البرنامج المناسب. هذه الدفعة مخصصة للإصلاحات التي ظهرت أثناء المراجعة.
