import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Apple,
  ArrowRight,
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
import { SupportStudio } from './SupportStudio';
import { Brand, ContentList, ErrorNotice, Field, Notice, SideNav } from './ui';
import './styles.css';

const sections = [
  {
    key: 'analytics',
    label: 'Analytics & Health',
    singular: 'Report',
    Icon: Activity,
    intro:
      'Monitor Gemini API token usage, costs, server uptime, and live platform health.',
  },
  {
    key: 'analytics',
    label: 'Analytics & Health',
    singular: 'Report',
    Icon: Activity,
    intro:
      'Monitor Gemini API token usage, costs, server uptime, and live platform health.',
  },
  {
    key: 'programs',
    label: 'Programs',
    singular: 'Program',
    Icon: Layers3,
    intro: 'Build and publish training plans with paired nutrition schedules.',
  },
  {
    key: 'exercises',
    label: 'Exercises',
    singular: 'Exercise',
    Icon: Dumbbell,
    intro: 'Prepare shared exercises and instructions for training templates.',
  },
  {
    key: 'meals',
    label: 'Meals',
    singular: 'Meal',
    Icon: Utensils,
    intro: 'Build shared meals from food exchange groups and portions.',
  },
  {
    key: 'meal-sections',
    label: 'Meal Sections',
    singular: 'Meal Section',
    Icon: FolderKanban,
    intro: 'Organize interchangeable meal categories for full-meal swaps.',
  },
  {
    key: 'food-sections',
    label: 'Food Sections',
    singular: 'Food Section',
    Icon: Boxes,
    intro:
      'Manage food exchange groups and portion units for macro-balanced ingredient swaps.',
  },
  {
    key: 'foods',
    label: 'Foods',
    singular: 'Food',
    Icon: Apple,
    intro:
      'Manage USDA and verified food items, macros per 100g, and ingredient links.',
  },
  {
    key: 'ingredients',
    label: 'Ingredients',
    singular: 'Ingredient',
    Icon: Wheat,
    intro:
      'Manage verified ingredients and allergen tags used for safety filtering.',
  },
  {
    key: 'matching',
    label: 'AI Matching',
    singular: 'Ruleset',
    Icon: Sparkles,
    intro:
      'Configure remote Gemini matching rulesets and run synthetic profile simulations.',
  },
  {
    key: 'support',
    label: 'FAQ & Legal',
    singular: 'Document',
    Icon: HelpCircle,
    intro: 'Manage bilingual FAQ entries and Terms & Privacy versions.',
  },
];

const columns = {
  programs: [
    { label: 'Goal', value: (item) => item.primary_goal || '—' },
    {
      label: 'Training days',
      value: (item) => `${item.training_days_per_week} days / week`,
    },
    { label: 'Duration', value: (item) => `${item.month_count * 4} weeks` },
  ],
  exercises: [
    {
      label: 'Muscle groups',
      value: (item) => item.content?.muscleGroups?.join(', ') || '—',
    },
    { label: 'Version', value: (item) => item.version },
  ],
  meals: [{ label: 'Version', value: (item) => item.version }],
  'meal-sections': [
    {
      label: 'Published meals',
      value: (item) => `${item.published_meal_count ?? 0} meals`,
    },
  ],
  'food-sections': [
    {
      label: 'Alternatives',
      value: (item) => `${item.member_count ?? 0} foods`,
    },
    { label: 'Version', value: (item) => item.version },
  ],
  foods: [
    {
      label: 'Energy',
      value: (item) =>
        item.content?.energyKcal100g != null
          ? `${item.content.energyKcal100g} kcal/100g`
          : '—',
    },
    {
      label: 'Protein',
      value: (item) =>
        item.content?.proteinG100g != null
          ? `${item.content.proteinG100g}g`
          : '—',
    },
    { label: 'Version', value: (item) => item.version },
  ],
  ingredients: [
    {
      label: 'Verification',
      value: (item) => item.verification_status || '—',
    },
    {
      label: 'Allergens',
      value: (item) => item.allergen_codes?.join(', ') || 'None',
    },
  ],
};

function App() {
  const [session, setSession] = useState(null);
  const [route, setRoute] = useState({ section: 'programs' });
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
      !dirty.current || window.confirm('Leave without saving your changes?')
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
      setSignedOut('Signed out.');
    } catch {
      setSignedOut(
        'Signed out of this tab. Motion could not confirm that the server session was revoked.',
      );
    } finally {
      setDirty(false);
      setSession(null);
      setRoute({ section: 'programs' });
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
          setRoute({ section: 'programs' });
          setSignedOut('Your session expired. Sign in again.');
        }}
      />
    );

  const section = sections.find((entry) => entry.key === route.section);
  const navigatingEditor = route.id || route.new;
  const onBack = (message) => navigate({ section: section.key }, message);

  return (
    <div className="workspace">
      <a className="skip-link" href="#main">
        Skip to content
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
        <div className="breadcrumb" aria-label="Breadcrumb">
          <span>Content</span> <span aria-hidden="true">/</span>{' '}
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
        <Brand />
        <div className="signin-content">
          <h1>Sign in to Motion Studio</h1>
          <p>
            Use your verified administrator account to manage shared content.
          </p>
          <Notice text={!error ? notice : ''} />
          <ErrorNotice error={error} />
          <form onSubmit={submit}>
            <Field label="Email">
              <input
                type="email"
                name="email"
                autoComplete="username"
                required
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <button
              className="button primary"
              type="submit"
              disabled={submitting}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
              <ArrowRight size={19} />
            </button>
          </form>
        </div>
      </section>
      <div className="signin-image" aria-hidden="true" />
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
          <Plus size={21} /> New {section.singular.toLowerCase()}
        </button>
      </header>
      {section.key === 'programs' && (
        <section className="library-banner" aria-labelledby="library-title">
          <h2 id="library-title">The program library</h2>
          <p>Manage your training and nutrition templates.</p>
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
