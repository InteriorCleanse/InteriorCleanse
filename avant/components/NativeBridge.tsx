'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { rememberCampaign } from '@/lib/campaign'
import { inApp, refreshPushRegistration, startNative } from '@/lib/native'
import { useSession } from './Session'

/** Inside the iOS app: splash, status bar, push registration and notification taps. Everywhere: the visit's campaign tag. */
export function NativeBridge() {
  const router = useRouter()
  const { user } = useSession()
  const lastUser = useRef<string | null>(null)

  // Remember which campaign brought this visit (for host leads), in every shell.
  useEffect(() => rememberCampaign(window.location.search), [])

  useEffect(() => {
    if (!inApp()) return
    let stop = () => {}
    void startNative((href) => router.push(href)).then((s) => (stop = s))
    return () => stop()
  }, [router])

  useEffect(() => {
    if (user && lastUser.current !== user.id) void refreshPushRegistration(user.id)
    lastUser.current = user?.id ?? null
  }, [user])

  return null
}
