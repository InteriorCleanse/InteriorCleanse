# Security

Report a vulnerability to security@ the production domain. We acknowledge
within two business days and will not pursue good-faith research.

## What is protected, and how

| Asset | Protection | Where |
| --- | --- | --- |
| Driver record | Minimised (age, licence validity, clean-record flag only), sealed with AES-256-GCM in the app, bound to its record key, stored in the vault or an httpOnly cookie | `lib/driver-record.ts`, `lib/security/crypto.ts` |
| Licence images | Never reach AVANT; the verification session is redacted after the result is read, and again on account deletion | `lib/verification/stripe-identity.ts` |
| Vault | Ciphertext only, refuses plaintext, HMAC-signed requests with a 5-minute window, audit log without personal data, daily purge | `services/vault/` |
| Sessions | Random id, HMAC-signed, `__Host-` httpOnly Secure SameSite=Lax cookie; storage keyed by an HMAC of the id | `lib/security/session.ts` |
| Payments | Stripe Checkout; the server re-prices and re-checks eligibility before creating the session; confirmations bound to the session | `lib/checkout.ts`, `app/api/checkout/` |
| Webhooks | Stripe signature on the raw body with a 5-minute tolerance; the object is re-fetched before it is trusted | `lib/verification/stripe-signature.ts` |
| Browser | Per-request nonce CSP with `'strict-dynamic'`, HSTS preload, `frame-ancestors 'none'`, `base-uri 'none'`, COOP, strict Permissions-Policy | `middleware.ts`, `next.config.mjs` |
| API | Same-origin check, JSON-only, body size caps, strict zod schemas, per-IP rate limits, `no-store` | `lib/security/request.ts` |
| AI concierge | Read-only tools, validated tool inputs, never asks for identity documents, provider errors never leak | `lib/ai/` |
| Supply chain | gitleaks secret scan and `npm audit` gate in CI; patched PostCSS pinned via overrides | `.github/workflows/ci.yml` |

## Known limits

- The in-process rate limiter is per server instance; put the vault (or a
  shared store) behind it before scaling horizontally.
- Trips and saved cars live in the browser until accounts exist.
- Preview mode uses temporary keys; set `AVANT_REQUIRE_SECRETS=1` in
  production so it cannot start without real ones.
