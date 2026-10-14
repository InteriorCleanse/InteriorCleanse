/**
 * The product and brand playbook.
 *
 * One list of steps that takes a brand from a name to a business that runs
 * without its founder in every decision. It is copied into a workspace when
 * the operator starts it (see `seedRows`), so editing this file changes what
 * the *next* business starts with and never rewrites one already under way.
 *
 * Two kinds of brand share it. A physical product brand needs suppliers,
 * landed cost, labelling and fulfilment; a digital one needs none of those
 * and does need delivery and licence terms. Each step says which it applies
 * to, and a step that does not apply is never created rather than created
 * and skipped.
 *
 * Steps that touch law or tax say what to confirm and with whom. They are a
 * checklist, not advice: the right entity, registrations and labelling
 * depend on where the business is and what it sells.
 */

export const STAGES = [
  'foundation',
  'brand',
  'product',
  'storefront',
  'launch',
  'growth',
  'operations',
] as const

export type Stage = (typeof STAGES)[number]

export const STAGE_LABELS: Record<Stage, string> = {
  foundation: 'Foundation',
  brand: 'Brand',
  product: 'Product',
  storefront: 'Storefront',
  launch: 'Launch',
  growth: 'Growth',
  operations: 'Operations',
}

/** What each stage is for, in one line, shown above its steps. */
export const STAGE_PURPOSE: Record<Stage, string> = {
  foundation: 'The legal and money plumbing, set up once and kept separate from every other business.',
  brand: 'A name you can own, a promise you can prove, and a look people recognise.',
  product: 'Something you can make, deliver and price at a margin that survives advertising.',
  storefront: 'A place to buy it that takes payment, ships it and reports the figures back here.',
  launch: 'The first customers, on purpose rather than by accident.',
  growth: 'Channels that pay for themselves, with a rule for when to stop.',
  operations: 'The routines that let an agent or a hire run it while you watch.',
}

export const STATUSES = ['todo', 'doing', 'blocked', 'done', 'skipped'] as const
export type Status = (typeof STATUSES)[number]

export const STATUS_LABELS: Record<Status, string> = {
  todo: 'To do',
  doing: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
  skipped: 'Not needed',
}

export type BrandKind = 'physical' | 'digital'

export const BRAND_KIND_LABELS: Record<BrandKind, string> = {
  physical: 'Physical products',
  digital: 'Digital products',
}

export type TemplateStep = {
  key: string
  stage: Stage
  title: string
  detail: string
  appliesTo: 'all' | BrandKind
}

