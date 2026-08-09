import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { publicEnv, serverEnv } from '@/lib/env'

/**
 * Server-side Supabase clients.
 *
 * `supabaseServer()` acts as the signed-in user, so every query it runs is
 * subject to RLS. This is the client almost all application code should use —
 * if a query returns nothing, that is the isolation model working.
 *
 * `supabaseAdmin()` bypasses RLS entirely. It exists for exactly two jobs:
 * the owner bootstrap and Stripe webhook reconciliation, where there is no
 * user session to act as. Every call site must do its own authorization first.
 */

export async function supabaseServer() {
  const env = publicEnv()
  const cookieStore = await cookies()

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Session refresh is handled by middleware instead; ignoring this is
          // the documented pattern rather than an error worth surfacing.
        }
      },
    },
  })
}

/**
 * Service-role client. Bypasses RLS — never expose to the browser, never call
 * on behalf of a request without checking authorization first.
 */
export function supabaseAdmin() {
  const pub = publicEnv()
  const srv = serverEnv()

  return createClient(pub.NEXT_PUBLIC_SUPABASE_URL, srv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
