/**
 * THE DESK — the crew, on one screen.
 *
 * Design brief, in order of priority:
 *   1. A person who has never traded should understand the top of this screen
 *      in about three seconds. One warm sentence, then one number, then the
 *      track record. Everything else is detail and stays folded away.
 *   2. A panel that cannot see must LOOK like it cannot see — desaturated,
 *      dashed, with what it is waiting on written on it. Never a zero standing
 *      in for "we don't know".
 *   3. Colour carries meaning, not decoration. Each crew member owns one hue so
 *      you learn the desk by shape and colour instead of by reading labels.
 *
 * This file draws `/api/desk` and nothing else. No trading logic, no thresholds
 * of its own, no way to place or shape an order. Every word and number comes
 * from the payload — including his voice lines, which are composed server-side
 * so there is exactly one place they can be got wrong.
 */

const CREW = {
  book:   { hue: 187, glyph: 'M3 12h3l2-5 3 10 3-8 2 3h5' },                       // a tape reading
  tape:   { hue: 262, glyph: 'M4 18V7m0 0 5 5 4-4 7 7M4 7h0' },                    // structure
  signal: { hue: 38,  glyph: 'M13 2 4 14h6l-1 8 9-12h-6z' },                       // the spark
  risk:   { hue: 152, glyph: 'M12 3 4 6v6c0 4 3.5 7.5 8 9 4.5-1.5 8-5 8-9V6z' },   // a shield
  regime: { hue: 206, glyph: 'M3 15a4 4 0 0 1 4-4 5 5 0 0 1 9.5-1.5A3.5 3.5 0 0 1 20 15z' }, // weather
  proof:  { hue: 345, glyph: 'M5 21V9m7 12V3m7 18v-8' },                           // a scoreboard
}

const STATUS_LABEL = { LIVE: 'reading', PARTIAL: 'estimating', WAITING: 'standing by', BLIND: "can't see" }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/* ---------- the trust ring: the one number worth a picture ---------- */
function ring(trust) {
  const R = 52, C = 2 * Math.PI * R
  const hue = trust >= 80 ? 152 : trust >= 50 ? 38 : 4
  return `
  <div class="dk-ring">
    <svg viewBox="0 0 128 128" aria-label="${trust} out of 100 of the desk can see">
      <circle class="dk-ring-track" cx="64" cy="64" r="${R}" />
      <circle class="dk-ring-fill" cx="64" cy="64" r="${R}"
        stroke="hsl(${hue} 85% 58%)"
        stroke-dasharray="${C}" stroke-dashoffset="${C - (C * trust) / 100}" />
    </svg>
    <div class="dk-ring-mid">
      <div class="dk-ring-num" style="color:hsl(${hue} 85% 62%)">${trust}</div>
      <div class="dk-ring-cap">can see</div>
    </div>
  </div>`
}

/* ---------- the evidence strip: how much has actually been earned ---------- */
function evidence(d) {
  // Numbers come from the payload, never from parsing the sentence next to them
  // and never from a total hardcoded here. Both of those were true until the
  // flaw hunt; either one drifts the moment a gate is added or reworded.
  const { met: done, total } = d.floor.gates
  const passed = total > 0 && done >= total
  const pips = total > 0
    ? Array.from({ length: total }, (_, i) => `<span class="dk-pip${i < done ? ' on' : ''}"></span>`).join('')
    : ''
  return `
  <div class="dk-evidence${passed ? ' met' : ''}">
    <div class="dk-evidence-head">
      <span class="dk-evidence-title">Track record</span>
      <span class="dk-evidence-count">${total > 0 ? `${done} of ${total} checks` : 'no checks readable'}</span>
    </div>
    ${pips ? `<div class="dk-pips">${pips}</div>` : ''}
    <p class="dk-evidence-line">${esc(d.voice.evidence)}</p>
  </div>`
}

