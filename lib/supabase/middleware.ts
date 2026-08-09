import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase session cookie on every matched request and returns
 * both the response carrying updated cookies and the resolved user.
 *
 * Server Components cannot write cookies, so without this the access token
 * expires and the user is silently signed out mid-session.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Unconfigured deployments must still serve the public site rather than 500.
  if (!url || !anonKey) return { response, user: null, configured: false as const }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // getUser() revalidates against the auth server. getSession() only decodes
  // the cookie, so it trusts a value the browser could have tampered with.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { response, user, configured: true as const }
}
