/**
 * KNOWLEDGE VAULT — what Mr. Cash remembers, including what did not work; the
 * living strategy passport; the daily brief, end-of-day and weekly reviews;
 * the concept graph. Draws /api/knowledge/* and nothing else.
 */
import { getJson, esc } from './api.js'

const VIEWS = [['vault', 'Vault'], ['passport', 'Passport'], ['brief', 'Daily brief'], ['eod', 'End of day'], ['weekly', 'Weekly review'], ['graph', 'Knowledge graph'], ['memory', 'Memory'], ['digests', 'Digests & audits']]
let view = 'vault'
let kindFilter = ''
let statusFilter = ''
let strategy = ''
let memoryClass = ''
let digestId = ''

const fx = (n, d = 2) => (n === null || n === undefined ? '—' : `${n >= 0 ? '+' : ''}${Number(n).toFixed(d)}`)
const when = (ms) => { try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms)) } catch { return '' } }
const pill = (s) => `<span class="ev-st ${/STALE|RETIRED|INSUFFICIENT|NOT ENOUGH|CONTRADICTED/.test(s) ? 'none' : /REVIEW|INFERRED|HYPOTHESIS|WATCH/.test(s) ? 'early' : /SUPERSEDED|SIMULATED/.test(s) ? 'dev' : 'large'}">${esc(s)}</span>`
const notEnough = (what) => `<div class="ev-empty"><div class="ev-empty-big">NOT ENOUGH DATA</div><div class="muted">${esc(what)}</div></div>`
async function postJson(path, body) {
  const cfg = await getJson('/api/config')
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-mrcash-csrf': cfg.csrf }, body: JSON.stringify(body || {}) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || j.ok === false) throw new Error(j.error || `HTTP ${res.status}`)
  return j.data
}
const growthBar = (g) => `<div class="sc-growth"><div class="sc-growth-bar"><div style="width:${g.pct}%"></div></div><span class="muted">${g.n} trades · ${esc(g.band)} · ${esc(g.status)}</span></div>`
const labelled = (title, block, body) => `<div class="card"><h2>${esc(title)} ${pill(block.evidenceLabel)}</h2>${body}<div class="muted sc-prov">source: ${esc(block.source)}</div></div>`

/**
 * Tell him something to remember: a note from you, stored as an untested
 * HYPOTHESIS with its source on it. A watch date brings it back for review on
 * that day. The vault is memory only; a note never reaches the engine.
 */
const noteForm = `<details class="card kn-note"><summary><b>Tell him something to remember</b> <span class="muted">a date, a headline, a reel — stored untested, never traded on</span></summary>
  <form id="kn-note" class="kn-note-form">
    <label>Title<input name="title" required maxlength="160" placeholder="e.g. Avengers: Doomsday opens Dec 18"></label>
    <label>What he should remember<textarea name="body" required maxlength="4000" placeholder="What you heard, and what you think it could mean for the market"></textarea></label>
    <div class="kn-note-row">
      <label>Market <span class="muted">(optional)</span><input name="market" maxlength="20" placeholder="DIS"></label>
      <label>Bring it back on <span class="muted">(optional)</span><input name="watchAt" type="date"></label>
    </div>
    <label>Source link <span class="muted">(optional)</span><input name="source" type="url" maxlength="500" placeholder="https://…"></label>
    <div class="row"><button class="btn" type="submit">Remember this</button><span class="muted" id="kn-note-out"></span></div>
  </form></details>`

