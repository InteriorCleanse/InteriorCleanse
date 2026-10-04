# Security

Report a vulnerability to the contact in `/.well-known/security.txt`
(`AVANT_SECURITY_CONTACT`). We acknowledge within two business days and will
not pursue good-faith research.

## What is protected, and how

| Asset | Protection | Where |
| --- | --- | --- |
| Driver record | Minimised (age, licence validity, clean-record flag only), sealed with AES-256-GCM in the app, bound to its record key, stored in the vault or, without one, as ciphertext in the database (`driver_records`), keyed to the signed-in account | `lib/driver-record.ts`, `lib/security/crypto.ts` |
| Licence images | Never reach AVANT; the verification session is redacted after the result is read, and again on account deletion | `lib/verification/stripe-identity.ts` |
| Vault | Ciphertext only, refuses plaintext, HMAC-signed requests with a 5-minute window, audit log without personal data, daily purge | `services/vault/` |
| Sessions | Random id, HMAC-signed, `__Host-` httpOnly Secure SameSite=Lax cookie; storage keyed by an HMAC of the id | `lib/security/session.ts` |
| Accounts | scrypt password hashes (N=2^15); sign-in tokens are 256 random bits in a `__Host-` httpOnly cookie and the database keeps only their SHA-256, so a database leak hands out no live sessions; sessions end after 14 idle days or 30 days in all; unknown emails take the same time as wrong passwords; new and reset passwords are checked against known breaches (Have I Been Pwned, k-anonymity, fail-open); sign-in forms POST so a pre-hydration submit never puts a password in a URL; names are letters only, with control characters stripped | `lib/server/accounts.ts`, `lib/server/pwned.ts`, `app/api/auth/` |
| Email ownership | With email configured, a new account can't sign in until its owner clicks a single-use, 24-hour link (stored as SHA-256). Sign-up always answers "check your email", whether or not the address already has an account; an existing owner gets a note instead, so sign-up can't be used to discover members or open an account in someone else's name | `lib/server/recovery.ts`, `app/api/auth/signup/`, `app/api/auth/verify-email/` |
| Brute force | Two layers: an in-memory limiter per instance, and a token bucket in Postgres shared by every instance (keys stored as SHA-256, never an email or IP). Sign-in: 10 per 10 minutes per email and IP, 30 an hour per email, 30 per 10 minutes per IP. Reset: 3 an hour per email. Password change, export and closing an account are limited per user | `lib/server/limits.ts`, `lib/security/rate-limit.ts` |
| Account security | Change password (ends every other session), sign out on every device, and an alert in the app and by email whenever the password changes | `app/api/me/password/`, `app/api/auth/logout-all/` |
| Encryption at rest | Messages, delivery addresses, pickup notes (they can hold lockbox codes) and VINs are sealed with AES-256-GCM, bound to their row as associated data, so a database dump, backup or replica reveals none of them and a value copied to another row won't open. The duplicate-VIN check uses an HMAC fingerprint, never the VIN. Key rotation via `AVANT_ENCRYPTION_KEY_PREVIOUS` | `lib/server/sealed.ts`, `lib/server/listings.ts` |
| Who sees what | Public pages show a host's first name and initial only, and a listing id rather than the account id. Message notifications say only that a message arrived, never its text. The delivery address reaches the host only while the trip is active; the exact pickup note only a confirmed guest. Conversations close 14 days after a trip (3 after a decline or cancel) | `lib/server/listings.ts`, `lib/server/inbox.ts`, `lib/server/bookings.ts` |
| Your data | Download everything AVANT holds about you as JSON from Profile; close the account in-app (required by the App Store). Closing blanks your messages and delivery addresses, removes listings, photos, sessions and notifications, and leaves an anonymous "Former member" so the other side's history stays coherent | `lib/server/export.ts`, `lib/server/accounts.ts` |
| Retention | The daily cron purges expired sessions, used reset and verification links, idle rate-limit rows, old notifications (read after 180 days, all after 400), delivery addresses 30 days after a trip, and photos never attached to a listing | `lib/server/retention.ts` |
| Consent evidence | Every acceptance of the terms, privacy notice, trip terms and Host Agreement is stored with the document's version, the time and the trip or listing it covered. Kept after an account closes, as the evidence for any dispute | `lib/server/consent.ts`, `lib/legal.ts` |
| Credit and reward abuse | Credit pays at most half of a live trip; the Promise credit needs a real paid trip, at most once in 90 days and never twice from one host; three host cancellations of confirmed trips in 30 days pauses that host's listings; referral credit waits for a confirmed email, never pays for trips with the referrer or anyone they referred, and is capped at 10 a year; Circle counts only paid trips with independent hosts. A confirmed trip can't be cancelled in-app once pickup time has passed | `lib/circle.ts`, `lib/server/advantage.ts`, `lib/server/bookings.ts` |
| Marketplace data | Every query is parameterised; every trip, thread, message and listing read or write checks that the user is a party to it (strangers get 404); a per-car advisory lock plus an overlap check inside one transaction means two guests can never book the same days; unpaid Stripe holds release after 30 minutes; hosts can't book their own car; a VIN can be listed by only one host | `lib/server/` |
| Host photos | Re-encoded to JPEG on the device, then stripped of every metadata segment (EXIF, GPS, XMP, comments, trailing data) on the server, so location can't survive a client that skips the re-encode; real dimensions parsed from the header, 6,000 px per side and 6 MB caps; replaced photos are deleted; served with `content-security-policy: default-src 'none'; sandbox` and `nosniff` from the app's own origin | `lib/photo.ts`, `lib/server/jpeg.ts`, `lib/server/photos.ts`, `app/api/photos/` |
| Payments | Stripe Checkout; the server re-prices and re-checks eligibility before creating the session; only licence-checked drivers can pay (demo passes are refused once payments are live); the delivery address is sealed before it goes into Stripe metadata; confirmations bound to the session | `lib/checkout.ts`, `app/api/checkout/` |
| Refunds and payouts | Amounts come only from the server's own policy (`lib/policy.ts`) and the stored quote; every Stripe refund and transfer carries an idempotency key per booking, and before a retry the server asks Stripe whether the refund or transfer already exists, so a retry after the idempotency window still can't pay twice; payouts are claimed (`sending`) before the call; a payout is tied to the trip's charge only when that charge covers it; a payment confirms a booking only if it is a PaymentIntent for exactly the amount owed; a payment that arrives after the pickup day or for dates now taken is refunded in full; the payments webhook verifies the signature and re-reads the object from Stripe; `/api/cron` needs `CRON_SECRET`, compared in constant time | `lib/server/bookings.ts`, `lib/server/payouts.ts`, `app/api/webhook/stripe/`, `app/api/cron/` |
| Account recovery and closing | Reset links carry 256 random bits in the URL fragment (never sent to servers or in Referer), stored only as SHA-256, single use, one hour, newest link only, and end every other session; the request always answers the same way, so it does not reveal who has an account. Closing an account needs the password again and is refused while trips are ahead | `lib/server/recovery.ts`, `lib/server/accounts.ts` |
| Webhooks | Stripe signature on the raw body (capped at 256 KB) with a 5-minute tolerance; the object is re-fetched before it is trusted; an event only updates a record still waiting on that exact session, so it can never revive a deleted one; failed redactions return 503 so Stripe retries | `lib/verification/stripe-signature.ts` |
| Browser | API responses carry `default-src 'none'; frame-ancestors 'none'`; pages with a token in the URL send no Referer; per-request nonce CSP with `'strict-dynamic'`, HSTS preload, `frame-ancestors 'none'`, `base-uri 'none'`, COOP, strict Permissions-Policy | `middleware.ts`, `next.config.mjs` |
| API | Same-origin check, JSON-only, body size caps enforced while streaming, strict zod schemas, per-IP rate limits keyed on an unspoofable address, `no-store`, redirects limited to same-site paths | `lib/security/request.ts`, `client-ip.ts`, `redirect.ts` |
| AI concierge | Read-only tools, validated tool inputs, never asks for identity documents, provider errors never leak; replies are HMAC-signed per session and unsigned "assistant" turns are dropped; 60 questions per session per day, a per-instance daily model-call cap (`AVANT_AI_DAILY_CAP`), 1,500 output tokens and three tool rounds per answer | `lib/ai/`, `lib/security/turns.ts` |
| Supply chain | gitleaks secret scan and `npm audit` gate in CI; patched PostCSS pinned via overrides | `.github/workflows/ci.yml` |

