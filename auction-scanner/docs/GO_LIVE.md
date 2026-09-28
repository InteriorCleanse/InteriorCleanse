# Going live with Gavel

The order that gets you from "it runs on my computer" to "members pay and use
it", with what each step costs and unlocks. The Connect screen inside the app
shows the same list with a live tick next to each one.

Every secret below goes in the server's environment (the `.env` file next to
`package.json`, or your host's settings page). Never in the code, never in git.

## 1. Run it on your computer (today, free)

1. Install Node 22.18 or newer from nodejs.org.
2. In the `auction-scanner` folder: `npm install`, then `npm run selftest`.
3. `cp .env.example .env`, then `npm start`.
4. Open the address it prints, sign in on the Owner tab with the PIN it prints.
5. Answer the four setup questions. The feed shows SAMPLE cars until step 2.

## 2. Connect the auction sources

| Source | What you get | Cost | What to do |
|---|---|---|---|
| **GSA Auctions** | Federal fleet cars, trucks and SUVs, live, no buyer premium | Free | Get a key at api.data.gov/signup (emailed in a minute). `GAVEL_GSA_API_KEY=…` Or `GAVEL_GSA=1` to try the shared demo key. |
| **eBay Motors** | eBay auctions and Buy It Now cars, live | Free | developer.ebay.com → join → Application Keys → create a Production keyset. `GAVEL_EBAY_CLIENT_ID=` (App ID) and `GAVEL_EBAY_CLIENT_SECRET=` (Cert ID). |
| **MarketCheck** | Auction lots in the feed, and dealer asking prices from across the country behind every estimate | Paid plan; ask for trial data; check their current pricing | marketcheck.com/apis → a plan with Inventory Search and Auction Inventory Search. `GAVEL_MARKETCHECK_API_KEY=…` If your dashboard shows a different auction path than `search/car/auction/active`, set `GAVEL_MARKETCHECK_AUCTION_PATH`. |
| **Copart, IAA, Bring a Trailer, Cars & Bids, Manheim, GovDeals, dealers** | Any lot you look at, scored and planned | Free in Gavel; Copart and IAA need their own membership to bid | None of them offers a public API. In Gavel open **Import** and drag **Send to Gavel** to your bookmarks bar. On any lot page, click it. For many lots, export a CSV from your auction account and upload it on the same screen. |

Start with GSA and eBay (both free). Add MarketCheck when you want sharper
prices: it is the largest single improvement to the estimates.

**Why not scrape Copart and IAA?** Their terms forbid automated collection,
and the services that sell their data are unofficial. Gavel stays on the
right side of that line: it only reads lots you open yourself. When Copart or
IAA offer an official data programme, or you hold a licensed data feed, an
adapter can be added next to `src/sources/gsa.ts` in an afternoon.

## 3. Turn on the intelligence

`ANTHROPIC_API_KEY=…` from console.anthropic.com (pay as you go). Then
`npm install` once and restart. This unlocks: walkthroughs rewritten for each
car, the Intel desk searching the live web with its sources, and an AI reader
for lot pages the rule reader cannot parse.

## 4. Put it on the internet

Gavel is one Node process that keeps files in `data/` and runs the Sniper on
a clock. It needs a host that **stays running** and **keeps its disk**:

- **A small VPS** (any provider): install Node 22, copy the folder, fill in
  `.env`, run `npm start` as a system service, put Caddy in front for HTTPS.
- **A platform with a persistent disk** that runs a long-lived Node service.

Serverless hosts that stop the process between requests and wipe the disk are
the wrong fit: the Sniper would never run and members' data would vanish.

On the server set:

```
GAVEL_HOST=0.0.0.0
GAVEL_PIN=<six digits you choose>
GAVEL_SESSION_SECRET=<32+ random characters>
GAVEL_SECURE_COOKIES=1
```

Point your domain at the server, let Caddy (or the platform) issue the HTTPS
certificate, and open `https://your-domain`. Back up `data/` daily; each
member can also download their own backup in Settings.

## 5. Get paid

1. In Stripe, create a product with a monthly price and a Payment Link.
2. Add a webhook endpoint `https://your-domain/api/stripe/webhook` with the
   events `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`.
3. Put the endpoint's signing secret in `GAVEL_STRIPE_WEBHOOK_SECRET`.
4. Share the Payment Link. When someone pays, Gavel creates the member; open
   **Members**, press **New code** next to them, and send the code. A
   cancelled or unpaid subscription switches them off by itself.

## 6. Before you tell anyone

- `npm run check` passes and `npm run doctor` shows PASS on what you set up.
- Sign in as a test member on your phone. Their watchlist, targets and garage
  are empty (every member's data is their own).
- Read `docs/SECURITY.md`'s operator checklist.
- Bidding stays PAPER: the Bid button and the Sniper record your number and
  open the lot; you place the real bid on the auction's site. None of the
  auctions above offers a public bidding API, so Gavel never bids for you.
