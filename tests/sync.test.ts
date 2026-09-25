import { describe, expect, it } from 'vitest'
import {
  SyncError,
  computeWindow,
  nextLink,
  parseRetryAfter,
  requestJson,
  runSync,
  shopifyAdapter,
  stripeAdapter,
  type AdapterContext,
  type SyncPage,
} from '@/lib/integrations/sync'
import {
  shopifyOrders,
  stripeChargesPage1,
  stripeChargesPage2,
  stripeRefunds,
} from './fixtures/vendor-responses'

/** Backoff is asserted on, not waited for. */
const sleeps: number[] = []
const sleep = async (ms: number) => {
  sleeps.push(ms)
}

const WINDOW = {
  start: new Date('2025-01-01T00:00:00Z'),
  end: new Date('2025-01-08T00:00:00Z'),
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function context(
  fetchImpl: typeof globalThis.fetch,
  overrides: Partial<AdapterContext> = {},
): AdapterContext {
  return {
    credentials: { api_key: 'test-key', access_token: 'test-token' },
    settings: { shopDomain: 'demo-shop.myshopify.com' },
    window: WINDOW,
    fetch: fetchImpl,
    sleep,
    ...overrides,
  }
}

// ── HTTP behaviour ───────────────────────────────────────────────────────────

describe('requestJson', () => {
  it('does not retry a rejected credential', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return new Response('{"error":{"message":"Invalid API Key provided: sk_live_xxx"}}', {
        status: 401,
      })
    }) as unknown as typeof globalThis.fetch

    const error = await requestJson('https://api.example.com/x', {}, { fetch: fetchImpl, sleep })
      .then(() => null)
      .catch((e: unknown) => e as SyncError)

    expect(calls).toBe(1)
    expect(error).toBeInstanceOf(SyncError)
    expect(error!.kind).toBe('auth')
    expect(error!.retryable).toBe(false)
    // The vendor echoed a key back at us. It must not survive into our error.
    expect(error!.message).not.toMatch(/sk_/)
    expect(error!.message).toMatch(/reconnect/i)
  })

  it('retries a 429 and honours retry-after', async () => {
    sleeps.length = 0
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      if (calls === 1) {
        return new Response('rate limited', { status: 429, headers: { 'retry-after': '2' } })
      }
      return jsonResponse({ ok: true })
    }) as unknown as typeof globalThis.fetch

    const { body } = await requestJson<{ ok: boolean }>(
      'https://api.example.com/x',
      {},
      { fetch: fetchImpl, sleep },
    )

    expect(body.ok).toBe(true)
    expect(sleeps).toEqual([2_000])
  })

  it('retries a 500 with exponential backoff and eventually gives up', async () => {
    sleeps.length = 0
    const fetchImpl = (async () =>
      new Response('boom', { status: 503 })) as unknown as typeof globalThis.fetch

    const error = await requestJson(
      'https://api.example.com/x',
      {},
      { fetch: fetchImpl, sleep, maxAttempts: 3, backoffMs: 100 },
    )
      .then(() => null)
      .catch((e: unknown) => e as SyncError)

    expect(error!.kind).toBe('vendor_unavailable')
    expect(sleeps).toEqual([100, 200])
  })

  it('does not retry a request the vendor says is malformed', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return new Response('bad', { status: 400 })
    }) as unknown as typeof globalThis.fetch

    await expect(
      requestJson('https://api.example.com/x', {}, { fetch: fetchImpl, sleep }),
    ).rejects.toThrow(/will not help/)
    expect(calls).toBe(1)
  })

  it('treats a 200 that is not JSON as a bad response, not a success', async () => {
    const fetchImpl = (async () =>
      new Response('<html>proxy error</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })) as unknown as typeof globalThis.fetch

    await expect(
      requestJson('https://api.example.com/x', {}, { fetch: fetchImpl, sleep }),
    ).rejects.toThrow(/not valid JSON/)
  })

  it('does not leak the URL when the network fails', async () => {
    const fetchImpl = (async () => {
      throw new Error('getaddrinfo ENOTFOUND api.example.com?key=sk_secret')
    }) as unknown as typeof globalThis.fetch

    const error = await requestJson(
      'https://api.example.com/x',
      {},
      { fetch: fetchImpl, sleep, maxAttempts: 1 },
    )
      .then(() => null)
      .catch((e: unknown) => e as SyncError)

    expect(error!.message).toBe('The vendor could not be reached.')
  })
})

