import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import './tokens.css';
import './styles.css';

import { createRoot } from 'react-dom/client';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Apple,
  ArrowLeft,
  BarChart3,
  Boxes,
  Dumbbell,
  FolderKanban,
  HelpCircle,
  Layers3,
  Maximize2,
  Menu,
  Minimize2,
  Plus,
  Sparkles,
  Users,
  Utensils,
  Wheat,
} from 'lucide-react';
import { fetchPage, hasStoredSession, login, restoreSession } from './api';
import { LogoutConfirmation } from './LogoutConfirmation';
import { Presence } from './presence';
import { readableCode } from './program';
import { useAdminRealtime } from './realtime';
import {
  Brand,
  ButtonContent,
  ContentList,
  ErrorNotice,
  Field,
  Notice,
  SideNav,
} from './ui';

const AnalyticsStudio = lazy(() =>
  import('./AnalyticsStudio').then((m) => ({ default: m.AnalyticsStudio })),
);
const LibraryEditor = lazy(() =>
  import('./LibraryEditor').then((m) => ({ default: m.LibraryEditor })),
);
const MatchingStudio = lazy(() =>
  import('./MatchingStudio').then((m) => ({ default: m.MatchingStudio })),
);
const ProgramEditor = lazy(() =>
  import('./ProgramEditor').then((m) => ({ default: m.ProgramEditor })),
);
const SupportStudio = lazy(() =>
  import('./SupportStudio').then((m) => ({ default: m.SupportStudio })),
);
const UsersStudio = lazy(() =>
  import('./UsersStudio').then((m) => ({ default: m.UsersStudio })),
);

const sections = [
  {
    key: 'analytics',
    label: 'التحليلات وصحة النظام',
    singular: 'تقرير',
    Icon: BarChart3,
    intro:
      'متابعة استهلاك Gemini API، التكلفة التقديرية، جاهزية السيرفر، وحالة التكاملات الحية.',
  },
  {
    key: 'users',
    label: 'المتدربون',
    singular: 'متدرب',
    Icon: Users,
    intro:
      'إدارة حسابات المتدربين المسجلين وبرامجهم النشطة وإيقاف أو حذف الحسابات التجريبية.',
  },
  {
    key: 'programs',
    label: 'البرامج التدريبية',
    singular: 'برنامج',
    Icon: Layers3,
    intro: 'إنشاء ونشر البرامج التدريبية المزدوجة مع جداول التغذية اليومية.',
  },
  {
    key: 'exercises',
    label: 'مكتبة التمارين',
    singular: 'تمرين',
    Icon: Dumbbell,
    intro: 'إدارة التمارين المشتركة، التعليمات، والعضلات المستهدفة.',
  },
  {
    key: 'meals',
    label: 'الوجبات',
    singular: 'وجبة',
    Icon: Utensils,
    intro: 'تجهيز الوجبات المشتركة من مجموعات التبادل الغذائي والكميات.',
  },
  {
    key: 'meal-sections',
    label: 'أقسام الوجبات',
    singular: 'قسم وجبات',
    Icon: FolderKanban,
    intro: 'تصنيف الوجبات القابلة للاستبدال الكامل داخل نفس الفئة.',
  },
  {
    key: 'food-sections',
    label: 'أقسام التبادل الغذائي',
    singular: 'قسم تبادل غذائي',
    Icon: Boxes,
    intro:
      'إدارة مجموعات البدائل الغذائية لضبط السعرات والماكروز تلقائياً عند التبديل.',
  },
  {
    key: 'foods',
    label: 'الأطعمة',
    singular: 'طعام',
    Icon: Apple,
    intro: 'إدارة القيم الغذائية لكل 100 جم وربط الأطعمة بالمكونات الموثقة.',
  },
  {
    key: 'ingredients',
    label: 'المكونات',
    singular: 'مكوّن',
    Icon: Wheat,
    intro:
      'إدارة المكونات الموثقة ومسببات الحساسية لفحص أمان الوجبات تلقائياً.',
  },
  {
    key: 'matching',
    label: 'المطابقة الذكية',
    singular: 'قاعدة مطابقة',
    Icon: Sparkles,
    intro:
      'ضبط قواعد Gemini للمطابقة الآلية واختبار اختيار البرامج عبر المحاكي.',
  },
  {
    key: 'support',
    label: 'الأسئلة الشائعة والوثائق',
    singular: 'وثيقة',
    Icon: HelpCircle,
    intro:
      'إدارة الأسئلة الشائعة ونسخ الشروط والأحكام وسياسة الخصوصية باللغتين.',
  },
];

