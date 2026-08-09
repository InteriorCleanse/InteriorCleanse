# Launch Plan

Checkpoint status, with the evidence each claim rests on. "Verified in browser"
means Chromium via Playwright against `npm run start` on the production build,
not a dev server and not a guess.

**Environment caveat for all browser evidence:** this container's proxy blocks
`images.unsplash.com`, `fonts.googleapis.com`, and the dotLottie CDN. Those
failures appear in any browser run here and are not defects in the code. Every
result below is stated from same-origin behaviour only.

---

## Checkpoint 1 — audit and visual foundation · **Complete**

| Criterion | Status | Evidence |
| --- | --- | --- |
| Current-state audit | Done | `docs/CURRENT_STATE_AUDIT.md` |
| Brand tokens | Already correct | `--ink #1C1A17`, `--bone #F7F4EF`, `--brass #A9895A`, `--sage #5B6357` in `app/globals.css` — match the locked identity, no change needed |
| Typography | Already correct | Fraunces (Didot/Bodoni-class) display + Inter body |
| Navigation / page shell | Preserved | Wordmark-first header; the botanical mark is secondary and sits beside it |
| Blocking bug fixes | 2 fixed | See below |

**Bugs found and fixed:**

1. **`/favicon.ico` 404 on every page.** Added `app/icon.svg` — the brass
   diamond already used as the wordmark accent, which the brand rules list as an
   approved secondary detail. Verified: `<link rel="icon" href="/icon.svg…">` is
   now emitted and `/icon.svg` returns 200.
2. **The logo-mark fallback never fired.** `components/logo-mark.tsx` relied on
   `onError`, but the image is in the server HTML, so its `error` event fires
   before React hydrates and is never replayed — the header rendered a
   broken-image circle. Fixed by checking `complete && naturalWidth === 0` on
   mount. Verified: `.logo-mark` count is now 0 when the file is missing, and
   the wordmark keeps its brass `◇`.

**Corrected finding:** an earlier pass reported `/robots.txt`, `/sitemap.xml`,
and `/icon.svg` returning 404 under `trailingSlash: true`. That was measured
against a stale server process from before those routes were built. Re-tested
against a fresh build: all three return 200. `trailingSlash` does not break
Next.js metadata routes.

**Also added:** `app/sitemap.ts` and `app/robots.ts` — the SEO floor from the
brief. Verified serving real content at `/sitemap.xml` and `/robots.txt`, with
`/admin/` and `/api/` disallowed.

---

## Checkpoint 2 — reusable 3D product engine · **Core complete**

| Criterion | Status | Evidence |
| --- | --- | --- |
| Three rendering modes | Done | `ProductExperience` dispatches `true_3d` / `spin_360` / `depth_interactive` |
| Data-driven, not hardcoded | Done | Mode comes from `Product.renderMode`; `resolveRenderMode()` downgrades when assets are absent |
| No canvas per card | **Verified** | `/shop` renders 6 depth stages and **0 canvases**; the product page renders exactly **1** |
| Poster fallback | Done | Layer 0 is a plain `<img>` in the HTML — it paints before any JS |
| Category registry | Done | `lib/category-experience.ts`, 7 categories |
| Accessibility | **Verified** | Focus lift measured at `matrix(1,0,0,1,0,-8.94)` on `:focus-visible` — identical to hover. `Spin360` is a `role="slider"` with arrow-key stepping |
| Reduced motion | **Verified** | Under `reducedMotion: 'reduce'`, `--px` stays `0` and the computed transform is `none` |
| Performance controls | Done | Three.js only imported for `true_3d`; `IntersectionObserver` pauses offscreen spin; dpr capped at 2 |

**Mode C measured working:** pointer at 85%/15% of a card produced `--px/--py =
0.800 / -0.673`, a real `matrix3d` rotation on the inner plane, `-8.79px /
+7.40px` of layer parallax, and a `-9px` stage lift. Pointer-leave reset it to 0.

