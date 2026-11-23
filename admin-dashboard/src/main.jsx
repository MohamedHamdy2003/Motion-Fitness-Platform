import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import './tokens.css';
import './styles.css';

import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  Utensils,
  Wheat,
} from 'lucide-react';
import { hasStoredSession, listAll, login, restoreSession } from './api';
import { AnalyticsStudio } from './AnalyticsStudio';
import { LibraryEditor } from './LibraryEditor';
import { LogoutConfirmation } from './LogoutConfirmation';
import { MatchingStudio } from './MatchingStudio';
import { Presence } from './presence';
import { ProgramEditor } from './ProgramEditor';
import { readableCode } from './program';
import { SupportStudio } from './SupportStudio';
import {
  Brand,
  ButtonContent,
  ContentList,
  ErrorNotice,
  Field,
  Notice,
  SideNav,
} from './ui';

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

const studioOnlySections = new Set(['analytics', 'matching', 'support']);

function formatTodayCairo() {
  return new Intl.DateTimeFormat('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Cairo',
  }).format(new Date());
}

function readRouteFromHash() {
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  if (!raw) return { section: 'analytics' };
  const [sectionKey, target] = raw.split('/');
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

function writeRouteToHash(next) {
  let hash = `#${next.section}`;
  if (!studioOnlySections.has(next.section)) {
    if (next.new) hash += '/new';
    else if (next.id) hash += `/${encodeURIComponent(next.id)}`;
  }
  window.history.replaceState(null, '', hash);
}

function clearRouteHash() {
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}`,
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [restoring, setRestoring] = useState(() => hasStoredSession());
  const [route, setRoute] = useState(() => readRouteFromHash());
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
  const [routeFocus, setRouteFocus] = useState(0);
  const mainRef = useRef(null);
  const sidebarRef = useRef(null);
  const logoutTriggerRef = useRef(null);
  const menuTriggerRef = useRef(null);

  const setDirty = useCallback((value) => {
    dirty.current = value;
  }, []);

  const handleExpired = useCallback(() => {
    setDirty(false);
    setSession(null);
    setRoute({ section: 'analytics' });
    setMobileOpen(false);
    setLogoutOpen(false);
    clearRouteHash();
    setSignedOut('انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.');
  }, [setDirty]);

  useEffect(() => {
    if (!hasStoredSession()) {
      setRestoring(false);
      return;
    }
    let alive = true;
    restoreSession(handleExpired)
      .then((active) => {
        if (!alive) return;
        if (active) setSession(active);
      })
      .finally(() => {
        if (alive) setRestoring(false);
      });
    return () => {
      alive = false;
    };
  }, [handleExpired]);

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
    writeRouteToHash(next);
    setRouteFocus((value) => value + 1);
    window.scrollTo(0, 0);
  }

  async function confirmLogOut() {
    await session.signOut();
    setDirty(false);
    setSession(null);
    setRoute({ section: 'analytics' });
    clearRouteHash();
    setNotice('');
    setSignedOut('تم تسجيل الخروج بنجاح.');
  }

  function forceLocalLogOut() {
    window.localStorage.removeItem('motion.admin.session.v1');
    setDirty(false);
    setSession(null);
    setRoute({ section: 'analytics' });
    clearRouteHash();
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
          writeRouteToHash(route);
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
            <span className="rt-pill is-connected">
              <span className="rt-dot" aria-hidden="true" />
              متصل بالخادم
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
          {section.key === 'analytics' ? (
            <AnalyticsStudio api={session.api} onNavigate={navigate} />
          ) : section.key === 'matching' ? (
            <MatchingStudio api={session.api} />
          ) : section.key === 'support' ? (
            <SupportStudio api={session.api} />
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
              onOpen={(id) => navigate({ section: section.key, id })}
              onCreate={() => navigate({ section: section.key, new: true })}
            />
          )}
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
      <section className="auth-main">
        <div className="auth-form">
          <div className="auth-mobile-brand">
            <Brand />
          </div>
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
          <div className="auth-foot">
            Motion Platform · وصول محصور بحساب مدير النظام المعتمد
          </div>
        </div>
      </section>

      <aside className="auth-brand" aria-hidden="true">
        <div className="auth-brand-logo">
          <Brand />
        </div>
        <h2>مساحة هادئة ليومٍ حافل.</h2>
        <p>
          من إدارة البرامج التدريبية والخطط الغذائية حتى متابعة أداء الذكاء
          الاصطناعي والخادم.
        </p>
        <svg
          className="auth-artwork"
          viewBox="0 0 460 320"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="150"
            cy="270"
            r="175"
            stroke="#ff9b58"
            strokeWidth="1.5"
            strokeOpacity="0.65"
          />
          <circle
            cx="180"
            cy="295"
            r="138"
            stroke="#d4ffea"
            strokeWidth="1.2"
            strokeOpacity="0.45"
          />
          <path
            d="M35 320C55 245 105 188 188 148C145 208 118 265 98 320H35Z"
            fill="url(#leafGlow)"
            fillOpacity="0.28"
          />
          <path
            d="M115 320C142 238 198 175 288 128C236 196 206 258 186 320H115Z"
            fill="url(#leafGlow)"
            fillOpacity="0.18"
          />
          <path
            d="M12 248C66 202 126 170 206 154"
            stroke="#d4ffea"
            strokeWidth="1.4"
            strokeOpacity="0.5"
            strokeLinecap="round"
          />
          <path
            d="M72 308C124 242 184 198 274 166"
            stroke="#d4ffea"
            strokeWidth="1.2"
            strokeOpacity="0.38"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient
              id="leafGlow"
              x1="40"
              y1="128"
              x2="260"
              y2="320"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#d4ffea" />
              <stop offset="1" stopColor="#005d40" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </aside>
    </main>
  );
}

function LibraryPage({ section, api, onCreate, onOpen }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    listAll(api, `/admin/${section.key}`)
      .then((results) => {
        if (alive)
          setItems(
            results.map((item) => ({
              ...item,
              title: item.title || item.content?.title || item.slug,
              status: item.archived ? 'ARCHIVED' : item.status || 'PUBLISHED',
            })),
          );
      })
      .catch((reason) => {
        if (alive) setError(reason);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [section.key, api, reload]);

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
        columns={columns[section.key]}
        isLoading={loading}
        onCreate={onCreate}
        onOpen={onOpen}
        error={error}
        onRetry={() => {
          setError(null);
          setLoading(true);
          setReload(reload + 1);
        }}
        statusFilters={
          section.key === 'programs'
            ? ['DRAFT', 'PUBLISHED']
            : ['DRAFT', 'PUBLISHED', 'ARCHIVED']
        }
      />
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
