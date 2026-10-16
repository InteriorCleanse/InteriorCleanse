/**
 * PROP FIRMS — the Market School view for funded-trader challenges.
 *
 * Draws /api/school/prop and its two helpers. Every number comes from the
 * server's rules engine (src/school/propFirm.ts); this file only lays it out.
 * Kestrel teaches and tracks the challenge; it never trades one.
 */
import { getJson, esc } from './api.js'

const st = { template: '', source: 'paper', sizing: 'as-traded', risk: '0.5', since: '', open: 'copilot' }

const money = (n) => (n === null || n === undefined ? '—' : `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`)
const pct = (n, d = 0) => (n === null || n === undefined ? '—' : `${Number(n).toFixed(d)}%`)
const STATUS = { PASSED: 'ok', FAILED: 'bad', 'IN PROGRESS': 'info', 'NOT STARTED': 'idle', 'FUNDED, WITHIN RULES': 'ok' }
const tag = (s) => `<span class="pf-tag pf-${STATUS[s] || 'idle'}"><i></i>${esc(s)}</span>`
const sample = (s) => `<span class="ev-st ${s === 'SMALL SAMPLE' ? 'early' : 'none'}">${esc(s)}</span>`

async function postJson(path, body) {
  const cfg = await getJson('/api/config')
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-mrcash-csrf': cfg.csrf }, body: JSON.stringify(body || {}) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || j.ok === false) throw new Error(j.error || `HTTP ${res.status}`)
  return j.data
}

/** Balance against the floor as a small line chart. SVG attributes only. */
function curve(points, target) {
  if (points.length < 2) return ''
  const W = 640, H = 150, P = 8
  const ys = points.flatMap((p) => [p.balance, p.floor]).concat(target ? [target] : [])
  const lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1
  const x = (i) => P + i / (points.length - 1) * (W - 2 * P)
  const y = (v) => H - P - (v - lo) / span * (H - 2 * P)
  const line = (k) => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join('')
  return `<svg class="pf-curve" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Balance against the loss floor, trade by trade">
    ${target ? `<line class="pf-target" x1="${P}" x2="${W - P}" y1="${y(target).toFixed(1)}" y2="${y(target).toFixed(1)}"/>` : ''}
    <path class="pf-floor" d="${line('floor')}"/><path class="pf-bal" d="${line('balance')}"/></svg>
    <div class="pf-legend"><span class="pf-k-bal">balance</span><span class="pf-k-floor">loss floor</span>${target ? '<span class="pf-k-target">target</span>' : ''}</div>`
}

