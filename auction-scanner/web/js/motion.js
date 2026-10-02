// Motion: paper being handled. New tags settle onto the desk one after another,
// their stamps land a beat later, and the numbers count up to their value.
//
// One observer on <main> does it for every screen, so screens only render HTML.
// A card that was already shown on this visit to a screen (a re-render with the
// same content) does not animate again. Nothing moves with reduced motion.
import { reducedMotion } from './api.js'

const CARDS = '.screen > .head, .tag, .panel, .tile.big, .choice, .hgroup'
const NUMBERS = '.stub .n, .tile.big .v, .nextup .bn, .money .now'
const STEP_MS = 45
const MAX_STAGGERED = 7
const COUNT_MS = 720

let seen = new Set()
let lastNever = null

/** A fresh visit to a screen: everything may enter again. */
export function newVisit() {
  seen = new Set()
  lastNever = null
}

function keyOf(el) {
  return `${el.className}|${el.dataset.id || ''}|${(el.textContent || '').replace(/\s+/g, ' ').slice(0, 80)}`
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3)

/** "$52,300" → { pre: '$', n: 52300, post: '' }; anything else (a dash, "0/0") → null. */
function parse(text) {
  const m = /^(\D{0,2}?)(\d[\d,]*)(\D{0,3})$/.exec(text.trim())
  if (!m) return null
  const n = Number(m[2].replace(/,/g, ''))
  return Number.isFinite(n) ? { pre: m[1], n, post: m[3], commas: m[2].includes(',') || n >= 1000 } : null
}

/** Count the first text of `el` from `from` to its own value. The final text is exactly what was rendered. */
function countUp(el, from, delay = 0) {
  const node = [...el.childNodes].find((c) => c.nodeType === Node.TEXT_NODE && c.textContent.trim())
  if (!node) return
  const final = node.textContent
  const v = parse(final)
  if (!v || v.n === 0 || v.n === from) return
  const fmt = (x) => v.pre + (v.commas ? Math.round(x).toLocaleString('en-US') : String(Math.round(x))) + v.post
  node.textContent = fmt(from)
  const start = performance.now() + delay
  const step = (now) => {
    if (!node.isConnected) return
    const t = Math.min(1, Math.max(0, (now - start) / COUNT_MS))
    node.textContent = t >= 1 ? final : fmt(from + (v.n - from) * easeOut(t))
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

function enter(nodes) {
  const fresh = []
  for (const n of nodes) {
    const found = n.matches(CARDS) ? [n] : []
    found.push(...n.querySelectorAll(CARDS))
    for (const el of found) {
      // A card inside another card moves with its parent.
      if (el.parentElement && el.parentElement.closest(CARDS)) continue
      if (el.closest('.loading') || el.classList.contains('loading')) continue
      const k = keyOf(el)
      if (seen.has(k)) continue
      seen.add(k)
      fresh.push(el)
    }
  }
  const fold = innerHeight * 1.1
  let i = 0
  for (const el of fresh) {
    const top = el.getBoundingClientRect().top
    if (top > fold) continue
    const d = Math.min(i, MAX_STAGGERED) * STEP_MS
    i++
    if (el.matches('.screen > .head')) el.classList.add('rise-head')
    else {
      // The card's own simpler entrance and stamp press would replay when .rise comes off.
      el.classList.remove('settle')
      for (const s of el.querySelectorAll('.stamp.press')) s.classList.remove('press')
      el.style.setProperty('--d', d + 'ms')
      el.classList.add('rise')
    }
    // Off again once the card and its stamp have landed, so hover can lift it.
    setTimeout(() => el.classList.remove('rise', 'rise-head'), d + 1000)
    for (const num of el.querySelectorAll(NUMBERS)) countUp(num, 0, d + 120)
  }
}

/** The number you must never pass: when a replan changes it, count from the old value and flash. */
function never(nodes) {
  for (const n of nodes) {
    const box = n.matches('.never') ? n : n.querySelector('.never')
    if (!box) continue
    const num = box.querySelector('.n')
    const v = num && parse(num.textContent)
    if (!v) continue
    if (lastNever === null) countUp(num, 0, 260)
    else if (lastNever !== v.n) {
      countUp(num, lastNever, 0)
      box.classList.remove('flip'); void box.offsetWidth; box.classList.add('flip')
    }
    lastNever = v.n
  }
}

export function startMotion() {
  // The header lifts a little once the page scrolls under it.
  const onScroll = () => document.body.classList.toggle('scrolled', scrollY > 4)
  addEventListener('scroll', onScroll, { passive: true })
  onScroll()
  if (reducedMotion()) return
  const main = document.getElementById('main')
  if (!main || !('MutationObserver' in window)) return
  new MutationObserver((records) => {
    const added = []
    for (const r of records) for (const n of r.addedNodes) if (n.nodeType === Node.ELEMENT_NODE) added.push(n)
    if (!added.length) return
    enter(added)
    never(added)
  }).observe(main, { childList: true, subtree: true })
}
