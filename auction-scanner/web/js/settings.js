// Settings: starter rules, sample cars, home, fee overrides, your demand list, sources, VIN decode, account.
import { getJson, postJson, esc, safeUrl } from './api.js'
import { toast, loading, errorStrip } from './ui.js'

export async function render(el, ctx) {
  el.innerHTML = `<div class="head"><div><h1>Settings</h1><p>The rules Starter mode uses, the data you allow, and what is connected.</p></div></div>${loading('Loading…')}`
  let s
  try { s = await getJson('/api/settings') } catch (e) { el.innerHTML += errorStrip(e.message); return }
  const me = ctx.me
  const src = (me.sources || [])
  el.innerHTML = `<div class="head"><div><h1>Settings</h1><p>The rules Starter mode uses, the data you allow, and what is connected.</p></div></div>
    <form id="s-form">
    <div class="panel"><h2>Starter mode rules</h2><p class="dim">Starter mode is on by default in the Feed. These are the rules it applies; every hidden car says which one hid it.</p>
      <div class="grid2">
        <label class="switch"><input type="checkbox" name="cleanTitleOnly" ${s.starter.cleanTitleOnly ? 'checked' : ''} /><span class="track" aria-hidden="true"></span><span>Clean titles only <small class="dim" style="display:block;font-weight:400">Hides salvage, rebuilt, flood, lemon and "not stated".</small></span></label>
        <label class="switch"><input type="checkbox" name="mustRunAndDrive" ${s.starter.mustRunAndDrive ? 'checked' : ''} /><span class="track" aria-hidden="true"></span><span>Must run and drive <small class="dim" style="display:block;font-weight:400">Hides cars the seller does not say run.</small></span></label>
        <label class="f">Most damage allowed <select name="maxDamage">${['none', 'minor', 'moderate', 'severe'].map((d) => `<option value="${d}" ${s.starter.maxDamage === d ? 'selected' : ''}>${d[0].toUpperCase() + d.slice(1)}</option>`).join('')}</select><small>Minor means scratches and dings. Moderate means a repair job.</small></label>
        <label class="f">Price cap ($) <input type="number" name="maxPriceUsd" min="1" step="any" value="${s.starter.maxPriceUsd}" /><small>Cars above this are hidden.</small></label>
        <label class="f">Mileage cap <input type="number" name="maxMileage" min="0" step="any" value="${s.starter.maxMileage}" /></label>
        <label class="f">Oldest model year <input type="number" name="minYear" min="1950" max="2050" value="${s.starter.minYear}" /></label>
      </div></div>
    <div class="panel"><h2>Data</h2>
      <label class="switch"><input type="checkbox" name="allowSample" ${s.allowSample ? 'checked' : ''} /><span class="track" aria-hidden="true"></span><span>Show SAMPLE cars when no source is connected <small class="dim" style="display:block;font-weight:400">Sample cars are not real and are labelled on every card. They never mix with live data.</small></span></label>
      <div class="grid2" style="margin-top:12px"><label class="f">Home state (two letters) <input type="text" name="homeState" maxlength="2" value="${esc(s.homeState || '')}" placeholder="TX" /></label><label class="f">Home ZIP <input type="text" name="homeZip" maxlength="10" value="${esc(s.homeZip || '')}" /></label></div></div>
    <div class="panel"><h2>Buyer fee overrides</h2><p class="dim">Some houses use a sliding scale, so Gavel does not guess. When you have looked the fee up, type the percent here and every plan for that house uses it.</p>
      <div class="grid2">${['ebay', 'carsandbids', 'bat', 'copart', 'iaa', 'manheim', 'adesa', 'acv', 'govdeals', 'local', 'collector'].map((h) => `<label class="f">${esc(h)} (%) <input type="number" name="fee:${h}" min="0" max="30" step="0.5" value="${s.feeOverrides && s.feeOverrides[h] !== undefined ? s.feeOverrides[h] : ''}" placeholder="published" /></label>`).join('')}</div></div>
    <div class="panel"><h2>Your demand list additions</h2><p class="dim">Cars you want a small score bonus for, with the reason. One per line: <code>Make | Model, Model | tier | why</code>. Tier is supercar, enthusiast, holds-value or rental.</p>
      <textarea name="demandExtra" rows="4" placeholder="Toyota | Land Cruiser | holds-value | Sells in days where I live">${esc((s.demandExtra || []).map((d) => `${d.make} | ${d.models.join(', ')} | ${d.tier} | ${d.why}`).join('\n'))}</textarea></div>
    <div class="row" style="margin:12px 0 24px"><button class="btn" type="submit">Save settings</button><span class="dim" id="s-status"></span></div>
    </form>
    <div class="panel"><h2>Sources</h2>${src.map((x) => `<div class="row" style="justify-content:space-between;padding:8px 0;border-bottom:1px dashed var(--ink-3)"><div><b>${esc(x.name)}</b><div class="dim" style="font-size:14px">${esc(x.reason)}</div></div><span class="pill ${x.connected ? 'go' : x.kind === 'api' ? 'wait' : ''}">${x.connected ? 'Connected' : x.kind === 'api' ? 'Not connected' : 'Directory only'}</span></div>`).join('')}</div>
    <div class="panel"><h2>Live bidding</h2><p><span class="pill ${me.liveBidding ? 'wait' : ''}">${me.liveBidding ? 'Switch is on' : 'Off'}</span></p><p>Every bid in Gavel is a <b>PAPER</b> bid unless two things are true at once: the switch <code>GAVEL_LIVE_BIDDING=1</code> is set on the server, and the listing's source can take a bid by API. No connected source can today: eBay's public API is read-only and the other houses publish no API. So the Bid button prepares your number and opens the lot on the auction's own site.</p></div>
    <div class="panel"><h2>AI explainer</h2><p><span class="pill ${me.ai && me.ai.available ? 'go' : ''}">${me.ai && me.ai.available ? 'On' : 'Off'}</span> ${esc(me.ai ? me.ai.reason : '')}</p></div>
    <div class="panel"><h2>Decode a VIN</h2><p class="dim">Free, from the US government's vehicle database. It tells you what the factory built, not the car's history.</p><form id="v-form" class="row"><input type="text" name="vin" maxlength="17" placeholder="17 characters" style="flex:1;min-width:220px;font-family:var(--mono)" aria-label="VIN" /><button class="btn outline" type="submit">Decode</button></form><div id="v-out"></div></div>
    <div class="panel"><h2>Gavel on your phone</h2><p class="dim" style="font-size:14px">Put Gavel on your home screen and it opens like an app, full screen.</p>
      <p id="i-btn-row" hidden><button class="btn" type="button" id="i-btn">Install Gavel</button></p>
      <ul class="fire-steps"><li><b>iPhone:</b> open Gavel in Safari, tap the Share button, then <b>Add to Home Screen</b>.</li><li><b>Android:</b> open Gavel in Chrome, tap the menu (three dots), then <b>Install app</b>. After that, Gavel is in Android's <b>Share</b> list: share a lot page to it and it opens on Import.</li></ul></div>
    <div class="panel"><h2>Alerts on this device</h2><p class="dim" style="font-size:14px">Get a browser notification when the Sniper finds a pick or fires a paper bid, while Gavel is open in a tab.</p><div class="row"><button class="btn outline" type="button" id="n-on">Turn on alerts</button><span class="dim" id="n-state"></span></div></div>
    <div class="panel"><h2>Backup</h2><p class="dim" style="font-size:14px">Your watchlist, paper bids, Sniper targets, alerts, settings, garage, imported lots and sold prices in one file. Keep a copy; restore it here or on another install.</p><div class="row"><a class="btn outline" href="/api/backup" download>Download a backup</a><label class="btn outline" style="cursor:pointer">Restore from a file<input type="file" id="b-file" accept="application/json,.json" hidden /></label></div></div>
    <div class="panel"><h2>Account</h2><p>${esc(me.email)} · ${esc(me.role)}${me.dataDir ? `<br /><span class="mono dim">Data: ${esc(me.dataDir)}</span>` : ''}</p></div>`

  el.querySelector('#s-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const f = new FormData(e.target)
    const num = (k) => { const v = f.get(k); return v === '' || v === null ? undefined : Number(v) }
    const feeOverrides = {}
    for (const [k, v] of f.entries()) if (k.startsWith('fee:') && v !== '') feeOverrides[k.slice(4)] = Number(v)
    const demandExtra = String(f.get('demandExtra') || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [make, models, tier, ...why] = l.split('|').map((x) => x.trim())
      return { make, models: (models || '').split(',').map((m) => m.trim()).filter(Boolean), tier, why: why.join(' | ') }
    })
    const patch = {
      starter: { cleanTitleOnly: f.get('cleanTitleOnly') === 'on', mustRunAndDrive: f.get('mustRunAndDrive') === 'on', maxDamage: f.get('maxDamage'), maxPriceUsd: num('maxPriceUsd'), maxMileage: num('maxMileage'), minYear: num('minYear') },
      allowSample: f.get('allowSample') === 'on',
      homeState: String(f.get('homeState') || '').toUpperCase() || null,
      homeZip: String(f.get('homeZip') || '') || null,
      feeOverrides,
      demandExtra,
    }
    const st = el.querySelector('#s-status')
    try { await postJson('/api/settings', patch); st.textContent = 'Saved.'; toast('Settings saved.') } catch (err) { st.textContent = ''; toast(err.message, 'hot') }
  })
  const nState = el.querySelector('#n-state')
  const showN = () => { nState.textContent = !('Notification' in window) ? 'This browser does not support notifications.' : Notification.permission === 'granted' ? 'On for this device.' : Notification.permission === 'denied' ? 'Blocked in the browser settings for this site.' : 'Off.' }
  showN()
  if (ctx.installPrompt && !matchMedia('(display-mode: standalone)').matches) {
    el.querySelector('#i-btn-row').hidden = false
    el.querySelector('#i-btn').addEventListener('click', async () => {
      const p = ctx.installPrompt
      ctx.installPrompt = null
      el.querySelector('#i-btn-row').hidden = true
      await p.prompt()
    })
  }
  el.querySelector('#n-on').addEventListener('click', async () => { if ('Notification' in window) { await Notification.requestPermission(); showN() } })
  el.querySelector('#b-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    if (!window.confirm('Restore this backup? It replaces your watchlist, paper bids, targets, alerts, settings and garage with the file\'s.')) { e.target.value = ''; return }
    try { const data = JSON.parse(await file.text()); const r = await postJson('/api/backup', data); toast(`Restored: ${r.restored.join(', ') || 'nothing'}.`) } catch (err) { toast(err.message, 'hot') }
    e.target.value = ''
  })
  el.querySelector('#v-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const vin = String(new FormData(e.target).get('vin') || '').trim().toUpperCase()
    const out = el.querySelector('#v-out')
    out.innerHTML = loading('Asking the database…')
    try {
      const d = await getJson('/api/vin/' + encodeURIComponent(vin))
      const rows = [['Year', d.year], ['Make', d.make], ['Model', d.model], ['Trim', d.trim], ['Body', d.bodyClass], ['Engine', d.engine], ['Fuel', d.fuel], ['Drive', d.drive], ['Built in', d.plantCountry]].filter(([, v]) => v)
      out.innerHTML = `<dl class="house" style="margin-top:12px">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${d.errorText ? `<div class="strip wait">${esc(d.errorText)}</div>` : ''}<p class="dim" style="font-size:14px">Now compare this with the listing. A mismatch means walk away.</p>`
    } catch (err) { out.innerHTML = errorStrip(err.message) }
  })
}
