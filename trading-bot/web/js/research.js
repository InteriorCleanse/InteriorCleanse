/**
 * RESEARCH LAB — questions the record raises, hypotheses with their statuses,
 * the overfitting detector, the regime atlas, news-to-price diffusion, and
 * proposals that wait for a human. Draws /api/research/* and nothing else.
 */
import { getJson, esc } from './api.js'

const VIEWS = [['overview', 'Overview'], ['questions', 'Questions'], ['hypotheses', 'Hypotheses'], ['overfitting', 'Overfitting'], ['atlas', 'Regime atlas'], ['diffusion', 'News diffusion'], ['proposals', 'Proposals'], ['sandbox', 'Sandbox'], ['experiments', 'Experiments']]
let view = 'overview'
let atlasDim = 'volatility'
let atlasSource = 'paper'

const fx = (n, d = 2) => (n === null || n === undefined ? '—' : `${n >= 0 ? '+' : ''}${Number(n).toFixed(d)}`)
const when = (ms) => { try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms)) } catch { return '' } }
const pill = (s) => `<span class="ev-st ${/INSUFFICIENT|NOT SUPPORTED|REJECTED|STALE|LIKELY LUCK|FAILED/.test(s) ? 'none' : /UNTESTED|TESTING|UNDER REVIEW|UNCLEAR|DRAFT/.test(s) ? 'early' : /IN SAMPLE|PROPOSED/.test(s) ? 'dev' : 'large'}">${esc(s)}</span>`
const notEnough = (what) => `<div class="ev-empty"><div class="ev-empty-big">NOT ENOUGH DATA</div><div class="muted">${esc(what)}</div></div>`
async function postJson(path, body) {
  const cfg = await getJson('/api/config')
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-mrcash-csrf': cfg.csrf }, body: JSON.stringify(body || {}) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || j.ok === false) throw new Error(j.error || `HTTP ${res.status}`)
  return j.data
}
const critique = (c) => c ? `<div class="sc-critique"><b>Critique — worst ${esc(c.worst)}</b>${c.items.map((i) => `<div><span class="ev-st ${i.severity === 'HIGH' ? 'none' : i.severity === 'MEDIUM' ? 'early' : 'large'}">${esc(i.severity)}</span> ${esc(i.concern)}: ${esc(i.detail)}</div>`).join('')}</div>` : ''

