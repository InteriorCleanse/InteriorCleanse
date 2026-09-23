/**
 * EVIDENCE & ATTRIBUTION — what actually happened, and how much data says so.
 *
 * Design brief:
 *   1. The top of the screen answers "what actually happened?" in seconds:
 *      how many paper trades, what the data status is, and the one-line
 *      narration — with NOT ENOUGH DATA printed large when that is the truth.
 *   2. No number appears without its count. A cell under the sample bar shows
 *      its n in grey and no value, so the eye cannot be lied to by a colour.
 *   3. PAPER and BACKTEST never share a table. A source toggle switches every
 *      view; the comparison view is the one place both appear, side by side
 *      with both labels.
 *
 * This file draws /api/evidence and nothing else. No thresholds of its own —
 * the sample bars and every verdict come from the payload.
 */
import { getJson, esc } from './api.js'

const VIEWS = [
  ['overview', 'Overview'], ['sessions', 'Sessions'], ['regimes', 'Regimes'], ['strategies', 'Strategies'],
  ['cohorts', 'Cohorts'], ['time', 'Time'], ['paper', 'Paper'], ['backtest', 'Backtest'], ['thesis', 'Thesis'], ['quality', 'Data quality'],
]
let view = 'overview'
let source = 'paper'
let overviewData = null

const fx = (n, d = 2) => (n === null || n === undefined ? '—' : `${n >= 0 ? '+' : ''}${Number(n).toFixed(d)}`)
const pct = (n) => (n === null || n === undefined ? '—' : `${(n * 100).toFixed(1)}%`)
const when = (ms) => { try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms)) } catch { return '' } }
const statusClass = (s) => s === 'NOT ENOUGH DATA' || s === 'INSUFFICIENT SAMPLE' ? 'ev-st none' : s === 'EARLY SAMPLE' ? 'ev-st early' : s === 'DEVELOPING DATASET' ? 'ev-st dev' : 'ev-st large'

/* ---------- shared pieces ---------- */
function provenanceBar(p, extra = '') {
  return `<div class="ev-prov"><span class="ev-src ${p.source === 'PAPER' ? 'paper' : 'sim'}">${esc(p.source)}</span><span>${esc(p.dataType)}</span><span>${p.period ? `${when(p.period.from)} → ${when(p.period.to)}` : 'no period'}</span><span>${p.trades} trade${p.trades === 1 ? '' : 's'}</span>${p.missed ? `<span>${p.missed} missed</span>` : ''}${p.corrupt ? `<span class="loss">${p.corrupt} corrupt</span>` : ''}${extra}</div>`
}
function statusPill(s) { return `<span class="${statusClass(s)}">${esc(s)}</span>` }
function sourceToggle() {
  return `<div class="ev-toggle"><button data-src="paper" class="${source === 'paper' ? 'on' : ''}">PAPER</button><button data-src="backtest" class="${source === 'backtest' ? 'on' : ''}">BACKTEST <small>simulated</small></button></div>`
}
function notEnough(what) {
  return `<div class="ev-empty"><div class="ev-empty-big">NOT ENOUGH DATA</div><div class="muted">${esc(what)}</div></div>`
}
/** One cohort as a table row: every figure beside its n. */
function cohortRow(c, nameLabel) {
  const s = c.stats
  const under = s.status === 'INSUFFICIENT SAMPLE'
  const v = (x, f = fx) => (under || x === null || x === undefined ? `<span class="muted">${x === null || x === undefined ? '—' : f(x)}</span>` : f(x))
  return `<tr class="${under ? 'ev-under' : ''}">
    <td>${esc(nameLabel ?? c.name)}</td>
    <td class="num"><b>${s.n}</b></td>
    <td>${statusPill(s.status)}</td>
    <td class="num">${v(s.meanR)}</td>
    <td class="num">${v(s.medianR)}</td>
    <td class="num muted">${s.sdR === null ? '—' : '±' + s.sdR.toFixed(2)}</td>
    <td class="num muted">${s.ci95 && !under ? `${fx(s.ci95.lo)} … ${fx(s.ci95.hi)}` : '—'}</td>
    <td class="num">${v(s.winRate, pct)}</td>
    <td class="num">${s.n ? s.maxDrawdownR.toFixed(2) : '—'}</td>
    <td class="num">${s.profitFactor === null ? '<span class="muted">—</span>' : s.profitFactor.toFixed(2)}</td>
    <td class="num muted">${s.mae.meanR === null ? '—' : `${fx(s.mae.meanR)} (${s.mae.n})`}</td>
    <td class="num muted">${s.mfe.meanR === null ? '—' : `${fx(s.mfe.meanR)} (${s.mfe.n})`}</td>
  </tr>`
}
const COHORT_HEAD = '<tr><th>Cohort</th><th>N</th><th>Data status</th><th>Mean R</th><th>Median R</th><th>Variation</th><th>95% interval</th><th>Win rate</th><th>Max DD (R)</th><th>PF</th><th>MAE (n)</th><th>MFE (n)</th></tr>'

