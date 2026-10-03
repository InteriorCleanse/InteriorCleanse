# Security

Report a vulnerability to security@ the production domain. We acknowledge
within two business days and will not pursue good-faith research.

## What is protected, and how

| Asset | Protection | Where |
| --- | --- | --- |
| Driver record | Minimised (age, licence validity, clean-record flag only), sealed with AES-256-GCM in the app, bound to its record key, stored in the vault or, without one, as ciphertext in the database (`driver_records`), keyed to the signed-in account | `lib/driver-record.ts`, `lib/security/crypto.ts` |
| Licence images | Never reach AVANT; the verification session is redacted after the result is read, and again on account deletion | `lib/verification/stripe-identity.ts` |
| Vault | Ciphertext only, refuses plaintext, HMAC-signed requests with a 5-minute window, audit log without personal data, daily purge | `services/vault/` |
| Sessions | Random id, HMAC-signed, `__Host-` httpOnly Secure SameSite=Lax cookie; storage keyed by an HMAC of the id | `lib/security/session.ts` |
| Accounts | scrypt password hashes (N=2^15); sign-in tokens are 256 random bits in a `__Host-` httpOnly cookie and the database keeps only their SHA-256, so a database leak hands out no live sessions; unknown emails take the same time as wrong passwords; 10 sign-in attempts per 10 minutes per email and per IP; sign-in forms POST so a pre-hydration submit never puts a password in a URL | `lib/server/accounts.ts`, `app/api/auth/` |
| Marketplace data | Every query is parameterised; every trip, thread, message and listing read or write checks that the user is a party to it (strangers get 404); a per-car advisory lock plus an overlap check inside one transaction means two guests can never book the same days; unpaid Stripe holds release after 30 minutes; hosts can't book their own car; a VIN can be listed by only one host | `lib/server/` |
| Host photos | Re-encoded to JPEG on the device (drops EXIF and GPS), then re-checked on the server by parsing the JPEG header for real dimensions; 6 MB cap; served with `content-security-policy: default-src 'none'; sandbox` and `nosniff` from the app's own origin | `lib/photo.ts`, `lib/server/photos.ts`, `app/api/photos/` |
| Payments | Stripe Checkout; the server re-prices and re-checks eligibility before creating the session; only licence-checked drivers can pay (demo passes are refused once payments are live); the delivery address is sealed before it goes into Stripe metadata; confirmations bound to the session | `lib/checkout.ts`, `app/api/checkout/` |
| Refunds and payouts | Amounts come only from the server's own policy (`lib/policy.ts`) and the stored quote; every Stripe refund and transfer carries an idempotency key per booking, so retries can never pay twice; payouts transfer from the trip's own charge; the payments webhook verifies the signature and re-reads the object from Stripe before acting; `/api/cron` needs `CRON_SECRET`, compared in constant time | `lib/server/bookings.ts`, `lib/server/payouts.ts`, `app/api/webhook/stripe/`, `app/api/cron/` |
| Account recovery and closing | Reset links carry 256 random bits in the URL fragment (never sent to servers or in Referer), stored only as SHA-256, single use, one hour, newest link only, and end every other session; the request always answers the same way, so it does not reveal who has an account. Closing an account needs the password again and is refused while trips are ahead | `lib/server/recovery.ts`, `lib/server/accounts.ts` |
| Webhooks | Stripe signature on the raw body (capped at 256 KB) with a 5-minute tolerance; the object is re-fetched before it is trusted; an event only updates a record still waiting on that exact session, so it can never revive a deleted one; failed redactions return 503 so Stripe retries | `lib/verification/stripe-signature.ts` |
| Browser | Per-request nonce CSP with `'strict-dynamic'`, HSTS preload, `frame-ancestors 'none'`, `base-uri 'none'`, COOP, strict Permissions-Policy | `middleware.ts`, `next.config.mjs` |
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

## Known limits

- The in-process rate limiter is per server instance. Before scaling out,
  add a platform rate-limit rule (Vercel Firewall or Cloudflare) in front of
  `/api/concierge`, `/api/verify/*` and `/api/checkout`.
- There is no server-side booking store yet, so two guests could pay for the
  same dates. Before launch, add a hold (a row per car and date range with a
  unique constraint) that checkout takes before creating the Stripe session.
- Vault requests are signed with a 5-minute window but carry no nonce; a
  captured request could be replayed within that window. The app talks to
  the vault only over TLS from the server, so capture needs a compromised
  host. Add a nonce table if the vault is ever exposed more widely.
- Trips and saved cars live in the browser until accounts exist.
- Preview mode uses temporary keys; set `AVANT_REQUIRE_SECRETS=1` in
  production so it cannot start without real ones.
