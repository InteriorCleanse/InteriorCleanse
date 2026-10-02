// The Sniper: saved hunts with a budget, makes, models and years. It scans, ranks the picks,
// and builds the fire plan for each car. Armed targets fire PAPER bids; nothing is sent to an auction.
import { getJson, postJson, del, esc, money, when, closesText } from './api.js'
import { stub, badges, stamp, toast, loading, errorStrip, sheet, sourceName, carName } from './ui.js'

let catalog = null
const METHOD = { snipe: ['go', 'Snipe in the last seconds'], proxy: ['', 'Proxy bid early'], 'live-lane': ['', 'Pre-bid before the lane'], 'buy-now': ['wait', 'Fixed price'], unknown: ['wait', 'Check the auction'] }

function targetForm(t = {}) {
  const makes = catalog.makes
  const years = []
  for (let y = new Date().getFullYear() + 1; y >= 1990; y--) years.push(y)
  const yearOpts = (sel) => `<option value="">Any</option>${years.map((y) => `<option value="${y}" ${sel === y ? 'selected' : ''}>${y}</option>`).join('')}`
  return `<form id="t-form" class="tform">
    <h2 style="margin-bottom:4px">${t.id ? 'Edit target' : 'New target'}</h2>
    <p class="dim" style="font-size:14px">Pick what you want and the most you will spend. The Sniper does the watching.</p>
    <div class="grid2">
      <label class="f">Name (optional) <input type="text" name="name" maxlength="80" value="${esc(t.name || '')}" placeholder="Weekend Porsche" /></label>
      <label class="f">Cash for one car, all in ($) <input type="number" name="maxBudgetUsd" min="500" step="any" required value="${esc(t.maxBudgetUsd || window.__gavelCash || '')}" /><small>Every pick's number keeps the bid, fee, tax, transport and fixes inside it.</small></label>
    </div>
    <label class="f" style="margin-top:12px">Makes <small>Tap to add. Leave empty for any make.</small></label>
    <div class="chips wrap" id="t-makes">${makes.map((m) => `<button type="button" class="chip" data-make="${esc(m.make)}" aria-pressed="${(t.makes || []).includes(m.make)}">${esc(m.make)}</button>`).join('')}</div>
    <label class="f" style="margin-top:12px">Models <small>Models of the makes you picked. Leave empty for any model, or type your own.</small></label>
    <div class="chips wrap" id="t-models"></div>
    <input type="text" id="t-model-free" placeholder="Add a model by name and press Enter" style="margin-top:8px" aria-label="Add a model by name" />
    <div class="grid2" style="margin-top:12px">
      <label class="f">First year <select name="yearMin">${yearOpts(t.yearMin)}</select></label>
      <label class="f">Last year <select name="yearMax">${yearOpts(t.yearMax)}</select></label>
      <label class="f">Mileage cap <input type="number" name="maxMileage" min="0" step="any" value="${esc(t.maxMileage || '')}" placeholder="Any" /></label>
      <label class="f">States (two letters, comma separated) <input type="text" name="states" value="${esc((t.states || []).join(', '))}" placeholder="Anywhere" /></label>
      <label class="f">Minimum Steal score <input type="number" name="minScore" min="0" max="100" step="any" value="${esc(t.minScore ?? 60)}" /><small>60 is a good deal, 80 is a steal.</small></label>
    </div>
    <div class="row" style="margin-top:12px">
      <label class="switch"><input type="checkbox" name="starterOnly" ${t.starterOnly !== false ? 'checked' : ''} /><span class="track" aria-hidden="true"></span><span>Starter rules only</span></label>
      <label class="switch"><input type="checkbox" name="armed" ${t.armed ? 'checked' : ''} /><span class="track" aria-hidden="true"></span><span>Armed: fire PAPER bids automatically</span></label>
    </div>
    <p class="dim" style="font-size:14px;margin:8px 0 0">Armed means: the moment a pick appears, Gavel records a PAPER bid at the plan's number and alerts you. Nothing is ever sent to an auction from here.</p>
    <div class="row" style="margin-top:14px"><button class="btn" type="submit">${t.id ? 'Save target' : 'Start hunting'}</button><button class="btn outline" type="button" data-close>Cancel</button></div>
  </form>`
}

