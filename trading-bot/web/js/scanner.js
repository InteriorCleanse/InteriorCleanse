/**
 * CHART SCANNER — two ways to read a chart, both drawn, both labelled.
 *
 * 1. LIVE PATTERN FINDER (no AI): every watched market's real candles, run
 *    through fixed rules (src/scanner/patterns.ts). Each pattern is drawn on
 *    the chart from the exact points it was found at, with what confirms it
 *    and what cancels it. Reads GET /api/scanner and /api/scanner/market.
 * 2. SCREENSHOT SCAN (AI): upload or paste any chart; the AI returns a fixed
 *    JSON shape and the page draws every box, level and candle marker on your
 *    picture. Sends POST /api/scanner/picture with the page's CSRF token.
 *
 * Neither is a signal. Mr. Cash has not tested these patterns as a trading
 * rule, and nothing here reaches the engine.
 */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const $ = (id) => document.getElementById(id)
const px = (n) => (n == null || !Number.isFinite(n) ? '—' : Math.abs(n) >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : Math.abs(n) >= 1 ? n.toFixed(2) : n.toPrecision(4))
const BIAS = { bull: 'Bullish', bear: 'Bearish', neutral: 'Neutral' }
const STATUS = { forming: 'Forming', confirmed: 'Confirmed', failed: 'Failed', breakout: 'Broke out', breakdown: 'Broke down', active: 'On the chart' }

let list = null, listErr = null, market = null, marketErr = null, focus = null, loadingList = false
let evidence = null, evidenceErr = null, evidenceBusy = false
let pic = { img: null, note: '', busy: false, result: null, error: null, focus: null }

