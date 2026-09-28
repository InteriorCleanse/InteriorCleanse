import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Freehold',
    short_name: 'Freehold',
    description: 'Software you own outright.',
    start_url: '/',
    display: 'browser',
    background_color: '#F2F3F0',
    theme_color: '#15171C',
    icons: [{ src: '/brand/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }
}
