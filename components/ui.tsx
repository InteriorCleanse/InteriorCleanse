import Link from 'next/link'
import type { ReactNode } from 'react'

export function Panel({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-panel border border-hairline bg-panel p-6 shadow-panel ${className}`}
    >
      {children}
    </section>
  )
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-signal">
      {children}
    </p>
  )
}

const BUTTON_BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50'

const VARIANTS = {
  primary: 'bg-signal text-ground hover:brightness-110',
  secondary: 'border border-hairline bg-panelRaised text-ink hover:border-signal',
  ghost: 'text-muted hover:text-ink',
} as const

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS }) {
  return (
    <button className={`${BUTTON_BASE} ${VARIANTS[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

export function ButtonLink({
  href,
  children,
  variant = 'primary',
  className = '',
}: {
  href: string
  children: ReactNode
  variant?: keyof typeof VARIANTS
  className?: string
}) {
  return (
    <Link href={href} className={`${BUTTON_BASE} ${VARIANTS[variant]} ${className}`}>
      {children}
    </Link>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-muted">{hint}</span> : null}
    </label>
  )
}

export const inputClass =
  'w-full rounded-lg border border-hairline bg-panelRaised px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted focus:border-signal'

/**
 * Honest state for a surface whose data source is not configured. The spec
 * forbids ever showing fake live success, so unconfigured says so plainly and
 * links to the fix.
 */
export function NotConfigured({
  what,
  steps,
}: {
  what: string
  steps: string[]
}) {
  return (
    <Panel className="border-amber/40">
      <Eyebrow>Not configured</Eyebrow>
      <h2 className="text-lg font-semibold text-ink">{what} is not connected yet</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Nothing is being shown here because there is no real data to show. This screen will not
        display sample numbers in place of live ones.
      </p>
      <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-muted">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </Panel>
  )
}

export function DemoBadge() {
  return (
    <span className="rounded-full border border-amber/50 bg-amber/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber">
      Demo data
    </span>
  )
}
