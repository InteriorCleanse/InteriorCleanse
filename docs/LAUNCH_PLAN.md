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

## Checkpoint 3 — homepage cinematic room · **Superseded by the Residence build**

The original brief's five-act scroll story was overtaken by the Residence
specification, which asks for something different: not one page that scrolls
through five acts, but eight environments sharing one layered hero, plus a
locked showroom. That work is Checkpoint 8 below and it is built.

What survives from this checkpoint's decisions:

**Two lines from the original brief are still deliberately not applied**,
because both promise capabilities that do not exist:

- The supporting copy *"AI-guided interiors, thoughtful objects, and visual
  tools…"* — there is no AI studio, so this would be a claim about a product
  feature the site does not have.
- The primary CTA *"Design Your Space"* — it has no destination. Pointing it at
  `/shop/` would mislabel it.

Both are one-line swaps the moment the AI design studio ships.

**The slogan question, resolved narrowly:** "For Mind, Home, Body & Spirit"
still appears in the footer, `lib/site-config.ts`, and page metadata. Retiring
it everywhere is a site-wide rebrand and was not assumed.

---

## Checkpoint 4 — storefront · **Core complete**

| Criterion | Status | Evidence |
| --- | --- | --- |
| Collections | Done | All 8 routes return 200: `/shop/books`, `/apparel`, `/home`, `/wall-art`, `/wallpapers`, `/tiktok-finds`, `/new`, `/bestsellers`. An unknown slug still 404s |
| No duplicate routes | Done | Collections resolve inside the existing `/shop/[slug]`, collection-first. A product slug colliding with a collection slug throws at build |
| Filters / sort / search | **Verified** | Search "candle" → `1 OBJECT`, 1 card. Sort price-asc → `$26, $28, $34, $42, $58` in order. Clear returns to `6 OBJECTS` |
| Empty states | **Verified** | `/shop/wallpapers` renders 0 cards and explains delivery is still being built; `/shop/books` points to the Library |
| Multi-source checkout behaviour | **Verified with a fixture** | See below |
| Analytics | Done | `lib/analytics.ts` — `add_to_cart`, `checkout_started`, and outbound events fire; every call is wrapped so a tracking failure cannot break shopping |
| Mobile | **Verified** | Controls are 44px tall at 390px wide; no horizontal overflow |

**Checkout-mode enforcement.** `PurchaseAction` renders the CTA from
`checkoutMode`, and `CartProvider.add()` refuses external items outright —
resolved from the catalogue via `getProduct`, not from the caller's argument, so
no caller can talk its way past it.

Verified by temporarily adding an `external_tiktok` fixture product, building,
and testing in Chromium:

- CTA rendered as `<a>`, not `<button>` — text `SHOP ON TIKTOK ↗`,
  `target="_blank"`, href set to the external URL
- zero internal add-to-cart buttons on the page
- the note *"You will complete this purchase on TikTok Shop. Price and
  availability are set there."* rendered beneath it
- `/shop/tiktok-finds` picked the item up

The fixture was then removed; `content/products.json` is back to its 6 real
products and `git status` on it is clean. **No fabricated product was
committed.**

**Caveat, stated precisely:** the `CartProvider.add()` guard is defence in depth
and currently has no UI path that can reach it, because `PurchaseAction` never
renders an add-to-cart for an external item. It is verified by construction and
by the fixture test above, not by a click that triggered it.

**Not done in this checkpoint:** recently-viewed, wishlist, pagination or
virtualization (6 products do not need it yet), and per-category hero scenes.

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

## Checkpoint 7 — admin, content, and launch · **SEO, readiness, and legal done; product studio blocked**

