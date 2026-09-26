/**
 * MARKET SCHOOL — concepts, lessons assembled from the engine's own record,
 * case studies with counterexamples, the replay school that asks before it
 * tells, the market debate, the bounded teacher, and "My Learning".
 *
 * Draws /api/school/* and nothing else. Every figure arrives labelled; this
 * file adds no thresholds and no verdicts of its own.
 */
import { getJson, esc } from './api.js'

const VIEWS = [['concepts', 'Concepts'], ['lesson', 'Lesson'], ['cases', 'Case studies'], ['replay', 'Replay School'], ['debate', 'Debate'], ['teacher', 'Teacher'], ['learning', 'My Learning'], ['markets', 'Other markets']]
let view = 'concepts'
let conceptId = 'liquidity-sweep'
let caseKind = ''
let replayK = 0
let replayReveal = null

const fx = (n, d = 2) => (n === null || n === undefined ? '—' : `${n >= 0 ? '+' : ''}${Number(n).toFixed(d)}`)
const when = (ms) => { try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms)) } catch { return '' } }
const label = (s) => `<span class="ev-st ${s === 'INSUFFICIENT DATA' || s === 'NOT ENOUGH DATA' ? 'none' : s === 'INFERRED' || s === 'HYPOTHESIS' ? 'early' : s === 'SIMULATED' ? 'dev' : 'large'}">${esc(s)}</span>`
async function postJson(path, body) {
  const cfg = await getJson('/api/config')
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-mrcash-csrf': cfg.csrf }, body: JSON.stringify(body || {}) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || j.ok === false) throw new Error(j.error || `HTTP ${res.status}`)
  return j.data
}
const growthBar = (g) => `<div class="sc-growth"><div class="sc-growth-bar"><div style="width:${g.pct}%"></div></div><span class="muted">${g.n} trades · ${esc(g.band)} · ${esc(g.status)}${g.toNext ? ` · ${g.toNext} to next band` : ''}</span></div>`
const notEnough = (what) => `<div class="ev-empty"><div class="ev-empty-big">NOT ENOUGH DATA</div><div class="muted">${esc(what)}</div></div>`

const TRACK_LABEL = { basics: 'Start here: the basics, in order', priceaction: 'Price action: candles in context' }

async function renderConcepts() {
  const { data } = await getJson('/api/school')
  const byTrack = {}
  for (const c of data.concepts) (byTrack[c.track] = byTrack[c.track] || []).push(c)
  return `<div class="ev-note">${esc(data.note)}</div>${growthBar(data.dataGrowth)}
    ${Object.entries(byTrack).map(([track, cs]) => `<div class="card"><h2>${esc(TRACK_LABEL[track] || track)}</h2><div class="sc-grid">${cs.map((c) => `<button class="sc-concept" data-concept="${esc(c.id)}"><b>${esc(c.title)}</b><span class="muted">${esc(c.level)} · ${esc(c.mastery.level)}</span></button>`).join('')}</div></div>`).join('')}`
}