const columns = {
  programs: [
    {
      label: 'الهدف الأساسي',
      value: (item) => readableCode(item.primary_goal) || '—',
    },
    {
      label: 'أيام التدريب',
      value: (item) => `${item.training_days_per_week} أيام / أسبوع`,
    },
    { label: 'المدة', value: (item) => `${item.month_count * 4} أسبوعاً` },
  ],
  exercises: [
    {
      label: 'المجموعات العضلية',
      value: (item) => item.content?.muscleGroups?.join('، ') || '—',
    },
    { label: 'الإصدار', value: (item) => `v${item.version}` },
  ],
  meals: [{ label: 'الإصدار', value: (item) => `v${item.version}` }],
  'meal-sections': [
    {
      label: 'الوجبات المنشورة',
      value: (item) => `${item.published_meal_count ?? 0} وجبة`,
    },
  ],
  'food-sections': [
    {
      label: 'عدد البدائل',
      value: (item) => `${item.member_count ?? 0} أطعمة`,
    },
    { label: 'الإصدار', value: (item) => `v${item.version}` },
  ],
  foods: [
    {
      label: 'السعرات',
      value: (item) =>
        item.content?.energyKcal100g != null
          ? `${item.content.energyKcal100g} سعرة / 100جم`
          : '—',
    },
    {
      label: 'البروتين',
      value: (item) =>
        item.content?.proteinG100g != null
          ? `${item.content.proteinG100g} جم`
          : '—',
    },
    { label: 'الإصدار', value: (item) => `v${item.version}` },
  ],
  ingredients: [
    {
      label: 'التوثيق',
      value: (item) =>
        item.verification_status === 'VERIFIED' ? 'موثّق' : 'غير موثّق',
    },
    {
      label: 'مسببات الحساسية',
      value: (item) => item.allergen_codes?.join('، ') || 'لا يوجد',
    },
  ],
};

const studioOnlySections = new Set([
  'analytics',
  'users',
  'matching',
  'support',
]);

function formatTodayCairo() {
  return new Intl.DateTimeFormat('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Cairo',
  }).format(new Date());
}

function parseRouteString(raw) {
  const clean = String(raw || '')
    .replace(/^\/+|\/+$/g, '')
    .trim();
  if (!clean) return { section: 'analytics' };
  const [sectionKey, target] = clean.split('/');
  if (!sections.some((entry) => entry.key === sectionKey)) {
    return { section: 'analytics' };
  }
  if (!target || studioOnlySections.has(sectionKey)) {
    return { section: sectionKey };
  }
  if (target === 'new') return { section: sectionKey, new: true };
  try {
    return { section: sectionKey, id: decodeURIComponent(target) };
  } catch {
    return { section: sectionKey };
  }
}

function buildRoutePath(next) {
  let path = `/${next.section}`;
  if (!studioOnlySections.has(next.section)) {
    if (next.new) path += '/new';
    else if (next.id) path += `/${encodeURIComponent(next.id)}`;
  }
  return path;
}

