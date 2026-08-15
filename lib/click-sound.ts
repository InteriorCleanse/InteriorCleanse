'use client'

const PREF_KEY = 'ic_sound'

/**
 * A ~40ms soft click, synthesised rather than fetched.
 *
 * Web Audio means no audio file, no network request, and no decode — the whole
 * sound is an oscillator and an envelope. It is a short sine burst with a fast
 * exponential decay, which reads as a soft wooden click rather than a beep.
 *
 * Muted by default. Sound that plays without being asked for is an imposition,
 * so it stays off until the visitor turns it on, and the choice persists.
 */

let ctx: AudioContext | null = null

/** True only when the visitor has explicitly opted in. */
export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === 'on'
  } catch {
    return false
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off')
  } catch {
    /* Private mode: the preference just does not persist. */
  }
}

export function playClick() {
  if (typeof window === 'undefined') return
  if (!soundEnabled()) return
  // Reduced motion is a request for a calmer interface, not only stiller
  // pixels — an unrequested noise belongs in the same category.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    // Created lazily and reused: constructing a context per click leaks them,
    // and browsers cap how many a page may hold.
    ctx = ctx ?? new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(760, now)
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.035)

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04)

    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.05)
  } catch {
    /* Audio unavailable or blocked: the click is decoration, never required. */
  }
}
