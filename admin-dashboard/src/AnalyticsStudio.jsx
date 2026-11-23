import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Cloud,
  Cpu,
  Database,
  DollarSign,
  KeyRound,
  Layers3,
  Mail,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  AGENT_LABELS,
  MotionAgentDonut,
  MotionLatencyBarChart,
  MotionTrendChart,
} from './AnalyticsCharts';
import { ButtonContent, ErrorNotice, Notice, Status } from './ui';
import './analytics.css';

const RANGE_OPTIONS = [
  { days: 7, label: '7 أيام' },
  { days: 30, label: '30 يوماً' },
  { days: 90, label: '90 يوماً' },
];

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
  if (upper === 'UP')
    return { tone: 'PUBLISHED', pill: 'is-green', label: 'يعمل' };
  if (upper === 'CONNECTED')
    return { tone: 'PUBLISHED', pill: 'is-green', label: 'متصل' };
  if (upper === 'SUCCEEDED')
    return { tone: 'PUBLISHED', pill: 'is-green', label: 'ناجح' };
  if (upper === 'APPROVED')
    return { tone: 'PUBLISHED', pill: 'is-green', label: 'مُفعّل' };
  if (upper.startsWith('CONFIGURED'))
    return { tone: 'PUBLISHED', pill: 'is-green', label: 'مُعدّ' };
  if (upper === 'LOCAL_CAPTURE')
    return { tone: 'DRAFT', pill: 'is-amber', label: 'وضع محلي' };
  if (upper === 'NOT_CONFIGURED' || upper === 'NOT_APPROVED')
    return { tone: 'DRAFT', pill: 'is-amber', label: 'غير مُفعّل' };
  if (upper === 'FAILED')
    return { tone: 'ARCHIVED', pill: 'is-red', label: 'فشل' };
  return { tone: 'ARCHIVED', pill: 'is-red', label: 'متوقف' };
}

function AnalyticsSkeleton() {
  return (
    <div
      className="rst-analytics"
      aria-label="جارٍ تحميل مؤشرات النظام"
      aria-busy="true"
      role="status"
    >
      <div className="rst-sk-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="rst-sk-card" />
        ))}
      </div>
      <div className="rst-grid-primary">
        <div className="rst-sk-chart" />
        <div className="rst-sk-chart" />
      </div>
    </div>
  );
}

