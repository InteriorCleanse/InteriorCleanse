import { NextResponse } from 'next/server'
import { configured, errorBody } from '@/lib/env'
import { allProducts } from '@/lib/content'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type ConnectorState = 'connected' | 'not_connected' | 'partial'

export type Connector = {
  name: string
  state: ConnectorState
  /** What the connector does once it works. */
  purpose: string
  /** Why it is not working, and the exact fix. Empty when connected. */
  blocker: string
  envKeys: string[]
}

export type IntegrationsReport = {
  connectors: Connector[]
  /** Products that cannot be sold because they have no Stripe Price. */
  unsellable: { slug: string; name: string }[]
}

/**
 * Connector health for the admin.
 *
 * "Connected" here means the credentials are *present*, not that a live call
 * has succeeded — this route deliberately does not hit the providers, because a
 * dashboard that fires six third-party requests on every page load is a
 * liability. Anything stronger than "configured" has to come from an actual
 * sync run, which reports its own errors.
 */
export async function GET() {
  try {
    const stripeKeys = configured.stripe()
    const webhookSecret = Boolean(process.env.STRIPE_WEBHOOK_SECRET)

    // A Stripe secret with no webhook secret is the dangerous middle state:
    // checkout appears to work, then no order is ever fulfilled.
    const stripeState: ConnectorState = !stripeKeys
      ? 'not_connected'
      : webhookSecret
        ? 'connected'
        : 'partial'

    const unsellable = allProducts
      .filter((p) => !p.comingSoon && !p.channels.stripePriceId)
      .map((p) => ({ slug: p.slug, name: p.name }))

    const connectors: Connector[] = [
      {
        name: 'Stripe',
        state: stripeState,
        purpose: 'Takes payment for everything sold through this site.',
        blocker: !stripeKeys
          ? 'STRIPE_SECRET_KEY is not set. Add it in Vercel → Settings → Environment Variables.'
          : !webhookSecret
            ? 'STRIPE_WEBHOOK_SECRET is missing, so orders will be paid for but never fulfilled. Run `npm run stripe:setup -- --webhook` and register the endpoint as https://interiorcleanse.com/api/webhook/ — with the trailing slash, because Stripe does not follow the 308 redirect.'
            : '',
        envKeys: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
      },
      {
        name: 'Printful',
        state: configured.printful() ? 'connected' : 'not_connected',
        purpose: 'Syncs apparel and home goods, and fulfils their orders.',
        blocker: configured.printful()
          ? ''
          : 'PRINTFUL_API_KEY is not set. Catalog import and fulfilment are both off.',
        envKeys: ['PRINTFUL_API_KEY', 'PRINTFUL_STORE_ID'],
      },
      {
        name: 'Printify',
        state: configured.printify() ? 'connected' : 'not_connected',
        purpose: 'Imports the connected Printify shop catalogue.',
        blocker: configured.printify()
          ? ''
          : 'PRINTIFY_API_KEY and PRINTIFY_SHOP_ID are required together.',
        envKeys: ['PRINTIFY_API_KEY', 'PRINTIFY_SHOP_ID'],
      },
      {
        name: 'Brevo',
        state: configured.brevo() ? 'connected' : 'not_connected',
        purpose: 'Holds the subscriber and customer lists, and sends email.',
        blocker: configured.brevo() ? '' : 'BREVO_API_KEY is not set.',
        envKeys: ['BREVO_API_KEY', 'BREVO_LIST_SUBSCRIBERS', 'BREVO_LIST_CUSTOMERS'],
      },
      {
        name: 'Claude (email engine)',
        state: configured.anthropic() ? 'connected' : 'not_connected',
        purpose: 'Writes the post-purchase and campaign email copy.',
        blocker: configured.anthropic() ? '' : 'ANTHROPIC_API_KEY is not set.',
        envKeys: ['ANTHROPIC_API_KEY'],
      },
      {
        name: 'TikTok Shop',
        state: 'not_connected',
        purpose: 'Would sync an authorized seller catalogue.',
        blocker:
          'Not implemented. Curated external products with outbound links are supported today via checkoutMode "external_tiktok"; authorized seller sync needs TikTok partner approval.',
        envKeys: [],
      },
      {
        name: 'Kie.ai',
        state: 'not_connected',
        purpose: 'Would generate editorial scenes and power the AI design studio.',
        blocker:
          'Not implemented. Needs KIE_API_KEY plus a database and object storage for the async job queue — see docs/KIE_ASSET_PIPELINE.md.',
        envKeys: ['KIE_API_KEY'],
      },
    ]

    const report: IntegrationsReport = { connectors, unsellable }
    return NextResponse.json(report)
  } catch (e) {
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}
