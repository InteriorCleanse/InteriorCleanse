import type { MetadataRoute } from 'next'
import { allBooks, allProducts, articles } from '@/lib/content'
import { SITE } from '@/lib/site-config'

/** `trailingSlash: true` is set in next.config.js, so every URL here carries one. */
const url = (path: string) => `${SITE.url}${path}`

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPaths = [
    ['/', 1],
    ['/shop/', 0.9],
    ['/library/', 0.9],
    ['/spirit/', 0.8],
    ['/journal/', 0.7],
    ['/about/', 0.6],
    ['/contact/', 0.5],
    ['/legal/privacy-policy/', 0.2],
    ['/legal/terms/', 0.2],
    ['/legal/affiliate-disclosure/', 0.2],
  ] as const

  return [
    ...staticPaths.map(([path, priority]) => ({
      url: url(path),
      lastModified: new Date(),
      priority,
    })),
    ...allProducts.map((p) => ({
      url: url(`/shop/${p.slug}/`),
      lastModified: new Date(),
      priority: 0.8,
    })),
    ...allBooks.map((b) => ({
      url: url(`/library/${b.slug}/`),
      lastModified: new Date(),
      priority: 0.7,
    })),
    ...articles.map((a) => ({
      url: url(`/journal/${a.slug}/`),
      lastModified: new Date(a.date),
      priority: 0.5,
    })),
  ]
}
