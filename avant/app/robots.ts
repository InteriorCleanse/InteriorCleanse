import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const open = process.env.AVANT_INDEXABLE === '1'
  return { rules: open ? { userAgent: '*', allow: '/', disallow: ['/api/', '/checkout/', '/account', '/trips'] } : { userAgent: '*', disallow: '/' } }
}
