// First-run setup: four questions, then a Sniper target is hunting for you.
import { getJson, postJson, esc } from './api.js'
import { toast, loading, errorStrip } from './ui.js'

const GOALS = [['rental', 'Start a rental business', 'Find a reliable first car to rent out, and grow from there.'], ['flip', 'Flip cars for profit', 'Buy under the market, fix the small things, sell.'], ['keep', 'Buy a car for me', 'A nice car, well under what it is worth.']]
const SUGGEST = { rental: ['Toyota', 'Honda', 'Tesla'], flip: ['Toyota', 'Lexus', 'Porsche', 'Chevrolet'], keep: [] }

export async function render(el) {
  el.innerHTML = loading('Loading…')
  let catalog
  try { catalog = await getJson('/api/catalog') } catch (e) { el.innerHTML = errorStrip(e.message); return }
  const state = { step: 0, goal: null, homeState: '', budgetUsd: '', makes: new Set() }
  const draw = () => {
    const steps = [
      `<h1>What are you here to do?</h1><p class="lead">This shapes your Home screen and your first Sniper target. You can change it later.</p>
       <div class="choices">${GOALS.map(([k, t, d]) => `<button type="button" class="choice ${state.goal === k ? 'on' : ''}" data-goal="${k}" aria-pressed="${state.goal === k}"><b>${t}</b><span>${d}</span></button>`).join('')}</div>`,
      `<h1>Which state are you in?</h1><p class="lead">Auction rules, taxes and the dealer licence all depend on your state. Two letters.</p>
       <label class="f" style="max-width:220px">Your state <input type="text" id="s-state" maxlength="2" placeholder="TX" value="${esc(state.homeState)}" autocomplete="address-level1" /></label>`,
      `<h1>What is the most you will spend?</h1><p class="lead">On the car itself. Fees, transport and fixes come out of each bid plan, so this is your ceiling, not your target.</p>
       <label class="f" style="max-width:260px">Budget in dollars <input type="number" id="s-budget" min="500" step="any" placeholder="15000" value="${esc(state.budgetUsd)}" inputmode="numeric" /></label>
       <div class="chips" style="margin-top:10px">${[8000, 15000, 25000, 40000, 75000].map((b) => `<button type="button" class="chip" data-budget="${b}">$${b.toLocaleString('en-US')}</button>`).join('')}</div>`,
      `<h1>Which makes do you like?</h1><p class="lead">Tap any. Leave it empty and the Sniper watches every make.${state.goal && SUGGEST[state.goal].length ? ' We picked a few that suit your goal.' : ''}</p>
       <div class="chips wrap">${catalog.makes.map((m) => `<button type="button" class="chip" data-make="${esc(m.make)}" aria-pressed="${state.makes.has(m.make)}">${esc(m.make)}</button>`).join('')}</div>`,
    ]
    const last = state.step === steps.length - 1
    el.innerHTML = `<div class="setup"><div class="mono dim">Setup · step ${state.step + 1} of ${steps.length}</div>
      <div class="bar" aria-hidden="true"><i style="width:${((state.step + 1) / steps.length) * 100}%"></i></div>
      <div class="setup-body">${steps[state.step]}</div>
      <div class="row" style="margin-top:22px">${state.step ? '<button class="btn outline" type="button" id="s-back">Back</button>' : ''}<button class="btn" type="button" id="s-next">${last ? 'Start hunting' : 'Next'}</button><button class="more" type="button" id="s-skip">Skip setup</button></div></div>`
    el.querySelectorAll('[data-goal]').forEach((b) => b.addEventListener('click', () => { state.goal = b.dataset.goal; if (!state.makes.size) SUGGEST[state.goal].forEach((m) => state.makes.add(m)); draw() }))
    el.querySelectorAll('[data-budget]').forEach((b) => b.addEventListener('click', () => { state.budgetUsd = b.dataset.budget; el.querySelector('#s-budget').value = b.dataset.budget }))
    el.querySelectorAll('[data-make]').forEach((b) => b.addEventListener('click', () => { const m = b.dataset.make; if (state.makes.has(m)) state.makes.delete(m); else state.makes.add(m); b.setAttribute('aria-pressed', String(state.makes.has(m))) }))
    const back = el.querySelector('#s-back'); if (back) back.addEventListener('click', () => { state.step--; draw() })
    el.querySelector('#s-skip').addEventListener('click', () => { try { sessionStorage.setItem('gavel-setup-skipped', '1') } catch { /* fine */ } location.hash = '#home' })
    el.querySelector('#s-next').addEventListener('click', async (e) => {
      if (state.step === 0 && !state.goal) { toast('Pick one to continue.', 'hot'); return }
      if (state.step === 1) { const v = el.querySelector('#s-state').value.trim().toUpperCase(); if (v && !/^[A-Z]{2}$/.test(v)) { toast('Two letters, for example TX.', 'hot'); return } state.homeState = v }
      if (state.step === 2) { const v = Number(el.querySelector('#s-budget').value); if (!Number.isFinite(v) || v < 500) { toast('Type a budget of at least $500.', 'hot'); return } state.budgetUsd = String(v) }
      if (!last) { state.step++; draw(); const f = el.querySelector('input'); if (f) f.focus(); return }
      e.target.disabled = true
      try {
        await postJson('/api/onboard', { goal: state.goal, homeState: state.homeState, budgetUsd: Number(state.budgetUsd), makes: [...state.makes], models: [] })
        toast('Set. Your first Sniper target is hunting.')
        location.hash = '#home'
      } catch (err) { toast(err.message, 'hot'); e.target.disabled = false }
    })
  }
  draw()
}