| Criterion | Status | Evidence |
| --- | --- | --- |
| 3D readiness report | Done | New **3D Readiness** tab in `/admin`, rendered from `lib/render-readiness.ts` — derived from product data at render time, so it cannot drift out of sync with the storefront |
| Integration status | **Verified** | New **Integrations** tab + `/api/admin/integrations`. Every "not connected" row states the exact fix, not just the fault |
| Reset view / pause motion | **Verified** | Controls on `ProductStage`; see below |
| Organization + WebSite structured data | **Verified** | Both emitted on every page |
| Product structured data | **Verified** | Emitted with `brand`, `category`, `image`, `description` |
| Book structured data | **Verified** | Emitted with paperback and Kindle `workExample` entries |
| Breadcrumb structured data | **Verified** | `BreadcrumbList` on product and book pages |
| Canonical URLs | **Verified** | `https://interiorcleanse.com/shop/ic-signature-candle/` — correct, with the trailing slash |
| Sitemap | **Verified** | 33 URLs, now including all 8 collections |
| OG images | Done | Product and book pages set `openGraph.images` from their own artwork |
| Crawlable text outside WebGL | **Verified** | With JavaScript disabled the product name, `$34`, the full description, and the gallery image all render. No critical content is canvas-only |
| Accessible static gallery | Done | `StaticGallery` renders on every product page — plain server HTML, correct alt text, no dependency on the viewer loading |
| Legal pages | Done | `/legal/returns/` and `/legal/digital-license/` added and linked from the footer and sitemap |

**Structured-data honesty, verified rather than assumed.** Search engines treat
JSON-LD as a factual claim, so the emitted values were checked against reality:

- A product with no Stripe Price emits `PreOrder`, **not** `InStock` — it
  genuinely cannot be bought yet.
- A coming-soon product emits **no offer at all**.
- A book emits **no offer** — Amazon owns its price and we have no authorized
  live feed, so quoting one would be fabrication.

No rating, review count, or bestseller rank is emitted anywhere, because no
truthful source for them exists.

**Connector health, verified by authenticating against a running build.** The
admin API is correctly gated — `/api/admin/integrations`, `/contacts`, and
`/orders` all return `401 {"error":"Unauthorized"}` with no data leak when
unauthenticated, and `/admin` 307s to `/admin/login`. A wrong password returns
401; the correct one returns 200 and a session.

With no credentials set, all seven connectors report **Not connected**, each
with its specific fix, and the report lists the **5 products that cannot be
sold** for lack of a Stripe Price.

The report also detects the dangerous middle state, confirmed by running with
`STRIPE_SECRET_KEY` set but no webhook secret: Stripe reports **`partial`**, not
connected, with the blocker *"orders will be paid for but never fulfilled"*.
That combination is worse than being switched off — checkout appears to work and
nothing is ever shipped — so it gets its own state rather than a green tick.

**Viewer controls, verified in Chromium.** Pause toggles between *Pause motion*
and *Play motion* with `aria-pressed` tracking correctly, *Reset view* returns
the camera without tearing down the canvas, and both are keyboard-reachable.
Under `prefers-reduced-motion: reduce` the pause button is disabled and reads
*Play motion*, with a title explaining that motion is already off — auto-rotation
stops for any of three independent reasons and any one of them wins.

The tuned lighting values in `ProductStage` (bloom threshold 0.85, exposure 0.98)
were not touched; the controls are purely additive.

**Still blocked:** the product studio (create/edit/archive, GLB upload, 360-frame
upload, depth-layer builder, variant mapping, bulk operations). The brief
requires adding a normal product without a code deploy, and that is not possible
against flat JSON files — it needs a database and object storage.

---

## Checkpoint 8 — the Residence build · **Code complete, waiting on photography**

Eight environments, one hero component, a locked showroom, a guest book, and a
partner system. All of it is built and every piece degrades cleanly to the
poster-less state it is in today.

| Piece | Where | Status |
| --- | --- | --- |
| Scene manifest | `content/scenes.json`, `lib/scenes.ts` | 8 environments: atrium, library, conservatory, cleaning, chapel, gallery, atelier, pavilion |
| Layered hero | `components/hero/EnvironmentHero.tsx` | Layer A background, scrim, Layer C copy, Layer B hotspots + featured card |
| Background | `components/hero/SceneBackground.tsx` | Poster paints first; video mounts one rAF later and only if a file exists |
| Single-video rule | `lib/video-director.ts` | Exactly one video plays site-wide; nearest to viewport centre wins |
| Living stills | `app/globals.css` + `posterMotion` | Slow camera drift on each poster, so an environment is never dead before its clip arrives |
| Parallax | `components/hero/useParallax.ts` | Writes `--py` only, rAF-coalesced, IntersectionObserver-gated, no-op under reduced motion |
| Hotspots | `components/hero/Hotspots.tsx` | Real links, never painted into footage; collision avoidance below |
| Floating mark | `components/brand/FloatingMark.tsx` | Brand mark that drifts with scroll |
| Swipe browser | `components/browse/ProductBrowser.tsx` | One product at a time; every item also sits in the plain `/shop` grid |
| Locked showroom | `app/collection/`, `components/showroom/` | Four independent layers; swipe left passes, right saves; pinch/wheel zoom 1–2.6× |
| Guest book | `components/GuestBook.tsx`, `lib/click-sound.ts` | Web Audio click, synthesised — no audio file to load |
| Partners | `/partners`, `content/partners.json`, `lib/partners.ts` | Placeholder-first; see below |

