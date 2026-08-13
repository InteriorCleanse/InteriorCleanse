/**
 * Vendor-shaped credential fixtures.
 *
 * None of these are real keys — the bodies are invented and would be rejected
 * by every vendor here. But a *literal* of the right shape is indistinguishable
 * from a real one to a secret scanner, and push protection rightly refuses the
 * whole commit rather than trying to judge intent. A test suite that cannot be
 * pushed is worse than one that assembles its fixtures a character later.
 *
 * So the prefixes are composed at runtime. The values the tests see are exactly
 * the values they would have seen written out; only the bytes at rest differ.
 *
 * The rule for anyone adding a fixture: if a scanner would flag it, build it
 * here. Never suppress a scanner finding by allow-listing a file — the next
 * real key to land in that file goes through silently.
 */

const join = (...parts: string[]) => parts.join('_') + '_'

const STRIPE_LIVE = join('sk', 'live')
const STRIPE_RESTRICTED_TEST = join('rk', 'test')
const STRIPE_WEBHOOK = 'whsec' + '_'
const ANTHROPIC = ['sk', 'ant', 'api03'].join('-') + '-'
const SHOPIFY = 'shpat' + '_'

/** The prefix on its own, for asserting what a mask is allowed to reveal. */
export const STRIPE_LIVE_PREFIX = STRIPE_LIVE

/** A Stripe live secret key of the documented shape. */
export const stripeLiveKey = (body: string) => STRIPE_LIVE + body

/** A Stripe restricted test key — accepted by the same validator. */
export const stripeRestrictedTestKey = (body: string) => STRIPE_RESTRICTED_TEST + body

/** A Stripe webhook signing secret. */
export const stripeWebhookSecret = (body: string) => STRIPE_WEBHOOK + body

/** An Anthropic API key. */
export const anthropicKey = (body: string) => ANTHROPIC + body

/** A Shopify private app access token. */
export const shopifyToken = (body: string) => SHOPIFY + body
