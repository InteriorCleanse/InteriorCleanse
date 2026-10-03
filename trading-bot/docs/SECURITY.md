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
   switch. A cleverer page points its own domain at 127.0.0.1 (DNS rebinding)
   so the browser treats Kestrel as that page's origin; the Host header check
   below is what stops it.
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
| PIN gate for any non-loopback device, with throttling → 429 | `src/security/login.ts`, `server.ts` |
| Two-factor login for other devices (PIN + authenticator code) once `vault:setup` is done | `src/security/login.ts` |
| Made-up PIN drawn from the OS secure random source | `server.ts` (`randomInt`) |
| `npm run security:audit`: keys in tracked files, `.env` exposure, phone access, 2FA, the live flag | `src/security/audit.ts` |
| Docker builds exclude `.env` and the data folders; compose publishes on 127.0.0.1 only | `.dockerignore`, `docker-compose.yml` |
| Loopback detection from the **socket**, never from a header; a request a proxy or tunnel forwarded is never loopback | `server.ts` `isLocal()`, `src/security/origin.ts` |
| Host allowlist on every request: DNS rebinding gets 421, not the app | `src/security/origin.ts`, `server.ts` |
| Login cap across all devices (50 failures / 15 min) on top of the per-device one | `src/security/login.ts` |
| Constant-time comparison of every secret | `src/security/harden.ts` `safeEqual` |
| Content-Security-Policy with a per-request nonce | `src/security/harden.ts` |
| Clickjacking: `frame-ancestors 'none'` + `X-Frame-Options: DENY` | same |
| `nosniff`, `no-referrer`, `Permissions-Policy`, COOP/CORP | same |
| Per-route request body caps (4–256 KB) | `server.ts` |
| Web research (Perplexity): key only in `.env` and the auth header, one fixed host, daily cap, answers escaped and labelled AI RESEARCH, never read by the engine | `src/ai/perplexity.ts`, `docs/WEB_RESEARCH.md` |
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
Kestrel too.

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

## Two-factor login and the audit (third pass)

**The front door.** With phone access on, another device used to need only
the PIN. Once the authenticator is set up (`npm run vault:setup`, the same
secret the vault uses), the login page asks for the PIN **and** the six-digit
code, and a failure never says which half was wrong. Ten failures lock that
device out for fifteen minutes; a code works once. The PIN field is now a
password field. `MRCASH_LOGIN_2FA=0` turns the second factor off (not
recommended). Behind a TLS proxy, `MRCASH_COOKIE_SECURE=1` marks the session
cookie `Secure`.

**Found and fixed:**

- The made-up PIN came from `Math.random`, which is predictable. It now comes
  from `crypto.randomInt`.
- There was no `.dockerignore`, so the Dockerfile's `COPY . .` would have baked
  `.env` (broker keys, the vault secret and passcode) and the paper record into
  any image built from the folder. There is one now.
- `docker-compose.yml` published the port on every network interface of the
  host. It now publishes on 127.0.0.1 only.
- The systemd unit now sets `UMask=0077` (files it writes are private) and
  `NoNewPrivileges=yes`.

**`npm run security:audit`** reads the repository, `.env` and the config and
prints PASS / WARN / FAIL with the fix for each. It scans every tracked file
for keys by their published shapes: private key blocks, Alpaca, Kraken,
Anthropic, OpenAI-style, Stripe live, GitHub, AWS and Slack, plus any line that
gives one of Kestrel's own secrets a value. It also checks that `.env` is ignored and
private to you, that Docker builds leave it out, the phone PIN and 2FA,
whether the vault guards the broker keys, the live flag, runtime
dependencies, the Node version and the webhook secret. It never prints a
value, only the file and line. It exits 1 on any FAIL, so it can run in CI or
a pre-push hook. Tests: `test/security/login.test.ts`.

## Rebinding, proxies and the front door (fourth pass)

An adversarial pass against a running copy found three ways round the gates
and closed each one. Tests: `test/security/origin.test.ts`,
`test/security/login.test.ts`, `test/server.test.ts`.

- **DNS rebinding — reproduced, fixed.** A request with
  `Host: attacker.example:4178` read the CSRF token from `/api/config` and then
  paused the stock desk with a forged POST that carried a matching Origin and
  `Sec-Fetch-Site: same-origin`. That is exactly what a page on a rebinding
  domain can make a browser send. Every request now has to name this computer
  in its Host header: `localhost`, `127.0.0.1` or `[::1]`, plus the computer's
  own network addresses and name when phone access is on, plus any names in
  `MRCASH_ALLOWED_HOSTS` (a tunnel or proxy name, comma separated). Anything
  else gets `421` and a one-line pointer, before any route runs. The
  TradingView webhook is the one exception: it arrives under a tunnel's name
  and carries its own secret.
