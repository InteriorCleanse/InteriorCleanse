# Pasting affiliate links

Everything on `/partners` is driven by one file. There is no code to change and
no deploy step beyond committing.

## The one field you edit

**File:** `content/partners.json`
**Field:** `affiliateLink`

Find the partner by its `brand`, and replace the string `"PENDING_APPROVAL"`
with the tracking URL the programme gave you:

```diff
   {
     "id": "sweaty-yeti",
     "brand": "Sweaty Yeti",
     ...
-    "affiliateLink": "PENDING_APPROVAL",
+    "affiliateLink": "https://sweatyyetisauna.com/?ref=YOUR-REAL-ID",
     "applicationStatus": "applied",
   }
```

Also set `applicationStatus` to `"approved"` so the file reflects reality. That
field is bookkeeping — it does not control the page.

## What flips automatically

`affiliateLink` is the single switch. The moment it stops saying
`PENDING_APPROVAL`:

| Before | After |
| --- | --- |
| Card shows a greyed **Coming soon** | Card shows **View at Partner ↗** |
| Not clickable, not a link element | Real link, opens in a new tab |
| "Application submitted, nothing to link to yet" | "Affiliate link. You buy from *Brand*…" |
| No outbound analytics | Fires an outbound-click event |
| Page banner says no links are live | Banner drops that line once any link is live |

The check lives in one place — `isLive()` in `lib/partners.ts` — so the card,
the CTA, and the analytics event can never disagree about whether a link works.

## Rules the code enforces

These are not conventions; they are implemented:

- **Partner products never enter the Stripe cart.** There is no add-to-cart path
  on `/partners` at all. These are other people's checkouts.
- **CTA wording is fixed** — "View at Partner" or "Coming soon". Never "Buy now",
  which would imply our checkout.
- **`rel="sponsored noopener noreferrer"`** on every live affiliate link, which
  is what Google asks for and what keeps the tab isolated.
- **The disclosure appears twice** — once above the cards, once beside every
  individual CTA. A reader meets it before the first link, not after.
- **No prices, ratings, or reviews.** We have no authorized feed for any of them,
  and a stale price on an $8,000 sauna is worse than no price.

## Commission figures

`commissionAmount` and `commissionNote` are **records for you**, not published
on the page. Two entries are deliberately `null`:

- **Plunge** — programme exists, rate not publicly disclosed
- **Castlery** — programme exists with a 30-day tracking window, rate not public

Leave them null until the programme tells you the rate in writing. Do not fill
them with an estimate — `commissionType: "unknown"` is the honest value and the
page never displays these numbers anyway.

Update `lastVerified` whenever you re-check a programme's terms. Rates change,
and a figure recorded a year ago is not evidence of anything.

## Adding a partner

Append an object with every field the existing entries carry, including
`editorialNote` — the "Why it belongs here" line. A card with no editorial note
renders an empty box, and a partner you cannot write one sentence about probably
does not belong in a curated showroom.

Categories group automatically. A new `category` value creates its own section;
add a display label to `CATEGORY_LABEL` in `lib/partners.ts` if you want it
capitalised properly, otherwise the slug is used with hyphens replaced.
