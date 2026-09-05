'use client'

/**
 * Ambient room tone, synthesised.
 *
 * Three beds — a slow arpeggio for the library, birdsong for the conservatory,
 * running water for the cleaning room — built from oscillators and filtered
 * noise. No audio files: nothing to fetch, nothing to decode, nothing that can
 * 404, and the loop is seamless because there is no loop, only a generator.
 *
 * Off by default and persisted per visitor. Sound nobody asked for is an
 * imposition; the toggle is an on switch, not an off switch. Under
 * prefers-reduced-motion it never starts, whatever the stored preference says.
 *
 * One bed at a time, site-wide: a module-level singleton means two heroes can
 * never layer birds over strings.
 */

export type AmbientKind = 'classical' | 'birdsong' | 'water'

const PREF_KEY = 'ic_ambient'
const MASTER_LEVEL = 0.07
const FADE = 1.2

type Bed = { stop: () => void; kind: AmbientKind }

let ctx: AudioContext | null = null
let master: GainNode | null = null
let current: Bed | null = null

export function ambientEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === 'on'
  } catch {
    return false
  }
}

export function setAmbientEnabled(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off')
  } catch {
    /* Private mode: the preference just does not persist. */
  }
}

export function ambientPlaying(): AmbientKind | null {
  return current?.kind ?? null
}

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function context(): { ctx: AudioContext; master: GainNode } | null {
  if (typeof window === 'undefined') return null
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    if (!ctx) {
      ctx = new Ctor()
      master = ctx.createGain()
      master.gain.value = 0
      master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return { ctx, master: master! }
  } catch {
    return null
  }
}

/** Starts a bed, replacing whatever is playing. No-op under reduced motion. */
export function startAmbient(kind: AmbientKind) {
  if (reducedMotion()) return
  if (current?.kind === kind) return
  const audio = context()
  if (!audio) return

  stopAmbient(true)

  const bed =
    kind === 'classical'
      ? classical(audio.ctx, audio.master)
      : kind === 'birdsong'
        ? birdsong(audio.ctx, audio.master)
        : water(audio.ctx, audio.master)
  current = { stop: bed, kind }

  const now = audio.ctx.currentTime
  audio.master.gain.cancelScheduledValues(now)
  audio.master.gain.setValueAtTime(0.0001, now)
  audio.master.gain.exponentialRampToValueAtTime(MASTER_LEVEL, now + FADE)
}

export function stopAmbient(immediate = false) {
  const bed = current
  if (!bed || !ctx || !master) {
    current = null
    return
  }
  current = null
  const now = ctx.currentTime
  master.gain.cancelScheduledValues(now)
  if (immediate) {
    master.gain.setValueAtTime(0.0001, now)
    bed.stop()
  } else {
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now)
    master.gain.exponentialRampToValueAtTime(0.0001, now + FADE)
    window.setTimeout(bed.stop, FADE * 1000 + 50)
  }
}

/* ── Beds ─────────────────────────────────────────────────────────── */

/** A soft convolution tail so notes sit in a room rather than a wire. */
function roomTail(c: AudioContext, seconds: number, decay: number) {
  const rate = c.sampleRate
  const len = Math.floor(rate * seconds)
  const buf = c.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
    }
  }
  const conv = c.createConvolver()
  conv.buffer = buf
  return conv
}

/**
 * Library: an unhurried arpeggio through four warm chords, triangle voices
 * through a low-pass, in a long room. Deliberately not a melody — a bed you
 * stop noticing.
 */
