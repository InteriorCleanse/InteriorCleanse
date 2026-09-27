# Security

## Threat model, plainly

Gavel is a members-only app that may run on a laptop, a home network, or a
small VPS behind HTTPS. The things worth stealing are the session cookie, the
access codes, the owner PIN and the Stripe webhook secret. The things worth
abusing are the login (guessing) and the webhook (forging a paid member).
Gavel holds no money and cannot place a bid, so the blast radius is a member's
watchlist and settings.

## In place

- CSP with a per-request nonce and no `unsafe-inline` for scripts; external
  scripts only; every server string escaped before it enters HTML; `href` and
  `src` accept http(s) only.
- `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`,
  `Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy`, COOP and CORP.
- Sessions: HMAC-SHA256 tokens, constant-time verification, expiry, revocation
  on sign-out, HttpOnly + SameSite=Strict cookies, `Secure` behind HTTPS.
- CSRF token on every non-GET API call.
- Login throttle per client. Owner PIN and codes compared in constant time;
  a failed member login never says which half was wrong.
- Access codes stored as SHA-256 hashes; only the last four shown.
- Stripe signatures verified with tolerance; events deduplicated.
- Body size limits (256 KB; 1 MB for the webhook); static path traversal
  blocked; JSON errors never carry a stack.
- Secrets come from the environment; `.env` is git-ignored; no secret is
  logged (codes are logged as "issued", never in full).

## Not in place (yet)

- No two-factor login.
- No rate limit on the feed beyond the 60-second scan cache.
- Live-bid adapters do not exist, so there is no order path to protect.

## Operator checklist

- Set `GAVEL_PIN` and `GAVEL_SESSION_SECRET` (32+ random characters).
- Run behind HTTPS before opening a port to the internet; set
  `GAVEL_SECURE_COOKIES=1` or forward `X-Forwarded-Proto`.
- Paste secrets into the host's environment, never into the repository.
- Keep `data/` out of git (it is), and back it up: members and codes live there.