function readRouteFromLocation() {
  const pathRaw = window.location.pathname.replace(/^\/+|\/+$/g, '').trim();
  if (pathRaw) return parseRouteString(pathRaw);
  const hashRaw = window.location.hash.replace(/^#\/?/, '').trim();
  if (hashRaw) return parseRouteString(hashRaw);
  return { section: 'analytics' };
}

function writeRouteToHistory(next, { replace = false } = {}) {
  const target = buildRoutePath(next);
  const current = `${window.location.pathname}${window.location.hash}`;
  if (current === target) return;
  if (replace) {
    window.history.replaceState(null, '', target);
  } else {
    window.history.pushState(null, '', target);
  }
}

function clearRoutePath() {
  if (window.location.pathname !== '/' || window.location.hash) {
    window.history.replaceState(null, '', '/');
  }
}

const THEME_STORAGE_KEY = 'motion.admin.theme.v2';

function normalizeTheme(value) {
  if (value === 'dark' || value === 'lime' || value === 'classic') return value;
  return 'lime';
}

function readInitialTheme() {
  try {
    return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'lime';
  }
}

function applyTheme(theme) {
  const safe = normalizeTheme(theme);
  if (safe === 'classic') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = safe;
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      'content',
      safe === 'dark' ? '#0f1019' : safe === 'lime' ? '#f6f8f7' : '#008657',
    );
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, safe);
  } catch {
    // Ignore storage failures in restricted browser modes.
  }
}