/* ---------- one crew member ---------- */
function card(a) {
  const c = CREW[a.id] || { hue: 210, glyph: '' }
  const blind = a.status === 'BLIND'
  const live = a.status === 'LIVE'
  const rows = (a.rows || []).map((r) => `
    <div class="dk-row"><span>${esc(r.label)}</span><b>${esc(r.value)}</b></div>`).join('')

  return `
  <article class="dk-card${blind ? ' blind' : ''}" style="--hue:${c.hue}">
    <div class="dk-card-top"></div>
    <header class="dk-card-head">
      <span class="dk-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${c.glyph}"/></svg></span>
      <div class="dk-card-titles">
        <h3>${esc(a.title)}</h3>
        <p>${esc(a.plain)}</p>
      </div>
      <span class="dk-state${live ? ' pulse' : ''}">${esc(STATUS_LABEL[a.status] || a.status)}</span>
    </header>

    ${a.headline === '—'
      ? `<div class="dk-value none">No reading</div>`
      : `<div class="dk-value">${esc(a.headline)}</div>`}
    <p class="dk-say">${esc(a.line)}</p>
    ${a.waitingOn ? `<p class="dk-wait">Waiting on ${esc(a.waitingOn)}</p>` : ''}

    <details class="dk-more">
      <summary>Details</summary>
      <div class="dk-rows">${rows}</div>
      <p class="dk-detail">${esc(a.detail)}</p>
      <p class="dk-prov">${esc(a.provenance === 'REAL' ? 'Read straight from the source' : a.provenance === 'APPROXIMATE' ? 'Estimated from candles, not the live tape' : 'Nothing readable right now')}${a.ageSec === null || a.ageSec === undefined ? '' : ` · ${a.ageSec}s ago`}</p>
    </details>
  </article>`
}

function render(d) {
  return `
  <div class="dk">
    <section class="dk-hero">
      <div class="dk-hero-say">
        <div class="dk-chips">
          <span class="dk-chip paper">${esc(d.mode)} · no real money</span>
          <span class="dk-chip">${esc(d.symbol)} · ${esc(d.interval)}</span>
          <span class="dk-chip">${esc(d.floor.verdict)}</span>
        </div>
        <p class="dk-headline">${esc(d.voice.floor)}</p>
        <p class="dk-sub">${esc(d.voice.trust)}</p>
      </div>
      ${ring(d.floor.trust)}
    </section>

    ${evidence(d)}

    <h2 class="dk-crew-title">The crew <span>six of them, each watching one thing</span></h2>
    <div class="dk-crew">${d.agents.map(card).join('')}</div>

    <p class="dk-foot">He reports what he sees. The engine decides, the safety checks can stop it, and nothing on this screen can place, size or shape an order.</p>
  </div>`
}

async function loadDesk() {
  const out = document.getElementById('desk-out')
  const status = document.getElementById('desk-status')
  if (!out) return
  if (status) status.textContent = 'having a look…'
  try {
    const r = await fetch('/api/desk')
    const j = await r.json()
    if (!j.ok) throw new Error(j.error || 'could not read the desk')
    out.innerHTML = render(j.data)
    out.dataset.spoken = [j.data.voice.floor, j.data.voice.trust, j.data.voice.evidence].join(' ')
    if (status) status.textContent = `updated ${new Date(j.data.generatedAt).toLocaleTimeString()}`
    if (deskVisible()) startDeskRefresh(); else stopDeskRefresh()
  } catch (e) {
    out.innerHTML = `<div class="plain">Couldn't read the desk just now: ${esc(e.message)}. Showing you nothing rather than making something up.</div>`
    if (status) status.textContent = 'failed'
  }
}

/**
 * KEEP IT LIVE, BUT ONLY WHILE SOMEONE IS LOOKING.
 *
 * The desk loaded once and then sat there. Every panel shows how old its reading
 * is, so a screen left open quietly drifted to "300s old" while presenting
 * itself as a live floor — the numbers were honest, the impression was not.
 *
 * It now refreshes on a timer, and stops when the tab is hidden or you navigate
 * away: `/api/desk` is ~5ms, but polling a background tab forever is how a
 * dashboard earns a reputation for melting laptops. A hidden tab resumes with an
 * immediate fetch so it is never showing a stale frame on return.
 */
const REFRESH_MS = 15_000
let timer = null

function deskVisible() {
  const section = document.getElementById('tab-desk')
  return !!section && !section.classList.contains('hidden') && document.visibilityState === 'visible'
}

function stopDeskRefresh() { if (timer) { clearInterval(timer); timer = null } }

function startDeskRefresh() {
  stopDeskRefresh()
  timer = setInterval(() => {
    if (!deskVisible()) { stopDeskRefresh(); return }
    loadDesk()
  }, REFRESH_MS)
}

document.addEventListener('visibilitychange', () => {
  if (deskVisible()) { loadDesk(); startDeskRefresh() } else stopDeskRefresh()
})

window.loadDesk = loadDesk
/** What he'd say if you asked him to read the desk aloud. */
window.deskSpoken = () => document.getElementById('desk-out')?.dataset.spoken || ''
document.getElementById('btn-desk')?.addEventListener('click', loadDesk)
document.getElementById('btn-desk-read')?.addEventListener('click', () => {
  if (window.speakAs) window.speakAs(window.deskSpoken())
})
