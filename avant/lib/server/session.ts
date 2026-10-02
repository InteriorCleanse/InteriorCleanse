/**
 * The signed-in user for the current request (route handlers and server
 * components). The cookie holds a random token; see accounts.ts.
 */

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { userForToken, type User } from './accounts'

const AUTH_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-avant_auth' : 'avant_auth'

export async function currentUser(): Promise<User | null> {
  return userForToken((await cookies()).get(AUTH_COOKIE)?.value)
}

export async function authToken(): Promise<string | undefined> {
  return (await cookies()).get(AUTH_COOKIE)?.value
}

export async function setAuthCookie(token: string, expires: Date): Promise<void> {
  ;(await cookies()).set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires,
  })
}

export async function clearAuthCookie(): Promise<void> {
  ;(await cookies()).delete(AUTH_COOKIE)
}

export const signInRequired = () => NextResponse.json({ error: 'Sign in to continue.', signIn: true }, { status: 401 })

/** The key a user's Driver Pass is stored under (see driver-record.ts). */
export const driverKey = (user: User) => `user:${user.id}`
