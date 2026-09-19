/**
 * OPERATIONS — is Mr. Cash running, on what data, and is the record whole?
 *
 * One health document (/api/ops/health) drawn as: overall status, the data
 * source (PAPER = live data · SIMULATED EXECUTION, or MOCK), every heartbeat
 * mark with its age and its printed threshold, feed health with counters,
 * the paper engine's last decision / fill / close and checkpoints, research
 * and learning cadence, database health and the daily integrity report,
 * trade reconciliation, soak counters, the ops log and the active alerts.
 * Read-only except "mark reviewed" on a checkpoint and "run retries".
 */
import { getJson, esc } from './api.js'

const VIEWS = [['overview', 'Overview'], ['market', 'Market data'], ['paper', 'Paper engine'], ['research', 'Research & learning'], ['db', 'Database & integrity'], ['reconcile', 'Reconciliation'], ['soak', 'Soak'], ['log', 'Log & alerts']]
let view = 'overview'

const when = (ms) => { if (ms === null || ms === undefined) return '—'; try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(ms)) } catch { return '' } }
const age = (sec) => sec === null || sec === undefined ? 'never' : sec < 90 ? `${sec}s ago` : sec < 5400 ? `${Math.round(sec / 60)} min ago` : sec < 172800 ? `${(sec / 3600).toFixed(1)} h ago` : `${(sec / 86400).toFixed(1)} d ago`
const dur = (sec) => sec === null || sec === undefined ? '—' : sec < 3600 ? `${Math.round(sec / 60)} min` : sec < 172800 ? `${(sec / 3600).toFixed(1)} h` : `${(sec / 86400).toFixed(1)} d`
const cls = (s) => /HEALTHY|OK|CONSISTENT|PAPER/.test(s) ? 'large' : /DEGRADED|WARN|INCOMPLETE|MOCK|EARLY|DEVELOPING/.test(s) ? 'early' : /STALE|ISSUES|MISMATCH/.test(s) ? 'dev' : 'none'
const pill = (s) => `<span class="ev-st ${cls(String(s))}">${esc(s)}</span>`
const card = (title, body, sub) => `<div class="card"><h2>${title}</h2>${body}${sub ? `<div class="muted sc-prov">${esc(sub)}</div>` : ''}</div>`
const hero = (k, v, sub) => `<div class="ev-hero"><div class="ev-hero-k">${esc(k)}</div><div class="ev-hero-big">${v}</div>${sub ? `<div class="ev-hero-sub muted">${esc(sub)}</div>` : ''}</div>`
const note = (n) => `<div class="ev-note">${esc(n)}</div>`
const kv = (rows) => `<table>${rows.map(([k, v]) => `<tr><td class="muted">${esc(k)}</td><td>${v}</td></tr>`).join('')}</table>`
async function postJson(path, body) {
  const cfg = await getJson('/api/config')
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-mrcash-csrf': cfg.csrf }, body: JSON.stringify(body || {}) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || j.ok === false) throw new Error(j.error || `HTTP ${res.status}`)
  return j.data
}

const banner = (h) => `<div class="ev-heroes">${hero('overall', pill(h.overall), h.verdict)}${hero('data source', `${pill(h.dataSource.label)} <span class="ev-st early">${esc(h.dataSource.execution)}</span>`, h.dataSource.detail)}${hero('security', pill(h.security.ok ? 'PAPER ONLY' : 'LIVE FLAG SET'), h.security.note)}</div>`

const markRows = (marks) => `<table><tr><th>mark</th><th>status</th><th>last</th><th>age</th><th>rule</th><th>detail</th></tr>${Object.values(marks).map((m) => `<tr><td>${esc(m.name)}</td><td>${pill(m.status)}</td><td class="muted">${when(m.at)}</td><td>${age(m.ageSec)}</td><td class="muted">${esc(m.rule)}</td><td class="muted">${esc(m.detail)}</td></tr>`).join('')}</table>`

