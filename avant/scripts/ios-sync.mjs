/**
 * Prepares the native shell and syncs the iOS project:
 *   AVANT_APP_URL=https://your.domain AVANT_IOS_BUNDLE_ID=com.yourco.avant npm run ios:sync
 * Writes the offline screen with the production URL, then runs `cap sync ios`.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const url = process.env.AVANT_APP_URL
if (!url || !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url)) {
  console.error('Set AVANT_APP_URL to the production https:// origin, with no trailing slash.')
  process.exit(1)
}
mkdirSync('native/www', { recursive: true })
// Inserted as a JSON string literal inside the page's script, never as raw text.
const offline = readFileSync('native/offline.template.html', 'utf8').replaceAll("'__AVANT_APP_URL__'", JSON.stringify(url))
writeFileSync('native/www/offline.html', offline)
writeFileSync('native/www/index.html', offline)
execFileSync('npx', ['cap', 'sync', 'ios'], { stdio: 'inherit' })
