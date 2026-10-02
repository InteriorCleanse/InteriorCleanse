# Picked waitlist site

A static site with no build step. It runs on any static host.

| Path | What it is |
| --- | --- |
| `index.html` | Home: hero and waitlist, flavor switcher, label comparison, how it mixes, stockist pitch, FAQ, waitlist with flavor vote |
| `real-fruit-test/` | The lead magnet: how to read a protein label in 60 seconds |
| `privacy/` | Draft privacy page, marked for owner review, not indexed |
| `assets/site.css`, `assets/site.js` | All styles and behavior. Light and dark themes, reduced-motion support |
| `assets/fonts/` | Bricolage Grotesque and Libre Franklin, self-hosted WOFF2 (Open Font License) |
| `assets/img/` | Empty until you add the mood photos (see below) |
| `robots.txt`, `sitemap.xml`, `llms.txt`, `site.webmanifest` | Search and AI-crawler files |
| `assets/og-image.png` | 1200×630 link preview |

## Put it live

1. Create a new GitHub repository named `picked` and copy this folder's
   contents to its root. Do not deploy it from the InteriorCleanse repository.
2. In Vercel, Add New, Project, import the repository, framework preset
   "Other", no build command.
3. Add pickedprotein.com in the project's domain settings once you own it.
4. Klaviyo: create a "Waitlist" list with double opt-in on. In
   `assets/site.js`, replace `REPLACE_WITH_PUBLIC_SITE_KEY` and
   `REPLACE_WITH_LIST_ID`. Both are public identifiers, not secret keys.
   Signups carry `waitlist_terms: "updates"`, `next_flavour`, and
   `signup_page`, which the flows in `../marketing/EMAIL.md` use.
5. Sign up with your own email and check it lands in the list with the vote.
6. Set up the hello@pickedprotein.com mailbox. The form points people there
   until step 4 is done.

## Add the photos

Download the mood images listed in `../brand/mood/MOOD.md` and save these
two into `assets/img/`:

- `strawberry-glass.png` for the hero. With it, the pouch sits in front of
  the photo. Without it, the pouch shows alone on a strawberry panel.
- `runner-shaker.png` for the "Scoop. Pour. Shake." section. Without it, the
  shaker concept shows instead.

Compress both to WebP or high-quality JPEG under 250 KB before launch, and
update the file names in `index.html` if you change the format.

## How the flavor switcher works

The tabs set `data-flavor` on the page root. That one attribute recolors the
accent, the flavor band, and the closing waitlist band, and swaps the pouch.
The choice is remembered in the visitor's browser. "Vote for Mango" scrolls to
the waitlist form with that vote preselected.

## Rules for this site

- The pouches, sticks, display, and shaker are design concepts. Replace them
  with photos of the real product once it exists, and never present a
  generated image as the product.
- No health, weight-loss, or GLP-1 claims.
- The "20g" and fruit lines must match the final Supplement Facts panel.
- The left label on the home page is a composite of common clear-whey
  ingredients and says so. Never put a named competitor's label there.
- Customer-facing copy uses US spelling: flavor, color.
