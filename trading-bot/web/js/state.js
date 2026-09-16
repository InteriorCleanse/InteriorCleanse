// A tiny shared state holder for the modular panels (Phase 17). Panels read
// and write here instead of reaching into each other; a change notifies any
// subscribers. Deliberately minimal — no framework, no dependencies.

const state = {}
const subs = new Set()

export function get(key) { return state[key] }

export function set(key, value) {
  state[key] = value
  for (const fn of subs) { try { fn(key, value) } catch { /* a bad subscriber must not break others */ } }
}

export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn) }
