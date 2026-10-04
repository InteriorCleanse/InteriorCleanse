/**
 * RFC 9116 security.txt: how researchers report a vulnerability. Set
 * AVANT_SECURITY_CONTACT (an email address) in production.
 */

export const dynamic = 'force-dynamic'

export function GET() {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://example.com').replace(/\/$/, '')
  const contact = process.env.AVANT_SECURITY_CONTACT || `security@${new URL(site).hostname}`
  const expires = new Date(Date.now() + 180 * 86_400_000).toISOString()
  const body = [
    `Contact: mailto:${contact}`,
    `Expires: ${expires}`,
    `Policy: ${site}/security`,
    'Preferred-Languages: en',
    `Canonical: ${site}/.well-known/security.txt`,
    '',
  ].join('\n')
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' } })
}
