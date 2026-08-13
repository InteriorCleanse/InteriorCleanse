import { z } from 'zod'

/**
 * Environment access.
 *
 * Two rules this file exists to enforce:
 *
 *  1. The service-role key must never reach the browser. It is read through
 *     `serverEnv()`, which throws if called in a client bundle, and it has no
 *     NEXT_PUBLIC_ prefix so Next will not inline it.
 *  2. A missing variable fails loudly at the point of use, not silently at
 *     request time with a confusing downstream error. Validation is lazy so
 *     `next build` succeeds without credentials — the spec requires connectors
 *     to be buildable and testable while unconfigured.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_APP_NAME: z.string().default('AURELIS OS'),
  NEXT_PUBLIC_ASSISTANT_NAME: z.string().default('Aurelis'),
})

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  PLATFORM_OWNER_EMAILS: z.string().default(''),
})

/**
 * Assistant configuration is validated separately from the rest of the server
 * env. Without it the product is still a working analytics workspace — the
 * dashboards, imports and briefings all compute locally — so a missing model
 * key must degrade one surface, not break the boot.
 */
const assistantSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(20),
  ASSISTANT_MODEL: z.string().default('claude-opus-5'),
  ASSISTANT_MAX_TOKENS: z.coerce.number().int().min(1_024).max(32_000).default(8_000),
})

export type AssistantEnv = z.infer<typeof assistantSchema>

export type PublicEnv = z.infer<typeof publicSchema>
export type ServerEnv = z.infer<typeof serverSchema>

function fail(scope: string, error: z.ZodError): never {
  const missing = error.issues.map((i) => i.path.join('.')).join(', ')
  throw new Error(
    `Missing or invalid ${scope} environment variables: ${missing}. ` +
      'Copy .env.example to .env.local and fill them in — see README.md.',
  )
}

/**
 * Browser-safe configuration. Values are read individually rather than from a
 * loop because Next inlines `process.env.NEXT_PUBLIC_*` only for literal
 * property accesses; a dynamic lookup silently yields undefined in the client.
 */
export function publicEnv(): PublicEnv {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_ASSISTANT_NAME: process.env.NEXT_PUBLIC_ASSISTANT_NAME,
  })
  if (!parsed.success) fail('public', parsed.error)
  return parsed.data
}

/** Server-only configuration. Throws if reached from a client bundle. */
export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() was called in the browser. This is a bug — it reads secrets.')
  }
  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    PLATFORM_OWNER_EMAILS: process.env.PLATFORM_OWNER_EMAILS,
  })
  if (!parsed.success) fail('server', parsed.error)
  return parsed.data
}

/** Server-only assistant configuration. Throws if reached from a client bundle. */
export function assistantEnv(): AssistantEnv {
  if (typeof window !== 'undefined') {
    throw new Error('assistantEnv() was called in the browser. This is a bug — it reads a secret.')
  }
  const parsed = assistantSchema.safeParse({
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ASSISTANT_MODEL: process.env.ASSISTANT_MODEL,
    ASSISTANT_MAX_TOKENS: process.env.ASSISTANT_MAX_TOKENS,
  })
  if (!parsed.success) fail('assistant', parsed.error)
  return parsed.data
}

/** True when the assistant can call a model — lets the dock explain itself when it cannot. */
export function isAssistantConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

/** True when Supabase is configured — lets surfaces render an honest Not Configured state. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}

/** Branding is configurable without touching application code, per the spec. */
export const branding = {
  appName: () => process.env.NEXT_PUBLIC_APP_NAME || 'AURELIS OS',
  assistantName: () => process.env.NEXT_PUBLIC_ASSISTANT_NAME || 'Aurelis',
}

/** Emails permitted to claim platform ownership, normalised and de-duplicated. */
export function platformOwnerEmails(): string[] {
  const raw = process.env.PLATFORM_OWNER_EMAILS ?? ''
  return Array.from(
    new Set(
      raw
        .split(/[,\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes('@')),
    ),
  )
}