async function renderVault() {
  const { data } = await getJson(`/api/knowledge?limit=200${kindFilter ? `&kind=${encodeURIComponent(kindFilter)}` : ''}${statusFilter ? `&status=${encodeURIComponent(statusFilter)}` : ''}`)
  const s = data.summary
  const heroes = `<div class="ev-heroes"><div class="ev-hero"><div class="ev-hero-k">items</div><div class="ev-hero-big">${s.total}</div></div><div class="ev-hero"><div class="ev-hero-k">due for review</div><div class="ev-hero-big">${s.dueForReview}</div></div><div class="ev-hero"><div class="ev-hero-k">did not work</div><div class="ev-hero-big">${s.failed}</div><div class="ev-hero-sub">failed hypotheses + counterexamples</div></div></div>`
  const kinds = Object.keys(s.byKind), statuses = Object.keys(s.byStatus)
  const chips = `<div class="ev-chips"><button data-kind="" class="${kindFilter ? '' : 'on'}">all kinds</button>${kinds.map((k) => `<button data-kind="${esc(k)}" class="${kindFilter === k ? 'on' : ''}">${esc(k)} ${s.byKind[k]}</button>`).join('')}</div><div class="ev-chips"><button data-status="" class="${statusFilter ? '' : 'on'}">all statuses</button>${statuses.map((k) => `<button data-status="${esc(k)}" class="${statusFilter === k ? 'on' : ''}">${esc(k)} ${s.byStatus[k]}</button>`).join('')}</div>`
  const row = `<div class="row"><button class="btn ghost" id="kn-reassess">Run reassessment now</button><button class="btn ghost" id="kn-backfill">Backfill post-mortems</button><span class="muted" id="kn-action-out"></span></div>`
  if (!data.items.length) return heroes + noteForm + chips + row + notEnough(data.note)
  return `${heroes}${noteForm}${chips}${row}<div class="ev-note">${esc(data.note)}</div><div class="card"><table><tr><th>when</th><th>kind</th><th>title</th><th>status</th><th>label</th><th class="num">v</th><th class="num">+</th><th class="num">−</th><th>review due</th></tr>${data.items.map((i) => `<tr class="kn-item" data-item="${esc(i.id)}"><td class="muted">${when(i.created_at)}</td><td>${esc(i.kind)}</td><td>${esc(i.title)}</td><td>${pill(i.status)}</td><td>${pill(i.evidenceLabel)}</td><td class="num">${i.version}</td><td class="num">${i.new_evidence_count}</td><td class="num">${i.contradictory_evidence_count}</td><td class="muted">${when(i.review_due)}</td></tr>`).join('')}</table></div>`
}

async function showItem(id) {
  const { data: it } = await getJson(`/api/knowledge/item?id=${encodeURIComponent(id)}`)
  const out = document.getElementById('knowledge-out')
  out.innerHTML = `<button class="btn ghost" id="kn-back">← back</button><div class="ev-head"><div><div class="ev-title">${esc(it.title)}</div><div class="muted">${esc(it.kind)} · ${pill(it.status)} ${pill(it.evidenceLabel)} · v${it.version} · <span class="ev-src ${it.provenance.source === 'PAPER' ? 'paper' : 'sim'}">${esc(it.provenance.source)}</span> · engine ${esc(it.provenance.engineVersion)}</div></div></div>
    <div class="card"><div class="plain">${esc(it.body).replace(/\n/g, '<br>')}</div><div class="muted">${it.provenance.recordIds?.length ? `records: ${it.provenance.recordIds.slice(0, 20).map(esc).join(', ')}` : ''}${it.provenance.sampleSize !== undefined ? ` · n=${it.provenance.sampleSize}` : ''}${it.provenance.method ? ` · ${esc(it.provenance.method)}` : ''}</div><div class="muted">tags: ${it.tags.map(esc).join(', ')} · created ${when(it.created_at)} · reviewed ${when(it.last_reviewed)} · due ${when(it.review_due)} · +${it.new_evidence_count} / −${it.contradictory_evidence_count}</div></div>
    <div class="card"><h2>Review</h2><div class="row"><button class="btn" data-review="CONFIRMED" data-id="${esc(it.id)}">Confirm — still holds</button><button class="btn ghost" data-review="REVISED" data-id="${esc(it.id)}">Revise…</button><button class="btn ghost" data-review="RETIRED" data-id="${esc(it.id)}">Retire</button></div><div class="muted">A revision keeps the previous body in the history; nothing is erased.</div></div>
    <div class="card"><h2>History</h2>${it.history.map((h) => `<div><span class="badge">${esc(h.event)}</span> <span class="muted">${when(h.at)} v${h.version}</span> ${esc(h.detail).replace(/\n/g, '<br>')}</div>`).join('')}</div>`
}

