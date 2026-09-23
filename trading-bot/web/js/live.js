/**
 * LIVE OBSERVER & RESEARCH OPS — what Mr. Cash is observing right now,
 * today's learning, the research queue, active experiments, findings and
 * contradictions, knowledge requiring review, paper vs historical, champion /
 * challengers, failure memory, what to study next, and the system status.
 * Draws /api/observer, /api/ops, /api/research/* and /api/knowledge/* and
 * nothing else. Read-only except the three explicit buttons (run a research
 * tick, resolve candidates, run the decay monitor), which write research
 * stores and reach nothing in the engine.
 */
import { getJson, esc } from './api.js'

const VIEWS = [['observer', 'Live observer'], ['today', "Today's learning"], ['queue', 'Research queue'], ['experiments', 'Experiments'], ['findings', 'Findings & contradictions'], ['review', 'Requiring review'], ['drift', 'Paper vs historical'], ['champions', 'Champion / challengers'], ['failures', 'Failure memory'], ['next', 'Next research'], ['status', 'System status']]
let view = 'observer'
let strategy = ''

const fx = (n, d = 2) => (n === null || n === undefined ? '—' : `${n >= 0 ? '+' : ''}${Number(n).toFixed(d)}`)
const when = (ms) => { try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms)) } catch { return '' } }
const pill = (s) => `<span class="ev-st ${/INSUFFICIENT|NOT SUPPORTED|REJECTED|STALE|CONTRADICTED|DISPROVED|FAILED|NEVER|OFF|BLOCKED|UNRESOLVABLE/.test(s) ? 'none' : /WATCH|REVIEW|UNDER TEST|OBSERVING|TESTING|QUESTION|HYPOTHESIS|WEAKENED|INCONCLUSIVE|PARKED|IDLE|QUEUED/.test(s) ? 'early' : /IN SAMPLE|PROPOSED|OOS TESTING|ROBUSTNESS|REVEALED|RECORDED/.test(s) ? 'dev' : 'large'}">${esc(s)}</span>`
const notEnough = (what) => `<div class="ev-empty"><div class="ev-empty-big">NOT ENOUGH DATA</div><div class="muted">${esc(what)}</div></div>`
const note = (n) => `<div class="ev-note">${esc(n)}</div>`
const card = (title, body, sub) => `<div class="card"><h2>${title}</h2>${body}${sub ? `<div class="muted sc-prov">${esc(sub)}</div>` : ''}</div>`
const hero = (k, v, sub) => `<div class="ev-hero"><div class="ev-hero-k">${esc(k)}</div><div class="ev-hero-big">${v}</div>${sub ? `<div class="ev-hero-sub muted">${esc(sub)}</div>` : ''}</div>`
async function postJson(path, body) {
  const cfg = await getJson('/api/config')
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-mrcash-csrf': cfg.csrf }, body: JSON.stringify(body || {}) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || j.ok === false) throw new Error(j.error || `HTTP ${res.status}`)
  return j.data
}

const liveRow = (o) => `<div class="sc-frame"><div class="sc-frame-t">${pill(o.status)} ${esc(o.type)} <span class="muted">${when(o.at)} · ${o.significance.score}/100</span></div><div>${esc(o.detail)}</div><div class="muted">Why it was selected: ${o.significance.reasons.map(esc).join('; ')}</div><div class="muted">Knowable at the close: session ${esc(o.before.session ?? '—')}, regime ${esc(o.before.regime ?? 'unclassified')}, structure ${esc(o.before.structureTrend ?? '—')}, ${o.before.strategiesActive} strateg${o.before.strategiesActive === 1 ? 'y' : 'ies'} active, risk ${esc(o.before.risk ?? '—')}.</div>${o.status === 'OBSERVING' ? `<div class="muted">Result revealed after ${when(o.revealAfter)} — not before.</div>` : o.status === 'REVEALED' ? `<div><b>RESULT REVEALED:</b> ${esc(o.result ?? '')} ${o.caseId ? `<button class="btn ghost" data-replay="${esc(o.id)}">Replay it</button>` : ''}</div>` : ''}</div>`

