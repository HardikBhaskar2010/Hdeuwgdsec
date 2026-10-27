import { useState, useEffect, useRef } from 'react'
import { useAnalysis } from './hooks/useAnalysis'
import { useInterval } from './hooks/useInterval'
import { formatDate, formatDateTime, formatMW, formatSignedMW, formatPct, formatTime, shortLabel } from './format'
import type { AnalysisResponse, IntervalRow, TopMiss, VintageRow } from './types'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, ReferenceLine, Cell,
} from 'recharts'

const CUTOFF_PRESETS = [
  { value: '15:30', label: '15:30 — Day-ahead auction' },
  { value: '09:50', label: '09:50 — N2EX gate closure' },
]

// ── KPI Component ────────────────────────────────────────────────────────────
function Kpi({ label, value, unit, tooltip, colorClass = 'kpi-neutral' }: {
  label: string; value: string; unit?: string; tooltip?: string; colorClass?: string
}) {
  return (
    <div className="kpi" role="figure" aria-label={`${label}: ${value}${unit ? ' ' + unit : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${colorClass}`}>{value}</div>
      {unit && <div className="kpi-unit">{unit}</div>}
      {tooltip && <div className="kpi-tooltip">{tooltip}</div>}
    </div>
  )
}

// ── States ───────────────────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div className="state-box">
      <div className="spinner" aria-label="Loading" />
      <div className="state-title">Loading analysis…</div>
    </div>
  )
}

function WakingState() {
  return (
    <div className="state-box">
      <div className="spinner" aria-label="Waking API" />
      <div className="state-title">Waking the API…</div>
      <div className="state-sub">
        The backend is on a free-tier host and may take 30–60 seconds to cold-start.
        Hang tight — your data will be ready shortly.
      </div>
    </div>
  )
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="state-box">
      <div className="state-icon" aria-hidden>⚠️</div>
      <div className="state-title">Could not load data</div>
      <div className="state-sub">{error.message}</div>
      <button className="btn-retry" onClick={onRetry}>Retry</button>
    </div>
  )
}

// ── Custom Tooltip for charts ────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number | null }[]; label?: string }) {
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

function ErrorTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number | null }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const val = payload[0]?.value ?? null
  return (
    <div className="custom-tooltip">
      <div className="tt-time">{shortLabel(label ?? '')}</div>
      <div className="tt-row">
        <span className="tt-label">{val !== null && val > 0 ? 'Over-forecast' : 'Under-forecast'}</span>
        <span className="tt-val" style={{ color: val !== null && val > 0 ? 'var(--color-over)' : 'var(--color-under)' }}>
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
    <div className="chart-wrap" aria-label="Forecast vs Actual wind generation chart. Click a point to drill down.">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} onClick={handleClick} style={{ cursor: 'pointer' }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
          <XAxis
            dataKey="start"
            tickFormatter={(v: string) => { try { return new Date(v).toLocaleString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short' }) } catch { return v } }}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            interval={95}
            stroke="var(--border)"
          />
          <YAxis
            tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            label={{ value: 'MW', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 11 }}
            stroke="var(--border)"
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend
            formatter={(value: string) => <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{value}</span>}
          />
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="var(--color-forecast)"
            strokeWidth={1.5}
            dot={false}
            name="Forecast"
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="var(--color-actual)"
            strokeWidth={1.5}
            dot={false}
            name="Actual"
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
    <div className="chart-wrap" aria-label="Forecast error over time. Positive = over-forecast (wind under-delivered).">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barSize={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
          <XAxis
            dataKey="start"
            tickFormatter={(v: string) => { try { return new Date(v).toLocaleString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short' }) } catch { return v } }}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            interval={95}
            stroke="var(--border)"
          />
          <YAxis
            tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${(v / 1000).toFixed(1)}k`}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            label={{ value: 'Error MW', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 11 }}
            stroke="var(--border)"
          />
          <Tooltip content={<ErrorTooltip />} />
          <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="4 2" />
          <Bar dataKey="error" name="Error">
            {data.map((entry, idx) => (
              <Cell
                key={idx}
                fill={(entry.error ?? 0) > 0 ? 'var(--color-over)' : 'var(--color-under)'}
                fillOpacity={0.8}
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
  if (errors.length === 0) return <div className="state-box" style={{ padding: '40px' }}><div className="state-sub">No data</div></div>

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
    <div className="chart-wrap" aria-label="Distribution of forecast errors. Vertical lines show P5 and P95 percentiles.">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={bins} barSize={12}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
          <XAxis
            dataKey="mid"
            tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${(v / 1000).toFixed(1)}k`}
            tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
            stroke="var(--border)"
            label={{ value: 'Error (MW)', position: 'insideBottom', offset: -4, fill: 'var(--text-muted)', fontSize: 11 }}
          />
          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} stroke="var(--border)" />
          <Tooltip
            formatter={(val: number) => [val, 'Count']}
            labelFormatter={(v: number) => `Error: ${v > 0 ? '+' : ''}${Math.round(v).toLocaleString('en-GB')} MW`}
            contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: 'var(--text-primary)' }}
            itemStyle={{ color: 'var(--text-secondary)' }}
          />
          <ReferenceLine x={0} stroke="var(--text-muted)" strokeDasharray="4 2" />
          {p5 !== null && <ReferenceLine x={p5} stroke="var(--color-under)" strokeDasharray="4 2" label={{ value: 'P5', fill: 'var(--color-under)', fontSize: 10 }} />}
          {p95 !== null && <ReferenceLine x={p95} stroke="var(--color-over)" strokeDasharray="4 2" label={{ value: 'P95', fill: 'var(--color-over)', fontSize: 10 }} />}
          <Bar dataKey="count" fill="var(--accent-blue)" fillOpacity={0.7} />
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
    n: lt.n,
  }))

  return (
    <div className="breakdown-section">
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Error by time of day</div>
            <div className="card-subtitle">MAE and bias per settlement period (30-min slots)</div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={bySpData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} interval={5} stroke="var(--border)" />
            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} stroke="var(--border)" />
            <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} labelStyle={{ color: 'var(--text-primary)' }} itemStyle={{ color: 'var(--text-secondary)' }} />
            <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="4 2" />
            <Legend formatter={(v: string) => <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{v}</span>} />
            <Bar dataKey="mae" name="MAE (MW)" fill="var(--color-forecast)" fillOpacity={0.8} barSize={6} />
            <Bar dataKey="bias" name="Bias (MW)" fill="var(--color-over)" fillOpacity={0.7} barSize={6} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Error by forecast lead time</div>
            <div className="card-subtitle">How stale was the chosen vintage?</div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={byLeadData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} stroke="var(--border)" />
            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} stroke="var(--border)" />
            <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} labelStyle={{ color: 'var(--text-primary)' }} itemStyle={{ color: 'var(--text-secondary)' }} />
            <Legend formatter={(v: string) => <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{v}</span>} />
            <Bar dataKey="mae" name="MAE (MW)" fill="var(--accent-blue)" fillOpacity={0.8} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Top Misses Table ─────────────────────────────────────────────────────────
