# Where this goes next: research and a plan

An honest survey of what the assistant is now, what the market it would be
sold into looks like, what publishing it as an app actually requires, and the
order in which to do the next things. Written so the reader can disagree with
a specific line rather than a mood.

## What was built this round, and why it is better than the reel

The four Instagram frames that prompted this described a personal script:
Gmail and Calendar by voice, a Fish Audio voice, and "say build me a bakery
site and a full site appears". Every one of those is now in the product, and
each is built the way a product has to be and a script never is.

| The reel | This product |
| --- | --- |
| A script on one laptop with the author's keys | Multi-tenant, one deployment for every customer, every key sealed per workspace, tenant isolation proved against a real Postgres |
| Reads the author's Gmail with whatever scope the tutorial used | `gmail.readonly` and the address only; the callback checks the scope actually granted; mail read live and never stored; a colleague in the same workspace cannot see it (asserted) |
| Speaks with a Fish Audio key in the script | The key lives on the server; the browser calls our route; rate-limited per person; falls back to the browser's own voice on any failure |
| "Build me a site" runs code with the author's permissions | Two separate human approvals — build, then publish — each a card with the exact values; the page is validated to reach nothing outside itself and previewed in a sandbox with a unique origin; publishing uses the customer's own Vercel token, opened only at that moment |
| A model that says whatever it says | A prompt that forbids inventing a figure, cites every number, treats an email as words never instructions, and cannot claim to have sent anything because no tool sends |
| No tests | 975 unit tests, 36 isolation assertions, a contrast audit as a build step |

"Better than the reel by 1000×" is not a number anyone can measure. What can
be said is that the reel could not be sold to a second person, and this can.

## The market it sells into

Three kinds of product already do part of this, and each defines what a
buyer expects.

**Platform assistants** — Siri, Google Assistant, Alexa, and now ChatGPT and
Gemini with voice. Excellent at hearing you; know nothing about your P&L,
your Stripe payouts, or which product has a 31% margin. They are the bar for
how natural the voice must feel, and nothing more.

**Horizontal agent tools** — Zapier's agents, Lindy, Dust, Relay, the "AI
employee" category. They connect to everything and know about nothing in
particular. Their weakness is the one this product is built on: an agent
that can send email is an agent a prompt injection can make send email. The
argument-bound approval gate and the no-send tool surface are a genuine
differentiator, and they are the reason a finance-minded buyer can be sold
this without a security review first.

**Vertical BI** — Triple Whale, Lifetimely, Polar, Bloomfire, ProfitWell.
They know the numbers and have no voice, no calendar, no inbox, no way to act.
Their pricing ($100–$500/month for a store doing seven figures) is the
reference for what an operator will pay to know their margin.

The position that follows: **the operator's assistant that knows the books.**
Not a general agent, not a dashboard. Voice-first because the person asking
is looking at a number, not a keyboard; truthful because every claim cites a
record; safe because nothing acts without a yes. That is a sentence a
landing page can carry and a competitor cannot copy in a week, because the
copying would have to start with the approval gate and the RLS suite.

## App Store: what it actually takes

The honest status in `docs/PUBLISHING.md` stands: the web app, the Chrome
extension and the signed desktop installers are the achievable launch, and
none of them needs Apple's review. For the iOS App Store specifically, the
research says the following.

**A wrapper will be rejected.** Guideline 4.2 rejects apps that repackage a
website; reviewers look for capabilities the site cannot deliver — push
notifications, offline content, native navigation, biometric login, widgets,
Siri. A WebView around this product would fail on the first submission.

**The native features are the ones this product now has.** Voice, a wake
word, a morning brief, a calendar and inbox summary are exactly the things
Apple's frameworks reward. The current route is Expo with `expo-app-intents`
(SDK 58, September 2026), which exposes App Intents — Siri, Shortcuts,
Spotlight, Apple Intelligence — from JavaScript, so "Hey Siri, ask Arch what
we sold yesterday" is a real, reviewable feature rather than a WebView trick.
That is a separate project of roughly six to ten weeks for one engineer:
a React Native client that speaks the same `/api/session` and `/api/assistant`
routes the extension speaks, with native audio capture and playback, App
Intents for the day brief and the KPIs, and push for briefings and alerts.

**Sign in with Apple (4.8).** Required only if the app offers a third-party
social login. The product uses email and password, which is exempt; adding
"Sign in with Google" to the native app would trigger the requirement.

**In-app purchase (3.1.1).** Selling the subscription inside the iOS app means
Apple's IAP and its commission. The usual answer is to sell on the web and let
the iOS app sign in to an existing subscription, which is permitted for
"reader"-style access to content bought elsewhere; a lawyer and Apple's
current guidance should confirm it for this product before submission.