async function renderObserver() {
  const { data } = await getJson('/api/observer')
  const heroes = `<div class="ev-heroes">${hero('observing', data.observing.length)}${hero('revealed', data.revealed.length)}${hero('observations', data.counts.total, `${data.counts.candidates} awaiting · ${data.counts.resolved} resolved · ${data.counts.unresolvable} unresolvable`)}</div>`
  return `${data.notes.map(note).join('')}${heroes}<div class="row"><button class="btn ghost" id="ob-resolve">Resolve due candidates</button><span class="muted" id="ob-action-out"></span></div>
    ${card('MR. CASH IS OBSERVING', data.observing.length ? data.observing.map(liveRow).join('') : '<div class="muted">Nothing is being observed right now. Selected events appear here as the engine finds them; the horizon is ' + data.horizon.candles + ' candles of ' + esc(data.horizon.interval) + '.</div>', 'observer — explained from what was knowable at the close; no outcome shown before the horizon is stored')}
    ${card('RESULTS REVEALED', data.revealed.length ? data.revealed.map(liveRow).join('') : '<div class="muted">No case has completed its horizon yet.</div>', 'case-study engine — AFTER from stored candles only')}
    ${card('RECENT OBSERVATIONS', data.recent.length ? `<table><tr><th>when</th><th>type</th><th class="num">score</th><th>status</th><th>detail</th></tr>${data.recent.slice(0, 25).map((o) => `<tr><td class="muted">${when(o.at)}</td><td>${esc(o.type)}</td><td class="num">${o.significance.score}</td><td>${pill(o.status)}</td><td class="muted">${esc(o.detail.slice(0, 120))}</td></tr>`).join('')}</table>` : '<div class="muted">No observations recorded yet. They arrive with each engine cycle once candles are flowing.</div>')}`
}

async function showReplay(id) {
  const out = document.getElementById('observer-out')
  const { data } = await getJson(`/api/observer/replay?id=${encodeURIComponent(id)}`)
  const s = data.stop
  out.innerHTML = `<button class="btn ghost" id="ob-back">← back</button>${note(data.note)}
    ${card(`REPLAY — ${esc(data.observation.type)} at ${when(data.observation.time)}`, `<div>${esc(s?.question?.prompt ?? s?.prompt ?? 'The stop is at the event; nothing from the event candle onward is shown.')}</div>${s?.before ? `<div class="muted">${esc(JSON.stringify(s.before).slice(0, 400))}</div>` : ''}<div class="muted">Open Replay School (School tab → Replay) to answer stops with the outcome revealed afterwards.</div>`, 'replay school — stops before the outcome')}`
}

const section = (s) => card(`${esc(s.heading)} ${pill(s.evidenceLabel)}`, s.lines.map((l) => `<div>· ${esc(l)}</div>`).join(''), `source: ${s.source}`)

async function renderToday() {
  const { data: d } = await getJson('/api/knowledge/digest/today')
  const { data: digs } = await getJson('/api/knowledge/digests')
  const lesson = d.lessonOfTheDay
  const lod = lesson
    ? card(`LESSON OF THE DAY ${pill(lesson.evidenceLabel)} <span class="muted">${esc(lesson.kind)} · ${when(lesson.at)} · ${esc(lesson.source)}</span>`, `<div class="sc-frame"><div class="sc-frame-t">BEFORE</div>${esc(lesson.before)}</div><div class="sc-frame"><div class="sc-frame-t">DECISION</div>${esc(lesson.decision)}</div><div class="sc-frame"><div class="sc-frame-t">AFTER</div>${esc(lesson.after)}</div><div><b>What it teaches:</b> ${esc(lesson.teaches)}</div><div class="muted"><b>What it does not:</b> ${lesson.doesNotTeach.map(esc).join(' ')}</div>`, lesson.note)
    : card('LESSON OF THE DAY', `<div class="muted">${esc(d.notes[1] || 'No resolved case yet.')}</div>`)
  const counts = `<div class="ev-heroes">${hero('observations', d.counts.observations, `${d.counts.selected} selected`)}${hero('cases resolved', d.counts.casesResolved)}${hero('questions', d.counts.questionsCreated)}${hero('experiments', d.counts.experimentsFinished)}${hero('paper closes', d.counts.paperCloses)}</div>`
  const stored = `<div class="muted">Stored digests: ${digs.daily.length} daily · ${digs.weekly.length} weekly · ${digs.monthly.length} monthly. ${digs.daily.slice(0, 5).map((x) => `<a href="/api/knowledge/digest?id=${encodeURIComponent(x.id)}" target="_blank" rel="noopener">${esc(x.key)}</a>`).join(' · ')}</div>`
  return `<div class="ev-head"><div><div class="ev-title">DAILY LEARNING DIGEST — ${esc(d.dayKey)} <span class="muted">(assembled now; the stored one is written when the day ends)</span></div><div class="muted">${when(d.from)} → ${when(d.to)}</div></div></div>${d.notes.map(note).join('')}${counts}${lod}${d.sections.map(section).join('')}${stored}`
}