## Client address

Rate limits key on the caller's address. On Vercel that is `x-real-ip`,
which the platform sets. Anywhere else, set `AVANT_TRUSTED_PROXY_HOPS` to
the number of proxies in front of the app; the client is read that many
entries from the right of `X-Forwarded-For`, never from the left, which the
caller controls. The default, 0, ignores the header and puts every caller
in one bucket: strict, never spoofable.

## Audit log

An independent review in September 2026 found no critical or high issues.
Its five medium and four low findings, and what was done:

| Finding | Fix |
| --- | --- |
| Open redirect after verification via `/\host` and `/<tab>/host` | `safeNext` rejects backslashes and control characters and requires the same origin |
| Rate limits bypassable by forging `X-Forwarded-For` | `pickClientIp` trusts only platform or right-hand proxy entries |
| Years licensed unbounded on the document path | Capped at verified age minus 16 |
| A late webhook could recreate a deleted Driver Pass | Updates only a record waiting on that session; redaction failures retried |
| Concierge cost abuse and forged assistant turns | Signed turns, per-session quota, daily cap, lower token and tool-round limits |
| Metadata truncation could break confirmation after payment | No truncation; fails before charging if too long; address sealed |
| Confirmation re-ran date checks after payment | Paid trips are re-priced for the receipt only |
| Demo-verified drivers could pay once Stripe is live | Refused unless the licence was checked by the provider |
| Body cap relied on `content-length` | Bytes counted while streaming; webhook body capped |

