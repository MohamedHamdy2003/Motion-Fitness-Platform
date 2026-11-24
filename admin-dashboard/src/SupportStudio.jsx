import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, HelpCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  ButtonContent,
  ConfirmDialog,
  CustomSelect,
  ErrorNotice,
  Field,
  Notice,
  Status,
} from './ui';

const FAQ_CATEGORIES = [
  { code: 'PROGRAMS', label: 'البرامج والتدريب' },
  { code: 'WORKOUTS', label: 'التمارين والإصابات' },
  { code: 'NUTRITION', label: 'التغذية والوجبات' },
  { code: 'PROGRESS', label: 'المتابعة والتقدم' },
  { code: 'ACCOUNT', label: 'الحساب والاشتراك' },
  { code: 'GENERAL', label: 'أسئلة عامة' },
];

function categoryLabel(code) {
  const upper = String(code || '').toUpperCase();
  return FAQ_CATEGORIES.find((c) => c.code === upper)?.label || code;
}

function nextLegalVersion(items, type, locale) {
  let maxMajor = 1;
  let maxMinor = -1;
  for (const item of items) {
    if (item.type !== type || item.locale !== locale) continue;
    const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?$/.exec(
      String(item.version || '').trim(),
    );
    if (!match) continue;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    if (major > maxMajor || (major === maxMajor && minor > maxMinor)) {
      maxMajor = major;
      maxMinor = minor;
    }
  }
  return maxMinor < 0 ? '1.0.0' : `${maxMajor}.${maxMinor + 1}.0`;
}