async function renderQueue() {
  const { data } = await getJson('/api/research/queue')
  const s = data.summary
  const heroes = `<div class="ev-heroes">${hero('items', s.total)}${hero('testable now', s.testable)}${hero('blocked on data', s.byStatus.BLOCKED ?? 0)}${hero('under test', s.byStatus['UNDER TEST'] ?? 0)}</div>`
  const row = `<div class="row"><button class="btn ghost" id="ob-generate">Regenerate queue</button><button class="btn ghost" id="ob-tick">Run one research tick</button><span class="muted" id="ob-action-out"></span></div>`
  if (!data.items.length) return heroes + row + notEnough(data.note)
  return `${heroes}${row}${note(data.note)}${card('RESEARCH QUEUE', `<table><tr><th class="num">pri</th><th>status</th><th>maturity</th><th>question</th><th>origin</th><th class="num">have / need</th><th>next test</th></tr>${data.items.map((q) => `<tr><td class="num">${q.priority}</td><td>${pill(q.status)}</td><td>${pill(q.maturity)}</td><td>${esc(q.question)}<div class="muted">${q.priorityReasons.map(esc).join(' · ')}</div>${q.requiredData.missing.length ? `<div class="muted">missing: ${q.requiredData.missing.map(esc).join('; ')}</div>` : ''}${q.contradictions ? `<div class="muted">${q.contradictions} contradiction(s)</div>` : ''}</td><td>${esc(q.origin)}</td><td class="num">${q.requiredData.have} / ${q.requiredData.minTrades}</td><td class="muted">${q.nextTest ? when(q.nextTest) : q.lastTested ? `tested ${when(q.lastTested)}` : '—'}</td></tr>`).join('')}</table>`, 'the size of any observed edge is not a priority input')}`
}

async function renderExperiments() {
  const { data } = await getJson('/api/research/experiments')
  const { data: ops } = await getJson('/api/ops/state')
  const active = data.items.filter((e) => e.status === 'RUNNING' || e.status === 'REGISTERED')
  const done = data.items.filter((e) => e.status === 'DONE')
  const row = (e) => `<tr><td>${pill(e.status === 'DONE' ? e.result : e.status)}</td><td>${esc(e.kind)} · ${esc(e.strategyId)} <span class="ev-src ${e.source === 'PAPER' ? 'paper' : 'sim'}">${esc(e.source)}</span><div class="muted">${esc(e.method)}</div><div class="muted">baseline: ${esc(e.baseline.label)}</div></td><td class="num">${e.oos ? `${fx(e.oos.meanR)}R (n=${e.oos.trades})` : '—'}</td><td class="num">${e.baselineOos ? `${fx(e.baselineOos.meanR)}R (n=${e.baselineOos.trades})` : '—'}</td><td>${e.comparison ? pill(e.comparison) : '—'}</td><td>${e.robustness ? pill(e.robustness) : '—'}${e.challenger ? ` ${pill(e.challenger)}` : ''}</td><td class="num">${e.trials}</td><td class="muted">${e.finishedAt ? when(e.finishedAt) : e.createdAt ? when(e.createdAt) : ''}${e.nextTest ? `<br>reassess ${when(e.nextTest)}` : ''}<br><a href="/api/research/experiment?id=${encodeURIComponent(e.experimentId)}" target="_blank" rel="noopener">record</a></td></tr>`
  const table = (list) => `<table><tr><th>result</th><th>experiment</th><th class="num">treatment OOS</th><th class="num">baseline OOS</th><th>Welch</th><th>robustness · challenger</th><th class="num">trials</th><th>when</th></tr>${list.map(row).join('')}</table>`
  return `${note(data.note)}<div class="muted">Research ops: ${ops.runs} run(s), last ${ops.lastRun ? when(ops.lastRun) : 'never'}, next ${ops.nextRun ? when(ops.nextRun) : '—'}${ops.lastError ? ` · last error: ${esc(ops.lastError.message)}` : ''}</div>
    ${card('ACTIVE EXPERIMENTS', active.length ? table(active) : '<div class="muted">None registered or running. The scheduler runs at most one per tick.</div>')}
    ${card('FINISHED', done.length ? table(done) : '<div class="muted">No experiment has finished yet.</div>', 'every result is measured against its frozen baseline; OOS SUPPORTED is a stage, not a conclusion')}`
}

