# Deployment and operations runbook

Written for the person on call at 3am who did not build this. Every procedure
states what to check first, what to do, and how to know it worked.

## What this system is made of

| Piece | Where it runs | If it is down |
| --- | --- | --- |
| Next.js app | Vercel or any Node host | Everything is down. |
| Postgres + Auth | Supabase | Everything is down. RLS is enforced here, so there is no degraded mode that skips it. |
| Anthropic API | External | The assistant returns a clear error. Dashboards, imports and briefings are unaffected — they compute locally. |
| Stripe | External | Existing subscriptions keep working; nobody can change plan. Entitlements are read from our mirror, not from Stripe live. |

The dependency order matters: **the product is useful without Anthropic and
without Stripe.** Only Supabase is load-bearing.

## First deploy

1. Create the Supabase project. Run `supabase/migrations/*.sql` **in filename
   order** — later migrations reference earlier tables and functions. To check
   the set applies cleanly before touching the project, run `npm run test:rls`
   against a scratch Postgres: it replays every migration from an empty schema
   and then asserts isolation.
2. Set the environment from `.env.example`. The minimum is the three Supabase
   values; everything else degrades honestly when absent.
3. Generate the vault key: `npm run keygen` → `VAULT_MASTER_KEY`. Without it,
   integrations needing an API key refuse to connect rather than storing a
   secret we cannot defend.
4. Deploy, then claim ownership: sign up normally, then
   `node scripts/bootstrap-owner.mjs you@example.com`. This works exactly once.
5. Verify: sign in, open `/app/command-center` (demo data renders), open
   `/owner-admin` (only you can), and check `/app/integrations` shows the
   vault as configured.

## Backups

Supabase takes daily backups on paid plans. **That is not a backup strategy
until you have restored one.**

- **Monthly:** restore the latest backup into a scratch project and run
  `npm run verify` against it. A backup nobody has restored is a hypothesis.
- **Before any migration:** take a manual snapshot. Migrations here are not
  reversible by design — several drop and recreate policies.
- **The vault key is not in the database.** A Postgres backup restored without
  `VAULT_MASTER_KEY` yields ciphertext nobody can open. Store the key wherever
  you store break-glass credentials, and test that path too. This is the single
  most likely way to lose customer integrations permanently.

## Rotating the vault master key

Do this on a schedule, and immediately on any suspicion of exposure.

1. Generate a new key: `npm run keygen`.
2. Move the current key into `VAULT_PREVIOUS_KEYS` as `k1:<old hex>`, set the
   new one as `VAULT_MASTER_KEY`, and bump `VAULT_MASTER_KEY_ID` to `k2`.
3. Deploy. Everything keeps working: old ciphertext opens with the old key,
   new writes seal under the new one.
4. Rewrap: for every `integration_credentials` row with `key_id = 'k1'`, call
   `rewrapSecret()` and write back. Only the small wrapped data key changes.
5. Confirm `select count(*) from integration_credentials where key_id = 'k1'`
   returns 0.
6. **Only then** remove the old key from `VAULT_PREVIOUS_KEYS`. Removing it at
   step 3 is data loss, not cleanup — the error will name the missing key.

## Incidents

### The assistant is failing

1. Check whether it is us or Anthropic: does `/app/command-center` render? If
   yes, the database is fine and only the assistant path is affected.
2. Check the rate limiter: 429s with `retry-after` are the system working.
3. Check `ANTHROPIC_API_KEY` and the account's own limits.
4. **Mitigation:** unset `ANTHROPIC_API_KEY`. The dock then says the assistant
   is not configured, which is a better experience than timeouts, and nothing
   else is affected.

### Billing webhooks are failing

Symptom: someone paid and their plan did not change.

1. Stripe dashboard → Developers → Webhooks → look at recent deliveries.
2. A **400** is a signature failure: `STRIPE_WEBHOOK_SECRET` is wrong or the
   body is being transformed by a proxy. The endpoint verifies the raw body, so
   anything that re-serialises JSON in front of us breaks it.
3. A **500** is a processing failure; the event id has been released, so
   Stripe's retry will re-process it. Fix the cause and let it retry.
4. Never fix this by editing `subscriptions` by hand except as a last resort —
   the next webhook will overwrite it. Fix the webhook and replay the event
   from Stripe.

### A tenant reports seeing another tenant's data

Treat as a **Sev 1** and page. This should be impossible: isolation is enforced
by RLS in the database, not by application code.

1. Do not deploy a "fix" first. Capture the evidence: the exact URL, the
   workspace ids, the signed-in user id.
