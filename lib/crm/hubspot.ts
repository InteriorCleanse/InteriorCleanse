import { requestJson } from '@/lib/integrations/sync/http'
import { SyncError } from '@/lib/integrations/sync/types'
import type { CrmAdapter, CrmContact, CrmDeal, CrmPage, SourceContext } from '@/lib/knowledge/types'

/**
 * The HubSpot connector.
 *
 * Chosen as the first CRM because its free tier is a real CRM — contacts,
 * companies, deals, pipeline — and its API comes with it. A tenant creates a
 * private app, grants it read scopes, and pastes the token; that token fits
 * the vault exactly like a Stripe key. Salesforce has no free production
 * edition and an API that starts with a JWT flow; it waits for a customer who
 * needs it.
 *
 * What it reads and the decisions inside:
 *
 * **Deals are money that has not happened.** They land in `crm_deals`, never
 * in `orders`. A pipeline total added to revenue is the most common way a
 * dashboard overstates a business, and the split is structural here.
 *
 * **The stage label is kept verbatim.** HubSpot lets every customer rename
 * pipeline stages. Normalising "Contract sent" to `negotiation` would show
 * people a stage they do not recognise. What *is* normalised is the outcome
 * — open, won, lost — which HubSpot reports per stage and which is the only
 * thing the assistant needs to reason about.
 *
 * **Probability is the vendor's, or null.** HubSpot reports a stage
 * probability the customer configured. If it is absent the deal has none,
 * rather than a number we made up and the customer later planned against.
 *
 * **Incremental by `hs_lastmodifieddate`**, through the search endpoint, so a
 * deal that moved stage yesterday comes back even if it was created a year
 * ago. Search is paged with an `after` token and capped by HubSpot at 10,000
 * results per query; the runner's page budget keeps a run bounded before that.
 */

const API = 'https://api.hubapi.com/crm/v3'
const PAGE_SIZE = 100
const INITIAL_BACKFILL_DAYS = 365

type HubSpotObject = {
  id: string
  properties: Record<string, string | null>
  updatedAt?: string
}

type SearchResponse = {
  results: HubSpotObject[]
  paging?: { next?: { after?: string } }
}

type Pipelines = {
  results: {
    id: string
    stages: { id: string; label: string; metadata?: { isClosed?: string; probability?: string } }[]
  }[]
}

export const hubspotAdapter: CrmAdapter = {
  provider: 'hubspot',
  kind: 'crm',

  async fetchPage(context: SourceContext, cursor: string | null): Promise<CrmPage> {
    const token = context.credentials.api_key?.trim()
    if (!token) {
      throw new SyncError(
        'No HubSpot private app token is stored for this connection. Reconnect the integration.',
        'misconfigured',
        false,
      )
    }

    const since = context.since ?? new Date(Date.now() - INITIAL_BACKFILL_DAYS * 86_400_000)
    const state = decodeCursor(cursor)

    if (state.phase === 'contacts') {
      const page = await search(
        'contacts',
        ['email', 'firstname', 'lastname', 'company', 'hs_lastmodifieddate'],
        since,
        state.after,
        token,
        context,
      )
      return {
        contacts: page.results.map(toContact),
        deals: [],
        cursor: page.paging?.next?.after
          ? encodeCursor({ phase: 'contacts', after: page.paging.next.after })
          : encodeCursor({ phase: 'deals', after: null }),
      }
    }

    // Stage labels and outcomes come from the pipeline definitions, fetched
    // once per deals page. Small, and it means a renamed stage shows its new
    // name on the next sync rather than never.
    const pipelines = await get<Pipelines>(`${API}/pipelines/deals`, token, context)
    const stages = new Map<string, { label: string; outcome: CrmDeal['outcome']; probability: number | null }>()
    for (const pipeline of pipelines.results) {
      for (const stage of pipeline.stages) {
        const probability = stage.metadata?.probability ? Number(stage.metadata.probability) : null
        stages.set(stage.id, {
          label: stage.label,
          outcome:
            stage.metadata?.isClosed === 'true'
              ? probability === 1 || probability === 100
                ? 'won'
                : 'lost'
              : 'open',
          probability:
            probability === null || Number.isNaN(probability)
              ? null
              : Math.round(probability <= 1 ? probability * 100 : probability),
        })
      }
    }

    const page = await search(
      'deals',
      ['dealname', 'dealstage', 'amount', 'deal_currency_code', 'closedate', 'hubspot_owner_id', 'hs_lastmodifieddate'],
      since,
      state.after,
      token,
      context,
      ['contacts'],
    )

    return {
      contacts: [],
      deals: page.results.map((deal) => toDeal(deal, stages)),
      cursor: page.paging?.next?.after
        ? encodeCursor({ phase: 'deals', after: page.paging.next.after })
        : null,
    }
  },
}