describe('parseRetryAfter', () => {
  it('reads delay-seconds', () => {
    expect(parseRetryAfter('30')).toBe(30_000)
  })

  it('reads an HTTP-date', () => {
    const now = Date.parse('2025-01-01T00:00:00Z')
    expect(parseRetryAfter('Wed, 01 Jan 2025 00:00:10 GMT', now)).toBe(10_000)
  })

  it('never waits longer than a minute, however far in the future the date is', () => {
    const now = Date.parse('2025-01-01T00:00:00Z')
    expect(parseRetryAfter('Wed, 01 Jan 2025 06:00:00 GMT', now)).toBe(60_000)
  })

  it('ignores a date in the past rather than going negative', () => {
    const now = Date.parse('2025-01-01T12:00:00Z')
    expect(parseRetryAfter('Wed, 01 Jan 2025 00:00:00 GMT', now)).toBe(0)
  })

  it('returns null for a header it cannot read', () => {
    expect(parseRetryAfter('soon')).toBeNull()
    expect(parseRetryAfter(null)).toBeNull()
  })
})

// ── Stripe ───────────────────────────────────────────────────────────────────

describe('the Stripe adapter', () => {
  const fetchStripe = (async (url: string | URL | Request) => {
    const href = String(url)
    if (href.includes('/charges')) {
      return jsonResponse(href.includes('starting_after') ? stripeChargesPage2 : stripeChargesPage1)
    }
    if (href.includes('/refunds')) return jsonResponse(stripeRefunds)
    throw new Error(`unexpected request: ${href}`)
  }) as unknown as typeof globalThis.fetch

  it('reads settled charges and ignores failed ones', async () => {
    const page = await stripeAdapter.fetchPage(context(fetchStripe), null)
    const ids = page.orders.map((o) => o.externalId)
    expect(ids).toContain('ch_3AAAAAAAAAAAAAAA')
    expect(ids).not.toContain('ch_3BBBBBBBBBBBBBBB')
  })

  it('takes the processing fee from the expanded balance transaction', async () => {
    const page = await stripeAdapter.fetchPage(context(fetchStripe), null)
    const order = page.orders.find((o) => o.externalId === 'ch_3AAAAAAAAAAAAAAA')!
    expect(order.paymentFeesMinor).toBe(175)
  })

  it('reports an unexpanded fee as unknown rather than zero', async () => {
    // Zero here would silently improve margin on that order.
    const page = await stripeAdapter.fetchPage(context(fetchStripe), null)
    const order = page.orders.find((o) => o.externalId === 'ch_3DDDDDDDDDDDDDDD')!
    expect(order.paymentFeesMinor).toBeNull()
  })

  it('keeps test-mode charges and flags them', async () => {
    const page = await stripeAdapter.fetchPage(context(fetchStripe), null)
    const test = page.orders.find((o) => o.externalId === 'ch_3CCCCCCCCCCCCCCC')!
    expect(test.isTest).toBe(true)
  })

  it('does not invent a product name it cannot know', async () => {
    const page = await stripeAdapter.fetchPage(context(fetchStripe), null)
    const anonymous = page.orders.find((o) => o.externalId === 'ch_3CCCCCCCCCCCCCCC')!
    expect(anonymous.items).toHaveLength(1)
    expect(anonymous.items[0]!.name).toBe('Stripe payment')
    expect(anonymous.items[0]!.productExternalId).toBeNull()
  })

  it('identifies a guest checkout by email so repeat buyers do not collapse into one', async () => {
    const page = await stripeAdapter.fetchPage(context(fetchStripe), null)
    const guest = page.orders.find((o) => o.externalId === 'ch_3DDDDDDDDDDDDDDD')!
    expect(guest.customer?.externalId).toBe('email:guest@example.com')
    expect(guest.customer?.firstName).toBe('Grace')
    expect(guest.customer?.lastName).toBe('Hopper')
  })

  it('normalises currency to upper case', async () => {
    const page = await stripeAdapter.fetchPage(context(fetchStripe), null)
    expect(page.orders.every((o) => o.currency === o.currency.toUpperCase())).toBe(true)
  })

  it('pages through charges, then refunds, then stops', async () => {
    const first = await stripeAdapter.fetchPage(context(fetchStripe), null)
    expect(first.cursor).toBe('charges:ch_3DDDDDDDDDDDDDDD')

    const second = await stripeAdapter.fetchPage(context(fetchStripe), first.cursor)
    expect(second.cursor).toBe('refunds:')

    const third = await stripeAdapter.fetchPage(context(fetchStripe), second.cursor)
    expect(third.cursor).toBeNull()
    expect(third.refunds.map((r) => r.externalId)).toEqual(['re_3AAAAAAAAAAAAAAA'])
  })

  it('ignores a refund that has not settled', async () => {
    const page = await stripeAdapter.fetchPage(context(fetchStripe), 'refunds:')
    expect(page.refunds.map((r) => r.externalId)).not.toContain('re_3BBBBBBBBBBBBBBB')
  })

  it('bounds the window it asks for', async () => {
    let requested = ''
    const spy = (async (url: string | URL | Request) => {
      requested = String(url)
      return jsonResponse({ object: 'list', data: [], has_more: false })
    }) as unknown as typeof globalThis.fetch

    await stripeAdapter.fetchPage(context(spy), null)
    expect(requested).toContain(`created%5Bgte%5D=${Math.floor(WINDOW.start.getTime() / 1000)}`)
    expect(requested).toContain(`created%5Blt%5D=${Math.floor(WINDOW.end.getTime() / 1000)}`)
  })

  it('refuses to run without a key, with wording a customer can act on', async () => {
    const bare = context(fetchStripe, { credentials: {} })
    await expect(stripeAdapter.fetchPage(bare, null)).rejects.toThrow(/Reconnect the integration/)
  })
})