async function renderPassport() {
  const { data: p } = await getJson(`/api/knowledge/passport${strategy ? `?strategy=${encodeURIComponent(strategy)}` : ''}`)
  const { data: school } = await getJson('/api/school')
  const ids = [...new Set(school.concepts.flatMap((c) => c.strategies))]
  const picker = `<div class="ev-chips">${ids.map((id) => `<button data-strategy="${esc(id)}" class="${p.strategyId === id ? 'on' : ''}">${esc(id)}</button>`).join('')}</div>`
  const paper = 'cohort' in p.paper
    ? `<div class="card"><h2>Paper record <span class="ev-src paper">PAPER</span> ${pill(p.paper.cohort.stats.status)}</h2>${growthBar(p.paper.growth)}<table><tr><td>trades</td><td class="num">${p.paper.cohort.stats.n}</td></tr><tr><td>mean R</td><td class="num">${fx(p.paper.cohort.stats.meanR)}R${p.paper.cohort.stats.ci95 ? ` (95% ${fx(p.paper.cohort.stats.ci95.lo)} to ${fx(p.paper.cohort.stats.ci95.hi)})` : ''}</td></tr><tr><td>win rate</td><td class="num">${p.paper.cohort.stats.winRate === null ? '—' : `${Math.round(p.paper.cohort.stats.winRate * 100)}%`}</td></tr><tr><td>max drawdown</td><td class="num">${fx(-p.paper.cohort.stats.maxDrawdownR)}R</td></tr></table><div><b>Thesis:</b> ${pill(p.paper.thesis.status)} ${esc(p.paper.thesis.observation)}</div><div class="muted">${esc(p.paper.thesis.wouldFalsify)}</div></div>`
    : `<div class="card"><h2>Paper record ${pill('NOT ENOUGH DATA')}</h2>${growthBar(p.paper.growth)}<div class="plain">${esc(p.paper.note)}</div></div>`
  const atlasRow = (r, dim) => r ? `<div><b>${dim}:</b> ${r.cells.map((c) => `${esc(c.condition)} ${c.meanR === null ? `<span class="muted">n=${c.n}</span>` : `<span class="${c.meanR >= 0 ? 'win' : 'loss'}">${fx(c.meanR)}R</span> <small class="muted">n=${c.n}</small>`}`).join(' · ')}<div class="muted">${esc(r.note)}</div></div>` : `<div class="muted">${dim}: no cells yet</div>`
  return `${picker}<div class="ev-head"><div><div class="ev-title">${esc(p.meta ? p.meta.name : p.strategyId)} <span class="muted">${esc(p.strategyId)}${p.meta ? ` · ${esc(p.meta.family)}` : ''} · ${p.enabled ? 'enabled' : 'not enabled'}</span></div><div class="muted">${p.meta ? esc(p.meta.summary) : 'unknown strategy'}</div></div></div>
    ${p.notes.map((n) => `<div class="ev-note">${esc(n)}</div>`).join('')}
    <div class="card"><h2>Concepts</h2>${p.concepts.map((c) => `<span class="badge">${esc(c.title)}</span>`).join(' ') || '<span class="muted">none mapped</span>'}</div>
    ${paper}
    <div class="card"><h2>Out-of-sample reference <span class="ev-src sim">BACKTEST · SIMULATED</span></h2>${p.oosReference ? `<div>${p.oosReference.oosTrades} OOS trades, expectancy ${fx(p.oosReference.oosAvgR)}R · ${p.oosReference.usable ? 'usable' : esc(p.oosReference.reason)}</div>` : '<div class="muted">none computed — POST /api/validation/oos-reference</div>'}</div>
    <div class="card"><h2>Regime atlas rows <span class="ev-src paper">PAPER</span></h2>${atlasRow(p.atlas.volatility, 'volatility')}${atlasRow(p.atlas.regime, 'regime')}</div>
    <div class="card"><h2>Vault passports (factory)</h2>${p.vaultPassports.length ? p.vaultPassports.map((v) => `<div>${esc(v.id)} · ${esc(v.status)} · OOS ${v.oos.trades} trades ${fx(v.oos.avgR)}R · decay ${v.decay.decaying ? '<span class="loss">DECAYING</span>' : 'ok'} — <span class="muted">${esc(v.decay.reason)}</span></div>`).join('') : '<div class="muted">none minted</div>'}</div>
    <div class="card"><h2>Hypotheses</h2>${p.hypotheses.length ? p.hypotheses.map((h) => `<div>${pill(h.status)} ${esc(h.question)} <span class="muted">v${h.version} · review ${when(h.nextReview)}</span></div>`).join('') : '<div class="muted">none</div>'}</div>
    <div class="card"><h2>Proposals</h2>${p.proposals.length ? p.proposals.map((x) => `<div>${pill(x.status)} ${esc(x.title)} <span class="muted">${esc(x.kind)} · requires ${esc(x.requires)}</span></div>`).join('') : '<div class="muted">none</div>'}</div>
    <div class="card"><h2>Post-mortems</h2>${p.postMortems.length ? p.postMortems.map((m) => `<div class="kn-item" data-item="${esc(m.id)}">${esc(m.title)} <span class="muted">${when(m.created_at)}</span></div>`).join('') : '<div class="muted">none yet</div>'}</div>
    <div class="card"><h2>What would change this reading</h2>${p.wouldChange.map((w) => `<div>· ${esc(w)}</div>`).join('')}</div>
    <div class="muted">trials recorded for this strategy: ${p.trials}</div>`
}

