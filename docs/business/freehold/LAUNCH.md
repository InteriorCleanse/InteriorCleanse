# Freehold launch: what runs on its own, and what is yours

Written 2026-10-04. The site is built. This page covers two things: the short
list only you can do, and how the first paid work arrives.

## How money comes in

1. **Free check.** Anyone types a domain at `/check/`. In about ten seconds
   it reads public DNS (SPF, DMARC, DKIM, MX, MTA-STS, TLS reporting, CAA)
   and grades whether someone else could send email as that firm. The check
   needs no signup, and the result has its own link.
2. **Paid review.** Every result ends with two buttons: book a call, and see
   the full review (`/private/review/`). The review is the first paid
   engagement. Its fee shows on the site once you set it.
3. **Ongoing work.** After the review, the client is offered fixes and
   monitoring, as `/private/` describes. You invoice from the Stripe
   dashboard. No checkout code is needed.

The check is the sales tool. One link shows a gap in the prospect's own
setup, in their own words, before you ever speak to them.

## The prospecting loop: about 20 minutes a day

```
cd freehold
cp prospects.example.csv prospects.csv     # add rows: domain,firm,contact
npm run prospects -- prospects.csv --base https://<your-domain>
```

This checks each domain, six seconds apart, and writes `prospects-out.csv`.
Each row has a grade, the worst finding, a link to the result, and a short
draft note. **Nothing is sent.** You read each draft, edit it, and send it
yourself from your own mailbox. Send to firms graded C or worse; the note
promises at most one follow-up, so keep to that. Where to find firms, and
how to talk to them, is in `docs/sales/LEAD_ENGINE.md` and
`docs/sales/SCRIPTS.md`. `prospects*.csv` is gitignored, so prospect names
never enter the repository.

## Already automated

- Deploys: every merge to `main` that touches `freehold/` builds and goes
  live. Unchanged commits are skipped (`vercel.json`).
- Inquiries: each form emails you and adds the sender to your Brevo list,
  once the keys below are set. Until then, forms fall back to plain email.
- Check reports: a visitor can ask for their result by email, and it
  reaches your inbox the same way.
- Search and AI discovery: the sitemap, robots, `llms.txt` and share
  images are generated.

## Your steps, in order (about one hour in total)

| # | Step | Time | Cost |
|---|---|---|---|
| 1 | **Domain.** Say "buy it" and Claude will quote `freeholdprivate.com` through Vercel; nothing is bought without your yes. Or buy it anywhere and add it to the `freehold` Vercel project. | 5 min | about $10 to $20 a year |
| 2 | **Inbox.** Create `hello@<domain>` (Google Workspace, Fastmail, or a forward). | 10 min | $0 to $7 a month |
| 3 | **Brevo** (free). Verify that address as a sender. Create a list and the text attributes `FH_KIND` and `FH_DATE`. In Vercel → `freehold` → Environment Variables, set `BREVO_API_KEY`, `BREVO_SENDER`, `INQUIRY_TO` and `BREVO_LIST_ID`. | 15 min | $0 |
| 4 | **Booking** (free Cal.com). Create a 20-minute call and set `NEXT_PUBLIC_BOOKING_URL` to its link. Every "Request a call" button then books directly. | 10 min | $0 |
| 5 | **Fee.** Set `NEXT_PUBLIC_REVIEW_FEE`, for example `From $2,500`. This is your call. Our reasoning: about 20 hours at the $80 to $140 an hour freelance range in `HIGH_VALUE_SERVICES.md` comes to $1,600 to $2,800. Leave it blank to quote per call. | 2 min | — |
| 6 | **Also set** `NEXT_PUBLIC_SITE_URL=https://<domain>` and `NEXT_PUBLIC_CONTACT_EMAIL=hello@<domain>`, then redeploy once. | 3 min | — |
| 7 | **Legal read.** Have someone qualified read `/privacy/`, `/terms/` and `/discretion/` before you take a paid client. | Outside work | Varies |
| 8 | **Vercel plan.** The free plan's limit of 100 deploys a day is shared with the other projects in this repository, and it has already blocked Freehold. Either move to Pro or disconnect projects you are not using. | 5 min | $20 a month, or $0 |

Steps 1 to 6 make the site fully live. Step 7 must be done before you take
money. After that, the prospecting loop above is the whole job.

## What will not happen without you

No message is ever sent to a prospect. No purchase is made without a quote
you have approved. No client name, testimonial or price appears that you have
not given. The site does not claim results it has not had.
