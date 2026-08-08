/**
 * Server-side environment access.
 *
 * Integrations are treated as optional at build time and required only when a
 * route actually calls them — so a missing Printful key breaks the Printful
 * sync, not `npm run build` and not the storefront.
 */

/** Reads a required variable, throwing a message the route can surface. */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not configured. Add it in Vercel → Settings → Environment Variables (see VERCEL_ENV_SETUP.md).`
    )
  }
  return value
}

export const env = {
  stripeSecret: () => requireEnv('STRIPE_SECRET_KEY'),
  stripeWebhookSecret: () => requireEnv('STRIPE_WEBHOOK_SECRET'),
  printfulKey: () => requireEnv('PRINTFUL_API_KEY'),
  printfulStoreId: () => process.env.PRINTFUL_STORE_ID || '',
  printifyKey: () => requireEnv('PRINTIFY_API_KEY'),
  printifyShopId: () => requireEnv('PRINTIFY_SHOP_ID'),
  brevoKey: () => requireEnv('BREVO_API_KEY'),
  anthropicKey: () => requireEnv('ANTHROPIC_API_KEY'),
  adminPassword: () => requireEnv('ADMIN_PASSWORD'),
  adminSessionSecret: () => requireEnv('ADMIN_SESSION_SECRET'),
  brevoSubscriberList: () => parseInt(process.env.BREVO_LIST_SUBSCRIBERS || '1', 10),
  brevoCustomerList: () => parseInt(process.env.BREVO_LIST_CUSTOMERS || '2', 10),
  siteUrl: () => process.env.NEXT_PUBLIC_SITE_URL || 'https://interiorcleanse.com',
}

/** True when every variable a feature needs is present. */
export const configured = {
  stripe: () => Boolean(process.env.STRIPE_SECRET_KEY),
  printful: () => Boolean(process.env.PRINTFUL_API_KEY),
  printify: () =>
    Boolean(process.env.PRINTIFY_API_KEY && process.env.PRINTIFY_SHOP_ID),
  brevo: () => Boolean(process.env.BREVO_API_KEY),
  anthropic: () => Boolean(process.env.ANTHROPIC_API_KEY),
}

/** Shapes an error into the JSON body every API route returns on failure. */
export function errorBody(e: unknown) {
  return { error: e instanceof Error ? e.message : 'Unexpected error' }
}