async function getJson(path) { const r = await fetch(path, { credentials: 'same-origin' }); const j = await r.json().catch(() => ({})); if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`); return j.data }

async function loadList() {
  if (loadingList) return
  loadingList = true
  try { list = await getJson('/api/scanner'); listErr = null } catch (e) { listErr = e.message } finally { loadingList = false; render() }
}

async function openMarket(key) {
  focus = null; evidence = null; evidenceErr = null; market = { key, loading: true }; render()
  try { market = await getJson('/api/scanner/market?key=' + encodeURIComponent(key)); marketErr = null } catch (e) { market = null; marketErr = e.message }
  render()
  $('sc-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/* ------------------------------ live chart ------------------------------ */

function chart(m, width) {
  const all = m.candles
  if (!all.length) return '<p class="muted">NOT ENOUGH DATA: no candles yet for this market.</p>'
  // Window: the latest 90 candles, or the span of the pattern you tapped, so shapes are big enough to read.
  const fp = focus ? m.scan.patterns.find((p) => p.id === focus) : null
  const start = Math.max(0, fp ? Math.min(fp.from - 8, all.length - 30) : all.length - 90)
  const cs = all.slice(start)
  const W = Math.round(Math.max(320, Math.min(1100, width || 800))), H = W < 560 ? 280 : 380, padL = 6, padR = 62, padT = 14, padB = 22
  const n = cs.length, step = (W - padL - padR) / n
  let lo = Math.min(...cs.map((c) => c.l)), hi = Math.max(...cs.map((c) => c.h))
  const span = hi - lo || hi * 0.01
  lo -= span * 0.06; hi += span * 0.06
  const X = (i) => padL + (i - start + 0.5) * step, Y = (p) => padT + ((hi - p) / (hi - lo)) * (H - padT - padB)
  const inRange = (p) => p >= lo && p <= hi
  // Lines that begin before the window are cut at its left edge, on the same line.
  const clip = (l) => { if (l.i2 < start) return null; if (l.i1 >= start) return l; const t = (start - l.i1) / (l.i2 - l.i1); return { ...l, i1: start, p1: l.p1 + (l.p2 - l.p1) * t } }
  const pats = m.scan.patterns.filter((p) => p.to >= start)
  const dim = (p) => (focus && focus !== p.id ? ' sc-dim' : '')
  const col = (b) => (b === 'bull' ? 'var(--green)' : b === 'bear' ? 'var(--red)' : 'var(--blue)')
  let g = ''
  // Zones first, under the candles.
  const lastI = start + n - 1
  for (const p of pats) if (p.zone) {
    const y1 = Y(Math.min(hi, p.zone.hi)), y2 = Y(Math.max(lo, p.zone.lo)), from = Math.max(p.from, start)
    if (y2 > y1) g += `<rect class="sc-zone${dim(p)}" x="${X(from) - step / 2}" y="${y1.toFixed(1)}" width="${(X(lastI) - X(from) + step).toFixed(1)}" height="${(y2 - y1).toFixed(1)}" data-pat="${esc(p.id)}"/>`
  }
  // Candles.
  const w = Math.max(1, step * 0.62)
  cs.forEach((c, k) => {
    const up = c.c >= c.o, x = X(start + k)
    g += `<line class="sc-wick ${up ? 'up' : 'dn'}" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${Y(c.h).toFixed(1)}" y2="${Y(c.l).toFixed(1)}"/><rect class="sc-body ${up ? 'up' : 'dn'}" x="${(x - w / 2).toFixed(1)}" y="${Y(Math.max(c.o, c.c)).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, Math.abs(Y(c.o) - Y(c.c))).toFixed(1)}"/>`
  })
  // Pattern lines, points and measured moves.
  for (const p of pats) {
    for (const l0 of p.lines) { const l = clip(l0); if (l) g += `<line class="sc-line${dim(p)}" style="stroke:${col(p.bias)}" x1="${X(l.i1).toFixed(1)}" y1="${Y(l.p1).toFixed(1)}" x2="${X(l.i2).toFixed(1)}" y2="${Y(l.p2).toFixed(1)}" data-pat="${esc(p.id)}"/>` }
    if (p.kind !== 'zone') for (const pt of p.points) if (pt.i >= start && inRange(pt.p)) g += `<circle class="sc-pt${dim(p)}" style="stroke:${col(p.bias)}" cx="${X(pt.i).toFixed(1)}" cy="${Y(pt.p).toFixed(1)}" r="3.5" data-pat="${esc(p.id)}"><title>${esc(p.name)}: ${esc(pt.label)} ${px(pt.p)}</title></circle>`
    if (p.target != null && inRange(p.target) && focus === p.id) g += `<line class="sc-target" x1="${X(Math.max(p.to, start)).toFixed(1)}" x2="${X(lastI).toFixed(1)}" y1="${Y(p.target).toFixed(1)}" y2="${Y(p.target).toFixed(1)}"/><text class="sc-ax" x="${(X(lastI) - 4).toFixed(1)}" y="${(Y(p.target) - 4).toFixed(1)}" text-anchor="end">measured move ${px(p.target)}</text>`
  }
  // Price axis.
  for (let k = 0; k <= 4; k++) { const p = lo + ((hi - lo) * k) / 4; g += `<text class="sc-ax" x="${W - padR + 6}" y="${(Y(p) + 4).toFixed(1)}">${px(p)}</text><line class="sc-grid" x1="${padL}" x2="${W - padR}" y1="${Y(p).toFixed(1)}" y2="${Y(p).toFixed(1)}"/>` }
  const last = cs[n - 1]
  g += `<line class="sc-last" x1="${padL}" x2="${W - padR}" y1="${Y(last.c).toFixed(1)}" y2="${Y(last.c).toFixed(1)}"/><rect class="sc-lasttag" x="${W - padR + 2}" y="${(Y(last.c) - 9).toFixed(1)}" width="${padR - 4}" height="18" rx="4"/><text class="sc-lastt" x="${W - padR + 6}" y="${(Y(last.c) + 4).toFixed(1)}">${px(last.c)}</text>`
  const t0 = new Date(cs[0].t), t1 = new Date(last.t)
  g += `<text class="sc-ax" x="${padL}" y="${H - 6}">${t0.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text><text class="sc-ax" x="${W - padR}" y="${H - 6}" text-anchor="end">${t1.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</text>`
  return `<svg class="sc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(m.label)}: last ${n} hourly candles with ${pats.length} patterns drawn">${g}</svg>`
}