export const PLAYBOOK: readonly TemplateStep[] = [
  // ── Foundation ──────────────────────────────────────────────────────────
  {
    key: 'entity',
    stage: 'foundation',
    title: 'Form the business entity',
    detail:
      'Usually an LLC per operating brand, owned by your holding company if you have one. Get the EIN and a signed operating agreement. Confirm the structure with an accountant or attorney in your state.',
    appliesTo: 'all',
  },
  {
    key: 'bank',
    stage: 'foundation',
    title: 'Open a business bank account and card',
    detail:
      'One account per brand, never shared with another business or with personal spending. Mixed money is what makes the books, the taxes and liability protection fall apart.',
    appliesTo: 'all',
  },
  {
    key: 'bookkeeping',
    stage: 'foundation',
    title: 'Set up bookkeeping',
    detail:
      'Connect the bank and card to your bookkeeping tool, set a chart of accounts with cost of goods, shipping, fees and advertising as separate lines, and pick a day each month to close.',
    appliesTo: 'all',
  },
  {
    key: 'sales-tax',
    stage: 'foundation',
    title: 'Register for sales tax where you owe it',
    detail:
      'Your home state first, then any state where you pass its economic-nexus threshold. Many states tax digital goods too. Confirm with your accountant before the first sale, not after.',
    appliesTo: 'all',
  },
  {
    key: 'insurance',
    stage: 'foundation',
    title: 'Get product liability insurance',
    detail:
      'Retailers and marketplaces often require it before they will list you, and it is cheap compared with one claim. Get two quotes.',
    appliesTo: 'physical',
  },

  // ── Brand ───────────────────────────────────────────────────────────────
  {
    key: 'positioning',
    stage: 'brand',
    title: 'Write the one-line positioning',
    detail:
      'Who it is for, what it replaces, and the one reason to believe it. If it takes two sentences, it is not finished. This line goes into the agent’s focus so every briefing is judged against it.',
    appliesTo: 'all',
  },
  {
    key: 'name-clearance',
    stage: 'brand',
    title: 'Clear the name before spending on design',
    detail:
      'Search the trademark register in your classes, buy the domain, and claim the handles on the platforms you will sell through. File the trademark once the name survives the search.',
    appliesTo: 'all',
  },
  {
    key: 'identity',
    stage: 'brand',
    title: 'Logo, palette and type',
    detail:
      'A wordmark, a mark that works at favicon size, two or three colours with tested contrast, and one type family. Export a one-page brand sheet so every later asset matches.',
    appliesTo: 'all',
  },
  {
    key: 'claims',
    stage: 'brand',
    title: 'Write the three claims you can prove',
    detail:
      'Every claim on the pack, the site and in ads needs evidence on file. Health, environmental and "made in" claims are regulated; keep the substantiation with the product records.',
    appliesTo: 'all',
  },
  {
    key: 'photography',
    stage: 'brand',
    title: 'Real product photography',
    detail:
      'Shoot the actual product: a clean set on white for listings and a lifestyle set for the site and ads. Never sell with a stock photo of something that is not yours.',
    appliesTo: 'physical',
  },
  {
    key: 'previews',
    stage: 'brand',
    title: 'Previews that show what the buyer gets',
    detail:
      'Real screenshots, sample pages or a short walkthrough of the actual product. A mockup of something that does not exist yet is a pre-order and must say so.',
    appliesTo: 'digital',
  },

  // ── Product ─────────────────────────────────────────────────────────────
  {
    key: 'spec',
    stage: 'product',
    title: 'Freeze the spec and bill of materials',
    detail:
      'Every component, its supplier and its cost. A spec that is still moving cannot be quoted, and an unquoted product cannot be priced.',
    appliesTo: 'physical',
  },
  {
    key: 'supplier',
    stage: 'product',
    title: 'Two quotes, one sample round, terms in writing',
    detail:
      'Minimum order quantity, unit price at that quantity and the next tier, lead time, payment terms and who pays freight. Approve a production sample before paying the balance.',
    appliesTo: 'physical',
  },
  {
    key: 'landed-cost',
    stage: 'product',
    title: 'Work out landed cost per unit',
    detail:
      'Unit cost plus freight, duty, packaging and inbound handling, divided by units received. Enter it as the product cost here so every margin figure is real rather than revenue dressed up.',
    appliesTo: 'physical',
  },
  {
    key: 'compliance',
    stage: 'product',
    title: 'Labelling and category compliance',
    detail:
      'Food, supplements, cosmetics, children’s products and anything electrical each have their own labelling and testing rules, and some states add their own. Confirm what applies before printing packaging.',
    appliesTo: 'physical',
  },
  {
    key: 'build',
    stage: 'product',
    title: 'Build and test the deliverable',
    detail:
      'Have three people outside the business use it end to end and write down where they got stuck. Fix those before launch, not after the refund requests.',
    appliesTo: 'digital',
  },
  {
    key: 'licence',
    stage: 'product',
    title: 'Delivery and licence terms',
    detail:
      'How the buyer receives it, how many devices or seats, whether it updates, and what refunds look like for something that cannot be returned.',
    appliesTo: 'digital',
  },
  {
    key: 'pricing',
    stage: 'product',
    title: 'Price from margin, not from competitors',
    detail:
      'Start from landed cost, fees, shipping and a realistic cost to acquire a customer, and set the price that leaves the contribution margin you need. Then check it against the market, not the other way round.',
    appliesTo: 'all',
  },

  // ── Storefront ──────────────────────────────────────────────────────────
  {
    key: 'site',
    stage: 'storefront',
    title: 'Storefront live on your own domain',
    detail:
      'Shopify, your own site, or a one-page site the agent builds from a brief to start. It needs the product, the price, real photos and a working checkout — nothing more on day one.',
    appliesTo: 'all',
  },
  {
    key: 'payments',
    stage: 'storefront',
    title: 'Test a real purchase and a real refund',
    detail:
      'Buy your own product with a real card, confirm the payout reaches the business account, then refund it. Most launch-day failures are found this way for the price of one fee.',
    appliesTo: 'all',
  },
  {
    key: 'fulfilment',
    stage: 'storefront',
    title: 'Decide who packs, ships and handles returns',
    detail:
      'Self-fulfil, a third-party warehouse, or print-on-demand. Write down the cost per order and the promise you make about delivery time, and put both on the site.',
    appliesTo: 'physical',
  },
  {
    key: 'policies',
    stage: 'storefront',
    title: 'Shipping, returns, privacy and terms pages',
    detail:
      'Plain-language pages that match what you actually do. Payment processors and ad platforms check for them and will pause an account that has none.',
    appliesTo: 'all',
  },
  {
    key: 'tracking',
    stage: 'storefront',
    title: 'Analytics and conversion tracking',
    detail:
      'Purchase events firing to your analytics and to every ad platform you will use, verified with a test order. Ads bought without this are bought blind.',
    appliesTo: 'all',
  },
  {
    key: 'connect',
    stage: 'storefront',
    title: 'Connect the store to this workspace',
    detail:
      'Connect Stripe or Shopify under Integrations, or import an orders export and an ad-spend export under Import. From then on every figure, briefing and alert for this brand is computed from its own records.',
    appliesTo: 'all',
  },

  // ── Launch ──────────────────────────────────────────────────────────────
  {
    key: 'waitlist',
    stage: 'launch',
    title: 'Build a launch list before launch day',
    detail:
      'An email or SMS waitlist with a reason to join. A launch to a list converts; a launch to nobody is a soft opening.',
    appliesTo: 'all',
  },
  {
    key: 'content',
    stage: 'launch',
    title: 'Launch content ready in advance',
    detail:
      'The founder story, ten posts, three short videos and the launch email, written and scheduled before the day so launch day is spent answering customers.',
    appliesTo: 'all',
  },
  {
    key: 'seeding',
    stage: 'launch',
    title: 'Put product in twenty hands for honest reviews',
    detail:
      'Creators and early customers who match the positioning. Paid or gifted endorsements must be disclosed as such.',
    appliesTo: 'physical',
  },
  {
    key: 'first-orders',
    stage: 'launch',
    title: 'Ship the first ten orders and read every reply',
    detail:
      'Watch each order from payment to doorstep and ask each buyer one question. The first ten tell you more than the next thousand.',
    appliesTo: 'all',
  },

  // ── Growth ──────────────────────────────────────────────────────────────
  {
    key: 'paid-test',
    stage: 'growth',
    title: 'First paid test, with a kill rule',
    detail:
      'A fixed budget, one channel, and the cost per customer or ROAS at which you stop. Set that floor as an alert here so the agent tells you the day it is crossed.',
    appliesTo: 'all',
  },
  {
    key: 'email-flows',
    stage: 'growth',
    title: 'Welcome, abandoned-cart and post-purchase emails',
    detail:
      'The three automations that earn money while you sleep. Write them once in the brand voice and review them every quarter.',
    appliesTo: 'all',
  },
  {
    key: 'reviews',
    stage: 'growth',
    title: 'Collect reviews after delivery',
    detail:
      'Ask once the product has arrived and been used, not at checkout. Show the honest ones, including the three-star ones.',
    appliesTo: 'all',
  },
  {
    key: 'repeat',
    stage: 'growth',
    title: 'Give customers a reason to come back',
    detail:
      'A refill, a subscription, a bundle or the next product. Repeat customers are what make the cost of the first order worth paying.',
    appliesTo: 'all',
  },

  // ── Operations ──────────────────────────────────────────────────────────
  {
    key: 'agent',
    stage: 'operations',
    title: 'Give the brand its own agent and standing orders',
    detail:
      'Name its analyst, write its focus and the rules it should watch — margin floor, refund ceiling, which campaign is judged on what — and keep it reporting to your mission control.',
    appliesTo: 'all',
  },
  {
    key: 'weekly-review',
    stage: 'operations',
    title: 'A weekly numbers review, on a schedule',
    detail:
      'Subscribe to the weekly briefing and keep a standing half hour to read it and decide one thing. A business reviewed every week rarely surprises its owner.',
    appliesTo: 'all',
  },
  {
    key: 'inventory',
    stage: 'operations',
    title: 'Reorder point for every product',
    detail:
      'Daily sales times supplier lead time, plus a safety margin. Stocking out on a product that ads are paying to sell is the most expensive mistake in physical retail.',
    appliesTo: 'physical',
  },
  {
    key: 'monthly-close',
    stage: 'operations',
    title: 'Monthly close and profit review',
    detail:
      'Reconcile the books to the bank, compare the profit here with the profit in the books, and explain any gap before it compounds.',
    appliesTo: 'all',
  },
  {
    key: 'estimated-tax',
    stage: 'operations',
    title: 'Quarterly estimated taxes',
    detail:
      'Put a share of profit aside every month and pay the estimates on time. Ask your accountant for the percentage that fits this business.',
    appliesTo: 'all',
  },
  {
    key: 'sops',
    stage: 'operations',
    title: 'Write the playbook down so someone else can run it',
    detail:
      'Order handling, customer service replies, reordering and the weekly review, each as a short checklist. That is what lets an agent or a hire take over without you.',
    appliesTo: 'all',
  },
] as const

/** The steps a brand of this kind starts with, in playbook order. */
export function stepsFor(kind: BrandKind): TemplateStep[] {
  return PLAYBOOK.filter((s) => s.appliesTo === 'all' || s.appliesTo === kind)
}

/** The kind a workspace most likely is, from what it said at creation. */
export function kindForBusinessType(businessType: string | null | undefined): BrandKind {
  return businessType === 'digital_products' || businessType === 'content' ? 'digital' : 'physical'
}

/**
 * Rows to insert for a playbook start. Position is the index within the
 * stage, spaced by ten so a step added later can sit between two.
 */
export function seedRows(input: {
  organizationId: string
  userId: string
  kind: BrandKind
}): {
  organization_id: string
  stage: Stage
  template_key: string
  title: string
  detail: string
  position: number
  created_by: string
}[] {
  const perStage = new Map<Stage, number>()
  return stepsFor(input.kind).map((step) => {
    const index = perStage.get(step.stage) ?? 0
    perStage.set(step.stage, index + 1)
    return {
      organization_id: input.organizationId,
      stage: step.stage,
      template_key: step.key,
      title: step.title,
      detail: step.detail,
      position: (index + 1) * 10,
      created_by: input.userId,
    }
  })
}