async function renderOverview() {
  const { data } = await getJson('/api/research')
  return `${data.notes.map((n) => `<div class="ev-note">${esc(n)}</div>`).join('')}
    <div class="ev-heroes"><div class="ev-hero"><div class="ev-hero-k">paper trades</div><div class="ev-hero-big">${data.paperTrades}</div></div><div class="ev-hero"><div class="ev-hero-k">questions</div><div class="ev-hero-big">${data.questions.length}</div></div><div class="ev-hero"><div class="ev-hero-k">hypotheses</div><div class="ev-hero-big">${data.hypotheses.length}</div></div><div class="ev-hero"><div class="ev-hero-k">proposals awaiting</div><div class="ev-hero-big">${data.proposals.filter((p) => p.status === 'PROPOSED').length}</div></div><div class="ev-hero"><div class="ev-hero-k">trials recorded</div><div class="ev-hero-big">${data.trials.total}</div></div></div>
    <div class="card"><h2>Trial registry</h2><div class="plain">${esc(data.trials.note)}</div>${Object.keys(data.trials.byStrategy).length ? `<table><tr><th>strategy</th><th class="num">trials</th></tr>${Object.entries(data.trials.byStrategy).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v}</td></tr>`).join('')}</table>` : ''}</div>
    ${quantLab()}`
}

/**
 * THE QUANT LAB — four research tools, each a named view, each labelled with
 * what it runs on. None of them changes a strategy; every one of them reports
 * NOT ENOUGH DATA until the record it needs exists.
 */
function quantLab() {
  const rows = [
    ['overfitting', 'Backtest overfitting detector', 'Deflated Sharpe over the trial registry: how likely the best backtest is luck, given how many things were tried.', 'trial registry · backtests'],
    ['atlas', 'Strategy-by-regime atlas', 'Where each strategy family has held up and where it has not, by volatility and regime. PAPER and BACKTEST never share a table.', 'paper record · backtests'],
    ['diffusion', 'News-to-price diffusion', 'A Hawkes fit around scheduled releases: how hard a headline hits and how fast the move is absorbed. HISTORICAL.', 'calendar memory · candles'],
    ['sandbox', 'Strategy search sandbox', 'Filter, session, regime and parameter variants of an existing strategy, each registered as a trial before it runs.', 'backtests · trial registry'],
  ]
  return `<div class="card"><h2>Quant lab <span class="muted">— the four research tools</span></h2>
    <div class="rs-lab">${rows.map(([id, title, what, on]) => `<div class="rs-lab-item"><b>${esc(title)}</b><div class="muted">${esc(what)}</div><div class="rs-lab-foot"><span class="muted">runs on: ${esc(on)}</span><button class="chip" data-labview="${id}">Open</button></div></div>`).join('')}
      <div class="rs-lab-item"><b>Prediction-market arithmetic</b><div class="muted">YES + NO under one dollar, costs, cross-venue divergence and Kelly sizing, taught with SIMULATED numbers. Mr. Cash is not connected to any prediction market and does not trade them.</div><div class="rs-lab-foot"><span class="muted">runs on: worked examples</span><button class="chip" data-tab="school">School → Other markets</button></div></div>
    </div>
    <div class="plain">Research reads the record and writes proposals. A proposal that passes its gates still needs a human; nothing here reaches the engine.</div></div>`
}

async function renderQuestions() {
  const { data } = await getJson('/api/research/questions')
  if (!data.length) return notEnough('No cohort at the 50-trade bar has a 95% interval clear of zero yet. Questions appear as the paper record grows; they are never drafted from a smaller sample.')
  return data.map((q, i) => `<div class="card"><h2>${esc(q.draft.question)}</h2><div class="muted">${esc(q.dimension)} = ${esc(q.value)} · n=${q.n} · mean ${fx(q.meanR)}R${q.ci95 ? ` (95% ${fx(q.ci95.lo)} to ${fx(q.ci95.hi)})` : ''}</div><div><b>H:</b> ${esc(q.draft.hypothesis)}<br><b>H0:</b> ${esc(q.draft.nullHypothesis)}<br><b>Method:</b> ${esc(q.draft.method)}</div><div class="muted">${q.draft.limitations.map(esc).join(' · ')}</div>${critique(q.critique)}<button class="btn" data-adopt="${i}">Adopt as UNTESTED hypothesis</button></div>`).join('')
}

async function renderHypotheses() {
  const { data } = await getJson('/api/research/hypotheses')
  if (!data.length) return notEnough('No hypotheses yet. Adopt one from the Questions view, or draft one by hand below.') + draftForm()
  return data.map((h) => `<div class="card"><h2>${pill(h.status)} ${esc(h.question)} <span class="muted">v${h.version}</span></h2>
    <div><b>H:</b> ${esc(h.hypothesis)}<br><b>H0:</b> ${esc(h.nullHypothesis)}<br><b>Dataset:</b> ${esc(h.dataset.label)}<br><b>Method:</b> ${esc(h.method)}</div>
    <table><tr><th>stage</th><th class="num">n</th><th>status</th><th class="num">mean</th><th>95%</th><th>note</th></tr>${['inSample', 'outOfSample'].map((s) => h[s] ? `<tr><td>${s}</td><td class="num">${h[s].trades}</td><td>${esc(h[s].sampleStatus)}</td><td class="num">${fx(h[s].meanR)}R</td><td>${h[s].ci95 ? `${fx(h[s].ci95.lo)} to ${fx(h[s].ci95.hi)}` : '—'}</td><td class="muted">${esc(h[s].note)}</td></tr>` : `<tr><td>${s}</td><td colspan="5" class="muted">not run</td></tr>`).join('')}</table>
    ${h.counterevidence.length ? `<div><b>Counterevidence:</b> ${h.counterevidence.map(esc).join(' · ')}</div>` : ''}${h.limitations.length ? `<div class="muted">${h.limitations.map(esc).join(' · ')}</div>` : ''}
    <div class="muted">next review ${when(h.nextReview)}</div>
    <div class="row"><button class="btn ghost" data-htest="${esc(h.id)}" data-stage="inSample">Run in-sample</button><button class="btn" data-htest="${esc(h.id)}" data-stage="outOfSample">Run out-of-sample (records after ${when(h.created)})</button><button class="btn ghost" data-hreview="${esc(h.id)}">Mark reviewed</button><button class="btn ghost" data-hreject="${esc(h.id)}">Reject</button></div></div>`).join('') + draftForm()
}
function draftForm() {
  return `<div class="card"><h2>Draft a hypothesis by hand</h2><form id="rs-draft"><input name="question" placeholder="Question?" required> <input name="hypothesis" placeholder="Hypothesis" required> <input name="nullHypothesis" placeholder="Null hypothesis" required> <select name="direction"><option>positive</option><option>negative</option><option>difference</option></select> <input name="filters" placeholder='filters JSON e.g. [{"dimension":"session","values":["london"]}]' size="50"> <button class="btn" type="submit">Create UNTESTED</button></form><div class="muted">The words proven, guaranteed, certain, best, perfect and fail-proof are refused.</div><div id="rs-draft-out"></div></div>`
}

async function renderOverfitting() {
  const { data } = await getJson('/api/research/overfitting')
  const d = data.deflated
  const curve = `<table><tr><th class="num">trials</th><th class="num">chance benchmark (per-trade Sharpe)</th></tr>${data.curve.map((c) => `<tr><td class="num">${c.trials}</td><td class="num">${c.benchmarkSharpe.toFixed(3)}</td></tr>`).join('')}</table>`
  return `<div class="ev-note">${esc(data.note)}</div>
    <div class="card"><h2>Deflated Sharpe — ${esc(data.strategyId)} <span class="ev-src sim">BACKTEST · SIMULATED</span></h2>${d ? `<div class="ev-hero-big">${pill(d.verdict)}</div><div class="plain">${esc(d.note)}</div><table><tr><td>observed per-trade Sharpe</td><td class="num">${d.observed === null ? '—' : d.observed.toFixed(3)}</td></tr><tr><td>trials</td><td class="num">${d.trials}</td></tr><tr><td>track length</td><td class="num">${d.trackLength}</td></tr><tr><td>skew / kurtosis</td><td class="num">${d.skew === null ? '—' : d.skew.toFixed(2)} / ${d.kurtosis === null ? '—' : d.kurtosis.toFixed(2)}</td></tr><tr><td>benchmark</td><td class="num">${d.benchmark === null ? '—' : d.benchmark.toFixed(3)}</td></tr><tr><td>P(edge beats luck)</td><td class="num">${d.probability === null ? '—' : `${(d.probability * 100).toFixed(1)}%`}</td></tr></table>` : notEnough('No cached backtest for this strategy. Run the backtest from the Evidence tab; it will count as a trial.')}</div>
    <div class="card"><h2>How the bar moves with trials</h2><div class="muted">Try enough variants and the best one looks brilliant by luck; the bar rises with the count.</div>${curve}</div>
    <div class="card"><h2>Trial registry</h2><div class="plain">${esc(data.registry.note)}</div><form id="rs-trial"><input name="count" value="1" size="4"> <input name="note" placeholder="what was tried" size="40"> <button class="btn ghost" type="submit">Record trial(s) by hand</button></form></div>`
}

async function renderAtlas() {
  const { data: a } = await getJson(`/api/research/atlas?dim=${atlasDim}&source=${atlasSource}`)
  const toggles = `<div class="ev-toggle"><button data-atlas-src="paper" class="${atlasSource === 'paper' ? 'on' : ''}">PAPER</button><button data-atlas-src="backtest" class="${atlasSource === 'backtest' ? 'on' : ''}">BACKTEST <small>simulated</small></button></div> <div class="ev-toggle"><button data-atlas-dim="volatility" class="${atlasDim === 'volatility' ? 'on' : ''}">volatility</button><button data-atlas-dim="regime" class="${atlasDim === 'regime' ? 'on' : ''}">regime</button></div>`
  if (!a.rows.length) return toggles + notEnough(a.notes[a.notes.length - 1])
  const table = `<table><tr><th>family</th>${a.conditions.map((c) => `<th class="num">${esc(c)}</th>`).join('')}</tr>${a.rows.map((r) => `<tr><td><b>${esc(r.family)}</b></td>${r.cells.map((c) => `<td class="num ${c.meanR === null ? 'ev-under' : ''}">${c.meanR === null ? `<span class="muted">n=${c.n}</span>` : `<span class="${c.meanR >= 0 ? 'win' : 'loss'}">${fx(c.meanR)}R</span> <small class="muted">n=${c.n}${c.established ? ' ★' : ''}</small>`}</td>`).join('')}</tr>`).join('')}</table>`
  return `${toggles}${a.notes.map((n) => `<div class="ev-note">${esc(n)}</div>`).join('')}<div class="card"><h2>Strategy family × ${esc(a.dimension)} <span class="ev-src ${a.source === 'PAPER' ? 'paper' : 'sim'}">${esc(a.source)}</span></h2>${table}<div class="muted">★ established: 50+ trades and a 95% interval clear of zero. A "repeat" is the same sign in adjacent established cells.</div></div>${a.rows.map((r) => `<div class="card"><h2>${esc(r.family)}</h2><div class="plain">${esc(r.note)}</div>${r.struggles.length ? `<div><b>Struggles in:</b> ${r.struggles.map(esc).join(', ')}</div>` : ''}</div>`).join('')}`
}

async function renderDiffusion() {
  const { data } = await getJson('/api/research/diffusion')
  const f = data.fit
  const body = f.status === 'ESTIMATED'
    ? `<div class="ev-hero-big">half-life ${f.halfLifeMin < 60 ? `${f.halfLifeMin.toFixed(0)} min` : `${(f.halfLifeMin / 60).toFixed(1)} h`}</div><table><tr><td>news → price (α_NP)</td><td class="num">${f.alphaNP.toFixed(4)}</td></tr><tr><td>price → price (α_PP)</td><td class="num">${f.alphaPP.toFixed(4)}</td></tr><tr><td>decay β (per minute)</td><td class="num">${f.beta.toFixed(4)}</td></tr><tr><td>events per release</td><td class="num">${f.eventsPerRelease.toFixed(2)}</td></tr><tr><td>branching ratio (echo share)</td><td class="num">${(f.branchingRatio * 100).toFixed(0)}%</td></tr><tr><td>intensity shares</td><td class="num">baseline ${(f.shares.baseline * 100).toFixed(0)}% · news ${(f.shares.news * 100).toFixed(0)}% · self ${(f.shares.self * 100).toFixed(0)}%</td></tr></table>`
    : notEnough(f.note)
  return `<div class="ev-note">Markets react to information, then to themselves. This fits a self-exciting model of price events on the stored release history: how hard a headline hits, how much the market feeds on its own reaction, and how fast it fades. ESTIMATED, activity only — never direction.</div>
    <div class="card"><h2>News-to-price diffusion <span class="ev-src sim">HISTORICAL · ${esc(f.status)}</span></h2>${body}<div class="muted">sample: ${f.sample.newsEvents} releases, ${f.sample.priceEvents} price events (${esc(f.threshold)}) over ${data.window.days} days · calendar memory ${data.history.instances} instance(s)</div><div class="plain">${esc(data.note)}</div></div>`
}

async function renderProposals() {
  const { data } = await getJson('/api/research/proposals')
  const form = `<div class="card"><h2>Propose a change</h2><div class="muted">A proposal passes its gates or it does not; a human approves or rejects it; approval records a decision and applies nothing. Applying a change is a config edit a person commits with the proposal id.</div>
    <form id="rs-prop"><select name="kind"><option>parameter-variant</option><option>filter</option><option>retire</option><option>promote</option><option>watch</option></select> <input name="strategyId" placeholder="strategy id" required> <input name="title" placeholder="title" required> <input name="rationale" placeholder="rationale" size="40" required> <input name="change" placeholder="what would change" size="30" required> <input name="params" placeholder='params JSON e.g. {"rr":2.5}'> <button class="btn" type="submit">Create</button></form><div id="rs-prop-out"></div></div>`
  if (!data.length) return notEnough('No proposals. Nothing is waiting for a human.') + form
  return data.map((p) => `<div class="card"><h2>${pill(p.status)} ${esc(p.title)} <span class="muted">${esc(p.kind)} · ${esc(p.strategyId)} · requires ${esc(p.requires)}</span></h2><div>${esc(p.rationale)}</div><div><b>Change:</b> ${esc(p.change)}${p.params ? ` — ${esc(Object.entries(p.params).map(([k, v]) => `${k}=${v}`).join(', '))}` : ''}</div>
    <table>${p.gates.map((g) => `<tr><td>${g.met ? '<span class="win">✓</span>' : '<span class="loss">✗</span>'}</td><td>${esc(g.label)}</td><td class="muted">${esc(g.detail)}</td></tr>`).join('')}</table>${critique(p.critique)}
    ${p.status === 'PROPOSED' ? `<div class="row"><input placeholder="your name" id="rs-by-${esc(p.id)}" size="12"> <button class="btn" data-decide="${esc(p.id)}" data-decision="APPROVED">Approve (records only)</button><button class="btn ghost" data-decide="${esc(p.id)}" data-decision="REJECTED">Reject</button></div>` : p.decidedAt ? `<div class="muted">${esc(p.status)} ${when(p.decidedAt)} by ${esc(p.decidedBy)}: ${esc(p.decisionNote)}</div>` : ''}
    <div class="muted">${esc(p.history[p.history.length - 1].detail)}</div></div>`).join('') + form
}

async function renderSandbox() {
  const { data: school } = await getJson('/api/school')
  const ids = [...new Set(school.concepts.flatMap((c) => c.strategies))]
  return `<div class="ev-note">The paper experiment sandbox: what would restricting a strategy to a session, regime, volatility or confluence bucket have done to its paper record? What would a parameter variant have done in the backtest against the defaults? Each request registers an experiment with a frozen dataset, a baseline, an out-of-sample stage, robustness and the challenger. The production strategy and its parameters are untouched; nothing here changes a decision the engine will make.</div>
    <div class="card"><h2>Request a sandbox experiment</h2><form id="rs-sandbox"><select name="kind"><option value="session-restriction">session restriction</option><option value="regime-restriction">regime restriction</option><option value="volatility-restriction">volatility restriction</option><option value="confluence-requirement">confluence requirement (quality bucket)</option><option value="filter">whole strategy vs the rest</option><option value="parameter">parameter variant (backtest)</option></select> <select name="strategyId">${ids.map((id) => `<option>${esc(id)}</option>`).join('')}</select> <select name="source"><option>PAPER</option><option>BACKTEST</option></select> <input name="values" placeholder="values kept, comma-separated (london,newYork · ranging · wild · 80–100)" size="44"> <input name="params" placeholder='params JSON for a variant e.g. {"rr":2.5}' size="30"> <button class="btn" type="submit">Register and run</button></form><div id="rs-sandbox-out" class="plain"></div></div>`
}

async function renderExperiments() {
  const { data } = await getJson('/api/research/experiments')
  if (!data.items.length) return notEnough('No experiment on record. The research scheduler runs at most one testable queue item per tick; the sandbox registers one on request.')
  return `<div class="ev-note">${esc(data.note)}</div>` + data.items.map((e) => `<div class="card"><h2>${pill(e.status === 'DONE' ? e.result : e.status)} ${esc(e.kind)} · ${esc(e.strategyId)} <span class="ev-src ${e.source === 'PAPER' ? 'paper' : 'sim'}">${esc(e.source)}</span></h2><div>${esc(e.method)}</div><div class="muted">baseline: ${esc(e.baseline.label)}</div><table><tr><th></th><th class="num">treatment OOS</th><th class="num">baseline OOS</th><th>Welch</th><th>robustness</th><th>challenger</th><th class="num">trials</th></tr><tr><td>out of sample</td><td class="num">${e.oos ? `${fx(e.oos.meanR)}R (n=${e.oos.trades})${e.oos.ci95 ? `<br><small class="muted">${fx(e.oos.ci95.lo)} to ${fx(e.oos.ci95.hi)}</small>` : ''}` : '—'}</td><td class="num">${e.baselineOos ? `${fx(e.baselineOos.meanR)}R (n=${e.baselineOos.trades})` : '—'}</td><td>${e.comparison ? pill(e.comparison) : '—'}</td><td>${e.robustness ? pill(e.robustness) : '—'}</td><td>${e.challenger ? pill(e.challenger) : '—'}</td><td class="num">${e.trials}</td></tr></table><div class="muted">${e.finishedAt ? `finished ${when(e.finishedAt)}` : `registered ${when(e.createdAt)}`}${e.nextTest ? ` · reassessment ${when(e.nextTest)}` : ''}${e.error ? ` · error: ${esc(e.error)}` : ''} · <a href="/api/research/experiment?id=${encodeURIComponent(e.experimentId)}" target="_blank" rel="noopener">full record</a></div></div>`).join('')
}

async function renderView() {
  const out = document.getElementById('research-out')
  const status = document.getElementById('research-status')
  if (!out) return
  try {
    let html = ''
    switch (view) {
      case 'overview': html = await renderOverview(); break
      case 'questions': html = await renderQuestions(); break
      case 'hypotheses': html = await renderHypotheses(); break
      case 'overfitting': html = await renderOverfitting(); break
      case 'atlas': html = await renderAtlas(); break
      case 'diffusion': html = await renderDiffusion(); break
      case 'proposals': html = await renderProposals(); break
      case 'sandbox': html = await renderSandbox(); break
      case 'experiments': html = await renderExperiments(); break
    }
    out.innerHTML = html
    if (status) status.textContent = `updated ${new Date().toLocaleTimeString()}`
  } catch (e) {
    out.innerHTML = `<div class="plain">Couldn't load the lab: ${esc(e.message)}. Showing nothing rather than making something up.</div>`
    if (status) status.textContent = 'failed'
  }
}
function renderShell() {
  const nav = document.getElementById('research-views')
  if (nav) nav.innerHTML = VIEWS.map(([id, l]) => `<button data-view="${id}" class="${id === view ? 'on' : ''}">${l}</button>`).join('')
}
async function loadResearch() { renderShell(); await renderView() }