function patternCard(p) {
  return `<button class="sc-pat${focus === p.id ? ' on' : ''}" data-focus="${esc(p.id)}">
    <span class="sc-pat-top"><b>${esc(p.name)}</b><span class="badge sc-b ${p.bias}">${BIAS[p.bias]}</span><span class="badge sc-s">${STATUS[p.status] || esc(p.status)}</span></span>
    <span class="sc-pat-txt">${esc(p.meaning)}</span>
    <span class="sc-pat-rule"><b>Confirms:</b> ${esc(p.confirm)}</span>
    <span class="sc-pat-rule"><b>Cancelled by:</b> ${esc(p.invalidate)}</span>
    ${p.target != null ? `<span class="sc-pat-rule muted">Textbook measured move: ${px(p.target)}. A way to size the pattern, not a forecast.</span>` : ''}
  </button>`
}


async function loadEvidence() {
  if (!market?.key || evidenceBusy) return
  evidenceBusy = true; evidenceErr = null; render()
  try { evidence = await getJson('/api/scanner/evidence?key=' + encodeURIComponent(market.key)) } catch (e) { evidenceErr = e.message } finally { evidenceBusy = false; render() }
}

const LEAN = { long: 'Leaning long', short: 'Leaning short', 'sit out': 'Sit out' }
const signed = (n) => (n > 0 ? '+' + n : String(n))
const pct = (v) => (v == null ? '—' : Math.round(v * 100) + '%')
const atrTxt = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2))

function gauge(score) {
  const at = ((score + 6) / 12) * 100
  return `<div class="pa-gauge" role="img" aria-label="Bias score ${signed(score)} on a scale from minus 6 to plus 6"><div class="pa-track"><span class="pa-zone short"></span><span class="pa-zone sit"></span><span class="pa-zone long"></span></div><i class="pa-mark" style="left:${at.toFixed(1)}%"></i><div class="pa-scale"><span>−6 short</span><span>sit out</span><span>long +6</span></div></div>`
}

function priceAction(pa) {
  if (!pa) return ''
  const b = pa.bias, g = pa.confluence
  const check = (c) => `<li class="pa-check ${c.ok ? 'ok' : 'no'}"><i aria-hidden="true">${c.ok ? '✓' : '·'}</i><b>${esc(c.label)}</b><span>${esc(c.detail)}</span></li>`
  return `<div class="pa-wrap">
    <div class="pa-col">
      <h4 class="sc-h4">Bias score <span class="badge sc-tag">6 readings</span></h4>
      ${b.parts.length ? `<div class="pa-score"><b class="pa-num ${b.lean.replace(' ', '')}">${signed(b.score)}</b><span class="pa-lean ${b.lean.replace(' ', '')}">${LEAN[b.lean]}</span></div>${gauge(b.score)}
      <ul class="pa-parts">${b.parts.map((p) => `<li><span class="pa-v v${p.value}">${p.value > 0 ? '+1' : p.value < 0 ? '−1' : '0'}</span><b>${esc(p.label)}</b><span class="muted">${esc(p.detail)}</span></li>`).join('')}</ul>` : `<p class="muted">${esc(b.text)}</p>`}
      <p class="muted pl-note">${esc(b.note)}</p>
    </div>
    <div class="pa-col">
      <h4 class="sc-h4">Trend · level · signal <span class="badge pa-grade g${g.grade === '—' ? 'x' : g.grade}">${g.grade === '—' ? 'no setup' : 'grade ' + g.grade}</span></h4>
      <p class="pa-text">${esc(g.text)}</p>
      <ul class="pa-checks">${check(g.checks.trend)}${check(g.checks.level)}${check(g.checks.signal)}</ul>
      <p class="muted pl-note">The candlestick-trading method in three questions: is the market trending, is price at a level it has turned at before, and is there a clean candle signal pointing the same way? A: all three. B: two. C: the signal alone, which the method says to pass on.</p>
    </div>
  </div>
  <div class="pa-ev">
    <div class="sc-dhead"><h4 class="sc-h4">What followed these patterns here <span class="badge sc-prov">BACKTEST</span></h4><button class="chip" id="pa-measure" ${evidenceBusy ? 'disabled' : ''}>${evidenceBusy ? 'Measuring…' : evidence ? 'Measure again' : 'Measure on this market'}</button></div>
    ${evidenceErr ? `<p class="pl-err">${esc(evidenceErr)}</p>` : ''}
    ${evidence ? evidenceTable(evidence) : '<p class="muted">Walks this market\'s own history candle by candle and records what price did after every candle pattern, without using any later candle to find it. Compared with every candle, so you can see whether a pattern did anything at all.</p>'}
  </div>`
}