function App() {
  const [theme, setTheme] = useState(() => readInitialTheme());
  const [session, setSession] = useState(null);
  const [restoring, setRestoring] = useState(() => hasStoredSession());
  const [route, setRoute] = useState(() => readRouteFromLocation());
  const [signedOut, setSignedOut] = useState('');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [compactNavigation, setCompactNavigation] = useState(
    () => window.matchMedia('(max-width: 960px)').matches,
  );
  const dirty = useRef(false);
  const routeRef = useRef(route);
  const [routeFocus, setRouteFocus] = useState(0);
  const mainRef = useRef(null);
  const sidebarRef = useRef(null);
  const logoutTriggerRef = useRef(null);
  const menuTriggerRef = useRef(null);
  const { status: rtStatus, revisions } = useAdminRealtime(session);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  const setDirty = useCallback((value) => {
    dirty.current = value;
  }, []);

  const handleExpired = useCallback(() => {
    setDirty(false);
    setSession(null);
    setRoute({ section: 'analytics' });
    setMobileOpen(false);
    setLogoutOpen(false);
    clearRoutePath();
    setSignedOut('انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.');
  }, [setDirty]);

  const selectTheme = useCallback((nextTheme) => {
    setTheme(normalizeTheme(nextTheme));
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    function syncTheme(event) {
      if (event.key !== THEME_STORAGE_KEY) return;
      setTheme(normalizeTheme(event.newValue));
    }
    window.addEventListener('storage', syncTheme);
    return () => window.removeEventListener('storage', syncTheme);
  }, []);

  useEffect(() => {
    if (!hasStoredSession()) {
      clearRoutePath();
      setRestoring(false);
      return;
    }
    let alive = true;
    restoreSession(handleExpired)
      .then((active) => {
        if (!alive) return;
        if (active) {
          setSession(active);
          writeRouteToHistory(routeRef.current, { replace: true });
        } else {
          clearRoutePath();
        }
      })
      .finally(() => {
        if (alive) setRestoring(false);
      });
    return () => {
      alive = false;
    };
  }, [handleExpired]);

  useEffect(() => {
    if (!session) return;
    function onPopState() {
      if (
        dirty.current &&
        !window.confirm('هل تريد المغادرة بدون حفظ التعديلات؟')
      ) {
        writeRouteToHistory(routeRef.current);
        return;
      }
      const next = readRouteFromLocation();
      setNotice('');
      setMobileOpen(false);
      setRoute(next);
      writeRouteToHistory(next, { replace: true });
      window.scrollTo(0, 0);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [session]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 960px)');
    const update = () => {
      setCompactNavigation(media.matches);
      setMobileOpen(false);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebarRef.current?.querySelector('button:not([disabled])')?.focus();
    const onEscape = (event) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onEscape);
      previous?.focus?.();
    };
  }, [mobileOpen]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    function preventDataLoss(event) {
      if (!dirty.current) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', preventDataLoss);
    return () => window.removeEventListener('beforeunload', preventDataLoss);
  }, []);

  useEffect(() => {
    if (routeFocus > 0) mainRef.current?.focus();
  }, [routeFocus]);

  useEffect(() => {
    const activeSection = sections.find((entry) => entry.key === route.section);
    document.title = session
      ? `Motion - الإدارة - ${activeSection?.label || 'لوحة التحكم'}`
      : 'Motion - الإدارة - تسجيل الدخول';
  }, [route.section, session]);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      void document.documentElement
        .requestFullscreen?.()
        .catch(() => undefined);
    } else {
      void document.exitFullscreen?.().catch(() => undefined);
    }
  }

  function canLeave() {
    return (
      !dirty.current || window.confirm('هل تريد المغادرة بدون حفظ التعديلات؟')
    );
  }

  function navigate(next, message) {
    if (
      next.section === route.section &&
      next.id === route.id &&
      next.new === route.new
    ) {
      setMobileOpen(false);
      return;
    }
    if (!canLeave()) return;
    setNotice(message || '');
    setRoute(next);
    setMobileOpen(false);
    writeRouteToHistory(next);
    setRouteFocus((value) => value + 1);
    window.scrollTo(0, 0);
  }

  async function confirmLogOut() {
    await session.signOut();
    setDirty(false);
    setSession(null);
    setRoute({ section: 'analytics' });
    clearRoutePath();
    setNotice('');
    setSignedOut('تم تسجيل الخروج بنجاح.');
  }

  function forceLocalLogOut() {
    window.localStorage.removeItem('motion.admin.session.v1');
    setDirty(false);
    setSession(null);
    setRoute({ section: 'analytics' });
    clearRoutePath();
    setNotice('');
    setSignedOut('تم إنهاء الجلسة محلياً من هذا المتصفح.');
  }

  if (restoring)
    return (
      <main className="session-restore" role="status" aria-live="polite">
        <div className="session-restore-card">
          <Brand />
          <span className="spinner" aria-hidden="true" />
          <p>جارٍ استعادة الجلسة…</p>
        </div>
      </main>
    );

  if (!session)
    return (
      <SignIn
        notice={signedOut}
        onSignIn={(active) => {
          setSignedOut('');
          setSession(active);
          writeRouteToHistory(route, { replace: true });
        }}
        onExpired={handleExpired}
      />
    );

  const section =
    sections.find((entry) => entry.key === route.section) || sections[0];
  const navigatingEditor = route.id || route.new;
  const onBack = (message) => navigate({ section: section.key }, message);

  return (
    <div
      className="app-shell"
      data-sidebar-collapsed={collapsed}
      data-fullscreen={fullscreen || undefined}
    >
      <a className="skip-link" href="#main" inert={mobileOpen ? '' : undefined}>
        تخطّي إلى المحتوى الرئيسي
      </a>

      <div className="mobile-top" inert={mobileOpen ? '' : undefined}>
        <Brand />
        <button
          ref={menuTriggerRef}
          type="button"
          className="icon-button"
          aria-label="فتح القائمة"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <Menu size={20} />
        </button>
      </div>

      <Presence>
        {mobileOpen && (
          <button
            type="button"
            className="nav-backdrop"
            aria-label="إغلاق القائمة"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </Presence>

      <SideNav
        sidebarRef={sidebarRef}
        sections={sections}
        section={section.key}
        onNavigate={navigate}
        session={session}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        mobileOpen={mobileOpen}
        compactNavigation={compactNavigation}
        onCloseMobile={() => setMobileOpen(false)}
        logoutTriggerRef={logoutTriggerRef}
        theme={theme}
        onSelectTheme={selectTheme}
        onRequestSignOut={() => {
          if (!canLeave()) return;
          setMobileOpen(false);
          setLogoutOpen(true);
        }}
      />

      {logoutOpen && (
        <LogoutConfirmation
          appName="بوابة إدارة Motion"
          confirm={confirmLogOut}
          forceLocal={forceLocalLogOut}
          closed={() => {
            setLogoutOpen(false);
            requestAnimationFrame(() => {
              (compactNavigation
                ? menuTriggerRef.current
                : logoutTriggerRef.current
              )?.focus();
            });
          }}
        />
      )}

      <main
        className="workspace"
        id="main"
        ref={mainRef}
        tabIndex="-1"
        inert={mobileOpen ? '' : undefined}
      >
        <header className="topbar">
          <div className="topbar-start">
            <button
              type="button"
              className="fullscreen-toggle"
              aria-label={fullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
              aria-pressed={fullscreen}
              title={
                fullscreen
                  ? 'إنهاء ملء الشاشة (Esc)'
                  : 'عرض الصفحة بارتفاع كامل'
              }
              onClick={toggleFullscreen}
            >
              {fullscreen ? (
                <Minimize2 size={15} aria-hidden="true" />
              ) : (
                <Maximize2 size={15} aria-hidden="true" />
              )}
            </button>
            <span>بوابة إدارة Motion</span>
            <span className="topbar-crumb" aria-hidden="true">
              /
            </span>
            <span className="topbar-crumb">{section.label}</span>
          </div>
          <div className="topbar-meta">
            <span
              className={
                'rt-pill ' +
                (rtStatus === 'connected'
                  ? 'is-connected'
                  : rtStatus === 'disconnected'
                    ? 'is-offline'
                    : 'is-reconnecting')
              }
              role="status"
            >
              <span className="rt-dot" aria-hidden="true" />
              {rtStatus === 'connected'
                ? 'متصل لحظياً'
                : rtStatus === 'disconnected'
                  ? 'غير متصل'
                  : 'جارٍ الاتصال…'}
            </span>
            <span>{formatTodayCairo()}</span>
          </div>
        </header>

        <div
          className="workspace-body"
          key={`${section.key}-${route.id || (route.new ? 'new' : 'list')}`}
          data-route={section.key}
        >
          <Notice text={notice} />
          <Suspense
            fallback={
              <div className="loading-list" role="status">
                <span className="spinner" /> جارٍ تحميل الصفحة…
              </div>
            }
          >
            {section.key === 'analytics' ? (
              <AnalyticsStudio
                api={session.api}
                onNavigate={navigate}
                realtimeTick={revisions.analytics || 0}
              />
            ) : section.key === 'users' ? (
              <UsersStudio
                api={session.api}
                realtimeTick={revisions.users || 0}
              />
            ) : section.key === 'matching' ? (
              <MatchingStudio
                api={session.api}
                realtimeTick={revisions.matching || 0}
              />
            ) : section.key === 'support' ? (
              <SupportStudio
                api={session.api}
                realtimeTick={revisions.support || 0}
              />
            ) : navigatingEditor ? (
              section.key === 'programs' ? (
                <ProgramEditor
                  id={route.id}
                  api={session.api}
                  onBack={onBack}
                  onDirty={setDirty}
                />
              ) : (
                <LibraryEditor
                  section={section}
                  id={route.id}
                  api={session.api}
                  onBack={onBack}
                  onDirty={setDirty}
                />
              )
            ) : (
              <LibraryPage
                section={section}
                api={session.api}
                realtimeTick={revisions[section.key] || 0}
                onOpen={(id) => navigate({ section: section.key, id })}
                onCreate={() => navigate({ section: section.key, new: true })}
              />
            )}
          </Suspense>
        </div>

        <footer className="main-footer">
          <span>Motion · بوابة الإدارة التشغيلية</span>
          <span dir="ltr">{session.email}</span>
        </footer>
      </main>
    </div>
  );
}

function SignIn({ onSignIn, onExpired, notice }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    const data = new FormData(event.currentTarget);
    setError(null);
    setSubmitting(true);
    try {
      onSignIn(
        await login(
          String(data.get('email') || '').trim(),
          String(data.get('password') || ''),
          onExpired,
        ),
      );
    } catch (reason) {
      setError(reason);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-layout">
      <header className="auth-header">
        <Brand />
      </header>
      <section className="auth-card">
        <div className="auth-form">
          <h1>أهلًا بعودتك</h1>
          <p className="auth-subtitle">
            سجّل دخولك لإدارة منصة Motion والبرامج التدريبية.
          </p>
          <Notice text={!error ? notice : ''} />
          <ErrorNotice error={error} />
          <form onSubmit={submit}>
            <fieldset disabled={submitting}>
              <div className="form-stack">
                <Field label="البريد الإلكتروني">
                  <input
                    type="email"
                    name="email"
                    dir="ltr"
                    placeholder="admin@motion.app"
                    autoComplete="username"
                    required
                  />
                </Field>
                <Field label="كلمة المرور">
                  <input
                    type="password"
                    name="password"
                    dir="ltr"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                </Field>
              </div>
              <button
                className="button primary auth-submit"
                type="submit"
                disabled={submitting}
              >
                <ButtonContent busy={submitting}>
                  <span>تسجيل الدخول</span>
                  <ArrowLeft size={18} aria-hidden="true" />
                </ButtonContent>
              </button>
            </fieldset>
          </form>
          <div className="auth-foot">وصول محصور بحساب مدير النظام المعتمد</div>
        </div>
      </section>
    </main>
  );
}

const LIBRARY_PAGE_SIZE = 10;

function LibraryPage({ section, api, realtimeTick = 0, onCreate, onOpen }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const loadedOnce = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    if (!loadedOnce.current) setLoading(true);
    else setFetching(true);
    setError(null);

    fetchPage(api, `/admin/${section.key}`, {
      limit: LIBRARY_PAGE_SIZE,
      offset: page * LIBRARY_PAGE_SIZE,
      search,
      status: filter,
      signal: controller.signal,
    })
      .then((res) => {
        if (controller.signal.aborted) return;
        const nextItems = (res.items || []).map((item) => ({
          ...item,
          title: item.title || item.content?.title || item.slug,
          status: item.archived ? 'ARCHIVED' : item.status || 'PUBLISHED',
        }));
        loadedOnce.current = true;
        setItems(nextItems);
        setTotal(typeof res.total === 'number' ? res.total : nextItems.length);
      })
      .catch((reason) => {
        if (controller.signal.aborted || reason?.name === 'AbortError') return;
        setError(reason);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
        setFetching(false);
      });

    return () => controller.abort();
  }, [section.key, api, page, search, filter, reload, realtimeTick]);

  const statusFilters =
    section.key === 'meal-sections' || section.key === 'ingredients'
      ? ['PUBLISHED', 'ARCHIVED']
      : ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>{section.label}</h1>
          <p>{section.intro}</p>
        </div>
        <button className="button primary" type="button" onClick={onCreate}>
          <Plus size={18} /> إضافة {section.singular}
        </button>
      </header>
      {section.key === 'programs' && (
        <section className="library-banner" aria-labelledby="library-title">
          <h2 id="library-title">مكتبة البرامج التدريبية</h2>
          <p>
            ابنِ برامج متكاملة بالتدريب والتغذية وانشرها ليتم مطابقتها تلقائياً
            مع المتدربين.
          </p>
        </section>
      )}
      <ContentList
        label={section.label}
        singular={section.singular}
        items={items}
        total={total}
        page={page}
        pageSize={LIBRARY_PAGE_SIZE}
        onPageChange={setPage}
        search={searchInput}
        onSearchChange={setSearchInput}
        filter={filter}
        onFilterChange={(nextFilter) => {
          setFilter(nextFilter);
          setPage(0);
        }}
        columns={columns[section.key]}
        isLoading={loading}
        isFetching={fetching}
        onCreate={onCreate}
        onOpen={onOpen}
        error={error}
        onRetry={() => {
          setError(null);
          setLoading(true);
          setReload((value) => value + 1);
        }}
        statusFilters={statusFilters}
      />
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
