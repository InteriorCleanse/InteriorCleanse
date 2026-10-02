'use client'

/**
 * What AVANT keeps in this browser: favorites (mirrored to the account when
 * signed in), recently viewed cars, listing drafts, trip check-in ticks and
 * the all-in price preference. Trips themselves live on the server. Read
 * after mount so the server HTML and first paint agree; synced across tabs.
 */

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import type { Listing } from './listing'

const KEY = 'avant:v2'

export interface LocalState {
  hydrated: boolean
  /** Listing slugs. */
  saved: string[]
  /** Listing slugs, most recent first. */
  recent: string[]
  /** Check-in items ticked, by trip id. */
  checks: Record<string, string[]>
  listings: Listing[]
  allIn: boolean
}

const EMPTY: LocalState = { hydrated: false, saved: [], recent: [], checks: {}, listings: [], allIn: true }
let state = EMPTY
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

const strings = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [])

function load(): LocalState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<LocalState>
    const checks: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(raw.checks ?? {})) checks[k] = strings(v)
    return {
      hydrated: true,
      saved: strings(raw.saved),
      recent: strings(raw.recent),
      checks,
      listings: Array.isArray(raw.listings) ? raw.listings : [],
      allIn: raw.allIn !== false,
    }
  } catch {
    return { ...EMPTY, hydrated: true }
  }
}

function write(next: Omit<LocalState, 'hydrated'>) {
  state = { ...next, hydrated: true }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private mode: works for the session only */
  }
  emit()
}

const Ctx = createContext(false)

export function LocalProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    state = load()
    emit()
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        state = load()
        emit()
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return <Ctx.Provider value>{children}</Ctx.Provider>
}

export function useLocal(): LocalState {
  useContext(Ctx)
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => state,
    () => EMPTY,
  )
}

const strip = (s: LocalState) => ({ saved: s.saved, recent: s.recent, checks: s.checks, listings: s.listings, allIn: s.allIn })

export const actions = {
  setSaved(slugs: string[]) {
    write({ ...strip(state), saved: [...new Set(slugs)] })
  },
  toggleSaved(slug: string): boolean {
    const s = strip(state)
    const on = !s.saved.includes(slug)
    write({ ...s, saved: on ? [slug, ...s.saved] : s.saved.filter((x) => x !== slug) })
    return on
  },
  viewed(slug: string) {
    const s = strip(state)
    if (s.recent[0] === slug) return
    write({ ...s, recent: [slug, ...s.recent.filter((x) => x !== slug)].slice(0, 12) })
  },
  setAllIn(allIn: boolean) {
    write({ ...strip(state), allIn })
  },
  toggleCheck(tripId: string, itemId: string) {
    const s = strip(state)
    const done = s.checks[tripId] ?? []
    write({ ...s, checks: { ...s.checks, [tripId]: done.includes(itemId) ? done.filter((x) => x !== itemId) : [...done, itemId] } })
  },
  saveListing(listing: Listing) {
    const s = strip(state)
    const exists = s.listings.some((l) => l.id === listing.id)
    write({ ...s, listings: exists ? s.listings.map((l) => (l.id === listing.id ? listing : l)) : [listing, ...s.listings] })
  },
  deleteListing(id: string) {
    const s = strip(state)
    write({ ...s, listings: s.listings.filter((l) => l.id !== id) })
  },
  clear() {
    write({ saved: [], recent: [], checks: {}, listings: [], allIn: true })
  },
  export(): string {
    return JSON.stringify(strip(state), null, 2)
  },
}

export function useActions() {
  return useMemo(() => actions, [])
}