**Hotspot collision avoidance.** Hotspot coordinates are authored against a
photograph, but the copy reflows with the viewport — a position that clears the
headline at 1440 can sit under it at 1024. Rather than hand-tuning coordinates
per breakpoint forever, `Hotspots` measures its dots against the real headline
and CTA rectangles on mount, on resize, and after `document.fonts.ready`, and
the offender steps aside with `aria-hidden` and `tabIndex -1`. It only ever
hides a duplicate route: every hotspot destination is also reachable from the
nav. Verified at 1440, 1280, and 1024 — at 1024 the "Art & Wallpaper" hotspot
steps aside and **0 collisions remain unresolved**.

**Text-over-image legibility is measured, not eyeballed.** `npm run
check:contrast` hides the interface, screenshots the backdrop behind seven text
surfaces, and reports WCAG contrast against bone — mean, worst point, and the
share of area under 4.5:1. It exits non-zero when a worst point falls below 3:1.
Tuning the hero scrim and the three-layer glyph shadow moved the headline from
mean 6.39:1 / worst 3.05:1 / 14.7% thin to mean 8.50:1 / worst 3.47:1 / 7.0%
thin against a stand-in image.

The tool also reports **NO POSTER** where no photograph is loaded, because a run
against the painted gradient reads ~17:1 everywhere and would look like
validation while proving nothing. **Today all seven surfaces report NO POSTER.**

**Partners, built for links that do not exist yet.** There are zero approved
affiliate links. Every partner carries `affiliateLink: "PENDING_APPROVAL"`,
which renders a greyed *Coming soon* — not a link element, no outbound event,
and a page banner stating that no links are live. Replacing that one string with
a real tracking URL flips the card, the disclosure, and the analytics
automatically. No commission rate is stated for any partner whose rate is
unknown. Full instructions: `docs/AFFILIATE_LINKS.md`.

**No invented products.** Empty category shelves stay empty and say so. A
product with no price renders "Coming soon", never `$0`.

**Performance, measured on the production build:** homepage First Load JS
**114 kB** (5.74 kB page + 89.5 kB shared), against a 200 kB target. `/shop`
112 kB, `/collection` 109 kB, `/partners` 109 kB. Zero WebGL canvases in any
product grid.

---

## The asset gap — the one thing holding the Residence back

`public/images/` contains **no environment posters** and `public/video/`
does not exist. Every path in `content/scenes.json` — `hero-poster.png`,
`library-poster.png`, and the rest — resolves to nothing today.

This is by design: the build was specified for assets that arrive later, and it
works without them. But eight environments are currently painted gradients.

- Prompts for all ten stills, briefed around where the copy and hotspots sit:
  `scripts/leonardo-generate.mjs` (`--dry-run`, `--only <scene>`,
  `--list-models`). It needs `LEONARDO_API_KEY` in the environment; the key is
  never read from or written to this repository.
- Posters can equally be uploaded straight to `public/images/` on the branch.
- **After any poster lands, re-run `npm run check:contrast`.** Until then the
  scrim tuning is unvalidated against a real photograph.
- Video is optional everywhere. `SceneBackground` only emits a `<source>` for a
  file the manifest declares, and `lib/video-director.ts` guarantees that at
  most one plays regardless of how many arrive.

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

1. Owner runs the Stripe setup and registers the trailing-slash webhook. Nothing
   can be bought until this happens.
2. Land the environment posters — generate with `scripts/leonardo-generate.mjs`
   or upload to `public/images/` directly — then re-run `npm run check:contrast`
   and re-tune any surface that reports FAIL or THIN.
3. Paste affiliate links into `content/partners.json` as approvals come in.
4. Optional footage per environment, dropped into `public/video/`; the manifest
   and the video director already account for it.
5. Choose and provision a database — everything in Checkpoints 5–7 waits on it,
   including the admin product studio.
6. Build the AI design studio, then swap in the brief's held-back hero copy and
   its "Design Your Space" CTA.
