'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { inApp, refreshPushRegistration, startNative } from '@/lib/native'
import { useSession } from './Session'

/** Inside the iOS app only: splash, status bar, push registration and notification taps. */
export function NativeBridge() {
  const router = useRouter()
  const { user } = useSession()
  const lastUser = useRef<string | null>(null)

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
