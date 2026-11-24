import { useEffect, useState } from 'react';
import { CheckCircle2, Play, Sparkles } from 'lucide-react';
import { getCachedReference, listAll } from './api';
import { readableCode } from './program';
import {
  ButtonContent,
  CustomSelect,
  ErrorNotice,
  Field,
  Notice,
  Status,
} from './ui';

const DEFAULT_INSTRUCTIONS =
  'Compare all eligible candidate programs against the user profile and BMI context. When multiple candidates share the same primaryGoal, trainingDaysPerWeek, and supportedLevels, prefer candidates whose idealLevel, description, intendedAudience, and approvedHints best align with the user fitnessLevel, current weight vs target weight delta, and training focus.';

const DEFAULT_MODEL = 'google/gemini-3.5-flash-lite';

function generateInstructionVersion() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `gemini-matching-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

function simulationStatusMeta(status) {
  if (status === 'MATCH')
    return { tone: 'PUBLISHED', label: 'تم اختيار البرنامج' };
  if (status === 'NO_MATCH')
    return { tone: 'DRAFT', label: 'لا يوجد برنامج مطابق' };
  if (status === 'FAILED') return { tone: 'ARCHIVED', label: 'فشلت المحاكاة' };
  return { tone: 'INFO', label: 'قيد المعالجة…' };
}

export function MatchingStudio({ api, realtimeTick = 0 }) {
  const [activeRuleset, setActiveRuleset] = useState(null);
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS);
  const [options, setOptions] = useState({
    goals: [],
    levels: [],
    genders: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
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
      getCachedReference(api, '/references/primary-goals'),
      getCachedReference(api, '/references/fitness-levels'),
      getCachedReference(api, '/references/genders'),
    ])
      .then(([loadedRulesets, goals, levels, genders]) => {
        if (!alive) return;
        const current =
          loadedRulesets.find((r) => r.active) || loadedRulesets[0] || null;
        setActiveRuleset((prev) => {
          if (current?.instructions && prev?.id !== current.id) {
            setInstructions(current.instructions);
          }
          return current;
        });
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
  }, [api, reload, realtimeTick]);

  async function handleSaveAndActivate(event) {
    event.preventDefault();
    const trimmed = instructions.trim();
    if (trimmed.length < 20) {
      setError(new Error('يرجى كتابة تعليمات مطابقة لا تقل عن 20 حرفاً.'));
      return;
    }
    setError(null);
    setNotice('');
    setSaving(true);
    try {
      const created = await api('/admin/matching/rulesets', {
        method: 'POST',
        body: {
          instructionVersion: generateInstructionVersion(),
          model: activeRuleset?.model || DEFAULT_MODEL,
          instructions: trimmed,
        },
      });
      await api(`/admin/matching/rulesets/${created.id}/publish`, {
        method: 'POST',
        body: {
          qualityApproved: true,
          evaluationReference: 'admin-portal-active-instructions',
        },
      });
      setNotice('تم حفظ وتفعيل تعليمات المطابقة النشطة بنجاح.');
      setReload((v) => v + 1);
    } catch (reason) {
      setError(reason);
    } finally {
      setSaving(false);
    }
  }

  async function handleSimulate(event) {
    event.preventDefault();
    if (!activeRuleset?.id) {
      setError(
        new Error('يرجى حفظ وتفعيل تعليمات المطابقة أولاً قبل تشغيل المحاكاة.'),
      );
      return;
    }
    setError(null);
    setNotice('');
    setSimulating(true);
    setSimResult(null);
    try {
      const run = await api(
        `/admin/matching/rulesets/${activeRuleset.id}/simulate`,
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
      for (let i = 0; i < 16; i++) {
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
        <span className="spinner" /> جارٍ تحميل إعدادات المطابقة الذكية…
      </div>
    );
  }

  const isDirty =
    instructions.trim() !== (activeRuleset?.instructions || '').trim();

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>المطابقة الذكية للبرامج (AI Matching)</h1>
          <p>
            تعديل تعليمات اختيار البرامج النشطة وتجربة المطابقة على ملفات
            افتراضية دون التأثير على أي متدرب حقيقي.
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
                <h2>تعليمات المطابقة النشطة</h2>
                <p>
                  التوجيهات التي يعتمد عليها الذكاء الاصطناعي للمفاضلة بين
                  البرامج المؤهلة لكل متدرب جديد.
                </p>
              </div>
              {activeRuleset ? (
                <Status
                  value={activeRuleset.active ? 'PUBLISHED' : 'DRAFT'}
                  customLabel={activeRuleset.active ? 'مفعّلة الآن' : 'مسودة'}
                />
              ) : (
                <Status value="DRAFT" customLabel="غير مفعّلة بعد" />
              )}
            </div>

            <form onSubmit={handleSaveAndActivate}>
              <Field
                label="إرشادات المقارنة للموديل"
                hint="عند الحفظ يتم تفعيل هذه التعليمات تلقائياً لجميع عمليات المطابقة الجديدة."
                full
              >
                <textarea
                  dir="ltr"
                  rows="8"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  required
                />
              </Field>
              <div className="actions panel-spaced-sm">
                <button
                  type="submit"
                  className="button primary"
                  disabled={
                    saving || (!isDirty && Boolean(activeRuleset?.active))
                  }
                >
                  <ButtonContent busy={saving}>
                    <CheckCircle2 size={17} aria-hidden="true" />
                    <span>حفظ وتفعيل التعليمات</span>
                  </ButtonContent>
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
                  <Sparkles size={17} className="heading-icon" />
                  محاكي المطابقة التفاعلي
                </h2>
                <p>
                  اختبر ترشيح البرامج واختيار Gemini الفعلي باستخدام التعليمات
                  النشطة الحالية.
                </p>
              </div>
            </div>
            <form onSubmit={handleSimulate}>
              <div className="field-grid">
                <Field label="الهدف الأساسي">
                  <CustomSelect
                    value={simProfile.primaryGoal}
                    onChange={(value) =>
                      setSimProfile({
                        ...simProfile,
                        primaryGoal: value,
                      })
                    }
                    options={options.goals.map((g) => ({
                      value: g.code,
                      label: `${readableCode(g.code)} (${g.label})`,
                    }))}
                  />
                </Field>
                <Field label="مستوى اللياقة">
                  <CustomSelect
                    value={simProfile.fitnessLevel}
                    onChange={(value) =>
                      setSimProfile({
                        ...simProfile,
                        fitnessLevel: value,
                      })
                    }
                    options={options.levels.map((l) => ({
                      value: l.code,
                      label: readableCode(l.code),
                    }))}
                  />
                </Field>
                <Field label="أيام التدريب أسبوعياً">
                  <CustomSelect
                    value={String(simProfile.trainingDaysPerWeek)}
                    onChange={(value) =>
                      setSimProfile({
                        ...simProfile,
                        trainingDaysPerWeek: Number(value),
                      })
                    }
                    options={[2, 3, 4, 5, 6].map((d) => ({
                      value: String(d),
                      label: `${d} أيام / أسبوع`,
                    }))}
                  />
                </Field>
                <Field label="النوع">
                  <CustomSelect
                    value={simProfile.gender}
                    onChange={(value) =>
                      setSimProfile({ ...simProfile, gender: value })
                    }
                    options={options.genders.map((g) => ({
                      value: g.code,
                      label: readableCode(g.code),
                    }))}
                  />
                </Field>
                <Field label="العمر">
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
                <Field label="الطول (سم)">
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
                <Field label="الوزن الحالي (كجم)">
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
                <Field label="الوزن المستهدف (كجم)">
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
              <div className="actions panel-spaced-sm">
                <button
                  type="submit"
                  className="button primary"
                  disabled={!activeRuleset?.id || simulating}
                >
                  <ButtonContent busy={simulating}>
                    <Play size={16} aria-hidden="true" />
                    <span>تشغيل المحاكاة</span>
                  </ButtonContent>
                </button>
              </div>
            </form>

            {simResult &&
              (() => {
                const badge = simulationStatusMeta(simResult.status);
                return (
                  <div className="sim-result schedule-section">
                    <div className="candidate-header">
                      <h3>نتيجة المحاكاة</h3>
                      <Status value={badge.tone} customLabel={badge.label} />
                    </div>
                    <p className="inline-help">
                      مؤشر كتلة الجسم (BMI):{' '}
                      <strong dir="ltr">
                        {simResult.metrics_snapshot?.bmi}
                      </strong>{' '}
                      · البرامج المرشحة:{' '}
                      <strong>{simResult.candidates?.length || 0}</strong>
                    </p>
                    {simResult.candidates?.length > 0 && (
                      <div className="candidate-cards">
                        {simResult.candidates.map((c) => {
                          const isSelected =
                            simResult.decision?.selectedProgramVersionId ===
                            c.id;
                          return (
                            <div
                              key={c.id}
                              className={`exercise-row ${isSelected ? 'selected-candidate' : ''}`}
                            >
                              <div className="candidate-header">
                                <strong>{c.title}</strong>
                                {isSelected && (
                                  <span className="status published">
                                    اختيار Gemini
                                  </span>
                                )}
                              </div>
                              <p className="inline-help">{c.description}</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {simResult.decision?.reasonCodes?.length > 0 && (
                      <p className="inline-help">
                        أسباب الاختيار:{' '}
                        <code dir="ltr">
                          {simResult.decision.reasonCodes.join(', ')}
                        </code>
                      </p>
                    )}
                    {simResult.failure_code && (
                      <p className="inline-help">
                        سبب التعذر:{' '}
                        <code dir="ltr">{simResult.failure_code}</code>
                      </p>
                    )}
                  </div>
                );
              })()}
          </div>
        </section>
      </div>
    </>
  );
}
