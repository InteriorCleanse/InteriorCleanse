import type { MetadataRoute } from 'next'

/** Lets AVANT be added to a home screen and open like an app, outside the App Store too. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AVANT',
    short_name: 'AVANT',
    description: 'Book the exact car you want, from a neighbour. The whole price up front.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { src: '/app-icon.png', type: 'image/png', sizes: '1024x1024', purpose: 'any' },
    ],
  }
}