async function renderFindings() {
  const { data } = await getJson('/api/research/experiments?status=DONE')
  const { data: hyps } = await getJson('/api/research/hypotheses')
  const { data: decay } = await getJson('/api/knowledge/decay')
  const findings = data.items.filter((e) => e.result === 'OOS SUPPORTED' || e.result === 'NOT SUPPORTED').sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
  const contra = [...hyps.filter((h) => h.counterevidence && h.counterevidence.length).map((h) => `${pill(h.status)} ${esc(h.question)} — ${esc(h.counterevidence[h.counterevidence.length - 1])}`), ...decay.contradicted.map((i) => `${pill('CONTRADICTED')} ${esc(i.title)} — ${esc((i.history[i.history.length - 1] || {}).detail || '')}`)]
  return `${card('RECENT FINDINGS', findings.length ? findings.slice(0, 20).map((e) => `<div>${pill(e.result)} ${esc(e.method)} <span class="muted">OOS ${e.oos ? `${fx(e.oos.meanR)}R over ${e.oos.trades}` : '—'} vs baseline ${e.baselineOos ? `${fx(e.baselineOos.meanR)}R` : '—'} · ${esc(e.comparison ?? 'TOO FEW')} · robustness ${esc(e.robustness ?? 'UNTESTED')}${e.challenger ? ` · challenger ${esc(e.challenger)}` : ''} · ${when(e.finishedAt)}</span></div>`).join('') : '<div class="muted">No finding yet. A finding is an experiment whose out-of-sample stage supported or did not support its hypothesis against a baseline.</div>', 'a finding at one stage; robustness review and the challenger follow; nothing is promoted')}
    ${card('CONTRADICTIONS', contra.length ? contra.map((c) => `<div>${c}</div>`).join('') : '<div class="muted">Nothing on record has been contradicted yet. That says how little has been tested, not how much holds.</div>', 'hypothesis counterevidence and the decay monitor')}`
}

