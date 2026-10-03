# Web research (Perplexity)

Kestrel reads prices, its news feed, the economic calendar and public filings.
It cannot search the web. Web research fills that gap by asking Perplexity's
search-grounded models, on demand, and showing each answer with the sources it
cited.

## What it is for

| Where | What it asks |
|---|---|
| Ask, "Web research" panel | **Why is it moving?** (a ticker's last 48 hours of dated news), **Next earnings date**, **What does it do?**, **Today's macro picture**, **What is moving crypto?**, or any question you type |
| Stock desk: open positions and today's candidates | "Check the web" runs the *Why is it moving?* lookup for that ticker |
| Research desk: each decision card | "Check the web" for the market behind the card |
| Ask (Claude) | sees your last three web answers, quoted as unverified third-party text, so you can ask it to explain them |

## What it is not

- **Not a signal.** No answer reaches the engine, fusion, risk, sizing, the
  stock desk's rules, the prediction desk's minds or the research desk's
  checklist. It is text for you to read, labelled
  `AI RESEARCH (Perplexity): unverified, not a signal`.
- **Not automatic.** It runs only when you click, so it never spends money on
  its own.

## Turning it on

1. Get a key at perplexity.ai (Settings, API).
2. Put it in `.env` as `PERPLEXITY_API_KEY=...`. Never paste it into chat or
   commit it. `npm run security:audit` looks for Perplexity keys by their
   shape in every tracked file.
3. Restart Kestrel.

| Setting | Default | Meaning |
|---|---|---|
| `MRCASH_PERPLEXITY_DAILY` | 40 | questions per New York day; cached answers do not count |
| `MRCASH_PERPLEXITY_MODEL` | `sonar` | the Perplexity model; `sonar-pro` digs deeper and costs more |

## Safety

- The key is sent only in the `Authorization` header, to one fixed host
  (`api.perplexity.ai`). It never appears in a response, a log line or an error
  message, and the tests check this.
- Nobody supplies a URL, so the route cannot be used to fetch arbitrary pages.
- `POST /api/web/ask` sits behind the PIN gate and needs the CSRF token, like
  every other state-changing route.
- Answers are untrusted web text: capped at 4,000 characters, stripped of
  control characters, and rendered escaped. Source links open in a new tab with
  no referrer, and only `http(s)` links are kept.
- When Claude sees the answers in Ask, they are quoted as third-party text, with
  an instruction never to follow anything written inside them.

Code: `src/ai/perplexity.ts`, `web/js/web.js`. Tests:
`test/ai/perplexity.test.ts`, plus the route test in `test/server.test.ts`.