function FaqEditDialog({ item, onClose, onSaved, api }) {
  const dialogRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    category: item.category || 'PROGRAMS',
    displayOrder: item.displayOrder ?? 0,
    active: Boolean(item.active),
    questionAr: item.questionAr || '',
    answerAr: item.answerAr || '',
    questionEn: item.questionEn || '',
    answerEn: item.answerEn || '',
  });

  useEffect(() => {
    const node = dialogRef.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/admin/faq/${item.id}`, {
        method: 'PATCH',
        body: {
          category: form.category,
          displayOrder: Number(form.displayOrder) || 0,
          active: form.active,
          questionAr: form.questionAr.trim(),
          answerAr: form.answerAr.trim(),
          questionEn: form.questionEn.trim(),
          answerEn: form.answerEn.trim(),
        },
      });
      await onSaved('تم حفظ تعديلات السؤال الشائع بنجاح.');
    } catch (reason) {
      setError(reason);
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="confirm modal-wide"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <h2>تعديل السؤال الشائع</h2>
          <p className="inline-help">
            عدّل نص السؤال والإجابة باللغتين العربية والإنجليزية في نفس السجل.
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="إغلاق نافذة التعديل"
          disabled={saving}
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>

      <ErrorNotice error={error} />

      <form onSubmit={handleSave} className="field-grid panel-spaced-sm">
        <Field label="التصنيف">
          <CustomSelect
            value={form.category}
            onChange={(value) => setForm({ ...form, category: value })}
            options={FAQ_CATEGORIES.map((cat) => ({
              value: cat.code,
              label: cat.label,
            }))}
          />
        </Field>
        <Field label="ترتيب العرض">
          <input
            type="number"
            min="0"
            value={form.displayOrder}
            onChange={(e) => setForm({ ...form, displayOrder: e.target.value })}
          />
        </Field>

        <Field label="السؤال (بالعربية)" full>
          <input
            value={form.questionAr}
            onChange={(e) => setForm({ ...form, questionAr: e.target.value })}
            required
          />
        </Field>
        <Field label="الإجابة (بالعربية)" full>
          <textarea
            rows="3"
            value={form.answerAr}
            onChange={(e) => setForm({ ...form, answerAr: e.target.value })}
            required
          />
        </Field>

        <Field label="السؤال (بالإنجليزية)" full>
          <input
            dir="ltr"
            value={form.questionEn}
            onChange={(e) => setForm({ ...form, questionEn: e.target.value })}
            required
          />
        </Field>
        <Field label="الإجابة (بالإنجليزية)" full>
          <textarea
            dir="ltr"
            rows="3"
            value={form.answerEn}
            onChange={(e) => setForm({ ...form, answerEn: e.target.value })}
            required
          />
        </Field>

        <div className="full actions">
          <button
            type="button"
            className="button secondary"
            disabled={saving}
            onClick={onClose}
          >
            إلغاء
          </button>
          <button type="submit" className="button primary" disabled={saving}>
            <ButtonContent busy={saving}>
              <span>حفظ التعديلات</span>
            </ButtonContent>
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function SupportStudio({ api }) {
  const [faqItems, setFaqItems] = useState([]);
  const [legalItems, setLegalItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [savingFaq, setSavingFaq] = useState(false);
  const [savingLegal, setSavingLegal] = useState(false);
  const [editingFaq, setEditingFaq] = useState(null);
  const [deletingFaq, setDeletingFaq] = useState(null);

  const [faqForm, setFaqForm] = useState({
    category: 'PROGRAMS',
    questionAr: '',
    answerAr: '',
    questionEn: '',
    answerEn: '',
    displayOrder: 1,
    active: true,
  });

  const [legalForm, setLegalForm] = useState({
    type: 'TERMS',
    locale: 'ar',
    title: 'الشروط والأحكام لتطبيق Motion',
    content: '',
    active: true,
  });

  const upcomingLegalVersion = useMemo(
    () => nextLegalVersion(legalItems, legalForm.type, legalForm.locale),
    [legalItems, legalForm.type, legalForm.locale],
  );

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [faqRes, legalRes] = await Promise.all([
        api('/admin/faq'),
        api('/admin/legal'),
      ]);
      const loadedFaqs = faqRes.items || [];
      setFaqItems(loadedFaqs);
      setLegalItems(legalRes.items || []);
      setFaqForm((prev) => ({
        ...prev,
        displayOrder: loadedFaqs.length + 1,
      }));
    } catch (reason) {
      setError(reason);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function createFaq(event) {
    event.preventDefault();
    setSavingFaq(true);
    setError(null);
    setNotice('');
    try {
      await api('/admin/faq', {
        method: 'POST',
        body: {
          category: faqForm.category,
          questionAr: faqForm.questionAr.trim(),
          answerAr: faqForm.answerAr.trim(),
          questionEn: faqForm.questionEn.trim(),
          answerEn: faqForm.answerEn.trim(),
          displayOrder: Number(faqForm.displayOrder) || 0,
          active: true,
        },
      });
      setFaqForm({
        category: 'PROGRAMS',
        questionAr: '',
        answerAr: '',
        questionEn: '',
        answerEn: '',
        displayOrder: faqItems.length + 2,
        active: true,
      });
      setNotice('تمت إضافة السؤال الشائع باللغتين بنجاح.');
      await loadAll();
    } catch (reason) {
      setError(reason);
    } finally {
      setSavingFaq(false);
    }
  }

  async function toggleFaqActive(item) {
    setError(null);
    setNotice('');
    try {
      await api(`/admin/faq/${item.id}`, {
        method: 'PATCH',
        body: { active: !item.active },
      });
      setNotice(
        item.active
          ? 'تم إيقاف عرض السؤال في التطبيق.'
          : 'تم تفعيل عرض السؤال في التطبيق.',
      );
      await loadAll();
    } catch (reason) {
      setError(reason);
    }
  }

  async function confirmRemoveFaq() {
    if (!deletingFaq) return;
    const target = deletingFaq;
    setDeletingFaq(null);
    setError(null);
    setNotice('');
    try {
      await api(`/admin/faq/${target.id}`, { method: 'DELETE' });
      setNotice('تم مسح السؤال الشائع بنجاح.');
      await loadAll();
    } catch (reason) {
      setError(reason);
    }
  }

  async function publishLegal(event) {
    event.preventDefault();
    setSavingLegal(true);
    setError(null);
    setNotice('');
    try {
      const created = await api('/admin/legal', {
        method: 'POST',
        body: {
          type: legalForm.type,
          locale: legalForm.locale,
          title: legalForm.title.trim(),
          content: legalForm.content.trim(),
          active: true,
        },
      });
      setLegalForm((prev) => ({ ...prev, content: '' }));
      setNotice(
        `تم نشر ${legalForm.type === 'TERMS' ? 'الشروط والأحكام' : 'سياسة الخصوصية'} تلقائياً كإصدار v${created.version}.`,
      );
      await loadAll();
    } catch (reason) {
      setError(reason);
    } finally {
      setSavingLegal(false);
    }
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>الأسئلة الشائعة والوثائق القانونية</h1>
          <p>
            إدارة الأسئلة الشائعة باللغتين العربية والإنجليزية في سجل واحد، ونشر
            تحديثات الشروط والأحكام وسياسة الخصوصية بترقيم تلقائي.
          </p>
        </div>
      </header>

      <ErrorNotice error={error} />
      <Notice text={notice} />

      <div className="field-grid">
        <section className="editor-panel">
          <div className="editor-body">
            <div className="section-heading">
              <div>
                <h2>
                  <HelpCircle size={18} className="heading-icon" />
                  إضافة سؤال شائع
                </h2>
                <p>
                  أدخل السؤال والإجابة بالعربية والإنجليزية معاً ليُخزنا تبع نفس
                  السؤال.
                </p>
              </div>
            </div>
            <form onSubmit={createFaq} className="field-grid">
              <Field label="التصنيف">
                <CustomSelect
                  value={faqForm.category}
                  onChange={(value) =>
                    setFaqForm({ ...faqForm, category: value })
                  }
                  options={FAQ_CATEGORIES.map((cat) => ({
                    value: cat.code,
                    label: cat.label,
                  }))}
                />
              </Field>
              <Field label="ترتيب العرض">
                <input
                  type="number"
                  min="0"
                  value={faqForm.displayOrder}
                  onChange={(e) =>
                    setFaqForm({ ...faqForm, displayOrder: e.target.value })
                  }
                />
              </Field>
              <Field label="السؤال (بالعربية)" full>
                <input
                  placeholder="مثال: كيف يتم اختيار برنامجي التدريبي؟"
                  value={faqForm.questionAr}
                  onChange={(e) =>
                    setFaqForm({ ...faqForm, questionAr: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="الإجابة (بالعربية)" full>
                <textarea
                  rows="3"
                  placeholder="اكتب الإجابة الواضحة للمستخدم بالعربية…"
                  value={faqForm.answerAr}
                  onChange={(e) =>
                    setFaqForm({ ...faqForm, answerAr: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="السؤال (بالإنجليزية)" full>
                <input
                  dir="ltr"
                  placeholder="e.g. How is my training program selected?"
                  value={faqForm.questionEn}
                  onChange={(e) =>
                    setFaqForm({ ...faqForm, questionEn: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="الإجابة (بالإنجليزية)" full>
                <textarea
                  dir="ltr"
                  rows="3"
                  placeholder="Write the clear English answer..."
                  value={faqForm.answerEn}
                  onChange={(e) =>
                    setFaqForm({ ...faqForm, answerEn: e.target.value })
                  }
                  required
                />
              </Field>
              <div className="full">
                <button
                  className="button primary"
                  type="submit"
                  disabled={savingFaq}
                >
                  <ButtonContent busy={savingFaq}>
                    <Plus size={17} aria-hidden="true" />
                    <span>إضافة السؤال</span>
                  </ButtonContent>
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="editor-panel">
          <div className="editor-body">
            <div className="section-heading">
              <div>
                <h2>
                  <FileText size={18} className="heading-icon" />
                  نشر تحديث وثيقة قانونية
                </h2>
                <p>
                  يتم توليد رقم الإصدار تلقائياً وأرشفة النسخة السابقة عند
                  النشر.
                </p>
              </div>
              <span className="version" dir="ltr">
                الإصدار التالي: v{upcomingLegalVersion}
              </span>
            </div>
            <form onSubmit={publishLegal} className="field-grid">
              <Field label="نوع الوثيقة">
                <CustomSelect
                  value={legalForm.type}
                  onChange={(nextType) => {
                    setLegalForm({
                      ...legalForm,
                      type: nextType,
                      title:
                        legalForm.locale === 'ar'
                          ? nextType === 'TERMS'
                            ? 'الشروط والأحكام لتطبيق Motion'
                            : 'سياسة الخصوصية لتطبيق Motion'
                          : nextType === 'TERMS'
                            ? 'Motion Terms & Conditions'
                            : 'Motion Privacy Policy',
                    });
                  }}
                  options={[
                    { value: 'TERMS', label: 'الشروط والأحكام' },
                    { value: 'PRIVACY', label: 'سياسة الخصوصية' },
                  ]}
                />
              </Field>
              <Field label="اللغة">
                <CustomSelect
                  value={legalForm.locale}
                  onChange={(nextLocale) => {
                    setLegalForm({
                      ...legalForm,
                      locale: nextLocale,
                      title:
                        nextLocale === 'ar'
                          ? legalForm.type === 'TERMS'
                            ? 'الشروط والأحكام لتطبيق Motion'
                            : 'سياسة الخصوصية لتطبيق Motion'
                          : legalForm.type === 'TERMS'
                            ? 'Motion Terms & Conditions'
                            : 'Motion Privacy Policy',
                    });
                  }}
                  options={[
                    { value: 'ar', label: 'العربية' },
                    { value: 'en', label: 'الإنجليزية' },
                  ]}
                />
              </Field>
              <Field label="عنوان الوثيقة" full>
                <input
                  dir={legalForm.locale === 'en' ? 'ltr' : 'rtl'}
                  value={legalForm.title}
                  onChange={(e) =>
                    setLegalForm({ ...legalForm, title: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="نص الوثيقة" full>
                <textarea
                  dir={legalForm.locale === 'en' ? 'ltr' : 'rtl'}
                  rows="7"
                  value={legalForm.content}
                  onChange={(e) =>
                    setLegalForm({ ...legalForm, content: e.target.value })
                  }
                  required
                />
              </Field>
              <div className="full">
                <button
                  className="button primary"
                  type="submit"
                  disabled={savingLegal}
                >
                  <ButtonContent busy={savingLegal}>
                    <Plus size={17} aria-hidden="true" />
                    <span>نشر الإصدار الجديد (v{upcomingLegalVersion})</span>
                  </ButtonContent>
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>

      <section className="editor-panel panel-spaced">
        <div className="editor-body">
          <div className="section-heading">
            <div>
              <h2>سجل الأسئلة الشائعة ({faqItems.length})</h2>
              <p>جميع الأسئلة الشائعة بنصيها العربي والإنجليزي.</p>
            </div>
          </div>
          {loading ? (
            <div className="loading-list">
              <span className="spinner" /> جارٍ تحميل الأسئلة…
            </div>
          ) : faqItems.length === 0 ? (
            <p className="inline-help">لا توجد أسئلة شائعة مضافة بعد.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>السؤال (عربي / إنجليزي)</th>
                    <th>التصنيف</th>
                    <th>الحالة</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {faqItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.questionAr}</strong>
                        <div className="muted-meta" dir="ltr">
                          {item.questionEn}
                        </div>
                      </td>
                      <td>{categoryLabel(item.category)}</td>
                      <td>
                        <button
                          type="button"
                          className="status-toggle"
                          title="تبديل حالة العرض"
                          onClick={() => toggleFaqActive(item)}
                        >
                          <Status
                            value={item.active ? 'PUBLISHED' : 'DRAFT'}
                            customLabel={item.active ? 'نشط' : 'موقوف'}
                          />
                        </button>
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            type="button"
                            className="button secondary compact"
                            onClick={() => setEditingFaq(item)}
                          >
                            <Pencil size={14} aria-hidden="true" />
                            تعديل
                          </button>
                          <button
                            type="button"
                            className="button danger compact"
                            onClick={() => setDeletingFaq(item)}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                            مسح
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="editor-panel panel-spaced">
        <div className="editor-body">
          <div className="section-heading">
            <div>
              <h2>إصدارات الوثائق القانونية ({legalItems.length})</h2>
              <p>سجل إصدارات الشروط والأحكام وسياسة الخصوصية.</p>
            </div>
          </div>
          {!loading && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>العنوان</th>
                    <th>النوع</th>
                    <th>الإصدار</th>
                    <th>اللغة</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {legalItems.map((doc) => (
                    <tr key={doc.id}>
                      <td>
                        <strong>{doc.title}</strong>
                      </td>
                      <td>
                        {doc.type === 'TERMS'
                          ? 'الشروط والأحكام'
                          : 'سياسة الخصوصية'}
                      </td>
                      <td dir="ltr">v{doc.version}</td>
                      <td>{doc.locale === 'ar' ? 'العربية' : 'الإنجليزية'}</td>
                      <td>
                        <Status
                          value={doc.active ? 'PUBLISHED' : 'ARCHIVED'}
                          customLabel={doc.active ? 'نشط' : 'أرشيف'}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {editingFaq && (
        <FaqEditDialog
          item={editingFaq}
          api={api}
          onClose={() => setEditingFaq(null)}
          onSaved={async (msg) => {
            setEditingFaq(null);
            setNotice(msg);
            await loadAll();
          }}
        />
      )}

      {deletingFaq && (
        <ConfirmDialog
          title="مسح السؤال الشائع؟"
          action="تأكيد المسح"
          destructive
          onCancel={() => setDeletingFaq(null)}
          onConfirm={confirmRemoveFaq}
        >
          <p>
            سيتم حذف السؤال «{deletingFaq.questionAr}» نهائياً باللغتين العربية
            والإنجليزية من تطبيق الموبايل.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
