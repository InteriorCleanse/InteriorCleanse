'use client'

/**
 * Everything Drive remembers on this device: saved cars, trips, host
 * listings, message threads, preferences and recently viewed cars.
 *
 * There is no account and no server. State lives in localStorage under one
 * key, is read once after mount (never during render, so the server HTML and
 * the first client paint agree), and is pushed to every subscriber through
 * `useSyncExternalStore`. Other tabs stay in step via the `storage` event.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { DRIVE_STORAGE_KEY } from './config'
import { CHECK_IN_ITEMS } from './catalog'
import { shortId } from './format'
import type { Listing, Message, Preferences, Thread, Trip } from './types'

export interface DriveState {
  hydrated: boolean
  favorites: string[]
  trips: Trip[]
  listings: Listing[]
  threads: Thread[]
  recent: string[]
  prefs: Preferences
}

const DEFAULT_PREFS: Preferences = { name: '', theme: 'system', units: 'mi', homeCity: '' }

const EMPTY: DriveState = {
  hydrated: false,
  favorites: [],
  trips: [],
  listings: [],
  threads: [],
  recent: [],
  prefs: DEFAULT_PREFS,
}

type Persisted = Omit<DriveState, 'hydrated'>

let state: DriveState = EMPTY
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return state
}

function getServerSnapshot() {
  return EMPTY
}

function sanitize(raw: unknown): Persisted {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Persisted>
  return {
    favorites: Array.isArray(r.favorites) ? r.favorites.filter((v) => typeof v === 'string') : [],
    trips: Array.isArray(r.trips) ? r.trips : [],
    listings: Array.isArray(r.listings) ? r.listings : [],
    threads: Array.isArray(r.threads) ? r.threads : [],
    recent: Array.isArray(r.recent) ? r.recent.filter((v) => typeof v === 'string') : [],
    prefs: { ...DEFAULT_PREFS, ...(r.prefs && typeof r.prefs === 'object' ? r.prefs : {}) },
  }
}

function load(): Persisted {
  try {
    const raw = window.localStorage.getItem(DRIVE_STORAGE_KEY)
    return sanitize(raw ? JSON.parse(raw) : null)
  } catch {
    return sanitize(null)
  }
}

function persist(next: Persisted) {
  try {
    window.localStorage.setItem(DRIVE_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* private mode or full: the session still works, it just will not survive a reload */
  }
}

function update(fn: (prev: DriveState) => Persisted) {
  const next = fn(state)
  state = { ...next, hydrated: true }
  persist(next)
  emit()
}

function hydrate() {
  state = { ...load(), hydrated: true }
  emit()
}

const DriveContext = createContext<boolean>(false)

export function DriveProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    hydrate()
    const onStorage = (e: StorageEvent) => {
      if (e.key === DRIVE_STORAGE_KEY) hydrate()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return <DriveContext.Provider value>{children}</DriveContext.Provider>
}