**Not yet done in this checkpoint:** hotspots, per-variant material swaps, and a
separate accessible static gallery alongside the 3D viewer.

---

## Checkpoint 3 — homepage cinematic room · **Not started**

The existing homepage has a working `HeroScene` and `ScrollGallery`. The brief's
five-act scroll story (room awakens → design with intention → shop the world →
categories → final transformation) is a rebuild of that page, not an edit.

**Note a conflict for the owner to settle:** the brief specifies the headline
"Clear the noise. Reveal the room." and the slogan "Your space, reimagined with
intention." The site currently ships "For Mind, Home, Body & Spirit" across the
header, footer, and metadata — a slogan chosen in an earlier round of work.
These are incompatible positionings and one of them has to be retired. No code
has been changed either way.

---

## Checkpoint 4 — storefront · **Not started**

Needs `/shop/books`, `/shop/apparel`, `/shop/home`, `/shop/wall-art`,
`/shop/wallpapers`, `/shop/tiktok-finds`, `/shop/new`, `/shop/bestsellers`,
plus filters, sorting, search, and recently-viewed. The unified commerce fields
(`sourceType`, `checkoutMode`, `externalPurchaseUrl`) are now in `lib/types.ts`
and `lib/category-experience.ts` exposes `isInternalCheckout()` and
`purchaseLabel()` — but **nothing enforces them at the cart yet**. That
enforcement is the first task of this checkpoint.

---

## Checkpoint 5 — real catalog sources · **Blocked on credentials**

Printful, Printify, and Brevo adapters exist and are structurally correct.
None has ever been exercised against a live API. TikTok Shop and digital
wallpapers are not started. See `docs/COMMERCE_INTEGRATIONS.md`.

---

## Checkpoint 6 — Kie.ai and AI studio · **Blocked**

Not started. Blocked on `KIE_API_KEY`, a database, and object storage. The full
build specification is in `docs/KIE_ASSET_PIPELINE.md`.

---

## Checkpoint 7 — admin, content, and launch · **Partially blocked**

`lib/render-readiness.ts` ships now and derives the 3D readiness report from
product data alone — it needs no new storage and can be rendered in the admin
immediately. The product studio (create/edit/archive, asset upload, variant
mapping) cannot be built against flat JSON files; the brief requires adding a
normal product without a deploy, and that requires a database.

---

## The single blocking action, ahead of everything else

**Nothing on this site can be bought.** All six products have
`stripePriceId: null`, so `/api/checkout` returns 409 for every one of them.

Owner action — an agent cannot do this, it needs live keys:

```bash
npm run stripe:setup              # dry run
npm run stripe:setup -- --apply   # create Products/Prices, write IDs back
npm run stripe:setup -- --webhook
```

Then register the webhook endpoint in the Stripe dashboard as
`https://interiorcleanse.com/api/webhook/` — **with the trailing slash**.
`trailingSlash: true` makes Next.js 308-redirect the slashless URL, and Stripe
does not follow redirects when delivering webhooks. Get this wrong and every
event fails silently.

## Remaining credentials

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PRINTFUL_API_KEY`,
`PRINTFUL_STORE_ID`, `PRINTIFY_API_KEY`, `PRINTIFY_SHOP_ID`, `BREVO_API_KEY`,
`ANTHROPIC_API_KEY`, `KIE_API_KEY`, TikTok Shop app credentials,
`ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`.

Paste them into the Vercel dashboard directly. `.env.example` holds placeholders
only and no real key belongs in this repository.

## Next actions, in order

1. Owner runs the Stripe setup and registers the trailing-slash webhook.
2. Enforce `checkoutMode` at the cart so external items cannot be added.
3. Category routes and filters (Checkpoint 4).
4. Settle the headline conflict, then rebuild the homepage (Checkpoint 3).
5. Choose and provision a database — everything in Checkpoints 5–7 waits on it.