function dimensionTable(t, title, blurb) {
  const rows = t.rows.filter((r) => r.stats.n > 0)
  return `<div class="card"><h2>${esc(title)} <span class="muted">${esc(blurb)}</span></h2>
    ${provenanceBar(t.provenance)}
    ${rows.length ? `<div class="scroll"><table>${COHORT_HEAD}${t.rows.map((r) => cohortRow(r)).join('')}</table></div>` : notEnough(`No ${t.provenance.source} trades to cut by ${t.dimension}.`)}
    <div class="muted ev-note">${esc(t.note)} Rows under the sample bar show their count and grey figures; nothing is claimed for them.</div></div>`
}

function heatmapCard(h, title) {
  if (!h.rowKeys.length || !h.colKeys.length) return `<div class="card"><h2>${esc(title)}</h2>${notEnough('Nothing to cross-tabulate yet.')}</div>`
  const cell = (c) => c.shown
    ? `<td class="ev-heat ${c.meanR >= 0 ? 'pos' : 'neg'}" style="--a:${Math.min(1, Math.abs(c.meanR) / 2).toFixed(2)}"><b>${fx(c.meanR)}</b><small>n=${c.n}</small></td>`
    : `<td class="ev-heat none"><small>n=${c.n}</small></td>`
  return `<div class="card"><h2>${esc(title)}</h2>${provenanceBar(h.provenance)}
    <div class="scroll"><table class="ev-heatmap"><tr><th></th>${h.colKeys.map((k) => `<th>${esc(k)}</th>`).join('')}</tr>
    ${h.rowKeys.map((rk) => `<tr><th>${esc(rk)}</th>${h.colKeys.map((ck) => cell(h.cells.find((c) => c.row === rk && c.col === ck))).join('')}</tr>`).join('')}</table></div>
    <div class="muted ev-note">${esc(h.note)}</div></div>`
}

function thesisCard(t) {
  const cls = t.status === 'NOT ESTABLISHED' ? 'ev-th none' : t.status === 'OBSERVED POSITIVE' ? 'ev-th pos' : 'ev-th neg'
  return `<div class="card ev-thesis"><div class="ev-th-head"><h3>${esc(t.cohort)} <span class="muted">[${esc(t.source)} · n=${t.n}]</span></h3><span class="${cls}">${esc(t.status)}</span></div>
    <div class="ev-kv"><b>CURRENT OBSERVATION</b><div>${esc(t.observation)}</div></div>
    <div class="ev-kv"><b>WHAT WOULD CHANGE THIS CONCLUSION?</b><ul>${t.wouldChange.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>
    <div class="ev-kv"><b>WHAT WOULD FALSIFY IT?</b><div>${esc(t.wouldFalsify)}</div>${t.falsification ? `<div class="muted" style="font-size:12px;margin-top:4px">${esc(t.falsification.method)} · threshold source: ${esc(t.falsification.thresholdSource)}</div>` : ''}</div>
    <div class="ev-kv muted"><b>NOT CLAIMED</b><ul>${t.limits.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div></div>`
}