function renderOverview(h) {
  const alerts = h.alerts.length ? h.alerts.map((a) => `<div class="sc-frame"><div class="sc-frame-t">${pill(a.severity)} ${esc(a.title)}</div><div class="muted">${esc(a.body)}</div></div>`).join('') : '<div class="muted">No active alert.</div>'
  return `${banner(h)}${card('MR. CASH HEARTBEAT', markRows(h.heartbeat.marks), h.heartbeat.note)}
    ${card(`ACTIVE ALERTS (${h.alerts.length})`, alerts, 'alerts also ring the bell once per hour per condition and are counted on the ops log')}
    ${card('PROCESS', kv([['pid', String(h.process.pid)], ['node', esc(h.process.node)], ['process uptime', dur(h.process.uptimeSec)], ['engine version', esc(h.version)], ['lock', h.lock.info ? `pid ${h.lock.info.pid} on ${esc(h.lock.info.host)} · ${h.lock.ours ? 'this process' : '<span class="loss">ANOTHER PROCESS</span>'} · heartbeat ${when(h.lock.info.heartbeatAt)}` : 'no lock file (CLI or test run)'], ['memory', `${h.performance.memory.rssMB} MB rss · ${h.performance.memory.heapMB} MB heap`], ['monitor tick', h.performance.tick.last === null ? 'not yet' : `${h.performance.tick.last} ms (p95 ${h.performance.tick.p95} ms over ${h.performance.tick.samples})`], ['close → cycle latency', h.performance.cycleLatency.last === null ? 'no cycle measured yet' : `${h.performance.cycleLatency.last} ms (p95 ${h.performance.cycleLatency.p95} ms over ${h.performance.cycleLatency.samples})`], ['database', `${(h.performance.db.sizeBytes / 1048576).toFixed(1)} MB${h.performance.db.growthBytesPerHour === null ? '' : ` · ${(h.performance.db.growthBytesPerHour / 1024).toFixed(0)} KB/h since ${when(h.performance.db.since)}`}`]]))}`
}

function renderMarket(h) {
  const f = h.feed
  const c = f.counters
  return `${banner(h)}<div class="ev-heroes">${hero('feed', pill(f.verdict), f.note)}${hero('behind by', f.freshness.behindBy < 0 ? 'no candle' : `${f.freshness.behindBy} interval(s)`, `degraded > ${f.thresholds.degradedBehind}, stale > ${f.thresholds.staleBehind}`)}${hero('missing (24 h)', f.missing.missingCandles, `${f.missing.present} of ${f.missing.expected} present · ${f.missing.gaps.length} gap(s) · ${f.missing.knownGaps} known`)}${hero('stale for', f.staleForSec === null ? '—' : dur(f.staleForSec))}</div>
    ${card('REST', kv([['available', f.rest.available === null ? 'not reported' : f.rest.available ? 'yes' : '<span class="loss">no</span>'], ['last heartbeat', when(f.rest.lastHeartbeatAt)], ['detail', esc(f.rest.detail)]]))}
    ${card('WEBSOCKET', kv([['configured', f.websocket.configured ? 'yes' : 'no (REST polling)'], ['connected', f.websocket.connected === null ? 'not reported' : f.websocket.connected ? 'yes' : '<span class="loss">no</span>'], ['host', esc(f.websocket.host ?? '—')], ['reconnects (stream lifetime)', String(f.websocket.reconnects)], ['last message', when(f.websocket.lastMessageAt)], ['detail', esc(f.websocket.detail)]]))}
    ${card('FRESHNESS', kv([['last stored candle', when(f.freshness.lastCloseOpenTime)], ['exchange clock expects', when(f.freshness.expectedOpenTime)], ['age', age(f.freshness.ageSec)], ['detail', esc(f.freshness.detail)]]))}
    ${card('COUNTERS SINCE THIS PROCESS STARTED', kv([['candle closes', String(c.closes)], ['duplicate closes', String(c.duplicateCloses)], ['timestamp anomalies', String(c.timestampAnomalies)], ['gap events', String(c.gapEvents)], ['stream up / down', `${c.streamUps} / ${c.streamDowns}`], ['reconnects seen', `${c.reconnectsSeen} (${c.recentReconnects.length} in the last hour)`], ['last drop', c.lastDownReason ? `${esc(c.lastDownReason)} at ${when(c.lastDownAt)}` : '—']]), 'malformed stream frames are dropped by the parser before the bus and are not counted here')}
    ${f.missing.gaps.length ? card('GAPS IN THE LAST 24 H', `<table><tr><th>from</th><th>to</th></tr>${f.missing.gaps.map((g) => `<tr><td>${when(g.from)}</td><td>${when(g.to)}</td></tr>`).join('')}</table>`) : ''}`
}

