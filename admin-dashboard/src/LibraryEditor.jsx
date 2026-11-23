import { useEffect, useState } from 'react';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import { listAll } from './api';
import { slugify, splitList } from './program';
import { VersionSelect } from './ProgramEditor';
import { ConfirmDialog, ErrorNotice, Field, Notice, Status } from './ui';

const emptyMealItem = () => ({ memberId: '', exchangeUnits: 1 });
const emptyFoodIngredient = () => ({ ingredientId: '', quantityG: 100 });
const emptySectionMember = () => ({
  foodVersionId: '',
  portionGPerUnit: 100,
  displayPortion: '100 g',
});
const toLines = (text) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

function contentForm(kind, item) {
  if (kind === 'meal-sections') {
    return {
      slug: item?.slug || '',
      title: item?.title || '',
    };
  }
  if (kind === 'ingredients') {
    return {
      slug: item?.slug || '',
      title: item?.title || '',
      description: item?.description || '',
      dietaryTags: (item?.dietary_tags || []).join(', '),
      allergenCodes: (item?.allergen_codes || []).join(', '),
      verificationStatus: item?.verification_status || 'VERIFIED',
    };
  }
  const version = item?.versions?.[0];
  if (kind === 'food-sections') {
    return {
      slug: item?.slug || '',
      title: version?.title || '',
      members: version?.members?.map((m) => ({
        foodVersionId: m.food_version_id,
        portionGPerUnit: Number(m.portion_g_per_unit),
        displayPortion: m.display_portion || '100 g',
      })) || [emptySectionMember(), emptySectionMember()],
    };
  }
  if (kind === 'exercises') {
    const content = version?.content;
    return {
      slug: item?.slug || '',
      title: content?.title || '',
      description: content?.description || '',
      instructions: content?.instructions.join('\n') || '',
      muscleGroups: content?.muscleGroups.join(', ') || '',
      equipment: content?.equipment.join(', ') || '',
      sourceTitle: content?.source.title || '',
      sourceReference: content?.source.reference || '',
      sourceLicense: content?.source.licenseNotes || '',
      mediaId: content?.mediaId || '',
    };
  }
  if (kind === 'foods') {
    const content = version?.content;
    return {
      slug: item?.slug || '',
      title: content?.title || '',
      description: content?.description || '',
      preparation: content?.preparation || '',
      preparationState: content?.preparationState || 'COOKED',
      prepMinutes: content?.prepMinutes ?? 0,
      energyKcal100g: content?.energyKcal100g ?? 100,
      proteinG100g: content?.proteinG100g ?? 10,
      carbohydrateG100g: content?.carbohydrateG100g ?? 10,
      fatG100g: content?.fatG100g ?? 2,
      fiberG100g: content?.fiberG100g ?? 1,
      sourceTitle: content?.nutrientSource?.title || 'USDA FoodData Central',
      sourceReference:
        content?.nutrientSource?.reference || 'https://fdc.nal.usda.gov/',
      sourceLicense:
        content?.nutrientSource?.licenseNotes || 'Public domain CC0 1.0',
      mediaId: content?.mediaId || '',
      ingredients: content?.ingredients?.map((i) => ({
        ingredientId: i.ingredientId,
        quantityG: Number(i.quantityG),
      })) || [emptyFoodIngredient()],
    };
  }
  return {
    slug: item?.slug || '',
    title: version?.title || '',
    sectionId: version?.section_id || '',
    items: version?.items.map((mealItem) => ({
      memberId: mealItem.default_exchange_member_id,
      exchangeUnits: Number(mealItem.exchange_units),
    })) || [emptyMealItem()],
  };
}

