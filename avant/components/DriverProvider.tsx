'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Modes } from '@/lib/modes'
import type { DriverFacts } from '@/lib/types'

export interface DriverState {
  loaded: boolean
  facts: DriverFacts
  method: 'stripe_identity' | 'demo' | null
  verifiedAt: string | null
  pending: boolean
  modes: Modes | null
  refresh: () => Promise<void>
}

const EMPTY_FACTS: DriverFacts = { age: null, licenceYears: null, licenceExpires: null, licenceState: null, cleanRecord: false, verified: false }

const Ctx = createContext<DriverState>({
  loaded: false,
  facts: EMPTY_FACTS,
  method: null,
  verifiedAt: null,
  pending: false,
  modes: null,
  refresh: async () => {},
})

/** The driver's verified facts, fetched from the server once per page load. */
export function DriverProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Omit<DriverState, 'refresh'>>({
    loaded: false,
    facts: EMPTY_FACTS,
    method: null,
    verifiedAt: null,
    pending: false,
    modes: null,
  })
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/driver', { cache: 'no-store' })
      const json = await res.json()
      setS({ loaded: true, facts: json.facts, method: json.method, verifiedAt: json.verifiedAt, pending: json.pending, modes: json.modes })
    } catch {
      setS((prev) => ({ ...prev, loaded: true }))
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])
  return <Ctx.Provider value={{ ...s, refresh }}>{children}</Ctx.Provider>
}

export const useDriver = () => useContext(Ctx)
