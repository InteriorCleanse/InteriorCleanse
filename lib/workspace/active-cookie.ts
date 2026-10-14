import { cookies } from 'next/headers'
import { ACTIVE_WORKSPACE_COOKIE, ACTIVE_WORKSPACE_MAX_AGE } from './active'

/**
 * Writes the active-business choice. Not a server action: callers must have
 * checked that the session belongs to `organizationId` first, and a module
 * marked 'use server' would expose this to the browser without that check.
 */
export async function setActiveWorkspace(organizationId: string): Promise<void> {
  const store = await cookies()
  store.set(ACTIVE_WORKSPACE_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ACTIVE_WORKSPACE_MAX_AGE,
  })
}