function renderPaper(h) {
  const m = h.heartbeat.marks
  const cps = h.checkpoints
  const cpRows = cps.all.length ? cps.all.map((c) => `<div class="sc-frame"><div class="sc-frame-t">${pill(c.reviewed ? 'REVIEWED' : 'HUMAN REVIEW REQUIRED')} ${esc(c.label)} <span class="muted">reached ${when(c.reachedAt)} · ${esc(c.sampleStatus)}</span></div><div class="muted">${c.summary.closed} closed · ${c.summary.wins}W ${c.summary.losses}L ${c.summary.flats}F · avg ${c.summary.avgR === null ? '—' : c.summary.avgR.toFixed(2)}R · ${c.summary.strategies} strateg${c.summary.strategies === 1 ? 'y' : 'ies'} · ${c.summary.sessions} session(s)</div><ul>${c.review.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>${c.reviewed ? '' : `<button class="btn ghost" data-cp="${esc(c.id)}">Mark reviewed</button>`}</div>`).join('') : '<div class="muted">No checkpoint reached yet.</div>'
  return `${banner(h)}${note(`Every paper figure is ${h.dataSource.execution} on ${h.dataSource.label === 'PAPER' ? 'live market data' : 'a ' + h.dataSource.label.toLowerCase() + ' feed'}: fills happen at the next candle open plus spread and slippage, never at a price the market did not print.`)}
    <div class="ev-heroes">${hero('last decision', when(m.paperDecision.at), `${pill(m.paperDecision.status)} ${m.paperDecision.detail}`)}${hero('last simulated fill', when(m.paperFill.at), `${pill(m.paperFill.status)} ${m.paperFill.detail}`)}${hero('last close', when(m.paperClose.at), `${pill(m.paperClose.status)} ${m.paperClose.detail}`)}${hero('engine cycle', age(m.engineCycle.ageSec), `${pill(m.engineCycle.status)} ${m.engineCycle.rule}`)}</div>
    ${card('RECORD', kv([['closed paper trades', String(h.soak.counters.closes)], ['missed orders', String(h.soak.counters.missed)], ['open or pending', String(h.soak.counters.openOrPending)], ['decisions on record', String(h.soak.counters.decisions)], ['next checkpoint', cps.next ? `${esc(cps.next.label)} — ${cps.next.remaining} to go` : 'all checkpoints reached']]))}
    ${card('PAPER DATA CHECKPOINTS', cpRows, 'recorded once when reached, with a frozen summary; a checkpoint changes what you read next, never a strategy')}`
}

function renderResearch(h) {
  const m = h.heartbeat.marks
  return `${banner(h)}<div class="ev-heroes">${hero('last research tick', when(m.researchTick.at), `${pill(m.researchTick.status)} ${m.researchTick.detail}`)}${hero('last observer event', when(m.observerEvent.at), `${pill(m.observerEvent.status)} ${m.observerEvent.detail}`)}${hero('research runs', h.soak.counters.researchRuns)}${hero('experiments', h.soak.counters.experiments)}</div>
    ${card('COUNTS', kv([['observations', String(h.soak.counters.observations)], ['case studies', String(h.soak.counters.caseStudies)], ['research queue', String(h.soak.counters.queueItems)], ['hypotheses', String(h.soak.counters.hypotheses)], ['experiments', String(h.soak.counters.experiments)], ['knowledge items', String(h.soak.counters.knowledgeItems)], ['failures on record', String(h.soak.counters.failures)], ['engine cycles observed', String(h.soak.counters.cycles)]]))}
    ${card('FAILED WRITES WAITING FOR RETRY', `<div>${h.retries.pending} pending${h.retries.oldest ? ` · oldest failed ${when(h.retries.oldest)}` : ''}</div><div class="row"><button class="btn ghost" id="ops-retry">Run retries now</button><span class="muted" id="ops-retry-out"></span></div>`, 'a failed post-mortem or lesson write is recorded here and retried by the research tick; handlers are idempotent, so nothing is written twice')}
    ${note(m.researchTick.rule)}`
}

