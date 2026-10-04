import type { Signal, SignalSeverity } from '@/lib/signals'
import { needsAttention, statusHealth, type CompanySummary } from './portfolio'

/**
 * Mission control: every company, watched by one assistant.
 *
 * The owner's view is the portfolio summary plus what each company's own
 * analyst is seeing — its signals, its name, whether it reports in. Pure,
 * like the portfolio module it extends: rows in, a watch-list out, no reach
 * into any database. The owner page and the owner's `portfolio_overview`
 * tool both render this, so the screen and the spoken answer agree.
 *
 * A company's standing is the worse of its billing health and its loudest
 * signal. Real workspaces without computed figures are `unknown`, never
 * "healthy": a company nobody is measuring is not a company doing fine.
 */

export type Standing = 'critical' | 'watch' | 'healthy' | 'unknown'

export type WatchedCompany = CompanySummary & {
  /** The analyst's name in that workspace, or the deployment's. */
  agentName: string
  reportsToOwner: boolean
  /** The workspace's own signals, when it has figures to compute them from. */
  signals: Signal[]
}

export type CompanyWatch = WatchedCompany & {
  standing: Standing
  /** One sentence the owner can act on. */
  headline: string
}

export type Mission = {
  companies: CompanyWatch[]
  /** Critical first, then watch; demo companies after real ones at equal standing. */
  needsYou: CompanyWatch[]
  counts: Record<Standing, number>
  /** "Arch is watching 6 companies; 2 need you." */
  summary: string
}

const RANK: Record<Standing, number> = { critical: 0, watch: 1, unknown: 2, healthy: 3 }

function loudest(signals: readonly Signal[]): SignalSeverity | null {
  if (signals.some((s) => s.severity === 'critical')) return 'critical'
  if (signals.some((s) => s.severity === 'warning')) return 'warning'
  if (signals.length > 0) return 'info'
  return null
}

export function standingFor(company: WatchedCompany): Standing {
  const billing = statusHealth(company.subscriptionStatus)
  const signal = loudest(company.signals)
  if (signal === 'critical') return 'critical'
  if (needsAttention(company) || signal === 'warning') return 'watch'
  if (company.netRevenueMinor === null) return 'unknown'
  if (billing === 'healthy' || company.isDemo) return 'healthy'
  return 'watch'
}

export function headlineFor(company: WatchedCompany, standing: Standing): string {
  const critical = company.signals.find((s) => s.severity === 'critical')
  if (critical) return critical.title
  if (needsAttention(company)) return `Subscription ${company.subscriptionStatus.replace(/_/g, ' ')}`
  const warning = company.signals.find((s) => s.severity === 'warning')
  if (warning) return warning.title
  if (standing === 'unknown') return 'No data source connected yet'
  if (!company.reportsToOwner) return 'Running quietly; not reporting in'
  return 'Nothing needs a decision'
}

export function watch(companies: readonly WatchedCompany[], assistantName: string): Mission {
  const watched: CompanyWatch[] = companies.map((company) => {
    const standing = standingFor(company)
    return { ...company, standing, headline: headlineFor(company, standing) }
  })

  const order = (a: CompanyWatch, b: CompanyWatch) =>
    RANK[a.standing] - RANK[b.standing] ||
    Number(a.isDemo) - Number(b.isDemo) ||
    a.name.localeCompare(b.name)

  const sorted = [...watched].sort(order)
  const needsYou = sorted.filter((c) => c.standing === 'critical' || c.standing === 'watch')

  const counts: Record<Standing, number> = { critical: 0, watch: 0, healthy: 0, unknown: 0 }
  for (const c of watched) counts[c.standing] += 1

  const n = watched.length
  const summary =
    n === 0
      ? `${assistantName} has no companies to watch yet.`
      : `${assistantName} is watching ${n} ${n === 1 ? 'company' : 'companies'}; ${
          needsYou.length === 0
            ? 'nothing needs you right now.'
            : `${needsYou.length} ${needsYou.length === 1 ? 'needs' : 'need'} you.`
        }`

  return { companies: sorted, needsYou, counts, summary }
}
