---
name: open-compute
description: Self-host Cloudflare Workers-compatible services (Workers, D1, KV, R2, Durable Objects, Queues, Cron) on a single machine with open-compute's `ocd` binary, plus the security baseline every app in this repository must meet. Use when building or deploying a Worker, a service that stores personal or sensitive data (licences, IDs, payments metadata), anything that needs signed service-to-service calls, or when asked to "self-host", "keep data on our own hardware", "use open-compute", or "harden" an app.
---

# open-compute and the app security baseline

open-compute (github.com/elliothux/open-compute, Apache-2.0) runs the
Cloudflare Workers programming model on one machine you own: one binary
(`ocd`), one data directory, SQLite for metadata, local disk or any
S3-compatible store for objects. Code written for Workers deploys to it with
the same Wrangler workflow, so a service can move between Cloudflare and your
own hardware without a rewrite.

Upstream moves fast. Re-read its README before relying on a command or a
binding; the notes below were taken from it on 2026-09-28.

## When to reach for it

- A service holds data you would rather not hand to a third-party cloud:
  identity-verification results, driver records, anything a privacy law
  treats as sensitive. Put it behind a small Worker and run that Worker on
  open-compute.
- You want Cloudflare's model (Workers, D1, KV, R2, Cron) for development and
  a self-hosted target for production, or the other way round.
- You need a cheap, single-box backend for a prototype that can later move to
  Cloudflare unchanged.

Do not use it for: general AI inference (Workers AI is only partially
supported), Hyperdrive or Analytics Engine (not supported upstream yet), or
anything needing multi-region failover (it is a single-machine platform).

## Commands

```bash
curl -fsSL https://open-compute.dev/install.sh | sh   # install ocd (read the script first)
ocd setup --yes                                       # initialise an instance
ocd status                                            # health
ocd dashboard                                         # local UI
ocd wrangler deploy                                   # deploy the Worker in the current directory
```

Configuration is a normal `wrangler.toml`. Keep one file that works for both
targets: bindings by name (`DB`, `KV`, `BUCKET`), secrets via
`wrangler secret put`, no account-specific values committed.

## Security properties it gives you (and what it does not)

- One `ocd` per data directory, enforced by a lock.
- Internal tokens are kept out of argv, environment, logs and metrics.
- Tenant outbound traffic may only reach public addresses: private,
  loopback, link-local and cloud-metadata addresses are rejected (an SSRF
  guard you get for free).
- It does **not** encrypt your data for you or authenticate your callers.
  That is the application's job; see the baseline below.

## The baseline every app here must meet

Treat each item as a requirement. When one cannot be met, say so in the
PR and in the app's security page rather than quietly skipping it.

1. **Minimise first.** Store derived facts, not documents. An age in years,
   not a birth date; "licence valid to 2030-07", not the licence number.
   Ask the upstream provider to redact raw captures once read.
2. **Encrypt before it leaves the app.** AES-256-GCM with a random 96-bit IV,
   the record's own key as associated data (so records cannot be swapped),
   and a key id in the envelope so keys can rotate. Web Crypto only, so the
   same code runs in Node, the edge and Workers.
3. **Sign every service-to-service call.** HMAC-SHA-256 over method, path,
   timestamp and body hash; reject anything older than five minutes;
   compare in constant time. The storage service accepts only ciphertext and
   refuses plaintext outright.
4. **Never trust the client's number.** Re-price, re-check availability and
   re-check eligibility on the server before charging. Card data goes to the
   payment provider's hosted page, never through our servers.
5. **Headers.** Per-request nonce CSP with `'strict-dynamic'`, no
   `unsafe-eval` in production, `frame-ancestors 'none'`, `base-uri 'none'`,
   `object-src 'none'`, HSTS with preload, `nosniff`, a tight
   `Permissions-Policy`, `Cache-Control: no-store` on every API response.
6. **Every write is guarded.** Same-origin check (CSRF), JSON content type,
   body size cap, schema validation with unknown keys rejected, and a
   per-caller rate limit. Webhooks verify the provider's signature on the raw
   body and re-fetch the object before trusting the event.
7. **Sessions.** Random ids in `__Host-` prefixed, httpOnly, Secure,
   SameSite=Lax cookies, HMAC-signed. Storage keys are an HMAC of the session
   id, never the id itself.
8. **Logs carry no personal data.** Log status codes and ids, never bodies.
   Audit trails keep a key prefix, the action and the outcome.
9. **Rights by default.** Export and delete are buttons, not emails.
   Retention has a number and a cron that enforces it.
10. **Prove it.** Unit tests for the crypto envelope, the request signature,
    webhook verification, rate limiting and the server-side price; secret
    scanning (gitleaks) and `npm audit` in CI; `SECURITY.md` with a
    disclosure address.

The reference implementation is `avant/`: `lib/security/*`,
`lib/driver-record.ts`, `lib/vault-client.ts`, `middleware.ts` and the vault
Worker in `avant/services/vault/`.