/* ---------- views ---------- */
function renderOverview(d) {
  const p = d.paper, b = d.backtest, c = d.comparison
  const paperHero = p.trades === 0
    ? `<div class="ev-hero none"><div class="ev-hero-k">PAPER TRADING</div><div class="ev-hero-big">NOT ENOUGH DATA</div><div class="ev-hero-sub">Trades: 0 · Status: ACCUMULATING DATA</div><div class="muted">${esc(p.statusNote)}</div></div>`
    : `<div class="ev-hero"><div class="ev-hero-k">PAPER TRADING</div><div class="ev-hero-big">${p.trades} trade${p.trades === 1 ? '' : 's'}</div><div class="ev-hero-sub">${statusPill(p.status)}</div><div class="muted">${esc(p.narration.summary.replace(/\[\[[^\]]+\]\]/g, ''))}</div></div>`
  const btHero = b.trades === 0
    ? `<div class="ev-hero sim none"><div class="ev-hero-k">BACKTEST · SIMULATION</div><div class="ev-hero-big">not cached</div><div class="muted">${esc(b.statusNote)}</div><button class="btn ghost sm" id="ev-refresh-bt">Run backtest for ${esc(d.strategyId)}</button></div>`
    : `<div class="ev-hero sim"><div class="ev-hero-k">BACKTEST · SIMULATION</div><div class="ev-hero-big">${b.trades} simulated trade${b.trades === 1 ? '' : 's'}</div><div class="ev-hero-sub">${statusPill(b.status)}${b.stale ? ' <span class="ev-st none">stale</span>' : ''}</div><div class="muted">${esc(b.narration.summary.replace(/\[\[[^\]]+\]\]/g, ''))}</div><div class="muted" style="font-size:12px;margin-top:6px">cached ${when(b.cachedAt)} · ${b.assumptions ? `spread ${b.assumptions.spreadBps}bp · slippage ${b.assumptions.slippageBps}bp · fee ${b.assumptions.takerFeePercent}%` : ''}</div><button class="btn ghost sm" id="ev-refresh-bt">Refresh backtest</button></div>`
  const q = (s, label) => `<div class="ev-q ${s.quality.verdict === 'DEGRADED' ? 'bad' : 'ok'}"><b>${esc(label)} DATA QUALITY: ${esc(s.quality.verdict)}</b><div class="muted">${esc(s.quality.note)}</div></div>`
  return `<div class="ev-heroes">${paperHero}${btHero}</div>
    <div class="card"><h2>Paper vs backtest <span class="muted">verdict: <b>${esc(c.verdict)}</b></span></h2>
      <div class="muted" style="font-size:12px">${esc(c.note)}</div>
      <div class="scroll"><table class="ev-cmp"><tr><th></th><th>BACKTEST <small>simulated</small></th><th>PAPER <small>live data · simulated execution</small></th></tr>${c.rows.map((r) => `<tr><td>${esc(r.metric)}</td><td class="num">${esc(r.backtest)}</td><td class="num">${esc(r.paper)}</td></tr>`).join('')}</table></div>
      <div class="muted ev-note">${c.caveats.map(esc).join(' ')}</div></div>
    ${q(p, 'PAPER')}${q(b, 'BACKTEST')}
    <div class="card"><h2>What each source can say</h2><div class="scroll"><table><tr><th>Field</th><th>PAPER recorded</th><th>BACKTEST recorded</th><th></th></tr>${p.fields.map((f, i) => `<tr><td>${esc(f.field)}</td><td class="num">${f.recorded}/${f.total}</td><td class="num">${b.fields[i].recorded}/${b.fields[i].total}</td><td class="muted" style="font-size:12px">${esc(f.note)}</td></tr>`).join('')}</table></div></div>
    <div class="muted ev-note">${d.notes.map(esc).join(' ')}</div>`
}

async function renderDimension(dim, title, blurb, includeEmpty = false) {
  const r = await getJson(`/api/evidence/dimension?source=${source}&dim=${dim}${includeEmpty ? '&all=1' : ''}`)
  return dimensionTable(r.data.table, title, blurb)
}

