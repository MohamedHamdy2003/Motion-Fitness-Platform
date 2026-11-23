import { useMemo, useState } from 'react';

export const AGENT_LABELS = {
  PROGRAM_MATCHING: 'مطابقة البرامج',
  EXERCISE_FITTING: 'ملاءمة التمارين',
  INJURY_REWRITE: 'تحسين وصف الإصابات',
  PROGRAM_HINTS_REWRITE: 'صياغة تلميحات البرامج',
};

const AGENT_COLORS = {
  PROGRAM_MATCHING: 'var(--chart-line)',
  EXERCISE_FITTING: 'var(--chart-accent)',
  INJURY_REWRITE: 'var(--chart-blue)',
  PROGRAM_HINTS_REWRITE: 'var(--chart-amber)',
};

const FALLBACK_COLORS = [
  'var(--chart-line)',
  'var(--chart-accent)',
  'var(--chart-blue)',
  'var(--chart-teal)',
  'var(--chart-amber)',
];

function shortCairoDate(isoDate) {
  const [y, m, d] = String(isoDate || '')
    .split('-')
    .map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('ar-EG', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(dt);
}

function shortCairoTime(isoTimestamp) {
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'Africa/Cairo',
    }).format(new Date(isoTimestamp));
  } catch {
    return '';
  }
}

function compactNumber(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  if (value > 0 && value < 1) return value.toFixed(3);
  return String(Math.round(value));
}

function formatNumber(val) {
  return new Intl.NumberFormat('en-US').format(Number(val) || 0);
}

function formatUsd(val) {
  const num = Number(val) || 0;
  return num < 0.01 && num > 0 ? `$${num.toFixed(6)}` : `$${num.toFixed(4)}`;
}

