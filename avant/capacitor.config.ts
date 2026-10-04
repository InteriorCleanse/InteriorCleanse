import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The AVANT iOS app: a native shell around the live service. Listings,
 * prices, trips and messages are server-rendered and change by the minute,
 * so the app loads the production site rather than a stale bundle, and adds
 * what only the device can do: push notifications, the share sheet, haptics,
 * the camera and location prompts, an offline screen and the status bar.
 *
 * AVANT_APP_URL is the production https:// origin (the same as
 * NEXT_PUBLIC_SITE_URL). AVANT_IOS_BUNDLE_ID is the bundle id registered in
 * App Store Connect. Both are read when you run `npx cap sync ios`.
 */

const url = process.env.AVANT_APP_URL ?? 'https://avant.example'
if (!/^https:\/\//.test(url)) throw new Error('AVANT_APP_URL must be an https:// origin')
const host = new URL(url).host

const config: CapacitorConfig = {
  appId: process.env.AVANT_IOS_BUNDLE_ID ?? 'com.example.avant',
  appName: 'AVANT',
  webDir: 'native/www',
  server: {
    url,
    // Only AVANT and Stripe's hosted pages open inside the app; every other link opens in Safari.
    allowNavigation: [host, 'checkout.stripe.com', 'connect.stripe.com', 'verify.stripe.com'],
    errorPath: 'offline.html',
  },
  // Lets the site recognise the app (and hide web-only chrome) without a client-side flash.
  appendUserAgent: 'AVANTApp/1',
  backgroundColor: '#ffffff',
  ios: {
    contentInset: 'never',
    scheme: 'AVANT',
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: { launchAutoHide: false, backgroundColor: '#121316', showSpinner: false },
    StatusBar: { style: 'LIGHT', overlaysWebView: true },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
}

export default config