function payload(kind, form, creating) {
  if (!form.title.trim() || !form.slug)
    throw new Error('يرجى إدخال الاسم والمعرّف النصي (Slug).');
  if (creating && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim())) {
    throw new Error(
      'يجب أن يتكون المعرّف النصي (Slug) من أحرف إنجليزية صغيرة وأرقام وشرطات مفردة فقط.',
    );
  }
  const slug = creating ? { slug: form.slug.trim() } : {};
  if (kind === 'meal-sections') {
    return {
      slug: form.slug.trim(),
      title: form.title.trim(),
    };
  }
  if (kind === 'ingredients') {
    return {
      ...slug,
      content: {
        title: form.title.trim(),
        description: form.description?.trim() ? form.description.trim() : null,
        dietaryTags: splitList(form.dietaryTags),
        allergenCodes: splitList(form.allergenCodes).map((c) =>
          c.toUpperCase(),
        ),
        verificationStatus: form.verificationStatus,
      },
    };
  }
  if (kind === 'food-sections') {
    if (
      !form.members.length ||
      form.members.some(
        (m) =>
          !m.foodVersionId ||
          Number(m.portionGPerUnit) <= 0 ||
          !m.displayPortion.trim(),
      )
    ) {
      throw new Error(
        'اختر الطعام وكمية الجرامات لكل وحدة والوصف الظاهر لكل بديل.',
      );
    }
    return {
      ...slug,
      title: form.title.trim(),
      members: form.members.map((m) => ({
        foodVersionId: m.foodVersionId,
        portionGPerUnit: Number(m.portionGPerUnit),
        displayPortion: m.displayPortion.trim(),
      })),
    };
  }
  if (kind === 'exercises') {
    const instructions = toLines(form.instructions);
    const muscleGroups = splitList(form.muscleGroups);
    if (
      !form.description.trim() ||
      !instructions.length ||
      !muscleGroups.length ||
      !form.sourceTitle.trim() ||
      !form.sourceReference.trim() ||
      !form.sourceLicense.trim()
    ) {
      throw new Error(
        'يرجى إدخال الوصف والتعليمات والمجموعات العضلية وبيانات المصدر.',
      );
    }
    return {
      ...slug,
      content: {
        title: form.title,
        description: form.description,
        instructions,
        muscleGroups,
        equipment: splitList(form.equipment),
        source: {
          title: form.sourceTitle,
          reference: form.sourceReference,
          licenseNotes: form.sourceLicense,
        },
        mediaId: form.mediaId || null,
      },
    };
  }
  if (kind === 'foods') {
    if (
      !form.preparation.trim() ||
      !form.ingredients.length ||
      form.ingredients.some((i) => !i.ingredientId || i.quantityG <= 0)
    ) {
      throw new Error(
        'يرجى إدخال طريقة التحضير ومكوّن واحد صالح على الأقل مع الكمية.',
      );
    }
    const numOrNull = (val) =>
      val === '' || val === null || val === undefined ? null : Number(val);
    return {
      ...slug,
      content: {
        title: form.title,
        ...(form.description?.trim()
          ? { description: form.description.trim() }
          : {}),
        preparation: form.preparation,
        preparationState: form.preparationState,
        prepMinutes: Number(form.prepMinutes) || 0,
        energyKcal100g: numOrNull(form.energyKcal100g),
        proteinG100g: numOrNull(form.proteinG100g),
        carbohydrateG100g: numOrNull(form.carbohydrateG100g),
        fatG100g: numOrNull(form.fatG100g),
        fiberG100g: numOrNull(form.fiberG100g),
        nutrientSource: {
          title: form.sourceTitle,
          reference: form.sourceReference,
          licenseNotes: form.sourceLicense,
        },
        mediaId: form.mediaId || null,
        ingredients: form.ingredients.map((i) => ({
          ingredientId: i.ingredientId,
          quantityG: Number(i.quantityG),
        })),
      },
    };
  }
  if (
    !form.sectionId ||
    !form.items.length ||
    form.items.some((item) => !item.memberId || item.exchangeUnits <= 0)
  ) {
    throw new Error('اختر قسم الوجبة وأضف طعاماً وكمية لكل عنصر.');
  }
  return {
    ...slug,
    title: form.title,
    sectionId: form.sectionId,
    items: form.items.map((item, position) => ({ ...item, position })),
  };
}

