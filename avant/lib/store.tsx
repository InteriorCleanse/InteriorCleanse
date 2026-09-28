'use client'

/**
 * What AVANT keeps in this browser: saved cars, recently viewed, trips and
 * the all-in price preference. Nothing personal. Read after mount so the
 * server HTML and first paint agree; synced across tabs.
 */

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { CHECK_IN_ITEMS } from './catalog'
import type { Listing } from './listing'
import type { Trip } from './types'

const KEY = 'avant:v1'

export interface LocalState {
  hydrated: boolean
  saved: string[]
  recent: string[]
  trips: Trip[]
  listings: Listing[]
  allIn: boolean
}

const EMPTY: LocalState = { hydrated: false, saved: [], recent: [], trips: [], listings: [], allIn: true }
let state = EMPTY
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

function load(): LocalState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<LocalState>
    return {
      hydrated: true,
      saved: Array.isArray(raw.saved) ? raw.saved.filter((x) => typeof x === 'string') : [],
      recent: Array.isArray(raw.recent) ? raw.recent.filter((x) => typeof x === 'string') : [],
      trips: Array.isArray(raw.trips) ? raw.trips : [],
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

const strip = (s: LocalState) => ({ saved: s.saved, recent: s.recent, trips: s.trips, listings: s.listings, allIn: s.allIn })

export const actions = {
  toggleSaved(id: string) {
    const s = strip(state)
    write({ ...s, saved: s.saved.includes(id) ? s.saved.filter((x) => x !== id) : [id, ...s.saved] })
  },
  viewed(id: string) {
    const s = strip(state)
    if (s.recent[0] === id) return
    write({ ...s, recent: [id, ...s.recent.filter((x) => x !== id)].slice(0, 8) })
  },
  setAllIn(allIn: boolean) {
    write({ ...strip(state), allIn })
  },
  addTrip(trip: Omit<Trip, 'checkIn' | 'status' | 'bookedAt'>): Trip {
    const full: Trip = {
      ...trip,
      status: 'booked',
      bookedAt: new Date().toISOString(),
      checkIn: CHECK_IN_ITEMS.map((c) => ({ ...c, done: false })),
    }
    const s = strip(state)
    if (!s.trips.some((t) => t.id === full.id)) write({ ...s, trips: [full, ...s.trips] })
    return full
  },
  cancelTrip(id: string) {
    const s = strip(state)
    write({ ...s, trips: s.trips.map((t) => (t.id === id ? { ...t, status: 'cancelled' } : t)) })
  },
  toggleCheck(tripId: string, itemId: string) {
    const s = strip(state)
    write({
      ...s,
      trips: s.trips.map((t) => (t.id === tripId ? { ...t, checkIn: t.checkIn.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)) } : t)),
    })
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
    write({ saved: [], recent: [], trips: [], listings: [], allIn: true })
  },
  export(): string {
    return JSON.stringify(strip(state), null, 2)
  },
}

export function useActions() {
  return useMemo(() => actions, [])
}
