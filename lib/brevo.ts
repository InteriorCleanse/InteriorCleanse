import { env } from './env'

/**
 * Brevo (contacts + transactional email).
 *
 * Brevo answers 201 on create and 204 on update-existing, so success is
 * `res.ok`, never `status === 200` — checking for 200 rejects every
 * successful write.
 */

const BASE = 'https://api.brevo.com/v3'

async function brevo(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'api-key': env.brevoKey(),
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Brevo ${path} failed: ${res.status} ${body}`)
  }

  // 204 has no body; JSON.parse('') would throw.
  const text = await res.text()
  return text ? JSON.parse(text) : {}
}

export type ContactAttributes = Record<string, string | number | undefined>

export async function upsertContact(params: {
  email: string
  attributes?: ContactAttributes
  listIds?: number[]
}) {
  const attributes = Object.fromEntries(
    Object.entries(params.attributes ?? {}).filter(([, v]) => v !== undefined)
  )

  return brevo('/contacts', {
    method: 'POST',
    body: JSON.stringify({
      email: params.email,
      attributes,
      listIds: params.listIds,
      updateEnabled: true,
    }),
  })
}

export async function listContacts(limit = 100, offset = 0) {
  return brevo(`/contacts?limit=${limit}&offset=${offset}&sort=desc`)
}

export async function sendTransactionalEmail(params: {
  to: string
  name?: string
  subject: string
  htmlContent: string
}) {
  return brevo('/smtp/email', {
    method: 'POST',
    body: JSON.stringify({
      sender: { name: 'InteriorCleanse', email: 'hello@interiorcleanse.com' },
      to: [{ email: params.to, name: params.name || params.to }],
      subject: params.subject,
      htmlContent: params.htmlContent,
    }),
  })
}
