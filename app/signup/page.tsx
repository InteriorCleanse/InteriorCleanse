import Link from 'next/link'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { Button, Field, inputClass, NotConfigured, Panel } from '@/components/ui'
import { branding, isSupabaseConfigured } from '@/lib/env'
import { supabaseServer } from '@/lib/supabase/server'

export const metadata = { title: 'Create your workspace' }

const SignupSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  // Length beats composition rules: a long passphrase is stronger than a short
  // string with a symbol bolted on, and users defeat composition rules anyway.
  password: z.string().min(12, 'Use at least 12 characters'),
  fullName: z.string().trim().max(120).optional(),
})

async function signUp(formData: FormData) {
  'use server'

  const parsed = SignupSchema.safeParse({
    email: String(formData.get('email') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
    fullName: String(formData.get('fullName') ?? '').trim() || undefined,
  })

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Check your details'
    redirect(`/signup?error=${encodeURIComponent(message)}`)
  }

  const supabase = await supabaseServer()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName ?? null } },
  })

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`)
  }

  // With email confirmation enabled there is no session yet, so onboarding
  // would bounce straight back to /login. Send them to a page that says so.
  redirect('/login?error=Check%20your%20email%20to%20confirm%2C%20then%20sign%20in')
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
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
            <h1 className="text-2xl font-semibold">Create your workspace</h1>
            <p className="mt-1.5 text-sm text-muted">
              Takes under five minutes. You can explore with a demo workspace before connecting
              anything real.
            </p>

            {params.error ? (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative"
              >
                {params.error}
              </p>
            ) : null}

            <form action={signUp} className="mt-6 space-y-4">
              <Field label="Your name" hint="Optional">
                <input className={inputClass} name="fullName" autoComplete="name" />
              </Field>
              <Field label="Email">
                <input
                  className={inputClass}
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                />
              </Field>
              <Field label="Password" hint="At least 12 characters. A passphrase works well.">
                <input
                  className={inputClass}
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              </Field>
              <Button type="submit" className="w-full">
                Create account
              </Button>
            </form>

            <p className="mt-6 text-sm text-muted">
              Already have an account?{' '}
              <Link className="text-signal hover:underline" href="/login">
                Sign in
              </Link>
            </p>
          </Panel>
        )}
      </div>
    </main>
  )
}
