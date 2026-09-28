import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return ['/', '/build/', '/private/', '/private/review/', '/discretion/', '/about/', '/contact/', '/privacy/', '/terms/'].map((p) => ({
    url: `${SITE.url}${p}`,
    lastModified: now,
    changeFrequency: p === '/' ? 'weekly' : 'monthly',
    priority: p === '/' ? 1 : p === '/build/' || p === '/private/' ? 0.9 : 0.5,
  }))
}