function classical(c: AudioContext, out: GainNode) {
  const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12)
  // Cmaj7 · Am7 · Fmaj7 · G6, voiced low-to-high, in octave 3–5.
  const chords = [
    [48, 55, 59, 64, 67],
    [45, 52, 55, 60, 64],
    [41, 48, 52, 57, 60],
    [43, 50, 55, 59, 64],
  ]
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 1400
  const tail = roomTail(c, 3.2, 2.4)
  const wet = c.createGain()
  wet.gain.value = 0.5
  filter.connect(out)
  filter.connect(tail).connect(wet).connect(out)

  let chord = 0
  let step = 0
  let alive = true
  let timer = 0

  const note = () => {
    if (!alive) return
    const voicing = chords[chord]
    const idx = step % (voicing.length * 2 - 2)
    // Up then down through the voicing, so it rocks rather than climbs.
    const pos = idx < voicing.length ? idx : voicing.length * 2 - 2 - idx
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = 'triangle'
    osc.frequency.value = midi(voicing[pos])
    const t = c.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.06)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4)
    osc.connect(g).connect(filter)
    osc.start(t)
    osc.stop(t + 2.5)
    step++
    if (step % 16 === 0) chord = (chord + 1) % chords.length
    timer = window.setTimeout(note, 640 + Math.random() * 90)
  }
  note()

  return () => {
    alive = false
    window.clearTimeout(timer)
    window.setTimeout(() => {
      filter.disconnect()
      tail.disconnect()
      wet.disconnect()
    }, 3000)
  }
}

/**
 * Conservatory: sparse birds. Each chirp is a short sine sweep with a quick
 * envelope; a phrase is two to five chirps; phrases arrive irregularly from
 * slightly different places in the stereo field.
 */
function birdsong(c: AudioContext, out: GainNode) {
  let alive = true
  let timer = 0
  const tail = roomTail(c, 1.4, 3)
  const wet = c.createGain()
  wet.gain.value = 0.35
  tail.connect(wet).connect(out)

  const chirp = (t: number, pan: StereoPannerNode | GainNode, base: number) => {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = 'sine'
    const up = Math.random() > 0.4
    const f0 = base * (up ? 0.8 : 1.25)
    const f1 = base * (up ? 1.3 : 0.85)
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(f1, t + 0.09)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    osc.connect(g).connect(pan)
    osc.start(t)
    osc.stop(t + 0.14)
  }

  const phrase = () => {
    if (!alive) return
    const pan = c.createStereoPanner()
    pan.pan.value = Math.random() * 1.4 - 0.7
    pan.connect(out)
    pan.connect(tail)
    const base = 2200 + Math.random() * 1800
    const n = 2 + Math.floor(Math.random() * 4)
    let t = c.currentTime + 0.05
    for (let i = 0; i < n; i++) {
      chirp(t, pan, base * (1 + (Math.random() - 0.5) * 0.12))
      t += 0.14 + Math.random() * 0.12
    }
    window.setTimeout(() => pan.disconnect(), 2500)
    timer = window.setTimeout(phrase, 1800 + Math.random() * 4200)
  }
  phrase()

  return () => {
    alive = false
    window.clearTimeout(timer)
    window.setTimeout(() => {
      tail.disconnect()
      wet.disconnect()
    }, 2000)
  }
}

/**
 * Cleaning room: water. Pink-ish noise through a band-pass whose centre and
 * level wander slowly, which is what separates a stream from a hiss.
 */
function water(c: AudioContext, out: GainNode) {
  const seconds = 4
  const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate)
  const d = buf.getChannelData(0)
  // Paul Kellet's pink-noise approximation — flat white noise sounds like a TV.
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
    b6 = w * 0.115926
  }
  const src = c.createBufferSource()
  src.buffer = buf
  src.loop = true

  const band = c.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 700
  band.Q.value = 0.7

  const high = c.createBiquadFilter()
  high.type = 'highpass'
  high.frequency.value = 180

  const level = c.createGain()
  level.gain.value = 0.9

  // Two slow LFOs, out of phase, so the wander never settles into a cycle.
  const lfo1 = c.createOscillator()
  const lfo1Gain = c.createGain()
  lfo1.frequency.value = 0.11
  lfo1Gain.gain.value = 220
  lfo1.connect(lfo1Gain).connect(band.frequency)

  const lfo2 = c.createOscillator()
  const lfo2Gain = c.createGain()
  lfo2.frequency.value = 0.07
  lfo2Gain.gain.value = 0.18
  lfo2.connect(lfo2Gain).connect(level.gain)

  src.connect(high).connect(band).connect(level).connect(out)
  const t = c.currentTime
  src.start(t)
  lfo1.start(t)
  lfo2.start(t)

  return () => {
    try {
      src.stop()
      lfo1.stop()
      lfo2.stop()
    } catch {
      /* already stopped */
    }
    src.disconnect()
    level.disconnect()
  }
}