function evidenceTable(e) {
  if (!e.rows.length) return `<p class="muted">${esc(e.note)}</p>`
  const b = e.baseline
  return `<p class="muted">${e.bars} candles from ${esc(e.source)} · move measured ${e.horizon} candles later, in average true ranges · every candle went up ${pct(b.upRate)} of the time (${atrTxt(b.avgMoveAtr)} ATR on average): the bar a pattern has to clear.</p>
    <div class="scroll"><table class="pa-table"><thead><tr><th>Pattern</th><th class="num">Cases</th><th class="num">Went its way</th><th class="num">Avg move</th><th class="num">A/B grade only</th><th>Sample</th></tr></thead><tbody>
    ${e.rows.map((r) => `<tr><td><span class="sc-k ${r.bias}"></span>${esc(r.name)}</td><td class="num">${r.count}</td><td class="num">${pct(r.hitRate)}</td><td class="num">${atrTxt(r.avgMoveAtr)}</td><td class="num">${r.inContext.count ? `${pct(r.inContext.hitRate)} · ${atrTxt(r.inContext.avgMoveAtr)} <span class="muted">(${r.inContext.count})</span>` : '—'}</td><td>${r.status === 'OK' ? '<span class="badge good">enough</span>' : '<span class="badge medium">INSUFFICIENT SAMPLE</span>'}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted pl-note">${esc(e.note)} Data: ${esc(e.provenance)}.</p>`
}

function detail() {
  if (marketErr) return `<div class="card" id="sc-detail"><p class="pl-err">${esc(marketErr)}</p></div>`
  if (!market) return ''
  if (market.loading) return `<div class="card" id="sc-detail"><p class="muted">Reading the candles…</p></div>`
  const s = market.scan
  const shapes = s.patterns.filter((p) => p.kind !== 'zone'), zs = s.patterns.filter((p) => p.kind === 'zone')
  return `<div class="card sc-detail" id="sc-detail">
    <div class="sc-dhead"><h2>${esc(market.label)} <span class="badge sc-prov">${esc(market.provenance)}</span> <span class="muted sc-sub">hourly candles${focus ? ' · zoomed to the pattern' : ''}</span></h2><button class="chip" data-close="1">Close</button></div>
    <p class="sc-sum">${esc(s.summary.text)}</p>
    <div class="sc-chartwrap" id="sc-chartwrap">${chart(market, $('scanner-out')?.clientWidth - 40)}</div>
    <div class="sc-legend"><span><i class="sc-k bull"></i>bullish</span><span><i class="sc-k bear"></i>bearish</span><span><i class="sc-k neutral"></i>neutral</span><span><i class="sc-k zone"></i>support / resistance zone</span><span class="muted">Tap a pattern to single it out.</span></div>
    ${priceAction(market.priceAction)}
    <h4 class="sc-h4">Shapes on the chart</h4>
    <div class="sc-pats">${shapes.length ? shapes.map(patternCard).join('') : '<p class="muted">No textbook pattern stands out on this market right now. That is a normal answer.</p>'}</div>
    ${zs.length ? `<h4 class="sc-h4">Zones where price keeps turning</h4><div class="sc-pats">${zs.map(patternCard).join('')}</div>` : ''}
    <p class="muted pl-note">${esc(market.note)} Data: ${esc(market.feed)}.</p>
  </div>`
}


function glance() {
  if (!list?.markets?.length) return ''
  const ready = list.markets.filter((m) => m.bias?.ready)
  if (!ready.length) return ''
  const top = [...ready].sort((a, b) => Math.abs(b.bias.score) - Math.abs(a.bias.score)).slice(0, 6)
  return `<div class="pa-glance" aria-label="Markets by bias score"><span class="pa-glance-k">At a glance</span>${top.map((m) => `<button class="pa-chip ${m.bias.lean.replace(' ', '')}" data-key="${esc(m.key)}"><b>${esc(m.label)}</b><span>${signed(m.bias.score)}</span></button>`).join('')}</div>`
}