### October 2026

Three further reviews (payments, abuse of the reward programmes, privacy)
found one critical and four high issues, all fixed:

| Finding | Fix |
| --- | --- |
| Critical: a guest could cancel a trip already under way and get a refund | No self-serve cancel of a confirmed trip once pickup time has passed |
| High: Promise credit could be farmed between friendly accounts | Eligibility rules above, a 50% credit cap, and the host cancellation penalty |
| High: referral credit could be farmed with throwaway accounts | Credit only after email confirmation; stricter reward rules; yearly cap |
| High: public listings exposed hosts' full names and account ids | First name and initial; listing id in place of the account id |
| High: anyone could open an account with someone else's email | Email verification before sign-in |
| Medium: double refund or payout after Stripe's idempotency window; payouts tied to a charge too small to cover them; preview trips lifting Circle tiers; credit lost when Stripe failed; conversations opening before payment; messages, addresses and VINs in plain text; deletion leftovers and no data export; nothing ever purged; sign-up revealing who has an account; credential stuffing across instances; reset email flooding | All fixed as described in the table above |
| Low: EXIF stripped only on the device; long photo caching; the duplicate-VIN message revealing other hosts' cars; a Host-header fallback for the site URL; API responses without a CSP; webhook errors logging payloads; decoy-hash timing; control characters in names; proxy hops silently defaulting; async payment failures holding dates; mismatched amounts confirming a booking; database and server clocks in different zones | Fixed: server-side stripping; one-day cache; a generic message; `NEXT_PUBLIC_SITE_URL` required in production; API CSP; error names only; precomputed decoy; a name pattern; a hard error with `AVANT_REQUIRE_SECRETS=1`; failed payments release the hold; exact amount check; every connection in UTC |

## Known limits

- Rate limits are now shared across instances in Postgres, but a database
  is a poor shield against a large distributed attack. Add a Vercel Firewall
  (or Cloudflare) rate rule on `/api/auth/*`, `/api/concierge`,
  `/api/verify/*` and `/api/checkout` before launch.
- `AVANT_ENCRYPTION_KEY` is now the only way to read messages, addresses,
  pickup notes and VINs. Keep it in a password manager as well as in Vercel;
  losing it loses that data for good.
- Never give preview deployments the production `DATABASE_URL`: previews run
  branch code against whatever database they are given.
- Vault requests are signed with a 5-minute window but carry no nonce; a
  captured request could be replayed within that window. The app talks to
  the vault only over TLS from the server, so capture needs a compromised
  host. Add a nonce table if the vault is ever exposed more widely.
- Preview mode uses temporary keys; set `AVANT_REQUIRE_SECRETS=1` in
  production so it cannot start without real ones.