async function renderLesson() {
  const { data: l } = await getJson(`/api/school/lesson?id=${encodeURIComponent(conceptId)}`)
  postJson('/api/school/engage', { kind: 'lesson-viewed', conceptId }).catch(() => {})
  const sections = l.sections.map((s) => `<div class="card"><h2>${esc(s.heading)} ${label(s.evidenceLabel)}</h2><div class="plain">${esc(s.body).replace(/\n/g, '<br>')}</div><div class="muted sc-prov">${esc(s.provenance)}</div></div>`).join('')
  const pe = l.paperEvidence
  const paper = pe ? `<div class="card"><h2>Paper record ${label(pe.status === 'OBSERVED' ? 'OBSERVED' : 'INSUFFICIENT DATA')}</h2>${growthBar(pe.growth)}<div class="plain">${esc(pe.note)}</div></div>` : ''
  const examples = l.examples.length ? `<div class="card"><h2>From the chart <span class="ev-src sim">HISTORICAL</span></h2>${l.examples.map((c) => `<div class="sc-case" data-case="${esc(c.id)}"><b>${esc(c.title)}</b><div class="muted">${esc(c.during.detail)}</div><div>${esc(c.after.note)}</div></div>`).join('')}</div>` : ''
  const counter = l.counterexamples.length ? `<div class="card"><h2>Where it went the other way</h2><div class="plain">${esc(l.counterexamples[0].lesson)}</div>${l.counterexamples.map((p) => `<div class="sc-pair"><div class="sc-case win" data-case="${esc(p.example.id)}"><b>went the expected way</b><div class="muted">${esc(p.example.title)}</div></div><div class="sc-case loss" data-case="${esc(p.counterexample.id)}"><b>did not</b><div class="muted">${esc(p.counterexample.title)}</div></div></div>`).join('')}</div>` : ''
  const quiz = l.quiz.length ? `<div class="card"><h2>Quiz</h2><form id="sc-quiz">${l.quiz.map((q) => `<div class="sc-q"><div><b>${esc(q.prompt)}</b></div>${q.choices.map((ch, i) => `<label class="sc-choice"><input type="radio" name="${esc(q.id)}" value="${i}"> ${esc(ch)}</label>`).join('')}</div>`).join('')}<button class="btn" type="submit">Check answers</button><span class="muted" id="sc-quiz-out"></span></form></div>` : ''
  return `<div class="ev-head"><div><div class="ev-title">${esc(l.title)}</div><div class="muted">${esc(l.level)} · ${esc(l.track)} · engine ${esc(l.engineVersion)}</div></div><div>${l.related.map((r) => `<button class="btn ghost" data-concept="${esc(r)}">${esc(r)}</button>`).join(' ')}</div></div>
    ${l.notes.map((n) => `<div class="ev-note">${esc(n)}</div>`).join('')}${sections}${paper}${examples}${counter}${quiz}`
}

async function renderCases() {
  const { data } = await getJson(`/api/school/cases?limit=60${caseKind ? `&kind=${encodeURIComponent(caseKind)}` : ''}`)
  const kinds = [...new Set(data.tally.map((t) => t.kind))]
  const chips = `<div class="ev-chips"><button data-kind="" class="${caseKind ? '' : 'on'}">all</button>${kinds.map((k) => `<button data-kind="${esc(k)}" class="${caseKind === k ? 'on' : ''}">${esc(k)}</button>`).join('')}</div>`
  if (!data.cases.length) return chips + notEnough(data.note)
  const tally = `<div class="card"><h2>How often the event went its expected way</h2><table><tr><th>kind</th><th class="num">n</th><th class="num">went</th><th class="num">share</th><th>note</th></tr>${data.tally.map((t) => `<tr class="${t.share === null ? 'ev-under' : ''}"><td>${esc(t.kind)}</td><td class="num">${t.n}</td><td class="num">${t.wentExpected}</td><td class="num">${t.share === null ? '<span class="muted">—</span>' : `${(t.share * 100).toFixed(0)}%`}</td><td class="muted">${esc(t.note)}</td></tr>`).join('')}</table></div>`
  const rows = data.cases.map((c) => `<tr class="sc-case-row" data-case="${esc(c.id)}"><td class="muted">${when(c.at)}</td><td>${esc(c.kind)}</td><td><span class="ev-src ${c.provenance.source === 'PAPER' ? 'paper' : 'sim'}">${esc(c.provenance.source)}</span></td><td>${esc(c.during.detail)}</td><td>${c.after.wentExpectedWay === null ? '<span class="muted">—</span>' : c.after.wentExpectedWay ? '<span class="win">expected way</span>' : '<span class="loss">did not</span>'}</td><td>${label(c.evidenceLevel)}</td></tr>`).join('')
  return `${chips}<div class="ev-note">${esc(data.note)}</div>${tally}<div class="card"><h2>Case studies</h2><table><tr><th>when</th><th>kind</th><th>source</th><th>during</th><th>after</th><th></th></tr>${rows}</table></div>`
}

