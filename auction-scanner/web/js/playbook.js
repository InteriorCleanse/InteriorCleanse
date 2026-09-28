// The Playbook: the guides, with a checklist that remembers your ticks on this device.
import { getJson, postJson, esc, store } from './api.js'
import { loading, errorStrip } from './ui.js'

const LEVEL = { start: ['go', 'Start here'], next: ['', 'Next'], later: ['wait', 'Later'] }
let cache = null
const ORDER = { start: 0, next: 1, later: 2 }
const STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'the District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' }

/** The guide's level for this member: renting is the goal, so the rental guide is a start-here guide. */
function levelFor(g, goal) {
  return goal === 'rental' && g.id === 'rental-company' ? 'start' : g.level
}

function guideHtml(g, homeState) {
  const ticks = store('gavel-check-' + g.id) || {}
  const stateName = homeState && STATES[homeState]
  const stateNote = g.id === 'dealer-licence' && stateName ? `<div class="strip wait">You are in <b>${esc(stateName)}</b>. The yearly limit and the licence steps are ${esc(stateName)} law: search "dealer license" on ${esc(stateName)}'s motor vehicle agency site for the exact number.</div>` : ''
  return `<div class="head"><div><a href="#playbook" class="mono">← All guides</a><h1 style="margin-top:6px">${esc(g.title)}</h1><p>${esc(g.tagline)} · about ${g.minutes} min</p></div></div>
    ${stateNote}<div class="panel">${g.sections.map((s) => `<div class="section"><h3>${esc(s.title)}</h3>${s.body ? `<p>${esc(s.body)}</p>` : ''}${s.steps ? `<ol>${s.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}${s.tip ? `<div class="tipbox"><span class="k mono">Tip</span> ${esc(s.tip)}</div>` : ''}${s.warning ? `<div class="warnbox"><span class="k mono">Warning</span> ${esc(s.warning)}</div>` : ''}</div>`).join('')}</div>
    <div class="panel"><h2>Checklist</h2><ul class="check">${g.checklist.map((c, i) => `<li><input type="checkbox" id="ck-${i}" data-ck="${i}" ${ticks[i] ? 'checked' : ''} /><label for="ck-${i}">${esc(c)}</label></li>`).join('')}</ul><p class="dim" style="margin-top:8px;font-size:14px">Ticks are saved on this device only.</p></div>`
}

export async function render(el, ctx, [id]) {
  if (!cache) {
    el.innerHTML = `<div class="head"><h1>Playbook</h1></div>${loading('Loading…')}`
    try { cache = (await getJson('/api/playbook')).guides } catch (e) { el.innerHTML += errorStrip(e.message); return }
  }
  const g = id && cache.find((x) => x.id === id)
  if (g) {
    el.innerHTML = guideHtml(g, ctx.me.homeState)
    postJson('/api/guides/read', { id: g.id }).catch(() => {}) // ticks it off on Home
    el.querySelectorAll('[data-ck]').forEach((c) => c.addEventListener('change', () => {
      const ticks = store('gavel-check-' + g.id) || {}
      ticks[c.dataset.ck] = c.checked
      store('gavel-check-' + g.id, ticks)
    }))
    return
  }
  el.innerHTML = `<div class="head"><div><h1>Playbook</h1><p>Everything dumbed down on purpose: buying, going in person, the licence question, flipping, minor fixes, and starting a rental company. Read the "Start here" ones first.</p></div></div>
    <div class="guides">${[...cache].sort((a, b) => ORDER[levelFor(a, ctx.me.goal)] - ORDER[levelFor(b, ctx.me.goal)]).map((x) => { const [tone, word] = LEVEL[levelFor(x, ctx.me.goal)]; const ticks = Object.values(store('gavel-check-' + x.id) || {}).filter(Boolean).length; return `<a class="panel guide" href="#playbook/${esc(x.id)}"><span class="pill lvl ${tone}">${word}</span><h3>${esc(x.title)}</h3><p style="margin:0">${esc(x.tagline)}</p><span class="mono dim">${x.minutes} min · ${ticks}/${x.checklist.length} ticked</span></a>` }).join('')}</div>`
}