// ── Shopify ──────────────────────────────────────────────────────────────────

describe('the Shopify adapter', () => {
  const fetchShopify = (async () => jsonResponse(shopifyOrders)) as unknown as typeof globalThis.fetch

  it('converts decimal strings without floating-point drift', async () => {
    const page = await shopifyAdapter.fetchPage(context(fetchShopify), null)
    const order = page.orders.find((o) => o.externalId === '5001')!

    // 19.99 × 2. parseFloat('19.99') * 100 is 1998.9999999999998.
    expect(order.items[0]!.grossMinor).toBe(3998)
    expect(order.items[0]!.discountMinor).toBe(200)
    expect(order.items[1]!.grossMinor).toBe(99)
    expect(order.taxMinor).toBe(320)
    expect(order.shippingRevenueMinor).toBe(495)
  })

  it('multiplies the per-unit price by quantity', async () => {
    const page = await shopifyAdapter.fetchPage(context(fetchShopify), null)
    const order = page.orders.find((o) => o.externalId === '5001')!
    expect(order.items[0]!.quantity).toBe(2)
    expect(order.items[0]!.grossMinor).toBe(19_99 * 2)
  })

  it('excludes a cancelled order rather than netting it off later', async () => {
    const page = await shopifyAdapter.fetchPage(context(fetchShopify), null)
    expect(page.orders.map((o) => o.externalId)).not.toContain('5002')
  })

  it('counts only settled refund transactions', async () => {
    const page = await shopifyAdapter.fetchPage(context(fetchShopify), null)
    // 19.99 succeeded, 5.00 failed.
    expect(page.refunds).toHaveLength(1)
    expect(page.refunds[0]!.amountMinor).toBe(1999)
    expect(page.refunds[0]!.orderExternalId).toBe('5001')
  })

  it('reports the payment fee as unknown, because Shopify does not send one', async () => {
    const page = await shopifyAdapter.fetchPage(context(fetchShopify), null)
    expect(page.orders.every((o) => o.paymentFeesMinor === null)).toBe(true)
  })

  it('syncs on updated_at so an edited order comes back', async () => {
    let requested = ''
    const spy = (async (url: string | URL | Request) => {
      requested = String(url)
      return jsonResponse({ orders: [] })
    }) as unknown as typeof globalThis.fetch

    await shopifyAdapter.fetchPage(context(spy), null)
    expect(requested).toContain('updated_at_min=')
    expect(requested).not.toContain('created_at_min=')
    expect(requested).toContain('status=any')
  })

  it('refuses a shop domain that is not a myshopify address', async () => {
    // Settings are editable after connect; an unvalidated host here would let
    // a stored value point our authenticated request anywhere.
    const bad = context(fetchShopify, { settings: { shopDomain: 'evil.example.com' } })
    await expect(shopifyAdapter.fetchPage(bad, null)).rejects.toThrow(/myshopify/)
  })

  it('follows the Link header verbatim', async () => {
    const withLink = (async () =>
      new Response(JSON.stringify({ orders: [] }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          link: '<https://demo-shop.myshopify.com/admin/api/2024-10/orders.json?page_info=abc123>; rel="next"',
        },
      })) as unknown as typeof globalThis.fetch

    const page = await shopifyAdapter.fetchPage(context(withLink), null)
    expect(page.cursor).toBe(
      'https://demo-shop.myshopify.com/admin/api/2024-10/orders.json?page_info=abc123',
    )
  })
})