function phaseBlock(p, rules, i) {
  const r = rules.phases[i]
  const target = r.profitTargetPct === null ? null : rules.accountSize * (1 + r.profitTargetPct / 100)
  const bar = p.targetProgressPct === null ? '' : `<div class="pf-bar" title="${pct(p.targetProgressPct)} of the target"><div style="width:${Math.min(100, p.targetProgressPct).toFixed(1)}%"></div></div>`
  return `<article class="pf-phase">
    <header><b>${esc(p.name)}</b>${tag(p.status)}<span class="pf-dim">${p.trades} trades · ${p.tradingDays} days</span></header>
    <div class="pf-figs">
      <div><span>Balance</span><b>${money(p.balance)}</b></div>
      <div><span>Loss floor</span><b>${money(p.floor)}</b></div>
      <div><span>Target</span><b>${target ? `${pct(p.targetProgressPct)} of ${money(target - rules.accountSize)}` : 'none'}</b>${bar}</div>
      <div><span>Worst day</span><b>${p.worstDayUsePct === null ? 'no daily limit' : `${pct(p.worstDayUsePct)} of limit`}</b></div>
      <div><span>Best-day share</span><b>${p.bestDaySharePct === null ? '—' : pct(p.bestDaySharePct)}</b></div>
    </div>
    ${p.breach ? `<div class="pf-breach"><b>${esc(p.breach.rule.replace('-', ' '))}</b> ${esc(p.breach.detail)}</div>` : ''}
    ${p.waitingOn.length ? `<div class="pf-wait">Target reached; waiting on ${esc(p.waitingOn.join(' and '))}.</div>` : ''}
    ${curve(p.curve, target)}
    ${p.story.length ? `<ol class="pf-story">${p.story.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
  </article>`
}

function rulesTable(rules) {
  const row = (label, f) => `<tr><th>${label}</th>${rules.phases.map((p) => `<td>${f(p)}</td>`).join('')}</tr>`
  return `<table class="pf-rules"><thead><tr><th></th>${rules.phases.map((p) => `<th>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>
    ${row('Profit target', (p) => (p.profitTargetPct === null ? '—' : pct(p.profitTargetPct, 1)))}
    ${row('Daily loss limit', (p) => (p.maxDailyLossPct === null ? 'none' : pct(p.maxDailyLossPct, 1)))}
    ${row('Max loss', (p) => `${pct(p.maxLossPct, 1)} ${p.drawdownMode === 'static' ? 'fixed' : p.drawdownMode === 'trailing-eod' ? 'trailing, end of day' : 'trailing, intraday'}${p.drawdownMode !== 'static' && p.trailStopsAtStart ? ', locks at start' : ''}`)}
    ${row('Min trading days', (p) => p.minTradingDays || '—')}
    ${row('Time limit', (p) => (p.maxCalendarDays === null ? 'none' : `${p.maxCalendarDays} days`))}
    ${row('Consistency', (p) => (p.consistencyMaxDayPct === null ? 'none' : `best day ≤ ${pct(p.consistencyMaxDayPct)}`))}
  </tbody></table><p class="pf-dim">${money(rules.accountSize)} account · day resets ${String(rules.dayResetHour).padStart(2, '0')}:00 ${esc(rules.dayResetTz)}</p>`
}

function rulesEditor(rules) {
  const ph = (p, i) => `<fieldset class="pf-ph"><legend>Phase ${i + 1}</legend>
    <label>Name <input name="name${i}" value="${esc(p.name)}" maxlength="40"></label>
    <label>Target % <input name="target${i}" value="${p.profitTargetPct ?? ''}" inputmode="decimal" placeholder="none"></label>
    <label>Daily loss % <input name="daily${i}" value="${p.maxDailyLossPct ?? ''}" inputmode="decimal" placeholder="none"></label>
    <label>Max loss % <input name="max${i}" value="${p.maxLossPct}" inputmode="decimal"></label>
    <label>Max loss type <select name="mode${i}">${[['static', 'Fixed'], ['trailing-eod', 'Trailing, end of day'], ['trailing-intraday', 'Trailing, intraday']].map(([v, l]) => `<option value="${v}" ${p.drawdownMode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="pf-check"><input type="checkbox" name="lock${i}" ${p.trailStopsAtStart ? 'checked' : ''}> Trailing floor stops at the start</label>
    <label>Min days <input name="days${i}" value="${p.minTradingDays}" inputmode="numeric"></label>
    <label>Time limit (days) <input name="limit${i}" value="${p.maxCalendarDays ?? ''}" inputmode="numeric" placeholder="none"></label>
    <label>Consistency % <input name="cons${i}" value="${p.consistencyMaxDayPct ?? ''}" inputmode="decimal" placeholder="none"></label>
  </fieldset>`
  const phases = rules.phases.concat(rules.phases.length < 3 ? [{ name: '', profitTargetPct: null, maxDailyLossPct: null, maxLossPct: '', drawdownMode: 'static', trailStopsAtStart: false, minTradingDays: 0, maxCalendarDays: null, consistencyMaxDayPct: null }] : [])
  return `<form id="pf-rules" class="pf-editor" autocomplete="off">
    <div class="pf-row"><label>Name <input name="label" value="${esc(rules.label)}" maxlength="60"></label>
    <label>Account size $ <input name="size" value="${rules.accountSize}" inputmode="numeric"></label>
    <label>Day resets at (hour) <input name="hour" value="${rules.dayResetHour}" inputmode="numeric"></label>
    <label>Time zone <input name="tz" value="${esc(rules.dayResetTz)}" placeholder="America/New_York"></label></div>
    ${phases.map(ph).join('')}
    <p class="pf-dim">Leave a phase's max loss empty to drop it. Copy every number from your firm's current rulebook.</p>
    <div class="pf-row"><button class="btn" type="submit">Save my rules</button><button class="btn ghost" type="button" id="pf-reset">Back to the example</button><span id="pf-rules-out" class="pf-dim"></span></div>
  </form>`
}

function readEditor(form) {
  const f = new FormData(form)
  const g = (k) => String(f.get(k) ?? '').trim()
  const phases = []
  for (let i = 0; i < 3; i++) {
    if (!g(`max${i}`)) continue
    phases.push({ name: g(`name${i}`), profitTargetPct: g(`target${i}`) || null, maxDailyLossPct: g(`daily${i}`) || null, maxLossPct: g(`max${i}`), drawdownMode: g(`mode${i}`), trailStopsAtStart: f.get(`lock${i}`) === 'on', minTradingDays: g(`days${i}`) || 0, maxCalendarDays: g(`limit${i}`) || null, consistencyMaxDayPct: g(`cons${i}`) || null })
  }
  return { label: g('label'), accountSize: g('size'), dayResetHour: g('hour'), dayResetTz: g('tz'), phases }
}

// ---------------------------------------------------------------- the challenge copilot

const money2 = (n) => (n === null || n === undefined ? '—' : `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const VERDICT = { GO: 'ok', CAUTION: 'warn', NO: 'bad' }
const LEVEL = { ok: 'ok', warn: 'warn', fail: 'bad' }
const when = (ms) => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const ago = (ms) => { const h = (Date.now() - ms) / 3_600_000; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago` }
const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`

function verdictCard(sizing, check) {
  const size = sizing.tooSmall ? 'No size fits this stop' : `${plural(sizing.size, sizing.unit)} of ${esc(sizing.instrument)}`
  return `<div class="pf-verdict pf-${VERDICT[check.verdict]}">
    <div class="pf-verdict-head"><span class="pf-verdict-word">${esc(check.verdict)}</span><b>${size}</b>${sizing.tooSmall ? '' : `<span>risks ${money2(sizing.actualRiskUsd)} at the stop${sizing.rewardUsd !== null ? ` · about ${money2(sizing.rewardUsd)} at the target` : ''}</span>`}</div>
    <ul class="pf-lines">${check.lines.map((l) => `<li class="pf-${LEVEL[l.level]}"><i></i><b>${esc(l.label)}</b> ${esc(l.detail)}</li>`).join('')}</ul>
    <p class="pf-dim">${esc(sizing.specNote)} Stop distance ${sizing.distance.toLocaleString('en-US', { maximumFractionDigits: 5 })}; ${money2(sizing.lossPerUnit)} lost per ${sizing.unit} at the stop${sizing.rawSize ? `; exact size ${sizing.rawSize}, rounded down` : ''}.</p>
  </div>`
}

function profileForm(c) {
  const p = c.profile
  const kinds = [['futures', 'Futures'], ['forex', 'Forex'], ['cfd', 'CFDs']]
  const opt = (i) => `<option value="${esc(i.id)}" ${p.instrumentId === i.id ? 'selected' : ''}>${esc(i.label)}</option>`
  const val = (v) => (v === null || v === undefined ? '' : esc(String(v)))
  return `<form id="pf-co-profile" class="pf-editor" autocomplete="off">
    <div class="pf-ph">
      <label>What you trade <select name="instrumentId">${kinds.map(([k, l]) => `<optgroup label="${l}">${c.instruments.filter((i) => i.kind === k).map(opt).join('')}</optgroup>`).join('')}</select></label>
      <label>$ per point per ${esc(c.instruments.find((i) => i.id === p.instrumentId)?.unit || 'lot')} (only if your platform differs) <input name="pointValueOverride" value="${val(p.pointValueOverride)}" inputmode="decimal" placeholder="default"></label>
      <label>Commission, round trip $ <input name="commission" value="${val(p.commission)}" inputmode="decimal"></label>
      <label>Risk per trade % <input name="riskPct" value="${val(p.riskPct)}" inputmode="decimal"></label>
      <label>Phase <select name="phaseIndex">${c.rules.phases.map((n, i) => `<option value="${i}" ${p.phaseIndex === i ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <label>Max position size (if your firm has one) <input name="maxSize" value="${val(p.maxSize)}" inputmode="decimal" placeholder="none"></label>
    </div>
    <div class="pf-ph">
      <label>Balance now $ <input name="balance" value="${val(p.balance)}" inputmode="decimal"></label>
      <label>Balance at today's reset $ <input name="dayStartBalance" value="${val(p.dayStartBalance)}" inputmode="decimal"></label>
      <label>Highest balance this phase $ <input name="highWater" value="${val(p.highWater)}" inputmode="decimal"></label>
    </div>
    <div class="pf-row"><button class="btn" type="submit">Save my account</button>${c.profileSaved ? `<button class="btn ghost" type="button" id="pf-co-forget">Forget</button><span class="pf-dim">Saved ${esc(ago(p.updatedAt))}. Loss floor ${money2(c.floor)}.</span>` : '<span class="pf-dim">Nothing saved yet.</span>'}<span id="pf-co-profile-out" class="pf-dim"></span></div>
  </form>`
}

function setupItem(s) {
  return `<li class="pf-setup">
    <header><b>${esc(s.direction.toUpperCase())}</b><span class="pf-dim">${esc(when(s.at))} · Kestrel's ${esc(s.source.toLowerCase())}</span></header>
    <div class="pf-figs"><div><span>Entry</span><b>${money2(s.entry)}</b></div><div><span>Stop</span><b>${money2(s.stop)}</b></div><div><span>Target</span><b>${money2(s.target)}</b></div></div>
    ${s.sizing && s.check ? verdictCard(s.sizing, s.check) : ''}
    <p class="pf-dim">${esc(s.note)}</p>
  </li>`
}

async function renderCopilot() {
  const { data: c } = await getJson('/api/school/prop/copilot')
  const inst = c.instruments.find((i) => i.id === c.profile.instrumentId)
  const rulesNote = c.rules.source === 'saved' ? `Checking against your saved rules: <b>${esc(c.rules.label)}</b>, ${money(c.rules.accountSize)}.` : `Checking against the <b>default example</b> rules. <button class="pf-link" data-pf-open="rules">Enter your firm's rules</button> first so the limits are yours.`
  const news = c.newsRead === null ? '<p class="pf-dim">Kestrel has not read the news calendar yet.</p>' : c.news.length ? `<ul class="pf-lines">${c.news.map((e) => `<li class="pf-warn"><i></i><b>${esc(when(e.time))}</b> ${esc(e.country)} ${esc(e.title)}</li>`).join('')}</ul>` : '<p class="pf-dim">No high-impact releases in the next 24 hours on Kestrel\'s calendar.</p>'
  const setups = !c.profileSaved ? '<p class="pf-dim">Save your account below and pick a Bitcoin instrument. Kestrel\'s setups will then be sized for it here and ring the bell.</p>'
    : !inst?.tracksBtc ? `<p class="pf-dim">Kestrel's setups are on Bitcoin, and you trade ${esc(inst?.label || 'another market')}. Pick Micro Bitcoin futures, Bitcoin futures or a BTCUSD CFD to get them sized. The pre-trade check above works for any market.</p>`
      : c.setups.length ? `<ol class="pf-setups">${c.setups.map(setupItem).join('')}</ol>` : '<p class="pf-dim">No ready setup since you saved your account. They appear here when Kestrel has one.</p>'
  return `<section class="pf-sec">
    <p class="pf-dim"><span class="ev-src paper">PRE-TRADE CHECK</span> ${esc(c.label)}</p>
    <p>${rulesNote}</p>
    <h3>Before every trade</h3>
    <form id="pf-co-check" class="pf-controls" autocomplete="off">
      <label>Direction <select name="direction"><option value="long">Long (buy)</option><option value="short">Short (sell)</option></select></label>
      <label>Entry <input name="entry" inputmode="decimal" size="9" required></label>
      <label>Stop <input name="stop" inputmode="decimal" size="9" required></label>
      <label>Target (optional) <input name="target" inputmode="decimal" size="9"></label>
      <button class="btn" type="submit">Check this trade</button>
    </form>
    <p class="pf-dim">On ${esc(inst?.label || '—')}, risking ${esc(String(c.profile.riskPct))}% (${money2(c.rules.accountSize * c.profile.riskPct / 100)}) per trade. Change it under Your account today.</p>
    <div id="pf-co-out" aria-live="polite"></div>
    <h3>High-impact news</h3>${news}
    <h3>Kestrel setups sized for you</h3>${setups}
    <h3>Your account today</h3>
    <p class="pf-dim">Copy these from your firm's dashboard at the start of each day and after each trade. Kestrel cannot read your platform.</p>
    ${profileForm(c)}
  </section>`
}

const VIEWS = [['copilot', 'Copilot'], ['replay', 'Challenge replay'], ['rules', 'My rules'], ['risk', 'Risk room'], ['practice', 'Practice odds'], ['journey', 'The journey']]

export async function renderProp() {
  const p = new URLSearchParams({ source: st.source, sizing: st.sizing, risk: st.risk })
  if (st.template) p.set('template', st.template)
  if (st.since) p.set('since', st.since)
  const { data } = await getJson(`/api/school/prop?${p}`)
  const rp = data.replay
  const today = data.today
  const replayish = st.open !== 'copilot' && st.open !== 'journey' && st.open !== 'policy'
  const head = `<div class="pf-policy"><b>Kestrel teaches and tracks prop challenges. It does not trade them.</b> You place every order on your firm's platform yourself. <button class="pf-link" data-pf-open="policy">Why</button></div>
    ${today && replayish ? `<div class="pf-today pf-${today.tradesAtRisk !== null && today.tradesAtRisk <= 1 ? 'bad' : 'ok'}"><span>Replay: today on ${esc(rp.rules.phases[rp.reached].name)}</span><b>${esc(today.message)}</b></div>` : ''}
    <form id="pf-controls" class="pf-controls" ${replayish ? '' : 'hidden'}>
      <label>Rules <select name="template"><option value="" ${st.template ? '' : 'selected'}>${data.rulesSource === 'saved' ? 'My rules' : 'Default example'}</option>${data.templates.map((t) => `<option value="${esc(t.id)}" ${st.template === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label>
      <label>Trades <select name="source"><option value="paper" ${st.source === 'paper' ? 'selected' : ''}>Kestrel paper record</option><option value="journal" ${st.source === 'journal' ? 'selected' : ''}>My journal</option></select></label>
      <label ${st.source === 'journal' ? 'hidden' : ''}>Sizing <select name="sizing"><option value="as-traded" ${st.sizing === 'as-traded' ? 'selected' : ''}>As Kestrel sized it</option><option value="risk" ${st.sizing === 'risk' ? 'selected' : ''}>Risk % per trade</option></select></label>
      <label>Risk % <input name="risk" value="${esc(st.risk)}" inputmode="decimal" size="4"></label>
      <label>From <input name="since" type="date" value="${esc(st.since)}"></label>
      <button class="btn" type="submit">Replay</button>
    </form>
    <nav class="pf-views">${VIEWS.map(([id, l]) => `<button data-pf-open="${id}" class="${st.open === id ? 'on' : ''}">${l}</button>`).join('')}</nav>`

  let body = ''
  if (st.open === 'copilot') {
    body = await renderCopilot()
  } else if (st.open === 'replay') {
    body = `<section class="pf-sec"><div class="pf-sum"><span class="ev-src ${rp.provenance === 'PAPER' ? 'paper' : 'sim'}">${esc(rp.provenance)}</span>${sample(rp.sampleStatus)}<b>${esc(rp.summary)}</b></div>
      <p class="pf-dim">${esc(rp.dataNote)} ${rp.approximations.map(esc).join(' ')}</p>
      ${rp.trades ? '' : `<div class="ev-empty"><div class="ev-empty-big">NOT ENOUGH DATA</div><div class="muted">${rp.provenance === 'PAPER' ? 'Kestrel has no closed paper trades in this data folder yet. Run the paper soak, or switch to My journal.' : 'No journal trades with an R-multiple yet. Log your challenge trades in the Journal with entry, stop and exit.'}</div></div>`}
      ${rp.trades ? rp.phases.filter((ph) => ph.status !== 'NOT STARTED').map((ph) => phaseBlock(ph, rp.rules, rp.phases.indexOf(ph))).join('') : ''}
      <h3>The rules this replay used</h3>${rulesTable(rp.rules)}</section>`
  } else if (st.open === 'rules') {
    body = `<section class="pf-sec"><p>Enter your firm's exact rules. The replay, risk room and today's room then hold you to these numbers. ${data.rulesSource === 'saved' ? 'Showing your saved rules.' : 'Showing the default example; nothing is saved yet.'}</p>${rulesEditor(data.rulesSource === 'saved' && !st.template ? data.rules : rp.rules)}</section>`
  } else if (st.open === 'risk') {
    body = `<section class="pf-sec"><p>At <b>${esc(st.risk)}%</b> of ${money(rp.rules.accountSize)} per trade (${money(data.riskRoom[0].riskUsd)} lost on a full stop). Arithmetic, not a forecast.</p>
      <table class="pf-rules"><thead><tr><th>Phase</th><th>Losses to daily limit</th><th>Losses to max loss</th><th>Winners (1R) to target</th><th>Read</th></tr></thead><tbody>
      ${data.riskRoom.map((r) => `<tr><th>${esc(r.phase)}</th><td>${r.lossesToDailyLimit ?? 'no limit'}</td><td>${r.lossesToMaxLoss}</td><td>${r.winnersToTarget ?? '—'}</td><td>${esc(r.verdict)}</td></tr>`).join('')}</tbody></table>
      <p class="pf-dim">Change the risk % above and press Replay. Losing streaks of four to six happen to every method; size so they are survivable.</p></section>`
  } else if (st.open === 'practice') {
    body = `<section class="pf-sec"><p>Plays the first phase thousands of times under numbers <b>you</b> choose. It describes how the rules treat those numbers, not what Kestrel or the market will do.</p>
      <form id="pf-sim" class="pf-controls"><label>Win rate % <input name="win" value="45" inputmode="decimal" size="4"></label><label>Winner size (R) <input name="rr" value="1.5" inputmode="decimal" size="4"></label><label>Risk % <input name="risk" value="${esc(st.risk)}" inputmode="decimal" size="4"></label><label>Trades a day <input name="perDay" value="2" inputmode="numeric" size="3"></label><button class="btn" type="submit">Simulate</button></form>
      <div id="pf-sim-out"></div></section>`
  } else if (st.open === 'journey') {
    body = `<section class="pf-sec"><ol class="pf-journey">${data.journey.map((s, i) => `<li><details ${i === 0 ? 'open' : ''}><summary><span class="pf-stage">${esc(s.stage)}</span><b>${esc(s.title)}</b></summary>
      <p>${esc(s.why)}</p><h4>You do</h4><ul>${s.youDo.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><h4>Kestrel helps</h4><p>${esc(s.kestrelHelps)}</p><h4>Watch out</h4><ul class="pf-warn">${s.watchOut.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details></li>`).join('')}</ol>
      <p><button class="btn ghost" data-concept="prop-rules">Lesson: the rules that fail challenges</button> <button class="btn ghost" data-concept="prop-drawdown">Lesson: trailing drawdown</button> <button class="btn ghost" data-concept="prop-sizing">Lesson: sizing for a challenge</button></p></section>`
  } else if (st.open === 'policy') {
    body = `<section class="pf-sec"><ul class="pf-policy-list">${data.policy.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>`
  }
  return `<div class="pf">${head}${body}</div>`
}

async function rerender() {
  const out = document.getElementById('school-out')
  if (!out) return
  try { out.innerHTML = await renderProp() } catch (e) { out.innerHTML = `<div class="plain">Couldn't load prop firms: ${esc(e.message)}</div>` }
}

document.addEventListener('click', async (e) => {
  const v = e.target.closest('.pf [data-pf-open]')
  if (v) { e.preventDefault(); st.open = v.dataset.pfOpen; await rerender(); return }
  if (e.target.closest('#pf-reset')) {
    e.preventDefault()
    try { await postJson('/api/school/prop/rules', { reset: true }); st.template = ''; await rerender() } catch (err) { const o = document.getElementById('pf-rules-out'); if (o) o.textContent = err.message }
  }
  if (e.target.closest('#pf-co-forget')) {
    e.preventDefault()
    try { await postJson('/api/school/prop/copilot/profile', { reset: true }); await rerender() } catch (err) { const o = document.getElementById('pf-co-profile-out'); if (o) o.textContent = err.message }
  }
})

document.addEventListener('submit', async (e) => {
  if (e.target.id === 'pf-controls') {
    e.preventDefault()
    const f = new FormData(e.target)
    st.template = String(f.get('template') || ''); st.source = String(f.get('source') || 'paper'); st.sizing = String(f.get('sizing') || st.sizing); st.risk = String(f.get('risk') || '0.5'); st.since = String(f.get('since') || '')
    await rerender()
  }
  if (e.target.id === 'pf-rules') {
    e.preventDefault()
    const o = document.getElementById('pf-rules-out')
    try { await postJson('/api/school/prop/rules', { rules: readEditor(e.target) }); st.template = ''; st.open = 'replay'; await rerender() } catch (err) { if (o) o.textContent = err.message }
  }
  if (e.target.id === 'pf-co-profile') {
    e.preventDefault()
    const o = document.getElementById('pf-co-profile-out')
    try { await postJson('/api/school/prop/copilot/profile', { profile: Object.fromEntries(new FormData(e.target)) }); await rerender() } catch (err) { if (o) o.textContent = err.message }
  }
  if (e.target.id === 'pf-co-check') {
    e.preventDefault()
    const out = document.getElementById('pf-co-out')
    try {
      const r = await postJson('/api/school/prop/copilot/check', Object.fromEntries(new FormData(e.target)))
      out.innerHTML = verdictCard(r.sizing, r.check)
    } catch (err) { out.innerHTML = `<div class="err">${esc(err.message)}</div>` }
  }
  if (e.target.id === 'pf-sim') {
    e.preventDefault()
    const out = document.getElementById('pf-sim-out')
    out.innerHTML = '<p class="pf-dim">Simulating…</p>'
    const q = new URLSearchParams(new FormData(e.target))
    if (st.template) q.set('template', st.template)
    try {
      const { data: m } = await getJson(`/api/school/prop/simulate?${q}`)
      const seg = (k, n, l) => `<div class="pf-seg pf-${k}" style="flex-basis:${(n * 100).toFixed(1)}%" title="${l} ${pct(n * 100, 1)}"></div>`
      out.innerHTML = `<div class="pf-stack">${seg('ok', m.passFirstPhase, 'passed')}${seg('bad', m.failDaily, 'daily limit')}${seg('warn', m.failMaxLoss, 'max loss')}${seg('idle', m.unfinished, 'unfinished')}</div>
        <table class="pf-rules"><tbody><tr><th>Passed phase 1</th><td>${pct(m.passFirstPhase * 100, 1)}</td></tr><tr><th>Failed on the daily limit</th><td>${pct(m.failDaily * 100, 1)}</td></tr><tr><th>Failed on max loss</th><td>${pct(m.failMaxLoss * 100, 1)}</td></tr><tr><th>Unfinished after ${m.assumptions.maxTrades} trades</th><td>${pct(m.unfinished * 100, 1)}</td></tr><tr><th>Median trades to pass</th><td>${m.medianTradesToPass ?? '—'}</td></tr></tbody></table>
        <p class="pf-dim"><span class="ev-src sim">SIMULATED</span> ${esc(m.note)}</p>`
    } catch (err) { out.innerHTML = `<div class="err">${esc(err.message)}</div>` }
  }
})