async function renderReview() {
  const { data: k } = await getJson('/api/knowledge/decay')
  const { data: r } = await getJson('/api/research/review')
  const list = (title, items) => items.length ? `<div><b>${title}</b>${items.map((i) => `<div>· ${esc(i.title)} <span class="muted">${esc(i.kind)} · v${i.version} · +${i.new_evidence_count} / −${i.contradictory_evidence_count}</span></div>`).join('')}</div>` : ''
  const rc = (c) => `<div class="sc-frame"><div class="sc-frame-t">${pill(c.review.stage)} ${esc(c.proposal.title)} <span class="muted">${esc(c.proposal.kind)} · ${esc(c.original.strategyId)}</span></div><div><b>Original:</b> ${esc(c.original.name)} — ${esc(Object.entries(c.original.parameters).map(([a, b]) => `${a}=${b}`).join(', ') || 'no tunable parameters')}</div><div><b>Proposed:</b> ${esc(c.proposed.change)}${c.proposed.parameters ? ` — ${esc(Object.entries(c.proposed.parameters).map(([a, b]) => `${a}=${b}`).join(', '))}` : ''}</div><div><b>Evidence:</b> ${c.evidence.length ? c.evidence.map((e) => `<div class="muted">${esc(e.experimentId)}: ${esc(e.result)} · OOS ${esc(e.oos)} · WF ${esc(e.walkForward)} · MC ${esc(e.monteCarlo)} · ${esc(e.robustness)}</div>`).join('') : '<span class="muted">no experiments linked</span>'}</div><div><b>Counterevidence:</b> ${c.counterevidence.map(esc).join('; ')}</div>${c.risks.length ? `<div><b>Risks:</b> ${c.risks.map(esc).join('; ')}</div>` : ''}${c.unknowns.length ? `<div><b>Unknowns:</b> ${c.unknowns.map(esc).join('; ')}</div>` : ''}<div class="muted">${esc(c.note)}</div>${c.canDecide ? `<div class="row"><input placeholder="your name" id="ob-by-${esc(c.proposal.id)}" size="12"> <button class="btn" data-review-decide="${esc(c.proposal.id)}" data-decision="APPROVE FOR PAPER TEST">Approve for paper test</button><button class="btn ghost" data-review-decide="${esc(c.proposal.id)}" data-decision="REQUEST MORE RESEARCH">Request more research</button><button class="btn ghost" data-review-decide="${esc(c.proposal.id)}" data-decision="REJECT">Reject</button></div>` : ''}</div>`
  return `<div class="row"><button class="btn ghost" id="ob-decay">Run the decay monitor</button><span class="muted" id="ob-action-out"></span></div>
    ${card('KNOWLEDGE REQUIRING REVIEW', (k.contradicted.length + k.reviewRequired.length + k.stale.length) ? list('CONTRADICTED', k.contradicted) + list('REVIEW REQUIRED', k.reviewRequired) + list('STALE', k.stale) + list('ON WATCH', k.watch) : `<div class="muted">${esc(k.note)}</div>`, 'decay monitor — a review confirms, revises or retires; it never deletes (Knowledge tab → Vault)')}
    ${card('RESEARCH REVIEW — HUMAN APPROVAL CENTER', r.awaiting.length ? r.awaiting.map(rc).join('') : `<div class="muted">${esc(r.note)}</div>`, 'approving advances a paper test stage and modifies nothing in production')}
    ${r.other.length ? card('DECIDED / CLOSED', r.other.map((o) => `<div>${pill(o.stage)} ${esc(o.title)} <span class="muted">${esc(o.status)}</span></div>`).join('')) : ''}`
}

async function picker() {
  const { data: school } = await getJson('/api/school')
  const ids = [...new Set(school.concepts.flatMap((c) => c.strategies))]
  return `<div class="ev-chips"><button data-ob-strategy="" class="${strategy ? '' : 'on'}">trading strategy</button>${ids.map((id) => `<button data-ob-strategy="${esc(id)}" class="${strategy === id ? 'on' : ''}">${esc(id)}</button>`).join('')}</div>`
}

