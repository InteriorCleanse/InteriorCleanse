// The replay player (Phase 17): step or ▶play through the last stored candles
// and see, for each one, exactly what every strategy voted and why, plus the
// fused decision at that moment. Read-only — it takes no trades.

import { getJson, esc, nyTime } from './api.js'

const $ = (id) => document.getElementById(id)

let steps = []
let cursor = 0
let timer = null
let loaded = false

function badge(action) {
  const cls = action === 'BUY' ? 'buy' : action === 'SELL' ? 'sell' : 'hold'
  return `<span class="vote-badge ${cls}">${esc(action)}</span>`
}

function evidenceHtml(evi) {
  if (!evi || !evi.length) return ''
  return '<div class="evi">' + evi.map((e) => `<span class="${e.passed ? 'ok' : 'no'}">${e.passed ? '✓' : '✗'}</span> ${esc(e.step)}: ${esc(e.detail)}`).join('<br>') + '</div>'
}

function drawCandles(idx) {
  const cv = $('replay-canvas')
  if (!cv) return
  const dpr = window.devicePixelRatio || 1
  const w = cv.clientWidth, h = cv.clientHeight
  cv.width = w * dpr; cv.height = h * dpr
  const ctx = cv.getContext('2d')
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, w, h)
  const N = 60
  const from = Math.max(0, idx - N + 1)
  const view = steps.slice(from, idx + 1)
  if (!view.length) return
  let hi = -Infinity, lo = Infinity
  for (const s of view) { hi = Math.max(hi, s.high); lo = Math.min(lo, s.low) }
  const pad = (hi - lo) * 0.08 || 1
  hi += pad; lo -= pad
  const x = (i) => 6 + (i * (w - 12)) / N
  const y = (p) => h - 6 - ((p - lo) / (hi - lo)) * (h - 12)
  const cw = Math.max(2, (w - 12) / N - 2)
  view.forEach((s, i) => {
    const up = s.close >= s.open
    const col = up ? '#3fb950' : '#f85149'
    const cx = x(i) + cw / 2
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(cx, y(s.high)); ctx.lineTo(cx, y(s.low)); ctx.stroke()
    const top = y(Math.max(s.open, s.close)); const bot = y(Math.min(s.open, s.close))
    ctx.fillRect(x(i), top, cw, Math.max(1, bot - top))
    if (i === view.length - 1) { ctx.strokeStyle = '#58a6ff'; ctx.lineWidth = 1.5; ctx.strokeRect(x(i) - 1, top - 1, cw + 2, Math.max(3, bot - top) + 2) }
  })
}

function render() {
  if (!steps.length) return
  cursor = Math.max(0, Math.min(steps.length - 1, cursor))
  const s = steps[cursor]
  $('replay-scrub').value = String(cursor)
  $('replay-status').textContent = `candle ${cursor + 1} / ${steps.length} · ${nyTime(s.time)} · $${s.close.toLocaleString()}`
  drawCandles(cursor)
  const d = s.decision
  const decHtml = d
    ? `<div class="card"><h2>Fused decision: ${esc(d.action)}</h2><div class="plain">Agreement ${d.score}/100 (enter at ${d.enterScore}).</div>${d.confirms && d.confirms.length ? `<div class="plain"><b>Confirms:</b> ${d.confirms.map(esc).join('; ')}</div>` : ''}${d.invalidates && d.invalidates.length ? `<div class="plain"><b>Against / missing:</b> ${d.invalidates.map(esc).join('; ')}</div>` : ''}</div>`
    : ''
  const votes = (s.votes || []).slice().sort((a, b) => b.confidence - a.confidence)
  const votesHtml = `<div class="card"><h2>What each strategy saw</h2>${votes.map((v) => `<div class="vote-row">${badge(v.action)}<div><b>${esc(v.name)}</b> ${v.confidence ? `<span class="muted">(${v.confidence})</span>` : ''}<div class="muted">${esc(v.reason)}</div>${evidenceHtml(v.evidence)}</div></div>`).join('')}</div>`
  $('replay-out').innerHTML = `<canvas id="replay-canvas"></canvas>${decHtml}${votesHtml}`
  // The canvas element was just replaced, so redraw into the new one.
  drawCandles(cursor)
}

function stop() { if (timer) { clearInterval(timer); timer = null } $('replay-play').textContent = '▶ Play' }

function play() {
  if (timer) { stop(); return }
  if (cursor >= steps.length - 1) cursor = 0
  $('replay-play').textContent = '⏸ Pause'
  const speed = Number($('replay-speed').value) || 400
  timer = setInterval(() => {
    if (cursor >= steps.length - 1) { stop(); return }
    cursor++; render()
  }, speed)
}

export async function loadReplay() {
  if (loaded) return
  loaded = true
  $('replay-status').innerHTML = 'downloading a month of candles and replaying the votes…'
  $('replay-out').innerHTML = '<div class="card">Loading the replay… this reruns every strategy over the stored candles, so give it a few seconds.</div>'
  try {
    const r = await getJson('/api/replay/steps?limit=200')
    steps = (r && r.data && r.data.steps) || []
    if (!steps.length) { $('replay-status').textContent = ''; $('replay-out').innerHTML = '<div class="card">No stored candles to replay yet. Let the bot run, or open the Test tab first.</div>'; return }
    cursor = steps.length - 1
    $('replay-scrub').max = String(steps.length - 1)
    render()
  } catch (e) {
    loaded = false
    $('replay-status').textContent = ''
    $('replay-out').innerHTML = `<div class="card" style="border-color:var(--red)"><b>Could not load the replay.</b><div class="muted">${esc(e.message)}</div></div>`
  }
}

function wire() {
  const play$ = $('replay-play'); if (!play$) return
  play$.onclick = play
  $('replay-step-fwd').onclick = () => { stop(); cursor++; render() }
  $('replay-step-back').onclick = () => { stop(); cursor--; render() }
  $('replay-scrub').oninput = (e) => { stop(); cursor = Number(e.target.value); render() }
  window.loadReplay = loadReplay
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire)
else wire()