export function AnalyticsStudio({ api, onNavigate }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');

  const loadOverview = useCallback(
    async (period) => {
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
    },
    [api],
  );

  useEffect(() => {
    void loadOverview(days);
  }, [days, loadOverview]);

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
  const byOperation = data?.geminiUsage?.byOperation || [];
  const recentCalls = data?.geminiUsage?.recentCalls || [];
  const recentChecks = uptime?.recentChecks || [];

  const totalTokensForBar = Math.max(
    1,
    (summary?.totalInputTokens || 0) + (summary?.totalOutputTokens || 0),
  );
  const inputPct = Math.round(
    ((summary?.totalInputTokens || 0) / totalTokensForBar) * 100,
  );
  const outputPct = Math.max(0, 100 - inputPct);

  const maxOpTokens = Math.max(
    1,
    ...byOperation.map((row) => Number(row.totalTokens) || 0),
  );

  const engagementRows = platform
    ? [
        {
          key: 'activeUsers',
          label: 'المتدربون النشطون',
          sub: `من إجمالي ${formatNumber(platform.totalUsers)} مستخدم مسجّل`,
          value: Number(platform.activeUsers) || 0,
        },
        {
          key: 'onboardedUsers',
          label: 'مكتملو ملف التعريف (Onboarding)',
          sub: 'حسابات جاهزة للمطابقة التلقائية',
          value: Number(platform.onboardedUsers) || 0,
        },
        {
          key: 'activeEnrollments',
          label: 'الاشتراكات النشطة في البرامج',
          sub: `${formatNumber(platform.publishedPrograms)} برنامج منشور حالياً`,
          value: Number(platform.activeEnrollments) || 0,
        },
        {
          key: 'completedWorkouts',
          label: `جلسات التمرين المكتملة (${days} يوماً)`,
          sub: 'الالتزام بالتمارين اليومية',
          value: Number(platform.completedWorkouts) || 0,
        },
        {
          key: 'completedMeals',
          label: `الوجبات المكتملة (${days} يوماً)`,
          sub: `${formatNumber(platform.checkIns)} متابعة وزن خلال الفترة`,
          value: Number(platform.completedMeals) || 0,
        },
      ]
    : [];
  const maxEngagement = Math.max(1, ...engagementRows.map((r) => r.value));

  const liveAlerts = [];
  if (uptime) {
    if (!uptime.liveStatus.database.ok) {
      liveAlerts.push({
        key: 'db-down',
        tone: 'is-danger',
        text: 'تنبيه عاجل: تعذر الاتصال بقاعدة البيانات PostgreSQL',
      });
    }
    if (uptime.liveStatus.aiService.status === 'DOWN') {
      liveAlerts.push({
        key: 'ai-down',
        tone: 'is-danger',
        text: 'حاوية Gemini AI لا تستجيب حالياً',
      });
    } else if (uptime.liveStatus.aiService.status === 'NOT_CONFIGURED') {
      liveAlerts.push({
        key: 'ai-unconfigured',
        tone: 'is-warning',
        text: 'خدمة Gemini AI بانتظار استكمال إعداد المتغيرات',
      });
    }
    if ((summary?.failedRequests || 0) > 0) {
      liveAlerts.push({
        key: 'ai-failures',
        tone: 'is-warning',
        text: `${formatNumber(summary.failedRequests)} استدعاء فاشل لـ Gemini خلال آخر ${days} يوماً`,
      });
    }
    if (uptime.integrations.s3Storage === 'NOT_CONFIGURED') {
      liveAlerts.push({
        key: 's3-info',
        tone: 'is-info',
        text: 'تخزين الوسائط AWS S3 غير مُعدّ بعد',
      });
    }
  }

  return (
    <div className="rst-analytics" data-refreshing={loading && Boolean(data)}>
      <section
        className="rst-hero"
        aria-label="تحليلات المنصة واختيار الفترة الزمنية"
      >
        <div className="rst-hero-brand">
          <div className="rst-hero-eyebrow">
            <span className="rst-hero-dot" aria-hidden="true" />
            <span>منصة Motion · المتابعة التشغيلية</span>
          </div>
          <h1 className="rst-hero-title">
            التحليلات واستهلاك Gemini وصحة النظام
          </h1>
          <p className="rst-hero-sub">
            متابعة استهلاك التوكنز والتكلفة التقديرية لوكلاء Gemini، زمن تشغيل
            الخادم، وجاهزية التكاملات الحية.
          </p>
        </div>

        <div className="rst-controls">
          <div
            className="rst-seg"
            role="group"
            aria-label="الفترة الزمنية للتحليلات"
          >
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.days}
                type="button"
                className={days === option.days ? 'active' : ''}
                aria-pressed={days === option.days}
                onClick={() => setDays(option.days)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={'rst-refresh-btn' + (loading ? ' spinning' : '')}
            aria-label="تحديث البيانات"
            title="تحديث البيانات"
            disabled={loading}
            onClick={() => void loadOverview(days)}
          >
            <RefreshCw size={17} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="button action"
            disabled={checking || loading}
            onClick={triggerLiveProbe}
          >
            <ButtonContent busy={checking}>
              <span>فحص صحة النظام الآن</span>
              <ArrowLeft size={17} aria-hidden="true" />
            </ButtonContent>
          </button>
        </div>
      </section>

      <ErrorNotice error={error} onRetry={() => void loadOverview(days)} />
      <Notice text={notice} />

      {loading && !data && <AnalyticsSkeleton />}

      {data && summary && platform && uptime && (
        <>
          <section className="rst-alerts" aria-label="تنبيهات النظام الحية">
            {liveAlerts.length > 0 ? (
              liveAlerts.map((alert) => (
                <div
                  key={alert.key}
                  className={`rst-alert-pill ${alert.tone}`}
                  role="status"
                >
                  <AlertTriangle size={15} aria-hidden="true" />
                  <span>{alert.text}</span>
                </div>
              ))
            ) : (
              <div className="rst-alert-pill is-ok" role="status">
                <CheckCircle2 size={15} aria-hidden="true" />
                <span>
                  النظام يعمل بسلاسة — قاعدة البيانات وخدمة Gemini تعمل بكفاءة
                  ولا توجد تنبيهات عاجلة الآن.
                </span>
              </div>
            )}
          </section>

          <section
            className="rst-kpi-grid"
            aria-label="المؤشرات التنفيذية لمنصة Motion"
          >
            <article className="rst-kpi">
              <div className="rst-kpi-top">
                <span className="rst-kpi-label">
                  <span className="rst-kpi-ico is-emerald" aria-hidden="true">
                    <Sparkles size={17} />
                  </span>
                  طلبات Gemini ({days} يوماً)
                </span>
                <span
                  className={
                    'rst-delta numeric ' +
                    (summary.successRate >= 95
                      ? 'is-good'
                      : summary.successRate >= 80
                        ? 'is-flat'
                        : 'is-bad')
                  }
                >
                  نجاح {summary.successRate}%
                </span>
              </div>
              <div className="rst-kpi-val numeric" dir="ltr">
                {formatNumber(summary.totalRequests)}
              </div>
              <div className="rst-kpi-foot numeric">
                متوسط الاستجابة: <bdi>{summary.avgLatencyMs}ms</bdi> · فشل:{' '}
                {formatNumber(summary.failedRequests)}
              </div>
            </article>

            <article className="rst-kpi">
              <div className="rst-kpi-top">
                <span className="rst-kpi-label">
                  <span className="rst-kpi-ico is-orange" aria-hidden="true">
                    <Cpu size={17} />
                  </span>
                  إجمالي التوكنز المستهلكة
                </span>
              </div>
              <div className="rst-kpi-val numeric" dir="ltr">
                {formatNumber(summary.totalTokens)}
              </div>
              <div className="rst-bar" aria-hidden="true">
                <span
                  style={{
                    width: `${inputPct}%`,
                    background: 'var(--chart-line)',
                  }}
                />
                <span
                  style={{
                    width: `${outputPct}%`,
                    background: 'var(--chart-accent)',
                  }}
                />
              </div>
              <div className="rst-kpi-foot numeric">
                إدخال: <bdi>{formatNumber(summary.totalInputTokens)}</bdi> ·
                إخراج: <bdi>{formatNumber(summary.totalOutputTokens)}</bdi>
              </div>
            </article>

            <article className="rst-kpi">
              <div className="rst-kpi-top">
                <span className="rst-kpi-label">
                  <span className="rst-kpi-ico is-gold" aria-hidden="true">
                    <DollarSign size={17} />
                  </span>
                  التكلفة التقديرية لـ Gemini
                </span>
              </div>
              <div className="rst-kpi-val numeric" dir="ltr">
                {formatUsd(summary.estimatedCostUsd)}
              </div>
              <div className="rst-kpi-foot" dir="ltr">
                {uptime.liveStatus.aiService.model || 'google/gemini-2.5-flash'}
              </div>
            </article>

            <article className="rst-kpi">
              <div className="rst-kpi-top">
                <span className="rst-kpi-label">
                  <span className="rst-kpi-ico is-emerald" aria-hidden="true">
                    <Server size={17} />
                  </span>
                  مدة تشغيل الخادم (Uptime)
                </span>
                <span className="rst-delta is-good numeric">
                  {uptime.availability24h.databaseUptimePct}%
                </span>
              </div>
              <div className="rst-kpi-val">
                {formatUptime(uptime.apiUptimeSeconds)}
              </div>
              <div className="rst-kpi-foot numeric">
                توافر القاعدة (24س) · الذاكرة:{' '}
                <bdi>{uptime.memoryRssMb} MB</bdi>
              </div>
            </article>

            <button
              type="button"
              className="rst-kpi"
              onClick={() => onNavigate?.({ section: 'programs' })}
            >
              <div className="rst-kpi-top">
                <span className="rst-kpi-label">
                  <span className="rst-kpi-ico is-blue" aria-hidden="true">
                    <Users size={17} />
                  </span>
                  المتدربون والبرامج النشطة
                </span>
              </div>
              <div className="rst-kpi-val numeric" dir="ltr">
                {formatNumber(platform.activeUsers)}
              </div>
              <div className="rst-kpi-foot numeric">
                {formatNumber(platform.activeEnrollments)} مشترك ·{' '}
                {formatNumber(platform.publishedPrograms)} برنامج منشور ←
              </div>
            </button>

            <article className="rst-kpi">
              <div className="rst-kpi-top">
                <span className="rst-kpi-label">
                  <span className="rst-kpi-ico is-emerald" aria-hidden="true">
                    <Activity size={17} />
                  </span>
                  النشاط المسجل ({days} يوماً)
                </span>
              </div>
              <div className="rst-kpi-val numeric" dir="ltr">
                {formatNumber(platform.completedWorkouts)}
              </div>
              <div className="rst-kpi-foot numeric">
                تمرين مكتمل · {formatNumber(platform.completedMeals)} وجبة ·{' '}
                {formatNumber(platform.checkIns)} متابعة وزن
              </div>
            </article>
          </section>

          <div className="rst-grid-primary">
            <MotionTrendChart series={dailySeries} />
            <MotionAgentDonut operations={byOperation} />
          </div>

          <div className="rst-grid-secondary">
            <MotionLatencyBarChart checks={recentChecks} />

            <section className="panel rst-card">
              <div className="rst-card-head">
                <div>
                  <h2>
                    <ShieldCheck size={17} className="heading-icon" />
                    حالة التكاملات والخدمات الحية
                  </h2>
                  <p className="rst-card-sub">
                    ملخص الاتصال المباشر بقواعد البيانات والذكاء الاصطناعي
                    والمصادقة
                  </p>
                </div>
              </div>

              <div className="rst-menu-rows">
                {[
                  {
                    title: 'قاعدة البيانات PostgreSQL',
                    Icon: Database,
                    meta: `${uptime.liveStatus.database.latencyMs}ms · توافر ${uptime.availability24h.databaseUptimePct}%`,
                    status: uptime.integrations.database,
                  },
                  {
                    title: 'خدمة Gemini AI الجانبية',
                    Icon: Sparkles,
                    meta:
                      uptime.liveStatus.aiService.status === 'UP'
                        ? `${uptime.liveStatus.aiService.latencyMs}ms`
                        : 'تحقق من الإعداد',
                    status: uptime.integrations.geminiAi,
                  },
                  {
                    title: 'البريد الإلكتروني (OTP)',
                    Icon: Mail,
                    meta: uptime.integrations.email,
                    status: uptime.integrations.email,
                  },
                  {
                    title: 'تخزين الوسائط AWS S3',
                    Icon: Cloud,
                    meta: uptime.integrations.s3Storage,
                    status: uptime.integrations.s3Storage,
                  },
                  {
                    title: 'مصادقة Google و Apple',
                    Icon: KeyRound,
                    meta: `G: ${uptime.integrations.googleOAuth === 'CONFIGURED' ? 'مُفعّل' : '—'} · A: ${uptime.integrations.appleOAuth === 'CONFIGURED' ? 'مُفعّل' : '—'}`,
                    status:
                      uptime.integrations.googleOAuth === 'CONFIGURED' ||
                      uptime.integrations.appleOAuth === 'CONFIGURED'
                        ? 'CONFIGURED'
                        : 'NOT_CONFIGURED',
                  },
                ].map((row) => {
                  const badge = integrationStatusMeta(row.status);
                  return (
                    <div className="rst-menu-row" key={row.title}>
                      <span className="rst-menu-title">
                        <row.Icon size={16} aria-hidden="true" />
                        {row.title}
                      </span>
                      <span className="rst-pills numeric">
                        <span className="rst-pill" dir="ltr">
                          {row.meta}
                        </span>
                        <span className={`rst-pill ${badge.pill}`}>
                          {badge.label}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="rst-quick">
                <button
                  type="button"
                  className="button primary"
                  onClick={() => onNavigate?.({ section: 'matching' })}
                >
                  إدارة المطابقة الذكية
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => onNavigate?.({ section: 'programs' })}
                >
                  إدارة البرامج
                </button>
              </div>
            </section>
          </div>

          <div className="rst-grid-tables">
            <section className="panel rst-card">
              <div className="rst-card-head">
                <div>
                  <h2>أداء وكلاء الذكاء الاصطناعي</h2>
                  <p className="rst-card-sub">
                    ترتيب الوكلاء حسب حجم استهلاك التوكنز ومتوسط زمن الاستجابة
                  </p>
                </div>
              </div>

              {byOperation.length === 0 ? (
                <div className="rst-chart-empty">
                  <p>لا توجد استدعاءات مسجلة للوكلاء خلال هذه الفترة.</p>
                </div>
              ) : (
                <ol className="rst-rank-list">
                  {byOperation.map((row, idx) => {
                    const pct = Math.max(
                      8,
                      Math.round(
                        ((Number(row.totalTokens) || 0) / maxOpTokens) * 100,
                      ),
                    );
                    return (
                      <li key={row.operation} className="rst-rank-row">
                        <span
                          className={
                            'rst-rank-num numeric' +
                            (idx === 0 ? ' is-top' : '')
                          }
                        >
                          {idx + 1}
                        </span>
                        <div className="rst-rank-main">
                          <span className="rst-rank-title">
                            {AGENT_LABELS[row.operation] || row.operation}
                          </span>
                          <span className="rst-rank-sub numeric">
                            <span>{formatNumber(row.requests)} استدعاء</span>
                            <span>
                              متوسط <bdi>{row.avgLatencyMs}ms</bdi>
                            </span>
                            {row.failed > 0 && (
                              <span className="rst-pill is-red">
                                {row.failed} فشل
                              </span>
                            )}
                          </span>
                          <div className="rst-share-bar" aria-hidden="true">
                            <span
                              style={{
                                width: `${pct}%`,
                                background:
                                  idx === 0
                                    ? 'var(--chart-accent)'
                                    : 'var(--chart-line)',
                              }}
                            />
                          </div>
                        </div>
                        <div className="rst-rank-end numeric" dir="ltr">
                          <strong>{formatNumber(row.totalTokens)}</strong>
                          <small>{formatUsd(row.estimatedCostUsd)}</small>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            <section className="panel rst-card">
              <div className="rst-card-head">
                <div>
                  <h2>نشاط المتدربين والمنصة</h2>
                  <p className="rst-card-sub">
                    توزيع الاستخدام الفعلي عبر البرامج والتمارين والوجبات
                  </p>
                </div>
              </div>

              <ol className="rst-rank-list">
                {engagementRows.map((row, idx) => {
                  const pct =
                    row.value > 0
                      ? Math.max(
                          8,
                          Math.round((row.value / maxEngagement) * 100),
                        )
                      : 0;
                  return (
                    <li key={row.key} className="rst-rank-row">
                      <span
                        className={
                          'rst-rank-num numeric' + (idx === 0 ? ' is-top' : '')
                        }
                      >
                        {idx + 1}
                      </span>
                      <div className="rst-rank-main">
                        <span className="rst-rank-title">
                          <Layers3 size={13} aria-hidden="true" /> {row.label}
                        </span>
                        <span className="rst-rank-sub">{row.sub}</span>
                        <div className="rst-share-bar" aria-hidden="true">
                          <span style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="rst-rank-end numeric" dir="ltr">
                        <strong>{formatNumber(row.value)}</strong>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>

          <section className="panel rst-card">
            <div className="rst-card-head">
              <div>
                <h2>سجل أحدث استدعاءات Gemini</h2>
                <p className="rst-card-sub">
                  آخر 25 استدعاءً للموديل بالتوكنز وزمن الاستجابة (بيانات
                  تشغيلية فقط دون أي بيانات شخصية للمتدربين)
                </p>
              </div>
            </div>

            {recentCalls.length === 0 ? (
              <div className="rst-chart-empty">
                <p>لا توجد استدعاءات حديثة مسجلة بعد.</p>
              </div>
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
                    {recentCalls.map((call) => {
                      const badge = integrationStatusMeta(call.status);
                      return (
                        <tr key={call.id}>
                          <td dir="ltr">
                            {new Date(call.createdAt).toLocaleString('ar-EG')}
                          </td>
                          <td>
                            <strong>
                              {AGENT_LABELS[call.operation] || call.operation}
                            </strong>
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
                          <td className="numeric" dir="ltr">
                            {formatNumber(call.totalTokens)} (
                            {formatNumber(call.inputTokens)} /{' '}
                            {formatNumber(call.outputTokens)})
                          </td>
                          <td className="numeric" dir="ltr">
                            {call.latencyMs}ms
                          </td>
                          <td className="numeric" dir="ltr">
                            {formatUsd(call.estimatedCostUsd)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
