import { useEffect, useState } from 'react';
import { CheckCircle2, Play, Plus, Sparkles } from 'lucide-react';
import { listAll } from './api';
import { readableCode } from './program';
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
      setNotice(
        `تم إنشاء مسودة قاعدة المطابقة «${created.instruction_version}».`,
      );
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
      setNotice('تم نشر وتفعيل قاعدة المطابقة الآلية للمستخدمين الجدد.');
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

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>المطابقة الذكية للبرامج (AI Matching)</h1>
          <p>
            إدارة قواعد اختيار البرامج المعتمدة على Gemini وتجربة المطابقة على
            ملفات تجريبية دون التأثير على أي متدرب حقيقي.
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
                <h2>قواعد المطابقة (Rulesets)</h2>
                <p>
                  تُفعّل قاعدة منشورة واحدة فقط في كل وقت، ويتولى النظام مطابقة
                  كل متدرب جديد تلقائياً مع أفضل برنامج مناسب له.
                </p>
              </div>
            </div>
            {rulesets.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>الإصدار</th>
                      <th>الموديل</th>
                      <th>الحالة</th>
                      <th>إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rulesets.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong dir="ltr">{r.instruction_version}</strong>
                          {r.active && (
                            <span className="active-badge">نشط</span>
                          )}
                        </td>
                        <td dir="ltr">
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
                              <CheckCircle2 size={15} /> نشر وتفعيل
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="inline-help">لم تُنشأ قواعد مطابقة بعد.</p>
            )}

            <form className="schedule-section" onSubmit={handleCreateRuleset}>
              <h3>إنشاء مسودة قاعدة مطابقة جديدة</h3>
              <div className="field-grid panel-spaced-sm">
                <Field label="إصدار التعليمات">
                  <input
                    dir="ltr"
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
                  label="موديل Gemini"
                  hint="يجب أن يطابق قيمة AI_MODEL في خدمة الذكاء الاصطناعي."
                >
                  <input
                    dir="ltr"
                    value={rulesetForm.model}
                    onChange={(e) =>
                      setRulesetForm({ ...rulesetForm, model: e.target.value })
                    }
                    required
                  />
                </Field>
                <Field label="إرشادات المقارنة للموديل" full>
                  <textarea
                    dir="ltr"
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
              <div className="actions panel-spaced-sm">
                <button
                  type="submit"
                  className="button secondary"
                  disabled={creating}
                >
                  <Plus size={17} /> {creating ? 'جارٍ الحفظ…' : 'حفظ كمسودة'}
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
                  اختبر ترشيح البرامج واختيار Gemini الفعلي لملف متدرب افتراضي.
                </p>
              </div>
            </div>
            <form onSubmit={handleSimulate}>
              <div className="field-grid">
                <Field label="قاعدة المطابقة" full>
                  <select
                    value={simRulesetId}
                    onChange={(e) => setSimRulesetId(e.target.value)}
                  >
                    <option value="">اختر قاعدة مطابقة</option>
                    {rulesets.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.instruction_version} ({r.model}) —{' '}
                        {r.active ? 'نشط' : r.status}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="الهدف الأساسي">
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
                        {readableCode(g.code)} ({g.label})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="مستوى اللياقة">
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
                        {readableCode(l.code)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="أيام التدريب أسبوعياً">
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
                        {d} أيام / أسبوع
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="النوع">
                  <select
                    value={simProfile.gender}
                    onChange={(e) =>
                      setSimProfile({ ...simProfile, gender: e.target.value })
                    }
                  >
                    {options.genders.map((g) => (
                      <option key={g.code} value={g.code}>
                        {readableCode(g.code)}
                      </option>
                    ))}
                  </select>
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
                  disabled={!simRulesetId || simulating}
                >
                  <Play size={16} />{' '}
                  {simulating ? 'جارٍ تشغيل المحاكاة…' : 'تشغيل المحاكاة'}
                </button>
              </div>
            </form>

            {simResult && (
              <div className="sim-result schedule-section">
                <h3>نتيجة المحاكاة</h3>
                <p className="inline-help">
                  الحالة: <strong dir="ltr">{simResult.status}</strong> · مؤشر
                  كتلة الجسم (BMI):{' '}
                  <strong dir="ltr">{simResult.metrics_snapshot?.bmi}</strong> ·
                  البرامج المرشحة:{' '}
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
                    ملاحظة: <code dir="ltr">{simResult.failure_code}</code>
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {publishingId && (
        <ConfirmDialog
          title="نشر وتفعيل قاعدة المطابقة؟"
          action="نشر وتفعيل"
          onCancel={() => setPublishingId(null)}
          onConfirm={handlePublish}
        >
          <p>
            سيؤدي النشر إلى تفعيل هذه القاعدة للمطابقة التلقائية وأرشفة القاعدة
            النشطة السابقة.
          </p>
          <div className="panel-spaced-sm">
            <Field label="مرجع التقييم">
              <input
                dir="ltr"
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
