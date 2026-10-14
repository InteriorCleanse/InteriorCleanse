import type { Membership } from '@/lib/session'

/**
 * Which business a person is working in right now.
 *
 * Someone who runs several businesses has one membership per workspace. Every
 * page and route used to act on the first of them, which made the second
 * business unreachable. The choice now lives in a cookie — and the cookie is
 * a *preference*, never an authority: its value only selects among the
 * memberships the session already holds. An id that is not one of them is
 * ignored exactly as if the cookie were absent, so a forged or stale value
 * can neither reach another tenant nor confirm that one exists.
 */

export const ACTIVE_WORKSPACE_COOKIE = 'aurelis_workspace'

/** A year: the choice is a convenience, and switching is one click. */
export const ACTIVE_WORKSPACE_MAX_AGE = 60 * 60 * 24 * 365

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True for something shaped like an organization id; anything else is dropped unread. */
export function isWorkspaceId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

/**
 * The membership to act on: the one the person chose, if they still hold
 * it, else their first. Pure, so the rule is tested without a request.
 */
export function pickActive(
  memberships: readonly Membership[],
  chosen: string | null | undefined,
): Membership | undefined {
  if (isWorkspaceId(chosen)) {
    const match = memberships.find((m) => m.organizationId === chosen)
    if (match) return match
  }
  return memberships[0]
}

/**
 * A same-site path to return to after switching, or the command center.
 * Only `/app/...` paths are accepted: an absolute URL or `//host` in a
 * return parameter is an open redirect.
 */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string') return '/app/command-center'
  if (!value.startsWith('/app') || value.startsWith('//') || value.includes('\\')) {
    return '/app/command-center'
  }
  if (value !== '/app' && !value.startsWith('/app/') && !value.startsWith('/app?')) {
    return '/app/command-center'
  }
  return value.slice(0, 300)
}