function renderDb(h) {
  const i = h.integrity
  const sec = (name, s) => `<div class="sc-frame"><div class="sc-frame-t">${pill(s.ok ? 'OK' : 'ISSUES')} ${esc(name)}</div><div class="muted">${esc(s.note)}</div>${s.issues.length ? `<ul>${s.issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<div class="muted">${Object.entries(s.counts).map(([k, v]) => `${esc(k)} ${v}`).join(' · ')}</div></div>`
  return `${banner(h)}<div class="ev-heroes">${hero('persistence', pill(h.heartbeat.marks.persistence.status), `${h.heartbeat.marks.persistence.detail} ${age(h.heartbeat.marks.persistence.ageSec)}`)}${hero('quick_check', i ? pill(i.store.quickCheck === 'ok' ? 'OK' : i.store.quickCheck) : '—')}${hero('daily integrity', i ? pill(i.verdict) : 'not run', i ? `${i.dayKey} · ${i.issues.length} issue(s) · ${i.durationMs} ms` : 'runs on the first monitor tick of each trading day')}${hero('size', `${(h.performance.db.sizeBytes / 1048576).toFixed(1)} MB`)}</div>
    ${i ? card('DAILY DATA INTEGRITY REPORT', `${sec('candles', i.candles)}${sec('observations', i.observations)}${sec('paper records', i.paper)}${sec('research', i.research)}${sec('knowledge', i.knowledge)}${sec('store', i.store)}`, 'a corrupt row is counted and named, never deleted') : card('DAILY DATA INTEGRITY REPORT', '<div class="muted">Not run yet in this data directory.</div>')}
    <div class="row"><a class="btn ghost" href="/api/ops/integrity?run=1" target="_blank" rel="noopener">Run now (JSON)</a><a class="btn ghost" href="/api/ops/integrity?history=1" target="_blank" rel="noopener">History (JSON)</a></div>`
}

async function renderReconcile(h) {
  const r = h.reconciliation
  if (!r || r.at === null) return `${banner(h)}${card('TRADE RECONCILIATION', '<div class="muted">No reconciliation has run yet; the research tick runs one every cycle.</div><div class="row"><a class="btn ghost" href="/api/ops/reconciliation?run=1" target="_blank" rel="noopener">Run now (JSON)</a></div>')}`
  const byCheck = Object.entries(r.byCheck).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num ${v.failed ? 'loss' : ''}">${v.failed}</td><td class="num">${v.ok}</td><td class="num muted">${v.skipped}</td></tr>`).join('')
  const problems = r.problems.length ? r.problems.map((p) => `<div class="sc-frame"><div class="sc-frame-t">${pill(p.verdict)} ${esc(p.id)} <span class="muted">closed ${when(p.closedAt)}</span></div>${p.checks.filter((c) => !c.ok).map((c) => `<div><b>${esc(c.name)}</b>: expected ${esc(c.expected)}, actual ${esc(c.actual)}${c.note ? ` — ${esc(c.note)}` : ''}</div>`).join('')}${p.incomplete.length ? `<div class="muted">Incomplete: ${p.incomplete.map(esc).join('; ')}</div>` : ''}</div>`).join('') : '<div class="muted">Every reconciled trade is consistent.</div>'
  return `${banner(h)}<div class="ev-heroes">${hero('reconciled', r.total, `as of ${when(r.at)}`)}${hero('consistent', r.consistent)}${hero('mismatched', r.mismatched)}${hero('incomplete', r.incomplete, 'a field the check needs is missing — reported, not faulted')}</div>
    ${note(r.note)}
    ${card('BY CHECK', `<table><tr><th>check</th><th class="num">failed</th><th class="num">ok</th><th class="num">skipped</th></tr>${byCheck}</table>`)}
    ${card('LEDGER', kv([['closed trades', String(r.ledger.closes)], ['ledger close rows', String(r.ledger.rowsForCloses)], ['ledger missed rows', String(r.ledger.missedRows)]]))}
    ${card('PROBLEMS', problems)}
    <div class="row"><a class="btn ghost" href="/api/ops/reconciliation?run=1" target="_blank" rel="noopener">Recompute now (JSON)</a></div>`
}

function renderSoak(h) {
  const s = h.soak
  const c = s.counters
  return `${banner(h)}<div class="ev-heroes">${hero('mode', pill(s.mode))}${hero('observed uptime', dur(s.uptime.totalSec), s.uptime.note)}${hero('current run', dur(s.uptime.currentRunSec), `longest ${dur(s.uptime.longestRunSec)}`)}${hero('restarts', s.restarts, `${s.runs} run(s) · ${s.recoveries} recovered a live position`)}</div>
    ${card('SINCE THE SOAK BEGAN', kv([['soak started', when(s.soakStartedAt)], ['this run started', when(s.runStartedAt)], ['candles closed (on the bus)', String(c.candlesClosed)], ['engine cycles', String(c.cycles)], ['paper decisions / fills / closes / missed', `${c.decisions} / ${c.fills} / ${c.closes} / ${c.missed}`], ['observations / case studies', `${c.observations} / ${c.caseStudies}`], ['research runs / experiments / hypotheses / queue', `${c.researchRuns} / ${c.experiments} / ${c.hypotheses} / ${c.queueItems}`], ['knowledge items / failures', `${c.knowledgeItems} / ${c.failures}`], ['reconnects / stream drops / gap events', `${c.reconnects} / ${c.streamDowns} / ${c.gapEvents}`], ['duplicate closes / timestamp anomalies', `${c.duplicateCloses} / ${c.timestampAnomalies}`], ['feed stale / degraded', `${dur(c.staleFeedSec)} / ${dur(c.degradedFeedSec)}`], ['errors / criticals on the ops log', `${c.errors} / ${c.criticals}`], ['last feed verdict', s.lastVerdict ? pill(s.lastVerdict) : '—']]), s.note)}
    ${card('PAPER DAY REPORTS', `<div class="muted">One permanent record per trading day, written by the monitor when the day rolls.</div><div class="row"><a class="btn ghost" href="/api/ops/day" target="_blank" rel="noopener">Today so far (JSON)</a><a class="btn ghost" href="/api/ops/days" target="_blank" rel="noopener">All days (JSON)</a></div>`)}`
}