export function MotionTrendChart({ series }) {
  const [metric, setMetric] = useState('tokens');
  const [activeIndex, setActiveIndex] = useState(null);

  const values = useMemo(
    () =>
      series.map((p) =>
        metric === 'tokens'
          ? Number(p.totalTokens) || 0
          : metric === 'requests'
            ? Number(p.requests) || 0
            : Number(p.estimatedCostUsd) || 0,
      ),
    [series, metric],
  );
  const maxVal = useMemo(() => Math.max(0, ...values), [values]);
  const hasData = maxVal > 0;

  const width = 640;
  const height = 228;
  const padTop = 18;
  const padRight = 22;
  const padBottom = 34;
  const padLeft = 58;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const yCeiling = hasData ? maxVal * 1.15 : 10;

  const points = useMemo(() => {
    if (!series.length) return [];
    return series.map((point, index) => {
      const x =
        series.length === 1
          ? padLeft + plotW / 2
          : padLeft + (index / (series.length - 1)) * plotW;
      const val = values[index] ?? 0;
      const y = padTop + plotH - (val / yCeiling) * plotH;
      return { x, y, val, point, index };
    });
  }, [series, values, plotW, plotH, yCeiling]);

  const linePath = useMemo(() => {
    if (points.length < 2) return '';
    return points
      .map(
        (p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
      )
      .join(' ');
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length < 2) return '';
    const first = points[0];
    const last = points[points.length - 1];
    const baseY = padTop + plotH;
    return `${linePath} L ${last.x.toFixed(1)} ${baseY} L ${first.x.toFixed(1)} ${baseY} Z`;
  }, [points, linePath, plotH]);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    ratio,
    value: yCeiling * ratio,
    y: padTop + plotH - ratio * plotH,
  }));

  const xLabelIndices = useMemo(() => {
    if (series.length <= 6) return series.map((_, i) => i);
    const last = series.length - 1;
    const step = Math.max(2, Math.round(last / 4));
    const minGap = Math.max(2, Math.floor(step * 0.65));
    const set = new Set([0, last]);
    for (let i = step; i <= last - minGap; i += step) set.add(i);
    return [...set].sort((a, b) => a - b);
  }, [series]);

  const hovered =
    activeIndex !== null && points[activeIndex] ? points[activeIndex] : null;

  return (
    <section className="panel rst-card">
      <div className="rst-card-head">
        <div>
          <h2>منحنى استهلاك Gemini اليومي</h2>
          <p className="rst-card-sub">
            {metric === 'tokens'
              ? 'إجمالي التوكنز المستهلكة يومياً عبر جميع وكلاء الذكاء الاصطناعي'
              : metric === 'requests'
                ? 'عدد الاستدعاءات اليومية المرسلة لخدمة Gemini'
                : 'التكلفة التقديرية اليومية لـ Gemini بالدولار (USD)'}
          </p>
        </div>
        <div
          className="rst-seg rst-seg-sm"
          role="group"
          aria-label="معيار منحنى استهلاك Gemini"
        >
          <button
            type="button"
            className={metric === 'tokens' ? 'active' : ''}
            aria-pressed={metric === 'tokens'}
            onClick={() => setMetric('tokens')}
          >
            التوكنز
          </button>
          <button
            type="button"
            className={metric === 'requests' ? 'active' : ''}
            aria-pressed={metric === 'requests'}
            onClick={() => setMetric('requests')}
          >
            الطلبات
          </button>
          <button
            type="button"
            className={metric === 'cost' ? 'active' : ''}
            aria-pressed={metric === 'cost'}
            onClick={() => setMetric('cost')}
          >
            التكلفة
          </button>
        </div>
      </div>

      {!hasData ? (
        <div className="rst-chart-empty">
          <p>
            لا توجد استدعاءات كافية للرسم خلال الفترة المختارة. جرّب تشغيل
            محاكاة مطابقة لتظهر البيانات فوراً.
          </p>
        </div>
      ) : (
        <div
          className="rst-chart-stage"
          onMouseLeave={() => setActiveIndex(null)}
        >
          {hovered && (
            <div className="rst-tooltip" role="status">
              <strong>{shortCairoDate(hovered.point.date)}</strong>
              <span className="numeric">
                التوكنز: <bdi>{formatNumber(hovered.point.totalTokens)}</bdi>
              </span>
              <span className="numeric">
                الطلبات: {hovered.point.requests}
                {hovered.point.failed > 0
                  ? ` (${hovered.point.failed} فشل)`
                  : ' (100% نجاح)'}
              </span>
              <span className="numeric">
                التكلفة: <bdi>{formatUsd(hovered.point.estimatedCostUsd)}</bdi>
              </span>
            </div>
          )}
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="rst-svg"
            role="img"
            aria-label="رسم بياني لاستهلاك Gemini اليومي"
          >
            <defs>
              <linearGradient id="motionTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  style={{ stopColor: 'var(--chart-line)', stopOpacity: 0.28 }}
                />
                <stop
                  offset="100%"
                  style={{ stopColor: 'var(--chart-line)', stopOpacity: 0.01 }}
                />
              </linearGradient>
            </defs>

            {yTicks.map((tick) => (
              <g key={tick.ratio}>
                <line
                  x1={padLeft}
                  y1={tick.y}
                  x2={width - padRight}
                  y2={tick.y}
                  stroke="var(--chart-grid)"
                  strokeDasharray={tick.ratio === 0 ? undefined : '3 4'}
                />
                <text
                  x={padLeft - 10}
                  y={tick.y + 4}
                  textAnchor="end"
                  className="rst-axis-text rst-axis-num"
                >
                  {metric === 'cost'
                    ? `$${compactNumber(tick.value)}`
                    : compactNumber(tick.value)}
                </text>
              </g>
            ))}

            {points.length === 1 ? (
              <rect
                x={points[0].x - 28}
                y={points[0].y}
                width={56}
                height={Math.max(6, padTop + plotH - points[0].y)}
                rx={8}
                fill="var(--chart-line)"
                tabIndex={0}
                role="button"
                aria-label={`${shortCairoDate(points[0].point.date)}: ${formatNumber(points[0].point.totalTokens)} توكن`}
                onMouseEnter={() => setActiveIndex(0)}
                onFocus={() => setActiveIndex(0)}
                onBlur={() => setActiveIndex(null)}
                onClick={() => setActiveIndex((cur) => (cur === 0 ? null : 0))}
              />
            ) : (
              <>
                <path d={areaPath} fill="url(#motionTrendFill)" />
                <path
                  d={linePath}
                  fill="none"
                  stroke="var(--chart-line)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}

            {hovered && (
              <line
                x1={hovered.x}
                y1={padTop}
                x2={hovered.x}
                y2={padTop + plotH}
                stroke="var(--chart-accent)"
                strokeWidth="1.25"
                strokeDasharray="3 3"
              />
            )}

            {points.map((pt) => {
              const isActive = activeIndex === pt.index;
              const hitW =
                points.length > 1 ? Math.max(10, plotW / points.length) : plotW;
              return (
                <g key={pt.point.date}>
                  <rect
                    x={Math.max(padLeft, pt.x - hitW / 2)}
                    y={padTop}
                    width={hitW}
                    height={plotH}
                    fill="transparent"
                    className="rst-hit"
                    tabIndex={0}
                    role="button"
                    aria-label={`${shortCairoDate(pt.point.date)}: ${pt.point.requests} طلب`}
                    onMouseEnter={() => setActiveIndex(pt.index)}
                    onFocus={() => setActiveIndex(pt.index)}
                    onBlur={() => setActiveIndex(null)}
                    onClick={() =>
                      setActiveIndex((cur) =>
                        cur === pt.index ? null : pt.index,
                      )
                    }
                  />
                  {(isActive || points.length <= 14) && (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isActive ? 5.5 : 3}
                      fill={
                        isActive
                          ? 'var(--chart-accent)'
                          : 'var(--chart-dot-fill)'
                      }
                      stroke={
                        isActive
                          ? 'var(--chart-dot-active-stroke)'
                          : 'var(--chart-line)'
                      }
                      strokeWidth={isActive ? 2.5 : 2}
                    />
                  )}
                </g>
              );
            })}

            {xLabelIndices.map((idx) => {
              const pt = points[idx];
              if (!pt) return null;
              return (
                <text
                  key={pt.point.date}
                  x={pt.x}
                  y={height - 10}
                  textAnchor="middle"
                  className="rst-axis-text"
                >
                  {shortCairoDate(pt.point.date)}
                </text>
              );
            })}
          </svg>
        </div>
      )}
    </section>
  );
}