async function renderBrief() {
  const { data: b } = await getJson('/api/knowledge/brief')
  return `<div class="ev-head"><div><div class="ev-title">DAILY BRIEF — ${esc(b.dayKey)}</div><div class="muted">${when(b.at)} · engine ${esc(b.engineVersion)}</div></div></div>${b.notes.map((n) => `<div class="ev-note">${esc(n)}</div>`).join('')}
    ${labelled('Due', b.due, `<div class="ev-heroes"><div class="ev-hero"><div class="ev-hero-k">vault reviews</div><div class="ev-hero-big">${b.due.vaultReviews}</div></div><div class="ev-hero"><div class="ev-hero-k">stale</div><div class="ev-hero-big">${b.due.staleItems}</div></div><div class="ev-hero"><div class="ev-hero-k">hypotheses under review</div><div class="ev-hero-big">${b.due.hypothesesUnderReview}</div></div><div class="ev-hero"><div class="ev-hero-k">proposals awaiting</div><div class="ev-hero-big">${b.due.proposalsAwaiting}</div></div></div>${b.due.items.map((i) => `<div>· ${esc(i)}</div>`).join('')}`)}
    ${labelled('Study', b.study, b.study.suggestions.length ? b.study.suggestions.map((s) => `<div>· <b>${esc(s.conceptId)}</b> — ${esc(s.reason)}</div>`).join('') : '<div class="muted">nothing suggested</div>')}
    ${labelled('Record', b.record, `${growthBar(b.record.growth)}<div>${esc(b.record.last7Note)}</div>`)}
    ${labelled(`Yesterday (${b.yesterday.dayKey})`, b.yesterday, b.yesterday.postMortems.length ? b.yesterday.postMortems.map((m) => `<div>· ${esc(m)}</div>`).join('') : '<div class="muted">no closes</div>')}`
}