async function renderLog(h) {
  const { data: l } = await getJson('/api/ops/log?n=150')
  const rows = l.entries.length ? [...l.entries].reverse().map((e) => `<tr><td class="muted">${when(e.t)}</td><td>${pill(e.severity)}</td><td>${esc(e.component)}</td><td>${esc(e.event)}</td><td class="muted">${esc(e.cid ?? '')}</td><td>${esc(e.message)}</td></tr>`).join('') : '<tr><td colspan="6" class="muted">Nothing logged yet in this process.</td></tr>'
  const sup = l.suppressed.length ? `<table><tr><th>line</th><th class="num">repeats</th><th>first</th><th>last</th></tr>${l.suppressed.map((s) => `<tr><td class="muted">${esc(s.key)}</td><td class="num">${s.count}</td><td>${when(s.firstAt)}</td><td>${when(s.lastAt)}</td></tr>`).join('')}</table>` : '<div class="muted">No repeated line suppressed.</div>'
  return `${banner(h)}<div class="ev-heroes">${hero('errors (total)', l.errors.total)}${hero('errors (last hour)', l.errors.lastHour)}${hero('last error', l.errors.lastError ? `${esc(l.errors.lastError.component)}.${esc(l.errors.lastError.event)}` : '—', l.errors.lastError ? `${when(l.errors.lastError.t)} · ${l.errors.lastError.message}` : '')}${hero('last critical', l.errors.lastCritical ? `${esc(l.errors.lastCritical.component)}.${esc(l.errors.lastCritical.event)}` : '—', l.errors.lastCritical ? `${when(l.errors.lastCritical.t)} · ${l.errors.lastCritical.message}` : '')}</div>
    ${card('BY COMPONENT', kv(Object.entries(l.errors.byComponent).length ? Object.entries(l.errors.byComponent).map(([k, v]) => [k, String(v)]) : [['—', 'no error']]))}
    ${card('RECENT OPS LOG', `<div class="scroll"><table><tr><th>when</th><th>severity</th><th>component</th><th>event</th><th>correlation</th><th>message</th></tr>${rows}</table></div>`, l.note)}
    ${card('SUPPRESSED REPEATS', sup)}`
}

async function renderView() {
  const out = document.getElementById('ops-out')
  const st = document.getElementById('ops-status')
  try {
    const { data: h } = await getJson('/api/ops/health')
    st.textContent = `${h.overall} · ${h.dataSource.label} · ${when(h.at)}`
    out.innerHTML = view === 'market' ? renderMarket(h) : view === 'paper' ? renderPaper(h) : view === 'research' ? renderResearch(h) : view === 'db' ? renderDb(h) : view === 'reconcile' ? await renderReconcile(h) : view === 'soak' ? renderSoak(h) : view === 'log' ? await renderLog(h) : renderOverview(h)
    out.querySelectorAll('button[data-cp]').forEach((b) => { b.onclick = async () => { b.disabled = true; try { await postJson('/api/ops/checkpoints/reviewed', { id: b.dataset.cp }); await renderView() } catch (e) { b.textContent = String(e.message || e) } } })
    const retry = document.getElementById('ops-retry')
    if (retry) retry.onclick = async () => { retry.disabled = true; const o = document.getElementById('ops-retry-out'); try { const r = await postJson('/api/ops/retries/run', {}); o.textContent = r.note } catch (e) { o.textContent = String(e.message || e) } retry.disabled = false }
  } catch (e) {
    st.textContent = ''
    out.innerHTML = `<div class="card"><h2>Operations</h2><div class="err">${esc(e.message || e)}</div></div>`
  }
}

function renderTabs() {
  const el = document.getElementById('ops-views')
  el.innerHTML = VIEWS.map(([id, label]) => `<button class="ev-view ${id === view ? 'on' : ''}" data-view="${id}">${esc(label)}</button>`).join('')
  el.querySelectorAll('button[data-view]').forEach((b) => { b.onclick = () => { view = b.dataset.view; renderTabs(); renderView() } })
}

window.loadOps = () => { renderTabs(); renderView() }
document.getElementById('btn-ops').onclick = () => renderView()
