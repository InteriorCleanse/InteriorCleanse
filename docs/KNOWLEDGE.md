# The knowledge layer

Three sources feed the Intel screen and the Ask desk.

## Built-in notes (`src/knowledge/`)

- **Policies** (`policies.ts`): one card per auction house: who may buy,
  registering, deposit, payment window and methods, every fee line, pickup and
  storage, disputes, the bidding style and closing rule, title types, traps.
  Each carries the month it was checked and links to verify. Sliding-scale
  houses never get an invented percent.
- **Regulations** (`regulations.ts`): the federal odometer rule (20 model
  years since 2021, model year 2011 on), the FTC Used Car Rule, NMVTIS, title
  brands, title jumping, per-year sale limits (varies by state, no national
  number), sales tax, emissions, lemon laws, the dealer licence, insurance,
  export-only lots, peer-to-peer eligibility (Turo, dated), NAAA arbitration.
- **Glossary** (`glossary.ts`): the words an auction throws at a beginner.
- **Search** (`index.ts`): one plain-word search across all three and the
  Playbook.

Facts were checked against public sources in September 2026; the sources are
in each entry. Fees and laws change. The verify link wins over the text.

## Car intel (`src/research/intel.ts`)

Free government data with no key: NHTSA recalls, complaints and crash-test
stars, and fueleconomy.gov mileage, for a year, make and model. It says what
the public record holds about the model, not the history of one car. When a
service is down the intel says so in a sentence.

## The web desk (`src/research/web.ts`)

With `ANTHROPIC_API_KEY`, the desk asks Claude to search the live web (a
server-side tool; nothing to install) and answer with the pages it read. The
answer is labelled AI research and lists its sources. Without a key the desk
answers from the built-in notes and says so. Nothing the desk says is ever
written into a plan automatically.
