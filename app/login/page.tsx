import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button, Field, inputClass, NotConfigured, Panel } from '@/components/ui'
import { branding, isSupabaseConfigured } from '@/lib/env'
import { supabaseServer } from '@/lib/supabase/server'

export const metadata = { title: 'Sign in' }

/**
 * Credentials are handled in a Server Action, so the password is posted to the
 * server and never enters client JavaScript or a client-side Supabase call.
 */
async function signIn(formData: FormData) {
  'use server'

  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const next = String(formData.get('next') ?? '/app/command-center')

  if (!email || !password) redirect('/login?error=Enter%20your%20email%20and%20password')

  const supabase = await supabaseServer()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Deliberately generic: distinguishing "no such user" from "wrong password"
    // turns the login form into an account-enumeration oracle.
    redirect('/login?error=Those%20details%20did%20not%20match%20an%20account')
  }

  redirect(next.startsWith('/') ? next : '/app/command-center')
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const params = await searchParams

  return (
    <main className="field-bg flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 block text-sm font-semibold tracking-[0.18em]">
          {branding.appName().toUpperCase()}
        </Link>

        {!isSupabaseConfigured() ? (
          <NotConfigured
            what="Authentication"
            steps={[
              'Create a Supabase project at supabase.com',
              'Copy the project URL and anon key into .env.local',
              'Run the migrations in supabase/migrations',
              'Restart the dev server',
            ]}
          />
        ) : (
          <Panel>
            <h1 className="text-2xl font-semibold">Sign in</h1>
            <p className="mt-1.5 text-sm text-muted">Welcome back.</p>

            {params.error ? (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative"
              >
                {params.error}
              </p>
            ) : null}

            <form action={signIn} className="mt-6 space-y-4">
              <input type="hidden" name="next" value={params.next ?? '/app/command-center'} />
              <Field label="Email">
                <input
                  className={inputClass}
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                />
              </Field>
              <Field label="Password">
                <input
                  className={inputClass}
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                />
              </Field>
              <Button type="submit" className="w-full">
                Sign in
              </Button>
            </form>

            <p className="mt-6 text-sm text-muted">
              No account?{' '}
              <Link className="text-signal hover:underline" href="/signup">
                Create one
              </Link>
            </p>
          </Panel>
        )}
      </div>
    </main>
  )
}