async function renderEod() {
  const { data: e } = await getJson('/api/knowledge/eod')
  return `<div class="ev-head"><div><div class="ev-title">END OF DAY — ${esc(e.dayKey)}</div><div class="muted">${when(e.at)}</div></div></div>${e.notes.map((n) => `<div class="ev-note">${esc(n)}</div>`).join('')}
    ${labelled('Trades', e.trades, `<div>${esc(e.trades.note)}</div>${e.trades.closes.map((c) => `<div class="sc-frame"><div class="sc-frame-t">${esc(c.strategyId)} · ${esc(c.kind)} · ${fx(c.rMultiple)}R</div>${c.observations.map((o) => `<div>${esc(o)}</div>`).join('')}<div class="muted">Cannot conclude: ${c.cannotConclude.map(esc).join(' ')}</div></div>`).join('')}`)}
    ${labelled('No-trades', e.noTrades, e.noTrades.rows.length ? `<div>${Object.entries(e.noTrades.byCategory).map(([k, v]) => `<span class="badge">${esc(k)} ${v}</span>`).join(' ')}</div><table>${e.noTrades.rows.map((r) => `<tr><td class="muted">${when(r.at)}</td><td>${esc(r.strategyId)} ${esc(r.direction)}</td><td>${esc(r.category)}</td><td class="muted">${esc(r.reason)}</td></tr>`).join('')}</table>` : '<div class="muted">nothing refused today</div>')}
    ${labelled('Learned', e.learned, e.learned.titles.length ? e.learned.titles.map((t) => `<div>· ${esc(t)}</div>`).join('') : '<div class="muted">no new vault items in the last 24h</div>')}`
}

async function renderWeekly() {
  const { data: w } = await getJson('/api/knowledge/weekly')
  const stats = (s) => s ? `mean ${fx(s.meanR)}R${s.ci95 ? ` (95% ${fx(s.ci95.lo)} to ${fx(s.ci95.hi)})` : ''}, win ${s.winRate === null ? '—' : `${Math.round(s.winRate * 100)}%`}, ${esc(s.status)}` : '<span class="muted">under the bar</span>'
  return `<div class="ev-head"><div><div class="ev-title">WEEKLY REVIEW</div><div class="muted">${when(w.from)} → ${when(w.to)}</div></div></div>${w.notes.map((n) => `<div class="ev-note">${esc(n)}</div>`).join('')}
    ${labelled('Record', w.record, `${growthBar(w.record.growth)}<div>This week: ${w.record.thisWeek.n} — ${stats(w.record.thisWeek.stats)}</div><div>Prior week: ${w.record.priorWeek.n} — ${stats(w.record.priorWeek.stats)}</div><div class="plain">${esc(w.record.note)}</div>${w.record.byStrategy.length ? `<table><tr><th>strategy</th><th class="num">n</th><th class="num">mean</th><th>status</th></tr>${w.record.byStrategy.map((s) => `<tr><td>${esc(s.strategyId)}</td><td class="num">${s.n}</td><td class="num">${s.meanR === null ? '<span class="muted">—</span>' : `${fx(s.meanR)}R`}</td><td>${pill(s.status)}</td></tr>`).join('')}</table>` : ''}`)}
    ${labelled('Knowledge', w.knowledge, `<div>vault ${w.knowledge.vault.total} item(s), ${w.knowledge.vault.dueForReview} due, ${w.knowledge.vault.failed} did-not-work · trials ${w.knowledge.trials}</div><div>hypotheses: ${Object.entries(w.knowledge.hypotheses).map(([k, v]) => `${pill(k)} ${v}`).join(' ') || '<span class="muted">none</span>'}</div><div>proposals: ${Object.entries(w.knowledge.proposals).map(([k, v]) => `${pill(k)} ${v}`).join(' ') || '<span class="muted">none</span>'}</div>`)}
    <div class="card"><h2>Reassessment</h2><div class="plain">${esc(w.reassessment.note)}</div><button class="btn ghost" id="kn-reassess">Run reassessment now</button> <span class="muted" id="kn-action-out"></span></div>
    ${labelled('Learning', w.learning, `<div>familiar ${w.learning.familiar} · practising ${w.learning.practising} · introduced ${w.learning.introduced} · unseen ${w.learning.unseen} · ${w.learning.engagements} engagement(s)</div>`)}`
}

