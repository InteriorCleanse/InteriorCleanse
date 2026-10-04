'use client'

/**
 * Who is signed in, and their unread counts. Fetched after mount and every
 * 30 seconds while the tab is visible. On sign-in, favorites saved on this
 * device join the account so nothing is lost.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { actions } from '@/lib/store'

export interface SessionUser {
  id: string
  name: string
  firstName: string
  email: string
  bio: string
  photo: string | null
  joined: string
}

export interface Advantage {
  tier: string
  feePct: number
  freeCancelHours: number
  creditCents: number
}

export interface SessionState {
  loaded: boolean
  user: SessionUser | null
  unread: { messages: number; notifications: number }
  /** Circle tier and AVANT credit, for pricing previews; the server re-prices anyway. */
  advantage: Advantage | null
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const NONE = { messages: 0, notifications: 0 }
const Ctx = createContext<SessionState>({ loaded: false, user: null, unread: NONE, advantage: null, refresh: async () => {}, signOut: async () => {} })

async function syncFavorites() {
  try {
    const local = JSON.parse(localStorage.getItem('avant:v2') ?? '{}').saved ?? []
    const res = await fetch('/api/favorites', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ merge: Array.isArray(local) ? local.slice(0, 200) : [] }),
    })
    if (res.ok) actions.setSaved((await res.json()).slugs ?? [])
  } catch {
    /* offline: local favorites stay */
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Omit<SessionState, 'refresh' | 'signOut'>>({ loaded: false, user: null, unread: NONE, advantage: null })
  const lastUser = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const json = await (await fetch('/api/me', { cache: 'no-store' })).json()
      const user: SessionUser | null = json.user ?? null
      setS({ loaded: true, user, unread: json.unread ?? NONE, advantage: json.advantage ?? null })
      if (user && lastUser.current !== user.id) void syncFavorites()
      lastUser.current = user?.id ?? null
    } catch {
      setS((p) => ({ ...p, loaded: true }))
    }
  }, [])

  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    lastUser.current = null
    setS({ loaded: true, user: null, unread: NONE, advantage: null })
  }, [])

  useEffect(() => {
    void refresh()
    const tick = window.setInterval(() => document.visibilityState === 'visible' && void refresh(), 30_000)
    return () => window.clearInterval(tick)
  }, [refresh])

  return <Ctx.Provider value={{ ...s, refresh, signOut }}>{children}</Ctx.Provider>
}

export const useSession = () => useContext(Ctx)