describe('nextLink', () => {
  it('picks next and ignores previous', () => {
    const header = '<https://x/a?page_info=prev>; rel="previous", <https://x/a?page_info=next>; rel="next"'
    expect(nextLink(header)).toBe('https://x/a?page_info=next')
  })

  it('returns null on the last page, where only previous is present', () => {
    expect(nextLink('<https://x/a?page_info=prev>; rel="previous"')).toBeNull()
    expect(nextLink(null)).toBeNull()
  })
})

// ── The runner ───────────────────────────────────────────────────────────────

const emptyPage: SyncPage = { orders: [], refunds: [], cursor: null }

function fakeAdapter(pages: SyncPage[]) {
  let index = 0
  return {
    provider: 'fake',
    async fetchPage(): Promise<SyncPage> {
      const page = pages[index] ?? emptyPage
      index += 1
      return page
    },
  }
}

function order(id: string, placedAt: string) {
  return {
    externalId: id,
    orderNumber: null,
    currency: 'USD',
    placedAt: new Date(placedAt),
    shippingRevenueMinor: 0,
    taxMinor: 0,
    paymentFeesMinor: null,
    marketplaceFeesMinor: null,
    isTest: false,
    customer: null,
    items: [],
  }
}

function countingSink() {
  const written: string[] = []
  return {
    written,
    async write(page: SyncPage) {
      for (const o of page.orders) written.push(o.externalId)
      return { written: page.orders.length + page.refunds.length }
    },
  }
}

describe('computeWindow', () => {
  const now = new Date('2025-06-01T12:00:00Z')

  it('backfills a bounded history on the first run', () => {
    const window = computeWindow(null, now)
    const days = (now.getTime() - window.start.getTime()) / 86_400_000
    expect(days).toBe(90)
  })

  it('overlaps the previous run rather than resuming exactly where it stopped', () => {
    // Vendors backdate and are eventually consistent; a strict watermark drops
    // records every time, and the upsert makes the overlap free.
    const last = new Date('2025-06-01T11:00:00Z')
    const window = computeWindow(last, now)
    expect(window.start.toISOString()).toBe('2025-06-01T10:30:00.000Z')
  })

  it('never produces an inverted window from a timestamp in the future', () => {
    const window = computeWindow(new Date('2030-01-01T00:00:00Z'), now)
    expect(window.start.getTime()).toBeLessThanOrEqual(window.end.getTime())
  })
})

