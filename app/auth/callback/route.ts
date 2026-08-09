import { NextResponse, type NextRequest } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

/** Email-confirmation and magic-link landing. Exchanges the code for a session. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/app/command-center'

  if (!code) return NextResponse.redirect(`${origin}/login?error=Missing%20confirmation%20code`)

  const supabase = await supabaseServer()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`)
  }

  // Only same-origin relative paths, or this becomes an open redirect.
  const target = next.startsWith('/') && !next.startsWith('//') ? next : '/app/command-center'
  return NextResponse.redirect(`${origin}${target}`)
}