document.addEventListener('click', async (e) => {
  const b = e.target.closest('#research-views button[data-view]')
  if (b) { view = b.dataset.view; await loadResearch(); return }
  const lab = e.target.closest('#tab-research [data-labview]'); if (lab) { view = lab.dataset.labview; await loadResearch(); return }
  const jump = e.target.closest('#tab-research [data-tab]'); if (jump && typeof window.showTab === 'function') { window.showTab(jump.dataset.tab); return }
  const s = e.target.closest('#tab-research [data-atlas-src]'); if (s) { atlasSource = s.dataset.atlasSrc; await loadResearch(); return }
  const d = e.target.closest('#tab-research [data-atlas-dim]'); if (d) { atlasDim = d.dataset.atlasDim; await loadResearch(); return }
  const adopt = e.target.closest('#tab-research [data-adopt]')
  if (adopt) {
    try { const { data } = await getJson('/api/research/questions'); const q = data[Number(adopt.dataset.adopt)]; await postJson('/api/research/hypothesis', { ...q.draft, source: 'PAPER', strategy: q.dimension === 'strategyId' ? q.value : null, session: q.dimension === 'session' ? q.value : null, regime: q.dimension === 'regime' ? q.value : null, observation: `Adopted from the research questions: mean ${fx(q.meanR)}R over ${q.n} PAPER trades (in-sample).` }); view = 'hypotheses' } catch (err) { alert(err.message) }
    await loadResearch(); return
  }
  const t = e.target.closest('#tab-research [data-htest]'); if (t) { try { await postJson('/api/research/hypothesis/test', { id: t.dataset.htest, stage: t.dataset.stage }) } catch (err) { alert(err.message) } await loadResearch(); return }
  const r = e.target.closest('#tab-research [data-hreview]'); if (r) { try { await postJson('/api/research/hypothesis/review', { id: r.dataset.hreview, note: 'reviewed from the lab' }) } catch (err) { alert(err.message) } await loadResearch(); return }
  const x = e.target.closest('#tab-research [data-hreject]'); if (x) { const note = prompt('Why is it rejected?'); if (!note) return; try { await postJson('/api/research/hypothesis/review', { id: x.dataset.hreject, note, reject: true }) } catch (err) { alert(err.message) } await loadResearch(); return }
  const dec = e.target.closest('#tab-research [data-decide]')
  if (dec) { const by = (document.getElementById(`rs-by-${dec.dataset.decide}`) || {}).value || ''; const note = prompt(`${dec.dataset.decision}: note for the record`) || ''; try { await postJson('/api/research/proposal/decide', { id: dec.dataset.decide, decision: dec.dataset.decision, by, note }) } catch (err) { alert(err.message) } await loadResearch(); return }
})
document.addEventListener('submit', async (e) => {
  if (e.target.id === 'rs-draft') {
    e.preventDefault(); const f = new FormData(e.target); const out = document.getElementById('rs-draft-out')
    let filters = []; try { filters = JSON.parse(f.get('filters') || '[]') } catch { out.textContent = 'filters must be JSON'; return }
    try { await postJson('/api/research/hypothesis', { question: f.get('question'), hypothesis: f.get('hypothesis'), nullHypothesis: f.get('nullHypothesis'), direction: f.get('direction'), cohortFilters: filters, source: 'PAPER' }); await loadResearch() } catch (err) { out.textContent = err.message }
  }
  if (e.target.id === 'rs-trial') { e.preventDefault(); const f = new FormData(e.target); try { await postJson('/api/research/trial', { count: Number(f.get('count')), note: f.get('note') }); await loadResearch() } catch (err) { alert(err.message) } }
  if (e.target.id === 'rs-sandbox') {
    e.preventDefault(); const f = new FormData(e.target); const out = document.getElementById('rs-sandbox-out')
    let params = undefined; try { params = f.get('params') ? JSON.parse(f.get('params')) : undefined } catch { out.textContent = 'params must be JSON'; return }
    const values = String(f.get('values') || '').split(',').map((s) => s.trim()).filter(Boolean)
    out.textContent = 'Running… (a backtest variant takes a few seconds)'
    try { const r = await postJson('/api/research/sandbox', { kind: f.get('kind'), strategyId: f.get('strategyId'), source: f.get('source'), values, params }); out.textContent = `${r.isNew ? 'Registered and ran' : 'Already on record'}: ${r.experiment.experimentId} — ${r.experiment.result}\n\n${r.text}` } catch (err) { out.textContent = err.message }
  }
  if (e.target.id === 'rs-prop') {
    e.preventDefault(); const f = new FormData(e.target); const out = document.getElementById('rs-prop-out')
    let params = null; try { params = f.get('params') ? JSON.parse(f.get('params')) : null } catch { out.textContent = 'params must be JSON'; return }
    try { await postJson('/api/research/proposal', { kind: f.get('kind'), strategyId: f.get('strategyId'), title: f.get('title'), rationale: f.get('rationale'), change: f.get('change'), params }); await loadResearch() } catch (err) { out.textContent = err.message }
  }
})

document.getElementById('btn-research')?.addEventListener('click', () => loadResearch())
window.loadResearch = loadResearch