function marketsGrid() {
  if (listErr) return `<p class="pl-err">${esc(listErr)}</p>`
  if (!list) return '<p class="muted">Scanning the watched markets…</p>'
  if (!list.markets.length) return '<p class="muted">No markets on the watchlist yet.</p>'
  return `<div class="sc-grid">${list.markets.map((m) => `<button class="sc-mkt${market?.key === m.key ? ' on' : ''}" data-key="${esc(m.key)}">
      <span class="sc-mkt-top"><b>${esc(m.label)}</b><span class="muted">${px(m.price)}</span></span>
      <span class="sc-mkt-mid"><span class="sc-trend ${m.trend}">${esc(m.trend)}</span>${m.summary.bull ? `<span class="badge sc-b bull">${m.summary.bull} bull</span>` : ''}${m.summary.bear ? `<span class="badge sc-b bear">${m.summary.bear} bear</span>` : ''}${m.summary.neutral ? `<span class="badge sc-b neutral">${m.summary.neutral} neutral</span>` : ''}</span>
      ${m.bias?.ready ? `<span class="sc-mkt-lean"><span class="pa-lean ${m.bias.lean.replace(' ', '')}">${LEAN[m.bias.lean]} ${signed(m.bias.score)}</span>${m.grade && m.grade !== '—' ? `<span class="badge pa-grade g${m.grade}">setup ${m.grade}</span>` : ''}</span>` : ''}
      <span class="sc-mkt-names">${m.names.slice(0, 2).map((x) => esc(x.name)).join(' · ') || '<span class="muted">nothing stands out</span>'}</span>
      <span class="sc-mkt-prov">${esc(m.provenance)}</span>
    </button>`).join('')}</div>`
}

/* ------------------------------ screenshot scan ------------------------------ */

function picOverlay(r) {
  const col = (b) => (b === 'bull' ? 'var(--green)' : b === 'bear' ? 'var(--red)' : 'var(--blue)')
  const dim = (id) => (pic.focus && pic.focus !== id ? ' sc-dim' : '')
  let svg = '', tags = ''
  r.levels.forEach((l, i) => {
    const id = 'L' + i, c = l.kind === 'support' ? 'var(--green)' : l.kind === 'resistance' ? 'var(--red)' : l.kind === 'gap' ? 'var(--purple)' : 'var(--amber)'
    if (l.kind === 'gap' && l.y2 != null) svg += `<rect class="sp-gap${dim(id)}" x="0" width="1" y="${Math.min(l.y, l.y2)}" height="${Math.abs(l.y2 - l.y)}" style="fill:${c}"/>`
    else svg += `<line class="sp-lvl${dim(id)}" x1="0" x2="1" y1="${l.y}" y2="${l.y}" style="stroke:${c}"/>`
    tags += `<span class="sp-tag lvl${dim(id)}" style="top:${(l.y * 100).toFixed(2)}%;border-color:${c}" data-pfocus="${id}">${esc(l.kind)}${l.price ? ' ' + esc(l.price) : ''}</span>`
  })
  r.patterns.forEach((p, i) => {
    const id = 'P' + i, b = p.box
    svg += `<rect class="sp-box${dim(id)}" x="${b.x0}" y="${b.y0}" width="${Math.max(0.005, b.x1 - b.x0)}" height="${Math.max(0.005, b.y1 - b.y0)}" style="stroke:${col(p.bias)}"/>`
    tags += `<span class="sp-tag box${dim(id)}" style="left:${(b.x0 * 100).toFixed(2)}%;top:${(b.y0 * 100).toFixed(2)}%;background:${col(p.bias)}" data-pfocus="${id}">${i + 1}. ${esc(p.name)}</span>`
  })
  r.candles.forEach((k, i) => {
    const id = 'C' + i
    tags += `<span class="sp-dot${dim(id)}" style="left:${(k.x * 100).toFixed(2)}%;top:${(k.y * 100).toFixed(2)}%;border-color:${col(k.bias)}" data-pfocus="${id}" title="${esc(k.name)}"></span>`
  })
  return `<div class="sp-stage"><img src="${pic.img}" alt="Your chart screenshot"><svg class="sp-ov" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">${svg}</svg>${tags}</div>`
}