async function search(
  object: 'contacts' | 'deals',
  properties: string[],
  since: Date,
  after: string | null,
  token: string,
  context: SourceContext,
  associations: string[] = [],
): Promise<SearchResponse & { results: (HubSpotObject & { associations?: Record<string, { results: { id: string }[] }> })[] }> {
  const { body } = await requestJson<SearchResponse>(
    `${API}/objects/${object}/search`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              { propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: String(since.getTime()) },
            ],
          },
        ],
        sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'ASCENDING' }],
        properties,
        ...(associations.length > 0 ? { associations } : {}),
        limit: PAGE_SIZE,
        ...(after ? { after } : {}),
      }),
    },
    { fetch: context.fetch, sleep: context.sleep },
  )
  return body as ReturnType<typeof search> extends Promise<infer R> ? R : never
}

async function get<T>(url: string, token: string, context: SourceContext): Promise<T> {
  const { body } = await requestJson<T>(
    url,
    { headers: { authorization: `Bearer ${token}` } },
    { fetch: context.fetch, sleep: context.sleep },
  )
  return body
}

function toContact(row: HubSpotObject): CrmContact {
  const p = row.properties
  return {
    externalId: row.id,
    email: p.email?.trim() || null,
    firstName: p.firstname?.trim() || null,
    lastName: p.lastname?.trim() || null,
    company: p.company?.trim() || null,
    sourceUpdatedAt: p.hs_lastmodifieddate ? new Date(p.hs_lastmodifieddate) : null,
  }
}

function toDeal(
  row: HubSpotObject & { associations?: Record<string, { results: { id: string }[] }> },
  stages: Map<string, { label: string; outcome: CrmDeal['outcome']; probability: number | null }>,
): CrmDeal {
  const p = row.properties
  const stage = p.dealstage ? stages.get(p.dealstage) : undefined
  const currency = p.deal_currency_code?.trim().toUpperCase() || null

  // Amount arrives as a decimal string. Minor units via integer arithmetic on
  // the string, never parseFloat — the same rule as every other money field.
  const amountMinor = p.amount ? toMinor(p.amount) : null

  return {
    externalId: row.id,
    name: p.dealname?.trim() || `Deal ${row.id}`,
    stage: stage?.label ?? p.dealstage ?? 'Unknown stage',
    outcome: stage?.outcome ?? 'open',
    amountMinor,
    currency: amountMinor === null ? null : currency,
    probability: stage?.probability ?? null,
    expectedCloseOn: p.closedate ? p.closedate.slice(0, 10) : null,
    ownerName: p.hubspot_owner_id ? `Owner ${p.hubspot_owner_id}` : null,
    contactExternalId: row.associations?.contacts?.results?.[0]?.id ?? null,
    sourceUpdatedAt: p.hs_lastmodifieddate ? new Date(p.hs_lastmodifieddate) : null,
  }
}

/** "1234.5" → 123450 without touching a float. Two-decimal currencies only. */
function toMinor(value: string): number | null {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  const [, sign, whole, frac = ''] = match
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  return sign === '-' ? -minor : minor
}

type Cursor = { phase: 'contacts' | 'deals'; after: string | null }

function encodeCursor(cursor: Cursor): string {
  return `${cursor.phase}:${cursor.after ?? ''}`
}

function decodeCursor(raw: string | null): Cursor {
  if (!raw) return { phase: 'contacts', after: null }
  const [phase, ...rest] = raw.split(':')
  const after = rest.join(':')
  return { phase: phase === 'deals' ? 'deals' : 'contacts', after: after || null }
}