async function renderSessions() {
  const [dim, x] = await Promise.all([renderDimension('session', 'By session', 'measurements, not a ranking', true), getJson(`/api/evidence/cross?source=${source}&rows=session&cols=strategyId`)])
  const x2 = await getJson(`/api/evidence/cross?source=${source}&rows=session&cols=regime`)
  return dim + heatmapCard(x.data.heat, 'Session × strategy — mean R, with n') + heatmapCard(x2.data.heat, 'Session × regime — mean R, with n')
}
async function renderRegimes() {
  const [dim, x] = await Promise.all([renderDimension('regime', 'By regime', 'the regime the engine read at decision time', true), getJson(`/api/evidence/cross?source=${source}&rows=regime&cols=strategyId`)])
  const vol = await renderDimension('volatility', 'By volatility label', 'quiet / normal / wild at decision time — paper snapshot only', true)
  return dim + heatmapCard(x.data.heat, 'Regime × strategy — mean R, with n') + vol
}
async function renderStrategies() {
  const [dim, fam, exit] = await Promise.all([
    renderDimension('strategyId', 'By strategy', 'not ranked — ordered by sample size'),
    renderDimension('family', 'By family', ''),
    renderDimension('exitReason', 'By how it ended', 'target / stop / time / manual'),
  ])
  return dim + fam + exit
}
async function renderTime() {
  const [h, w, x] = await Promise.all([
    renderDimension('hourET', 'By hour (New York)', 'decision time'),
    renderDimension('weekdayET', 'By weekday (New York)', '', true),
    getJson(`/api/evidence/cross?source=${source}&rows=weekdayET&cols=hourET`),
  ])
  return h + w + heatmapCard(x.data.heat, 'Weekday × hour — mean R, with n')
}
async function renderThesis() {
  const dims = ['session', 'regime', 'strategyId']
  const all = await Promise.all(dims.map((d) => getJson(`/api/evidence/dimension?source=${source}&dim=${d}`)))
  const theses = all.flatMap((r) => r.data.theses)
  if (!theses.length) return `<div class="card"><h2>Falsifiable theses</h2>${notEnough('No cohorts to state a thesis about.')}</div>`
  const established = theses.filter((t) => t.status !== 'NOT ESTABLISHED')
  return `<div class="card"><h2>Falsifiable theses <span class="muted">${established.length} observed · ${theses.length - established.length} not established</span></h2><div class="muted">Each thesis commits, in advance, to the number that would prove it wrong. NOT ESTABLISHED is the default and the honest state for most cohorts most of the time.</div></div>` + theses.map(thesisCard).join('')
}
async function renderQuality() {
  const d = overviewData ?? (await getJson('/api/evidence')).data
  const s = source === 'paper' ? d.paper : d.backtest
  const q = s.quality
  const issue = (i) => `<tr><td><span class="${i.severity === 'degraded' ? 'loss' : i.severity === 'warn' ? 'skip' : 'muted'}">${esc(i.severity.toUpperCase())}</span></td><td>${esc(i.kind)}</td><td class="num">${i.count}</td><td class="muted" style="font-size:12px">${esc(i.detail)}</td></tr>`
  return `<div class="card"><h2>Data quality <span class="${q.verdict === 'DEGRADED' ? 'loss' : 'win'}">${esc(q.verdict)}</span></h2>${provenanceBar(s.provenance)}
    <div class="plain">${esc(q.note)}</div>
    <div class="stats"><div class="stat"><div class="k">Expected bars</div><div class="v">${q.candles.expected}</div></div><div class="stat"><div class="k">Present</div><div class="v">${q.candles.present}</div></div><div class="stat"><div class="k">Missing</div><div class="v ${q.candles.missing ? 'skip' : ''}">${q.candles.missing}</div></div><div class="stat"><div class="k">Duplicates</div><div class="v ${q.candles.duplicates ? 'loss' : ''}">${q.candles.duplicates}</div></div><div class="stat"><div class="k">Anomalies</div><div class="v ${q.candles.anomalies.length ? 'loss' : ''}">${q.candles.anomalies.length}</div></div><div class="stat"><div class="k">Feed age</div><div class="v ${q.feed.stale ? 'loss' : ''}">${q.feed.ageSec === null ? '—' : q.feed.ageSec + 's'}</div></div></div>
    <div class="stats"><div class="stat"><div class="k">Records</div><div class="v">${q.records.total}</div></div><div class="stat"><div class="k">Trades</div><div class="v">${q.records.trades}</div></div><div class="stat"><div class="k">Corrupt</div><div class="v ${q.records.corrupt ? 'loss' : ''}">${q.records.corrupt}</div></div><div class="stat"><div class="k">Incomplete</div><div class="v ${q.records.incomplete ? 'loss' : ''}">${q.records.incomplete}</div></div><div class="stat"><div class="k">No regime</div><div class="v">${q.records.missingRegime}</div></div><div class="stat"><div class="k">No snapshot</div><div class="v">${q.records.missingSnapshot}</div></div></div>
    ${q.issues.length ? `<div class="scroll"><table><tr><th></th><th>Issue</th><th>Count</th><th>Detail</th></tr>${q.issues.map(issue).join('')}</table></div>` : '<div class="muted">No issues.</div>'}
    <div class="muted ev-note">Thresholds: missing candles over ${(q.thresholds.missingCandleShare * 100).toFixed(0)}% of the window, any duplicate or anomaly, any corrupt record, a stale feed, or more than ${(q.thresholds.missingRegimeShare * 100).toFixed(0)}% of trades without a regime → DEGRADED.</div></div>`
}
async function renderTrades(src) {
  const r = await getJson(`/api/evidence/trades?source=${src}`)
  const d = r.data
  const p = d.provenance
  if (!d.trades.length && !d.missed.length) return `<div class="card"><h2>${src === 'paper' ? 'Paper trading journal' : 'Backtest trades'}</h2>${provenanceBar(p)}${notEnough(src === 'paper' ? 'Trades: 0 · Status: ACCUMULATING DATA. Every closed paper trade will appear here with its decision-time snapshot.' : 'No backtest cached. Refresh it from the Overview.')}</div>`
  const row = (t) => `<tr class="ev-trade" data-id="${esc(t.id)}"><td class="muted">${when(t.decidedAt)}</td><td>${esc(t.strategyId)}</td><td>${esc(t.session)}</td><td>${esc(t.regime ?? '—')}</td><td>${esc(t.volatility ?? '—')}</td><td>${esc(t.direction)}</td><td class="num">${t.entry === null ? '—' : t.entry.toFixed(2)}</td><td class="num">${t.stop === null ? '—' : t.stop.toFixed(2)}</td><td class="num">${t.target === null ? '—' : t.target.toFixed(2)}</td><td class="num">${t.exit === null ? '—' : t.exit.toFixed(2)}</td><td>${esc(t.exitReason ?? '—')}</td><td class="num ${t.rMultiple === null ? '' : t.rMultiple >= 0 ? 'win' : 'loss'}">${fx(t.rMultiple)}</td><td class="num muted">${t.mae.status === 'OBSERVED' ? fx(t.mae.r) : t.mae.status.toLowerCase()}</td><td class="num muted">${t.mfe.status === 'OBSERVED' ? fx(t.mfe.r) : t.mfe.status.toLowerCase()}</td><td class="muted">${t.durationMs === null ? '—' : Math.round(t.durationMs / 60_000) + 'm'}</td><td>${src === 'paper' ? (t.hasSnapshot ? '<span class="win">yes</span>' : '<span class="muted">no</span>') : '—'}</td></tr>`
  return `<div class="card"><h2>${src === 'paper' ? 'Paper trading journal' : 'Backtest trades'} <span class="muted">${d.trades.length} taken${d.missed.length ? ` · ${d.missed.length} missed` : ''}${d.corrupt.length ? ` · <span class="loss">${d.corrupt.length} corrupt</span>` : ''}</span></h2>${provenanceBar(p)}
    <div class="scroll"><table><tr><th>Decided (NY)</th><th>Strategy</th><th>Session</th><th>Regime</th><th>Vol</th><th>Side</th><th>Entry</th><th>Stop</th><th>Target</th><th>Exit</th><th>How</th><th>R</th><th>MAE</th><th>MFE</th><th>Held</th><th>Snapshot</th></tr>${d.trades.map(row).join('')}</table></div>
    ${src === 'paper' ? '<div class="muted ev-note">Click a row for WHY — the engine\'s own recorded reasons at decision time, the timeline, and the exit. Records without a snapshot predate it and are not reconstructed.</div>' : ''}
    <div id="ev-trade-detail"></div>
    ${d.missed.length ? `<h3 style="margin-top:14px">Missed / refused</h3><div class="scroll"><table><tr><th>Decided (NY)</th><th>Strategy</th><th>Session</th><th>Side</th><th>Intended</th></tr>${d.missed.map((t) => `<tr><td class="muted">${when(t.decidedAt)}</td><td>${esc(t.strategyId)}</td><td>${esc(t.session)}</td><td>${esc(t.direction)}</td><td class="num">${t.intendedEntry === null ? '—' : t.intendedEntry.toFixed(2)}</td></tr>`).join('')}</table></div>` : ''}</div>`
}
async function showTradeDetail(id) {
  const box = document.getElementById('ev-trade-detail')
  if (!box) return
  box.innerHTML = '<div class="muted">loading…</div>'
  try {
    const r = await getJson(`/api/evidence/trade?id=${encodeURIComponent(id)}`)
    const d = r.data
    const reasons = d.why ? d.why.reasons.map((x) => `<tr><td class="muted">${esc(x.group)}</td><td>${x.passed ? '<span class="win">✓</span>' : '<span class="loss">✗</span>'} ${esc(x.label)}</td><td class="muted" style="font-size:12px">${esc(x.detail)}</td><td class="muted" style="font-size:11px">${esc(x.source)}</td></tr>`).join('') : ''
    const snap = d.snapshot
    box.innerHTML = `<div class="ev-detail"><h3>WHY — ${esc(d.record.strategyId)} ${esc(d.record.direction)} at ${when(d.record.decidedAt)}</h3>
      <div class="muted" style="font-size:12px">${esc(d.whyNote)}</div>
      ${snap ? `<div class="ev-chips"><span>engine ${esc(snap.engineVersion)}</span><span>features v${snap.featureVersion}</span><span>regime ${esc(d.record.regime ?? 'not recorded')}</span><span>volatility ${esc(snap.volatility ?? 'not recorded')}</span><span>fused ${esc(snap.fusedAction ?? '—')} ${snap.fusedScore ?? ''}</span><span>news ${snap.inBlackout ? 'inside blackout' : snap.newsMinutes === null ? 'none ahead' : snap.newsMinutes + ' min away'}</span><span>risk ${snap.riskVetoedBy ? 'VETO ' + esc(snap.riskVetoedBy) : 'approved'}</span></div>` : ''}
      ${d.why ? `<div class="scroll"><table><tr><th>Group</th><th>Reason</th><th>Detail</th><th>Source</th></tr>${reasons}</table></div>` : ''}
      <h4>Timeline</h4><div class="ev-stages">${d.stages.map((s) => `<div class="ev-stage ${s.at === null ? 'none' : ''}"><b>${esc(s.stage)}</b><span class="muted">${s.at === null ? '—' : when(s.at)}</span><div>${esc(s.detail)}</div></div>`).join('')}</div>
      <div class="plain"><b>Exit:</b> ${esc(d.exit.reason ?? '—')} at ${d.exit.price === null ? '—' : d.exit.price.toFixed(2)} · ${fx(d.exit.rMultiple)}R · MAE ${d.record.mae.status === 'OBSERVED' ? fx(d.record.mae.r) + 'R' : d.record.mae.status.toLowerCase()} · MFE ${d.record.mfe.status === 'OBSERVED' ? fx(d.record.mfe.r) + 'R' : d.record.mfe.status.toLowerCase()}</div></div>`
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  } catch (e) { box.innerHTML = `<div class="plain">Could not load that trade: ${esc(e.message)}.</div>` }
}
async function renderCohorts() {
  const dims = ['strategyId', 'session', 'regime', 'volatility', 'direction', 'hourET', 'weekdayET', 'exitReason', 'newsBucket', 'qualityBucket']
  return `<div class="card"><h2>Build a cohort</h2><div class="muted">Combine up to three dimensions. The result shows its sample size first; under ${overviewData ? overviewData.bars.insufficient : 10} trades nothing is claimed.</div>
    <div class="ev-builder">${[0, 1, 2].map((i) => `<div><select class="ev-dim" data-i="${i}"><option value="">— dimension —</option>${dims.map((d) => `<option>${d}</option>`).join('')}</select><input class="ev-val" data-i="${i}" placeholder="value (e.g. london)"></div>`).join('')}<button class="btn sm" id="ev-cohort-run">Measure</button></div>
    <div id="ev-cohort-out"></div></div>`
}
async function runCohort() {
  const filters = []
  document.querySelectorAll('.ev-dim').forEach((sel) => {
    const i = sel.dataset.i, val = document.querySelector(`.ev-val[data-i="${i}"]`).value.trim()
    if (sel.value && val) filters.push({ dimension: sel.value, values: val.split(',').map((s) => s.trim()).filter(Boolean) })
  })
  const out = document.getElementById('ev-cohort-out')
  out.innerHTML = '<div class="muted">measuring…</div>'
  try {
    const r = await getJson(`/api/evidence/cohort?source=${source}&filters=${encodeURIComponent(JSON.stringify(filters))}`)
    const { cohort: c, thesis: t } = r.data
    out.innerHTML = `${provenanceBar(c.provenance)}<div class="scroll"><table>${COHORT_HEAD}${cohortRow(c, c.name)}</table></div>
      <div class="muted ev-note">${esc(c.stats.statusNote)} ${c.stats.tradesNeeded !== null && c.stats.n ? `At this mean and spread, roughly ${c.stats.tradesNeeded} trades would be needed before the interval could clear zero.` : ''} Trade ids: ${c.recordIds.length ? esc(c.recordIds.slice(0, 12).join(', ')) + (c.recordIds.length > 12 ? ` … (+${c.recordIds.length - 12})` : '') : 'none'}</div>` + thesisCard(t)
  } catch (e) { out.innerHTML = `<div class="plain">Could not measure that cohort: ${esc(e.message)}.</div>` }
}

