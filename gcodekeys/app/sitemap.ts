import type { MetadataRoute } from 'next'

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gcodekeys.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return ['/', '/coverage/', '/how-it-works/', '/faq/', '/checkout/'].map((p) => ({
    url: `${SITE}${p}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: p === '/' ? 1 : 0.7,
  }))
}
