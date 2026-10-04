import type { NextConfig } from 'next'
import { HEADERS_SOURCE, securityHeaders } from './lib/security/headers'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Fail the build on type errors rather than shipping them. Lint runs as its
  // own CI job; Next 16 no longer lints during the build.
  typescript: { ignoreBuildErrors: false },
  // Every page carries the hardening headers; the one exception (built-site
  // previews, which sandbox themselves) is excluded by the source pattern.
  // The list lives in lib/security/headers.ts so a test can hold it.
  async headers() {
    return [{ source: HEADERS_SOURCE, headers: securityHeaders() }]
  },
}

export default nextConfig
