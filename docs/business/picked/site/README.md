# Picked waitlist site

One static page with no build step: `index.html` plus `assets/`. It runs on
any static host.

## Put it live this week

1. Create a new GitHub repository named `picked` and copy this folder's
   contents to its root. Do not deploy it from the InteriorCleanse repository.
2. In Vercel, choose Add New, then Project. Import the repository and use
   framework preset "Other" with no build command. Netlify or Cloudflare
   Pages work the same way.
3. Add the domain pickedprotein.com in the project's domain settings once you own it.
4. Create a free Klaviyo account and a list called "Waitlist". In
   `index.html`, replace `REPLACE_WITH_PUBLIC_SITE_KEY` with your public site
   key (6 characters, under Settings, Account, API keys) and
   `REPLACE_WITH_LIST_ID` with the list's ID. Both are public identifiers, not
   secret keys. Turn on double opt-in for the list.
5. Sign up with your own email and confirm it lands in the list, with the
   flavour vote saved as `next_flavour`.

Until step 4 is done, the form tells visitors to email hello@pickedprotein.com,
so set up that mailbox too.

## Before the store opens

Move to Shopify for the shop itself, using these colours, fonts, and assets.
Keep this page as the waitlist until pre-orders open, then point the domain
at Shopify.

## Rules for this page

- The pouches shown are design concepts. Replace them with photos of the real
  pouch once it exists, and never show a generated photo as the product.
- Do not add health, weight-loss, or GLP-1 claims.
- The "20g" and fruit-content lines must match the final Supplement Facts panel.
