import { useEffect, useState } from 'react';
import { FileText, HelpCircle, Plus, Trash2 } from 'lucide-react';
import { slugify } from './program';
import { ErrorNotice, Field, Notice, Status } from './ui';

export function SupportStudio({ api }) {
  const [faqItems, setFaqItems] = useState([]);
  const [legalItems, setLegalItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [savingFaq, setSavingFaq] = useState(false);
  const [savingLegal, setSavingLegal] = useState(false);

  const [faqForm, setFaqForm] = useState({
    slug: '',
    category: 'PROGRAMS',
    locale: 'ar',
    question: '',
    answer: '',
    displayOrder: 1,
    active: true,
  });

  const [legalForm, setLegalForm] = useState({
    type: 'TERMS',
    version: '1.1.0',
    locale: 'ar',
    title: 'الشروط والأحكام لتطبيق Motion',
    content: '',
    active: true,
  });

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [faqRes, legalRes] = await Promise.all([
        api('/admin/faq'),
        api('/admin/legal'),
      ]);
      setFaqItems(faqRes.items || []);
      setLegalItems(legalRes.items || []);
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
          ...faqForm,
          slug:
            faqForm.slug ||
            slugify(`faq-${faqForm.category}-${Date.now()}-${faqForm.locale}`),
          displayOrder: Number(faqForm.displayOrder) || 0,
        },
      });
      setFaqForm({
        slug: '',
        category: 'PROGRAMS',
        locale: 'ar',
        question: '',
        answer: '',
        displayOrder: faqItems.length + 1,
        active: true,
      });
      setNotice('تمت إضافة السؤال الشائع بنجاح.');
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
      setNotice(`تم تحديث حالة السؤال «${item.slug}».`);
      await loadAll();
    } catch (reason) {
      setError(reason);
    }
  }

  async function removeFaq(item) {
    setError(null);
    setNotice('');
    try {
      await api(`/admin/faq/${item.id}`, { method: 'DELETE' });
      setNotice(`تم حذف السؤال «${item.slug}».`);
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
      await api('/admin/legal', {
        method: 'POST',
        body: legalForm,
      });
      setNotice(
        `تم نشر الوثيقة ${legalForm.type === 'TERMS' ? 'الشروط والأحكام' : 'سياسة الخصوصية'} (${legalForm.version}).`,
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
            إدارة محتوى مركز المساعدة ونسخ الشروط والأحكام وسياسة الخصوصية التي
            تظهر داخل تطبيق الموبايل.
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
                <p>انشر أسئلة وأجوبة قابلة للبحث بالعربية أو الإنجليزية.</p>
              </div>
            </div>
            <form onSubmit={createFaq} className="field-grid">
              <Field label="السؤال" full>
                <input
                  value={faqForm.question}
                  onChange={(e) =>
                    setFaqForm({
                      ...faqForm,
                      question: e.target.value,
                    })
                  }
                  required
                />
              </Field>
              <Field
                label="المعرّف النصي (Slug)"
                hint="أحرف إنجليزية صغيرة وشرطات فقط"
              >
                <input
                  dir="ltr"
                  placeholder="how-matching-works-ar"
                  value={faqForm.slug}
                  onChange={(e) =>
                    setFaqForm({ ...faqForm, slug: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="التصنيف">
                <input
                  dir="ltr"
                  value={faqForm.category}
                  onChange={(e) =>
                    setFaqForm({ ...faqForm, category: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="اللغة">
                <select
                  value={faqForm.locale}
                  onChange={(e) =>
                    setFaqForm({ ...faqForm, locale: e.target.value })
                  }
                >
                  <option value="ar">العربية (ar)</option>
                  <option value="en">الإنجليزية (en)</option>
                </select>
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
              <Field label="الإجابة" full>
                <textarea
                  rows="3"
                  value={faqForm.answer}
                  onChange={(e) =>
                    setFaqForm({ ...faqForm, answer: e.target.value })
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
                  <Plus size={17} />
                  {savingFaq ? 'جارٍ الحفظ…' : 'إضافة السؤال'}
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
                  نشر إصدار وثيقة قانونية
                </h2>
                <p>
                  تفعيل إصدار جديد يستبدل تلقائياً الإصدار النشط السابق لنفس
                  النوع واللغة.
                </p>
              </div>
            </div>
            <form onSubmit={publishLegal} className="field-grid">
              <Field label="نوع الوثيقة">
                <select
                  value={legalForm.type}
                  onChange={(e) =>
                    setLegalForm({ ...legalForm, type: e.target.value })
                  }
                >
                  <option value="TERMS">الشروط والأحكام (TERMS)</option>
                  <option value="PRIVACY">سياسة الخصوصية (PRIVACY)</option>
                </select>
              </Field>
              <Field label="رقم الإصدار">
                <input
                  dir="ltr"
                  value={legalForm.version}
                  onChange={(e) =>
                    setLegalForm({ ...legalForm, version: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="اللغة">
                <select
                  value={legalForm.locale}
                  onChange={(e) =>
                    setLegalForm({ ...legalForm, locale: e.target.value })
                  }
                >
                  <option value="ar">العربية (ar)</option>
                  <option value="en">الإنجليزية (en)</option>
                </select>
              </Field>
              <Field label="عنوان الوثيقة">
                <input
                  value={legalForm.title}
                  onChange={(e) =>
                    setLegalForm({ ...legalForm, title: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="نص الوثيقة" full>
                <textarea
                  rows="4"
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
                  <Plus size={17} />
                  {savingLegal ? 'جارٍ النشر…' : 'نشر الإصدار القانوني'}
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
              <p>جميع الأسئلة النشطة والموقوفة باللغتين.</p>
            </div>
          </div>
          {loading ? (
            <div className="loading-list">
              <span className="spinner" /> جارٍ تحميل الأسئلة…
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>السؤال</th>
                    <th>التصنيف</th>
                    <th>اللغة</th>
                    <th>الحالة</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {faqItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.question}</strong>
                        <div className="muted-meta" dir="ltr">
                          {item.slug}
                        </div>
                      </td>
                      <td dir="ltr">{item.category}</td>
                      <td>{item.locale === 'ar' ? 'العربية' : 'الإنجليزية'}</td>
                      <td>
                        <Status
                          value={item.active ? 'PUBLISHED' : 'DRAFT'}
                          customLabel={item.active ? 'نشط' : 'موقوف'}
                        />
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            type="button"
                            className="button secondary compact"
                            onClick={() => toggleFaqActive(item)}
                          >
                            {item.active ? 'إيقاف' : 'تفعيل'}
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label="حذف السؤال"
                            onClick={() => removeFaq(item)}
                          >
                            <Trash2 size={16} />
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
    </>
  );
}
