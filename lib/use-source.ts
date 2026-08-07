'use client'

import { useEffect, useState } from 'react'

/**
 * Best-guess acquisition source for a signup.
 *
 * Prefers an explicit `utm_source`, then the campaign, then the referrer host,
 * falling back to 'direct'. Read after mount — `window` does not exist during
 * the server render.
 */
export function useSource(fallback = 'website'): string {
  const [source, setSource] = useState(fallback)

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const utm = params.get('utm_source') || params.get('utm_campaign')
      if (utm) {
        setSource(utm)
        return
      }
      if (document.referrer) {
        const host = new URL(document.referrer).hostname.replace(/^www\./, '')
        if (host && host !== window.location.hostname) {
          setSource(host)
          return
        }
      }
      setSource('direct')
    } catch {
      setSource(fallback)
    }
  }, [fallback])

  return source
}

/** POSTs an address to the subscribe endpoint. Throws on a non-2xx. */
export async function subscribeEmail(email: string, source: string) {
  const res = await fetch('/api/subscribe/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, source }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Subscription failed.')
  return data
}
