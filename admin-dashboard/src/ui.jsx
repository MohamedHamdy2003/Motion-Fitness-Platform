import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  LoaderCircle,
  LogOut,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Sun,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function ThemeToggle({
  theme,
  onToggle,
  collapsed = false,
  floating = false,
}) {
  const isDark = theme === 'dark';
  const label = isDark ? 'الوضع النهاري' : 'الوضع الليلي';

  return (
    <button
      type="button"
      className={'theme-toggle' + (floating ? ' is-floating' : '')}
      data-dark={isDark ? 'true' : 'false'}
      aria-pressed={isDark}
      aria-label={
        isDark ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي'
      }
      title={
        collapsed || floating
          ? isDark
            ? 'التبديل إلى الوضع النهاري'
            : 'التبديل إلى الوضع الليلي'
          : undefined
      }
      onClick={onToggle}
    >
      {!floating && (
        <span className="theme-toggle-text nav-label">
          <span>{label}</span>
        </span>
      )}
      <span className="theme-track" aria-hidden="true">
        <span className="theme-stars" />
        <span className="theme-thumb">
          <span className="theme-icon-sun">
            <Sun size={13} strokeWidth={2.4} />
          </span>
          <span className="theme-icon-moon">
            <Moon size={13} strokeWidth={2.3} />
          </span>
        </span>
      </span>
    </button>
  );
}

export function Brand({ compact = false }) {
  return (
    <div className="brand">
      <span className="brand-badge" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {!compact && (
        <span className="brand-copy">
          <strong>MOTION</strong>
          <small>بوابة الإدارة</small>
        </span>
      )}
    </div>
  );
}

export function ButtonContent({ busy, children }) {
  return (
    <span className="button-content">
      <span className="button-rest" aria-hidden={busy ? 'true' : undefined}>
        {children}
      </span>
      {busy && (
        <span
          className="button-progress"
          role="status"
          aria-label="جارٍ التنفيذ"
        >
          <LoaderCircle size={18} className="spin" aria-hidden="true" />
        </span>
      )}
    </span>
  );
}

export function SideNav({
  sidebarRef,
  section,
  sections,
  onNavigate,
  session,
  onRequestSignOut,
  logoutTriggerRef,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  compactNavigation,
  onCloseMobile,
  theme,
  onToggleTheme,
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
    <aside
      ref={sidebarRef}
      className={'sidebar' + (mobileOpen ? ' is-open' : '')}
      aria-label="التنقل الرئيسي"
      inert={compactNavigation && !mobileOpen ? '' : undefined}
      aria-hidden={compactNavigation && !mobileOpen ? true : undefined}
    >
      <div className="sidebar-brand">
        <Brand />
        <span className="sidebar-mark" aria-hidden="true">
          <span className="brand-badge">
            <i />
            <i />
            <i />
          </span>
        </span>
        <button
          type="button"
          className="icon-button mobile-close"
          aria-label="إغلاق القائمة"
          onClick={onCloseMobile}
        >
          <X size={20} />
        </button>
      </div>

      <button
        type="button"
        className="sidebar-toggle"
        aria-label={
          collapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية'
        }
        aria-expanded={!collapsed}
        aria-controls="motion-admin-navigation"
        title={collapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية'}
        onClick={onToggleCollapsed}
      >
        {collapsed ? (
          <PanelRightOpen size={19} aria-hidden="true" />
        ) : (
          <PanelRightClose size={19} aria-hidden="true" />
        )}
        <span className="nav-label">طي القائمة</span>
      </button>

      <nav
        id="motion-admin-navigation"
        aria-label="أقسام بوابة الإدارة"
        className="sidebar-nav"
      >
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
                  aria-label={label}
                  title={collapsed && !compactNavigation ? label : undefined}
                  onClick={() => onNavigate({ section: key })}
                >
                  <Icon size={20} strokeWidth={1.85} aria-hidden="true" />
                  <span className="nav-label">{label}</span>
                </button>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <span className="sidebar-account" title={session.email}>
          <CircleUserRound size={18} aria-hidden="true" />
          <span dir="ltr">{session.email}</span>
        </span>
        <ThemeToggle
          theme={theme}
          onToggle={onToggleTheme}
          collapsed={collapsed && !compactNavigation}
        />
        <button
          ref={logoutTriggerRef}
          className="logout"
          type="button"
          aria-label="تسجيل الخروج"
          aria-haspopup="dialog"
          title={collapsed && !compactNavigation ? 'تسجيل الخروج' : undefined}
          onClick={onRequestSignOut}
        >
          <LogOut size={19} strokeWidth={1.85} aria-hidden="true" />
          <span className="nav-label">تسجيل الخروج</span>
        </button>
      </div>
    </aside>
  );
}

export function ErrorNotice({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="notice error" role="alert">
      <AlertCircle size={19} aria-hidden="true" />
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
          <button
            className="button secondary compact"
            type="button"
            onClick={onRetry}
          >
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
        : value === 'INFO'
          ? 'info'
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
            placeholder="ابحث بالاسم أو المعرّف…"
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
