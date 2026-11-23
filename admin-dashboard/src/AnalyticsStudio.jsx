import { useEffect, useState } from 'react';
import {
  Activity,
  Cpu,
  Database,
  DollarSign,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { ErrorNotice, Notice, Status } from './ui';

function formatUptime(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}ي ${hours}س ${mins}د`;
  if (hours > 0) return `${hours}س ${mins}د`;
  return `${mins}د ${s % 60}ث`;
}

function formatNumber(val) {
  return new Intl.NumberFormat('en-US').format(Number(val) || 0);
}

function formatUsd(val) {
  const num = Number(val) || 0;
  return num < 0.01 && num > 0 ? `$${num.toFixed(6)}` : `$${num.toFixed(4)}`;
}

function integrationStatusMeta(value) {
  const upper = String(value || '').toUpperCase();
  if (upper === 'UP') return { tone: 'PUBLISHED', label: 'يعمل' };
  if (upper === 'CONNECTED') return { tone: 'PUBLISHED', label: 'متصل' };
  if (upper === 'SUCCEEDED') return { tone: 'PUBLISHED', label: 'ناجح' };
  if (upper === 'APPROVED') return { tone: 'PUBLISHED', label: 'مُفعّل' };
  if (upper.startsWith('CONFIGURED'))
    return { tone: 'PUBLISHED', label: 'مُعدّ' };
  if (upper === 'LOCAL_CAPTURE') return { tone: 'DRAFT', label: 'وضع محلي' };
  if (upper === 'NOT_CONFIGURED' || upper === 'NOT_APPROVED')
    return { tone: 'DRAFT', label: 'غير مُفعّل' };
  if (upper === 'FAILED') return { tone: 'ARCHIVED', label: 'فشل' };
  return { tone: 'ARCHIVED', label: 'متوقف' };
}

const operationLabels = {
  PROGRAM_MATCHING: 'مطابقة البرامج للمتدربين',
  EXERCISE_FITTING: 'ملاءمة التمارين للإصابات',
  INJURY_REWRITE: 'تحسين وصف الإصابات',
  PROGRAM_HINTS_REWRITE: 'صياغة تلميحات البرامج',
};

export function AnalyticsStudio({ api }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');

  async function loadOverview(period = days) {
    setLoading(true);
    setError(null);
    try {
      const res = await api(`/admin/analytics/overview?days=${period}`);
      setData(res);
    } catch (reason) {
      setError(reason);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview(days);
  }, [days]);

  async function triggerLiveProbe() {
    setChecking(true);
    setError(null);
    setNotice('');
    try {
      const probe = await api('/admin/analytics/uptime-check', {
        method: 'POST',
        body: {},
      });
      const aiLabel =
        probe.aiService.status === 'UP'
          ? `يعمل (${probe.aiService.latencyMs}ms)`
          : probe.aiService.status === 'NOT_CONFIGURED'
            ? 'غير مُعدّ بعد'
            : 'غير متاح';
      setNotice(
        `تم تسجيل فحص مباشر — قاعدة البيانات: ${probe.database.ok ? `متصلة (${probe.database.latencyMs}ms)` : 'خطأ'} · خدمة Gemini AI: ${aiLabel}.`,
      );
      await loadOverview(days);
    } catch (reason) {
      setError(reason);
    } finally {
      setChecking(false);
    }
  }

  const summary = data?.geminiUsage?.summary;
  const platform = data?.platform;
  const uptime = data?.uptime;
  const dailySeries = data?.geminiUsage?.dailySeries || [];
  const maxDailyTokens = Math.max(
    1,
    ...dailySeries.map((entry) => Number(entry.totalTokens) || 0),
  );

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>التحليلات واستهلاك Gemini وصحة النظام</h1>
          <p>
            متابعة استهلاك التوكنز والتكلفة التقديرية لوكلاء Gemini، زمن تشغيل
            الخادم، وجاهزية التكاملات الخارجية.
          </p>
        </div>
        <div className="actions">
          <select
            className="period-select"
            aria-label="الفترة الزمنية"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>آخر 7 أيام</option>
            <option value={30}>آخر 30 يوماً</option>
            <option value={90}>آخر 90 يوماً</option>
          </select>
          <button
            type="button"
            className="button primary"
            disabled={checking || loading}
            onClick={triggerLiveProbe}
          >
            <RefreshCw size={16} />
            {checking ? 'جارٍ الفحص…' : 'فحص صحة النظام الآن'}
          </button>
        </div>
      </header>

      <ErrorNotice error={error} />
      <Notice text={notice} />

      {loading && !data ? (
        <div className="loading-list" role="status">
          <span className="spinner" /> جارٍ تحميل مؤشرات النظام…
        </div>
      ) : (
        data && (
          <>
            <section className="kpi-grid" aria-label="المؤشرات الرئيسية">
              <article className="kpi-card">
                <div className="kpi-label">
                  <Sparkles size={15} /> طلبات Gemini ({days} يوماً)
                </div>
                <div className="kpi-value" dir="ltr">
                  {formatNumber(summary.totalRequests)}
                </div>
                <div className="kpi-meta">
                  نسبة النجاح {summary.successRate}% · متوسط الاستجابة{' '}
                  <span dir="ltr">{summary.avgLatencyMs}ms</span>
                </div>
              </article>

              <article className="kpi-card">
                <div className="kpi-label">
                  <Cpu size={15} /> إجمالي التوكنز المستهلكة
                </div>
                <div className="kpi-value" dir="ltr">
                  {formatNumber(summary.totalTokens)}
                </div>
                <div className="kpi-meta">
                  إدخال:{' '}
                  <span dir="ltr">
                    {formatNumber(summary.totalInputTokens)}
                  </span>{' '}
                  · إخراج:{' '}
                  <span dir="ltr">
                    {formatNumber(summary.totalOutputTokens)}
                  </span>
                </div>
              </article>

              <article className="kpi-card">
                <div className="kpi-label">
                  <DollarSign size={15} /> التكلفة التقديرية لـ Gemini
                </div>
                <div className="kpi-value" dir="ltr">
                  {formatUsd(summary.estimatedCostUsd)}
                </div>
                <div className="kpi-meta" dir="ltr">
                  {uptime.liveStatus.aiService.model ||
                    'google/gemini-2.5-flash'}
                </div>
              </article>

              <article className="kpi-card">
                <div className="kpi-label">
                  <Server size={15} /> مدة تشغيل الخادم (Uptime)
                </div>
                <div className="kpi-value">
                  {formatUptime(uptime.apiUptimeSeconds)}
                </div>
                <div className="kpi-meta">
                  توافر القاعدة (24س):{' '}
                  {uptime.availability24h.databaseUptimePct}% · الذاكرة:{' '}
                  <span dir="ltr">{uptime.memoryRssMb} MB</span>
                </div>
              </article>

              <article className="kpi-card">
                <div className="kpi-label">
                  <Users size={15} /> المتدربون والبرامج النشطة
                </div>
                <div className="kpi-value" dir="ltr">
                  {formatNumber(platform.activeUsers)}
                </div>
                <div className="kpi-meta">
                  {formatNumber(platform.activeEnrollments)} مشترك ببرامج ·{' '}
                  {formatNumber(platform.publishedPrograms)} برنامج منشور
                </div>
              </article>

              <article className="kpi-card">
                <div className="kpi-label">
                  <Activity size={15} /> النشاط المسجل ({days} يوماً)
                </div>
                <div className="kpi-value" dir="ltr">
                  {formatNumber(platform.completedWorkouts)}
                </div>
                <div className="kpi-meta">
                  تمرين مكتمل · {formatNumber(platform.completedMeals)} وجبة ·{' '}
                  {formatNumber(platform.checkIns)} متابعة دورية
                </div>
              </article>
            </section>

            <section className="editor-panel panel-spaced">
              <div className="editor-body">
                <div className="section-heading">
                  <div>
                    <h2>الاستهلاك اليومي لتوكنز Gemini</h2>
                    <p>
                      توزيع الاستهلاك اليومي عبر وكلاء المطابقة وملاءمة التمارين
                      وصياغة النصوص.
                    </p>
                  </div>
                </div>
                {dailySeries.length === 0 ? (
                  <p className="inline-help">
                    لم تُسجّل استدعاءات لـ Gemini خلال آخر {days} يوماً بعد.
                    جرّب تشغيل محاكاة مطابقة أو تسجيل متدرب لتظهر البيانات هنا
                    فوراً.
                  </p>
                ) : (
                  <div className="usage-chart" role="list" dir="ltr">
                    {dailySeries.map((entry) => {
                      const heightPct = Math.max(
                        8,
                        Math.round(
                          ((Number(entry.totalTokens) || 0) / maxDailyTokens) *
                            100,
                        ),
                      );
                      return (
                        <div
                          className="usage-bar-col"
                          key={entry.date}
                          role="listitem"
                          title={`${entry.date}: ${formatNumber(entry.totalTokens)} tokens (${entry.requests} reqs, ${formatUsd(entry.estimatedCostUsd)})`}
                        >
                          <div className="usage-bar-value">
                            {formatNumber(entry.totalTokens)}
                          </div>
                          <div className="usage-bar-track">
                            <div
                              className="usage-bar-fill"
                              style={{ height: `${heightPct}%` }}
                            />
                          </div>
                          <div className="usage-bar-label">
                            {entry.date.slice(5)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <div className="field-grid panel-spaced">
              <section className="editor-panel">
                <div className="editor-body">
                  <div className="section-heading">
                    <div>
                      <h2>تفصيل الاستهلاك حسب الوكيل (AI Agent)</h2>
                      <p>
                        عدد الاستدعاءات والتوكنز ومتوسط زمن الاستجابة لكل وكيل.
                      </p>
                    </div>
                  </div>
                  {data.geminiUsage.byOperation.length === 0 ? (
                    <p className="inline-help">لا توجد استدعاءات مسجلة بعد.</p>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>الوكيل</th>
                            <th>الاستدعاءات</th>
                            <th>التوكنز</th>
                            <th>الزمن</th>
                            <th>التكلفة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.geminiUsage.byOperation.map((row) => (
                            <tr key={row.operation}>
                              <td>
                                <strong>
                                  {operationLabels[row.operation] ||
                                    row.operation}
                                </strong>
                                {row.failed > 0 && (
                                  <div className="muted-meta">
                                    {row.failed} فشل
                                  </div>
                                )}
                              </td>
                              <td dir="ltr">{formatNumber(row.requests)}</td>
                              <td dir="ltr">
                                {formatNumber(row.totalTokens)}
                                <div className="muted-meta">
                                  {formatNumber(row.inputTokens)} /{' '}
                                  {formatNumber(row.outputTokens)}
                                </div>
                              </td>
                              <td dir="ltr">{row.avgLatencyMs}ms</td>
                              <td dir="ltr">
                                {formatUsd(row.estimatedCostUsd)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>

              <section className="editor-panel">
                <div className="editor-body">
                  <div className="section-heading">
                    <div>
                      <h2>
                        <ShieldCheck size={18} className="heading-icon" />
                        حالة التوافر والتكاملات الحية
                      </h2>
                      <p>
                        حالة الاتصال المباشر بقاعدة البيانات وخدمة Gemini
                        والبريد والتخزين والمصادقة.
                      </p>
                    </div>
                  </div>
                  <div className="integration-grid">
                    {[
                      {
                        title: 'قاعدة البيانات (PostgreSQL)',
                        icon: Database,
                        meta: `زمن الاستجابة: ${uptime.liveStatus.database.latencyMs}ms · توافر 24س: ${uptime.availability24h.databaseUptimePct}%`,
                        status: uptime.integrations.database,
                      },
                      {
                        title: 'خدمة Gemini AI الجانبية',
                        meta:
                          uptime.liveStatus.aiService.status === 'UP'
                            ? `متصلة (${uptime.liveStatus.aiService.latencyMs}ms)${uptime.availability24h.aiServiceUptimePct != null ? ` · توافر 24س: ${uptime.availability24h.aiServiceUptimePct}%` : ''}`
                            : uptime.liveStatus.aiService.status ===
                                'NOT_CONFIGURED'
                              ? 'بانتظار ضبط GEMINI_API_KEY وإعادة النشر'
                              : 'تعذر الوصول إلى حاوية الذكاء الاصطناعي',
                        status: uptime.integrations.geminiAi,
                      },
                      {
                        title: 'البريد الإلكتروني (أكواد OTP)',
                        meta: uptime.integrations.email,
                        status: uptime.integrations.email,
                      },
                      {
                        title: 'تخزين الوسائط (AWS S3)',
                        meta: uptime.integrations.s3Storage,
                        status: uptime.integrations.s3Storage,
                      },
                      {
                        title: 'تسجيل الدخول عبر Google و Apple',
                        meta: `Google: ${uptime.integrations.googleOAuth === 'CONFIGURED' ? 'مُفعّل' : 'غير مُعدّ'} · Apple: ${uptime.integrations.appleOAuth === 'CONFIGURED' ? 'مُفعّل' : 'غير مُعدّ'}`,
                        status:
                          uptime.integrations.googleOAuth === 'CONFIGURED' ||
                          uptime.integrations.appleOAuth === 'CONFIGURED'
                            ? 'CONFIGURED'
                            : 'NOT_CONFIGURED',
                      },
                    ].map((row) => {
                      const badge = integrationStatusMeta(row.status);
                      return (
                        <div className="integration-pill" key={row.title}>
                          <div>
                            <strong>{row.title}</strong>
                            <div className="muted-meta">{row.meta}</div>
                          </div>
                          <Status
                            value={badge.tone}
                            customLabel={badge.label}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>

            <section className="editor-panel panel-spaced">
              <div className="editor-body">
                <div className="section-heading">
                  <div>
                    <h2>سجل أحدث استدعاءات Gemini</h2>
                    <p>
                      آخر 25 استدعاءً للموديل بالتوكنز وزمن الاستجابة (بيانات
                      تشغيلية فقط دون أي بيانات شخصية للمتدربين).
                    </p>
                  </div>
                </div>
                {data.geminiUsage.recentCalls.length === 0 ? (
                  <p className="inline-help">لا توجد استدعاءات حديثة بعد.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>التوقيت</th>
                          <th>الوكيل</th>
                          <th>الموديل</th>
                          <th>الحالة</th>
                          <th>التوكنز (إدخال / إخراج)</th>
                          <th>الزمن</th>
                          <th>التكلفة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.geminiUsage.recentCalls.map((call) => {
                          const badge = integrationStatusMeta(call.status);
                          return (
                            <tr key={call.id}>
                              <td dir="ltr">
                                {new Date(call.createdAt).toLocaleString(
                                  'ar-EG',
                                )}
                              </td>
                              <td>
                                {operationLabels[call.operation] ||
                                  call.operation}
                              </td>
                              <td dir="ltr">
                                <code>{call.model}</code>
                              </td>
                              <td>
                                <Status
                                  value={badge.tone}
                                  customLabel={badge.label}
                                />
                                {call.failureCode && (
                                  <div className="muted-meta" dir="ltr">
                                    {call.failureCode}
                                  </div>
                                )}
                              </td>
                              <td dir="ltr">
                                {formatNumber(call.totalTokens)} (
                                {formatNumber(call.inputTokens)} /{' '}
                                {formatNumber(call.outputTokens)})
                              </td>
                              <td dir="ltr">{call.latencyMs}ms</td>
                              <td dir="ltr">
                                {formatUsd(call.estimatedCostUsd)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </>
        )
      )}
    </>
  );
}