export function useDriveState(): DriveState {
  if (!useContext(DriveContext)) throw new Error('useDriveState must be used inside <DriveProvider>')
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** Stable action set; none of these read React state, so they never go stale. */
export function useDriveActions() {
  const toggleFavorite = useCallback((carId: string) => {
    update((s) => ({
      ...s,
      favorites: s.favorites.includes(carId) ? s.favorites.filter((id) => id !== carId) : [carId, ...s.favorites],
    }))
  }, [])

  const noteViewed = useCallback((carId: string) => {
    update((s) => {
      if (s.recent[0] === carId) return s
      return { ...s, recent: [carId, ...s.recent.filter((id) => id !== carId)].slice(0, 8) }
    })
  }, [])

  const bookTrip = useCallback(
    (trip: Omit<Trip, 'id' | 'bookedAt' | 'status' | 'checkIn'>, hostId: string, hostGreeting: string): Trip => {
    const full: Trip = {
      ...trip,
      id: shortId('trip'),
      bookedAt: new Date().toISOString(),
      status: 'booked',
      checkIn: CHECK_IN_ITEMS.map((item) => ({ ...item, done: false })),
    }
    const thread: Thread = {
      id: shortId('thr'),
      hostId,
      carId: trip.carId,
      tripId: full.id,
      updatedAt: full.bookedAt,
      messages: [{ id: shortId('msg'), from: 'host', sentAt: full.bookedAt, text: hostGreeting }],
    }
    update((s) => ({ ...s, trips: [full, ...s.trips], threads: [thread, ...s.threads] }))
    return full
    },
    [],
  )

  const cancelTrip = useCallback((tripId: string) => {
    update((s) => ({ ...s, trips: s.trips.map((t) => (t.id === tripId ? { ...t, status: 'cancelled' } : t)) }))
  }, [])

  const completeTrip = useCallback((tripId: string) => {
    update((s) => ({ ...s, trips: s.trips.map((t) => (t.id === tripId ? { ...t, status: 'completed' } : t)) }))
  }, [])

  const toggleCheckIn = useCallback((tripId: string, itemId: string) => {
    update((s) => ({
      ...s,
      trips: s.trips.map((t) =>
        t.id === tripId
          ? { ...t, checkIn: t.checkIn.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)) }
          : t,
      ),
    }))
  }, [])

  const saveListing = useCallback((listing: Omit<Listing, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Listing => {
    const now = new Date().toISOString()
    let saved: Listing | undefined
    update((s) => {
      const existing = listing.id ? s.listings.find((l) => l.id === listing.id) : undefined
      saved = existing
        ? { ...existing, ...listing, id: existing.id, updatedAt: now }
        : { ...listing, id: shortId('lst'), createdAt: now, updatedAt: now }
      const listings = existing ? s.listings.map((l) => (l.id === saved!.id ? saved! : l)) : [saved, ...s.listings]
      return { ...s, listings }
    })
    return saved!
  }, [])

  const setListingStatus = useCallback((id: string, status: Listing['status']) => {
    update((s) => ({
      ...s,
      listings: s.listings.map((l) => (l.id === id ? { ...l, status, updatedAt: new Date().toISOString() } : l)),
    }))
  }, [])

  const deleteListing = useCallback((id: string) => {
    update((s) => ({ ...s, listings: s.listings.filter((l) => l.id !== id) }))
  }, [])

  const openThread = useCallback((carId: string, hostId: string): Thread => {
    let thread = state.threads.find((t) => t.carId === carId && t.tripId === null)
    if (thread) return thread
    const now = new Date().toISOString()
    thread = { id: shortId('thr'), hostId, carId, tripId: null, updatedAt: now, messages: [] }
    const created = thread
    update((s) => ({ ...s, threads: [created, ...s.threads] }))
    return created
  }, [])

  const sendMessage = useCallback((threadId: string, text: string, autoReply: string | null) => {
    const now = new Date().toISOString()
    const yours: Message = { id: shortId('msg'), from: 'you', sentAt: now, text }
    const reply: Message | null = autoReply
      ? { id: shortId('msg'), from: 'host', sentAt: new Date(Date.now() + 1000).toISOString(), text: autoReply }
      : null
    update((s) => ({
      ...s,
      threads: s.threads.map((t) =>
        t.id === threadId
          ? { ...t, updatedAt: now, messages: [...t.messages, yours, ...(reply ? [reply] : [])] }
          : t,
      ),
    }))
  }, [])

  const setPrefs = useCallback((patch: Partial<Preferences>) => {
    update((s) => ({ ...s, prefs: { ...s.prefs, ...patch } }))
  }, [])

  const clearAll = useCallback(() => {
    update(() => sanitize(null))
  }, [])

  const importAll = useCallback((raw: unknown) => {
    update(() => sanitize(raw))
  }, [])

  return useMemo(
    () => ({
      toggleFavorite,
      noteViewed,
      bookTrip,
      cancelTrip,
      completeTrip,
      toggleCheckIn,
      saveListing,
      setListingStatus,
      deleteListing,
      openThread,
      sendMessage,
      setPrefs,
      clearAll,
      importAll,
    }),
    [
      toggleFavorite,
      noteViewed,
      bookTrip,
      cancelTrip,
      completeTrip,
      toggleCheckIn,
      saveListing,
      setListingStatus,
      deleteListing,
      openThread,
      sendMessage,
      setPrefs,
      clearAll,
      importAll,
    ],
  )
}

/** The whole persisted state, for the account page's export. */
export function exportDriveState(): Persisted {
  const { hydrated: _hydrated, ...rest } = state
  return rest
}