/* ---------- shell ---------- */
async function renderView() {
  const out = document.getElementById('evidence-out')
  const status = document.getElementById('evidence-status')
  if (!out) return
  if (status) status.textContent = 'loading…'
  try {
    let html = ''
    switch (view) {
      case 'overview': overviewData = (await getJson('/api/evidence')).data; html = renderOverview(overviewData); break
      case 'sessions': html = await renderSessions(); break
      case 'regimes': html = await renderRegimes(); break
      case 'strategies': html = await renderStrategies(); break
      case 'cohorts': html = await renderCohorts(); break
      case 'time': html = await renderTime(); break
      case 'paper': html = await renderTrades('paper'); break
      case 'backtest': html = await renderTrades('backtest'); break
      case 'thesis': html = await renderThesis(); break
      case 'quality': html = await renderQuality(); break
    }
    out.innerHTML = html
    if (status) status.textContent = `updated ${new Date().toLocaleTimeString()}`
  } catch (e) {
    out.innerHTML = `<div class="plain">Couldn't load the evidence: ${esc(e.message)}. Showing nothing rather than making something up.</div>`
    if (status) status.textContent = 'failed'
  }
}
function renderShell() {
  const nav = document.getElementById('evidence-views')
  if (!nav) return
  nav.innerHTML = VIEWS.map(([id, label]) => `<button data-view="${id}" class="${id === view ? 'on' : ''}">${label}</button>`).join('')
  const tog = document.getElementById('evidence-source')
  if (tog) tog.innerHTML = view === 'overview' || view === 'paper' || view === 'backtest' || view === 'cohorts' && false ? '' : sourceToggle()
}
async function loadEvidence() { renderShell(); await renderView() }

document.addEventListener('click', async (e) => {
  const b = e.target.closest('#evidence-views button[data-view]')
  if (b) { view = b.dataset.view; await loadEvidence(); return }
  const s = e.target.closest('#evidence-source button[data-src]')
  if (s) { source = s.dataset.src; await loadEvidence(); return }
  if (e.target.closest('#ev-refresh-bt')) {
    const btn = e.target.closest('#ev-refresh-bt'); btn.disabled = true; btn.textContent = 'running the replay…'
    try {
      const cfg = await getJson('/api/config')
      const res = await fetch('/api/evidence/backtest', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-mrcash-csrf': cfg.csrf }, body: '{}' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err) { btn.textContent = `failed: ${err.message}` ; return }
    await loadEvidence(); return
  }
  if (e.target.closest('#ev-cohort-run')) { await runCohort(); return }
  const tr = e.target.closest('tr.ev-trade[data-id]')
  if (tr) { await showTradeDetail(tr.dataset.id); return }
})

window.loadEvidence = loadEvidence
document.getElementById('btn-evidence')?.addEventListener('click', loadEvidence)
