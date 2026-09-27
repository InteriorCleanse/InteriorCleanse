import { SITE } from '@/lib/site'

export const dynamic = 'force-static'

export function GET() {
  const body = `# Freehold

> Software you own outright. A one-person software firm with two lines of work.

## Freehold Build
An app builder for people burned by hosted builders. Describe the app; it is generated as a Next.js repository in the customer's GitHub, a Postgres database in their account, a deployment on their Vercel, on their own Anthropic API key. The customer is never charged by Freehold for a build the AI could not finish. Not launched; waitlist at ${SITE.url}/build/.

## Freehold Private
Bespoke software for family offices and the people who run them, delivered into the client's own infrastructure. Starts with a fixed-fee digital footprint and email security review, two weeks, in writing. Fees quoted after a twenty-minute call. ${SITE.url}/private/

## Facts
- One person. No client names or testimonials are published.
- No prices are published until they are final.
- Nothing the firm builds runs on the firm's servers.
- Contact: ${SITE.email}

## Pages
- ${SITE.url}/
- ${SITE.url}/build/
- ${SITE.url}/private/
- ${SITE.url}/about/
- ${SITE.url}/contact/
`
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
