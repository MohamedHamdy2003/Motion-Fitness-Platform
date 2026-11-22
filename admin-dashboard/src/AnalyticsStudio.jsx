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
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m ${s % 60}s`;
}

function formatNumber(val) {
  return new Intl.NumberFormat('en-US').format(Number(val) || 0);
}

function formatUsd(val) {
  const num = Number(val) || 0;
  return num < 0.01 && num > 0 ? `$${num.toFixed(6)}` : `$${num.toFixed(4)}`;
}

function statusBadge(value) {
  const upper = String(value || '').toUpperCase();
  if (
    upper === 'UP' ||
    upper === 'CONNECTED' ||
    upper === 'SUCCEEDED' ||
    upper === 'APPROVED' ||
    upper.startsWith('CONFIGURED')
  ) {
    return 'PUBLISHED';
  }
  if (
    upper === 'LOCAL_CAPTURE' ||
    upper === 'NOT_CONFIGURED' ||
    upper === 'NOT_APPROVED'
  ) {
    return 'DRAFT';
  }
  return 'ARCHIVED';
}

const operationLabels = {
  PROGRAM_MATCHING: 'Program Matching',
  EXERCISE_FITTING: 'Daily Exercise Fitting',
  INJURY_REWRITE: 'Injury Description Rewriter',
  PROGRAM_HINTS_REWRITE: 'Program Hints Rewriter',
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
      setNotice(
        `Live health check recorded — DB: ${probe.database.ok ? `${probe.database.latencyMs}ms` : 'ERROR'}, Gemini AI Sidecar: ${probe.aiService.status}.`,
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
          <h1>Analytics, Gemini Usage & Uptime</h1>
          <p>
            Monitor Gemini API token consumption, estimated cost, AI agent
            latency, live server uptime, and external integration readiness.
          </p>
        </div>
        <div className="actions">
          <select
            aria-label="Analytics period"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            type="button"
            className="button primary"
            disabled={checking || loading}
            onClick={triggerLiveProbe}
          >
            <RefreshCw size={17} />
            {checking ? 'Probing…' : 'Run Live Health Check'}
          </button>
        </div>
      </header>

      <ErrorNotice error={error} />
      <Notice text={notice} />

      {loading && !data ? (
        <div className="loading-list" role="status">
          <span className="spinner" /> Loading platform analytics…
        </div>
      ) : (
        data && (
          <>
            <section className="kpi-grid" aria-label="Key metrics">
              <article className="kpi-card">
                <div className="kpi-label">
                  <Sparkles size={16} /> Gemini Requests ({days}d)
                </div>
                <div className="kpi-value">
                  {formatNumber(summary.totalRequests)}
                </div>
                <div className="kpi-meta">
                  {summary.successRate}% success · {summary.avgLatencyMs}ms avg
                </div>
              </article>

              <article className="kpi-card">
                <div className="kpi-label">
                  <Cpu size={16} /> Total Gemini Tokens
                </div>
                <div className="kpi-value">
                  {formatNumber(summary.totalTokens)}
                </div>
                <div className="kpi-meta">
                  In: {formatNumber(summary.totalInputTokens)} · Out:{' '}
                  {formatNumber(summary.totalOutputTokens)}
                </div>
              </article>

              <article className="kpi-card">
                <div className="kpi-label">
                  <DollarSign size={16} /> Estimated Gemini Cost
                </div>
                <div className="kpi-value">
                  {formatUsd(summary.estimatedCostUsd)}
                </div>
                <div className="kpi-meta">
                  Model:{' '}
                  {uptime.liveStatus.aiService.model ||
                    'google/gemini-2.5-flash'}
                </div>
              </article>

              <article className="kpi-card">
                <div className="kpi-label">
                  <Server size={16} /> API Uptime & Availability
                </div>
                <div className="kpi-value">
                  {formatUptime(uptime.apiUptimeSeconds)}
                </div>
                <div className="kpi-meta">
                  DB 24h: {uptime.availability24h.databaseUptimePct}% · RAM:{' '}
                  {uptime.memoryRssMb} MB
                </div>
              </article>

              <article className="kpi-card">
                <div className="kpi-label">
                  <Users size={16} /> Athletes & Enrollments
                </div>
                <div className="kpi-value">
                  {formatNumber(platform.activeUsers)}
                </div>
                <div className="kpi-meta">
                  {formatNumber(platform.activeEnrollments)} enrolled ·{' '}
                  {formatNumber(platform.publishedPrograms)} published programs
                </div>
              </article>

              <article className="kpi-card">
                <div className="kpi-label">
                  <Activity size={16} /> Activity ({days}d)
                </div>
                <div className="kpi-value">
                  {formatNumber(platform.completedWorkouts)}
                </div>
                <div className="kpi-meta">
                  Workouts · {formatNumber(platform.completedMeals)} meals ·{' '}
                  {formatNumber(platform.checkIns)} check-ins
                </div>
              </article>
            </section>

            <section className="editor-panel" style={{ marginTop: 24 }}>
              <div className="editor-body">
                <div className="section-heading">
                  <div>
                    <h2>Daily Gemini Token Consumption</h2>
                    <p>
                      Daily token usage across matching, exercise fitting, and
                      rewriter agents.
                    </p>
                  </div>
                </div>
                {dailySeries.length === 0 ? (
                  <p className="inline-help">
                    No Gemini API calls have been recorded in the last {days}{' '}
                    days yet. Run a matching simulation or onboard an athlete to
                    see live usage telemetry here.
                  </p>
                ) : (
                  <div className="usage-chart" role="list">
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

            <div className="field-grid" style={{ marginTop: 24 }}>
              <section className="editor-panel">
                <div className="editor-body">
                  <div className="section-heading">
                    <div>
                      <h2>Gemini Usage by AI Agent</h2>
                      <p>Token volume, latency, and error count per agent.</p>
                    </div>
                  </div>
                  {data.geminiUsage.byOperation.length === 0 ? (
                    <p className="inline-help">No agent calls recorded yet.</p>
                  ) : (
                    <div className="content-table-wrap">
                      <table className="content-table">
                        <thead>
                          <tr>
                            <th>Agent</th>
                            <th>Calls</th>
                            <th>Tokens</th>
                            <th>Latency</th>
                            <th>Est. Cost</th>
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
                                    {row.failed} failed
                                  </div>
                                )}
                              </td>
                              <td>{formatNumber(row.requests)}</td>
                              <td>
                                {formatNumber(row.totalTokens)}
                                <div className="muted-meta">
                                  {formatNumber(row.inputTokens)} in /{' '}
                                  {formatNumber(row.outputTokens)} out
                                </div>
                              </td>
                              <td>{row.avgLatencyMs}ms</td>
                              <td>{formatUsd(row.estimatedCostUsd)}</td>
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
                        <ShieldCheck
                          size={18}
                          style={{
                            verticalAlign: 'text-bottom',
                            marginRight: 6,
                          }}
                        />
                        Live Uptime & Integrations Status
                      </h2>
                      <p>
                        Real-time connectivity for PostgreSQL, Gemini AI
                        sidecar, email, S3, and OAuth keys.
                      </p>
                    </div>
                  </div>
                  <div className="integration-grid">
                    <div className="integration-pill">
                      <div>
                        <strong>
                          <Database
                            size={14}
                            style={{ verticalAlign: 'middle', marginRight: 5 }}
                          />
                          PostgreSQL Database
                        </strong>
                        <div className="muted-meta">
                          Live latency: {uptime.liveStatus.database.latencyMs}ms
                          · 24h uptime:{' '}
                          {uptime.availability24h.databaseUptimePct}%
                        </div>
                      </div>
                      <Status
                        value={statusBadge(uptime.integrations.database)}
                      />
                    </div>

                    <div className="integration-pill">
                      <div>
                        <strong>Gemini AI Sidecar</strong>
                        <div className="muted-meta">
                          Status: {uptime.liveStatus.aiService.status}
                          {uptime.liveStatus.aiService.latencyMs != null
                            ? ` · ${uptime.liveStatus.aiService.latencyMs}ms`
                            : ''}
                          {uptime.availability24h.aiServiceUptimePct != null
                            ? ` · 24h: ${uptime.availability24h.aiServiceUptimePct}%`
                            : ''}
                        </div>
                      </div>
                      <Status
                        value={statusBadge(uptime.integrations.geminiAi)}
                      />
                    </div>

                    <div className="integration-pill">
                      <div>
                        <strong>Transactional Email (OTP)</strong>
                        <div className="muted-meta">
                          {uptime.integrations.email}
                        </div>
                      </div>
                      <Status value={statusBadge(uptime.integrations.email)} />
                    </div>

                    <div className="integration-pill">
                      <div>
                        <strong>S3 Media Storage</strong>
                        <div className="muted-meta">
                          {uptime.integrations.s3Storage}
                        </div>
                      </div>
                      <Status
                        value={statusBadge(uptime.integrations.s3Storage)}
                      />
                    </div>

                    <div className="integration-pill">
                      <div>
                        <strong>Google / Apple OAuth</strong>
                        <div className="muted-meta">
                          Google: {uptime.integrations.googleOAuth} · Apple:{' '}
                          {uptime.integrations.appleOAuth}
                        </div>
                      </div>
                      <Status
                        value={
                          uptime.integrations.googleOAuth === 'CONFIGURED' ||
                          uptime.integrations.appleOAuth === 'CONFIGURED'
                            ? 'PUBLISHED'
                            : 'DRAFT'
                        }
                      />
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <section className="editor-panel" style={{ marginTop: 24 }}>
              <div className="editor-body">
                <div className="section-heading">
                  <div>
                    <h2>Recent Gemini API Calls</h2>
                    <p>
                      Latest 25 model invocations with token counts, latency,
                      and failure codes (metadata only, zero user PII).
                    </p>
                  </div>
                </div>
                {data.geminiUsage.recentCalls.length === 0 ? (
                  <p className="inline-help">No recent Gemini calls yet.</p>
                ) : (
                  <div className="content-table-wrap">
                    <table className="content-table">
                      <thead>
                        <tr>
                          <th>Timestamp</th>
                          <th>Agent</th>
                          <th>Model</th>
                          <th>Status</th>
                          <th>Tokens (In / Out)</th>
                          <th>Latency</th>
                          <th>Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.geminiUsage.recentCalls.map((call) => (
                          <tr key={call.id}>
                            <td>{new Date(call.createdAt).toLocaleString()}</td>
                            <td>
                              {operationLabels[call.operation] ||
                                call.operation}
                            </td>
                            <td>{call.model}</td>
                            <td>
                              <Status value={statusBadge(call.status)} />
                              {call.failureCode && (
                                <div className="muted-meta">
                                  {call.failureCode}
                                </div>
                              )}
                            </td>
                            <td>
                              {formatNumber(call.totalTokens)} (
                              {formatNumber(call.inputTokens)} /{' '}
                              {formatNumber(call.outputTokens)})
                            </td>
                            <td>{call.latencyMs}ms</td>
                            <td>{formatUsd(call.estimatedCostUsd)}</td>
                          </tr>
                        ))}
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