2. Check `audit_logs` for impersonation events around that time — support
   impersonation is read-only but it *does* change what a session can see.
3. Verify RLS is still enabled:
   `select relname, relrowsecurity, relforcerowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`.
   Any `false` is the bug.
4. If a policy was dropped, restore from the migration and rotate the vault key
   — assume any credential that was reachable is compromised.
5. Reproduce before closing it out: point `npm run test:rls` at a scratch
   database built from the current migrations. If the isolation tests pass there
   and the incident was real, the cause is not the policies — look at the
   service role, which bypasses them.

### A connector has stopped syncing

1. `/app/integrations` shows the badge and the last run. `Access revoked` means
   the vendor rejected the credential — the customer must reconnect, and no
   amount of retrying helps. `Degraded` means a rate limit or a vendor 5xx, and
   the next scheduled sweep will retry on its own.
2. Check the scheduler is actually calling `GET /api/integrations/sync` with
   `x-cron-secret`. It returns **404** for a wrong or missing secret, so a
   misconfigured cron looks exactly like a missing route.
3. A run that keeps reporting `partial` on the same connection is a backfill
   that is larger than one run's page budget. That is working as designed —
   each sweep advances the watermark — but if it never converges, the account
   has more history than the sweep interval can absorb.
4. Nothing here loses data on failure: the watermark only advances over records
   that were written, so a gap is always refetched.

### Nobody is receiving notification email

Check in this order — the first three are configuration, not faults.

1. **Is a provider configured?** `RESEND_API_KEY` and `EMAIL_FROM` must both be
   set. Without them every delivery row says so, in words, and the status is
   `suppressed` rather than `failed`. That is a supported configuration.
2. **Is the scheduler running?** `GET /api/notifications/dispatch` with
   `x-cron-secret`. It returns **404** for a wrong or missing secret, so a
   misconfigured cron looks exactly like a missing route.
3. **Look at `notification_deliveries`.** Every decision is recorded with a
   reason: quiet hours, a severity floor, email switched off, no address on
   file, no provider, or a provider error. Silence is never ambiguous here.
4. A `failed` row with a provider message is the only case that is ours. A
   rejected API key is permanent and needs a new key; a 5xx is transient and
   the next sweep retries.
5. In-app notifications are never suppressed. If someone says they saw nothing
   at all, check `notifications` before the email path — the two are separate.

### Scheduled jobs

Two endpoints, both hourly, both authorised by `CRON_SECRET` and both safe to
run more often or to miss:

| Endpoint | Does | If it does not run |
| --- | --- | --- |
| `/api/integrations/sync` | Refreshes connectors due for a sync | Figures go stale; the health badge says so, and no data is lost. |
| `/api/notifications/dispatch` | Evaluates rules, sends due briefings | No alerts and no briefings. A missed hour is skipped, not sent late. |

`vercel.json` declares both. On another host, point any scheduler at them with
the secret in `x-cron-secret`.

### Suspected credential compromise

1. Rotate the vault master key (above).
2. `update integration_credentials set revoked_at = now()` for the affected
   workspaces, and tell them to rotate the keys at the vendor. Our ciphertext
   being safe does not help if the plaintext leaked elsewhere.
3. Rotate `SUPABASE_SERVICE_ROLE_KEY`. It bypasses RLS entirely and is the
   thing an attacker most wants.

## Monitoring

Alert on these, in priority order:

1. **Auth failure rate** — a spike means either an outage or an attack.
2. **Webhook 4xx/5xx rate** — money silently not being recorded.
3. **Assistant error rate and spend** — the only endpoint with unbounded cost.
4. **`integration_sync_runs` with `status = 'failed'` or `'partial'`** —
   customers' numbers are quietly going stale, and they will not notice until
   they act on them. A run stuck in `'running'` with no `finished_at` means the
   process died mid-sync; the watermark did not move, so the next run refetches
   the gap and no data is lost.
5. **p95 latency on `/app/command-center`** — the page everyone lives on.

Do **not** alert on rate-limit 429s. They are the system working, and paging on
them trains people to ignore the channel.

## Scaling notes

- The rate limiter's default store is in-memory and reports
  `distributed: false`. On more than one instance the effective limit is the
  policy times the instance count. **Move to Redis before running multiple
  instances**, or the protection on the expensive endpoint is a fraction of
  what it says.
- `loadWorkspaceAnalytics` recomputes from raw records. Above roughly a hundred
  thousand orders per workspace, materialise `daily_business_metrics` and read
  from that.
- Assistant streaming holds a connection open for the length of an answer. Size
  the instance concurrency for that, not for average request duration.
