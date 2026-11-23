import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  LogOut,
  Search,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="brand-copy">
        <strong>MOTION</strong>
        <small>بوابة الإدارة</small>
      </span>
    </div>
  );
}

export function SideNav({
  section,
  sections,
  onNavigate,
  session,
  onSignOut,
  signingOut,
}) {
  const groups = [
    {
      title: 'المتابعة والعمليات',
      keys: ['analytics', 'matching', 'support'],
    },
    {
      title: 'مكتبة التدريب والتغذية',
      keys: [
        'programs',
        'exercises',
        'meals',
        'meal-sections',
        'food-sections',
        'foods',
        'ingredients',
      ],
    },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <Brand />
      </div>
      <nav aria-label="أقسام بوابة الإدارة" className="sidebar-nav">
        {groups.map((group) => {
          const items = group.keys
            .map((key) => sections.find((entry) => entry.key === key))
            .filter(Boolean);
          return (
            <div className="nav-group" key={group.title}>
              <div className="nav-group-title">{group.title}</div>
              {items.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  aria-current={key === section ? 'page' : undefined}
                  onClick={() => onNavigate({ section: key })}
                >
                  <Icon size={18} strokeWidth={1.9} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <span className="account" title={session.email}>
          <CircleUserRound size={18} />
          <span dir="ltr">{session.email}</span>
        </span>
        <button
          className="sign-out"
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
        >
          <LogOut size={17} />
          <span>{signingOut ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}</span>
        </button>
      </div>
    </aside>
  );
}

export function ErrorNotice({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="notice error" role="alert">
      <AlertCircle size={19} />
      <div>
        <strong>{error.message}</strong>
        {error.details?.length > 0 && (
          <ul>
            {error.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}
        {error.requestId && (
          <small dir="ltr">رقم الطلب: {error.requestId}</small>
        )}
        {onRetry && (
          <button className="button compact" type="button" onClick={onRetry}>
            إعادة المحاولة
          </button>
        )}
      </div>
    </div>
  );
}

export function Notice({ text }) {
  return text ? (
    <div className="notice success" role="status">
      {text}
    </div>
  ) : null;
}

export function Status({ value, customLabel }) {
  const tone =
    value === 'PUBLISHED'
      ? 'published'
      : value === 'ARCHIVED'
        ? 'archived'
        : 'draft';
  const label =
    customLabel ||
    (value === 'PUBLISHED'
      ? 'منشور'
      : value === 'ARCHIVED'
        ? 'مؤرشف'
        : 'مسودة');
  return <span className={`status ${tone}`}>{label}</span>;
}

export function Field({ label, hint, children, full = false }) {
  return (
    <label className={`field${full ? ' full' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function ConfirmDialog({
  title,
  children,
  action,
  destructive,
  onCancel,
  onConfirm,
}) {
  const dialog = useRef(null);
  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="confirm"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2>{title}</h2>
      <div>{children}</div>
      <div className="actions">
        <button
          type="button"
          className="button secondary"
          onClick={onCancel}
          autoFocus
        >
          إلغاء
        </button>
        <button
          type="button"
          className={`button ${destructive ? 'danger' : 'primary'}`}
          onClick={onConfirm}
        >
          {action}
        </button>
      </div>
    </dialog>
  );
}

const pageSize = 12;

export function ContentList({
  label,
  singular,
  items,
  columns,
  isLoading,
  onOpen,
  onCreate,
  error,
  onRetry,
  statusFilters = ['DRAFT', 'PUBLISHED'],
}) {
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const filtered = items.filter(
    (item) =>
      (!filter || item.status === filter) &&
      [item.title, item.slug].some((value) =>
        value?.toLowerCase().includes(search.trim().toLowerCase()),
      ),
  );
  const lastPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * pageSize;
  const visible = filtered.slice(start, start + pageSize);

  return (
    <section className="listing" aria-label={label}>
      <div className="list-controls">
        <div className="filter-tabs" role="group" aria-label="تصفية حسب الحالة">
          {[
            ['', 'الكل'],
            ...statusFilters.map((status) => [
              status,
              status === 'DRAFT'
                ? 'مسودات'
                : status === 'PUBLISHED'
                  ? 'منشور'
                  : 'مؤرشف',
            ]),
          ].map(([value, name]) => (
            <button
              type="button"
              key={value}
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                setPage(0);
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            aria-label={`بحث في ${label}`}
            placeholder={`ابحث بالاسم أو المعرّف…`}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </label>
      </div>
      <ErrorNotice error={error} onRetry={onRetry} />
      {isLoading ? (
        <div className="loading-list" role="status">
          <span className="spinner" /> جارٍ تحميل {label}…
        </div>
      ) : (
        !error &&
        (visible.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{singular}</th>
                  <th>الحالة</th>
                  {columns.map(({ label: colLabel }) => (
                    <th key={colLabel}>{colLabel}</th>
                  ))}
                  <th>
                    <span className="sr-only">فتح</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <button
                        className="row-title"
                        type="button"
                        onClick={() => onOpen(item.id)}
                      >
                        {item.title}
                      </button>
                    </td>
                    <td>
                      <Status value={item.status} />
                    </td>
                    {columns.map(({ label: colLabel, value }) => (
                      <td key={colLabel}>{value(item)}</td>
                    ))}
                    <td className="row-action-cell">
                      <button
                        className="icon-button"
                        type="button"
                        title={`فتح ${item.title}`}
                        aria-label={`فتح ${item.title}`}
                        onClick={() => onOpen(item.id)}
                      >
                        <ArrowLeft size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <Search size={24} aria-hidden="true" />
            <h2>
              {search || filter
                ? 'لا توجد نتائج مطابقة'
                : `لا يوجد ${label} بعد`}
            </h2>
            <p>
              {search || filter
                ? 'جرّب البحث بكلمة مختلفة أو تغيير تصفية الحالة.'
                : `ابدأ بإضافة أول ${singular} إلى المكتبة.`}
            </p>
            {!search && !filter && (
              <button
                className="button primary"
                type="button"
                onClick={onCreate}
              >
                إضافة {singular}
              </button>
            )}
          </div>
        ))
      )}
      {filtered.length > pageSize && (
        <div className="pagination">
          <small>
            عرض {start + 1}–{start + visible.length} من أصل {filtered.length}
          </small>
          <button
            type="button"
            className="icon-button"
            aria-label="الصفحة السابقة"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="الصفحة التالية"
            disabled={currentPage >= lastPage}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronLeft size={18} />
          </button>
        </div>
      )}
    </section>
  );
}