function TopMissesTable({ misses, onSelect }: { misses: TopMiss[]; onSelect: (start: string) => void }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table" aria-label="Top 10 forecast misses by absolute error">
        <thead>
          <tr>
            <th>Interval (London)</th>
            <th className="num">Forecast (MW)</th>
            <th className="num">Actual (MW)</th>
            <th className="num">Error (MW)</th>
            <th>Published at</th>
          </tr>
        </thead>
        <tbody>
          {misses.map(m => (
            <tr key={m.start} className="miss-row" onClick={() => onSelect(m.start)} title="Click to see all forecast vintages for this interval">
              <td><code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--accent-blue)' }}>{shortLabel(m.start)}</code></td>
              <td className="num">{m.forecast.toLocaleString('en-GB')}</td>
              <td className="num">{m.actual.toLocaleString('en-GB')}</td>
              <td className="num" style={{ color: m.error > 0 ? 'var(--color-over)' : 'var(--color-under)' }}>
                {m.error > 0 ? '+' : ''}{m.error.toLocaleString('en-GB')}
              </td>
              <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{formatDateTime(m.publish_time)}</td>
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

  if (isLoading) return <div style={{ padding: '20px' }}><div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} /></div>
  if (error || !data) return <div style={{ padding: '12px', color: 'var(--accent-amber)', fontSize: '0.82rem' }}>Could not load drilldown: {error?.message}</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
        <span>Interval: <strong style={{ color: 'var(--text-primary)' }}>{shortLabel(data.start)}</strong> (London)</span>
        <span>Cutoff: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{formatDateTime(data.cutoff_utc)}</strong> UTC</span>
        <span>Actual: <strong style={{ color: 'var(--color-actual)' }}>{data.actual !== null ? formatMW(data.actual) : '—'}</strong></span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" aria-label={`All forecast vintages for interval ${shortLabel(data.start)}`}>
          <thead>
            <tr>
              <th>Published at (UTC)</th>
              <th className="num">Generation (MW)</th>
              <th>Eligible?</th>
              <th>Chosen?</th>
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
                <td>{v.eligible ? <span className="badge badge-green">Yes</span> : <span className="badge badge-red">No — post-cutoff</span>}</td>
                <td>{v.chosen ? <span className="badge badge-blue">✓ Chosen</span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        Eligible = published at or before the cutoff. Chosen = latest eligible vintage.
        Greyed rows were not available at decision time.
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
        <span>Methodology &amp; Data Quality</span>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {data.coverage.coverage_pct.toFixed(1)}% coverage · {q.warnings.length} warnings
        </span>
      </summary>
      <div className="method-body">
        <div className="method-grid">
          <div className="method-section">
            <h4>Scope</h4>
            <ul>
              <li>Decision dates: 1–31 Jan 2026 (Europe/London)</li>
              <li>Delivery dates: 2 Jan – 1 Feb 2026</li>
              <li>Expected intervals: 31 × 48 = 1,488 half-hours</li>
              <li>Data: Elexon FUELHH (WIND) and WINDFOR only</li>
            </ul>
          </div>
          <div className="method-section">
            <h4>Selection rule (no hindsight)</h4>
            <div className="method-code">{`for each delivery interval T:
  cutoff = London(date(T) - 1 day, ${data.cutoff.time})
  eligible = WINDFOR[startTime=T ∧ publishTime ≤ cutoff]
  chosen = max(publishTime) among eligible
  error = forecast - actual`}</div>
          </div>
          <div className="method-section">
            <h4>Metrics (N={data.metrics.n} matched)</h4>
            <ul>
              <li>MAE — mean absolute error (typical miss)</li>
              <li>RMSE — penalises large misses</li>
              <li>MBE — mean bias (+ve = over-forecast; wind under-delivered)</li>
              <li>WAPE — weighted absolute % error (robust to near-zero actuals)</li>
              <li>P5 / P95 — hedge buffer quantiles</li>
            </ul>
          </div>
          <div className="method-section">
            <h4>Assumptions &amp; limitations</h4>
            <ul>
              <li>Cutoff time {data.cutoff.time} is an assumption; actual buyer cutoff is unknown</li>
              <li>National wind only — no demand, price or other supply data</li>
              <li>WINDFOR is hourly; duplicated to 30-min for alignment with FUELHH</li>
              <li>Snapshot dated {formatDate(data.snapshot.fetched_at)}; not a live feed</li>
              <li>Error = forecast − actual; positive means over-forecast (buyer is short)</li>
            </ul>
          </div>
        </div>
        <div style={{ marginTop: 20 }}>
          <h4 style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Data quality</h4>
          <div className="quality-grid">
            {[
              { label: 'Actual intervals', value: q.actual_intervals },
              { label: 'Forecast vintages', value: q.forecast_intervals },
              { label: 'No forecast', value: q.no_forecast },
              { label: 'No actual', value: q.no_actual },
              { label: 'Dupe actuals resolved', value: q.duplicate_actual_keys },
              { label: 'Dupe forecasts resolved', value: q.duplicate_forecast_keys },
              { label: 'Invalid rows removed', value: q.invalid_rows },
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
                <div key={i} className="warning-item">⚠ {w}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </details>
  )
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [cutoff, setCutoff] = useState('15:30')
  const [selectedStart, setSelectedStart] = useState<string | null>(null)
  const [showWaking, setShowWaking] = useState(false)
  const wakingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data, isLoading, error, isFetching, refetch } = useAnalysis(cutoff)

  // Show "waking" state if loading takes > 4 seconds
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
      {/* ── Header ── */}
      <header className="header" role="banner">
        <div className="header-inner">
          <div className="header-title">
            <div className="logo-icon" aria-hidden>💨</div>
            <h1>Cutoff · Wind Forecast Accuracy</h1>
          </div>
          <div className="header-meta">
            <span className="header-badge"><strong>Decisions:</strong> Jan 2026</span>
            <span className="header-badge"><strong>Delivery:</strong> 2 Jan – 1 Feb 2026</span>
            {snapshotDate && (
              <span className="header-badge">Snapshot: {formatDate(snapshotDate)}</span>
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
                  <option key={p.value} value={p.value}>{p.value} — {p.label.split('—')[1].trim()}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      <main className="main" role="main" id="main-content">
        <div className="sections">

          {/* ── Loading / Waking / Error states ── */}
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
                    label="MAE"
                    value={m?.mae !== null && m?.mae !== undefined ? Math.round(m.mae).toLocaleString('en-GB') : '—'}
                    unit="MW"
                    colorClass="kpi-neutral"
                    tooltip="Mean Absolute Error — the typical miss size. N = matched intervals."
                  />
                  <Kpi
                    label="RMSE"
                    value={m?.rmse !== null && m?.rmse !== undefined ? Math.round(m.rmse).toLocaleString('en-GB') : '—'}
                    unit="MW"
                    colorClass="kpi-neutral"
                    tooltip="Root Mean Square Error — penalises large misses more than MAE."
                  />
                  <Kpi
                    label="Bias (MBE)"
                    value={m?.mbe !== null && m?.mbe !== undefined ? `${m.mbe > 0 ? '+' : ''}${Math.round(m.mbe).toLocaleString('en-GB')}` : '—'}
                    unit="MW"
                    colorClass={m?.mbe !== null && m?.mbe !== undefined ? (m.mbe > 0 ? 'kpi-positive' : 'kpi-negative') : 'kpi-neutral'}
                    tooltip="Mean Bias Error. Positive = over-forecast (wind under-delivered; buyer is short). Negative = under-forecast."
                  />
                  <Kpi
                    label="P95 over-forecast"
                    value={m?.p95_error !== null && m?.p95_error !== undefined ? `+${Math.round(m.p95_error).toLocaleString('en-GB')}` : '—'}
                    unit="MW"
                    colorClass={m?.p95_error !== null && m?.p95_error !== undefined && m.p95_error > 0 ? 'kpi-positive' : 'kpi-neutral'}
                    tooltip="On 95% of half-hours the forecast overshot by less than this value. Use as a hedge buffer."
                  />
                  <Kpi
                    label="Coverage"
                    value={formatPct(data.coverage.coverage_pct)}
                    unit={`${data.coverage.matched} / ${data.coverage.expected}`}
                    colorClass={data.coverage.coverage_pct > 95 ? 'kpi-neutral' : 'kpi-positive'}
                    tooltip={`Matched intervals / expected (${data.coverage.expected}). Missing intervals are excluded from all metrics.`}
                  />
                </div>
              </section>

              {/* ── Forecast vs Actual ── */}
              <section aria-labelledby="forecast-heading">
                <div className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title" id="forecast-heading">Forecast vs Actual</div>
                      <div className="card-subtitle">Click any point to drill down into forecast vintages available at cutoff time</div>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Cutoff <strong style={{ color: 'var(--text-primary)' }}>{cutoff}</strong> London D−1 · WAPE: {formatPct(m?.wape_pct)}
                    </div>
                  </div>
                  <ForecastActualChart intervals={data.intervals} onSelectInterval={handleSelectInterval} />
                </div>
              </section>

              {/* ── Error over time + Histogram ── */}
              <div className="chart-section">
                <div className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">Forecast error over time</div>
                      <div className="card-subtitle">
                        <span style={{ color: 'var(--color-over)' }}>■ Over-forecast</span>
                        {' (positive — wind under-delivered) · '}
                        <span style={{ color: 'var(--color-under)' }}>■ Under-forecast</span>
                        {' (negative)'}
                      </div>
                    </div>
                  </div>
                  <ErrorOverTimeChart intervals={data.intervals} />
                </div>
                <div className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">Error distribution</div>
                      <div className="card-subtitle">
                        P5 = {formatSignedMW(m?.p5_error)} · P95 = {formatSignedMW(m?.p95_error)}
                      </div>
                    </div>
                  </div>
                  <ErrorHistogram intervals={data.intervals} p5={m?.p5_error ?? null} p95={m?.p95_error ?? null} />
                </div>
              </div>

              {/* ── Breakdown charts ── */}
              <BreakdownCharts data={data} />

              {/* ── Drilldown + Top Misses ── */}
              <section aria-labelledby="detail-heading" ref={detailRef}>
                <div className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title" id="detail-heading">Interval detail</div>
                      <div className="card-subtitle">
                        {selectedStart
                          ? `Selected: ${shortLabel(selectedStart)} London — showing all forecast vintages`
                          : 'Click a point on the forecast chart or a row in the top-misses table to drill down'}
                      </div>
                    </div>
                    {selectedStart && (
                      <button
                        className="method-btn"
                        onClick={() => setSelectedStart(null)}
                        aria-label="Clear interval selection"
                      >
                        ✕ Clear
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
                    <div className="card-title" id="misses-heading">Top 10 misses</div>
                    <div className="card-subtitle">Largest absolute errors · Click a row to drill down</div>
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

      <footer className="footer" role="contentinfo">
        <span>Wind Forecast Accuracy Portal · January 2026 GB day-ahead · Data: <a href="https://bmrs.elexon.co.uk" target="_blank" rel="noopener">Elexon BMRS</a></span>
        <span>All times shown in Europe/London · Error = Forecast − Actual · Positive = over-forecast</span>
      </footer>

      {/* Screen-reader only utility */}
      <style>{`.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}`}</style>
    </>
  )
}
