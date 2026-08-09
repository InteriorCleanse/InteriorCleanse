import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { publicEnv } from '@/lib/env'

/** POST-only: a GET sign-out can be triggered by any <img> tag on any site. */
export async function POST() {
  const supabase = await supabaseServer()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', publicEnv().NEXT_PUBLIC_SITE_URL), {
    status: 303,
  })
}
