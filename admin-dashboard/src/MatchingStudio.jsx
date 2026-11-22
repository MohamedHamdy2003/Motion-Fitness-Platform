import { useEffect, useState } from 'react';
import { CheckCircle2, Play, Plus, Sparkles } from 'lucide-react';
import { listAll } from './api';
import { ConfirmDialog, ErrorNotice, Field, Notice, Status } from './ui';

const DEFAULT_INSTRUCTIONS =
  'Compare all eligible candidate programs against the user profile and BMI context. When multiple candidates share the same primaryGoal, trainingDaysPerWeek, and supportedLevels, prefer candidates whose idealLevel, description, intendedAudience, and approvedHints best align with the user fitnessLevel, current weight vs target weight delta, and training focus.';

export function MatchingStudio({ api }) {
  const [rulesets, setRulesets] = useState([]);
  const [options, setOptions] = useState({
    goals: [],
    levels: [],
    genders: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [publishingId, setPublishingId] = useState(null);
  const [evalRef, setEvalRef] = useState('motion-expert-evaluation-v1');
  const [rulesetForm, setRulesetForm] = useState({
    instructionVersion: 'gemini-matching-v2',
    model: 'google/gemini-2.5-flash',
    instructions: DEFAULT_INSTRUCTIONS,
  });
  const [simRulesetId, setSimRulesetId] = useState('');
  const [simProfile, setSimProfile] = useState({
    primaryGoal: 'FAT_LOSS',
    fitnessLevel: 'BEGINNER',
    trainingDaysPerWeek: 3,
    gender: 'MALE',
    age: 26,
    heightCm: 178,
    weightKg: 88,
    targetWeightKg: 76,
  });
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listAll(api, '/admin/matching/rulesets'),
      api('/references/primary-goals'),
      api('/references/fitness-levels'),
      api('/references/genders'),
    ])
      .then(([loadedRulesets, goals, levels, genders]) => {
        if (!alive) return;
        setRulesets(loadedRulesets);
        const active =
          loadedRulesets.find((r) => r.active) || loadedRulesets[0];
        if (active) setSimRulesetId((prev) => prev || active.id);
        setOptions({
          goals: goals.items || [],
          levels: levels.items || [],
          genders: genders.items || [],
        });
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
  }, [api, reload]);

  async function handleCreateRuleset(event) {
    event.preventDefault();
    setError(null);
    setNotice('');
    setCreating(true);
    try {
      const created = await api('/admin/matching/rulesets', {
        method: 'POST',
        body: rulesetForm,
      });
      setNotice(`Draft ruleset "${created.instruction_version}" created.`);
      setSimRulesetId(created.id);
      setReload((v) => v + 1);
    } catch (reason) {
      setError(reason);
    } finally {
      setCreating(false);
    }
  }

  async function handlePublish() {
    if (!publishingId) return;
    const id = publishingId;
    setPublishingId(null);
    setError(null);
    setNotice('');
    try {
      await api(`/admin/matching/rulesets/${id}/publish`, {
        method: 'POST',
        body: {
          qualityApproved: true,
          evaluationReference: evalRef.trim() || 'motion-expert-evaluation-v1',
        },
      });
      setNotice('Ruleset published and activated for automated user matching.');
      setReload((v) => v + 1);
    } catch (reason) {
      setError(reason);
    }
  }

  async function handleSimulate(event) {
    event.preventDefault();
    if (!simRulesetId) return;
    setError(null);
    setNotice('');
    setSimulating(true);
    setSimResult(null);
    try {
      const run = await api(
        `/admin/matching/rulesets/${simRulesetId}/simulate`,
        {
          method: 'POST',
          body: {
            ...simProfile,
            trainingDaysPerWeek: Number(simProfile.trainingDaysPerWeek),
            age: Number(simProfile.age),
            heightCm: Number(simProfile.heightCm),
            weightKg: Number(simProfile.weightKg),
            targetWeightKg: Number(simProfile.targetWeightKg),
          },
        },
      );
      let detail = await api(`/admin/matching/runs/${run.runId}`);
      for (let i = 0; i < 6; i++) {
        if (detail.status !== 'PENDING' && detail.status !== 'PROCESSING') {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
        detail = await api(`/admin/matching/runs/${run.runId}`);
      }
      setSimResult(detail);
    } catch (reason) {
      setError(reason);
    } finally {
      setSimulating(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-list" role="status">
        <span className="spinner" /> Loading AI matching configuration…
      </div>
    );
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>AI Matching</h1>
          <p>
            Configure versioned Gemini matching rulesets and test automated
            program selection against anonymous synthetic profiles.
          </p>
        </div>
      </header>
      <ErrorNotice error={error} />
      <Notice text={notice} />

      <div className="matching-grid">
        <section className="editor-panel">
          <div className="editor-body">
            <div className="section-heading">
              <div>
                <h2>Matching Rulesets</h2>
                <p>
                  Only one published ruleset is active at a time. The AI
                  selector automatically matches onboarded users to eligible
                  published programs.
                </p>
              </div>
            </div>
            {rulesets.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Model</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rulesets.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.instruction_version}</strong>
                          {r.active && (
                            <span className="active-badge">Active</span>
                          )}
                        </td>
                        <td>
                          <code>{r.model}</code>
                        </td>
                        <td>
                          <Status value={r.status} />
                        </td>
                        <td>
                          {r.status === 'DRAFT' && (
                            <button
                              type="button"
                              className="button primary compact"
                              onClick={() => setPublishingId(r.id)}
                            >
                              <CheckCircle2 size={15} /> Publish
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="inline-help">No rulesets created yet.</p>
            )}

            <form className="schedule-section" onSubmit={handleCreateRuleset}>
              <h3>Create Draft Ruleset</h3>
              <div className="field-grid" style={{ marginTop: 12 }}>
                <Field label="Instruction version">
                  <input
                    value={rulesetForm.instructionVersion}
                    onChange={(e) =>
                      setRulesetForm({
                        ...rulesetForm,
                        instructionVersion: e.target.value,
                      })
                    }
                    required
                  />
                </Field>
                <Field
                  label="Remote Gemini model"
                  hint="Must match AI_MODEL in ai-service (e.g. google/gemini-2.5-flash)."
                >
                  <input
                    value={rulesetForm.model}
                    onChange={(e) =>
                      setRulesetForm({ ...rulesetForm, model: e.target.value })
                    }
                    required
                  />
                </Field>
                <Field label="Editorial comparison instructions" full>
                  <textarea
                    rows="3"
                    value={rulesetForm.instructions}
                    onChange={(e) =>
                      setRulesetForm({
                        ...rulesetForm,
                        instructions: e.target.value,
                      })
                    }
                    required
                  />
                </Field>
              </div>
              <div className="actions" style={{ marginTop: 12 }}>
                <button
                  type="submit"
                  className="button secondary"
                  disabled={creating}
                >
                  <Plus size={17} />{' '}
                  {creating ? 'Creating…' : 'Save draft ruleset'}
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="editor-panel">
          <div className="editor-body">
            <div className="section-heading">
              <div>
                <h2>
                  <Sparkles size={18} style={{ verticalAlign: 'middle' }} />{' '}
                  Matching Simulator
                </h2>
                <p>
                  Test Stage 1 eligibility filtering and Stage 2 AI selection on
                  a synthetic profile without assigning to any user.
                </p>
              </div>
            </div>
            <form onSubmit={handleSimulate}>
              <div className="field-grid">
                <Field label="Ruleset" full>
                  <select
                    value={simRulesetId}
                    onChange={(e) => setSimRulesetId(e.target.value)}
                  >
                    <option value="">Choose a ruleset</option>
                    {rulesets.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.instruction_version} ({r.model}) —{' '}
                        {r.active ? 'ACTIVE' : r.status}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Primary goal">
                  <select
                    value={simProfile.primaryGoal}
                    onChange={(e) =>
                      setSimProfile({
                        ...simProfile,
                        primaryGoal: e.target.value,
                      })
                    }
                  >
                    {options.goals.map((g) => (
                      <option key={g.code} value={g.code}>
                        {g.label} ({g.code})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Fitness level">
                  <select
                    value={simProfile.fitnessLevel}
                    onChange={(e) =>
                      setSimProfile({
                        ...simProfile,
                        fitnessLevel: e.target.value,
                      })
                    }
                  >
                    {options.levels.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Training days / week">
                  <select
                    value={simProfile.trainingDaysPerWeek}
                    onChange={(e) =>
                      setSimProfile({
                        ...simProfile,
                        trainingDaysPerWeek: Number(e.target.value),
                      })
                    }
                  >
                    {[2, 3, 4, 5, 6].map((d) => (
                      <option key={d} value={d}>
                        {d} days / week
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Gender">
                  <select
                    value={simProfile.gender}
                    onChange={(e) =>
                      setSimProfile({ ...simProfile, gender: e.target.value })
                    }
                  >
                    {options.genders.map((g) => (
                      <option key={g.code} value={g.code}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Age">
                  <input
                    type="number"
                    min="18"
                    max="100"
                    value={simProfile.age}
                    onChange={(e) =>
                      setSimProfile({
                        ...simProfile,
                        age: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Height (cm)">
                  <input
                    type="number"
                    min="100"
                    max="250"
                    value={simProfile.heightCm}
                    onChange={(e) =>
                      setSimProfile({
                        ...simProfile,
                        heightCm: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Current weight (kg)">
                  <input
                    type="number"
                    min="30"
                    max="300"
                    value={simProfile.weightKg}
                    onChange={(e) =>
                      setSimProfile({
                        ...simProfile,
                        weightKg: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Target weight (kg)">
                  <input
                    type="number"
                    min="30"
                    max="300"
                    value={simProfile.targetWeightKg}
                    onChange={(e) =>
                      setSimProfile({
                        ...simProfile,
                        targetWeightKg: Number(e.target.value),
                      })
                    }
                  />
                </Field>
              </div>
              <div className="actions" style={{ marginTop: 16 }}>
                <button
                  type="submit"
                  className="button primary"
                  disabled={!simRulesetId || simulating}
                >
                  <Play size={17} />{' '}
                  {simulating ? 'Running simulation…' : 'Run simulation'}
                </button>
              </div>
            </form>

            {simResult && (
              <div className="sim-result schedule-section">
                <h3>Simulation Result</h3>
                <p className="inline-help">
                  Status: <strong>{simResult.status}</strong> · Calculated BMI:{' '}
                  <strong>{simResult.metrics_snapshot?.bmi}</strong> · Stage 1
                  Eligible Candidates:{' '}
                  <strong>{simResult.candidates?.length || 0}</strong>
                </p>
                {simResult.candidates?.length > 0 && (
                  <div className="candidate-cards">
                    {simResult.candidates.map((c) => {
                      const isSelected =
                        simResult.decision?.selectedProgramVersionId === c.id;
                      return (
                        <div
                          key={c.id}
                          className={`exercise-row ${isSelected ? 'selected-candidate' : ''}`}
                        >
                          <strong>{c.title}</strong>
                          {isSelected && (
                            <span className="status published">
                              Selected by AI
                            </span>
                          )}
                          <p className="inline-help">{c.description}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
                {simResult.decision?.reasonCodes?.length > 0 && (
                  <p className="inline-help">
                    Reason codes:{' '}
                    <code>{simResult.decision.reasonCodes.join(', ')}</code>
                  </p>
                )}
                {simResult.failure_code && (
                  <p className="inline-help">
                    Note: <code>{simResult.failure_code}</code>
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {publishingId && (
        <ConfirmDialog
          title="Publish and activate this matching ruleset?"
          action="Publish ruleset"
          onCancel={() => setPublishingId(null)}
          onConfirm={handlePublish}
        >
          <p>
            Publishing activates this ruleset for automated user matching and
            archives the previous active ruleset.
          </p>
          <div style={{ marginTop: 12 }}>
            <Field label="Evaluation reference">
              <input
                value={evalRef}
                onChange={(e) => setEvalRef(e.target.value)}
              />
            </Field>
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
