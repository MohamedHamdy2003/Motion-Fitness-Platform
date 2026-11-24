import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
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
  Zap,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

const THEME_STAGES = [
  {
    key: 'classic',
    label: 'أساسي',
    title: 'الهوية الأساسية (فاتح)',
    Icon: Sun,
  },
  {
    key: 'lime',
    label: 'موشن',
    title: 'موشن الفسفوري (فاتح)',
    Icon: Zap,
  },
  { key: 'dark', label: 'داكن', title: 'الوضع الداكن (Figma)', Icon: Moon },
];

export function ThemeToggle({
  theme,
  onSelectTheme,
  collapsed = false,
  floating = false,
}) {
  const stageIndex = Math.max(
    0,
    THEME_STAGES.findIndex((stage) => stage.key === theme),
  );
  const activeStage = THEME_STAGES[stageIndex] || THEME_STAGES[0];
  const nextStage = THEME_STAGES[(stageIndex + 1) % THEME_STAGES.length];

  if (collapsed && !floating) {
    const ActiveIcon = activeStage.Icon;
    return (
      <button
        type="button"
        className="theme-orb"
        aria-label={`الثيم الحالي: ${activeStage.title}. اضغط للتبديل إلى ${nextStage.title}`}
        title={`الثيم: ${activeStage.title} (اضغط للتبديل)`}
        onClick={() => onSelectTheme(nextStage.key)}
      >
        <span className="theme-orb-icon" key={activeStage.key}>
          <ActiveIcon size={15} strokeWidth={2.3} aria-hidden="true" />
        </span>
      </button>
    );
  }

  return (
    <div
      className={'theme-switcher' + (floating ? ' is-floating' : '')}
      role="radiogroup"
      aria-label="اختيار مظهر لوحة التحكم"
      data-stage={stageIndex}
    >
      <span className="theme-switcher-thumb" aria-hidden="true" />
      {THEME_STAGES.map(({ key, label, title, Icon }) => {
        const active = activeStage.key === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={title}
            title={title}
            className="theme-stage-btn"
            onClick={() => onSelectTheme(key)}
          >
            <Icon size={14} strokeWidth={2.3} aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function CustomSelect({
  value,
  onChange,
  options = [],
  loadOptions,
  selectedLabel,
  placeholder = 'اختر قيمة…',
  disabled = false,
  ariaLabel,
  searchable,
}) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(-1);
  const [asyncItems, setAsyncItems] = useState([]);
  const [loadingAsync, setLoadingAsync] = useState(false);
  const [pickedLabel, setPickedLabel] = useState('');
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const reqSeq = useRef(0);
  const listId = useId();
  const isAsync = typeof loadOptions === 'function';

  const normalizedStatic = useMemo(
    () =>
      options.map((opt) => ({
        value: String(opt.value ?? ''),
        label: String(opt.label ?? opt.value ?? ''),
        disabled: Boolean(opt.disabled),
      })),
    [options],
  );

  const normalizedAsync = useMemo(
    () =>
      asyncItems.map((opt) => ({
        value: String(opt.value ?? ''),
        label: String(opt.label ?? opt.value ?? ''),
        disabled: Boolean(opt.disabled),
      })),
    [asyncItems],
  );

  const selectedValue = String(value ?? '');
  const selectedOption =
    normalizedStatic.find((opt) => opt.value === selectedValue) ||
    normalizedAsync.find((opt) => opt.value === selectedValue);
  const resolvedLabel =
    selectedOption?.label ||
    selectedLabel ||
    (selectedValue && pickedLabel ? pickedLabel : '');
  const showSearch = searchable ?? (isAsync || normalizedStatic.length > 8);

  const filtered = useMemo(() => {
    if (isAsync) return normalizedAsync;
    const q = query.trim().toLowerCase();
    if (!q) return normalizedStatic;
    return normalizedStatic.filter((opt) =>
      opt.label.toLowerCase().includes(q),
    );
  }, [isAsync, normalizedAsync, normalizedStatic, query]);

  useEffect(() => {
    if (!open || !isAsync) return;
    const currentSeq = ++reqSeq.current;
    setLoadingAsync(true);
    const delay = query.trim() ? 220 : 0;
    const timer = setTimeout(() => {
      Promise.resolve(loadOptions(query.trim()))
        .then((result) => {
          if (reqSeq.current !== currentSeq) return;
          setAsyncItems(Array.isArray(result) ? result : []);
          setHighlighted(0);
        })
        .catch(() => {
          if (reqSeq.current !== currentSeq) return;
          setAsyncItems([]);
        })
        .finally(() => {
          if (reqSeq.current === currentSeq) setLoadingAsync(false);
        });
    }, delay);
    return () => clearTimeout(timer);
  }, [open, isAsync, query, loadOptions]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleKey(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (open && showSearch) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, showSearch]);

  function toggleOpen() {
    if (disabled) return;
    if (!open && rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUp(spaceBelow < 280 && rect.top > spaceBelow);
      setQuery('');
      const idx = normalizedStatic.findIndex((o) => o.value === selectedValue);
      setHighlighted(idx >= 0 ? idx : 0);
    }
    setOpen((prev) => !prev);
  }

  function pick(option) {
    if (option.disabled) return;
    setOpen(false);
    setQuery('');
    setPickedLabel(option.label);
    if (option.value !== selectedValue) {
      onChange?.(option.value, option);
    }
  }

  function onTriggerKeyDown(event) {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        toggleOpen();
        return;
      }
      if (!filtered.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlighted((prev) => {
        const base = prev < 0 ? 0 : prev;
        return (base + step + filtered.length) % filtered.length;
      });
    } else if (event.key === 'Enter' || event.key === ' ') {
      if (!open) {
        event.preventDefault();
        toggleOpen();
      } else if (highlighted >= 0 && filtered[highlighted]) {
        event.preventDefault();
        pick(filtered[highlighted]);
      }
    }
  }

  return (
    <div
      ref={rootRef}
      className={
        'cselect' + (open ? ' is-open' : '') + (openUp ? ' is-up' : '')
      }
    >
      <button
        type="button"
        className="cselect-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={toggleOpen}
        onKeyDown={onTriggerKeyDown}
      >
        <span
          className={
            'cselect-value' + (!resolvedLabel ? ' is-placeholder' : '')
          }
        >
          {resolvedLabel || placeholder}
        </span>
        <ChevronDown
          size={17}
          strokeWidth={2.2}
          className="cselect-chevron"
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="cselect-menu" role="presentation">
          {showSearch && (
            <div className="cselect-search">
              <Search size={14} aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                placeholder={
                  isAsync ? 'اكتب للبحث من السيرفر…' : 'بحث سريع في الخيارات…'
                }
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlighted(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (!filtered.length) return;
                    const step = e.key === 'ArrowDown' ? 1 : -1;
                    setHighlighted(
                      (prev) =>
                        ((prev < 0 ? 0 : prev) + step + filtered.length) %
                        filtered.length,
                    );
                  } else if (
                    e.key === 'Enter' &&
                    highlighted >= 0 &&
                    filtered[highlighted]
                  ) {
                    e.preventDefault();
                    pick(filtered[highlighted]);
                  }
                }}
              />
            </div>
          )}

          {loadingAsync ? (
            <div className="cselect-loading" role="status">
              <LoaderCircle size={15} className="spin" aria-hidden="true" />
              <span>جارٍ البحث…</span>
            </div>
          ) : (
            <ul id={listId} role="listbox" className="cselect-list">
              {filtered.length === 0 ? (
                <li className="cselect-empty">لا توجد خيارات مطابقة</li>
              ) : (
                filtered.map((opt, idx) => {
                  const isSelected = opt.value === selectedValue;
                  const isActive = idx === highlighted;
                  return (
                    <li key={`${opt.value}-${idx}`} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={opt.disabled}
                        className={
                          'cselect-option' + (isActive ? ' is-highlighted' : '')
                        }
                        onMouseEnter={() => setHighlighted(idx)}
                        onClick={() => pick(opt)}
                      >
                        <span className="cselect-option-label">
                          {opt.label}
                        </span>
                        {isSelected && (
                          <Check
                            size={15}
                            strokeWidth={2.6}
                            className="cselect-option-check"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function buildPageRange(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  const pages = new Set([
    0,
    totalPages - 1,
    currentPage,
    currentPage - 1,
    currentPage + 1,
  ]);
  const sorted = [...pages]
    .filter((p) => p >= 0 && p < totalPages)
    .sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('…');
    out.push(sorted[i]);
  }
  return out;
}

export function PaginationBar({
  page,
  pageSize = 10,
  total,
  visibleCount,
  disabled = false,
  onPageChange,
}) {
  if (!total) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const start = safePage * pageSize + 1;
  const end = Math.min(total, safePage * pageSize + (visibleCount ?? pageSize));
  const range = buildPageRange(safePage, totalPages);

  return (
    <nav className="pagination" aria-label="التنقل بين الصفحات">
      <small className="numeric">
        عرض {start}–{end} من أصل {total} (صفحة {safePage + 1} من {totalPages})
      </small>
      <div className="pagination-controls">
        <button
          type="button"
          className="pagination-btn"
          aria-label="الصفحة السابقة"
          disabled={disabled || safePage <= 0}
          onClick={() => onPageChange(safePage - 1)}
        >
          <ChevronRight size={16} aria-hidden="true" />
          <span>السابق</span>
        </button>

        {range.map((entry, idx) =>
          entry === '…' ? (
            <span
              key={`ellipsis-${idx}`}
              className="pagination-ellipsis"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              className={
                'pagination-btn numeric' +
                (entry === safePage ? ' is-active' : '')
              }
              aria-label={`صفحة ${entry + 1}`}
              aria-current={entry === safePage ? 'page' : undefined}
              disabled={disabled}
              onClick={() => onPageChange(entry)}
            >
              {entry + 1}
            </button>
          ),
        )}

        <button
          type="button"
          className="pagination-btn"
          aria-label="الصفحة التالية"
          disabled={disabled || safePage >= totalPages - 1}
          onClick={() => onPageChange(safePage + 1)}
        >
          <span>التالي</span>
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
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
  onSelectTheme,
}) {
  const groups = [
    {
      title: 'المتابعة والعمليات',
      keys: ['analytics', 'users', 'matching', 'support'],
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
          onSelectTheme={onSelectTheme}
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
    <div className={`field${full ? ' full' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </div>
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

export function ContentList({
  label,
  singular,
  items,
  total,
  page = 0,
  pageSize = 10,
  onPageChange,
  search = '',
  onSearchChange,
  filter = '',
  onFilterChange,
  columns,
  isLoading,
  isFetching = false,
  onOpen,
  onCreate,
  error,
  onRetry,
  statusFilters = ['DRAFT', 'PUBLISHED'],
}) {
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
              onClick={() => onFilterChange?.(value)}
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
            placeholder="ابحث بالاسم…"
            value={search}
            onChange={(event) => onSearchChange?.(event.target.value)}
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
        (items.length ? (
          <>
            <div className="table-wrap" data-fetching={isFetching || undefined}>
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
                  {items.map((item) => (
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
            <PaginationBar
              page={page}
              pageSize={pageSize}
              total={total}
              visibleCount={items.length}
              disabled={isFetching}
              onPageChange={onPageChange}
            />
          </>
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
    </section>
  );
}
