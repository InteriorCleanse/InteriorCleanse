# Freehold site

Built 2026-09-27. Source in `freehold/` at the root of this repository, its
own Next.js 14 project with its own `package.json`. It is a separate business
and will move to its own repository the moment one exists; see "Repository"
below for why it does not yet.

## What exists

| Path | Purpose |
| --- | --- |
| `/` | The principle, the two lines of work, what ownership means, how we work |
| `/build/` | Freehold Build: three proof points, the billing rule, how a build runs, FAQ, waitlist form |
| `/private/` | Freehold Private: the entry review, what it can become, conduct, FAQ, call request form |
| `/about/` | Why it exists, who runs it, stated plainly as one person |
| `/contact/` | Email and a general form |
| `/private/review/` | The review, check by check across five areas: domains, mail, the public web, people, and the admin accounts. What we need from the client, and what the review is not |
| `/discretion/` | The security and discretion policy the Private FAQ promised: NDA first, scoped and revoked access, where information lives, AI model use, people, incident notice within 24 hours, services relied on. Marked as a draft for adoption |
| `/privacy/`, `/terms/` | Drafts, each carrying a line that says they need professional review |
| `/api/inquiry/` | Form handler: requires a JSON same-origin request, validates, rate-limits per IP, drops honeypot hits. With `BREVO_API_KEY` set it emails the message to `INQUIRY_TO` through Brevo's transactional API (so the "one inbox" promise is true) and adds the address to list `BREVO_LIST_ID` without ever overwriting an existing contact. Without the key it returns 503 and the form tells the visitor to email instead |
| `/sitemap.xml`, `/robots.txt`, `/llms.txt`, `/opengraph-image` | Search and AI discovery, and the rendered share image |
| `public/brand/` | `mark.svg`, `favicon.svg`, `wordmark.svg`, `lockup.svg` |

## Design

Second pass, 2026-09-27, after the owner asked for something avant-garde and
reputable. Palette moved from cream-and-oxblood (the default reach for
"luxury", flagged by the installed design skills as an AI tell) to paper,
graphite, and one accent, signature-ink cobalt. The signature visual is the
plat: a survey drawing of a plot that server-renders complete, draws itself
once with GSAP, and tilts toward the pointer. Reveals unblur and rise on
scroll through IntersectionObserver only. The ownership chapters stack as
sticky panels. Everything is static under `prefers-reduced-motion` and
visible without JavaScript. Both reviewers' findings (security: three medium,
five low; code: five required) are fixed in this commit: Content Security
Policy and HSTS headers, no contact overwrite, transactional delivery,
per-page canonical and Open Graph URLs, the OG image on the edge runtime with
its font traced.

## Checks passed on this commit

- `npm run build`, `npx tsc --noEmit`, `npm run lint`: clean.
- `npm run check:contrast`: every text and background pair passes 4.5:1 in
  light and dark mode.
- axe (WCAG 2.0 A, AA and 2.1 AA) on the five main pages at desktop, phone,
  and dark: zero violations. Zero console errors. No horizontal scroll at
  390 px.
- Every route returns 200; unknown paths return the 404 page; the API
  rejects a blank name and a bad email with 400 and reports 503 when Brevo is
  not configured.

## Vercel

A Vercel project named `freehold` was created in the GTEnterprises team,
framework Next.js, root directory `freehold`, linked to the
`InteriorCleanse/InteriorCleanse` repository, with `NEXT_PUBLIC_CONTACT_EMAIL`
and `BREVO_LIST_ID` set. The API confirmed creation (id
`prj_oO5c4QHIld1QDPycs8kh3DGybIBe`) but the token this session holds cannot
read it back or list its deployments, and this container cannot reach
`vercel.app`, so the preview was not verified from here. Check the Vercel
dashboard: pushes to the branch `claude/business-profit-agents-uw913k` should
produce preview deployments; production builds from `main` once the branch
merges.

## Owner actions, in order

1. Open the Vercel dashboard, confirm the `freehold` project and its latest
   preview deployment build green. If the project is missing, create it with
   the settings above; it takes two minutes.
2. Buy the domain. `freeholdprivate.com` and `freehold.build` were available
   on 2026-09-27; see `NAME.md`. Add it to the Vercel project and set
   `NEXT_PUBLIC_SITE_URL` to match.
3. Create the mailbox `hello@` on that domain (or change
   `NEXT_PUBLIC_CONTACT_EMAIL`). The site shows it on every page.
4. Brevo: verify a sender address, create a list for Freehold, create two
   text contact attributes `FH_KIND` and `FH_DATE`, then set `BREVO_API_KEY`,
   `BREVO_LIST_ID`, `BREVO_SENDER`, and `INQUIRY_TO` in Vercel. Until then
   the forms tell visitors to email, which works.
5. Plausible: set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` if you want analytics. Nothing
   is tracked otherwise.
6. Have the privacy, terms, and security and discretion pages read by a
   professional before the domain points at the site. The discretion page is
   a set of commitments: before it goes live, make each one true in practice
   (an encrypted workspace per engagement, MFA everywhere, a 24-hour incident
   notice you can actually meet), or edit the line. Then remove the draft
   line at the top.
7. Merge the branch to `main` for the production deployment.
8. Decide the three things in `docs/sales/HIGH_VALUE_SERVICES.md` section 5
   (lead service, metro, minimum fee) and the Build monthly fee. The site
   publishes no price until you do.

## Repository

The plan says a new business gets its own repository. Creating one from this
session was refused by GitHub (the app integration cannot create
repositories). To split it later: create an empty `freehold` repository, then
`git subtree split -P freehold -b freehold-only` in this repository and push
that branch to the new one; point the Vercel project at it and clear the root
directory. Nothing in the site depends on the parent repository.

## What the site deliberately does not do

No published price, no testimonial, no client name, no partner rate, no stock
photograph, no marketing email, no third-party script except Plausible when
enabled. Those are the brand rules in `BRAND.md`, and they hold.
