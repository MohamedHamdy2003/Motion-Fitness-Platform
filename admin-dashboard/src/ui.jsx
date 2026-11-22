import {
  AlertCircle,
  ArrowRight,
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
      <span>
        <strong>MOTION</strong>
        <small>Studio</small>
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
  return (
    <aside className="sidebar">
      <Brand />
      <nav
        aria-label="Content"
        style={{
          '--active-nav': sections.findIndex((item) => item.key === section),
        }}
      >
        <span className="nav-slider" aria-hidden="true" />
        {sections.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            aria-current={key === section ? 'page' : undefined}
            onClick={() => onNavigate({ section: key })}
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="account" title={session.email}>
          <CircleUserRound size={19} />
          <span>{session.email}</span>
        </span>
        <button
          className="sign-out"
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
        >
          <LogOut size={19} />
          <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
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
        {error.requestId && <small>Request ID {error.requestId}</small>}
        {onRetry && (
          <button className="button compact" type="button" onClick={onRetry}>
            Try again
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

export function Status({ value }) {
  const label =
    value === 'PUBLISHED'
      ? 'Published'
      : value === 'ARCHIVED'
        ? 'Archived'
        : 'Draft';
  return <span className={`status ${label.toLowerCase()}`}>{label}</span>;
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
          Cancel
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
        <div className="filter-tabs" role="group" aria-label="Filter by status">
          {[
            ['', `All ${label.toLowerCase()}`],
            ...statusFilters.map((status) => [
              status,
              status === 'DRAFT'
                ? 'Drafts'
                : status === 'PUBLISHED'
                  ? 'Published'
                  : 'Archived',
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
          <Search size={21} aria-hidden="true" />
          <input
            type="search"
            aria-label={`Search ${label.toLowerCase()}`}
            placeholder={`Search ${label.toLowerCase()}`}
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
          <span className="spinner" /> Loading {label.toLowerCase()}…
        </div>
      ) : (
        !error &&
        (visible.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{singular}</th>
                  <th>Status</th>
                  {columns.map(({ label }) => (
                    <th key={label}>{label}</th>
                  ))}
                  <th>
                    <span className="sr-only">Open</span>
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
                    {columns.map(({ label, value }) => (
                      <td key={label}>{value(item)}</td>
                    ))}
                    <td>
                      <button
                        className="icon-button"
                        type="button"
                        title={`Open ${item.title}`}
                        aria-label={`Open ${item.title}`}
                        onClick={() => onOpen(item.id)}
                      >
                        <ArrowRight size={20} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <Search size={25} aria-hidden="true" />
            <h2>
              {search || filter
                ? 'No matches'
                : `No ${label.toLowerCase()} yet`}
            </h2>
            <p>
              {search || filter
                ? 'Try another search or status filter.'
                : `Create the first ${singular.toLowerCase()} in the library.`}
            </p>
            {!search && !filter && (
              <button
                className="button secondary"
                type="button"
                onClick={onCreate}
              >
                New {singular.toLowerCase()}
              </button>
            )}
          </div>
        ))
      )}
      {filtered.length > pageSize && (
        <div className="pagination">
          <small>
            {start + 1}–{start + visible.length} of {filtered.length}
          </small>
          <button
            type="button"
            className="icon-button"
            aria-label="Previous page"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Next page"
            disabled={currentPage >= lastPage}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </section>
  );
}