function wireForm(root, t, onSaved) {
  const selectedModels = new Set(t.models || [])
  const renderModels = () => {
    const picked = [...root.querySelectorAll('[data-make][aria-pressed="true"]')].map((b) => b.dataset.make)
    const suggestions = catalog.makes.filter((m) => picked.includes(m.make)).flatMap((m) => m.models)
    const all = [...new Set([...suggestions, ...selectedModels])]
    const box = root.querySelector('#t-models')
    box.innerHTML = all.length ? all.map((m) => `<button type="button" class="chip" data-model="${esc(m)}" aria-pressed="${selectedModels.has(m)}">${esc(m)}</button>`).join('') : '<span class="dim" style="font-size:14px">Pick a make to see its models, or type one below.</span>'
    box.querySelectorAll('[data-model]').forEach((b) => b.addEventListener('click', () => { const m = b.dataset.model; if (selectedModels.has(m)) selectedModels.delete(m); else selectedModels.add(m); renderModels() }))
  }
  root.querySelectorAll('[data-make]').forEach((b) => b.addEventListener('click', () => { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); renderModels() }))
  root.querySelector('#t-model-free').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const v = e.target.value.trim(); if (v) { selectedModels.add(v); e.target.value = ''; renderModels() } } })
  renderModels()
  root.querySelector('#t-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const f = new FormData(e.target)
    const num = (k) => { const v = f.get(k); return v === '' || v === null ? undefined : Number(v) }
    const body = {
      name: f.get('name') || undefined,
      makes: [...root.querySelectorAll('[data-make][aria-pressed="true"]')].map((b) => b.dataset.make),
      models: [...selectedModels],
      yearMin: num('yearMin'), yearMax: num('yearMax'), maxBudgetUsd: num('maxBudgetUsd'), maxMileage: num('maxMileage'),
      states: String(f.get('states') || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
      minScore: num('minScore'), starterOnly: f.get('starterOnly') === 'on', armed: f.get('armed') === 'on', active: true,
    }
    try { await postJson(t.id ? '/api/sniper/targets/' + encodeURIComponent(t.id) : '/api/sniper/targets', body); onSaved() } catch (err) { toast(err.message, 'hot') }
  })
}

