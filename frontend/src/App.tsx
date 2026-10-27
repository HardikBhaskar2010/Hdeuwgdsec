import { useState, useEffect, useRef } from 'react'
import { useAnalysis } from './hooks/useAnalysis'
import { useInterval } from './hooks/useInterval'
import { formatDate, formatDateTime, formatMW, formatSignedMW, formatPct, shortLabel } from './format'
import type { AnalysisResponse, IntervalRow, TopMiss, VintageRow } from './types'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, ReferenceLine, Cell,
} from 'recharts'

const CUTOFF_PRESETS = [
  { value: '15:30', label: '15:30 London — EPEX GB Day-Ahead Auction' },
  { value: '09:50', label: '09:50 London — N2EX Gate Closure' },
]

// ── KPI Component ────────────────────────────────────────────────────────────
function Kpi({ label, value, unit, tooltip, isWhite = false }: {
  label: string; value: string; unit?: string; tooltip?: string; isWhite?: boolean
}) {
  return (
    <div className="kpi" role="figure" aria-label={`${label}: ${value}${unit ? ' ' + unit : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${isWhite ? 'kpi-white' : 'kpi-dim'}`}>{value}</div>
      {unit && <div className="kpi-unit">{unit}</div>}
      {tooltip && <div className="kpi-tooltip">{tooltip}</div>}
    </div>
  )
}

// ── States ───────────────────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div className="state-box" aria-live="polite">
      <div className="spinner" aria-label="Loading analysis" />
      <div className="state-title">Loading analysis…</div>
      <div className="state-sub">Fetching January 2026 Elexon wind dataset and calculating metrics.</div>
    </div>
  )
}

function WakingState() {
  return (
    <div className="state-box" aria-live="polite">
      <div className="spinner" aria-label="Waking API" />
      <div className="state-title">Waking the API…</div>
      <div className="state-sub">
        The backend is initializing from cold snapshot. Hang tight — your data will be ready shortly.
      </div>
    </div>
  )
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="state-box" role="alert">
      <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⚠️</div>
      <div className="state-title">Could not load analysis</div>
      <div className="state-sub">{error.message}</div>
      <button className="btn-primary" onClick={onRetry} style={{ marginTop: '12px' }}>Retry</button>
    </div>
  )
}

// ── Custom Tooltips ──────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { color: string; name: string; value: number | null }[]; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="custom-tooltip">
      <div className="tt-time">{shortLabel(label ?? '')}</div>
      {payload.map(p => (
        <div className="tt-row" key={p.name}>
          <span className="tt-label" style={{ color: p.color }}>{p.name}</span>
          <span className="tt-val">{p.value !== null && p.value !== undefined ? `${Math.round(p.value).toLocaleString('en-GB')} MW` : '—'}</span>
        </div>
      ))}
    </div>
  )
}

function ErrorTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number | null }[]; label?: string
}) {
  if (!active || !payload?.length) return null
  const val = payload[0]?.value ?? null
  return (
    <div className="custom-tooltip">
      <div className="tt-time">{shortLabel(label ?? '')}</div>
      <div className="tt-row">
        <span className="tt-label">{val !== null && val > 0 ? 'Over-forecast (Short)' : 'Under-forecast (Surplus)'}</span>
        <span className="tt-val" style={{ color: '#ffffff' }}>
          {val !== null ? `${val > 0 ? '+' : ''}${Math.round(val).toLocaleString('en-GB')} MW` : '—'}
        </span>
      </div>
    </div>
  )
}