async function renderGraph() {
  const { data: g } = await getJson('/api/knowledge/graph')
  const byTrack = {}
  for (const n of g.nodes) (byTrack[n.track] = byTrack[n.track] || []).push(n)
  const edgesOf = (id) => g.edges.filter((e) => e.from === id)
  return `<div class="ev-note">${g.nodes.length} concepts, ${g.edges.length} edges: related concepts, the strategies that use them, and the case-study kinds that illustrate them.${g.dangling.length ? ` Dangling: ${esc(g.dangling.join(', '))}` : ''}</div>
    ${Object.entries(byTrack).map(([t, ns]) => `<div class="card"><h2>${esc(t)}</h2>${ns.map((n) => `<div class="kn-node"><b>${esc(n.title)}</b> <span class="muted">${esc(n.level)}</span><div class="muted">${edgesOf(n.id).map((e) => `<span class="badge">${esc(e.kind)}: ${esc(e.to)}</span>`).join(' ')}</div></div>`).join('')}</div>`).join('')}`
}

async function renderMemory() {
  const { data: s } = await getJson('/api/knowledge/memory')
  const chips = `<div class="ev-chips"><button data-memclass="" class="${memoryClass ? '' : 'on'}">all classes</button>${s.classes.map((c) => `<button data-memclass="${esc(c.class)}" class="${memoryClass === c.class ? 'on' : ''}">${esc(c.class)} ${c.total}</button>`).join('')}</div><form id="kn-recall" class="row"><input name="q" placeholder="recall… (words that must all appear)" size="36"><button class="btn ghost" type="submit">Recall</button></form><div id="kn-recall-out"></div>`
  if (!memoryClass) return `<div class="ev-note">${esc(s.note)}</div>${chips}<div class="card"><table><tr><th>class</th><th class="num">total</th><th>by status</th></tr>${s.classes.map((c) => `<tr><td><b>${esc(c.class)}</b></td><td class="num">${c.total}</td><td class="muted">${Object.entries(c.byStatus).map(([k, v]) => `${pill(k)} ${v}`).join(' ') || '—'}</td></tr>`).join('')}</table></div>`
  const { data: m } = await getJson(`/api/knowledge/memory?class=${encodeURIComponent(memoryClass)}`)
  return `<div class="ev-note">${esc(m.note)}</div>${chips}${m.entries.length ? `<div class="card"><table><tr><th>when</th><th>record</th><th>title</th><th>status</th><th>label</th><th>source</th></tr>${m.entries.map((e) => `<tr class="${e.record === 'knowledge' ? 'kn-item' : ''}" data-item="${e.record === 'knowledge' ? esc(e.id) : ''}"><td class="muted">${when(e.at)}</td><td>${esc(e.record)}</td><td>${esc(e.title)}<div class="muted">${esc(e.summary)}</div></td><td>${pill(e.status)}</td><td>${pill(e.evidenceLabel)}</td><td>${esc(e.source)}</td></tr>`).join('')}</table></div>` : notEnough(`No ${memoryClass} memories yet.`)}`
}