- **A proxy or tunnel made the internet look like this computer — fixed.**
  `isLocal()` trusted any loopback socket, and a local reverse proxy (this file
  used to recommend one for TLS) or a tunnel (cloudflared, ngrok, Tailscale
  Funnel) connects from loopback. Everyone it forwarded skipped the PIN and was
  shown the webhook secret. A request carrying a forwarding header
  (`Forwarded`, `X-Forwarded-For`/`-Host`/`-Proto`, `X-Real-IP`,
  `CF-Connecting-IP`, `True-Client-IP`) is now treated as another device.
- **The webhook secret no longer goes in the URL.** `?secret=` was accepted
  (undocumented) and a URL lands in every proxy and tunnel log. The body or the
  `x-mrcash-secret` header still work; the query string gets `403`.
- **Rotating addresses no longer buys guesses.** The ten-strikes lock is per
  address, and IPv6 hands a single device millions. Fifty failures from all
  devices together in fifteen minutes now close the login to everyone until
  the window clears. This computer never needs the login, so the owner is
  never locked out of their own machine.

Considered and left alone: the session cookie stays `SameSite=Lax`. Every state
change is a POST with the CSRF token, so `Strict` would add almost nothing and
would sign you out whenever you follow a link into the app.

## Why not Supabase (or another hosted service)?

Supabase is a hosted Postgres database with login built in. It is a good way
to build a multi-user web app. It would not make this app safer:

- **It adds a door.** Today your keys and record never leave your machine.
  A hosted database means your data, and the keys to reach it, live on
  someone else's servers and cross the internet. That is a new place to be
  breached, not one fewer.
- **Auth is not the weak point.** The login here is already constant-time,
  throttled, and now two-factor. Supabase Auth would replace it with a
  remote dependency and a new set of keys to leak.
- **"Backdoors" come in through dependencies.** Most real compromises of small
  Node apps arrive through a poisoned package. Kestrel has zero runtime
  dependencies; a hosted SDK would be the first.

What actually protects your money, in order:

1. **Broker keys that cannot move money out.** At Kraken and Alpaca, create
   keys with **withdrawals disabled**, and for reading balances, trading
   disabled too. A stolen read-only key can look but not take. The doctor
   already refuses a key that can withdraw.
2. **IP allowlisting at the broker.** Both Kraken and Alpaca let you pin a key
   to your own IP address, so a stolen key is useless from anywhere else.
3. **2FA on the broker accounts themselves**, with an authenticator app, not
   SMS. That protects the money even if this machine is lost.
4. **Never expose the port.** Leave `allowPhone` off, or use it on your home
   wifi only. To reach Kestrel from outside, use a VPN such as Tailscale or
   WireGuard. Never port-forward it.
5. **Run `npm run security:audit`** after any change to keys or settings, and
   rotate any key that ever appeared in a screenshot, a chat or a commit.
6. **Keep the computer itself safe**: OS updates, disk encryption, and a
   screen lock. Anyone who can sit at the machine can read `.env`; no app
   setting changes that.

## What the first pass fixed

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
- **The PIN is six digits by default.** Throttled, but short. Set up the
  authenticator (`npm run vault:setup`) so other devices also need a code,
  or set `MRCASH_PIN` to something longer.
- **One session for every device.** A signed-in device keeps its cookie for
  30 days or until Kestrel restarts, and there is no per-device sign-out
  yet: restarting is how you sign every device out.
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
- **A proxy that adds no forwarding header is invisible.** Every common proxy
  and tunnel adds one, but a hand-rolled TCP forwarder would not, and whoever
  it forwards would be treated as this computer. Use a real proxy, and set
  `MRCASH_COOKIE_SECURE=1` behind TLS.
- **The all-devices login cap can be used to lock you out.** Someone on your
  network or past your tunnel can spend fifty wrong guesses and close the
  login for fifteen minutes. That is a denial of service, not a way in; the
  computer running Kestrel is unaffected.
- **This has not been penetration tested** by anyone other than its authors.

## If you are deploying it

1. Leave `config.app.allowPhone` **off** unless you need it.
2. Do not port-forward this to the internet. It is not built for that.
3. If phone access is on, run `npm run vault:setup` so the login needs an
   authenticator code, and set a long `MRCASH_PIN`.
4. Run `npm run security:audit` and fix every FAIL.
5. Keep `LIVE_TRADING_ENABLED = false` until the validation gates are met — see
   `docs/PAPER_VALIDATION_PLAN.md`. Security and trading safety are different
   problems, and this file only covers the first.
