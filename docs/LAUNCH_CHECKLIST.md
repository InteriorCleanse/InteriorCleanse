# Launch checklist

Ordered by what would hurt most if it were wrong. An unticked box is a
statement about the product, not a formality — the point of this file is that
somebody can read it and know exactly what has and has not been done.

## Blocking — do not take real customer data without these

- [ ] **A real KMS behind the vault.** `lib/vault/providers.ts` ships
      `kmsProvider()` ready to wire. The default static-key provider reports
      `productionReady: false` for a reason: one key, in an environment
      variable, no hardware boundary, no per-unwrap audit trail.
- [ ] **A restore rehearsal.** Restore a backup into a scratch project and run
      `npm run verify` against it. Include the vault key in the drill — a
      database restored without it is ciphertext nobody can open.
- [x] **RLS integration tests against a live Postgres.** 26 assertions in
      `tests/rls.integration.test.ts`, run with `npm run test:rls` against any
      Postgres 14+. They found one real defect (workspace creation with
      `RETURNING`) and are verified by mutation: disabling RLS on
      `organizations` fails four of them. Still to do in CI — see below.
- [ ] **A distributed rate-limit store.** The in-memory default is correct on
      one instance and reports that it is not distributed. Multi-instance
      without Redis means the assistant's spend cap is a fraction of what it
      claims.
- [ ] **Real privacy policy and terms.** The current pages are placeholders and
      say so on the page.
- [ ] Third-party security review.

## Before charging anyone

- [ ] Stripe in live mode: products, prices, `STRIPE_PRICE_*` set.
- [ ] Webhook endpoint registered, `STRIPE_WEBHOOK_SECRET` set, and a test
      event delivered end to end — verify the plan actually changes.
- [ ] Confirm nothing in front of the app re-serialises request bodies. The
      webhook verifies raw bytes; any JSON transformation breaks the signature.
- [ ] Walk the grace period by hand: fail a payment in test mode, confirm the
      workspace keeps working, then confirm read-only after the window **and
      that export still works**.
- [ ] Confirm a cancelled subscription drops to Free with data intact.
- [x] Entitlements enforced server-side from a mirrored subscription, never
      from client state — 39 tests.
- [x] No claim of guaranteed revenue anywhere in the product. The ROI
      calculator can and does return "this will not pay for itself".

## Security

- [x] RLS enabled and forced on every tenant table.
- [x] `integration_credentials` reachable only by the service role: RLS forced
      with no policy at all.
- [x] Credentials sealed with per-secret data keys and context binding, so a
      row moved between tenants fails to open.
- [x] Assistant tool surface has no general-purpose capability; every write
      requires an approval bound to exact arguments.
- [x] Webhook signatures verified against raw bytes, in constant time, with a
      replay window.
- [x] Rate limiting on the assistant, per workspace and per user, with a daily
      ceiling as well as a burst limit.
- [x] Append-only audit log, assistant transcripts, and delivery log.
- [x] Dependency and secret scanning in CI — `.github/workflows/ci.yml` runs
      gitleaks over full history and `npm audit --audit-level=high`, currently
      zero findings.
- [x] **`npm run test:rls` runs in CI** against a Postgres service container,
      with a guard step that fails the job if the suite *skipped* — a green tick
      that proved nothing about isolation is worse than a missing job.
- [x] No key-shaped literals in the repository. Vendor-shaped test fixtures are
      composed at runtime in `tests/fixtures/secrets.ts` rather than
      allow-listed, so a scanner finding is always a real one.
- [ ] Confirm no request body is logged in production.

## Data protection

- [ ] Data processing agreement and sub-processor list published.
- [ ] Export and deletion workflows tested end to end, including that a deleted
      workspace's calendar feed 404s.
- [ ] Retention decided and written down for `assistant_messages` and
      `usage_events`.

## Product

- [x] A new user reaches a useful dashboard without connecting anything — every
      workspace starts with clearly-labelled demonstration data.
- [x] Demo data is labelled on every surface that renders it, including
      briefings and assistant answers.
- [x] Profit by product accounts for COGS, fees, refunds and explicitly
      modelled ad allocation, with the unallocated remainder shown rather than
      hidden.
- [x] The assistant answers from tenant data and cites its sources.
- [x] Write actions require argument-bound approval.
- [x] Calendar feed is accurate about being read-only, structurally.
- [x] Owner console unreachable by ordinary users.
- [x] Key surfaces rendered and visually inspected in both themes.
- [x] No production screen substitutes fake data for missing data — an
      unavailable metric says so and gives the reason.
- [ ] Mobile verification of the assistant dock on a real device.

## Accessibility

- [x] Every chart has a keyboard-accessible table equivalent.
- [x] Colour is never the only signal; the palette is validated for
      colour-vision separation in both themes.
- [x] Interactive targets at least 44px.
- [ ] Full keyboard traversal of the assistant dock with a screen reader.
- [ ] Contrast audit of both themes against WCAG AA.

## Operations

- [x] Deployment runbook (`docs/RUNBOOK.md`) with named failure modes and the
      exact step in key rotation that causes data loss if done early.
- [ ] Alerting configured for the five signals in the runbook.
- [ ] On-call rota and escalation path.
- [ ] Status page.

## Commercial

- [ ] Trademark clearance on the final product name before public launch.
- [ ] Plan names and prices moved from `lib/billing/plans.ts` into owner-editable
      configuration.

## Honest gaps

Built to the point of being useful and no further. None of these should be
described to a customer as finished:

- Connector sync loops **run, but have never been pointed at a real account**.
  Stripe and Shopify are implemented end to end and tested against recorded
  responses; neither has met a live API, a real rate limit, or an account with
  four years of history. Treat the first production sync as a test.

- Calendar OAuth **has not been through a provider's app review**. The flows
  are implemented and tested; Google restricts `calendar.readonly` and will
  require verification before more than a handful of accounts can connect.
- Calendar events are pulled **once, at connect time**. There is no incremental
  refresh yet, so a meeting added tomorrow will not appear until the connection
  is remade.
- **Email deliverability.** Transport, rendering and the delivery log are
  built and tested, but nothing has been sent from a verified domain. SPF, DKIM
  and DMARC are not set up, and an alert that lands in spam is not an alert.
- Remaining chart modes and diagrams listed in `docs/IMPLEMENTATION_PLAN.md`.
