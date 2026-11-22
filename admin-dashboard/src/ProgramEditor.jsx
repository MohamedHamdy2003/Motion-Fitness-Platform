import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { listAll } from './api';
import {
  emptyExercise,
  emptyMealSlot,
  emptyMonth,
  emptyProgram,
  emptyWorkout,
  fromProgram,
  slugify,
  splitList,
  validateProgram,
} from './program';
import { ConfirmDialog, ErrorNotice, Field, Notice, Status } from './ui';

async function choices(api, path, getTitle) {
  const items = (await listAll(api, path)).filter((item) => !item.archived);
  return items.map((item) => ({
    value: item.version_id,
    label: getTitle(item),
    status: item.status,
  }));
}

export function ProgramEditor({ id, api, onBack, onDirty }) {
  const [loaded, setLoaded] = useState(null);
  const [form, setForm] = useState(emptyProgram);
  const [initial, setInitial] = useState('');
  const [options, setOptions] = useState(null);
  const [tab, setTab] = useState('details');
  const [location, setLocation] = useState({ month: 0, week: 0, day: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [verify, setVerify] = useState(null);
  const [reload, setReload] = useState(0);
  const dirty = Boolean(options && JSON.stringify(form) !== initial);

  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  useEffect(() => {
    let alive = true;
    Promise.all([
      id ? api(`/admin/programs/${id}`) : null,
      api('/references/primary-goals'),
      api('/references/fitness-levels'),
      choices(
        api,
        '/admin/exercises',
        (item) => item.content?.title || item.slug,
      ),
      choices(api, '/admin/meals', (item) => item.title || item.slug),
    ])
      .then(([data, goals, levels, exercises, meals]) => {
        if (!alive) return;
        const draft = data ? fromProgram(data) : emptyProgram();
        setLoaded(data);
        setForm(draft);
        setInitial(JSON.stringify(draft));
        setOptions({
          goals: goals.items,
          levels: levels.items,
          exercises,
          meals,
        });
      })
      .catch((reason) => {
        if (alive) setLoadError(reason);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [api, id, reload]);

  function update(change) {
    setForm((current) => {
      const copy = structuredClone(current);
      change(copy);
      return copy;
    });
    setError(null);
    setSuccess('');
  }

  async function perform(action) {
    setVerify(null);
    setError(null);
    setSuccess('');
    if (action === 'save') {
      const invalid = validateProgram(form);
      if (invalid) {
        setError(new Error(invalid.message));
        setTab(invalid.tab);
        if (invalid.tab === 'schedule') {
          setLocation({
            month: invalid.month ?? 0,
            week: invalid.week ?? 0,
            day: invalid.day ?? 0,
          });
        }
        return;
      }
    }
    setSaving(true);
    try {
      if (action === 'archive') {
        await api(`/admin/programs/${loaded.id}`, { method: 'DELETE' });
        onDirty(false);
        onBack('Program archived.');
        return;
      }
      const { slug, ...body } = form;
      const data =
        action === 'publish'
          ? await api(`/admin/programs/${loaded.id}/publish`, {
              method: 'POST',
              body: {},
            })
          : loaded
            ? await api(`/admin/programs/${loaded.id}`, {
                method: 'PATCH',
                body,
              })
            : await api('/admin/programs', {
                method: 'POST',
                body: { ...body, slug },
              });
      const next = fromProgram(data);
      setLoaded(data);
      setForm(next);
      setInitial(JSON.stringify(next));
      setSuccess(action === 'publish' ? 'Program published.' : 'Draft saved.');
    } catch (reason) {
      setError(reason);
    } finally {
      setSaving(false);
    }
  }

  async function refreshProgram(noticeText) {
    if (!loaded?.id) return;
    const data = await api(`/admin/programs/${loaded.id}`);
    setLoaded(data);
    setSuccess(noticeText);
  }

  if (loading)
    return (
      <div className="loading-list" role="status">
        <span className="spinner" /> Loading program editor…
      </div>
    );
  if (loadError)
    return (
      <ErrorNotice
        error={loadError}
        onRetry={() => {
          setLoadError(null);
          setLoading(true);
          setReload(reload + 1);
        }}
      />
    );

  return (
    <>
      <button type="button" className="back-link" onClick={() => onBack()}>
        <ArrowLeft size={17} /> Programs
      </button>
      <header className="page-heading editor-heading">
        <div>
          <h1>{loaded ? form.title || loaded.title : 'New program'}</h1>
          <p>
            {loaded ? (
              <>
                <Status value={loaded.archived ? 'ARCHIVED' : loaded.status} />{' '}
                <span className="version">Version {loaded.version}</span>
              </>
            ) : (
              'Set the details and schedule for a new training and nutrition template.'
            )}
          </p>
        </div>
        <div className="actions">
          {loaded && !loaded.archived && (
            <button
              className="button secondary"
              type="button"
              disabled={saving}
              onClick={() => setVerify('archive')}
            >
              Archive
            </button>
          )}
          {!loaded?.archived && (
            <button
              className={`button ${loaded?.status === 'DRAFT' && !dirty ? 'secondary' : 'primary'}`}
              type="button"
              disabled={saving || Boolean(loaded && !dirty)}
              onClick={() => perform('save')}
            >
              {saving ? 'Working…' : 'Save draft'}
            </button>
          )}
          {loaded?.status === 'DRAFT' && !loaded.archived && (
            <button
              className="button primary"
              type="button"
              disabled={saving || dirty}
              onClick={() => setVerify('publish')}
            >
              Publish
            </button>
          )}
        </div>
      </header>
      <ErrorNotice error={error} />
      <Notice text={success} />
      {loaded?.status === 'PUBLISHED' && !loaded.archived && (
        <p className="inline-help">
          Saving changes creates a new draft version. The published version
          stays available.
        </p>
      )}
      {dirty && loaded?.status === 'DRAFT' && (
        <p className="inline-help">Save changes before publishing.</p>
      )}
      <section className="editor-panel">
        <div
          className="filter-tabs editor-tabs"
          role="group"
          aria-label="Program editor sections"
        >
          <button
            type="button"
            aria-pressed={tab === 'details'}
            onClick={() => setTab('details')}
          >
            Details
          </button>
          <button
            type="button"
            aria-pressed={tab === 'schedule'}
            onClick={() => setTab('schedule')}
          >
            Schedule
          </button>
          {loaded && (
            <button
              type="button"
              aria-pressed={tab === 'hints'}
              onClick={() => setTab('hints')}
            >
              AI Matching Hints
            </button>
          )}
        </div>
        <fieldset
          className="unframed"
          disabled={saving || loaded?.archived}
          key={tab}
        >
          {tab === 'details' ? (
            <ProgramDetails
              form={form}
              update={update}
              options={options}
              slugLocked={Boolean(loaded)}
            />
          ) : tab === 'schedule' ? (
            <Schedule
              form={form}
              update={update}
              options={options}
              location={location}
              setLocation={setLocation}
            />
          ) : (
            <ProgramHints
              loaded={loaded}
              api={api}
              onUpdated={refreshProgram}
              onError={setError}
            />
          )}
        </fieldset>
      </section>
      {verify && (
        <ConfirmDialog
          title={
            verify === 'archive'
              ? 'Archive this program?'
              : 'Publish this program?'
          }
          destructive={verify === 'archive'}
          action={verify === 'archive' ? 'Archive program' : 'Publish program'}
          onCancel={() => setVerify(null)}
          onConfirm={() => perform(verify)}
        >
          {verify === 'archive'
            ? 'The program will be removed from the active library. Existing versions remain in the database.'
            : 'This version will be available for future matching once the API validates its exercises and nutrition schedule.'}
        </ConfirmDialog>
      )}
    </>
  );
}

function ProgramHints({ loaded, api, onUpdated, onError }) {
  const [originalText, setOriginalText] = useState('');
  const [notesText, setNotesText] = useState('');
  const [summaryText, setSummaryText] = useState('');
  const [busy, setBusy] = useState(false);
  const isDraft = loaded.status === 'DRAFT' && !loaded.archived;

  async function rewriteWithAi() {
    if (!originalText.trim()) return;
    setBusy(true);
    onError(null);
    try {
      const preview = await api(`/admin/programs/${loaded.id}/hints/rewrite`, {
        method: 'POST',
        body: { originalText },
      });
      setSummaryText(preview.structuredHints.summary || '');
      setNotesText((preview.structuredHints.suitabilityNotes || []).join('\n'));
    } catch (reason) {
      onError(reason);
    } finally {
      setBusy(false);
    }
  }

  async function saveHintDraft() {
    if (!originalText.trim()) return;
    setBusy(true);
    onError(null);
    try {
      const suitabilityNotes = notesText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      await api(`/admin/programs/${loaded.id}/hints`, {
        method: 'POST',
        body: {
          originalText,
          structuredHints: {
            ...(summaryText.trim() ? { summary: summaryText.trim() } : {}),
            suitabilityNotes: suitabilityNotes.length
              ? suitabilityNotes
              : [originalText.trim()],
          },
        },
      });
      setOriginalText('');
      setSummaryText('');
      setNotesText('');
      await onUpdated(
        'Program hint draft saved. Approve the latest hint before publishing.',
      );
    } catch (reason) {
      onError(reason);
    } finally {
      setBusy(false);
    }
  }

  async function approveHint(hintId) {
    setBusy(true);
    onError(null);
    try {
      await api(`/admin/programs/${loaded.id}/hints/${hintId}/approve`, {
        method: 'POST',
        body: {},
      });
      await onUpdated('Program hint approved for AI matching.');
    } catch (reason) {
      onError(reason);
    } finally {
      setBusy(false);
    }
  }

  const hints = loaded.hints || [];
  const latestVersion = hints.reduce((max, h) => Math.max(max, h.version), 0);

  return (
    <div className="editor-body">
      <div className="section-heading">
        <div>
          <h2>AI Matching Hints</h2>
          <p>
            Approved structured hints help the Gemini matcher compare eligible
            programs for a user profile.
          </p>
        </div>
      </div>
      {hints.length > 0 ? (
        <div className="candidate-cards">
          {hints.map((h) => (
            <div key={h.id} className="exercise-row">
              <div className="section-heading">
                <strong>Hint v{h.version}</strong>
                <div className="actions">
                  <Status
                    value={h.status === 'APPROVED' ? 'PUBLISHED' : 'DRAFT'}
                  />
                  {isDraft &&
                    h.status === 'DRAFT' &&
                    h.version === latestVersion && (
                      <button
                        type="button"
                        className="button primary compact"
                        disabled={busy}
                        onClick={() => approveHint(h.id)}
                      >
                        <CheckCircle2 size={15} /> Approve hint
                      </button>
                    )}
                </div>
              </div>
              <p className="inline-help">{h.original_text}</p>
              <pre className="code-preview">
                {JSON.stringify(h.structured_hints, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      ) : (
        <p className="inline-help">
          No hints added to this program version yet.
        </p>
      )}

      {isDraft && (
        <div className="schedule-section field-grid">
          <Field label="Editorial guidance text" full>
            <textarea
              rows="3"
              value={originalText}
              onChange={(e) => setOriginalText(e.target.value)}
              placeholder="Describe who this program fits best (e.g., low-impact fat loss for beginners with dumbbells)…"
            />
          </Field>
          <Field label="Structured summary">
            <input
              value={summaryText}
              onChange={(e) => setSummaryText(e.target.value)}
              placeholder="Concise suitability summary"
            />
          </Field>
          <Field label="Suitability notes (one per line)">
            <textarea
              rows="3"
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder="Low-impact lower body&#10;Balanced recovery"
            />
          </Field>
          <div className="full actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy || !originalText.trim()}
              onClick={rewriteWithAi}
            >
              <Sparkles size={16} /> Extract with AI
            </button>
            <button
              type="button"
              className="button primary"
              disabled={busy || !originalText.trim()}
              onClick={saveHintDraft}
            >
              <Plus size={16} /> Save hint draft
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProgramDetails({ form, update, options, slugLocked }) {
  function change(event) {
    const { name, value } = event.target;
    update((copy) => {
      if (
        name === 'title' &&
        !slugLocked &&
        (!copy.slug || copy.slug === slugify(copy.title))
      )
        copy.slug = slugify(value);
      copy[name] =
        name === 'requiredEquipment'
          ? splitList(value)
          : name === 'intendedAudience'
            ? value || null
            : name === 'trainingDaysPerWeek' || name === 'editorialPriority'
              ? Number(value)
              : value;
      if (
        name === 'primaryGoal' &&
        value &&
        !copy.supportedGoals.includes(value)
      )
        copy.supportedGoals.push(value);
      if (
        name === 'idealLevel' &&
        value &&
        !copy.supportedLevels.includes(value)
      )
        copy.supportedLevels.push(value);
    });
  }

  function toggle(key, code, checked) {
    update((copy) => {
      copy[key] = checked
        ? [...new Set([...copy[key], code])]
        : copy[key].filter((item) => item !== code);
    });
  }

  return (
    <div className="editor-body field-grid">
      <Field label="Program name">
        <input
          name="title"
          maxLength="160"
          value={form.title}
          onChange={change}
        />
      </Field>
      <Field label="Slug" hint="Use lowercase letters, numbers and hyphens.">
        <input
          name="slug"
          maxLength="120"
          value={form.slug}
          onChange={change}
          readOnly={slugLocked}
        />
      </Field>
      <Field label="Description" full>
        <textarea
          name="description"
          maxLength="4000"
          rows="4"
          value={form.description}
          onChange={change}
        />
      </Field>
      <div>
        <Field label="Primary goal">
          <LookupSelect
            name="primaryGoal"
            value={form.primaryGoal}
            onChange={change}
            items={options.goals}
          />
        </Field>
        <ChoiceGroup
          label="Supported goals"
          items={options.goals}
          checked={form.supportedGoals}
          required={form.primaryGoal}
          onChange={(code, checked) => toggle('supportedGoals', code, checked)}
        />
      </div>
      <div>
        <Field label="Ideal fitness level">
          <LookupSelect
            name="idealLevel"
            value={form.idealLevel}
            onChange={change}
            items={options.levels}
          />
        </Field>
        <ChoiceGroup
          label="Supported fitness levels"
          items={options.levels}
          checked={form.supportedLevels}
          required={form.idealLevel}
          onChange={(code, checked) => toggle('supportedLevels', code, checked)}
        />
      </div>
      <Field label="Training days per week">
        <select
          name="trainingDaysPerWeek"
          value={form.trainingDaysPerWeek}
          onChange={change}
        >
          {[2, 3, 4, 5, 6].map((number) => (
            <option key={number}>{number}</option>
          ))}
        </select>
      </Field>
      <Field label="Editorial priority">
        <input
          name="editorialPriority"
          type="number"
          min="-1000"
          max="1000"
          value={form.editorialPriority}
          onChange={change}
        />
      </Field>
      <Field
        label="Required equipment"
        hint="Separate equipment names with commas."
      >
        <input
          key={form.slug + '-equipment'}
          defaultValue={form.requiredEquipment.join(', ')}
          name="requiredEquipment"
          onChange={change}
        />
      </Field>
      <Field label="Intended audience">
        <input
          name="intendedAudience"
          maxLength="500"
          value={form.intendedAudience || ''}
          onChange={change}
        />
      </Field>
    </div>
  );
}

function LookupSelect({ name, value, items, onChange }) {
  return (
    <select name={name} value={value} onChange={onChange}>
      <option value="">Choose an option</option>
      {value && !items.some((item) => item.code === value) && (
        <option value={value}>{value} (unavailable)</option>
      )}
      {items.map((item) => (
        <option value={item.code} key={item.code}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

function ChoiceGroup({ label, items, checked, required, onChange }) {
  const inactive = checked.filter(
    (value) => !items.some((item) => item.code === value),
  );
  return (
    <fieldset className="choice-group">
      <legend>{label}</legend>
      {[
        ...items,
        ...inactive.map((code) => ({ code, label: `${code} (unavailable)` })),
      ].map(({ code, label: name }) => (
        <label key={code}>
          <input
            type="checkbox"
            checked={checked.includes(code)}
            disabled={required === code}
            onChange={(event) => onChange(code, event.target.checked)}
          />{' '}
          {name}
        </label>
      ))}
    </fieldset>
  );
}

function Schedule({ form, update, options, location, setLocation }) {
  const { month, week, day } = location;
  const monthData = form.months[month];
  const weekData = monthData.weeks[week];
  const dayData = weekData.days[day];
  const [copyDialog, setCopyDialog] = useState(false);
  const changeDay = (change) =>
    update((copy) => change(copy.months[month].weeks[week].days[day]));
  const exerciseOptions = options.exercises;
  const mealOptions = options.meals;

  function removeMonth() {
    update((copy) => copy.months.splice(month, 1));
    setLocation({ month: Math.max(0, month - 1), week: 0, day: 0 });
  }

  function copyWeek() {
    update((copy) => {
      copy.months[month].weeks = copy.months[month].weeks.map(() =>
        structuredClone(weekData),
      );
    });
    setCopyDialog(false);
  }

  function autoFillWeek() {
    const defaultExId =
      exerciseOptions.find((e) => e.status === 'PUBLISHED')?.value ||
      exerciseOptions[0]?.value ||
      '';
    const defaultMealId =
      mealOptions.find((m) => m.status === 'PUBLISHED')?.value ||
      mealOptions[0]?.value ||
      '';
    update((copy) => {
      const targetWeek = copy.months[month].weeks[week];
      targetWeek.days = targetWeek.days.map((existingDay, idx) => {
        const isTraining = idx < copy.trainingDaysPerWeek;
        const meals = existingDay.meals.length
          ? existingDay.meals
          : [
              {
                mealType: 'LUNCH',
                localTime: '12:00',
                mealVersionId: defaultMealId,
              },
            ];
        if (!isTraining) return { kind: 'REST', meals };
        const workout = existingDay.workout || {
          title: `Session ${idx + 1}`,
          description: 'Complete all prescribed sets with controlled form.',
          exercises: [
            {
              exerciseRevisionId: defaultExId,
              prescription: {
                mode: 'REPS',
                setCount: 3,
                repsMin: 8,
                repsMax: 12,
                restSeconds: 60,
              },
            },
          ],
        };
        return { kind: 'TRAINING', workout, meals };
      });
    });
  }

  return (
    <div className="editor-body schedule">
      <div className="schedule-top">
        <Field label="Month">
          <select
            value={month}
            onChange={(event) =>
              setLocation({
                month: Number(event.target.value),
                week: 0,
                day: 0,
              })
            }
          >
            {form.months.map((item, i) => (
              <option value={i} key={i}>
                {item.title || `Month ${i + 1}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Month name">
          <input
            maxLength="160"
            value={monthData.title}
            onChange={(event) =>
              update((copy) => {
                copy.months[month].title = event.target.value;
              })
            }
          />
        </Field>
        <button
          className="button secondary"
          type="button"
          disabled={form.months.length >= 12}
          onClick={() => {
            update((copy) => copy.months.push(emptyMonth(copy.months.length)));
            setLocation({ month: form.months.length, week: 0, day: 0 });
          }}
        >
          <Plus size={17} /> Month
        </button>
        <button
          className="icon-button"
          title="Remove month"
          aria-label="Remove month"
          type="button"
          disabled={form.months.length <= 1}
          onClick={removeMonth}
        >
          <Trash2 size={17} />
        </button>
      </div>
      <div className="schedule-weeks">
        <div className="filter-tabs" role="group" aria-label="Week">
          {monthData.weeks.map((_, i) => (
            <button
              type="button"
              key={i}
              aria-pressed={i === week}
              onClick={() => setLocation({ month, week: i, day: 0 })}
            >
              Week {i + 1}
            </button>
          ))}
        </div>
        <div className="actions">
          <button
            className="button secondary compact"
            type="button"
            onClick={autoFillWeek}
          >
            <Wand2 size={16} /> Auto-fill week
          </button>
          <button
            className="button secondary compact"
            type="button"
            onClick={() => setCopyDialog(true)}
          >
            <Copy size={16} /> Copy to all weeks
          </button>
        </div>
      </div>
      <div className="days" role="group" aria-label="Day">
        {weekData.days.map((item, i) => (
          <button
            type="button"
            key={i}
            aria-pressed={day === i}
            onClick={() => setLocation({ month, week, day: i })}
          >
            <strong>Day {i + 1}</strong>
            <small>{item.kind === 'TRAINING' ? 'Training' : 'Rest'}</small>
          </button>
        ))}
      </div>
      <p className="inline-help">
        {weekData.days.filter((item) => item.kind === 'TRAINING').length} of{' '}
        {form.trainingDaysPerWeek} training days scheduled in this week.
      </p>
      <div className="day-editor" key={`${month}-${week}-${day}`}>
        <div className="schedule-section">
          <div className="section-heading">
            <div>
              <h2>Day {day + 1} workout</h2>
              <p>Choose a training or rest day.</p>
            </div>
            <Field label="Day type">
              <select
                value={dayData.kind}
                onChange={(event) =>
                  changeDay((copy) => {
                    copy.kind = event.target.value;
                    if (copy.kind === 'TRAINING') copy.workout = emptyWorkout();
                    else delete copy.workout;
                  })
                }
              >
                <option value="REST">Rest</option>
                <option value="TRAINING">Training</option>
              </select>
            </Field>
          </div>
          {dayData.workout && (
            <>
              <div className="field-grid">
                <Field label="Workout title">
                  <input
                    value={dayData.workout.title}
                    maxLength="160"
                    onChange={(event) =>
                      changeDay((copy) => {
                        copy.workout.title = event.target.value;
                      })
                    }
                  />
                </Field>
                <Field label="Workout instructions">
                  <textarea
                    rows="2"
                    maxLength="4000"
                    value={dayData.workout.description}
                    onChange={(event) =>
                      changeDay((copy) => {
                        copy.workout.description = event.target.value;
                      })
                    }
                  />
                </Field>
              </div>
              {dayData.workout.exercises.map((item, i) => (
                <ExercisePrescription
                  key={i}
                  item={item}
                  options={exerciseOptions}
                  onChange={(change) =>
                    changeDay((copy) => change(copy.workout.exercises[i]))
                  }
                  onRemove={() =>
                    changeDay((copy) => copy.workout.exercises.splice(i, 1))
                  }
                />
              ))}
              <button
                className="button secondary compact"
                type="button"
                disabled={dayData.workout.exercises.length >= 50}
                onClick={() =>
                  changeDay((copy) =>
                    copy.workout.exercises.push(emptyExercise()),
                  )
                }
              >
                <Plus size={16} /> Exercise
              </button>
            </>
          )}
        </div>
        <div className="schedule-section">
          <div className="section-heading">
            <div>
              <h2>Meals</h2>
              <p>For publishing, every day needs at least one meal.</p>
            </div>
          </div>
          {dayData.meals.map((item, i) => (
            <div key={i} className="inline-fields meal-row">
              <Field label="Meal">
                <VersionSelect
                  value={item.mealVersionId}
                  items={mealOptions}
                  onChange={(value) =>
                    changeDay((copy) => {
                      copy.meals[i].mealVersionId = value;
                    })
                  }
                />
              </Field>
              <Field label="Meal type">
                <input
                  maxLength="40"
                  value={item.mealType}
                  onChange={(event) =>
                    changeDay((copy) => {
                      copy.meals[i].mealType = event.target.value;
                    })
                  }
                />
              </Field>
              <Field label="Time">
                <input
                  type="time"
                  value={item.localTime}
                  onChange={(event) =>
                    changeDay((copy) => {
                      copy.meals[i].localTime = event.target.value;
                    })
                  }
                />
              </Field>
              <button
                className="icon-button"
                title="Remove meal"
                aria-label="Remove meal"
                type="button"
                onClick={() => changeDay((copy) => copy.meals.splice(i, 1))}
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
          <button
            className="button secondary compact"
            type="button"
            disabled={dayData.meals.length >= 10}
            onClick={() =>
              changeDay((copy) => copy.meals.push(emptyMealSlot()))
            }
          >
            <Plus size={16} /> Meal
          </button>
        </div>
      </div>
      {copyDialog && (
        <ConfirmDialog
          title="Copy this week to the month?"
          action="Copy week"
          onConfirm={copyWeek}
          onCancel={() => setCopyDialog(false)}
        >
          The selected week’s workouts and meals will replace the other three
          weeks in this month.
        </ConfirmDialog>
      )}
    </div>
  );
}

export function VersionSelect({ value, items, onChange }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Choose an item</option>
      {value && !items.some((item) => item.value === value) && (
        <option value={value}>
          Previously selected version ({value.slice(0, 8)})
        </option>
      )}
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
          {item.status === 'DRAFT' ? ' (draft)' : ''}
        </option>
      ))}
    </select>
  );
}

function ExercisePrescription({ item, options, onChange, onRemove }) {
  const p = item.prescription;
  const fields = [
    ['setCount', 'Sets', 1, 100],
    ...(p.mode === 'REPS'
      ? [
          ['repsMin', 'Reps min', 1, 1000],
          ['repsMax', 'Reps max', 1, 1000],
        ]
      : [['durationSeconds', 'Seconds', 1, 86400]]),
    ['restSeconds', 'Rest (sec)', 0, 3600],
  ];
  return (
    <div className="exercise-row">
      <div className="inline-fields">
        <Field label="Exercise">
          <VersionSelect
            value={item.exerciseRevisionId}
            items={options}
            onChange={(value) =>
              onChange((entry) => {
                entry.exerciseRevisionId = value;
              })
            }
          />
        </Field>
        <Field label="Prescription">
          <select
            value={p.mode}
            onChange={(event) =>
              onChange((entry) => {
                const { setCount, restSeconds } = entry.prescription;
                entry.prescription =
                  event.target.value === 'REPS'
                    ? {
                        mode: 'REPS',
                        setCount,
                        repsMin: 8,
                        repsMax: 12,
                        restSeconds,
                      }
                    : {
                        mode: 'DURATION',
                        setCount,
                        durationSeconds: 30,
                        restSeconds,
                      };
              })
            }
          >
            <option value="REPS">Repetitions</option>
            <option value="DURATION">Duration</option>
          </select>
        </Field>
        <button
          className="icon-button"
          title="Remove exercise"
          aria-label="Remove exercise"
          type="button"
          onClick={onRemove}
        >
          <Trash2 size={17} />
        </button>
      </div>
      <div className="inline-fields prescription-numbers">
        {fields.map(([name, label, min, max]) => (
          <Field label={label} key={name}>
            <input
              type="number"
              min={min}
              max={max}
              value={p[name]}
              onChange={(event) =>
                onChange((entry) => {
                  entry.prescription[name] = Number(event.target.value);
                })
              }
            />
          </Field>
        ))}
      </div>
    </div>
  );
}
