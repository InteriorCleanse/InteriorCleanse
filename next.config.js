/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: `output: 'export'` was removed deliberately. Static export has no
  // server, so API routes, middleware, and the Stripe webhook cannot exist
  // under it — Next fails the build. The site now needs a Node runtime
  // (Vercel); the GitHub Pages workflow can no longer deploy it.
  trailingSlash: true,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }],
  },
}

module.exports = nextConfig
