import { connector } from './registry'

/**
 * Integration health.
 *
 * The question this answers is not "is the connection object present" but "can
 * I trust today's numbers". Those differ: a connection that authenticated
 * successfully six days ago is *connected* and its data is stale, and a
 * dashboard that shows a green tick over week-old figures is worse than one
 * that shows nothing.
 */

export type ConnectionRecord = {
  provider: string
  displayName: string
  status: 'not_connected' | 'connected' | 'degraded' | 'error' | 'revoked'
  statusDetail: string | null
  lastSuccessAt: Date | null
  lastAttemptAt: Date | null
}

export type Health = {
  provider: string
  name: string
  /** What to paint. */
  tone: 'ok' | 'warn' | 'bad' | 'idle'
  /** Short label for a badge. */
  label: string
  /** One sentence a non-technical operator can act on. */
  detail: string
  /** Whether figures from this source should be treated as current. */
  dataIsCurrent: boolean
  ageHours: number | null
}

/** Beyond this, data is stale enough that decisions made on it are suspect. */
const STALE_AFTER_HOURS = 26
const DEAD_AFTER_HOURS = 72

export function assessConnection(record: ConnectionRecord, now = new Date()): Health {
  const definition = connector(record.provider)
  const name = definition?.name ?? record.displayName

  const ageHours = record.lastSuccessAt
    ? (now.getTime() - record.lastSuccessAt.getTime()) / 3_600_000
    : null

  if (record.status === 'not_connected') {
    return {
      provider: record.provider,
      name,
      tone: 'idle',
      label: 'Not connected',
      detail: definition
        ? `Connect ${name} to include ${definition.provides[0]?.toLowerCase() ?? 'its data'}.`
        : 'Not connected.',
      dataIsCurrent: false,
      ageHours: null,
    }
  }

  if (record.status === 'revoked') {
    return {
      provider: record.provider,
      name,
      tone: 'bad',
      label: 'Access revoked',
      detail: `${name} rejected the stored credential. Someone likely rotated or deleted the key — reconnect to restore it.`,
      dataIsCurrent: false,
      ageHours,
    }
  }

  if (record.status === 'error') {
    return {
      provider: record.provider,
      name,
      tone: 'bad',
      label: 'Failing',
      detail:
        record.statusDetail ??
        `${name} has failed on its last attempts. Figures from this source are frozen at the last good sync.`,
      dataIsCurrent: false,
      ageHours,
    }
  }

  // Connected, but possibly not current. Age decides, not the status column,
  // because "connected" is a statement about credentials, not about freshness.
  if (ageHours === null) {
    return {
      provider: record.provider,
      name,
      tone: 'warn',
      label: 'Never synced',
      detail: `${name} is connected but has not completed a sync yet.`,
      dataIsCurrent: false,
      ageHours: null,
    }
  }

  if (ageHours > DEAD_AFTER_HOURS) {
    return {
      provider: record.provider,
      name,
      tone: 'bad',
      label: 'Stale',
      detail: `Last successful sync was ${describeAge(ageHours)} ago. Treat figures from ${name} as historical.`,
      dataIsCurrent: false,
      ageHours,
    }
  }

  if (ageHours > STALE_AFTER_HOURS || record.status === 'degraded') {
    return {
      provider: record.provider,
      name,
      tone: 'warn',
      label: record.status === 'degraded' ? 'Degraded' : 'Behind',
      detail:
        record.statusDetail ??
        `Last successful sync was ${describeAge(ageHours)} ago, so today's figures may be incomplete.`,
      dataIsCurrent: false,
      ageHours,
    }
  }

  return {
    provider: record.provider,
    name,
    tone: 'ok',
    label: 'Healthy',
    detail: `Last synced ${describeAge(ageHours)} ago.`,
    dataIsCurrent: true,
    ageHours,
  }
}

export function describeAge(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} minutes`
  if (hours < 48) return `${Math.round(hours)} hours`
  return `${Math.round(hours / 24)} days`
}

/**
 * The one line that belongs above a dashboard.
 *
 * Deliberately leads with the problem when there is one. A summary that opens
 * with "3 of 4 healthy" buries the fact that the missing one is the payment
 * processor.
 */
export function summariseHealth(healths: Health[]): {
  tone: Health['tone']
  message: string
} {
  const connected = healths.filter((h) => h.tone !== 'idle')
  if (connected.length === 0) {
    return { tone: 'idle', message: 'No sources connected yet, so there are no figures to show.' }
  }

  const bad = connected.filter((h) => h.tone === 'bad')
  const warn = connected.filter((h) => h.tone === 'warn')

  if (bad.length > 0) {
    return {
      tone: 'bad',
      message: `${listNames(bad)} ${bad.length === 1 ? 'is' : 'are'} not delivering data. Figures below are missing whatever ${bad.length === 1 ? 'it covers' : 'they cover'}.`,
    }
  }
  if (warn.length > 0) {
    return {
      tone: 'warn',
      message: `${listNames(warn)} ${warn.length === 1 ? 'is' : 'are'} behind, so recent figures may be incomplete.`,
    }
  }
  return { tone: 'ok', message: `All ${connected.length} connected sources are current.` }
}

function listNames(healths: Health[]): string {
  const names = healths.map((h) => h.name)
  if (names.length === 1) return names[0]!
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