async function renderDrift() {
  const { data: d } = await getJson(`/api/research/drift${strategy ? `?strategy=${encodeURIComponent(strategy)}` : ''}`)
  const pick = await picker()
  if (!d.rows) return pick + notEnough(d.note)
  const rowHtml = (r) => `<tr><td>${esc(r.dimension)} = ${esc(r.value)}</td><td>${pill(r.verdict)}</td><td class="num">${r.paperN} / ${r.backtestN}</td><td>${r.differs.length ? r.differs.map(esc).join(', ') : '<span class="muted">—</span>'}</td><td class="muted">${esc(r.note)}</td></tr>`
  return `${pick}${d.caveats.map(note).join('')}<div class="ev-head"><div><div class="ev-title">${esc(d.strategyId)} — ${pill(d.overall.verdict)}</div><div class="muted"><span class="ev-src paper">PAPER</span> ${esc(d.paper.label)} · <span class="ev-src sim">BACKTEST</span> ${esc(d.backtest.label)}</div></div></div>
    ${card('WHERE PAPER DIFFERS FROM THE HISTORICAL POPULATION', d.differences.length ? `<table><tr><th>cohort</th><th>verdict</th><th class="num">paper / backtest n</th><th>differs on</th><th>note</th></tr>${d.differences.map(rowHtml).join('')}</table>` : `<div class="muted">${esc(d.note)}</div>`, 'differences only; the cause is a research question, not a conclusion')}
    ${card('EVERY COHORT', `<table><tr><th>cohort</th><th>verdict</th><th class="num">paper / backtest n</th><th>differs on</th><th>note</th></tr>${[d.overall, ...d.rows].map(rowHtml).join('')}</table>`)}
    ${card('METRICS — overall', `<table><tr><th>metric</th><th class="num">paper</th><th class="num">backtest</th><th>comparable</th><th>note</th></tr>${d.overall.metrics.map((m) => `<tr><td>${esc(m.metric)}</td><td class="num">${m.paper === null ? '—' : Number(m.paper).toFixed(2)}</td><td class="num">${m.backtest === null ? '—' : Number(m.backtest).toFixed(2)}</td><td>${m.comparable ? (m.welch ? pill(m.welch.verdict) : 'yes') : '<span class="muted">no</span>'}</td><td class="muted">${esc(m.note)}</td></tr>`).join('')}</table>`)}`
}

async function renderChampions() {
  const { data: v } = await getJson(`/api/research/champion${strategy ? `?strategy=${encodeURIComponent(strategy)}` : ''}`)
  const pick = await picker()
  const row = (r, champ) => `<tr><td>${champ ? '★ ' : ''}${esc(r.label)}<div class="muted">${esc(r.kind)} · ${esc(r.status)}${r.decaying ? ' · <span class="loss">DECAYING</span>' : ''}</div></td><td class="num">${r.oosAvgR === null ? '—' : `${fx(r.oosAvgR)}R (n=${r.oosTrades})`}</td><td class="num">${r.paperAvgR === null ? '—' : `${fx(r.paperAvgR)}R (n=${r.paperTrades})`}</td><td class="num">${r.maxDrawdownR === null ? '—' : r.maxDrawdownR.toFixed(2)}</td><td class="muted">${esc(r.promotion ?? '')}</td><td class="muted">${esc(r.note)}</td></tr>`
  const pc = v.paperCohort
  return `${pick}${v.notes.map(note).join('')}<div class="ev-heroes">${hero('paper trades', pc.n)}${hero('paper mean R', pc.meanR === null ? '—' : `${fx(pc.meanR)}R`, pc.ci95 ? `95% ${fx(pc.ci95.lo)} to ${fx(pc.ci95.hi)}` : 'under the bar')}${hero('signals / day', pc.signalsPerDay === null ? '—' : pc.signalsPerDay.toFixed(2))}${hero('rejected', pc.rejectionShare === null ? '—' : `${Math.round(pc.rejectionShare * 100)}%`)}</div>
    ${card('CHAMPION', v.champion ? `<table><tr><th>passport</th><th class="num">OOS</th><th class="num">paper</th><th class="num">max DD</th><th>promotion read</th><th>note</th></tr>${row(v.champion, true)}</table>` : '<div class="muted">No champion passport for this strategy. The production strategy runs at its config defaults; the vault mints passports from factory campaigns only.</div>', 'the champion is never replaced automatically')}
    ${card('CHALLENGERS', v.challengers.length ? `<table><tr><th>challenger</th><th class="num">OOS</th><th class="num">paper</th><th class="num">max DD</th><th>promotion read</th><th>note</th></tr>${v.challengers.map((r) => row(r, false)).join('')}</table>` : '<div class="muted">No challengers. Sandbox experiments (Research tab → Sandbox) register challengers against the frozen baseline.</div>', 'a challenger is compared, quoted, and left where it is; promotion is a human decision through a proposal')}`
}

