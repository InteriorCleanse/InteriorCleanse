# Revenue today — the honest runbook

Written 2026-09-26 against the catalog as it stands. This is the shortest
path from the current repository to real money, and what was built in this
pass to make the demand side ready the moment the supply side unblocks.

## Where the money is stuck

Nothing on this site can take a real dollar until the owner does four things.
None of them are code. All four are already documented step by step in
`docs/LAUNCH_WEEK.md` and `docs/FINISH_PLAN.md`; this file only orders them
by dollars unlocked per minute of the owner's time.

| # | Owner action | Minutes | What it unlocks |
| --- | --- | --- | --- |
| 1 | Stripe to live mode, live keys into Vercel, webhook at `https://interiorcleanse.com/api/webhook/` (trailing slash), one real purchase refunded | 30 | Candle $34, mug $26, tote $28, hoodie $58, print $42 become buyable |
| 2 | Upload `assets/downloads/room-reset-checklist.pdf` to Gumroad as a free product, paste the URL into the record, Publish | 15 | The lead magnet every video and email points at |
| 3 | Paste the five Amazon URLs into `content/books.json` and each book record, set price, Publish | 20 | Five founder books sellable through `/library/` |
| 4 | Send the three affiliate follow-ups (templates in `content/marketing/email-launch-sequence.md`) | 20 | Sweaty Yeti, Sauna Kit Co, Select Saunas links; the highest ticket on the site |

Printful (`FINISH_PLAN.md` Step 2) is the fifth action. It is not on the
critical path for the first dollar because the candle is hand-fulfilled, but
without it a paid mug or tote order sits in Stripe and the admin waiting for
someone to post it. Do not publish merch as buyable at scale until it is done.

## What this pass built

Demand-side assets, all grounded in the real catalog. No product, price, rate,
review, or number was invented. Anything that depends on a link the owner has
not pasted yet is tagged `HOLD-UNTIL-LIVE` in the file.

| File | What it is | Made by |
| --- | --- | --- |
| `content/marketing/faceless-video-scripts.md` | Thirty faceless short-form scripts (hook, voiceover, on-screen text, own-home b-roll list, CTA, caption) in four recurring series | TikTok Strategist agent |
| `content/marketing/instagram-launch-pack.md` | Bio and link-in-bio order, nine-post launch grid, seven story sequences, ten carousels, daily engagement routine, reply templates | Instagram Curator agent |
| `content/marketing/email-launch-sequence.md` | Brevo automation map, emails 2 to 6 after the existing welcome, two post-purchase emails, partner follow-up cadence, deliverability checklist | Email Marketing Strategist agent |
| `docs/FIRST_DOLLAR_PLAN.md` | Ranked 24-hour actions, the first-dollar funnel and its metrics, ten zero-cost experiments for weeks 1 to 4, the weekly review | Growth Hacker agent |

The brief every agent worked from is reproduced at the end of this file so the
next session can regenerate or extend any piece under the same rules.

## The two repositories from the screenshots

Both were read before deciding whether to wire them in. Neither was.

**Creatorberry/faceless** (MIT) turns a script into a reel where "Peter and
Stewie" or "Rick and Morty" characters talk over Minecraft parkour footage,
voiced through the Fish Audio API. It is a working tool for that format. It is
the wrong format for this brand: the characters are someone else's
intellectual property, the visual language is the opposite of a quiet
editorial home, and the audience it pulls does not buy a $34 candle or a
kitchen book. The scripts in `content/marketing/faceless-video-scripts.md`
are faceless in the sense that works here: the owner's hands, home, and
products, voiceover off camera. They can be cut in CapCut in an afternoon
with no API key.

**JackInSightsV2/Automated-Agentic-AI-Web-Agency** (MIT) is a different
business: it scrapes Google Places for local firms without websites, builds
them a site, and sells it through automated calls, SMS, and email. It needs
seven paid services (Google Places, Bland.ai, Resend, Stripe, Telegram,
Twilio, Supabase) before its first outreach, and automated cold calling and
texting has legal exposure that the repository does not resolve for you. It
does not sell what InteriorCleanse sells. If the owner wants to run a web
agency, that is a second business and a second decision, not a bolt-on to
this storefront.

## First-dollar sequence for today

1. Owner does actions 1 and 2 in the table above. Forty-five minutes.
2. Put the link-in-bio live in the order given in the Instagram pack.
3. Film and post the first three scripts from the faceless plan. All three
   drive the free checklist and the homepage signup.
4. Paste emails 2 and 3 into Brevo behind the existing welcome email.
5. Send the day-0 affiliate follow-ups.
6. Sunday: the 45-minute review in `docs/FIRST_DOLLAR_PLAN.md`.

## What was deliberately not done

- No videos or images were generated. The published products still carry
  stock or generated imagery on some records, and the owner's rule is that
  generated product media comes only from a reference of the real product.
- No product, draft shell, price, or partner rate was touched.
- No Stripe, cart, or 3D code was touched.
- Nothing was posted to any social account. Posting is the owner's action.

---

## Appendix: the brief the agents worked from