describe('runSync', () => {
  it('reports success and advances the watermark to the window end', async () => {
    const sink = countingSink()
    const outcome = await runSync({
      adapter: fakeAdapter([{ orders: [order('a', '2025-01-02T00:00:00Z')], refunds: [], cursor: null }]),
      sink,
      credentials: {},
      settings: {},
      lastSuccessAt: new Date('2025-01-01T00:00:00Z'),
      now: new Date('2025-01-03T00:00:00Z'),
    })

    expect(outcome.status).toBe('succeeded')
    expect(outcome.recordsWritten).toBe(1)
    expect(outcome.truncated).toBe(false)
    expect(outcome.nextWindowStart).toEqual(outcome.window.end)
    expect(outcome.connectionStatus).toBe('connected')
  })

  it('stops at the page budget and resumes from the newest record, not the window end', async () => {
    // Reporting the window end here would silently skip everything past the cut.
    const pages: SyncPage[] = Array.from({ length: 5 }, (_, i) => ({
      orders: [order(`o${i}`, `2025-01-0${i + 1}T00:00:00Z`)],
      refunds: [],
      cursor: 'more',
    }))

    const outcome = await runSync({
      adapter: fakeAdapter(pages),
      sink: countingSink(),
      credentials: {},
      settings: {},
      lastSuccessAt: null,
      now: new Date('2025-02-01T00:00:00Z'),
      maxPages: 3,
    })

    expect(outcome.status).toBe('partial')
    expect(outcome.truncated).toBe(true)
    expect(outcome.nextWindowStart.toISOString()).toBe('2025-01-03T00:00:00.000Z')
    expect(outcome.nextWindowStart).not.toEqual(outcome.window.end)
    expect(outcome.connectionStatus).toBe('degraded')
  })

  it('keeps what it wrote when a later page fails', async () => {
    const sink = countingSink()
    const failing = {
      provider: 'fake',
      calls: 0,
      async fetchPage(): Promise<SyncPage> {
        this.calls += 1
        if (this.calls === 1) {
          return { orders: [order('kept', '2025-01-02T00:00:00Z')], refunds: [], cursor: 'more' }
        }
        throw new SyncError('The vendor returned 503.', 'vendor_unavailable', true)
      },
    }

    const outcome = await runSync({
      adapter: failing,
      sink,
      credentials: {},
      settings: {},
      lastSuccessAt: null,
      now: new Date('2025-02-01T00:00:00Z'),
    })

    expect(sink.written).toEqual(['kept'])
    expect(outcome.status).toBe('partial')
    expect(outcome.recordsWritten).toBe(1)
    expect(outcome.nextWindowStart.toISOString()).toBe('2025-01-02T00:00:00.000Z')
    expect(outcome.connectionStatus).toBe('degraded')
  })

  it('marks the connection revoked only when the credential was rejected', async () => {
    const outcome = await runSync({
      adapter: {
        provider: 'fake',
        async fetchPage(): Promise<SyncPage> {
          throw new SyncError('The vendor rejected the stored credential.', 'auth', false)
        },
      },
      sink: countingSink(),
      credentials: {},
      settings: {},
      lastSuccessAt: null,
    })

    expect(outcome.status).toBe('failed')
    expect(outcome.connectionStatus).toBe('revoked')
  })

  it('does not mark a rate limit as revoked', async () => {
    // Telling a customer to go and rotate a working key wastes their time and
    // teaches them to ignore the badge.
    const outcome = await runSync({
      adapter: {
        provider: 'fake',
        async fetchPage(): Promise<SyncPage> {
          throw new SyncError('Rate limited.', 'rate_limited', true)
        },
      },
      sink: countingSink(),
      credentials: {},
      settings: {},
      lastSuccessAt: null,
    })

    expect(outcome.connectionStatus).toBe('degraded')
  })

  it('never throws, even when the adapter throws something that is not a SyncError', async () => {
    const outcome = await runSync({
      adapter: {
        provider: 'fake',
        async fetchPage(): Promise<SyncPage> {
          throw new TypeError('undefined is not a function')
        },
      },
      sink: countingSink(),
      credentials: {},
      settings: {},
      lastSuccessAt: null,
    })

    expect(outcome.status).toBe('failed')
    expect(outcome.error).toContain('undefined is not a function')
  })

  it('does not blame the vendor when our own write fails', async () => {
    const outcome = await runSync({
      adapter: fakeAdapter([{ orders: [order('a', '2025-01-02T00:00:00Z')], refunds: [], cursor: null }]),
      sink: {
        async write() {
          throw new Error('duplicate key value violates unique constraint')
        },
      },
      credentials: {},
      settings: {},
      lastSuccessAt: null,
    })

    expect(outcome.connectionStatus).toBe('degraded')
    expect(outcome.connectionStatus).not.toBe('revoked')
    expect(outcome.error).toMatch(/could not be saved/)
  })

  it('holds the watermark still when nothing was written', async () => {
    const outcome = await runSync({
      adapter: {
        provider: 'fake',
        async fetchPage(): Promise<SyncPage> {
          throw new SyncError('Down.', 'vendor_unavailable', true)
        },
      },
      sink: countingSink(),
      credentials: {},
      settings: {},
      lastSuccessAt: new Date('2025-01-01T00:00:00Z'),
      now: new Date('2025-01-02T00:00:00Z'),
    })

    // The gap must be refetched next time, so the resume point is the window
    // start — not the moment the run happened to fail.
    expect(outcome.nextWindowStart).toEqual(outcome.window.start)
  })
})
