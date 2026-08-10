import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site-config'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // The admin is password-gated by middleware; keeping it out of the index
      // stops the login page appearing in results.
      disallow: ['/admin/', '/api/'],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  }
}
