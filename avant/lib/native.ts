/**
 * What the iOS app adds to the web app, behind one small surface. Every
 * function is a no-op (or falls back to the web API) in a browser, and the
 * Capacitor plugins are loaded only inside the app, so the website ships
 * none of their code on first load.
 */

type CapacitorGlobal = { isNativePlatform?: () => boolean }

export function inApp(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean((window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor?.isNativePlatform?.())
}

/** A light tap for small confirmations; a success pattern for the big ones. */
export async function haptic(kind: 'light' | 'success' = 'light'): Promise<void> {
  if (!inApp()) return
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics')
    if (kind === 'success') await Haptics.notification({ type: NotificationType.Success })
    else await Haptics.impact({ style: ImpactStyle.Light })
  } catch {
    /* haptics are a nicety */
  }
}

/** The native share sheet in the app; the Web Share API or the clipboard elsewhere. */
export async function shareLink(input: { title: string; text: string; url: string }): Promise<'shared' | 'copied' | 'cancelled'> {
  try {
    if (inApp()) {
      const { Share } = await import('@capacitor/share')
      await Share.share({ ...input, dialogTitle: input.title })
      return 'shared'
    }
    if (navigator.share) {
      await navigator.share(input)
      return 'shared'
    }
    await navigator.clipboard.writeText(input.url)
    return 'copied'
  } catch {
    return 'cancelled'
  }
}

/**
 * In the app, hands a document (such as the data export) to the share
 * sheet as a file: Save to Files, Mail, AirDrop. Never as text, so it can't
 * land on the clipboard. The file is written to the app's cache and
 * deleted afterwards.
 */
export async function shareFile(title: string, filename: string, contents: string): Promise<boolean> {
  if (!inApp()) return false
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
  let uri: string | null = null
  try {
    uri = (await Filesystem.writeFile({ path: filename, data: contents, directory: Directory.Cache, encoding: Encoding.UTF8 })).uri
    await Share.share({ title, files: [uri], dialogTitle: title })
    return true
  } catch {
    return false
  } finally {
    if (uri) await Filesystem.deleteFile({ path: filename, directory: Directory.Cache }).catch(() => undefined)
  }
}

/** The device's push token, and whose account it was registered for. */
const TOKEN_KEY = 'avant:push'
let forUser: string | null = null

export type PushState = 'on' | 'off' | 'denied' | 'unavailable'

export async function pushState(): Promise<PushState> {
  if (!inApp()) return 'unavailable'
  const { PushNotifications } = await import('@capacitor/push-notifications')
  const { receive } = await PushNotifications.checkPermissions()
  if (receive === 'denied') return 'denied'
  if (receive !== 'granted') return 'off'
  return readToken() ? 'on' : 'off'
}

function readStored(): { token: string; user: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as { token?: unknown; user?: unknown } | null
    return v && typeof v.token === 'string' && typeof v.user === 'string' ? { token: v.token, user: v.user } : null
  } catch {
    return null
  }
}

const readToken = () => readStored()?.token ?? null

/** On sign-out: this device no longer belongs to that account, so the next person must opt in themselves. */
export function forgetPushToken(): void {
  forUser = null
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* nothing stored */
  }
}

/** Asks iOS for permission (once; afterwards only Settings can change it) and registers this device for this person. */
export async function enablePush(userId: string): Promise<PushState> {
  if (!inApp()) return 'unavailable'
  forUser = userId
  const { PushNotifications } = await import('@capacitor/push-notifications')
  let { receive } = await PushNotifications.checkPermissions()
  if (receive === 'prompt' || receive === 'prompt-with-rationale') receive = (await PushNotifications.requestPermissions()).receive
  if (receive !== 'granted') return 'denied'
  await PushNotifications.register()
  return 'on'
}

export async function disablePush(): Promise<void> {
  const token = readToken()
  if (token) {
    await fetch('/api/me/devices', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => undefined)
  }
  forgetPushToken()
  if (inApp()) {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    await PushNotifications.unregister().catch(() => undefined)
  }
}

/**
 * Wires the app's native side once: hides the splash, keeps the device's
 * push token registered to whoever is signed in, and opens the right screen
 * when a notification is tapped. Returns a cleanup function.
 */
export async function startNative(open: (href: string) => void): Promise<() => void> {
  if (!inApp()) return () => {}
  const [{ SplashScreen }, { StatusBar, Style }, { PushNotifications }] = await Promise.all([
    import('@capacitor/splash-screen'),
    import('@capacitor/status-bar'),
    import('@capacitor/push-notifications'),
  ])
  await StatusBar.setStyle({ style: Style.Light }).catch(() => undefined)
  await SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => undefined)
  const subs = await Promise.all([
    PushNotifications.addListener('registration', async ({ value }) => {
      const res = await fetch('/api/me/devices', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: value }) }).catch(() => null)
      try {
        if (res?.ok && forUser) localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: value, user: forUser }))
      } catch {
        /* the server has it; that's what matters */
      }
    }),
    PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
      const href = (notification.data as { href?: unknown } | undefined)?.href
      // Only ever a path on this site.
      if (typeof href === 'string' && /^\/(?![/\\])/.test(href)) open(href)
    }),
  ])
  return () => subs.forEach((s) => void s.remove())
}

/**
 * Re-registers this device for the same person's new session (after
 * signing in again or changing the password). Only for the person who
 * turned notifications on here: someone else signing in on this iPhone
 * must turn them on themselves.
 */
export async function refreshPushRegistration(userId: string): Promise<void> {
  if (!inApp() || readStored()?.user !== userId) return
  const { PushNotifications } = await import('@capacitor/push-notifications')
  if ((await PushNotifications.checkPermissions()).receive !== 'granted') return
  forUser = userId
  await PushNotifications.register()
}
