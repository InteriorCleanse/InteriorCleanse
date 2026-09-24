# Security

This document is deliberately unflattering. A security page that only lists
wins is marketing; the useful part is the threat model and the residual risk.

## What this is

A **paper-trading** application that runs on your own machine and serves a
dashboard on `127.0.0.1`. It can optionally be reached from another device on
the same network (`config.app.allowPhone`). It holds no customer funds, and the
live order path is dormant and unwired (`LIVE_TRADING_ENABLED = false`).

## Threat model

Who actually attacks something like this, in rough order of likelihood:

1. **A malicious web page you have open in another tab.** It cannot read your
   dashboard (same-origin policy), but it can try to *send* requests to it —
   cross-site request forgery — or frame it and trick a click onto the kill
   switch.
2. **Another device on your wifi.** A guest, a compromised smart TV, a
   neighbour who guessed the password. It can reach the port if phone access is
   on, and will meet the PIN gate.
3. **Untrusted text arriving through a feature.** News headlines and TradingView
   alert bodies are written by strangers and end up near an AI prompt.
4. **Someone with your machine.** Out of scope: local access is game over for
   any application, and pretending otherwise is theatre.

Explicitly **not** in the model: a targeted attacker with network position,
nation-state capability, or a browser 0-day. If that is your threat model, this
is not the right tool and no dashboard change would fix it.

## What is in place

| Control | Where |
|---|---|
| CSRF token + same-origin check on every `POST /api/*` | `src/guard.ts`, `server.ts` |
| PIN gate for any non-loopback device, with throttling → 429 | `guard.PinThrottle`, `server.ts` |
| Loopback detection from the **socket**, never from a header | `server.ts` `isLocal()` |
| Constant-time comparison of every secret | `src/security/harden.ts` `safeEqual` |
| Content-Security-Policy with a per-request nonce | `src/security/harden.ts` |
| Clickjacking: `frame-ancestors 'none'` + `X-Frame-Options: DENY` | same |
| `nosniff`, `no-referrer`, `Permissions-Policy`, COOP/CORP | same |
| Per-route request body caps (4–256 KB) | `server.ts` |
| Read-only exchange client; withdrawal-capable keys refused | `src/exchange/` |
| Static file serving constrained to `web/` by a strict pattern | `server.ts` |
| **Zero runtime dependencies** | `package.json` |

That last row is the biggest single control and it is easy to overlook. Most
real-world compromises of small Node apps arrive through a transitive package,
not through the author's own code. There is no supply chain here to poison.

## The vault (real balances)

Your real broker balances sit behind a second lock, separate from the PIN:
the Portfolio vault opens only with a passcode **and** a six-digit code from an
authenticator app (TOTP, RFC 6238), and it applies on the computer running
Mr. Cash too.

- Set up once with `npm run vault:setup`. It prints a fresh authenticator secret
  for your phone and the two `.env` lines (`MRCASH_VAULT_TOTP`,
  `MRCASH_VAULT_PASSCODE`). Nothing is written to disk by the script, and neither
  secret ever reaches the repo, a log or a response.
- Passcode and code are compared in constant time; a wrong attempt never says
  which half was wrong. Five wrong attempts lock that device out for 15
  minutes. A code opens the vault once — a replay inside its 30 seconds fails.
- An open vault is a random token in an `HttpOnly; SameSite=Strict` cookie on
  `/api`. It closes after 15 minutes idle, 60 minutes in total, or on Lock.
  Unlock and lock are POSTs, so the CSRF and same-origin guard applies.
- Once the vault is set up, `/api/portfolio` and `/api/portfolio/kraken`
  answer "locked" until it is open. Everything behind the door is read-only.
- Inside, a switcher shows all accounts or one at a time (Alpaca, Kraken,
  Paper); the choice is remembered in the browser only.

Code: `src/security/vault.ts`; tests: `test/security/vault.test.ts` (including
the RFC 6238 test vectors).

## What this pass fixed

An audit found two real problems.

**No security headers at all.** Not a weak CSP — none. No `nosniff`, no frame
protection, no referrer policy. The dashboard has a kill switch and a settings
form, so being framed by a hostile page was a live clickjacking route.

Now every response carries the set above. The CSP uses a **per-request nonce**
rather than `'unsafe-inline'`, which is only possible because the page has
exactly one inline `<script>` and **zero** inline `onclick=` handlers. Verified
in a real browser: an injected `<script>` without the nonce does not execute,
while all sixteen tabs render with zero violations.

**Four secrets compared with `===`.** The CSRF token, the webhook secret, the
session cookie and the PIN. `===` returns the moment two bytes differ, which
leaks the length of the correct prefix through timing. The PIN is six digits
behind a throttle — precisely the size of secret where a timing oracle is worth
building. All four now go through `safeEqual`, which hashes both sides to a
fixed 32 bytes before `timingSafeEqual`, so a length mismatch cannot throw and
leak the answer either.

A test greps for any future `===` against a named secret, because the fifth one
is the one nobody will notice.

## Residual risk — read this part

- **`style-src` still allows `'unsafe-inline'`.** The app sets `style="…"`
  attributes throughout and CSP has no nonce mechanism for those. This permits
  injected *CSS*, not injected script. Removing it means moving every inline
  style into the stylesheet; worth doing, not yet done.
- **The PIN is six digits by default.** Throttled, but short. Set
  `MRCASH_PIN` to something longer if the network is not one you trust.
- **Prompt injection is mitigated, not solved.** The AI narration is validated
  against the engine's own context and rejected if it invents a number
  (`src/ai/narrator.ts`), and the CIO decision is *exactly* the fused decision
  after risk — the model cannot move a trade. But a hostile headline can still
  influence wording. The structural defence is that no AI output reaches the
  order path at all.
- **No HTTPS.** Traffic on your LAN is plaintext. This is a localhost tool; if
  you expose it beyond your own network, put it behind a reverse proxy with TLS
  and do not rely on the PIN alone.
- **No rate limiting on read endpoints.** A device already past the PIN can
  hammer `/api/*`. It is a denial-of-service against yourself, not a
  confidentiality problem.
- **This has not been penetration tested** by anyone other than its authors.

## If you are deploying it

1. Leave `config.app.allowPhone` **off** unless you need it.
2. Do not port-forward this to the internet. It is not built for that.
3. Set a long `MRCASH_PIN` if phone access is on.
4. Keep `LIVE_TRADING_ENABLED = false` until the validation gates are met — see
   `docs/PAPER_VALIDATION_PLAN.md`. Security and trading safety are different
   problems, and this file only covers the first.
