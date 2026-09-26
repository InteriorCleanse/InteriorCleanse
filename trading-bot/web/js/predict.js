/**
 * THE PREDICTION DESK — the "$50 → $5,273" experiment, on paper, with the score.
 *
 * Reads GET /api/predict (PAPER PREDICTION). Ten minds read every open market
 * on Polymarket and Kalshi; where the council differs from the price by the
 * creator's 8-point line a paper position opens, and it settles only when the
 * venue resolves the market. Nothing here places an order; the desk has no
 * wallet, no key and no execution path.
 */
import { esc } from './api.js'

const $ = (id) => document.getElementById(id)
const pct = (v) => (v == null ? '—' : Math.round(v * 100) + '%')
const cents = (v) => (v == null ? '—' : Math.round(v * 100) + '¢')
const usd = (v) => (v == null ? '—' : (v < 0 ? '−' : '') + '$' + Math.abs(v).toFixed(2))
const signed = (v) => (v == null ? '—' : (v >= 0 ? '+' : '−') + '$' + Math.abs(v).toFixed(2))
const pts = (v) => (v == null ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + ' pts')
const when = (ms) => (ms ? new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')
const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago` }
const VENUE = { polymarket: 'Polymarket', kalshi: 'Kalshi' }

let desk = null, err = null, loading = false, loadedAt = 0, open = new Set()

async function load(force = false) {
  if (loading) return
  loading = true; paint()
  try {
    const r = await fetch('/api/predict' + (force ? '?refresh=1' : ''), { credentials: 'same-origin' })
    const j = await r.json()
    if (!j.ok) throw new Error(j.error || 'The desk did not answer.')
    desk = j.data; err = null; loadedAt = Date.now()
  } catch (e) { err = e.message } finally { loading = false; paint() }
}

function bar(edge) {
  const w = Math.min(50, Math.abs(edge || 0) * 250)
  return `<span class="pd-edge" aria-hidden="true"><i class="${edge >= 0 ? 'yes' : 'no'}" style="width:${w.toFixed(1)}%;${edge >= 0 ? 'left:50%' : `left:${(50 - w).toFixed(1)}%`}"></i><b style="left:${(50 + (desk?.params?.mispricing || 0.08) * 250).toFixed(1)}%"></b><b style="left:${(50 - (desk?.params?.mispricing || 0.08) * 250).toFixed(1)}%"></b></span>`
}

function mindChip(m) {
  const cls = m.status === 'SPOKE' ? (m.lean === 'yes' ? 'yes' : m.lean === 'no' ? 'no' : 'none') : m.status.toLowerCase()
  const val = m.status === 'SPOKE' ? (m.p == null ? `${Math.round(m.confidence * 100)}% sure` : pct(m.p)) : m.status === 'QUIET' ? 'quiet' : 'blind'
  return `<span class="pd-mind ${cls}" title="${esc(m.role)}"><b>${esc(m.name)}</b><span>${esc(val)}</span></span>`
}

function mindDetail(m) {
  return `<li class="pd-md ${m.status.toLowerCase()}"><div class="pd-md-h"><b>${esc(m.name)}</b><span class="muted">${esc(m.role)}</span><em>${m.status === 'SPOKE' ? `${m.p == null ? 'no number' : 'p(YES) ' + pct(m.p)} · ${Math.round(m.confidence * 100)}% sure` : m.status === 'QUIET' ? 'nothing to add' : `BLIND · waiting on ${esc(m.waitingOn || '')}`}</em></div>
    ${m.for.length ? `<ul class="pd-for">${m.for.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}${m.against.length ? `<ul class="pd-against">${m.against.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</li>`
}

function candidate(c, i) {
  const isOpen = open.has(c.key)
  return `<li class="pd-cand ${c.flagged ? 'flagged' : ''} ${isOpen ? 'open' : ''}">
    <button type="button" class="pd-cand-h" data-key="${esc(c.key)}" aria-expanded="${isOpen}">
      <span class="pd-n">${i + 1}</span>
      <span class="pd-q"><a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.question)}</a><small>${esc(VENUE[c.venue] || c.venue)} · ${esc(c.category)} · closes ${when(c.endsAt)} · liquidity $${Math.round(c.liquidity).toLocaleString()}</small></span>
      <span class="pd-nums"><span><small>market</small><b>${pct(c.market)}</b></span><span><small>council</small><b>${pct(c.p)}</b></span><span><small>gap</small><b class="${c.edge >= 0 ? 'pd-yes' : 'pd-no'}">${pts(c.edge)}</b></span></span>
      ${bar(c.edge)}
      <span class="pd-verdict">${c.flagged ? `<span class="badge good">FLAGGED · ${esc(c.side)}</span>` : `<span class="badge low">not flagged</span>`}<small>${esc(c.reasons[0] || '')}</small></span>
      <span class="pd-strip">${c.minds.map(mindChip).join('')}</span>
    </button>
    ${isOpen ? `<div class="pd-cand-b"><ul class="pd-mds">${c.minds.map(mindDetail).join('')}</ul>${c.reasons.length > 1 ? `<p class="muted pd-why">${c.reasons.map(esc).join(' · ')}</p>` : ''}</div>` : ''}
  </li>`
}

function sheet(s) {
  const row = (k, v, cls = '') => `<tr><td>${k}</td><td class="num ${cls}">${v}</td></tr>`
  const st = s.status === 'NOT STARTED' ? '<span class="badge low">NOT STARTED</span>' : s.status === 'TEST COMPLETE' ? '<span class="badge good">TEST COMPLETE · 7 DAYS</span>' : `<span class="badge medium">DAY ${s.day} OF 7</span>`
  return `<div class="card pd-sheet"><h2>The 7-day sheet ${st} <span class="badge sc-prov">PAPER</span></h2>
    <p class="muted" style="margin-top:0">The sheet from the guide, filled in by the desk. A win or a loss counts only after the venue resolves the market; unresolved is open, not a result.${s.startedAt ? ` Started ${when(s.startedAt)}.` : ' It starts on the first successful scan.'}</p>
    <table class="pd-tbl"><thead><tr><th>Track</th><th class="num">Number</th></tr></thead><tbody>
      ${row('Starting paper balance', usd(s.startingBalance))}
      ${row('Simulated positions', `${s.trades} <small>(${s.open} open)</small>`)}
      ${row('Wins', s.wins, 'pd-yes')}${row('Losses', s.losses, 'pd-no')}
      ${row('Largest win', s.largestWin == null ? '—' : signed(s.largestWin), 'pd-yes')}${row('Largest loss', s.largestLoss == null ? '—' : signed(s.largestLoss), 'pd-no')}
      ${row('Ending balance <small>(cash + open positions at the latest mid)</small>', usd(s.endingBalance))}
      ${row('Return', `${s.returnPct >= 0 ? '+' : ''}${s.returnPct.toFixed(2)}%`, s.returnPct >= 0 ? 'pd-yes' : 'pd-no')}
    </tbody></table>
    <div class="pd-rw"><div><h3>What the desk got right</h3>${s.right.length ? `<ul>${s.right.map((r) => `<li><b>${signed(r.pnl)}</b> ${esc(r.question)} <small>${esc(r.said)}</small></li>`).join('')}</ul>` : '<p class="muted">Nothing resolved in its favour yet.</p>'}</div>
    <div><h3>What the desk got wrong</h3>${s.wrong.length ? `<ul>${s.wrong.map((r) => `<li><b>${signed(r.pnl)}</b> ${esc(r.question)} <small>${esc(r.said)}</small></li>`).join('')}</ul>` : '<p class="muted">Nothing resolved against it yet.</p>'}</div></div>
  </div>`
}

function positions(d) {
  if (!d.open.length) return `<div class="card"><h2>Open paper positions <span class="badge sc-prov">PAPER</span></h2><p class="muted">None open. The desk opens one only when the council differs from the price by ${Math.round(d.params.mispricing * 100)} points or more, the book is deep enough, and the spread is tight enough; most scans find nothing, and that is the honest result.</p></div>`
  return `<div class="card"><h2>Open paper positions <span class="badge sc-prov">PAPER</span></h2><div class="scroll"><table class="pd-tbl"><thead><tr><th>Market</th><th>Side</th><th class="num">Paid</th><th class="num">Contracts</th><th class="num">Stake</th><th class="num">Marked now</th><th>Closes</th><th>Status</th></tr></thead><tbody>
    ${d.open.map((p) => { const mid = p.side === 'YES' ? p.lastYes : 1 - p.lastYes; const mark = p.contracts * mid; return `<tr><td><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.question)}</a><br><small class="muted">${esc(VENUE[p.venue] || p.venue)} · opened ${ago(p.openedAt)} · council ${pct(p.pSide)} for ${esc(p.side)} vs market ${pct(p.side === 'YES' ? p.marketYes : 1 - p.marketYes)}</small></td><td><span class="pd-${p.side.toLowerCase()}">${esc(p.side)}</span></td><td class="num">${cents(p.price)}</td><td class="num">${p.contracts.toFixed(2)}</td><td class="num">${usd(p.stake)}</td><td class="num ${mark >= p.stake ? 'pd-yes' : 'pd-no'}">${usd(mark)}</td><td>${when(p.endsAt)}</td><td>${p.awaitingResolution ? '<span class="badge medium">closed · awaiting resolution</span>' : '<span class="badge low">open</span>'}</td></tr>` }).join('')}
  </tbody></table></div><p class="muted pl-note">"Marked now" is the position at the latest mid. It is not a result and it is not counted on the sheet.</p></div>`
}

function resolved(d) {
  if (!d.resolved.length) return ''
  return `<div class="card"><h2>Settled <span class="badge sc-prov">PAPER</span></h2><ul class="fc-logs">${d.resolved.map((p) => `<li class="fc-log ${p.status === 'WON' ? 'right' : 'wrong'}"><time>${when(p.resolvedAt)}</time><b>resolved ${esc(p.outcome)}</b><span>held <span class="pd-${p.side.toLowerCase()}">${esc(p.side)}</span> at ${cents(p.price)} · ${esc(p.question.slice(0, 90))}</span><em class="fc-res ${p.status === 'WON' ? 'right' : 'wrong'}">${p.status} ${signed(p.pnl)}</em></li>`).join('')}</ul></div>`
}

function brain(b, params) {
  return `<div class="card"><h2>The brain: which minds know something <span class="badge sc-prov">PAPER</span></h2>
    <p class="muted" style="margin-top:0">Every mind that gave a number is scored on its own when a market resolves, with the Brier score: 0.25 is a coin flip, and skill is 1 − Brier ÷ 0.25. Each needs ${params.minResolved} resolved positions before its number means anything.</p>
    <div class="pd-brain">${b.minds.map((m) => `<div class="pd-bm ${m.status === 'OK' ? (m.skill > 0 ? 'good' : 'bad') : ''}"><b>${esc(m.name)}</b><small>${esc(m.role)}</small><span><i>${m.n}</i> scored</span><span><i>${m.brier == null ? '—' : m.brier.toFixed(3)}</i> Brier</span><span><i class="${m.skill > 0 ? 'pd-yes' : m.skill < 0 ? 'pd-no' : ''}">${m.skill == null ? '—' : (m.skill > 0 ? '+' : '') + m.skill.toFixed(3)}</i> skill</span>${m.status === 'OK' ? '' : `<em>NOT ENOUGH DATA · ${m.n}/${params.minResolved}</em>`}</div>`).join('')}</div>
    <p class="muted pl-note">${esc(b.note)}</p></div>`
}

function decisions(d) {
  if (!d.decisions.length) return ''
  return `<div class="card"><h2>Every decision, logged</h2><ul class="pd-dec">${d.decisions.map((x) => `<li class="${x.action.toLowerCase()}"><time>${when(x.at)}</time><b>${esc(x.action)}</b><span>${esc(x.question.slice(0, 80))}</span><em>${esc(x.why)}</em></li>`).join('')}</ul></div>`
}

function paint() {
  const root = $('predict-out'); if (!root) return
  if (err && !desk) { root.innerHTML = `<div class="card"><p class="pl-err">${esc(err)}</p></div>`; return }
  if (!desk) { root.innerHTML = '<div class="card"><p class="muted">Opening the desk…</p></div>'; return }
  const d = desk
  const src = d.sources.map((s) => `<span class="pd-src ${s.ok ? 'ok' : 'down'}">${esc(VENUE[s.venue] || s.venue)} ${s.ok ? `· ${s.count} open markets` : `· NOT CONNECTED${s.reason ? ' · ' + esc(s.reason) : ''}`}</span>`).join('')
  const flagged = d.candidates.filter((c) => c.flagged).length
  root.innerHTML = `
  <div class="card pd-hero">
    <div class="rd-kicker">Prediction desk · the "$50 → $5,273" experiment, on paper · <span class="badge sc-prov">PAPER PREDICTION</span></div>
    <h2 class="rd-big">${d.status === 'LIVE' ? `${d.scanned.toLocaleString()} <small>markets read</small>` : esc(d.status)}</h2>
    <p class="rd-line">${d.status === 'LIVE' ? `Ten minds read every open market every ${d.params.everyMinutes} minutes. ${flagged ? `${flagged} of the widest gaps ${flagged === 1 ? 'is' : 'are'} flagged right now.` : 'None of the widest gaps clears the line right now, which is the usual reading of a liquid market.'} ${d.open.length} paper position${d.open.length === 1 ? '' : 's'} open; paper balance ${usd(d.sheet.endingBalance)} from ${usd(d.sheet.startingBalance)}.` : d.status === 'NOT CONNECTED' ? 'Neither venue answered. The desk reads nothing rather than guessing; it retries every ten minutes.' : d.status === 'OFF' ? 'Switched off (MRCASH_PREDICT=0).' : 'Starting up.'}</p>
    <div class="pd-srcs">${src}<span class="pd-src">scan #${d.scans}${d.asOf ? ' · ' + ago(d.asOf) : ''}</span><span class="pd-src">ORACLE mind ${d.oracle === 'on' ? 'on' : 'off'}</span></div>
    <div class="row"><button class="chip" id="pd-refresh" ${loading ? 'disabled' : ''}>${loading ? 'Scanning…' : 'Scan now'}</button></div>
    <p class="muted rd-note">${esc(d.claim)}</p>
  </div>
  ${sheet(d.sheet)}
  <div class="card"><h2>The council: widest gaps between the ten minds and the price</h2>
    <p class="muted" style="margin-top:0">Each row is one market. The bar is the council's distance from the price; the marks are the ${Math.round(d.params.mispricing * 100)}-point line. Open a row to read every mind's evidence for and against. A flag needs the gap, ${Math.round(d.params.minConfidence * 100)}% council confidence, a spread under ${Math.round(d.params.maxSpread * 100)}¢, and $${d.params.minLiquidityUsd.toLocaleString()} of liquidity.</p>
    ${d.candidates.length ? `<ol class="pd-cands">${d.candidates.map(candidate).join('')}</ol>` : '<p class="muted">Nothing read yet.</p>'}
  </div>
  ${positions(d)}
  ${resolved(d)}
  ${brain(d.brain, d.params)}
  ${decisions(d)}
  <div class="card"><h2>How it works, and what will not happen</h2>
    <ol class="pd-how"><li><b>Scan.</b> The open markets on Polymarket and Kalshi, from their public APIs, no keys.</li><li><b>Read.</b> Ten minds, each one angle: the price itself, the favourite–longshot bias, the clock, the day's drift, depth, spread, the headlines, the calendar, whether an event's outcomes add up, and, if you turn it on, a language model with its reasons. Each says what it sees and how sure it is, or says it is quiet or blind.</li><li><b>Council.</b> A confidence-weighted average of the minds that gave a number. The gap to the price is the mispricing.</li><li><b>Paper position.</b> At the creator's ${Math.round(d.params.mispricing * 100)}-point line, sized by a quarter-Kelly at the price a fill would cost, capped at his ${Math.round(d.params.positionCap * 100)}% of bankroll. Logged with the evidence.</li><li><b>Settle.</b> Only when the venue resolves the market. Every mind that spoke is scored.</li></ol>
    <ul class="cd-how"><li>No wallet, no key, no order. The desk cannot trade, and the trading engine never sees it.</li><li>Every rule is hand-set and untested as a trading rule. The scoreboard exists to find out whether any of it knows something; until it does, the honest reading is NOT ENOUGH DATA.</li><li>A paper result is not a promise of a return. Prediction markets carry fees, slippage and the risk that the market is right and the desk is wrong.</li></ul>
    <p class="muted pl-note">${esc(d.note)}</p></div>`
}

function init() {
  const section = $('tab-predict'); if (!section) return
  section.addEventListener('click', (e) => {
    const b = e.target.closest('#pd-refresh'); if (b) { load(true); return }
    const h = e.target.closest('.pd-cand-h')
    if (h && !e.target.closest('a')) { const k = h.dataset.key; if (open.has(k)) open.delete(k); else open.add(k); paint() }
  })
  new MutationObserver(() => { if (!section.classList.contains('hidden') && Date.now() - loadedAt > 60_000) load() }).observe(section, { attributes: true, attributeFilter: ['class'] })
  if (!section.classList.contains('hidden')) load()
  setInterval(() => { if (!section.classList.contains('hidden') && !document.hidden && Date.now() - loadedAt > 120_000) load() }, 30_000)
}

init()