function pickHtml(p) {
  const l = p.card.listing
  const [tone, word] = METHOD[p.fire.method] || METHOD.unknown
  const t = closesText(l)
  return `<article class="tag pick" data-id="${esc(l.id)}">
    ${l.kind === 'SAMPLE' ? '<div class="band">Sample. Not a real car.</div>' : ''}
    <div class="tagbody"><div class="body">
      <div class="mono dim">For ${esc((p.targetNames || [p.targetName]).join(' + '))} · ${p.fit}/100 match${p.named ? ' · the model you asked for, so it comes first' : ''}</div>
      <h3 class="title">${carName(l.title)}</h3>
      <div class="subline mono">${esc([l.mileage ? l.mileage.toLocaleString('en-US') + ' mi' : null, l.location && l.location.state, sourceName(l.source), t && t.text].filter(Boolean).join(' · '))}</div>
      <div class="money"><div><span class="k mono">Price now</span><div class="now">${esc(money(l.currentBidUsd ?? l.buyNowUsd))}</div></div><div><span class="k mono">Never bid above</span><div class="now" style="color:var(--go)">${esc(money(p.fire.maxBidUsd))}</div>${p.plan.feeUnknown ? '<span class="feenote">before the buyer fee: open the plan and type it</span>' : ''}</div></div>
      ${badges(l)}
      <div class="fire"><span class="pill ${tone}">${word}</span>${p.fire.fireAt ? `<span class="mono dim">fire at ${esc(when(p.fire.fireAt))}</span>` : ''}<p style="margin:8px 0 0">${esc(p.fire.why)}</p><ol class="fire-steps">${p.fire.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>
      <div class="actions"><a class="btn sm" href="#plan/${encodeURIComponent(l.id)}">Open the plan</a>${l.kind !== 'SAMPLE' && /^https?:/.test(l.url) ? `<a class="btn outline sm" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">Open the lot ↗</a>` : ''}</div>
    </div>${stub(p.card.score)}</div>
  </article>`
}

export async function render(el, ctx) {
  window.__gavelCash = ctx.me.cashUsd || ''
  el.innerHTML = `<div class="head"><div><h1>Sniper</h1><p>Tell it what you want and the most you will spend. It watches the auctions, ranks the picks, and writes the exact bid plan for each one. Armed targets fire on paper.</p></div><div class="row"><button class="btn" id="sn-new">New target</button><button class="btn outline" id="sn-run">Scan now</button></div></div>${loading('Loading…')}`
  let data
  try { [data, catalog] = await Promise.all([getJson('/api/sniper'), catalog ? Promise.resolve(catalog) : getJson('/api/catalog')]) } catch (e) { el.innerHTML += errorStrip(e.message); return }
  const targets = data.targets
  if (targets.some((t) => t.active) && !data.lastRunAt && !el.dataset.kicked) { el.dataset.kicked = '1'; postJson('/api/sniper/run', {}).then(() => render(el, ctx)).catch(() => {}) }
  el.innerHTML = `<div class="head"><div><h1>Sniper</h1><p>Tell it what you want and the most you will spend. It watches the auctions, ranks the picks, and writes the exact bid plan for each one. Armed targets fire on paper.</p></div><div class="row"><button class="btn" id="sn-new">New target</button><button class="btn outline" id="sn-run">Scan now</button></div></div>
    <div class="strip" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${stamp('Paper', 'hot')}<span>Every bid the Sniper fires is a <b>PAPER</b> bid: recorded here, with the number and the timing, never sent to an auction. You place the real one on the auction's site.</span></div>
    <div class="grid2" style="align-items:start">
      <div class="panel"><h2>Targets (${targets.length})</h2>
        ${targets.length ? `<div class="list">${targets.map((t) => `<div class="item" data-tid="${esc(t.id)}"><div class="main"><b>${esc(t.name)}</b><div class="mono dim">up to ${esc(money(t.maxBudgetUsd))} · ${esc(t.makes.join(', ') || 'any make')} · ${esc(t.models.join(', ') || 'any model')} · ${t.yearMin || t.yearMax ? esc(`${t.yearMin ?? ''}-${t.yearMax ?? ''}`) : 'any year'} · score ≥ ${t.minScore}</div><div class="row" style="margin-top:6px;gap:6px">${t.armed ? '<span class="pill hot">Armed (paper)</span>' : '<span class="pill">Watching</span>'}${t.starterOnly ? '<span class="pill go">Starter rules</span>' : ''}${t.active ? '' : '<span class="pill wait">Paused</span>'}</div></div><div class="row"><button class="btn outline sm" type="button" data-edit>Edit</button><button class="btn outline sm" type="button" data-toggle>${t.active ? 'Pause' : 'Resume'}</button><button class="btn outline sm" type="button" data-remove>Remove</button></div></div>`).join('')}</div>` : `<div class="empty" style="padding:8px 0"><p>No targets yet. Press <b>New target</b>, pick makes, models and years, set your budget, and the Sniper starts watching.</p></div>`}
        <p class="dim" style="font-size:14px;margin-top:10px">Rescans every ${Math.round(data.everyMs / 60000)} minutes while the app runs${data.lastRunAt ? `; last scan ${esc(when(data.lastRunAt))}` : ''}.</p>
      </div>
      <div class="panel"><h2>Alerts${data.unread ? ` (${data.unread} new)` : ''}</h2>
        ${data.alerts.length ? `<div class="list">${data.alerts.slice(0, 12).map((a) => `<div class="item ${a.read ? '' : 'unread'}"><div class="main"><b>${esc(a.title)}</b><div style="font-size:14px">${esc(a.body)}</div><div class="mono dim">${esc(when(a.at))}</div></div>${a.listingId ? `<a class="btn outline sm" href="#plan/${encodeURIComponent(a.listingId)}">Plan</a>` : ''}</div>`).join('')}</div><div class="row" style="margin-top:10px"><button class="btn outline sm" id="sn-read">Mark all read</button></div>` : '<p class="dim">Alerts appear here when a target finds a pick or fires a paper bid.</p>'}
      </div>
    </div>
    <div style="margin-top:20px"><h2 style="margin-bottom:4px">Picks (${data.picks.length})</h2><p class="dim" style="margin:0 0 10px;font-size:14px">Best match first. The match mixes the steal score, how far the price is under your number, and how fresh the listing is.</p>
      ${data.picks.length ? `<div class="feed">${data.picks.map(pickHtml).join('')}</div>` : `<div class="tag empty"><p>${targets.length ? 'No picks yet. Press Scan now, or loosen a target (a lower minimum score, more makes, a bigger budget).' : 'Picks show up here once you have a target.'}</p></div>`}
    </div>`
  const reload = () => render(el, ctx)
  const openForm = (t) => { const close = sheet(targetForm(t || {}), { label: t ? 'Edit target' : 'New target' }); wireForm(document.getElementById('sheet-root'), t || {}, () => { close(); toast(t ? 'Target saved.' : 'Target added. Scanning…'); postJson('/api/sniper/run', {}).catch(() => {}).then(reload) }) }
  el.querySelector('#sn-new').addEventListener('click', () => openForm(null))
  el.querySelector('#sn-run').addEventListener('click', async (e) => { e.target.disabled = true; try { const r = await postJson('/api/sniper/run', {}); toast(`Scanned. ${r.picks.length} pick${r.picks.length === 1 ? '' : 's'}${r.fired ? `, ${r.fired} paper bid${r.fired === 1 ? '' : 's'} fired` : ''}.`); reload() } catch (err) { toast(err.message, 'hot'); e.target.disabled = false } })
  const read = el.querySelector('#sn-read'); if (read) read.addEventListener('click', async () => { await postJson('/api/sniper/alerts/read', {}); reload() })
  el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openForm(targets.find((t) => t.id === b.closest('[data-tid]').dataset.tid))))
  el.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => { const t = targets.find((x) => x.id === b.closest('[data-tid]').dataset.tid); try { await postJson('/api/sniper/targets/' + encodeURIComponent(t.id), { active: !t.active }); reload() } catch (err) { toast(err.message, 'hot') } }))
  el.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => { const id = b.closest('[data-tid]').dataset.tid; if (!window.confirm('Remove this target?')) return; try { await del('/api/sniper/targets/' + encodeURIComponent(id)); reload() } catch (err) { toast(err.message, 'hot') } }))
}
