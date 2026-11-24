import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import { fetchPage, listAll } from './api';
import { makeAutoSlug, splitList } from './program';
import { VersionSelect } from './ProgramEditor';
import {
  ConfirmDialog,
  CustomSelect,
  ErrorNotice,
  Field,
  Notice,
  Status,
} from './ui';

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
      sourceTitle: content?.source?.title || 'Motion Fitness Library',
      sourceReference:
        content?.source?.reference || 'https://motion.app/library',
      sourceLicense:
        content?.source?.licenseNotes || 'Internal curated exercise guide',
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
  if (!form.title.trim()) throw new Error('يرجى إدخال الاسم / العنوان.');
  const autoSlug = form.slug?.trim() || makeAutoSlug(kind, form.title);
  const slug = creating ? { slug: autoSlug } : {};
  if (kind === 'meal-sections') {
    return {
      slug: autoSlug,
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
      !muscleGroups.length
    ) {
      throw new Error('يرجى إدخال الوصف وخطوات الأداء والمجموعات العضلية.');
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
          title: form.sourceTitle?.trim() || 'Motion Fitness Library',
          reference:
            form.sourceReference?.trim() || 'https://motion.app/library',
          licenseNotes:
            form.sourceLicense?.trim() || 'Internal curated exercise guide',
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

function dedupeOptions(list) {
  const map = new Map();
  for (const opt of list) {
    if (opt?.value && !map.has(opt.value)) map.set(opt.value, opt);
  }
  return [...map.values()];
}

const mapFoodOption = (f) => ({
  value: f.version_id,
  label: `${f.content?.title || f.slug} (v${f.version})`,
  status: f.status,
});

const mapIngredientOption = (i) => ({
  value: i.id,
  label: `${i.title} (${i.verification_status === 'VERIFIED' ? 'موثّق' : 'غير موثّق'})`,
});

const mapExchangeMemberOption = (m) => ({
  value: m.id,
  label: `${m.food_title} · ${m.group_title}`,
  status: m.status,
});

async function getOptions(api, kind, loadedItem) {
  if (kind === 'meal-sections' || kind === 'ingredients') {
    return {};
  }
  if (kind === 'food-sections') {
    const usedFoodIds = [
      ...new Set(
        (loadedItem?.versions?.[0]?.members || [])
          .map((m) => m.food_version_id)
          .filter(Boolean),
      ),
    ];
    const [recent, selected] = await Promise.all([
      fetchPage(api, '/admin/foods', {
        limit: 20,
        offset: 0,
        extra: { includeArchived: 'false' },
      }),
      usedFoodIds.length
        ? fetchPage(api, '/admin/foods', {
            limit: 100,
            offset: 0,
            extra: { ids: usedFoodIds.join(',') },
          })
        : Promise.resolve({ items: [] }),
    ]);
    return {
      foods: dedupeOptions([
        ...selected.items.map(mapFoodOption),
        ...recent.items.filter((f) => !f.archived).map(mapFoodOption),
      ]),
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
    const usedIngIds = [
      ...new Set(
        (loadedItem?.versions?.[0]?.content?.ingredients || [])
          .map((i) => i.ingredientId)
          .filter(Boolean),
      ),
    ];
    const [recent, selected] = await Promise.all([
      fetchPage(api, '/admin/ingredients', {
        limit: 20,
        offset: 0,
        extra: { includeArchived: 'false' },
      }),
      usedIngIds.length
        ? fetchPage(api, '/admin/ingredients', {
            limit: 100,
            offset: 0,
            extra: { ids: usedIngIds.join(',') },
          })
        : Promise.resolve({ items: [] }),
    ]);
    return {
      ingredients: dedupeOptions([
        ...selected.items.map(mapIngredientOption),
        ...recent.items.filter((i) => !i.archived).map(mapIngredientOption),
      ]),
    };
  }
  const usedSectionId = loadedItem?.versions?.[0]?.section_id;
  const usedMemberIds = [
    ...new Set(
      (loadedItem?.versions?.[0]?.items || [])
        .map((item) => item.default_exchange_member_id)
        .filter(Boolean),
    ),
  ];
  const [recentSections, selectedSections, recentMembers, selectedMembers] =
    await Promise.all([
      fetchPage(api, '/admin/meal-sections', {
        limit: 20,
        offset: 0,
        extra: { includeArchived: 'false' },
      }),
      usedSectionId
        ? fetchPage(api, '/admin/meal-sections', {
            limit: 5,
            offset: 0,
            extra: { ids: usedSectionId },
          })
        : Promise.resolve({ items: [] }),
      fetchPage(api, '/admin/food-exchange-members', {
        limit: 20,
        offset: 0,
      }),
      usedMemberIds.length
        ? fetchPage(api, '/admin/food-exchange-members', {
            limit: 100,
            offset: 0,
            extra: { ids: usedMemberIds.join(',') },
          })
        : Promise.resolve({ items: [] }),
    ]);
  const sectionMap = new Map();
  for (const s of [
    ...selectedSections.items,
    ...recentSections.items.filter((s) => !s.archived),
  ]) {
    if (!sectionMap.has(s.id)) sectionMap.set(s.id, s);
  }
  return {
    sections: [...sectionMap.values()],
    members: dedupeOptions([
      ...selectedMembers.items.map(mapExchangeMemberOption),
      ...recentMembers.items.map(mapExchangeMemberOption),
    ]),
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

  const searchFoods = useCallback(
    async (search) => {
      const res = await fetchPage(api, '/admin/foods', {
        limit: 20,
        offset: 0,
        search,
        extra: { includeArchived: 'false' },
      });
      const mapped = res.items.map(mapFoodOption);
      setOptions((prev) =>
        prev
          ? {
              ...prev,
              foods: dedupeOptions([...(prev.foods || []), ...mapped]),
            }
          : prev,
      );
      return mapped;
    },
    [api],
  );

  const searchIngredients = useCallback(
    async (search) => {
      const res = await fetchPage(api, '/admin/ingredients', {
        limit: 20,
        offset: 0,
        search,
        extra: { includeArchived: 'false' },
      });
      const mapped = res.items.map(mapIngredientOption);
      setOptions((prev) =>
        prev
          ? {
              ...prev,
              ingredients: dedupeOptions([
                ...(prev.ingredients || []),
                ...mapped,
              ]),
            }
          : prev,
      );
      return mapped;
    },
    [api],
  );

  const searchMealSections = useCallback(
    async (search) => {
      const res = await fetchPage(api, '/admin/meal-sections', {
        limit: 20,
        offset: 0,
        search,
        extra: { includeArchived: 'false' },
      });
      setOptions((prev) => {
        if (!prev) return prev;
        const map = new Map((prev.sections || []).map((s) => [s.id, s]));
        for (const s of res.items) {
          if (!map.has(s.id)) map.set(s.id, s);
        }
        return { ...prev, sections: [...map.values()] };
      });
      return res.items.map((s) => ({ value: s.id, label: s.title }));
    },
    [api],
  );

  const searchExchangeMembers = useCallback(
    async (search) => {
      const res = await fetchPage(api, '/admin/food-exchange-members', {
        limit: 20,
        offset: 0,
        search,
      });
      const mapped = res.items.map(mapExchangeMemberOption);
      setOptions((prev) =>
        prev
          ? {
              ...prev,
              members: dedupeOptions([...(prev.members || []), ...mapped]),
            }
          : prev,
      );
      return mapped;
    },
    [api],
  );

  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  useEffect(() => {
    let active = true;
    (id ? api(`${base}/${id}`) : Promise.resolve(null))
      .then(async (data) => {
        const available = await getOptions(api, kind, data);
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
    update({ [name]: value });
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
            <Field label="الاسم / العنوان" full>
              <input name="title" value={form.title} onChange={change} />
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
                searchIngredients={searchIngredients}
              />
            ) : kind === 'food-sections' ? (
              <FoodSectionFields
                form={form}
                update={update}
                options={options}
                searchFoods={searchFoods}
              />
            ) : kind === 'ingredients' ? (
              <IngredientFields form={form} change={change} update={update} />
            ) : kind === 'meal-sections' ? null : (
              <MealFields
                form={form}
                update={update}
                options={options}
                searchMealSections={searchMealSections}
                searchExchangeMembers={searchExchangeMembers}
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

function IngredientFields({ form, change, update }) {
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
        <CustomSelect
          value={form.verificationStatus}
          onChange={(verificationStatus) => update({ verificationStatus })}
          options={[
            { value: 'VERIFIED', label: 'موثّق (VERIFIED)' },
            { value: 'UNKNOWN', label: 'غير موثّق (UNKNOWN)' },
          ]}
        />
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

function FoodSectionFields({ form, update, options, searchFoods }) {
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
              loadOptions={searchFoods}
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
      <details className="advanced-box">
        <summary>إعدادات متقدمة للمصدر والوسائط (اختياري)</summary>
        <div className="advanced-box-grid">
          <Field label="اسم المصدر">
            <input
              name="sourceTitle"
              value={form.sourceTitle}
              onChange={change}
            />
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
            hint="اختر ملفاً جاهزاً من مكتبة الوسائط."
          >
            <VersionSelect
              value={form.mediaId}
              items={options.media}
              onChange={(mediaId) => update({ mediaId })}
            />
          </Field>
        </div>
      </details>
    </>
  );
}

function FoodFields({ form, change, update, options, searchIngredients }) {
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
        <CustomSelect
          value={form.preparationState}
          onChange={(preparationState) => update({ preparationState })}
          options={[
            { value: 'RAW', label: 'نيء (RAW)' },
            { value: 'COOKED', label: 'مطبوخ (COOKED)' },
            { value: 'READY_TO_EAT', label: 'جاهز للأكل (READY_TO_EAT)' },
          ]}
        />
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
      <details className="advanced-box">
        <summary>إعدادات متقدمة لمصدر البيانات الغذائية (اختياري)</summary>
        <div className="advanced-box-grid">
          <Field label="مصدر البيانات الغذائية">
            <input
              name="sourceTitle"
              value={form.sourceTitle}
              onChange={change}
            />
          </Field>
          <Field label="رابط المصدر">
            <input
              dir="ltr"
              name="sourceReference"
              value={form.sourceReference}
              onChange={change}
            />
          </Field>
          <Field label="الترخيص" full>
            <input
              name="sourceLicense"
              value={form.sourceLicense}
              onChange={change}
            />
          </Field>
        </div>
      </details>
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
                loadOptions={searchIngredients}
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

function MealFields({
  form,
  update,
  options,
  searchMealSections,
  searchExchangeMembers,
}) {
  function setItem(i, patch) {
    update({
      items: form.items.map((item, index) =>
        index === i ? { ...item, ...patch } : item,
      ),
    });
  }

  const sectionOptions = [
    ...(form.sectionId &&
    !options.sections.some(({ id }) => id === form.sectionId)
      ? [{ value: form.sectionId, label: 'قسم غير متاح' }]
      : []),
    ...options.sections.map((section) => ({
      value: section.id,
      label: section.title,
    })),
  ];

  return (
    <>
      <Field label="قسم الوجبة" full>
        <CustomSelect
          value={form.sectionId}
          onChange={(sectionId) => update({ sectionId })}
          placeholder="اختر قسم الوجبة…"
          options={sectionOptions}
          loadOptions={searchMealSections}
        />
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
                loadOptions={searchExchangeMembers}
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