export function MotionAgentDonut({ operations }) {
  const [mode, setMode] = useState('requests');
  const [hoveredKey, setHoveredKey] = useState(null);

  const items = useMemo(() => {
    return (operations || []).map((row, idx) => ({
      key: row.operation,
      label: AGENT_LABELS[row.operation] || row.operation,
      value:
        mode === 'requests'
          ? Number(row.requests) || 0
          : Number(row.totalTokens) || 0,
      requests: Number(row.requests) || 0,
      tokens: Number(row.totalTokens) || 0,
      color:
        AGENT_COLORS[row.operation] ||
        FALLBACK_COLORS[idx % FALLBACK_COLORS.length],
    }));
  }, [operations, mode]);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.value, 0),
    [items],
  );

  const radius = 58;
  const circumference = 2 * Math.PI * radius;

  const segments = useMemo(() => {
    if (!total) return [];
    let offset = 0;
    return items
      .filter((item) => item.value > 0)
      .map((item) => {
        const share = item.value / total;
        const dash = share * circumference;
        const seg = {
          ...item,
          pct: Math.round(share * 1000) / 10,
          dash,
          offset,
        };
        offset += dash;
        return seg;
      });
  }, [items, total, circumference]);

  const activeSeg = hoveredKey
    ? segments.find((s) => s.key === hoveredKey) || null
    : null;

  return (
    <section className="panel rst-card">
      <div className="rst-card-head">
        <div>
          <h2>توزيع استخدام وكلاء Gemini</h2>
          <p className="rst-card-sub">حصة كل وكيل ذكاء اصطناعي خلال الفترة</p>
        </div>
        <div
          className="rst-seg rst-seg-sm"
          role="group"
          aria-label="نوع التوزيع"
        >
          <button
            type="button"
            className={mode === 'requests' ? 'active' : ''}
            aria-pressed={mode === 'requests'}
            onClick={() => setMode('requests')}
          >
            الاستدعاءات
          </button>
          <button
            type="button"
            className={mode === 'tokens' ? 'active' : ''}
            aria-pressed={mode === 'tokens'}
            onClick={() => setMode('tokens')}
          >
            التوكنز
          </button>
        </div>
      </div>

      {!total ? (
        <div className="rst-chart-empty">
          <p>لا توجد بيانات توزيع للوكلاء خلال هذه الفترة بعد.</p>
        </div>
      ) : (
        <div className="rst-donut-layout">
          <div className="rst-donut-wrap">
            <svg
              viewBox="0 0 160 160"
              className="rst-donut-svg"
              role="img"
              aria-label="توزيع استدعاءات وكلاء Gemini"
            >
              <circle
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke="var(--chart-track)"
                strokeWidth="18"
              />
              <g transform="rotate(-90 80 80)">
                {segments.map((seg) => {
                  const isHovered = hoveredKey === seg.key;
                  return (
                    <circle
                      key={seg.key}
                      cx="80"
                      cy="80"
                      r={radius}
                      fill="none"
                      stroke={seg.color}
                      strokeWidth={isHovered ? 22 : 18}
                      strokeDasharray={`${Math.max(1.5, seg.dash - 1.2)} ${circumference}`}
                      strokeDashoffset={-seg.offset}
                      className="rst-donut-seg"
                      tabIndex={0}
                      role="button"
                      aria-label={`${seg.label}: ${formatNumber(seg.value)} (${seg.pct}%)`}
                      onMouseEnter={() => setHoveredKey(seg.key)}
                      onMouseLeave={() => setHoveredKey(null)}
                      onFocus={() => setHoveredKey(seg.key)}
                      onBlur={() => setHoveredKey(null)}
                    />
                  );
                })}
              </g>
            </svg>
            <div className="rst-donut-center">
              <strong className="numeric" dir="ltr">
                {compactNumber(activeSeg ? activeSeg.value : total)}
              </strong>
              <span>
                {activeSeg
                  ? `${activeSeg.label} (${activeSeg.pct}%)`
                  : mode === 'requests'
                    ? 'إجمالي الطلبات'
                    : 'إجمالي التوكنز'}
              </span>
            </div>
          </div>

          <ul className="rst-legend">
            {items.map((item) => {
              const pct = total
                ? Math.round((item.value / total) * 1000) / 10
                : 0;
              const dimmed = hoveredKey !== null && hoveredKey !== item.key;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    className={'rst-legend-row' + (dimmed ? ' is-dimmed' : '')}
                    onMouseEnter={() => setHoveredKey(item.key)}
                    onMouseLeave={() => setHoveredKey(null)}
                    onFocus={() => setHoveredKey(item.key)}
                    onBlur={() => setHoveredKey(null)}
                  >
                    <span className="rst-legend-label">
                      <span
                        className="rst-dot"
                        style={{ background: item.color }}
                        aria-hidden="true"
                      />
                      {item.label}
                    </span>
                    <span className="rst-legend-vals numeric" dir="ltr">
                      <strong>{compactNumber(item.value)}</strong>
                      <small>{pct}%</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

export function MotionLatencyBarChart({ checks }) {
  const [target, setTarget] = useState('database');
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const ordered = useMemo(() => [...(checks || [])].reverse(), [checks]);

  const values = useMemo(
    () =>
      ordered.map((c) =>
        target === 'database'
          ? Number(c.databaseLatencyMs) || 0
          : Number(c.aiServiceLatencyMs) || 0,
      ),
    [ordered, target],
  );

  const maxMs = useMemo(() => Math.max(0, ...values), [values]);
  const peakIndex = useMemo(() => {
    if (!maxMs) return -1;
    return values.findIndex((v) => v === maxMs);
  }, [values, maxMs]);

  const width = 560;
  const height = 186;
  const padTop = 14;
  const padBottom = 30;
  const padSide = 14;
  const plotW = width - padSide * 2;
  const plotH = height - padTop - padBottom;
  const count = Math.max(ordered.length, 1);
  const slotW = plotW / count;
  const barW = Math.max(8, Math.min(22, slotW - 6));

  const activeCheck =
    hoveredIdx !== null && ordered[hoveredIdx] ? ordered[hoveredIdx] : null;

  return (
    <section className="panel rst-card">
      <div className="rst-card-head">
        <div>
          <h2>استجابة الخادم في آخر {ordered.length || 24} فحصاً</h2>
          <p className="rst-card-sub">
            زمن الاستجابة بالملي ثانية (ms) لمراقبة ثبات قاعدة البيانات وحاوية
            Gemini
          </p>
        </div>
        <div className="rst-controls">
          <div
            className="rst-seg rst-seg-sm"
            role="group"
            aria-label="الخدمة المقاسة"
          >
            <button
              type="button"
              className={target === 'database' ? 'active' : ''}
              aria-pressed={target === 'database'}
              onClick={() => setTarget('database')}
            >
              القاعدة
            </button>
            <button
              type="button"
              className={target === 'ai' ? 'active' : ''}
              aria-pressed={target === 'ai'}
              onClick={() => setTarget('ai')}
            >
              Gemini
            </button>
          </div>
          {maxMs > 0 ? (
            <span className="rst-peak-pill" dir="ltr">
              أعلى زمن: {maxMs}ms
            </span>
          ) : (
            <span className="rst-peak-pill is-muted">بانتظار الفحوصات</span>
          )}
        </div>
      </div>

      {ordered.length === 0 ? (
        <div className="rst-chart-empty">
          <p>
            لم تُسجّل فحوصات توافر بعد. اضغط «فحص صحة النظام الآن» لتسجيل أول
            قراءة.
          </p>
        </div>
      ) : (
        <div
          className="rst-chart-stage"
          onMouseLeave={() => setHoveredIdx(null)}
        >
          {activeCheck && (
            <div className="rst-tooltip" role="status">
              <strong>{shortCairoTime(activeCheck.checkedAt)}</strong>
              <span className="numeric">
                القاعدة: {activeCheck.databaseOk ? 'متصلة' : 'خطأ'} (
                <bdi>{activeCheck.databaseLatencyMs}ms</bdi>)
              </span>
              <span className="numeric">
                Gemini:{' '}
                {activeCheck.aiServiceStatus === 'UP'
                  ? `يعمل (${activeCheck.aiServiceLatencyMs ?? 0}ms)`
                  : activeCheck.aiServiceStatus}
              </span>
            </div>
          )}
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="rst-svg"
            role="img"
            aria-label="رسم بياني لزمن استجابة الخادم في آخر الفحوصات"
          >
            <line
              x1={padSide}
              y1={padTop + plotH}
              x2={width - padSide}
              y2={padTop + plotH}
              stroke="var(--chart-grid)"
            />
            {ordered.map((check, idx) => {
              const val = values[idx] ?? 0;
              const isError =
                target === 'database'
                  ? !check.databaseOk
                  : check.aiServiceStatus === 'DOWN';
              const x = padSide + idx * slotW + (slotW - barW) / 2;
              const barH =
                maxMs > 0
                  ? Math.max(val > 0 ? 8 : 3, (val / maxMs) * plotH)
                  : 4;
              const y = padTop + plotH - barH;
              const isPeak = idx === peakIndex && maxMs > 0;
              const isHovered = hoveredIdx === idx;
              const fill = isError
                ? 'var(--chart-error)'
                : val === 0
                  ? 'var(--chart-grid)'
                  : isPeak
                    ? 'var(--chart-accent)'
                    : isHovered
                      ? 'var(--chart-bar-hover)'
                      : 'var(--chart-line)';
              const showLabel =
                ordered.length <= 6 ||
                idx === 0 ||
                idx === ordered.length - 1 ||
                idx % Math.max(1, Math.floor(ordered.length / 4)) === 0;
              return (
                <g
                  key={check.id || idx}
                  tabIndex={0}
                  role="button"
                  aria-label={`${shortCairoTime(check.checkedAt)}: ${val}ms`}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onFocus={() => setHoveredIdx(idx)}
                  onBlur={() => setHoveredIdx(null)}
                  onClick={() =>
                    setHoveredIdx((cur) => (cur === idx ? null : idx))
                  }
                  className="rst-hit"
                >
                  <rect
                    x={padSide + idx * slotW}
                    y={padTop}
                    width={slotW}
                    height={plotH}
                    fill="transparent"
                  />
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={barH}
                    rx={4}
                    fill={fill}
                    opacity={
                      hoveredIdx !== null && !isHovered && val > 0 ? 0.65 : 1
                    }
                  />
                  {showLabel && (
                    <text
                      x={x + barW / 2}
                      y={height - 10}
                      textAnchor="middle"
                      className="rst-axis-text"
                    >
                      {shortCairoTime(check.checkedAt)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </section>
  );
}