function picResult(r) {
  const plan = r.plan
  return `<div class="sp-res">
    <div class="sp-cols">
      <div>${picOverlay(r)}<p class="muted pl-note">Boxes, lines and dots are drawn where the AI placed them on your picture. Tap any of them, or an item on the right, to single it out.</p></div>
      <div class="sp-side">
        <div class="sp-head"><span class="badge sc-prov">AI READ OF A PICTURE</span><span class="badge sc-conf ${r.confidence}">${esc(r.confidence)} confidence</span></div>
        <h3>${esc(r.symbol || 'Unlabelled chart')}${r.timeframe ? ` · ${esc(r.timeframe)}` : ''} <span class="sc-trend ${r.trend}">${esc(r.trend)}</span></h3>
        <p>${esc(r.summary)}</p>
        ${r.patterns.length ? `<h4 class="sc-h4">Patterns</h4>${r.patterns.map((p, i) => `<button class="sc-pat${pic.focus === 'P' + i ? ' on' : ''}" data-pfocus="P${i}"><span class="sc-pat-top"><b>${i + 1}. ${esc(p.name)}</b><span class="badge sc-b ${p.bias}">${BIAS[p.bias]}</span><span class="badge sc-s">${STATUS[p.status]}</span></span><span class="sc-pat-txt">${esc(p.meaning)}</span><span class="sc-pat-rule"><b>Confirms:</b> ${esc(p.confirm)}</span><span class="sc-pat-rule"><b>Cancelled by:</b> ${esc(p.invalidate)}</span></button>`).join('')}` : ''}
        ${r.levels.length ? `<h4 class="sc-h4">Levels</h4><ul class="tk-list">${r.levels.map((l, i) => `<li data-pfocus="L${i}"><b>${esc(l.kind)}</b> ${l.price ? esc(l.price) : '<span class="muted">price not readable</span>'}${l.note ? ` · ${esc(l.note)}` : ''}</li>`).join('')}</ul>` : ''}
        ${r.candles.length ? `<h4 class="sc-h4">Candles</h4><ul class="tk-list">${r.candles.map((k, i) => `<li data-pfocus="C${i}"><b>${esc(k.name)}</b> · ${esc(k.note)}</li>`).join('')}</ul>` : ''}
        <h4 class="sc-h4">Plan</h4>
        <div class="sp-plan ${plan.stance}"><b>${plan.stance === 'no-trade' ? 'No trade' : plan.stance === 'long' ? 'Long idea' : 'Short idea'}</b>${plan.stance !== 'no-trade' ? `<span>Entry ${esc(plan.entry ?? '—')} · Stop ${esc(plan.stop ?? '—')} · Target ${esc(plan.target ?? '—')}${plan.rr ? ` · about ${plan.rr} : 1` : ''}</span>` : ''}<span class="muted">${esc(plan.why)}</span></div>
        ${r.invalidation ? `<p><b>Wrong if:</b> ${esc(r.invalidation)}</p>` : ''}
        ${r.unreadable.length ? `<p class="muted"><b>Could not read:</b> ${r.unreadable.map(esc).join('; ')}</p>` : ''}
        <p class="muted"><b>Why ${esc(r.confidence)} confidence:</b> ${esc(r.confidenceWhy)}</p>
        <p class="muted pl-note">${esc(r.note)} Cost about $${r.costUsd}.</p>
      </div>
    </div>
  </div>`
}

function picCard() {
  return `<div class="card sc-pic"><h2>Scan a screenshot <span class="badge sc-tag">AI</span></h2>
    <p class="muted" style="margin-top:0">Drop, paste or choose a chart image from any app. The AI marks it up: patterns boxed, levels drawn, candles pinned, and a plan or an honest "no trade". It uses your Anthropic key.</p>
    <label class="sp-drop" id="sp-drop"><input type="file" id="sp-file" accept="image/png,image/jpeg,image/gif,image/webp" hidden>${pic.img && !pic.result ? `<img src="${pic.img}" alt="Chart to scan">` : '<span>Drop a chart here, paste it, or <u>choose a file</u></span>'}</label>
    <div class="row sp-actions"><input id="sp-note" type="text" maxlength="300" placeholder="Anything to focus on? (optional)" value="${esc(pic.note)}"><button class="btn" id="sp-go" ${!pic.img || pic.busy ? 'disabled' : ''}>${pic.busy ? 'Scanning… (up to a minute)' : 'Scan it'}</button>${pic.img ? '<button class="chip" id="sp-clear">Clear</button>' : ''}</div>
    ${pic.error ? `<p class="pl-err">${esc(pic.error)}</p>` : ''}
    ${pic.result ? picResult(pic.result) : ''}
  </div>`
}

