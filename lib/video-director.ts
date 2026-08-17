'use client'

/**
 * Global playback arbiter: exactly one environment video may play at a time.
 *
 * Seven environments can be mounted across a page, and each one deciding for
 * itself whether to play is how you end up with three decoding at once on a
 * long scroll. Ownership is granted here instead, so the rule is a property of
 * the page rather than a convention every component has to remember.
 *
 * A claim wins only if the claimant is more central to the viewport than the
 * current owner — scrolling past a hero hands playback to the next scene rather
 * than letting whichever mounted first keep it.
 */

type Entry = { el: HTMLVideoElement; distance: () => number }

let owner: Entry | null = null
const contenders = new Set<Entry>()

/** How far an element's centre is from the viewport's, in pixels. */
export function centreDistance(el: HTMLElement): number {
  const r = el.getBoundingClientRect()
  return Math.abs(r.top + r.height / 2 - window.innerHeight / 2)
}

function pause(entry: Entry) {
  try {
    entry.el.pause()
  } catch {
    /* Element already detached. */
  }
}

function play(entry: Entry) {
  // A rejected play() is normal — autoplay policy, or the element was removed
  // mid-promise. It must never surface as an unhandled rejection.
  void entry.el.play().catch(() => {})
}

/** Re-runs the election. Called whenever the field changes. */
function elect() {
  let best: Entry | null = null
  let bestDistance = Infinity
  for (const c of Array.from(contenders)) {
    const d = c.distance()
    if (d < bestDistance) {
      bestDistance = d
      best = c
    }
  }

  if (owner && owner !== best) pause(owner)
  owner = best
  if (owner) play(owner)
}

/**
 * Registers a video as wanting to play. Returns a release function.
 *
 * Callers register when they become eligible (onscreen, tab visible, motion
 * allowed) and release the moment they stop being eligible.
 */
export function claimPlayback(el: HTMLVideoElement, distance: () => number) {
  const entry: Entry = { el, distance }
  contenders.add(entry)
  elect()
  return () => {
    contenders.delete(entry)
    if (owner === entry) {
      pause(entry)
      owner = null
    }
    elect()
  }
}

/** Pauses everything — used when the tab is hidden. */
export function suspendAll() {
  if (owner) pause(owner)
  owner = null
}

/** Resumes the best contender after the tab becomes visible again. */
export function resume() {
  elect()
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspendAll()
    else resume()
  })
}
