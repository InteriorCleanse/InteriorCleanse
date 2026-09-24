/**
 * Set up the vault's two-factor lock. Run on the computer that runs Mr. Cash:
 *
 *   npm run vault:setup
 *
 * It makes a fresh authenticator secret and prints it once, here, for you to
 * add to your phone's authenticator app and to .env. It does not write any
 * file, does not send the secret anywhere, and does not know your passcode:
 * you choose that and type it into .env yourself.
 */
import { generateSecret, otpauthUri, totpAt, counterAt, base32Decode } from '../src/security/vault.ts'
import * as ui from '../src/ui.ts'

const secret = generateSecret()
const grouped = secret.match(/.{1,4}/g)!.join(' ')

ui.heading('THE VAULT — two-factor setup')
console.log('')
console.log('  1. In your authenticator app (Google Authenticator, 1Password, Authy, …) add')
console.log('     an account by typing this setup key (time-based, 6 digits):')
console.log('')
console.log(`       ${ui.bold(grouped)}`)
console.log('')
console.log(ui.dim(`     Or, if your app takes a link: ${otpauthUri(secret)}`))
console.log('')
console.log('  2. Add these two lines to the file called .env next to package.json')
console.log('     (create it if it is not there; it is never uploaded):')
console.log('')
console.log(`       MRCASH_VAULT_TOTP=${secret}`)
console.log('       MRCASH_VAULT_PASSCODE=<a passcode you choose, 6 characters or more>')
console.log('')
console.log('  3. Restart Mr. Cash. The Portfolio vault now asks for both.')
console.log('')
console.log(ui.dim(`  Check: your app should show ${totpAt(base32Decode(secret), counterAt(Date.now()))} right now (it changes every 30 seconds).`))
console.log(ui.dim('  Running this again makes a NEW secret; the old one stops working once you swap it in .env.'))
console.log('')