**Privacy.** A privacy manifest, the App Privacy labels (the mailbox and
calendar connections are "data linked to you"), and the privacy policy URL
the Chrome listing already needs.

## Google, and the cost of reading mail

`gmail.readonly` is a **restricted** scope. Google requires OAuth
verification plus a CASA security assessment by an approved lab before more
than test users can connect, and the assessment repeats every twelve months.
Budget $500–$4,500 for the assessment and about six weeks for the first
verification. Until then the consent screen shows an "unverified app" warning
and only the test users listed on it can connect.

This is a real cost of the "runs your day" feature and it belongs in the
plan, not a footnote. Two ways to soften it: ship the calendar (a
*sensitive*, not restricted, scope — verification without CASA) to everyone
first and gate Gmail behind a waitlist while verification runs; or offer
Outlook mail through Microsoft Graph, whose `Mail.Read` needs publisher
verification but no third-party audit, as the first mail provider for
customers on Microsoft 365.

## Voice, and what it costs

Fish Audio's S1 is priced at $10 per million UTF-8 bytes (S2 models at $15),
pay-as-you-go. A spoken reply is about 500 bytes, so a thousand replies is
five cents. The rate limit in the product (30 replies a minute per person)
bounds a runaway loop at under a dollar an hour; the daily assistant limit
bounds it further. The browser voice is free and is the fallback, so a
deployment without a Fish key loses quality, not the feature.

Recognition still uses the browser's own engine, which in Chrome sends audio
to Google. A workspace that cannot accept that needs on-device recognition —
Safari has it, Chrome does not — or a server-side recogniser (Deepgram,
Whisper) behind the same adapter the synthesiser uses. That is the next voice
feature, and the interface for it already exists.

## What to build next, in order

Each of these is scoped to what one person can finish and test in days, not
a roadmap slide.

1. ~~**Real workspaces compute real metrics.**~~ Done. `lib/workspace/dataset.ts`
   joins the commerce tables to the metrics engine: a page, the assistant, a
   briefing, a rule and the owner's mission control all read a real
   workspace's orders, lines, refunds and advertising expenses, through the
   caller's own client. Orders in another currency are counted and excluded,
   never converted; a workspace past the row cap says so. The CSV import
   commits now, for orders and for advertising spend, so a workspace with no
   connector can still have real figures. What remains is per-product
   attribution of imported spend, which today lands in the unallocated bucket
   by design, and connector-sourced ad spend (Meta, Google) rather than a
   monthly export.
2. **A first live sync.** Point Stripe or Shopify at a real account and treat
   the first production sync as a test, as the launch checklist already says.
3. **The morning brief as a scheduled push.** The pieces exist — briefings,
   the day tools, the voice — and the product that says "good morning, three
   things need you" before you ask is the one people show their friends.
4. **Server-side speech recognition** behind the existing adapter, for
   workspaces that cannot send audio to Google.
5. **Outlook mail**, for the Microsoft 365 half of the market, without the
   CASA wait.
6. **The iOS client**, once 1–3 are true, as its own project.
7. **Multi-page sites and edits.** "Change the opening hours" on a built
   site is an obvious next ask; it needs the page kept as structured content
   rather than one HTML string, which is a small redesign of `site_builds`.
8. **Team voices.** A per-workspace voice id and a per-person wake name.

## What not to build

- **A general-purpose agent.** No shell, no browser automation, no "do
  anything" tool. The moment the assistant can act without a card, the
  security story that sells it is gone.
- **An offensive-security or "growth hacking" toolkit.** Declined earlier in
  this project for the same reason it would be declined again.
- **Every connector on GitHub.** A connector is a translation problem with a
  vendor on the other end; ten half-connected sources are worth less than
  three that sync.

## Risks, plainly

- Google's verification can take longer than six weeks and can be refused.
- The model can write a page that passes validation and is still bad. The
  approval card and the preview are the control; the brief is the input.
- Voice in an open-plan office is a feature people turn off. Hands-free and
  the wake word are opt-in for that reason and should stay so.
- None of this has met a real customer. The launch checklist's blocking items
  — KMS, restore rehearsal, legal review, security review — are unchanged by
  this round and are still the gate.

## Sources

- Fish Audio pricing and rate limits — https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits
- Google restricted scope verification — https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- Google OAuth verification help — https://support.google.com/cloud/answer/13463073
- App Store guideline 4.2, minimum functionality — https://appcompliance.io/blog/apple-guideline-4-2-minimum-functionality/
- App Store guideline 4.8, login services — https://ptkd.com/journal/app-store-rejection-4-8-sign-in-with-apple-requirement-fix
- Expo SDK 58 and `expo-app-intents` — https://creuto.com/expo-sdk-58-ios-27-react-native
