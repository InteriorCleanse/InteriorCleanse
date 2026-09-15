import { publishedProducts } from '@/lib/catalog'
import { allBooks, articles, digitalProducts, gumroadUrl } from '@/lib/content'
import { SITE } from '@/lib/site-config'

/**
 * /llms.txt — the site described for AI crawlers, citation engines, and
 * browsing agents, in the llms.txt convention: an H1, a blockquote summary,
 * then sections of links with one-line descriptions.
 *
 * Built from the same sources as the pages, so it cannot drift from them:
 * only published catalog products appear, drafts never do, and prices are
 * the storefront's prices. Regenerates on every deploy (static route).
 */
export const dynamic = 'force-static'

const line = (label: string, path: string, note: string) => `- [${label}](${SITE.url}${path}): ${note}`

export function GET() {
  const products = publishedProducts()
  const body = [
    `# ${SITE.name}`,
    '',
    `> ${SITE.name} is a small editorial storefront for a considered home: hand-poured candles, a few objects, interior design and home-organizing books written by the founder, digital downloads, and curated cleaning finds. Four tracks: mind, home, body, and spirit. ${SITE.url}`,
    '',
    'Products are sold through Stripe checkout on this site, through Amazon for books, through Gumroad for downloads, and through disclosed affiliate partners. Only products marked published appear on the storefront; nothing below is a draft.',
    '',
    '## Shop',
    ...products.map((p) =>
      line(p.name, `/shop/${p.slug}/`, `${p.tagline ? p.tagline + ' ' : ''}$${p.price} ${p.currency}. ${p.description}`.trim()),
    ),
    '',
    '## Books',
    ...allBooks.map((b) => line(b.title, `/library/${b.slug}/`, `${b.subtitle}. ${b.hook}`)),
    '',
    '## Downloads',
    ...digitalProducts.map((d) => line(d.title, gumroadUrl(d), `${d.subtitle}. ${d.price}. ${d.format}.`)),
    '',
    '## Journal',
    ...articles.map((a) => line(a.title, `/journal/${a.slug}/`, a.excerpt)),
    '',
    '## Pages',
    line('Shop', '/shop/', 'Every product in one grid with filters.'),
    line('The Library', '/library/', 'Interior design and home-organizing books, with paperback and Kindle links.'),
    line('The Faith Library', '/spirit/', 'Christian books, Bibles, devotionals, and coloring books.'),
    line('Partners', '/partners/', 'Affiliate partners in sauna, cold plunge, and furniture. Only approved links are shown; commissions are disclosed.'),
    line('About', '/about/', 'Who makes InteriorCleanse and why.'),
    line('Contact', '/contact/', `Email ${SITE.contactEmail}.`),
    line('Returns', '/legal/returns/', 'How returns work, including for products bought through Amazon or TikTok Shop.'),
    line('Affiliate disclosure', '/legal/affiliate-disclosure/', SITE.affiliateDisclosure),
    '',
    '## Optional',
    line('Sitemap', '/sitemap.xml', 'Every indexable URL.'),
    line('Product data (JSON-LD)', '/shop/', 'Each product page carries schema.org Product markup with price and availability.'),
    '',
  ].join('\n')

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
    },
  })
}
