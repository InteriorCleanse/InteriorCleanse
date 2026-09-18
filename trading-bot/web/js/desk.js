/**
 * THE DESK — six agents on one dark surface.
 *
 * Every panel here is a projection of state the engine already produced. This
 * file reads `/api/desk` and draws it. It has no trading logic, no thresholds
 * of its own, and no way to place, size or influence an order — if a number is
 * not in the payload, it is not on the screen.
 *
 * The design rule that matters: a panel that cannot see must LOOK like it
 * cannot see. Dead feeds are dimmed and struck through with what they are
 * waiting on, not quietly shown as zero. A dashboard that looks equally
 * confident whether or not its feeds are alive is worse than no dashboard.
 */

const STATUS = {
  LIVE:    { dot: 'var(--green)', label: 'LIVE' },
  PARTIAL: { dot: 'var(--amber)', label: 'PARTIAL' },
  WAITING: { dot: 'var(--blue)',  label: 'WAITING' },
  BLIND:   { dot: 'var(--red)',   label: 'BLIND' },
}
const PROV = { REAL: 'var(--green)', APPROXIMATE: 'var(--amber)', UNAVAILABLE: 'var(--dim)' }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function agentCard(a) {
  const st = STATUS[a.status] ?? STATUS.BLIND
  const blind = a.status === 'BLIND'
  const age = a.ageSec === null || a.ageSec === undefined ? '' : `${a.ageSec}s`
  const rows = (a.rows || []).map((r) => `
    <div class="desk-row">
      <span class="desk-row-label">${esc(r.label)}</span>
      <span class="desk-row-value"${r.provenance ? ` style="color:${PROV[r.provenance] || 'var(--text)'}"` : ''}>${esc(r.value)}</span>
    </div>`).join('')

  return `
  <div class="desk-card${blind ? ' desk-blind' : ''}">
    <div class="desk-card-head">
      <span class="desk-name"><span class="desk-dot" style="background:${st.dot}"></span>${esc(a.name)}</span>
      <span class="desk-status" style="color:${st.dot}">${esc(st.label)}</span>
    </div>
    <div class="desk-role">${esc(a.role)}</div>
    <div class="desk-headline">${esc(a.headline)}</div>
    <div class="desk-meta">
      <span style="color:${PROV[a.provenance] || 'var(--dim)'}">${esc(a.provenance)}</span>
      ${age ? `<span class="desk-age">${esc(age)} old</span>` : ''}
    </div>
    <div class="desk-rows">${rows}</div>
    <div class="desk-detail">${esc(a.detail)}</div>
    ${a.waitingOn ? `<div class="desk-waiting">WAITING ON — ${esc(a.waitingOn)}</div>` : ''}
  </div>`
}

function render(d) {
  const trustColour = d.floor.trust >= 80 ? 'var(--green)' : d.floor.trust >= 50 ? 'var(--amber)' : 'var(--red)'
  const proven = d.floor.evidence === 'GATES MET'
  return `
  <div class="desk">
    <div class="desk-bar">
      <div>
        <div class="desk-bar-label">FLOOR</div>
        <div class="desk-bar-value">${esc(d.floor.verdict)}</div>
        <div class="desk-bar-detail">${esc(d.floor.verdictDetail)}</div>
      </div>
      <div>
        <div class="desk-bar-label">TRUST</div>
        <div class="desk-bar-value" style="color:${trustColour}">${d.floor.trust}<span class="desk-bar-unit">/100</span></div>
        <div class="desk-bar-detail">${d.floor.blind.length ? `blind: ${esc(d.floor.blind.join(', '))}` : 'every agent can see'} — this is how much of the desk is reading something, <b>not</b> a confidence in any trade</div>
      </div>
      <div>
        <div class="desk-bar-label">EVIDENCE</div>
        <div class="desk-bar-value" style="color:${proven ? 'var(--green)' : 'var(--amber)'}">${esc(d.floor.evidence)}</div>
        <div class="desk-bar-detail">${esc(d.floor.evidenceDetail)}</div>
      </div>
      <div>
        <div class="desk-bar-label">MODE</div>
        <div class="desk-bar-value" style="color:var(--blue)">${esc(d.mode)}</div>
        <div class="desk-bar-detail">${d.liveTradingEnabled ? '<b style="color:var(--red)">LIVE TRADING ENABLED</b>' : 'no real money · live path dormant'} · ${esc(d.symbol)} ${esc(d.interval)} · trading day ${esc(d.tradingDay)}</div>
      </div>
    </div>
    <div class="desk-grid">${d.agents.map(agentCard).join('')}</div>
    <div class="desk-foot">The desk reports state. The engine decides, the risk chain vetoes, and nothing on this screen can place, size or shape an order.</div>
  </div>`
}

async function loadDesk() {
  const out = document.getElementById('desk-out')
  const status = document.getElementById('desk-status')
  if (!out) return
  if (status) status.textContent = 'reading the floor…'
  try {
    const r = await fetch('/api/desk')
    const j = await r.json()
    if (!j.ok) throw new Error(j.error || 'the desk could not be read')
    out.innerHTML = render(j.data)
    if (status) status.textContent = `updated ${new Date(j.data.generatedAt).toLocaleTimeString()}`
  } catch (e) {
    out.innerHTML = `<div class="plain">The desk could not be read: ${esc(e.message)}. Nothing is being shown rather than something invented.</div>`
    if (status) status.textContent = 'failed'
  }
}

window.loadDesk = loadDesk
document.getElementById('btn-desk')?.addEventListener('click', loadDesk)
