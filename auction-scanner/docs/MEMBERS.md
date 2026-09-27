# Members

## Roles

- **Owner**: signs in with the PIN (`GAVEL_PIN`, or the random one printed at
  start). Sees everything plus the Admin page.
- **Member**: signs in with email + access code. Sees every screen except Admin.

Sessions are HMAC-signed cookies (`gavel_session`, HttpOnly, SameSite=Strict,
12 hours). Set `GAVEL_SESSION_SECRET` (32+ characters) so they survive a
restart. Every state-changing request carries the session's CSRF token in
`x-gavel-csrf`. Login attempts are throttled per client: eight failures lock
that client for fifteen minutes.

## Access codes

Format `GVL-XXXX-XXXX-XXXX` from an alphabet without I, O, 0 or 1. Only the
SHA-256 hash and the last four characters are stored (`data/members.json`).
The full code is shown once, on the Admin page, when it is created. **New
code** replaces a member's code. Issued codes forgive case, spaces and dashes;
codes set by hand in `GAVEL_MEMBER_CODES` compare exactly and work with any
email.

## The Admin page

Add a member by email → the code appears once with a copy button. The table
shows email, last four of the code, active, source (manual or stripe), since.
**Remove** deletes the member.

## Stripe

`POST /api/stripe/webhook` needs no session. It reads the raw body (1 MB
limit), verifies `Stripe-Signature` (HMAC-SHA256 over `${t}.${body}` with
`GAVEL_STRIPE_WEBHOOK_SECRET`, five-minute tolerance, constant-time compare),
and is idempotent on the event id (`data/stripe-events.json`).

| Event | Effect |
|---|---|
| `checkout.session.completed` | creates (or re-keys) the member from `customer_details.email` or `customer_email`, source `stripe`, with the customer and subscription ids |
| `customer.subscription.updated` | `active` / `trialing` → active; `past_due` / `unpaid` / `canceled` → off |
| `customer.subscription.deleted` | off |

Anything else is acknowledged and ignored. With no secret set, the route
answers 503 so a misconfigured endpoint is noticed.

## Limits

Gavel sends no email. The owner sends the code. Without Stripe, members are
added by hand on the Admin page.