async function showCase(id) {
  const { data } = await getJson(`/api/school/case?id=${encodeURIComponent(id)}`)
  const c = data.case
  postJson('/api/school/engage', { kind: 'case-reviewed', conceptId: data.concepts[0]?.id || conceptId, caseId: id }).catch(() => {})
  const frame = (t, body) => `<div class="sc-frame"><div class="sc-frame-t">${t}</div>${body}</div>`
  const out = document.getElementById('school-out')
  out.innerHTML = `<button class="btn ghost" id="sc-back">← back</button><div class="ev-head"><div><div class="ev-title">${esc(c.title)}</div><div class="muted">${esc(c.concept)} · ${esc(c.symbol)} ${esc(c.timeframe)} · ${label(c.evidenceLevel)} <span class="ev-src ${c.provenance.source === 'PAPER' ? 'paper' : 'sim'}">${esc(c.provenance.source)}</span></div></div></div>
    ${frame('BEFORE', `<div class="muted">as of ${when(c.before.asOf)} · ${c.before.annotations.length} annotation(s) knowable · session ${esc(c.before.session ?? '—')} · regime ${esc(c.before.regime ?? 'unclassified')} · volatility ${esc(c.before.volatility ?? '—')} · structure ${esc(c.before.structureTrend ?? '—')}</div><div class="sc-ann">${c.before.annotations.slice(0, 12).map((a) => `<span class="badge">${esc(a.annotationType)}</span>`).join(' ')}</div>`)}
    ${frame('DURING', `<div>${esc(c.during.detail)}</div><div class="muted">candle range ${c.during.rangeAtr.toFixed(2)} ATR</div>`)}
    ${frame('DECISION', `<div>${esc(c.decision.note)}</div>${c.decision.votes ? `<div class="muted">${c.decision.votes.map((v) => `${esc(v.id)} ${esc(v.action)} ${v.confidence}/100 (${v.passed} passed, ${v.failed} failed)`).join(' · ')}</div>` : ''}`)}
    ${frame('AFTER', `<div>${esc(c.after.note)}</div>`)}
    <div class="card"><h2>Concepts</h2>${data.concepts.map((k) => `<button class="btn ghost" data-concept="${esc(k.id)}">${esc(k.title)}</button>`).join(' ')}</div>
    ${data.counterexamples.length ? `<div class="card"><h2>Counterexamples of this kind</h2>${data.counterexamples.map((p) => `<div class="sc-pair"><div class="sc-case win" data-case="${esc(p.example.id)}">${esc(p.example.title)}</div><div class="sc-case loss" data-case="${esc(p.counterexample.id)}">${esc(p.counterexample.title)}</div></div>`).join('')}</div>` : ''}`
}

