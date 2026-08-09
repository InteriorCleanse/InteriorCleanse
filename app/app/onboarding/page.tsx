import { redirect } from 'next/navigation'
import { z } from 'zod'
import { Button, Eyebrow, Field, inputClass, Panel } from '@/components/ui'
import { requireSession } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'

export const metadata = { title: 'Onboarding' }

const BUSINESS_TYPES = [
  ['ecommerce', 'Ecommerce'],
  ['digital_products', 'Digital products'],
  ['services', 'Services'],
  ['content', 'Content'],
  ['marketplace', 'Marketplace'],
  ['other', 'Other'],
] as const

const CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD'] as const

const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(1, 'Give your workspace a name').max(120),
  businessType: z.enum(BUSINESS_TYPES.map((b) => b[0]) as unknown as [string, ...string[]]),
  currency: z.enum(CURRENCIES),
  timezone: z.string().trim().min(1).max(64),
  isDemo: z.boolean(),
})

/** Slug is derived server-side; a client-supplied slug is a tenant-collision vector. */
function toSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  const stem = base.length >= 2 ? base : 'workspace'
  // Short random suffix keeps slugs unique without leaking a tenant count,
  // which a sequential id would.
  return `${stem}-${Math.random().toString(36).slice(2, 8)}`
}

async function createWorkspace(formData: FormData) {
  'use server'

  const session = await requireSession()

  const parsed = CreateWorkspaceSchema.safeParse({
    name: String(formData.get('name') ?? ''),
    businessType: String(formData.get('businessType') ?? 'other'),
    currency: String(formData.get('currency') ?? 'USD'),
    timezone: String(formData.get('timezone') ?? 'UTC'),
    isDemo: formData.get('isDemo') === 'on',
  })

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Check your details'
    redirect(`/app/onboarding?error=${encodeURIComponent(message)}`)
  }

  const supabase = await supabaseServer()

  // created_by must be the session user: the RLS insert policy requires
  // created_by = auth.uid(), and a trigger makes that user the tenant_owner.
  const { error } = await supabase.from('organizations').insert({
    name: parsed.data.name,
    slug: toSlug(parsed.data.name),
    business_type: parsed.data.businessType,
    base_currency: parsed.data.currency,
    timezone: parsed.data.timezone,
    is_demo: parsed.data.isDemo,
    created_by: session.userId,
  })

  if (error) {
    redirect(`/app/onboarding?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/app/command-center')
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const [session, params] = await Promise.all([requireSession(), searchParams])
  const hasWorkspace = session.memberships.length > 0

  return (
    <div className="mx-auto max-w-2xl">
      <Eyebrow>Step 1 of 8</Eyebrow>
      <h1 className="text-3xl font-semibold">
        {hasWorkspace ? 'Create another workspace' : 'Create your workspace'}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        A workspace holds one business: its data sources, costs, goals, and team. You can start
        with a demo workspace and connect real sources later — you will never be forced to connect
        everything before seeing value.
      </p>

      {params.error ? (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-negative"
        >
          {params.error}
        </p>
      ) : null}

      <Panel className="mt-6">
        <form action={createWorkspace} className="space-y-5">
          <Field label="Workspace name">
            <input className={inputClass} name="name" placeholder="Northwind Trading" required />
          </Field>

          <Field label="Business type">
            <select className={inputClass} name="businessType" defaultValue="ecommerce">
              {BUSINESS_TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Reporting currency" hint="Figures are normalised to this.">
              <select className={inputClass} name="currency" defaultValue="USD">
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Timezone" hint="Determines what counts as 'today'.">
              <input className={inputClass} name="timezone" defaultValue="UTC" required />
            </Field>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-hairline bg-panelRaised p-3">
            <input type="checkbox" name="isDemo" className="mt-1" />
            <span className="text-sm">
              <span className="font-medium text-ink">Make this a demo workspace</span>
              <span className="mt-1 block text-muted">
                Fills the workspace with synthetic data for exploring the product. It is labeled as
                demo everywhere and its numbers are never presented as real.
              </span>
            </span>
          </label>

          <Button type="submit" className="w-full">
            Create workspace
          </Button>
        </form>
      </Panel>

      <p className="mt-6 text-xs leading-relaxed text-muted">
        Remaining onboarding steps — connecting a source, entering COGS, setting a budget and
        profit goal, alert preferences, and your first executive briefing — arrive with
        Checkpoints 2 and 4. See <code>docs/IMPLEMENTATION_PLAN.md</code>.
      </p>
    </div>
  )
}
