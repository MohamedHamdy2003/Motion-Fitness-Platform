import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  Search,
  Trash2,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react';
import { fetchPage } from './api';
import { readableCode } from './program';
import {
  ConfirmDialog,
  ErrorNotice,
  Notice,
  PaginationBar,
  Status,
} from './ui';
import './analytics.css';

const PAGE_SIZE = 10;

function statusMeta(status) {
  if (status === 'ACTIVE') return { tone: 'PUBLISHED', label: 'نشط' };
  if (status === 'SUSPENDED') return { tone: 'DRAFT', label: 'موقوف' };
  return { tone: 'ARCHIVED', label: 'قيد الحذف' };
}

export function UsersStudio({ api, realtimeTick = 0 }) {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [summary, setSummary] = useState({
    total: 0,
    active: 0,
    suspended: 0,
    onboarded: 0,
  });
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [reload, setReload] = useState(0);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 240);
    return () => clearTimeout(timer);
  }, [search]);

  const loadUsers = useCallback(
    async (signal) => {
      if (hasLoadedRef.current) setFetching(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await fetchPage(api, '/admin/users', {
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          search: debouncedSearch,
          status: statusFilter || undefined,
          signal,
        });
        hasLoadedRef.current = true;
        setUsers(res.items || []);
        setTotal(res.total ?? 0);
        if (res.summary) setSummary(res.summary);
      } catch (reason) {
        if (reason?.name === 'AbortError') return;
        setError(reason);
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setFetching(false);
        }
      }
    },
    [api, page, debouncedSearch, statusFilter],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadUsers(controller.signal);
    return () => controller.abort();
  }, [loadUsers, reload, realtimeTick]);

  async function toggleStatus(user) {
    const nextStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setBusyId(user.id);
    setError(null);
    setNotice('');
    try {
      await api(`/admin/users/${user.id}/status`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      setNotice(
        nextStatus === 'SUSPENDED'
          ? `تم إيقاف حساب ${user.email || user.name || 'المتدرب'} وسحب جلساته النشطة.`
          : `تمت إعادة تفعيل حساب ${user.email || user.name || 'المتدرب'} بنجاح.`,
      );
      setReload((n) => n + 1);
    } catch (reason) {
      setError(reason);
    } finally {
      setBusyId('');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setBusyId(target.id);
    setError(null);
    setNotice('');
    try {
      await api(`/admin/users/${target.id}`, { method: 'DELETE' });
      setNotice(
        `تم حذف حساب ${target.email || target.name || 'المتدرب'} نهائياً.`,
      );
      if (users.length === 1 && page > 0) setPage((p) => p - 1);
      else setReload((n) => n + 1);
    } catch (reason) {
      setError(reason);
    } finally {
      setBusyId('');
    }
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>إدارة المتدربين والحسابات</h1>
          <p>
            متابعة حسابات المتدربين المسجّلين، البرامج المشتركين بها، وإيقاف أو
            حذف الحسابات التجريبية (حسابات الإدارة محمية ولا تظهر هنا).
          </p>
        </div>
      </header>

      <ErrorNotice error={error} onRetry={() => setReload((n) => n + 1)} />
      <Notice text={notice} />

      <section
        className="rst-kpi-grid"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          marginBottom: 20,
        }}
        aria-label="ملخص المتدربين"
      >
        <article className="rst-kpi">
          <div className="rst-kpi-top">
            <span className="rst-kpi-label">
              <span className="rst-kpi-ico is-blue" aria-hidden="true">
                <Users size={17} />
              </span>
              إجمالي المتدربين
            </span>
          </div>
          <div className="rst-kpi-val numeric" dir="ltr">
            {summary.total}
          </div>
        </article>
        <article className="rst-kpi">
          <div className="rst-kpi-top">
            <span className="rst-kpi-label">
              <span className="rst-kpi-ico is-emerald" aria-hidden="true">
                <UserCheck size={17} />
              </span>
              الحسابات النشطة
            </span>
          </div>
          <div className="rst-kpi-val numeric" dir="ltr">
            {summary.active}
          </div>
        </article>
        <article className="rst-kpi">
          <div className="rst-kpi-top">
            <span className="rst-kpi-label">
              <span className="rst-kpi-ico is-orange" aria-hidden="true">
                <CheckCircle2 size={17} />
              </span>
              مكتملو ملف التعريف
            </span>
          </div>
          <div className="rst-kpi-val numeric" dir="ltr">
            {summary.onboarded}
          </div>
        </article>
        <article className="rst-kpi">
          <div className="rst-kpi-top">
            <span className="rst-kpi-label">
              <span className="rst-kpi-ico is-gold" aria-hidden="true">
                <UserX size={17} />
              </span>
              الحسابات الموقوفة
            </span>
          </div>
          <div className="rst-kpi-val numeric" dir="ltr">
            {summary.suspended}
          </div>
        </article>
      </section>

      <section className="listing" aria-label="سجل المتدربين">
        <div className="list-controls">
          <div
            className="filter-tabs"
            role="group"
            aria-label="تصفية المتدربين"
          >
            {[
              ['', 'الكل'],
              ['ACTIVE', 'نشط'],
              ['SUSPENDED', 'موقوف'],
            ].map(([val, label]) => (
              <button
                key={val}
                type="button"
                aria-pressed={statusFilter === val}
                onClick={() => {
                  setStatusFilter(val);
                  setPage(0);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              aria-label="بحث في المتدربين"
              placeholder="ابحث بالاسم أو البريد الإلكتروني…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
            />
          </label>
        </div>

        {loading ? (
          <div className="loading-list" role="status">
            <span className="spinner" /> جارٍ تحميل قائمة المتدربين…
          </div>
        ) : users.length === 0 ? (
          <div className="empty-state">
            <Users size={24} aria-hidden="true" />
            <h2>لا يوجد متدربون مطابقون</h2>
            <p>
              {search || statusFilter
                ? 'جرّب تعديل كلمة البحث أو تغيير تصفية الحالة.'
                : 'لم يسجّل أي متدرب في التطبيق بعد.'}
            </p>
          </div>
        ) : (
          <>
            <div className="table-wrap" data-fetching={fetching || undefined}>
              <table>
                <thead>
                  <tr>
                    <th>المتدرب</th>
                    <th>الحالة</th>
                    <th>الهدف والمستوى</th>
                    <th>البرنامج النشط</th>
                    <th>الالتزام</th>
                    <th>تاريخ التسجيل</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const badge = statusMeta(user.status);
                    const isBusy = busyId === user.id;
                    return (
                      <tr key={user.id}>
                        <td>
                          <strong>{user.name || 'متدرب بدون اسم'}</strong>
                          <div className="muted-meta" dir="ltr">
                            {user.email || '—'}
                          </div>
                        </td>
                        <td>
                          <Status
                            value={badge.tone}
                            customLabel={badge.label}
                          />
                          {!user.verified && (
                            <div className="muted-meta">غير مفعّل البريد</div>
                          )}
                        </td>
                        <td>
                          <div>
                            {user.primaryGoal
                              ? readableCode(user.primaryGoal)
                              : 'لم يُكمل التعريف'}
                          </div>
                          {user.fitnessLevel && (
                            <div className="muted-meta">
                              {readableCode(user.fitnessLevel)}
                            </div>
                          )}
                        </td>
                        <td>
                          {user.activeProgramTitle ? (
                            <strong>{user.activeProgramTitle}</strong>
                          ) : (
                            <span className="muted-meta">
                              لا يوجد اشتراك نشط
                            </span>
                          )}
                        </td>
                        <td className="numeric">
                          {user.completedWorkouts} تمرين · {user.completedMeals}{' '}
                          وجبة
                        </td>
                        <td dir="ltr">
                          {new Date(user.createdAt).toLocaleDateString('ar-EG')}
                        </td>
                        <td>
                          <div className="actions">
                            {user.status !== 'DELETION_PENDING' && (
                              <button
                                type="button"
                                className="button secondary compact"
                                disabled={isBusy}
                                onClick={() => void toggleStatus(user)}
                              >
                                {user.status === 'ACTIVE' ? (
                                  <>
                                    <PauseCircle size={14} aria-hidden="true" />
                                    إيقاف
                                  </>
                                ) : (
                                  <>
                                    <PlayCircle size={14} aria-hidden="true" />
                                    تفعيل
                                  </>
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              className="button danger compact"
                              disabled={isBusy}
                              onClick={() => setDeleteTarget(user)}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                              حذف
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              visibleCount={users.length}
              disabled={fetching}
              onPageChange={(nextPage) => setPage(nextPage)}
            />
          </>
        )}
      </section>

      {deleteTarget && (
        <ConfirmDialog
          title="حذف حساب المتدرب نهائياً؟"
          action="تأكيد الحذف"
          destructive
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        >
          <p>
            سيتم حذف حساب «{deleteTarget.email || deleteTarget.name}» وجميع
            بياناته وتمارينه المسجّلة نهائياً ولا يمكن التراجع عن ذلك.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