async function renderFailures() {
  const { data } = await getJson('/api/knowledge/failures')
  const s = data.summary
  return `${note(s.note)}<div class="ev-heroes">${hero('did not work', s.total)}${hero('still standing', s.active)}${hero('replicated', s.replicated)}${Object.entries(s.byKind).slice(0, 3).map(([k, v]) => hero(k, v)).join('')}</div>
    ${card('FAILURE MEMORY', data.items.length ? data.items.map((f) => `<div class="sc-frame"><div class="sc-frame-t">${pill(f.kind)} ${esc(f.title)} <span class="muted">${when(f.at)} · ${esc(f.source)}${f.sampleSize ? ` · n=${f.sampleSize}` : ''} · ${f.active ? 'still standing' : 'overturned later'}${f.replicated ? ` · replicated ×${f.occurrences}` : ' · once'}</span></div><div><b>What:</b> ${esc(f.what)}</div><div><b>Where:</b> ${esc(f.where)}</div><div><b>Expected:</b> ${esc(f.expected)}</div><div><b>What happened:</b> ${esc(f.why)}</div><div><b>Lesson:</b> ${esc(f.lesson)}</div></div>`).join('') : '<div class="muted">Nothing has failed on record yet.</div>', 'what, where, expected, what happened, how many times, whether it still stands; never a rule')}`
}

async function renderNext() {
  const { data } = await getJson('/api/research/recommend')
  return `${note(data.note)}${data.items.length ? data.items.map((r) => card(`${esc(r.topic)} <span class="muted">weight ${r.weight}</span>`, `<div><b>${esc(r.question)}</b></div><div><b>WHY THIS QUESTION:</b> ${esc(r.why)}</div><div><b>WHAT DATA EXISTS:</b> ${esc(r.dataExists)}</div><div><b>WHAT IS MISSING:</b> ${esc(r.missing)}</div><div><b>WHAT WOULD ANSWER IT:</b> ${esc(r.wouldAnswer)}</div>${r.queueItemId ? `<div class="muted">queue item ${esc(r.queueItemId)}</div>` : ''}`)).join('') : notEnough(data.note)}`
}

async function renderStatus() {
  const { data: s } = await getJson('/api/ops')
  const layer = (name, l, extra) => card(`${esc(name)} ${pill(l.health)}`, `<div>${esc(l.note)}</div>${extra || ''}`)
  return `${note(s.summary)}${s.notes.map(note).join('')}<div class="ev-heroes">${hero('last research run', s.lastResearchRun ? when(s.lastResearchRun) : 'never')}${hero('next research run', s.nextResearchRun ? when(s.nextResearchRun) : '—')}${hero('observations', s.learningLoop.observations.total)}${hero('experiments', s.researchEngine.experiments.total, `${s.researchEngine.experiments.done} done`)}${hero('knowledge', s.knowledgeStore.vault.total, `${s.knowledgeStore.requiringReview} need review`)}</div>
    ${layer('MARKET DATA', s.marketData, `<div class="muted">${esc(s.marketData.symbol)} ${esc(s.marketData.interval)} · mode ${esc(s.marketData.mode)} · ${s.marketData.candlesStored} candles · last close ${s.marketData.lastClosedOpenTime ? when(s.marketData.lastClosedOpenTime) : '—'}</div>`)}
    ${layer('PAPER ENGINE', s.paperEngine, `<div class="muted">${s.paperEngine.open} open · ${s.paperEngine.closed} closed · ${s.paperEngine.growth.note} · live gate ${s.paperEngine.liveGate ? '<span class="loss">ENABLED</span>' : 'off'} · shadow ${s.paperEngine.shadow ? 'on' : 'off'}</div>`)}
    ${layer('RESEARCH ENGINE', s.researchEngine, `<div class="muted">${s.researchEngine.runs} run(s) · queue ${s.researchEngine.queue.total} (${s.researchEngine.queue.testable} testable) · hypotheses ${s.researchEngine.hypotheses} · proposals awaiting ${s.researchEngine.proposalsAwaiting}${s.researchEngine.lastError ? ` · last error ${esc(s.researchEngine.lastError.message)}` : ''}</div>`)}
    ${layer('LEARNING LOOP', s.learningLoop, `<div class="muted">${s.learningLoop.cycles} cycle(s) · last ${s.learningLoop.lastCycleAt ? when(s.learningLoop.lastCycleAt) : 'never'} · digests ${s.learningLoop.digests.daily} daily / ${s.learningLoop.digests.weekly} weekly / ${s.learningLoop.digests.monthly} monthly</div>`)}
    ${layer('KNOWLEDGE STORE', s.knowledgeStore, `<div class="muted">${Object.entries(s.knowledgeStore.vault.byStatus).map(([k, v]) => `${esc(k)} ${v}`).join(' · ') || 'empty'} · ${s.knowledgeStore.failures} failure(s) · ${s.knowledgeStore.memories} memories</div>`)}
    ${card('DATA QUALITY', `<div>${esc(s.dataQuality.note)}</div><div class="muted">store writable: ${s.dataQuality.storeWritable ? 'yes' : '<span class="loss">NO</span>'}</div>`)}`
}