async function renderReplay() {
  const { data } = await getJson('/api/school/replay')
  if (!data.lesson.stops.length) return notEnough(data.note)
  const k = Math.min(replayK, data.lesson.stops.length - 1)
  const { data: stop } = await getJson(`/api/school/replay/stop?k=${k}`)
  const q = stop.stop.question
  const nav = `<div class="row"><span class="muted">stop ${k + 1} of ${data.lesson.stops.length} · ${esc(data.lesson.symbol)} ${esc(data.lesson.timeframe)}</span><button class="btn ghost" id="sc-rp-prev" ${k === 0 ? 'disabled' : ''}>◀</button><button class="btn ghost" id="sc-rp-next" ${k >= data.lesson.stops.length - 1 ? 'disabled' : ''}>▶</button></div>`
  const before = `<div class="sc-frame"><div class="sc-frame-t">BEFORE · as of ${when(stop.cursor)}</div><div class="muted">session ${esc(stop.context.session ?? '—')} · regime ${esc(stop.context.regime ?? 'unclassified')} · volatility ${esc(stop.context.volatility ?? '—')} · structure ${esc(stop.context.structureTrend ?? '—')} · close ${stop.frame.candle.close.toFixed(2)}</div><div class="sc-ann">${stop.frame.annotations.slice(0, 16).map((a) => `<span class="badge">${esc(a.annotationType)}</span>`).join(' ')}</div>${stop.frame.events.slice(-5).map((e) => `<div class="muted">${esc(e.title)}</div>`).join('')}</div>`
  const ask = replayReveal && replayReveal.k === k
    ? `<div class="card"><h2>${replayReveal.correct ? '<span class="win">Right</span>' : '<span class="loss">Not this time</span>'} — the engine recorded <b>${esc(replayReveal.answer.correct)}</b></h2><div class="plain">${esc(replayReveal.answer.explanation)}</div><div class="sc-frame"><div class="sc-frame-t">DURING</div>${esc(replayReveal.during.detail)}</div><div class="sc-frame"><div class="sc-frame-t">DECISION</div>${esc(replayReveal.decision.note)}</div><div class="sc-frame"><div class="sc-frame-t">AFTER</div>${esc(replayReveal.after.note)}</div><div class="muted">no-hindsight audit: ${replayReveal.hindsight.length ? esc(replayReveal.hindsight.join('; ')) : 'clean'}</div></div>`
    : `<div class="card"><h2>${esc(q.prompt)}</h2><div class="sc-choices">${q.choices.map((c) => `<button class="btn" data-rp-choice="${esc(c)}">${esc(c)}</button>`).join('')}</div><div class="muted">The answer, the decision and what happened next are not in this page until you choose.</div></div>`
  return `<div class="ev-note">${esc(data.note)}</div>${nav}${before}${ask}`
}

async function renderDebate() {
  const { data: m } = await getJson('/api/school/debate')
  const side = (s) => `<div class="card sc-side ${s.label.toLowerCase()}"><h2>${esc(s.label)} <span class="muted">backing ${s.backing}</span></h2>${s.points.length ? s.points.map((p) => `<div class="sc-point"><span class="badge">${esc(p.source)}</span> ${esc(p.text)} <span class="muted">${esc(p.quality)}</span></div>`).join('') : '<div class="muted">no points</div>'}</div>`
  return `<div class="ev-note">${esc(m.note)}</div><div class="sc-debate">${side(m.bull)}${side(m.bear)}${side(m.neutral)}</div>
    <div class="card"><h2>JUDGE — the engine</h2><div class="ev-hero-big">${esc(m.judge.engineDecision)}${m.judge.score !== null ? ` <small>${m.judge.score}/100</small>` : ''}</div><div class="plain">${esc(m.judge.reason)}</div>${m.judge.wouldFlip.length ? `<div><b>Would flip:</b> ${esc(m.judge.wouldFlip.join('; '))}</div>` : ''}<div class="muted">${esc(m.judge.note)}</div>${m.unknowns.length ? `<div class="muted">Unknown: ${esc(m.unknowns.join(' '))}</div>` : ''}</div>`
}

function renderTeacher() {
  return `<div class="card"><h2>Ask the teacher</h2><div class="muted">Answers only from the lesson, a case or the current debate; every figure and citation is checked, and an answer that decides or predicts is replaced by the lesson's own text.</div>
    <form id="sc-teach"><input id="sc-teach-q" placeholder="e.g. What does the engine need before a sweep counts?" maxlength="600"><label class="muted"><input type="checkbox" id="sc-teach-lesson" checked> use lesson “${esc(conceptId)}”</label> <label class="muted"><input type="checkbox" id="sc-teach-debate"> use the current debate</label> <button class="btn" type="submit">Ask</button></form><div id="sc-teach-out"></div></div>`
}

