/**
 * Where a visitor came from (utm_source, utm_medium, utm_campaign), kept for
 * this browser session only, so a host lead can say which campaign brought
 * it. No cookies, nothing sent anywhere until the person submits a form.
 */

export interface Campaign {
  source?: string
  medium?: string
  campaign?: string
}

const KEY = 'avant:campaign'
const clean = (v: string | null) => (v ? v.replace(/[^\w .-]/g, '').slice(0, 60) || undefined : undefined)

export function rememberCampaign(search: string): void {
  const p = new URLSearchParams(search)
  if (!p.get('utm_source')) return
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ source: clean(p.get('utm_source')), medium: clean(p.get('utm_medium')), campaign: clean(p.get('utm_campaign')) }))
  } catch {
    /* private mode: fine */
  }
}

export function currentCampaign(): Campaign {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Campaign
  } catch {
    return {}
  }
}
