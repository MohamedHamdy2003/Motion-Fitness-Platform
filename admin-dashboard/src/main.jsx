import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Apple,
  ArrowLeft,
  Boxes,
  Dumbbell,
  FolderKanban,
  HelpCircle,
  Layers3,
  Plus,
  Sparkles,
  Utensils,
  Wheat,
} from 'lucide-react';
import { listAll, login } from './api';
import { AnalyticsStudio } from './AnalyticsStudio';
import { LibraryEditor } from './LibraryEditor';
import { MatchingStudio } from './MatchingStudio';
import { ProgramEditor } from './ProgramEditor';
import { readableCode } from './program';
import { SupportStudio } from './SupportStudio';
import { Brand, ContentList, ErrorNotice, Field, Notice, SideNav } from './ui';
import './styles.css';

const sections = [
  {
    key: 'analytics',
    label: 'التحليلات وصحة النظام',
    singular: 'تقرير',
    Icon: Activity,
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

function App() {
  const [session, setSession] = useState(null);
  const [route, setRoute] = useState({ section: 'analytics' });
  const [signedOut, setSignedOut] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [notice, setNotice] = useState('');
  const dirty = useRef(false);
  const [routeFocus, setRouteFocus] = useState(0);
  const main = useRef(null);
  const setDirty = useCallback((value) => {
    dirty.current = value;
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
    if (routeFocus > 0) main.current?.focus();
  }, [routeFocus]);

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
    )
      return;
    if (!canLeave()) return;
    setNotice(message || '');
    setRoute(next);
    setRouteFocus((value) => value + 1);
    window.scrollTo(0, 0);
  }

  async function logOut() {
    if (!canLeave()) return;
    setSigningOut(true);
    try {
      await session.signOut();
      setSignedOut('تم تسجيل الخروج بنجاح.');
    } catch {
      setSignedOut(
        'تم تسجيل الخروج من هذا المتصفح، تعذر تأكيد إلغاء الجلسة من الخادم.',
      );
    } finally {
      setDirty(false);
      setSession(null);
      setRoute({ section: 'analytics' });
      setNotice('');
      setSigningOut(false);
    }
  }

  if (!session)
    return (
      <SignIn
        notice={signedOut}
        onSignIn={(active) => setSession(active)}
        onExpired={() => {
          setDirty(false);
          setSession(null);
          setRoute({ section: 'analytics' });
          setSignedOut('انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.');
        }}
      />
    );

  const section = sections.find((entry) => entry.key === route.section);
  const navigatingEditor = route.id || route.new;
  const onBack = (message) => navigate({ section: section.key }, message);

  return (
    <div className="workspace">
      <a className="skip-link" href="#main">
        تخطّي إلى المحتوى الرئيسي
      </a>
      <SideNav
        sections={sections}
        section={section.key}
        onNavigate={navigate}
        session={session}
        onSignOut={logOut}
        signingOut={signingOut}
      />
      <main className="main-content" id="main" ref={main} tabIndex="-1">
        <div className="breadcrumb" aria-label="مسار التنقل">
          <span>بوابة إدارة Motion</span>
          <span aria-hidden="true">/</span>
          <strong>{section.label}</strong>
        </div>
        <div
          className="animate-pane"
          key={`${section.key}-${route.id || (route.new ? 'new' : 'list')}`}
        >
          <Notice text={notice} />
          {section.key === 'analytics' ? (
            <AnalyticsStudio api={session.api} />
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
      onSignIn(await login(data.get('email'), data.get('password'), onExpired));
    } catch (reason) {
      setError(reason);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="signin-page">
      <section className="signin-panel">
        <div className="signin-header">
          <Brand />
        </div>
        <div className="signin-content">
          <span className="eyebrow">لوحة التحكم التشغيلية</span>
          <h1>تسجيل الدخول إلى إدارة Motion</h1>
          <p>
            استخدم حساب المدير المعتمد لإدارة البرامج التدريبية، مكتبة التغذية،
            قواعد المطابقة، ومتابعة أداء الخادم.
          </p>
          <Notice text={!error ? notice : ''} />
          <ErrorNotice error={error} />
          <form onSubmit={submit}>
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
                autoComplete="current-password"
                required
              />
            </Field>
            <button
              className="button primary signin-submit"
              type="submit"
              disabled={submitting}
            >
              <span>{submitting ? 'جارٍ التحقق…' : 'دخول إلى البوابة'}</span>
              <ArrowLeft size={18} />
            </button>
          </form>
        </div>
        <div className="signin-foot">
          <small>Motion Platform · وصول محصور بمدير النظام</small>
        </div>
      </section>
      <div className="signin-image" aria-hidden="true">
        <div className="signin-caption">
          <span>نظام تشغيل متكامل</span>
          <strong>
            إدارة دقيقة للبرامج التدريبية والخطط الغذائية ومؤشرات الأداء من مكان
            واحد.
          </strong>
        </div>
      </div>
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
          <Plus size={19} /> إضافة {section.singular}
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
