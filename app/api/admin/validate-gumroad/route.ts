import { NextResponse } from 'next/server'
import { errorBody } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type GumroadCheck = {
  url: string
  ok: boolean
  status: number
  name: string | null
  price: string | null
  note: string
}

/**
 * Confirms a Gumroad URL is real before it is put behind a DOWNLOAD button.
 *
 * Body: `{ url }`. Fetches the page, requires a 200, and reads the product
 * name and price out of the page's own metadata so the owner can confirm it is
 * the product they meant. Nothing is saved — this is a check, and the admin
 * writes the URL onto the product only after seeing the answer.
 */
export async function POST(req: Request) {
  try {
    const { url } = (await req.json()) as { url?: string }
    let parsed: URL
    try {
      parsed = new URL(String(url ?? ''))
    } catch {
      return NextResponse.json({ error: 'That is not a URL.' }, { status: 400 })
    }
    if (!/(^|\.)gumroad\.com$/.test(parsed.hostname)) {
      return NextResponse.json({ error: 'Only gumroad.com URLs are checked here.' }, { status: 400 })
    }

    const res = await fetch(parsed.toString(), {
      redirect: 'follow',
      headers: { 'User-Agent': 'InteriorCleanse-admin/1.0 (+https://interiorcleanse.com)' },
      cache: 'no-store',
    })
    const html = res.ok ? await res.text() : ''

    const meta = (prop: string) => {
      const m =
        html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i')) ??
        html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))
      return m ? decode(m[1]) : null
    }

    let name = meta('og:title')
    const title = html.match(/<title>([^<]*)<\/title>/i)
    if (!name && title) name = decode(title[1])
    let price = meta('product:price:amount')
    const currency = meta('product:price:currency')
    if (price && currency) price = `${price} ${currency}`
    if (!price) {
      // Gumroad's product JSON is embedded for the client; the price is there
      // as a formatted string when the meta tags are absent.
      const embedded = html.match(/"price_cents":\s*(\d+)/) ?? html.match(/"formatted_price":"([^"]+)"/)
      if (embedded) price = /^\d+$/.test(embedded[1]) ? `$${(Number(embedded[1]) / 100).toFixed(2)}` : embedded[1]
    }

    const body: GumroadCheck = {
      url: parsed.toString(),
      ok: res.ok,
      status: res.status,
      name: name ? name.replace(/\s*\|\s*Gumroad\s*$/i, '').trim() : null,
      price,
      note: !res.ok
        ? `Gumroad returned ${res.status}. The product may be unpublished or the URL wrong.`
        : name
          ? 'Reachable. Confirm the name and price match what you expect, then save.'
          : 'Reachable, but the page did not expose a product name — open it to confirm.',
    }
    return NextResponse.json(body)
  } catch (e) {
    console.error('[admin/validate-gumroad]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