async function renderLearning() {
  const { data } = await getJson('/api/school/progress')
  return `<div class="ev-note">${esc(data.note)}</div><div class="ev-heroes"><div class="ev-hero"><div class="ev-hero-k">familiar</div><div class="ev-hero-big">${data.totals.familiar}</div></div><div class="ev-hero"><div class="ev-hero-k">practising</div><div class="ev-hero-big">${data.totals.practising}</div></div><div class="ev-hero"><div class="ev-hero-k">introduced</div><div class="ev-hero-big">${data.totals.introduced}</div></div><div class="ev-hero"><div class="ev-hero-k">unseen</div><div class="ev-hero-big">${data.totals.unseen}</div></div></div>
    ${data.suggestions.length ? `<div class="card"><h2>Next</h2>${data.suggestions.map((s) => `<div><button class="btn ghost" data-concept="${esc(s.conceptId)}">${esc(s.conceptId)}</button> <span class="muted">${esc(s.reason)}</span></div>`).join('')}</div>` : ''}
    <div class="card"><h2>By concept</h2><table><tr><th>concept</th><th>level</th><th class="num">lessons</th><th class="num">quizzes</th><th class="num">best</th><th class="num">cases</th><th class="num">counter</th><th class="num">replay</th></tr>${data.concepts.map((m) => `<tr><td><button class="btn ghost" data-concept="${esc(m.conceptId)}">${esc(m.title)}</button></td><td>${esc(m.level)}</td><td class="num">${m.lessonsViewed}</td><td class="num">${m.quizzesTaken}</td><td class="num">${m.quizBest === null ? '—' : `${Math.round(m.quizBest * 100)}%`}</td><td class="num">${m.casesReviewed}</td><td class="num">${m.counterexamplesReviewed}</td><td class="num">${m.replayCorrect}/${m.replayAnswered}</td></tr>`).join('')}</table></div>`
}

async function renderMarkets() {
  const { data } = await getJson('/api/school/prediction-market')
  const w = data.example
  return `<div class="ev-note">Prediction-market edge, costs and Kelly — the arithmetic, taught with SIMULATED numbers. Mr. Cash is not connected to any prediction market and does not trade them.</div>
    <div class="card"><h2>Worked example <span class="ev-src sim">SIMULATED</span></h2>${w.steps.map((s) => `<div>${esc(s)}</div>`).join('')}<table><tr><td>single venue</td><td>${esc(w.single.note)}</td></tr><tr><td>cross venue</td><td>${esc(w.cross.note)}</td></tr><tr><td>net of costs</td><td>${esc(w.net.note)}</td></tr><tr><td>Kelly</td><td>${esc(w.kelly.note)}</td></tr></table></div>
    <div class="card"><h2>Try the arithmetic</h2><form id="sc-pm"><label>YES ask <input name="yes" value="0.47" size="5"></label> <label>NO ask <input name="no" value="0.51" size="5"></label> <label>fee/side <input name="fee" value="0.01" size="5"></label> <label>slippage <input name="slip" value="0.005" size="5"></label> <label>your p(YES) <input name="p" value="0.55" size="5"></label> <button class="btn" type="submit">Compute</button></form><div id="sc-pm-out"></div></div>
    <div class="card"><h2>Lesson</h2><button class="btn ghost" data-concept="prediction-market-edge">Open the concept</button></div>`
}

async function renderView() {
  const out = document.getElementById('school-out')
  const status = document.getElementById('school-status')
  if (!out) return
  try {
    let html = ''
    switch (view) {
      case 'concepts': html = await renderConcepts(); break
      case 'lesson': html = await renderLesson(); break
      case 'cases': html = await renderCases(); break
      case 'replay': html = await renderReplay(); break
      case 'debate': html = await renderDebate(); break
      case 'teacher': html = renderTeacher(); break
      case 'learning': html = await renderLearning(); break
      case 'markets': html = await renderMarkets(); break
    }
    out.innerHTML = html
    if (status) status.textContent = `updated ${new Date().toLocaleTimeString()}`
  } catch (e) {
    out.innerHTML = `<div class="plain">Couldn't load the school: ${esc(e.message)}. Showing nothing rather than making something up.</div>`
    if (status) status.textContent = 'failed'
  }
}
function renderShell() {
  const nav = document.getElementById('school-views')
  if (nav) nav.innerHTML = VIEWS.map(([id, l]) => `<button data-view="${id}" class="${id === view ? 'on' : ''}">${l}</button>`).join('')
}
async function loadSchool() { renderShell(); await renderView() }