async function renderView() {
  const out = document.getElementById('observer-out')
  const status = document.getElementById('observer-status')
  if (!out) return
  try {
    let html = ''
    switch (view) {
      case 'observer': html = await renderObserver(); break
      case 'today': html = await renderToday(); break
      case 'queue': html = await renderQueue(); break
      case 'experiments': html = await renderExperiments(); break
      case 'findings': html = await renderFindings(); break
      case 'review': html = await renderReview(); break
      case 'drift': html = await renderDrift(); break
      case 'champions': html = await renderChampions(); break
      case 'failures': html = await renderFailures(); break
      case 'next': html = await renderNext(); break
      case 'status': html = await renderStatus(); break
    }
    out.innerHTML = html
    if (status) status.textContent = `updated ${new Date().toLocaleTimeString()}`
  } catch (e) {
    out.innerHTML = `<div class="plain">Couldn't load the observer: ${esc(e.message)}. Showing nothing rather than making something up.</div>`
    if (status) status.textContent = 'failed'
  }
}
function renderShell() {
  const nav = document.getElementById('observer-views')
  if (nav) nav.innerHTML = VIEWS.map(([id, l]) => `<button data-view="${id}" class="${id === view ? 'on' : ''}">${l}</button>`).join('')
}
async function loadObserver() { renderShell(); await renderView() }

async function action(path, body) {
  const out = document.getElementById('ob-action-out')
  try { const r = await postJson(path, body); if (out) out.textContent = r.note || r.summary || 'done' } catch (err) { if (out) out.textContent = err.message }
  await loadObserver()
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('#observer-views button[data-view]')
  if (b) { view = b.dataset.view; await loadObserver(); return }
  const sg = e.target.closest('#tab-observer [data-ob-strategy]'); if (sg) { strategy = sg.dataset.obStrategy; await loadObserver(); return }
  const rp = e.target.closest('#tab-observer [data-replay]'); if (rp) { await showReplay(rp.dataset.replay).catch((err) => { document.getElementById('observer-out').innerHTML = `<div class="plain">${esc(err.message)}</div>` }); return }
  if (e.target.closest('#ob-back')) { await loadObserver(); return }
  if (e.target.closest('#ob-resolve')) { await action('/api/observer/resolve', {}); return }
  if (e.target.closest('#ob-generate')) { await action('/api/research/queue/generate', {}); return }
  if (e.target.closest('#ob-tick')) { await action('/api/ops/run', {}); return }
  if (e.target.closest('#ob-decay')) { await action('/api/knowledge/decay/run', {}); return }
  const dec = e.target.closest('#tab-observer [data-review-decide]')
  if (dec) { const by = (document.getElementById(`ob-by-${dec.dataset.reviewDecide}`) || {}).value || ''; const note = prompt(`${dec.dataset.decision}: note for the record`) || ''; try { await postJson('/api/research/review/decide', { id: dec.dataset.reviewDecide, decision: dec.dataset.decision, by, note }) } catch (err) { alert(err.message) } await loadObserver(); return }
})

document.getElementById('btn-observer')?.addEventListener('click', () => loadObserver())
window.loadObserver = loadObserver