async function scanPicture() {
  if (!pic.img || pic.busy) return
  pic.busy = true; pic.error = null; pic.result = null; render()
  try {
    // /api/config returns the page settings directly (no { ok, data } wrapper).
    const cfg = await fetch('/api/config', { credentials: 'same-origin' }).then((x) => x.json())
    const r = await fetch('/api/scanner/picture', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-mrcash-csrf': cfg.csrf }, body: JSON.stringify({ image: pic.img, note: pic.note }) })
    const j = await r.json().catch(() => ({}))
    if (!j.ok) pic.error = j.error || 'The scan did not finish.'
    else pic.result = j.data
  } catch (e) { pic.error = e.message } finally { pic.busy = false; render() }
}

function takeFile(file) {
  if (!file || !/^image\/(png|jpeg|gif|webp)$/.test(file.type)) { pic.error = 'Use a PNG, JPEG, GIF or WebP image.'; render(); return }
  if (file.size > 8 * 1024 * 1024) { pic.error = 'That image is over 8 MB. A cropped screenshot works better anyway.'; render(); return }
  const fr = new FileReader()
  fr.onload = () => { pic.img = String(fr.result); pic.result = null; pic.error = null; render() }
  fr.readAsDataURL(file)
}

/* ------------------------------ page ------------------------------ */

function render() {
  const root = $('scanner-out'); if (!root) return
  const note = $('sp-note')?.value
  if (note !== undefined) pic.note = note
  root.innerHTML = `
    <div class="card"><div class="sc-dhead"><h2>Live pattern finder <span class="badge sc-tag">RULES · NO AI</span></h2><button class="chip" id="sc-refresh">${loadingList ? 'Scanning…' : 'Rescan'}</button></div>
      <p class="muted" style="margin-top:0">Every watched market's hourly candles, checked for double tops and bottoms, head and shoulders, triangles, channels, support and resistance, RSI divergence, volume spikes and the candlestick-trading signals: pin bars, engulfing bars, inside bars and fakeys, stars, harami, tweezers, soldiers and crows. Each market gets a bias score and a trend · level · signal grade. Tap one to see it drawn.</p>
      ${glance()}
      ${marketsGrid()}
      ${list ? `<p class="muted pl-note">${esc(list.note)}</p>` : ''}
    </div>
    ${detail()}
    ${picCard()}`
}

function init() {
  const root = $('scanner-out'); if (!root) return
  render()
  root.addEventListener('click', (e) => {
    const k = e.target.closest('[data-key]'); if (k) { openMarket(k.dataset.key); return }
    if (e.target.closest('[data-close]')) { market = null; focus = null; render(); return }
    const f = e.target.closest('[data-focus]') || e.target.closest('.sc-chart [data-pat]')
    if (f) { const id = f.dataset.focus || f.dataset.pat; focus = focus === id ? null : id; render(); return }
    const pf = e.target.closest('[data-pfocus]'); if (pf) { pic.focus = pic.focus === pf.dataset.pfocus ? null : pf.dataset.pfocus; render(); return }
    if (e.target.closest('#sc-refresh')) { loadList(); return }
    if (e.target.closest('#pa-measure')) { loadEvidence(); return }
    if (e.target.closest('#sp-go')) { scanPicture(); return }
    if (e.target.closest('#sp-clear')) { pic = { img: null, note: '', busy: false, result: null, error: null, focus: null }; render() }
  })
  root.addEventListener('change', (e) => { if (e.target.id === 'sp-file') takeFile(e.target.files?.[0]) })
  root.addEventListener('dragover', (e) => { if (e.target.closest('#sp-drop')) e.preventDefault() })
  root.addEventListener('drop', (e) => { if (e.target.closest('#sp-drop')) { e.preventDefault(); takeFile(e.dataTransfer?.files?.[0]) } })
  document.addEventListener('paste', (e) => {
    if ($('tab-scanner')?.classList.contains('hidden')) return
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))
    if (item) takeFile(item.getAsFile())
  })
  const section = $('tab-scanner')
  let last = 0
  const maybe = () => { if (section && !section.classList.contains('hidden') && Date.now() - last > 60_000) { last = Date.now(); loadList() } }
  if (section) new MutationObserver(maybe).observe(section, { attributes: true, attributeFilter: ['class'] })
  maybe()
}

init()
