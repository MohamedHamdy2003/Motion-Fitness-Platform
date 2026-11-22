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
    locale: 'en',
    question: '',
    answer: '',
    displayOrder: 1,
    active: true,
  });

  const [legalForm, setLegalForm] = useState({
    type: 'TERMS',
    version: '1.1.0',
    locale: 'en',
    title: 'Motion Terms & Conditions',
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
            faqForm.slug || slugify(`${faqForm.question}-${faqForm.locale}`),
          displayOrder: Number(faqForm.displayOrder) || 0,
        },
      });
      setFaqForm({
        slug: '',
        category: 'PROGRAMS',
        locale: 'en',
        question: '',
        answer: '',
        displayOrder: faqItems.length + 1,
        active: true,
      });
      setNotice('FAQ entry created.');
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
      setNotice(`FAQ "${item.slug}" updated.`);
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
      setNotice(`FAQ "${item.slug}" deleted.`);
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
        `Legal document ${legalForm.type} v${legalForm.version} (${legalForm.locale}) published.`,
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
          <h1>Support, FAQ & Legal</h1>
          <p>
            Manage bilingual FAQ entries and versioned Terms & Privacy documents
            shown in the mobile app.
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
                  <HelpCircle
                    size={18}
                    style={{ verticalAlign: 'text-bottom', marginRight: 6 }}
                  />
                  Add FAQ Entry
                </h2>
                <p>
                  Publish searchable help center questions in English or Arabic.
                </p>
              </div>
            </div>
            <form onSubmit={createFaq} className="field-grid">
              <Field label="Question" full>
                <input
                  value={faqForm.question}
                  onChange={(e) =>
                    setFaqForm({
                      ...faqForm,
                      question: e.target.value,
                      slug:
                        faqForm.slug ||
                        slugify(`${e.target.value}-${faqForm.locale}`),
                    })
                  }
                  required
                />
              </Field>
              <Field label="Slug">
                <input
                  value={faqForm.slug}
                  onChange={(e) =>
                    setFaqForm({ ...faqForm, slug: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="Category">
                <input
                  value={faqForm.category}
                  onChange={(e) =>
                    setFaqForm({ ...faqForm, category: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="Locale">
                <select
                  value={faqForm.locale}
                  onChange={(e) =>
                    setFaqForm({ ...faqForm, locale: e.target.value })
                  }
                >
                  <option value="en">English (en)</option>
                  <option value="ar">Arabic (ar)</option>
                </select>
              </Field>
              <Field label="Display order">
                <input
                  type="number"
                  min="0"
                  value={faqForm.displayOrder}
                  onChange={(e) =>
                    setFaqForm({ ...faqForm, displayOrder: e.target.value })
                  }
                />
              </Field>
              <Field label="Answer" full>
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
                  <Plus size={18} />
                  {savingFaq ? 'Saving…' : 'Create FAQ Entry'}
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
                  <FileText
                    size={18}
                    style={{ verticalAlign: 'text-bottom', marginRight: 6 }}
                  />
                  Publish Legal Document Version
                </h2>
                <p>
                  Activating a new version automatically supersedes the previous
                  active document for that type and locale.
                </p>
              </div>
            </div>
            <form onSubmit={publishLegal} className="field-grid">
              <Field label="Document type">
                <select
                  value={legalForm.type}
                  onChange={(e) =>
                    setLegalForm({ ...legalForm, type: e.target.value })
                  }
                >
                  <option value="TERMS">Terms & Conditions (TERMS)</option>
                  <option value="PRIVACY">Privacy Policy (PRIVACY)</option>
                </select>
              </Field>
              <Field label="Version">
                <input
                  value={legalForm.version}
                  onChange={(e) =>
                    setLegalForm({ ...legalForm, version: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="Locale">
                <select
                  value={legalForm.locale}
                  onChange={(e) =>
                    setLegalForm({ ...legalForm, locale: e.target.value })
                  }
                >
                  <option value="en">English (en)</option>
                  <option value="ar">Arabic (ar)</option>
                </select>
              </Field>
              <Field label="Title">
                <input
                  value={legalForm.title}
                  onChange={(e) =>
                    setLegalForm({ ...legalForm, title: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="Document content" full>
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
                  <Plus size={18} />
                  {savingLegal ? 'Publishing…' : 'Publish Legal Version'}
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>

      <section className="editor-panel" style={{ marginTop: 24 }}>
        <div className="editor-body">
          <div className="section-heading">
            <div>
              <h2>FAQ Catalog ({faqItems.length})</h2>
              <p>Active and draft FAQ items across supported locales.</p>
            </div>
          </div>
          {loading ? (
            <div className="loading-list">
              <span className="spinner" /> Loading FAQ entries…
            </div>
          ) : (
            <div className="content-table-wrap">
              <table className="content-table">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Category</th>
                    <th>Locale</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {faqItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.question}</strong>
                        <div className="muted-meta">{item.slug}</div>
                      </td>
                      <td>{item.category}</td>
                      <td>{item.locale.toUpperCase()}</td>
                      <td>
                        <Status value={item.active ? 'PUBLISHED' : 'DRAFT'} />
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            type="button"
                            className="button secondary compact"
                            onClick={() => toggleFaqActive(item)}
                          >
                            {item.active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label="Delete FAQ"
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

      <section className="editor-panel" style={{ marginTop: 24 }}>
        <div className="editor-body">
          <div className="section-heading">
            <div>
              <h2>Legal Document Versions ({legalItems.length})</h2>
              <p>Terms & Conditions and Privacy Policy revision history.</p>
            </div>
          </div>
          {!loading && (
            <div className="content-table-wrap">
              <table className="content-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Version</th>
                    <th>Locale</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {legalItems.map((doc) => (
                    <tr key={doc.id}>
                      <td>
                        <strong>{doc.title}</strong>
                      </td>
                      <td>{doc.type}</td>
                      <td>v{doc.version}</td>
                      <td>{doc.locale.toUpperCase()}</td>
                      <td>
                        <Status value={doc.active ? 'PUBLISHED' : 'ARCHIVED'} />
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