async function renderDigests() {
  const { data: d } = await getJson('/api/knowledge/digests')
  const list = (title, items) => `<div class="card"><h2>${title}</h2>${items.length ? items.map((x) => `<div><button class="btn ghost" data-digest="${esc(x.id)}">${esc(x.key)}</button> <span class="muted">${when(x.at)}</span></div>`).join('') : '<div class="muted">none stored yet — written when the period ends</div>'}</div>`
  let open = ''
  if (digestId) {
    const { data: g } = await getJson(`/api/knowledge/digest?id=${encodeURIComponent(digestId)}`)
    const sections = (g.sections || []).map((s) => `<div class="card"><h2>${esc(s.heading)} ${pill(s.evidenceLabel)}</h2>${s.lines.map((l) => `<div>· ${esc(l)}</div>`).join('')}<div class="muted sc-prov">source: ${esc(s.source)}</div></div>`).join('')
    const lesson = g.lessonOfTheDay ? `<div class="card"><h2>LESSON OF THE DAY ${pill(g.lessonOfTheDay.evidenceLabel)}</h2><div class="sc-frame"><div class="sc-frame-t">BEFORE</div>${esc(g.lessonOfTheDay.before)}</div><div class="sc-frame"><div class="sc-frame-t">DECISION</div>${esc(g.lessonOfTheDay.decision)}</div><div class="sc-frame"><div class="sc-frame-t">AFTER</div>${esc(g.lessonOfTheDay.after)}</div><div>${esc(g.lessonOfTheDay.teaches)}</div><div class="muted">${g.lessonOfTheDay.doesNotTeach.map(esc).join(' ')}</div></div>` : ''
    open = `<div class="ev-head"><div><div class="ev-title">${esc(g.kind)} — ${esc(g.dayKey || g.weekKey || g.monthKey || '')}</div><div class="muted">${when(g.at)} · engine ${esc(g.engineVersion)}</div></div></div>${(g.notes || []).map((n) => `<div class="ev-note">${esc(n)}</div>`).join('')}${lesson}${sections}${g.doNotTouch ? `<div class="card"><h2>WHAT SHOULD NOT BE TOUCHED</h2>${g.doNotTouch.map((l) => `<div>· ${esc(l)}</div>`).join('')}</div>` : ''}${g.strategies ? `<div class="card"><h2>STRATEGIES</h2><table><tr><th>strategy</th><th class="num">paper n</th><th>band</th><th class="num">mean R</th><th>drift</th><th class="num">experiments</th><th class="num">failures</th><th>would change</th></tr>${g.strategies.map((s) => `<tr><td>${esc(s.strategyId)}${s.enabled ? '' : ' <span class="muted">(disabled)</span>'}</td><td class="num">${s.paper.n}</td><td>${esc(s.paper.band)}</td><td class="num">${s.paper.meanR === null ? '—' : `${fx(s.paper.meanR)}R`}</td><td class="muted">${esc(s.drift)}</td><td class="num">${s.experiments.total}</td><td class="num">${s.failures}</td><td class="muted">${esc(s.wouldChange)}</td></tr>`).join('')}</table></div>` : ''}`
  }
  return `<div class="ev-note">${esc(d.note)}</div><div class="row"><a class="btn ghost" href="/api/knowledge/digest/today" target="_blank" rel="noopener">Today (assembled now)</a><a class="btn ghost" href="/api/knowledge/research-week" target="_blank" rel="noopener">This week's research review (now)</a><a class="btn ghost" href="/api/knowledge/audit" target="_blank" rel="noopener">Model audit (now)</a></div>${list('Daily learning digests', d.daily)}${list('Weekly research reviews', d.weekly)}${list('Monthly model audits', d.monthly)}${open}`
}

async function renderView() {
  const out = document.getElementById('knowledge-out')
  const status = document.getElementById('knowledge-status')
  if (!out) return
  try {
    let html = ''
    switch (view) {
      case 'vault': html = await renderVault(); break
      case 'passport': html = await renderPassport(); break
      case 'brief': html = await renderBrief(); break
      case 'eod': html = await renderEod(); break
      case 'weekly': html = await renderWeekly(); break
      case 'graph': html = await renderGraph(); break
      case 'memory': html = await renderMemory(); break
      case 'digests': html = await renderDigests(); break
    }
    out.innerHTML = html
    if (status) status.textContent = `updated ${new Date().toLocaleTimeString()}`
  } catch (e) {
    out.innerHTML = `<div class="plain">Couldn't load the vault: ${esc(e.message)}. Showing nothing rather than making something up.</div>`
    if (status) status.textContent = 'failed'
  }
}
function renderShell() {
  const nav = document.getElementById('knowledge-views')
  if (nav) nav.innerHTML = VIEWS.map(([id, l]) => `<button data-view="${id}" class="${id === view ? 'on' : ''}">${l}</button>`).join('')
}
async function loadKnowledge() { renderShell(); await renderView() }