// ── Forecast vs Actual Chart ─────────────────────────────────────────────────
function ForecastActualChart({ intervals, onSelectInterval }: {
  intervals: IntervalRow[]; onSelectInterval: (start: string) => void
}) {
  const data = intervals.map(iv => ({
    start: iv.start,
    forecast: iv.forecast,
    actual: iv.actual,
  }))

  const handleClick = (p: { activePayload?: { payload: { start: string } }[] }) => {
    if (p?.activePayload?.[0]?.payload?.start) {
      onSelectInterval(p.activePayload[0].payload.start)
    }
  }

  return (
    <div className="chart-wrap" aria-label="Forecast vs Actual wind generation chart. Click a point to inspect vintages.">
      <ResponsiveContainer width="100%" height={290}>
        <LineChart data={data} onClick={handleClick} style={{ cursor: 'pointer' }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#252729" />
          <XAxis
            dataKey="start"
            tickFormatter={(v: string) => {
              try { return new Date(v).toLocaleString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short' }) }
              catch { return v }
            }}
            tick={{ fill: '#838788', fontSize: 11 }}
            interval={95}
            stroke="#2c2e2f"
          />
          <YAxis
            tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
            tick={{ fill: '#838788', fontSize: 11 }}
            label={{ value: 'MW', angle: -90, position: 'insideLeft', fill: '#838788', fontSize: 11 }}
            stroke="#2c2e2f"
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend
            formatter={(value: string) => <span style={{ color: '#d1d5db', fontSize: 12 }}>{value}</span>}
          />
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="#ffffff"
            strokeWidth={1.8}
            dot={false}
            name="Forecast (D−1 Chosen)"
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#717579"
            strokeWidth={1.8}
            dot={false}
            name="Actual (Outturn)"
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Error Over Time Chart ────────────────────────────────────────────────────
function ErrorOverTimeChart({ intervals }: { intervals: IntervalRow[] }) {
  const data = intervals
    .filter(iv => iv.status === 'MATCHED' && iv.error !== null)
    .map(iv => ({ start: iv.start, error: iv.error }))

  return (
    <div className="chart-wrap" aria-label="Forecast error over time. Positive = over-forecast (wind under-delivered; short position).">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barSize={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#252729" vertical={false} />
          <XAxis
            dataKey="start"
            tickFormatter={(v: string) => {
              try { return new Date(v).toLocaleString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short' }) }
              catch { return v }
            }}
            tick={{ fill: '#838788', fontSize: 11 }}
            interval={95}
            stroke="#2c2e2f"
          />
          <YAxis
            tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${(v / 1000).toFixed(1)}k`}
            tick={{ fill: '#838788', fontSize: 11 }}
            label={{ value: 'Error MW', angle: -90, position: 'insideLeft', fill: '#838788', fontSize: 11 }}
            stroke="#2c2e2f"
          />
          <Tooltip content={<ErrorTooltip />} />
          <ReferenceLine y={0} stroke="#606367" strokeDasharray="4 2" />
          <Bar dataKey="error" name="Error">
            {data.map((entry, idx) => (
              <Cell
                key={idx}
                fill={(entry.error ?? 0) > 0 ? '#e5e7eb' : '#4f5254'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Error Histogram ──────────────────────────────────────────────────────────
function ErrorHistogram({ intervals, p5, p95 }: {
  intervals: IntervalRow[]; p5: number | null; p95: number | null
}) {
  const errors = intervals.filter(iv => iv.error !== null).map(iv => iv.error as number)
  if (errors.length === 0) return <div className="state-box" style={{ padding: '40px' }}><div className="state-sub">No data available</div></div>

  const min = Math.min(...errors)
  const max = Math.max(...errors)
  const binCount = 30
  const binWidth = (max - min) / binCount || 1
  const bins: { mid: number; count: number }[] = []

  for (let i = 0; i < binCount; i++) {
    const lo = min + i * binWidth
    const hi = lo + binWidth
    const count = errors.filter(e => e >= lo && (i === binCount - 1 ? e <= hi : e < hi)).length
    bins.push({ mid: lo + binWidth / 2, count })
  }

  return (
    <div className="chart-wrap" aria-label="Error distribution histogram with empirical P5 and P95 hedge buffer lines.">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={bins} barSize={12}>
          <CartesianGrid strokeDasharray="3 3" stroke="#252729" vertical={false} />
          <XAxis
            dataKey="mid"
            tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${(v / 1000).toFixed(1)}k`}
            tick={{ fill: '#838788', fontSize: 10 }}
            stroke="#2c2e2f"
            label={{ value: 'Error (MW)', position: 'insideBottom', offset: -4, fill: '#838788', fontSize: 11 }}
          />
          <YAxis tick={{ fill: '#838788', fontSize: 11 }} stroke="#2c2e2f" />
          <Tooltip
            formatter={(val: number) => [val, 'Count']}
            labelFormatter={(v: number) => `Error: ${v > 0 ? '+' : ''}${Math.round(v).toLocaleString('en-GB')} MW`}
            contentStyle={{ background: '#0a0a0b', border: '1px solid #3d4042', borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: '#ffffff' }}
            itemStyle={{ color: '#d1d5db' }}
          />
          <ReferenceLine x={0} stroke="#606367" strokeDasharray="4 2" />
          {p5 !== null && <ReferenceLine x={p5} stroke="#717579" strokeDasharray="4 2" label={{ value: 'P5', fill: '#717579', fontSize: 10 }} />}
          {p95 !== null && <ReferenceLine x={p95} stroke="#ffffff" strokeDasharray="4 2" label={{ value: 'P95', fill: '#ffffff', fontSize: 10 }} />}
          <Bar dataKey="count" fill="#717579" stroke="#ffffff" strokeWidth={0.5} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Breakdown Charts ─────────────────────────────────────────────────────────
function BreakdownCharts({ data }: { data: AnalysisResponse }) {
  const bySpData = data.by_settlement_period.map(sp => ({
    name: `SP${sp.period}`,
    mae: sp.mae,
    bias: sp.mbe,
  }))

  const byLeadData = data.by_lead_time.map(lt => ({
    name: lt.bucket,
    mae: lt.mae,
  }))

  return (
    <div className="breakdown-section">
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Error by Settlement Period (Time of Day)</div>
            <div className="card-subtitle">Mean Absolute Error (MAE) and Mean Bias Error (MBE) across 48 half-hour trading slots</div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={bySpData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#252729" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#838788', fontSize: 9 }} interval={5} stroke="#2c2e2f" />
            <YAxis tick={{ fill: '#838788', fontSize: 10 }} stroke="#2c2e2f" />
            <Tooltip contentStyle={{ background: '#0a0a0b', border: '1px solid #3d4042', borderRadius: 6, fontSize: 12 }} labelStyle={{ color: '#ffffff' }} itemStyle={{ color: '#d1d5db' }} />
            <ReferenceLine y={0} stroke="#606367" strokeDasharray="4 2" />
            <Legend formatter={(v: string) => <span style={{ color: '#d1d5db', fontSize: 11 }}>{v}</span>} />
            <Bar dataKey="mae" name="MAE (MW)" fill="#ffffff" barSize={6} />
            <Bar dataKey="bias" name="Bias (MW)" fill="#717579" barSize={6} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Error by Forecast Lead Time</div>
            <div className="card-subtitle">MAE grouped by vintage age (how many hours elapsed between publication and delivery)</div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={byLeadData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#252729" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#838788', fontSize: 11 }} stroke="#2c2e2f" />
            <YAxis tick={{ fill: '#838788', fontSize: 10 }} stroke="#2c2e2f" />
            <Tooltip contentStyle={{ background: '#0a0a0b', border: '1px solid #3d4042', borderRadius: 6, fontSize: 12 }} labelStyle={{ color: '#ffffff' }} itemStyle={{ color: '#d1d5db' }} />
            <Legend formatter={(v: string) => <span style={{ color: '#d1d5db', fontSize: 11 }}>{v}</span>} />
            <Bar dataKey="mae" name="MAE (MW)" fill="#ffffff" barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Top Misses Table ─────────────────────────────────────────────────────────
function TopMissesTable({ misses, onSelect }: { misses: TopMiss[]; onSelect: (start: string) => void }) {
  return (
    <div className="table-container">
      <table className="data-table" aria-label="Top 10 forecast misses by absolute error">
        <thead>
          <tr>
            <th>Interval (London)</th>
            <th className="num">Forecast (MW)</th>
            <th className="num">Actual (MW)</th>
            <th className="num">Error (MW)</th>
            <th>Vintage Published</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {misses.map(m => (
            <tr
              key={m.start}
              className="miss-row"
              onClick={() => onSelect(m.start)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(m.start) } }}
              tabIndex={0}
              role="button"
              aria-label={`Drill down into interval ${shortLabel(m.start)}`}
            >
              <td><code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#ffffff' }}>{shortLabel(m.start)}</code></td>
              <td className="num">{m.forecast.toLocaleString('en-GB')}</td>
              <td className="num">{m.actual.toLocaleString('en-GB')}</td>
              <td className="num" style={{ fontWeight: 600, color: m.error > 0 ? '#ffffff' : '#838788' }}>
                {m.error > 0 ? '+' : ''}{m.error.toLocaleString('en-GB')}
              </td>
              <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{formatDateTime(m.publish_time)}</td>
              <td><span className="badge badge-outline">Inspect →</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Interval Drilldown ───────────────────────────────────────────────────────
function IntervalDetail({ start, cutoff }: { start: string; cutoff: string }) {
  const { data, isLoading, error } = useInterval(start, cutoff)

  if (isLoading) return <div style={{ padding: '24px', textAlign: 'center' }}><div className="spinner" style={{ width: 24, height: 24, margin: '0 auto' }} /></div>
  if (error || !data) return <div style={{ padding: '16px', color: '#ffffff', fontSize: '0.82rem' }}>Could not load interval drilldown: {error?.message}</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
        <span>Interval: <strong style={{ color: '#ffffff' }}>{shortLabel(data.start)}</strong> (London)</span>
        <span>Cutoff: <strong style={{ color: '#ffffff', fontFamily: 'var(--font-mono)' }}>{formatDateTime(data.cutoff_utc)}</strong> UTC</span>
        <span>Outturn Actual: <strong style={{ color: '#ffffff' }}>{data.actual !== null ? formatMW(data.actual) : '—'}</strong></span>
      </div>
      <div className="table-container">
        <table className="data-table" aria-label={`All forecast vintages for interval ${shortLabel(data.start)}`}>
          <thead>
            <tr>
              <th>Published at (UTC)</th>
              <th className="num">Generation (MW)</th>
              <th>Availability Status</th>
              <th>Selection Decision</th>
            </tr>
          </thead>
          <tbody>
            {data.vintages.map((v: VintageRow) => (
              <tr
                key={v.publish_time}
                className={v.chosen ? 'vintage-row-chosen' : v.eligible ? '' : 'vintage-row-ineligible'}
              >
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{formatDateTime(v.publish_time)}</td>
                <td className="num">{v.generation.toLocaleString('en-GB')}</td>
                <td>{v.eligible ? <span className="badge badge-outline">Eligible (Pre-cutoff)</span> : <span className="badge badge-muted">Post-Cutoff (Hindsight)</span>}</td>
                <td>{v.chosen ? <span className="badge badge-white">✓ Chosen Decision Vintage</span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        Strict-before rule enforces <code style={{ color: '#ffffff' }}>publishTime &lt; cutoff</code>. Only vintages released before gate closure are eligible for purchase decisions.
      </div>
    </div>
  )
}

// ── Methodology Panel ────────────────────────────────────────────────────────
function MethodologyPanel({ data }: { data: AnalysisResponse }) {
  const q = data.quality
  return (
    <details className="method-panel">
      <summary className="method-summary">
        <span>Methodology, Quality Audit &amp; Data Contract</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {data.coverage.coverage_pct.toFixed(1)}% coverage · {q.warnings.length} warnings
        </span>
      </summary>
      <div className="method-body">
        <div className="method-grid">
          <div className="method-section">
            <h4>Dataset &amp; Settlement Periods</h4>
            <ul>
              <li>Delivery dates: 2 January – 1 February 2026 (GB Market).</li>
              <li>Decision cutoff: D−1 at {data.cutoff.time} London.</li>
              <li>Expected intervals: 31 days × 48 settlement periods = 1,488 half-hours.</li>
              <li>Settlement Period indexing: 01:00–01:30 UTC corresponds to Settlement Period 3.</li>
              <li>Data sources: Elexon BMRS <code style={{ color: '#fff' }}>FUELHH</code> (Actuals) and <code style={{ color: '#fff' }}>WINDFOR</code> (Vintages).</li>
            </ul>
          </div>
          <div className="method-section">
            <h4>Strict-Before Anti-Hindsight Selection Rule</h4>
            <div className="method-code">{`for each delivery interval T:
  cutoff = London(date(T) - 1 day, ${data.cutoff.time})
  eligible = WINDFOR[startTime == T ∧ publishTime < cutoff]
  chosen = max(publishTime) among eligible
  error = forecast - actual`}</div>
          </div>
          <div className="method-section">
            <h4>Statistical Error Metrics (N={data.metrics.n} Matched)</h4>
            <ul>
              <li>MAE — Mean Absolute Error (typical magnitude of volume miss).</li>
              <li>RMSE — Root Mean Square Error (quadratic penalty for extreme deviations).</li>
              <li>MBE — Mean Bias Error (+ve = over-forecast, wind under-delivered).</li>
              <li>WAPE — Weighted Absolute Percentage Error ({formatPct(data.metrics.wape_pct)}).</li>
              <li>P5 / P95 — Empirical non-parametric quantiles for volume buffer dimensioning.</li>
            </ul>
          </div>
          <div className="method-section">
            <h4>Day-Ahead Market Context &amp; Assumptions</h4>
            <ul>
              <li><strong>EPEX GB Day-Ahead (15:30):</strong> Half-hourly auction closing at 15:30 London.</li>
              <li><strong>N2EX Day-Ahead (09:50):</strong> Hourly auction product closing at 09:50 GMT.</li>
              <li>Empirical P95 error represents historical volume overshoot, not a guaranteed hedge requirement.</li>
              <li>National aggregate wind only; portfolio balancing requires local position &amp; price data.</li>
            </ul>
          </div>
        </div>
        <div style={{ marginTop: 22 }}>
          <h4 style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Data Quality Audit</h4>
          <div className="quality-grid">
            {[
              { label: 'Outturn Intervals (FUELHH)', value: q.actual_intervals },
              { label: 'Forecast Vintages (WINDFOR)', value: q.forecast_intervals },
              { label: 'Missing Forecasts', value: q.no_forecast },
              { label: 'Missing Actuals', value: q.no_actual },
              { label: 'Dupe Actuals Deduplicated', value: q.duplicate_actual_keys },
              { label: 'Dupe Vintages Deduplicated', value: q.duplicate_forecast_keys },
              { label: 'Invalid / Corrupt Rows Filtered', value: q.invalid_rows },
              { label: 'Matched Interval Coverage', value: `${data.coverage.matched} / ${data.coverage.expected}` },
            ].map(item => (
              <div key={item.label} className="quality-item">
                <div className="q-label">{item.label}</div>
                <div className="q-value">{item.value.toLocaleString('en-GB')}</div>
              </div>
            ))}
          </div>
          {q.warnings.length > 0 && (
            <div className="warning-list">
              {q.warnings.map((w, i) => (
                <div key={i} className="warning-item">ℹ {w}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </details>
  )
}

// ── Main App Component ───────────────────────────────────────────────────────
export default function App() {
  const [cutoff, setCutoff] = useState('15:30')
  const [selectedStart, setSelectedStart] = useState<string | null>(null)
  const [showWaking, setShowWaking] = useState(false)
  const wakingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data, isLoading, error, isFetching, refetch } = useAnalysis(cutoff)

  useEffect(() => {
    if (isLoading || isFetching) {
      wakingTimer.current = setTimeout(() => setShowWaking(true), 4000)
    } else {
      setShowWaking(false)
      if (wakingTimer.current) clearTimeout(wakingTimer.current)
    }
    return () => { if (wakingTimer.current) clearTimeout(wakingTimer.current) }
  }, [isLoading, isFetching])

  const detailRef = useRef<HTMLDivElement>(null)
  const handleSelectInterval = (start: string) => {
    setSelectedStart(start)
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const snapshotDate = data?.snapshot?.fetched_at
  const m = data?.metrics

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* ── Header ── */}
      <header className="header" role="banner">
        <div className="header-inner">
          <div className="header-brand">
            <div className="brand-mark" aria-hidden="true">
              <img
                src="/logo.png"
                alt="Cutoff Analytics Brand Mark"
                onError={e => {
                  // Fallback geometric mark if external asset missing
                  (e.target as HTMLElement).style.display = 'none'
                }}
              />
            </div>
            <div className="brand-text">
              <div className="brand-title">
                CUTOFF <span style={{ color: 'var(--text-dim)', fontWeight: 300 }}>|</span> ENERGY ANALYTICS
              </div>
              <div className="brand-subtitle">GB Wholesale Wind Forecast Accuracy Portal</div>
            </div>
          </div>

          <div className="header-meta">
            <div className="meta-chip">
              <span className="status-dot" aria-hidden="true" />
              <span><strong>Decision Period:</strong> Jan 2026</span>
            </div>
            <div className="meta-chip">
              <span><strong>Delivery:</strong> 2 Jan – 1 Feb 2026</span>
            </div>
            {snapshotDate && (
              <div className="meta-chip">
                <span><strong>Snapshot:</strong> {formatDate(snapshotDate)}</span>
              </div>
            )}
          </div>

          <div className="header-controls">
            <div className="select-wrapper">
              <label className="select-label" htmlFor="cutoff-select">Cutoff (D−1):</label>
              <select
                id="cutoff-select"
                className="select"
                value={cutoff}
                onChange={e => setCutoff(e.target.value)}
                aria-label="Select decision cutoff time"
              >
                {CUTOFF_PRESETS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="main" role="main" id="main-content">
        <div className="sections">

          {(isLoading || isFetching) && !data && (
            showWaking ? <WakingState /> : <LoadingState />
          )}

          {error && !data && (
            <ErrorState error={error} onRetry={() => refetch()} />
          )}

          {data && (
            <>
              {/* ── KPI Strip ── */}
              <section aria-labelledby="kpi-heading">
                <h2 id="kpi-heading" className="sr-only">Key performance indicators</h2>
                <div className="kpi-strip" role="group" aria-label="Forecast accuracy metrics">
                  <Kpi
                    label="Mean Absolute Error (MAE)"
                    value={m?.mae !== null && m?.mae !== undefined ? Math.round(m.mae).toLocaleString('en-GB') : '—'}
                    unit="MW typical miss"
                    isWhite={true}
                    tooltip="Average magnitude of forecast error across all matched half-hours in January 2026."
                  />
                  <Kpi
                    label="Root Mean Square (RMSE)"
                    value={m?.rmse !== null && m?.rmse !== undefined ? Math.round(m.rmse).toLocaleString('en-GB') : '—'}
                    unit="MW quadratic miss"
                    isWhite={false}
                    tooltip="Heavily penalizes extreme forecast errors. Useful for volatility assessment."
                  />
                  <Kpi
                    label="Mean Bias Error (MBE)"
                    value={m?.mbe !== null && m?.mbe !== undefined ? `${m.mbe > 0 ? '+' : ''}${Math.round(m.mbe).toLocaleString('en-GB')}` : '—'}
                    unit="MW over-forecast"
                    isWhite={true}
                    tooltip="Positive bias indicates systematic over-forecast (wind under-delivered; market buyer short)."
                  />
                  <Kpi
                    label="Empirical P95 Over-Forecast"
                    value={m?.p95_error !== null && m?.p95_error !== undefined ? `+${Math.round(m.p95_error).toLocaleString('en-GB')}` : '—'}
                    unit="MW hedge buffer quantile"
                    isWhite={true}
                    tooltip="95% of half-hours overshot by less than this amount. Informs operational reserve sizing."
                  />
                  <Kpi
                    label="Market Coverage"
                    value={formatPct(data.coverage.coverage_pct)}
                    unit={`${data.coverage.matched} / ${data.coverage.expected} intervals`}
                    isWhite={false}
                    tooltip="100% complete coverage of all 1,488 settlement half-hours in January 2026."
                  />
                </div>
              </section>

              {/* ── Forecast vs Actual ── */}
              <section aria-labelledby="forecast-heading">
                <div className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title" id="forecast-heading">Forecast vs Actual Generation</div>
                      <div className="card-subtitle">
                        Half-hourly time series of outturn actual generation vs. latest pre-cutoff forecast vintage. Click any point to inspect all published vintages.
                      </div>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      Cutoff: <strong style={{ color: '#ffffff' }}>{cutoff}</strong> London · WAPE: <strong style={{ color: '#ffffff' }}>{formatPct(m?.wape_pct)}</strong>
                    </div>
                  </div>
                  <ForecastActualChart intervals={data.intervals} onSelectInterval={handleSelectInterval} />
                </div>
              </section>

              {/* ── Error Over Time + Histogram ── */}
              <div className="chart-section">
                <div className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">Forecast Error Over Time (MW)</div>
                      <div className="card-subtitle">
                        Light silver bars = Over-forecast (+MW; short volume risk) · Dark slate bars = Under-forecast (−MW)
                      </div>
                    </div>
                  </div>
                  <ErrorOverTimeChart intervals={data.intervals} />
                </div>

                <div className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">Error Distribution &amp; Quantiles</div>
                      <div className="card-subtitle">
                        P5 = {formatSignedMW(m?.p5_error)} · Bias (MBE) = {formatSignedMW(m?.mbe)} · P95 = {formatSignedMW(m?.p95_error)}
                      </div>
                    </div>
                  </div>
                  <ErrorHistogram intervals={data.intervals} p5={m?.p5_error ?? null} p95={m?.p95_error ?? null} />
                </div>
              </div>

              {/* ── Breakdown Charts ── */}
              <BreakdownCharts data={data} />

              {/* ── Interval Drilldown ── */}
              <section aria-labelledby="detail-heading" ref={detailRef}>
                <div className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title" id="detail-heading">Delivery Interval Vintage Audit</div>
                      <div className="card-subtitle">
                        {selectedStart
                          ? `Inspecting interval ${shortLabel(selectedStart)} London — showing all candidate forecast publication vintages`
                          : 'Select an interval from the Forecast chart or Top 10 Misses below to inspect all available forecast publication vintages'}
                      </div>
                    </div>
                    {selectedStart && (
                      <button
                        className="btn-secondary"
                        onClick={() => setSelectedStart(null)}
                        aria-label="Clear selected interval drilldown"
                      >
                        ✕ Clear Selection
                      </button>
                    )}
                  </div>
                  {selectedStart && (
                    <IntervalDetail start={selectedStart} cutoff={cutoff} />
                  )}
                </div>
              </section>

              {/* ── Top Misses ── */}
              <section aria-labelledby="misses-heading">
                <div className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title" id="misses-heading">Top 10 Largest Volume Misses</div>
                      <div className="card-subtitle">Extreme absolute error intervals during January 2026. Select any row to audit decision vintages.</div>
                    </div>
                  </div>
                  <TopMissesTable misses={data.top_misses} onSelect={handleSelectInterval} />
                </div>
              </section>

              {/* ── Methodology ── */}
              <MethodologyPanel data={data} />
            </>
          )}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="footer" role="contentinfo">
        <div>
          <strong>Cutoff Energy Analytics</strong> · GB Day-Ahead Wind Forecast Accuracy Portal · January 2026 Elexon Dataset
        </div>
        <div>
          Strict Anti-Hindsight Selection (<code style={{ color: '#fff' }}>publishTime &lt; cutoff</code>) · Times in Europe/London
        </div>
      </footer>

      <style>{`.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}`}</style>
    </>
  )
}