async function getOptions(api, kind) {
  if (kind === 'meal-sections' || kind === 'ingredients') {
    return {};
  }
  if (kind === 'food-sections') {
    const foods = await listAll(api, '/admin/foods');
    return {
      foods: foods
        .filter((f) => !f.archived)
        .map((f) => ({
          value: f.version_id,
          label: `${f.content?.title || f.slug} (v${f.version})`,
          status: f.status,
        })),
    };
  }
  if (kind === 'exercises') {
    const files = await listAll(api, '/admin/media');
    return {
      media: files
        .filter((file) => !file.library_archived && file.status === 'READY')
        .map((file) => ({
          value: file.id,
          label: `${file.mime === 'video/mp4' ? 'فيديو' : 'صورة'} · ${file.id.slice(0, 8)}`,
        })),
    };
  }
  if (kind === 'foods') {
    const ingredients = await listAll(api, '/admin/ingredients');
    return {
      ingredients: ingredients
        .filter((i) => !i.archived)
        .map((i) => ({
          value: i.id,
          label: `${i.title} (${i.verification_status === 'VERIFIED' ? 'موثّق' : 'غير موثّق'})`,
        })),
    };
  }
  const [sections, groups] = await Promise.all([
    listAll(api, '/admin/meal-sections'),
    listAll(api, '/admin/food-sections'),
  ]);
  const details = await Promise.all(
    groups
      .filter((group) => !group.archived)
      .map(async (group) => api(`/admin/food-sections/${group.id}`)),
  );
  return {
    sections: sections.filter((section) => !section.archived),
    members: details.flatMap((group) => {
      const version =
        group.versions.find((entry) => entry.status === 'PUBLISHED') ||
        group.versions[0];
      return version.members.map((member) => ({
        value: member.id,
        label: `${member.food_title} · ${version.title}`,
        status:
          member.food_status === 'PUBLISHED'
            ? version.status
            : member.food_status,
      }));
    }),
  };
}