document.addEventListener('click', async (e) => {
  const b = e.target.closest('#school-views button[data-view]')
  if (b) { view = b.dataset.view; await loadSchool(); return }
  const c = e.target.closest('#tab-school [data-concept]')
  if (c) { conceptId = c.dataset.concept; view = 'lesson'; await loadSchool(); return }
  const k = e.target.closest('#tab-school [data-kind]')
  if (k) { caseKind = k.dataset.kind; await loadSchool(); return }
  const cs = e.target.closest('#tab-school [data-case]')
  if (cs) { await showCase(cs.dataset.case).catch((err) => { document.getElementById('school-out').innerHTML = `<div class="plain">${esc(err.message)}</div>` }); return }
  if (e.target.closest('#sc-back')) { await loadSchool(); return }
  if (e.target.closest('#sc-rp-prev')) { replayK = Math.max(0, replayK - 1); replayReveal = null; await loadSchool(); return }
  if (e.target.closest('#sc-rp-next')) { replayK += 1; replayReveal = null; await loadSchool(); return }
  const ch = e.target.closest('#tab-school [data-rp-choice]')
  if (ch) {
    try { replayReveal = { k: replayK, ...(await postJson('/api/school/replay/answer', { k: replayK, choice: ch.dataset.rpChoice })) } } catch (err) { replayReveal = null; alert(err.message) }
    await loadSchool(); return
  }
})
document.addEventListener('submit', async (e) => {
  if (e.target.id === 'sc-quiz') {
    e.preventDefault()
    const answers = {}
    for (const [k, v] of new FormData(e.target).entries()) answers[k] = Number(v)
    const out = document.getElementById('sc-quiz-out')
    try { const g = await postJson('/api/school/quiz', { conceptId, answers }); out.innerHTML = `${g.correct}/${g.total} — ${esc(g.note)}<br>${g.results.map((r) => `<span class="${r.correct ? 'win' : 'loss'}">${esc(r.id)}</span>: ${esc(r.why)}`).join('<br>')}` } catch (err) { out.textContent = err.message }
  }
  if (e.target.id === 'sc-teach') {
    e.preventDefault()
    const out = document.getElementById('sc-teach-out')
    out.innerHTML = '<div class="muted">asking…</div>'
    try {
      const a = await postJson('/api/school/teach', { question: document.getElementById('sc-teach-q').value, conceptId: document.getElementById('sc-teach-lesson').checked ? conceptId : undefined, debate: document.getElementById('sc-teach-debate').checked })
      out.innerHTML = `<div class="plain">${esc(a.text).replace(/\n/g, '<br>')}</div><div class="muted">${esc(a.source)} · ${esc(a.note)}${a.problems.length ? ` · rejected because: ${esc(a.problems.join('; '))}` : ''}</div>`
    } catch (err) { out.innerHTML = `<div class="err">${esc(err.message)}</div>` }
  }
  if (e.target.id === 'sc-pm') {
    e.preventDefault()
    const p = new URLSearchParams(new FormData(e.target)).toString()
    const out = document.getElementById('sc-pm-out')
    try { const { data } = await getJson(`/api/school/prediction-market?${p}`); out.innerHTML = data.calc ? `<div>${esc(data.calc.single.note)}</div><div>${esc(data.calc.net.note)}</div><div>${data.calc.kelly ? esc(data.calc.kelly.note) : ''}</div><div class="muted">SIMULATED arithmetic — not a quote, not a trade.</div>` : '<div class="muted">Enter YES and NO asks strictly between 0 and 1.</div>' } catch (err) { out.textContent = err.message }
  }
})

document.getElementById('btn-school')?.addEventListener('click', () => loadSchool())
window.loadSchool = loadSchool