document.addEventListener('click', async (e) => {
  const b = e.target.closest('#knowledge-views button[data-view]')
  if (b) { view = b.dataset.view; await loadKnowledge(); return }
  const k = e.target.closest('#tab-knowledge [data-kind]'); if (k) { kindFilter = k.dataset.kind; await loadKnowledge(); return }
  const st = e.target.closest('#tab-knowledge [data-status]'); if (st) { statusFilter = st.dataset.status; await loadKnowledge(); return }
  const sg = e.target.closest('#tab-knowledge [data-strategy]'); if (sg) { strategy = sg.dataset.strategy; await loadKnowledge(); return }
  const mc = e.target.closest('#tab-knowledge [data-memclass]'); if (mc) { memoryClass = mc.dataset.memclass; await loadKnowledge(); return }
  const dg = e.target.closest('#tab-knowledge [data-digest]'); if (dg) { digestId = dg.dataset.digest; await loadKnowledge(); return }
  const it = e.target.closest('#tab-knowledge [data-item]'); if (it && it.dataset.item) { await showItem(it.dataset.item).catch((err) => { document.getElementById('knowledge-out').innerHTML = `<div class="plain">${esc(err.message)}</div>` }); return }
  if (e.target.closest('#kn-back')) { await loadKnowledge(); return }
  const rv = e.target.closest('#tab-knowledge [data-review]')
  if (rv) {
    const outcome = rv.dataset.review
    const note = prompt(`${outcome}: note for the record`) || ''
    const body = outcome === 'REVISED' ? prompt('New body (the old one is kept in history):') : undefined
    if (outcome === 'REVISED' && !body) return
    try { await postJson('/api/knowledge/review', { id: rv.dataset.id, outcome, note, body }); await showItem(rv.dataset.id) } catch (err) { alert(err.message) }
    return
  }
  if (e.target.closest('#kn-reassess')) { const out = document.getElementById('kn-action-out'); try { const r = await postJson('/api/knowledge/reassess', {}); if (out) out.textContent = r.note } catch (err) { if (out) out.textContent = err.message } await loadKnowledge(); return }
  if (e.target.closest('#kn-backfill')) { const out = document.getElementById('kn-action-out'); try { const r = await postJson('/api/knowledge/backfill', {}); if (out) out.textContent = r.note } catch (err) { if (out) out.textContent = err.message } await loadKnowledge(); return }
})

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'kn-note') return
  e.preventDefault()
  const f = new FormData(e.target)
  const out = document.getElementById('kn-note-out')
  // A bare date means the start of that day in New York, where the desk keeps time.
  const day = String(f.get('watchAt') || '')
  const watchAt = day ? Date.parse(`${day}T09:30:00-05:00`) : undefined
  try {
    const it = await postJson('/api/knowledge/note', { title: f.get('title'), body: f.get('body'), market: f.get('market'), source: f.get('source'), watchAt })
    if (out) out.textContent = `Remembered — ${it.status}, ${it.evidenceLabel}${day ? `, back for review ${day}` : ''}.`
    e.target.reset()
    setTimeout(() => { loadKnowledge() }, 900)
  } catch (err) { if (out) out.textContent = err.message }
})

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'kn-recall') return
  e.preventDefault()
  const q = new FormData(e.target).get('q') || ''
  const out = document.getElementById('kn-recall-out')
  try { const { data } = await getJson(`/api/knowledge/recall?q=${encodeURIComponent(q)}`); out.innerHTML = `<div class="ev-note">${esc(data.note)}</div>${data.entries.map((r) => `<div>${pill(r.class)} ${esc(r.title)} <span class="muted">${esc(r.record)} · ${pill(r.status)} · ${when(r.at)}</span><div class="muted">${esc(r.summary)}</div></div>`).join('')}` } catch (err) { out.textContent = err.message }
})

document.getElementById('btn-knowledge')?.addEventListener('click', () => loadKnowledge())
window.loadKnowledge = loadKnowledge
