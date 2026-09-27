# Drive — the car sharing section at `/drive/`

A recreation of a peer-to-peer car rental marketplace (the "Turo" model),
built as a self-contained application inside this Next.js site. It runs on
a **sample fleet**: every car, host and review is generated, nothing is
charged, and the section is `noindex` until real listings exist
(`DRIVE_INDEXABLE` in `lib/drive/config.ts`).

## What a visitor can do

| Screen | Route | Notes |
| --- | --- | --- |
| Home | `/drive/` | Search by city and dates, browse by body type, featured cars, recently viewed |
| Explore | `/drive/cars/` | Filters and sort live in the URL; list or schematic map; "load more" |
| Car | `/drive/cars/<slug>/` | Specs, features, host, guidelines, reviews, sticky booking panel with live quote |
| Book | `/drive/book/<slug>/` | Four steps: dates → protection → extras → review. Total visible throughout |
| Trips | `/drive/trips/`, `/drive/trips/<id>/` | Upcoming / past / cancelled, check-in checklist, receipt, `.ics` export, cancel |
| Saved | `/drive/saved/` | Hearted cars |
| Host | `/drive/host/`, `/drive/host/new/`, `/drive/host/listings/` | Earnings estimator from fleet medians; four-step listing wizard; drafts |
| Inbox | `/drive/inbox/` | One thread per car or trip; the demo host replies automatically and says so |
| Account | `/drive/account/` | Name, theme, units; export / import / clear the device's data |
| Help | `/drive/help/` | Searchable FAQ and the keyboard shortcut list |

## Navigation

- Five primary destinations: a top bar on wide screens, a fixed tab bar on
  phones, with live counts for upcoming trips and unread host messages.
- **⌘K / Ctrl-K** (or `/`) opens a command palette over pages, cars and
  actions. `g` then a letter jumps to a section (`g t` trips, `g s` saved…).
  `?` opens the shortcut list.
- Every search is a link: filters, dates, city and sort round-trip through
  the query string, so the back button undoes a filter and a search can be
  shared.
- Breadcrumbs on every deep page; `aria-current` on the active section.

## Where things live

```
lib/drive/
  types.ts        domain model (money in integer cents, dates as YYYY-MM-DD)
  catalog.ts      body types, features, protection plans, extras, trip fee
  pricing.ts      pure quote() — itemised, protection untaxed, lines sum to total
  search.ts       URL ⇄ SearchState, filtering, sorting, availability
  dates.ts        UTC calendar arithmetic, billable days, formatting
  format.ts       money, plurals, ids
  data.ts         typed access to content/drive/fleet.json
  store.tsx       device store (localStorage + useSyncExternalStore)
  routes.ts       every Drive URL and the nav table
  config.ts       names and switches
  __tests__/      node:test suites for the pure modules
components/drive/ shell, palette, cards, filters, map, booking, trips, host, inbox…
app/drive/        the routes and drive.css (all selectors prefixed `dr-`)
content/drive/fleet.json   generated sample data
scripts/drive/seed-fleet.mjs   deterministic generator for the fleet
```

The storefront's chrome (header, footer, cart drawer, intro veil, cursor,
smooth scroll) is mounted by `components/SiteChrome.tsx`, which renders bare
`<main>` under `/drive/` so the section carries its own frame.

## Data and privacy

There is no account and no server. Saved cars, trips, listings, threads and
preferences live in `localStorage` under `ic-drive:v1`, are read once after
mount (never during render, so hydration is clean) and sync across tabs.
The Account page exports and imports the whole thing as JSON.

## Checks

```
npm run test:drive     # pricing, dates and search
npm run drive:seed     # regenerate content/drive/fleet.json (deterministic)
npm run build          # includes all /drive/ routes
```

## Not built, on purpose

Photos (the fleet is drawn, not photographed), a map tile provider (the map
is schematic and self-contained), payments, real hosts and identity checks.
Each of these needs a backend and real listings before it is worth faking.
