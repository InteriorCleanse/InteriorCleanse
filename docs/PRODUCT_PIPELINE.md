# Product pipeline

How a product goes from nothing to live, without touching code.

## The one file

`content/catalog.json` is the catalog. Every sellable thing is one record in
it — Stripe merch, Amazon books, Gumroad downloads, affiliate partners. The
storefront (`/shop`, `/collection`, the homepage) shows only records whose
`status` is `published`. Everything else is invisible to the public.

`content/products.json` is no longer read by the site. It remains as the seed
input and for the older `npm run stripe:setup` script.

## Statuses

| Status | Meaning |
| --- | --- |
| `draft` | A shell. Name placeholder, category, environment. Nothing else. |
| `needs-assets` | Priced and sourced; no usable photography or cut-out yet. |
| `needs-pricing` | Synced from Printful/Printify; the retail price is unset. |
| `approved` | Complete and checked, held back on purpose. |
| `published` | Live. The only status the public site reads. |

Moving to `published` is gated. The server refuses it unless every rule
passes, and the admin shows the same list inline:

- hero image present
- price greater than 0
- category and environment set
- Stripe products: `stripePriceId` set
- affiliate products: `affiliateUrl` is a real URL, not `PENDING_APPROVAL`
- Gumroad / Amazon products: their URL set
- Printful / Printify products: variant ID set
- description longer than 50 characters

## Where edits go

| Where you are | What happens on save |
| --- | --- |
| Local (`npm run dev`) | Writes `content/catalog.json` and `public/products/` on disk. Commit and push. |
| Vercel | Commits to GitHub via the Contents API. Vercel redeploys; live in about a minute. |

The Vercel path needs `GITHUB_TOKEN` — a fine-grained token scoped to this one
repository with *Contents: Read and write*. The admin banner tells you which
mode you are in and, if writes are blocked, exactly what is missing.

## Publishing a product, end to end

1. Sign in at `/admin/login`, open **Products** (`/admin/products`).
2. **Create the record.** One of:
   - **New product** — type a name; a `draft` appears.
   - **Sync from Printful** / **Sync from Printify** — every store product
     arrives as `needs-pricing` with its mockups and variant ID.
   - **Import CSV** — download the **CSV template**, fill it in a spreadsheet,
     upload. Every row lands as `draft`. Any bad row fails the whole import
     with the reason, so a sheet is fixed once.
3. **Open the row** (click its *Blocking* cell). Fill in name, slug,
   description (more than 50 characters), category, environment, size class,
   price.
4. **Choose how it sells** — *Sells via*:
   - `stripe`: set the price, click **Create Stripe Price**. The Price ID is
     written back. Change the price later and click it again — a new Price is
     created and the old one retired. (Needs `STRIPE_SECRET_KEY` on the server.)
   - `affiliate`: paste the real tracking URL over `PENDING_APPROVAL`.
   - `gumroad`: paste the URL and click **Check** — it confirms the page is
     live and shows you the name and price it found.
   - `amazon`: paste the Amazon URL.
5. **Images.** Upload a hero (JPEG/PNG/WebP/AVIF, under 8 MB). For the
   showroom pedestal, either upload a transparent PNG or click **Cut out
   background** (remove.bg with `REMOVEBG_API_KEY`, otherwise a white-threshold
   cutout that only suits a shot on a white sweep). Add gallery images as you like.
6. **Save changes.** The *Blocking* list shrinks as rules pass. When it reads
   *Ready to publish*, click **Publish**. If anything is still missing the
   server says what, and the status does not change.
7. **Check it.** Preview ↗ opens `/collection/<slug>/`. The product is now in
   `/shop`, `/collection`, the sitemap, and has its own social card.

Bulk: tick rows, pick *Set to …*, **Apply**. A bulk publish skips any row that
fails the gate and reports which.

## Files a product owns

```
public/products/<slug>/hero.<ext>
public/products/<slug>/transparent.png
public/products/<slug>/gallery-<id>.<ext>
```

## Routes

| Route | Method | Does |
| --- | --- | --- |
| `/api/admin/products/` | GET | Whole catalog with per-record blocking issues and store mode |
| | POST | Create a draft (`name` or `slug`) |
| | PUT | Update one (`id` + fields). Publishing is gated. |
| | PATCH | Bulk status (`ids`, `status`) |
| | DELETE | Remove one (`id`); published records must be unpublished first |
| `/api/admin/products/import/` | GET | CSV template |
| | POST | CSV body → drafts |
| `/api/admin/products/upload/` | POST | multipart `slug`, `kind`, `file` |
| `/api/admin/validate/` | GET | Readiness for all, or `?id=` |
| | POST | Validate a body without saving |
| `/api/admin/remove-bg/` | POST | `{ slug }` → cut-out |
| `/api/admin/create-price/` | POST | `{ id, price? }` → Stripe Product + Price, idempotent |
| `/api/admin/validate-gumroad/` | POST | `{ url }` → reachable, name, price |
| `/api/printful/sync/` | GET / POST | Preview / write into catalog (admin session) |
| `/api/printify/sync/` | GET / POST | Same for Printify |

All of `/api/admin/*` is behind the admin session. The two sync routes check
the session themselves on POST because they sit outside that prefix.

## Seeding

`npm run seed:catalog` builds `content/catalog.json` from `products.json` and
`partners.json` plus twenty draft shells. It refuses to overwrite an existing
catalog without `--force`.