### Brief

Business: InteriorCleanse, https://interiorcleanse.com — "For Mind, Home, Body & Spirit".
A small Next.js storefront for a considered home: a hand-poured candle, a mug, a tote, a hoodie,
an art print, five books written by the founder, three printable downloads, and disclosed
affiliate placements for saunas / cold plunge / furniture. Voice: quiet, editorial, plain-English,
honest, no hype, no exclamation marks, no emojis in body copy. Dark editorial design, palette
ink #1C1A17, bone #F7F4EF, brass #A9895A, sage #5B6357.
Socials: TikTok @interiorcleanse, Instagram @interiorcleanse. Contact hello@interiorcleanse.com.

## Hard rules (owner's rules — violating any of these makes the work unusable)
1. NEVER invent a product, a SKU, a price, a review, a testimonial, a follower count, or a result.
2. NEVER state or imply a commission rate for Plunge or Castlery (not published). Sweaty Yeti,
   Sauna Kit Co and Select Saunas rates may be mentioned only in internal docs, never in public copy.
3. Affiliate content must carry a plain disclosure ("affiliate link, we may earn a commission").
4. Videos are FACELESS: no founder on camera. B-roll is the owner's own phone footage of their
   own home, hands, products, pages of the books, the printed checklist. No stock footage of
   products, no AI-generated product imagery, no other brand's photography.
5. Only link to URLs that exist. Allowed CTAs:
   - interiorcleanse.com/  (homepage; has an email "guest book" signup)
   - interiorcleanse.com/shop/ic-signature-candle/   ($34, published)
   - interiorcleanse.com/shop/ic-ceramic-mug/        ($26, published)
   - interiorcleanse.com/shop/ic-linen-tote/         ($28, published)
   - interiorcleanse.com/shop/ic-premium-hoodie/     ($58, published)
   - interiorcleanse.com/shop/considered-home-art-print/ ($42, published)
   - interiorcleanse.com/library/   (the founder's books — pages go live once Amazon links exist)
   - interiorcleanse.com/partners/  (affiliate partners — cards go live once links are approved)
   Anything about the books or downloads must be tagged HOLD-UNTIL-LIVE so the owner does not
   post it before the link exists.
6. No claims about health outcomes from saunas/cold plunge beyond "many people find". No medical claims.

## Products and status (today, 2026-09-26)
Published, buyable (Stripe; live keys pending on the owner's side):
- InteriorCleanse Signature Candle (ic-signature-candle), $34, hand-poured, shipped by the founder.
- InteriorCleanse Ceramic Mug (ic-ceramic-mug), $26, 11 oz white glossy, wordmark one side, mark the other.
- InteriorCleanse Tote Bag (ic-linen-tote), $28, natural cotton tote, ink mark over wordmark.
- InteriorCleanse Premium Hoodie (ic-premium-hoodie), $58, charcoal, tonal left-chest mark.
- The Considered Home Print (considered-home-art-print), $42, giclée 18×24 on heavyweight matte,
  "a study in warm neutrals: three thresholds, one horizon, one sun", ships flat and unframed.

Founder books (paperback + Kindle on Amazon; site pages live once the owner pastes Amazon URLs):
- The Calm Room Method — "A field guide to rooms that breathe." Editing visual noise, quieter
  storage, room-by-room editing prompts, warm neutral palettes, storage decisions as rituals.
- Small Home Reset — "Organizing beautifully when every inch counts." Vertical storage without
  chaos, entry/kitchen/closet reset plans, containers that disappear, weekly maintenance rhythms.
- The Edited Kitchen — "A quieter approach to the hardest-working room." Countertop rules,
  pantry zones that reduce duplicate buying, cabinet edits by frequency of use, evening cleaning rituals.
- The Rested Body — "Sleep, light, and the rooms that hold them." Evening light, bedding materials,
  clearing surfaces that keep you awake, a repeatable closing routine.
- Clean Air, Clean Home — "A practical guide to what you breathe indoors." Ventilation, filtration,
  fragrance trade-offs (including candles, honestly), room-by-room ventilation habit.

Printable downloads (Gumroad; live once the owner uploads them):
- The Room Reset Checklist — FREE, 12 pages, one page per room, surfaces-before-floors order,
  15-minute version and full version. This is the lead magnet.
- The Considered Pantry — $12, 10 pages: zone maps, label sheets, restock sheet.
- The Calm Room Workbook — $18, 40 pages.

Affiliate partners (all applied, links pending; page shows "Coming soon" until approved):
- Sweaty Yeti (outdoor cedar saunas), Sauna Kit Company (indoor sauna kits), Select Saunas
  (multi-brand, HSA/FSA via TrueMed), Plunge (cold plunge), Castlery (furniture).

## Audience
People in their late 20s to 50s who want a calmer home and are tired of "haul" culture. They
respond to before/after, quiet ASMR-style cleaning and resetting, plain talk, and lists. Formats
that work in this niche: room resets, "one rule" tips, pantry/closet edits, evening routines,
"what I stopped buying", sauna/cold routine at home.