export function LibraryEditor({ section, id, api, onBack, onDirty }) {
  const { key: kind, label, singular } = section;
  const base = `/admin/${kind}`;
  const isUnversioned = kind === 'meal-sections' || kind === 'ingredients';
  const [item, setItem] = useState(null);
  const [form, setForm] = useState(() => contentForm(kind, null));
  const [initial, setInitial] = useState('');
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [verify, setVerify] = useState(null);
  const [reload, setReload] = useState(0);
  const dirty = Boolean(options && JSON.stringify(form) !== initial);
  const version = item?.versions?.[0];

  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  useEffect(() => {
    let active = true;
    Promise.all([id ? api(`${base}/${id}`) : null, getOptions(api, kind)])
      .then(([data, available]) => {
        if (!active) return;
        const next = contentForm(kind, data);
        setItem(data);
        setForm(next);
        setOptions(available);
        setInitial(JSON.stringify(next));
      })
      .catch((reason) => {
        if (active) setLoadError(reason);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, base, kind, api, reload]);

  function update(changes) {
    setForm((previous) => ({ ...previous, ...changes }));
    setError(null);
    setSuccess('');
  }

  function change(event) {
    const { name, value } = event.target;
    update({
      [name]: value,
      ...(name === 'title' &&
      !item &&
      (!form.slug || form.slug === slugify(form.title))
        ? { slug: slugify(value) }
        : {}),
    });
  }

  async function perform(action) {
    setError(null);
    setSuccess('');
    setVerify(null);
    setSaving(true);
    try {
      if (action === 'archive') {
        await api(`${base}/${item.id}`, { method: 'DELETE' });
        onDirty(false);
        onBack(`تمت أرشفة ${singular}.`);
        return;
      }
      let itemId = item?.id;
      if (action === 'publish')
        await api(`${base}/${itemId}/publish`, { method: 'POST', body: {} });
      else {
        const body = payload(kind, form, !itemId);
        const result = await api(itemId ? `${base}/${itemId}` : base, {
          method: itemId ? 'PATCH' : 'POST',
          body,
        });
        itemId ||=
          kind === 'exercises'
            ? result.exercise_id
            : kind === 'foods'
              ? result.food_id
              : result.group_id || result.id;
      }
      const result = await api(`${base}/${itemId}`);
      const next = contentForm(kind, result);
      setItem(result);
      setForm(next);
      setInitial(JSON.stringify(next));
      setSuccess(
        action === 'publish'
          ? `تم نشر ${singular} بنجاح.`
          : isUnversioned
            ? `تم حفظ ${singular}.`
            : 'تم حفظ المسودة.',
      );
    } catch (reason) {
      setError(reason);
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="loading-list" role="status">
        <span className="spinner" /> جارٍ فتح المحرر…
      </div>
    );
  if (loadError)
    return (
      <ErrorNotice
        error={loadError}
        onRetry={() => {
          setLoadError(null);
          setLoading(true);
          setReload(reload + 1);
        }}
      />
    );

  return (
    <>
      <button type="button" className="back-link" onClick={() => onBack()}>
        <ArrowRight size={17} /> العودة إلى {label}
      </button>
      <header className="page-heading editor-heading">
        <div>
          <h1>{item ? form.title : `إضافة ${singular} جديد`}</h1>
          {item && (
            <p className="editor-meta-line">
              <Status
                value={
                  item.archived
                    ? 'ARCHIVED'
                    : isUnversioned
                      ? 'PUBLISHED'
                      : version?.status
                }
              />
              {!isUnversioned && version && (
                <span className="version">الإصدار {version.version}</span>
              )}
            </p>
          )}
        </div>
        <div className="actions">
          {item && !item.archived && (
            <button
              type="button"
              className="button secondary"
              disabled={saving}
              onClick={() => setVerify('archive')}
            >
              أرشفة
            </button>
          )}
          {!item?.archived && (
            <button
              type="button"
              className={`button ${version?.status === 'DRAFT' && !dirty ? 'secondary' : 'primary'}`}
              disabled={saving || Boolean(item && !dirty)}
              onClick={() => perform('save')}
            >
              {saving ? 'جارٍ الحفظ…' : isUnversioned ? 'حفظ' : 'حفظ المسودة'}
            </button>
          )}
          {!isUnversioned && version?.status === 'DRAFT' && !item.archived && (
            <button
              type="button"
              className="button primary"
              disabled={saving || dirty}
              onClick={() => setVerify('publish')}
            >
              نشر
            </button>
          )}
        </div>
      </header>
      <ErrorNotice error={error} />
      <Notice text={success} />
      {!isUnversioned && version?.status === 'PUBLISHED' && !item.archived && (
        <p className="inline-help">
          حفظ أي تعديل ينشئ مسودة إصدار جديد مع الإبقاء على الإصدار المنشور
          الحالي.
        </p>
      )}
      {!isUnversioned && dirty && version?.status === 'DRAFT' && (
        <p className="inline-help">احفظ التعديلات أولاً قبل النشر.</p>
      )}
      <section className="editor-panel">
        <fieldset className="unframed" disabled={saving || item?.archived}>
          <div className="editor-body field-grid">
            <Field label="الاسم / العنوان">
              <input name="title" value={form.title} onChange={change} />
            </Field>
            <Field
              label="المعرّف النصي (Slug)"
              hint="أحرف إنجليزية صغيرة وأرقام وشرطات فقط."
            >
              <input
                dir="ltr"
                name="slug"
                maxLength="120"
                value={form.slug}
                onChange={change}
                readOnly={Boolean(item && kind !== 'meal-sections')}
              />
            </Field>
            {kind === 'exercises' ? (
              <ExerciseFields
                form={form}
                change={change}
                update={update}
                options={options}
              />
            ) : kind === 'foods' ? (
              <FoodFields
                form={form}
                change={change}
                update={update}
                options={options}
              />
            ) : kind === 'food-sections' ? (
              <FoodSectionFields
                form={form}
                update={update}
                options={options}
              />
            ) : kind === 'ingredients' ? (
              <IngredientFields form={form} change={change} />
            ) : kind === 'meal-sections' ? null : (
              <MealFields
                form={form}
                change={change}
                update={update}
                options={options}
              />
            )}
          </div>
        </fieldset>
      </section>
      {verify && (
        <ConfirmDialog
          title={
            verify === 'archive'
              ? `أرشفة هذا الـ ${singular}؟`
              : `نشر هذا الـ ${singular}؟`
          }
          action={verify === 'archive' ? 'تأكيد الأرشفة' : 'تأكيد النشر'}
          destructive={verify === 'archive'}
          onCancel={() => setVerify(null)}
          onConfirm={() => perform(verify)}
        >
          {verify === 'archive'
            ? 'سيُزال هذا العنصر من المحتوى المتاح للاستخدام الجديد مع الاحتفاظ بنسخه السابقة.'
            : 'سيصبح هذا الإصدار متاحاً للاستخدام داخل البرامج والوجبات بعد التحقق من بياناته.'}
        </ConfirmDialog>
      )}
    </>
  );
}

function IngredientFields({ form, change }) {
  return (
    <>
      <Field label="الوصف" full>
        <textarea
          name="description"
          rows="2"
          value={form.description}
          onChange={change}
        />
      </Field>
      <Field label="حالة التوثيق">
        <select
          name="verificationStatus"
          value={form.verificationStatus}
          onChange={change}
        >
          <option value="VERIFIED">موثّق (VERIFIED)</option>
          <option value="UNKNOWN">غير موثّق (UNKNOWN)</option>
        </select>
      </Field>
      <Field
        label="رموز مسببات الحساسية"
        hint="افصل بينها بفاصلة (مثل: MILK, EGG, WHEAT, PEANUT, FISH)."
      >
        <input
          dir="ltr"
          name="allergenCodes"
          value={form.allergenCodes}
          onChange={change}
        />
      </Field>
      <Field
        label="الوسوم الغذائية"
        hint="وسوم اختيارية مفصولة بفاصلة (مثل: high_protein, dairy)."
        full
      >
        <input
          dir="ltr"
          name="dietaryTags"
          value={form.dietaryTags}
          onChange={change}
        />
      </Field>
    </>
  );
}

function FoodSectionFields({ form, update, options }) {
  function setMember(i, patch) {
    update({
      members: form.members.map((member, idx) =>
        idx === i ? { ...member, ...patch } : member,
      ),
    });
  }
  return (
    <div className="full schedule-section">
      <div className="section-heading">
        <div>
          <h2>بدائل التبادل الغذائي</h2>
          <p>
            أضف طعامين منشورين على الأقل ليتمكن المتدرب من التبديل بينهما مع
            الحفاظ على السعرات والماكروز.
          </p>
        </div>
      </div>
      {form.members.map((member, i) => (
        <div className="inline-fields meal-row" key={i}>
          <Field label="إصدار الطعام">
            <VersionSelect
              value={member.foodVersionId}
              items={options.foods}
              onChange={(foodVersionId) => setMember(i, { foodVersionId })}
            />
          </Field>
          <Field label="جرام لكل وحدة">
            <input
              type="number"
              min="1"
              step="any"
              value={member.portionGPerUnit}
              onChange={(e) =>
                setMember(i, { portionGPerUnit: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="وصف الحصة الظاهر">
            <input
              value={member.displayPortion}
              onChange={(e) => setMember(i, { displayPortion: e.target.value })}
            />
          </Field>
          <button
            className="icon-button"
            type="button"
            aria-label="إزالة البديل"
            title="إزالة البديل"
            onClick={() =>
              update({
                members: form.members.filter((_, idx) => idx !== i),
              })
            }
          >
            <Trash2 size={17} />
          </button>
        </div>
      ))}
      <button
        className="button secondary compact"
        type="button"
        onClick={() =>
          update({ members: [...form.members, emptySectionMember()] })
        }
      >
        <Plus size={16} /> إضافة بديل
      </button>
    </div>
  );
}

function ExerciseFields({ form, change, update, options }) {
  return (
    <>
      <Field label="الوصف" full>
        <textarea
          name="description"
          rows="3"
          value={form.description}
          onChange={change}
        />
      </Field>
      <Field label="خطوات الأداء" hint="اكتب كل خطوة في سطر مستقل." full>
        <textarea
          name="instructions"
          rows="4"
          value={form.instructions}
          onChange={change}
        />
      </Field>
      <Field label="المجموعات العضلية" hint="افصل بينها بفاصلة.">
        <input
          name="muscleGroups"
          value={form.muscleGroups}
          onChange={change}
        />
      </Field>
      <Field label="الأدوات المطلوبة">
        <input name="equipment" value={form.equipment} onChange={change} />
      </Field>
      <Field label="اسم المصدر">
        <input name="sourceTitle" value={form.sourceTitle} onChange={change} />
      </Field>
      <Field label="رابط / مرجع المصدر">
        <input
          dir="ltr"
          name="sourceReference"
          value={form.sourceReference}
          onChange={change}
        />
      </Field>
      <Field label="ملاحظات الترخيص">
        <input
          name="sourceLicense"
          value={form.sourceLicense}
          onChange={change}
        />
      </Field>
      <Field
        label="وسائط التمرين (فيديو / صورة)"
        hint="اختياري — اختر ملفاً جاهزاً من مكتبة الوسائط."
      >
        <VersionSelect
          value={form.mediaId}
          items={options.media}
          onChange={(mediaId) => update({ mediaId })}
        />
      </Field>
    </>
  );
}

function FoodFields({ form, change, update, options }) {
  function setIngredient(i, patch) {
    update({
      ingredients: form.ingredients.map((item, idx) =>
        idx === i ? { ...item, ...patch } : item,
      ),
    });
  }
  return (
    <>
      <Field label="طريقة التحضير" full>
        <textarea
          name="preparation"
          rows="2"
          value={form.preparation}
          onChange={change}
        />
      </Field>
      <Field label="حالة التحضير">
        <select
          name="preparationState"
          value={form.preparationState}
          onChange={change}
        >
          <option value="RAW">نيء (RAW)</option>
          <option value="COOKED">مطبوخ (COOKED)</option>
          <option value="READY_TO_EAT">جاهز للأكل (READY_TO_EAT)</option>
        </select>
      </Field>
      <Field label="زمن التحضير (بالدقائق)">
        <input
          type="number"
          min="0"
          max="10080"
          name="prepMinutes"
          value={form.prepMinutes}
          onChange={change}
        />
      </Field>
      <Field label="السعرات الحرارية (لكل 100 جم)">
        <input
          type="number"
          min="0"
          step="any"
          name="energyKcal100g"
          value={form.energyKcal100g ?? ''}
          onChange={change}
        />
      </Field>
      <Field label="البروتين (جم / 100 جم)">
        <input
          type="number"
          min="0"
          step="any"
          name="proteinG100g"
          value={form.proteinG100g ?? ''}
          onChange={change}
        />
      </Field>
      <Field label="الكربوهيدرات (جم / 100 جم)">
        <input
          type="number"
          min="0"
          step="any"
          name="carbohydrateG100g"
          value={form.carbohydrateG100g ?? ''}
          onChange={change}
        />
      </Field>
      <Field label="الدهون (جم / 100 جم)">
        <input
          type="number"
          min="0"
          step="any"
          name="fatG100g"
          value={form.fatG100g ?? ''}
          onChange={change}
        />
      </Field>
      <Field label="الألياف (جم / 100 جم)">
        <input
          type="number"
          min="0"
          step="any"
          name="fiberG100g"
          value={form.fiberG100g ?? ''}
          onChange={change}
        />
      </Field>
      <Field label="مصدر البيانات الغذائية">
        <input name="sourceTitle" value={form.sourceTitle} onChange={change} />
      </Field>
      <Field label="رابط المصدر">
        <input
          dir="ltr"
          name="sourceReference"
          value={form.sourceReference}
          onChange={change}
        />
      </Field>
      <Field label="الترخيص">
        <input
          name="sourceLicense"
          value={form.sourceLicense}
          onChange={change}
        />
      </Field>
      <div className="full schedule-section">
        <div className="section-heading">
          <div>
            <h2>المكونات المرتبطة</h2>
            <p>
              اربط الطعام بالمكونات الموثقة لتفعيل فحص الحساسية والأطعمة غير
              المفضلة تلقائياً.
            </p>
          </div>
        </div>
        {form.ingredients.map((item, i) => (
          <div className="inline-fields meal-item-row" key={i}>
            <Field label="المكوّن">
              <VersionSelect
                value={item.ingredientId}
                items={options.ingredients}
                onChange={(ingredientId) => setIngredient(i, { ingredientId })}
              />
            </Field>
            <Field label="الكمية (جم)">
              <input
                type="number"
                min="0.1"
                step="any"
                value={item.quantityG}
                onChange={(e) =>
                  setIngredient(i, { quantityG: Number(e.target.value) })
                }
              />
            </Field>
            <button
              className="icon-button"
              type="button"
              aria-label="إزالة المكوّن"
              title="إزالة المكوّن"
              onClick={() =>
                update({
                  ingredients: form.ingredients.filter((_, idx) => idx !== i),
                })
              }
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
        <button
          className="button secondary compact"
          type="button"
          onClick={() =>
            update({
              ingredients: [...form.ingredients, emptyFoodIngredient()],
            })
          }
        >
          <Plus size={16} /> إضافة مكوّن
        </button>
      </div>
    </>
  );
}

function MealFields({ form, change, update, options }) {
  function setItem(i, patch) {
    update({
      items: form.items.map((item, index) =>
        index === i ? { ...item, ...patch } : item,
      ),
    });
  }

  return (
    <>
      <Field label="قسم الوجبة" full>
        <select name="sectionId" value={form.sectionId} onChange={change}>
          <option value="">اختر قسم الوجبة</option>
          {form.sectionId &&
            !options.sections.some(({ id }) => id === form.sectionId) && (
              <option value={form.sectionId}>قسم غير متاح</option>
            )}
          {options.sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.title}
            </option>
          ))}
        </select>
      </Field>
      <div className="full schedule-section">
        <div className="section-heading">
          <div>
            <h2>عناصر الوجبة</h2>
            <p>اختر الأطعمة من أقسام التبادل الغذائي وحدد عدد وحدات الحصة.</p>
          </div>
        </div>
        {form.items.map((item, i) => (
          <div className="inline-fields meal-item-row" key={i}>
            <Field label="الطعام">
              <VersionSelect
                value={item.memberId}
                items={options.members}
                onChange={(memberId) => setItem(i, { memberId })}
              />
            </Field>
            <Field label="وحدات التبادل">
              <input
                type="number"
                min="0.01"
                max="10000"
                step="any"
                value={item.exchangeUnits}
                onChange={(event) =>
                  setItem(i, { exchangeUnits: Number(event.target.value) })
                }
              />
            </Field>
            <button
              className="icon-button"
              type="button"
              aria-label="إزالة العنصر"
              title="إزالة العنصر"
              onClick={() =>
                update({ items: form.items.filter((_, index) => index !== i) })
              }
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
        <button
          className="button secondary compact"
          type="button"
          disabled={form.items.length >= 100}
          onClick={() => update({ items: [...form.items, emptyMealItem()] })}
        >
          <Plus size={16} /> إضافة عنصر غذائي
        </button>
      </div>
    </>
  );
}
