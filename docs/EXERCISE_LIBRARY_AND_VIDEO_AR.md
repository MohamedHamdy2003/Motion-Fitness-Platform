# مكتبة التمارين وربط فيديو الشرح

## فين بيتخزن الفيديو؟

الفيديو نفسه لا يُخزّن داخل PostgreSQL. الملف يُرفع إلى S3 الخاص، وجدول `media_assets` يحتفظ ببياناته مثل `id` و`mime` و`size` و`status` و`storage_key`.

التمرين له سجل عام في جدول `exercises`، وكل نسخة محتوى له في `exercise_revisions`. معرّف الفيديو يوضع في `exercise_revisions.media_id`، وهو مفتاح أجنبي إلى `media_assets.id`. حقل `content.mediaId` في عقدة محتوى التمرين يطابقه، وقاعدة البيانات تتحقق من عدم اختلاف القيمتين. عنصر البرنامج في `workout_exercises.exercise_revision_id` يشير إلى نسخة التمرين نفسها، لذلك يظل محتوى البرنامج ورابط الفيديو مرتبطين بالنسخة المنشورة.

Seed التمارين موجود في `src/infrastructure/database/seeds/data/exercise-library.v1.json`، ويُشغّل بواسطة:

```powershell
npm run seed:exercises
```

الـSeeder ينشئ تمارين بحالة `DRAFT` و`mediaId: null`. يكرر الاستيراد بأمان، ولا ينشر التمارين تلقائيًا. الأوصاف والتعليمات مكتوبة للمشروع، وأسماء الحركات وتصنيفها راجعتها مراجع ACE وNHS، مع مرجع ACSM لتمارين المقاومة. لا يحتوي الملف فيديوهات أو صورًا منسوخة.

## كيف أضيف فيديو للتمرين؟

1. اقرأ التمرين من `GET /api/v1/admin/exercises` وخذ `id` الخاص بالتمرين، ثم من أحدث عنصر في `versions` خذ `id` الخاص بنسخة التمرين و`revision`.
2. اطلب رابط الرفع من `POST /api/v1/admin/media/upload-intents` بجسم مثل:

   ```json
   { "mime": "video/mp4", "size": 1234567 }
   ```

3. ارفع الملف نفسه إلى `uploadUrl` باستخدام `PUT` والعناوين التي أعادها الخادم، ثم نادِ `POST /api/v1/admin/media/{mediaId}/finalize` بجسم `{}`. يجب أن يكون الملف MP4 صالحًا، والحجم الأقصى 100 MiB.
4. حدّث نسخة التمرين عبر `PATCH /api/v1/admin/exercises/{exerciseId}`، وأرسل المحتوى كاملًا مع `expectedRevision` و`content.mediaId` بقيمة معرّف الرفع الذي أصبح `READY`.
5. انشر نسخة التمرين عبر `POST /api/v1/admin/exercises/{exerciseId}/publish` مع `expectedRevision`.
6. استخدم معرّف النسخة المنشورة (`exerciseRevisionId`) داخل برنامج F04. انشر البرنامج بعد اكتمال مراجعة التمارين والوجبات.

لا تعدّل فيديو تمرين بعد ربط نسخة منشورة من البرنامج به. تعديل محتوى تمرين منشور ينشئ نسخة جديدة؛ إذا أردت أن يستخدمها برنامج منشور، أنشئ نسخة مسودة جديدة من البرنامج واربط نسخة التمرين الجديدة بها ثم أعد نشر البرنامج.

## هل يستطيع تطبيق المستخدم تشغيله الآن؟

F04 يحفظ رابطة الفيديو ويعيد `mediaId` ضمن محتوى التمرين من API الإدارة. لكنه لا يعيّن برنامجًا لمستخدم ولا يوفّر API لجلب اليوم الحالي أو رابط تشغيل فيديو للمستخدم. هذه تحتاج استكمال F05/F06 وواجهة الاستخدام في F07، بالإضافة إلى مسار آمن للمستخدم المعيّن لإصدار رابط تنزيل/تشغيل S3 قصير الصلاحية. لا تستخدم `GET /admin/media/{id}` من تطبيق المستخدم؛ هذا المسار محمي بصلاحيات إدارة المحتوى.

## التمارين المبدئية

يتضمن الملف 19 حركة مقاومة أساسية: squat وlunge وhip hinge وbridge وcalf raise وpush-up وpress وrow وoverhead press وتمارين الذراع والجذع وlat pulldown. جميعها مسودات تحتاج تدقيق محرر التمارين قبل النشر أو إدراجها في برنامج فعلي.

## المصادر

- [ACE Exercise Library](https://www.acefitness.org/resources/everyone/exercise-library/)
- [NHS Strength Exercises](https://www.nhs.uk/live-well/exercise/strength-exercises/)
- [ACSM Resistance Training for Health](https://www.acsm.org/docs/default-source/files-for-resource-library/resistance-training-for-health.pdf)
