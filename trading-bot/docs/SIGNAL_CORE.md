# The Signal Core

The moving picture on the Home tab: a reactor core with every model Mr. Cash
runs. It exists because a live desk should look alive, and it is built so that
it cannot look more alive than the feeds behind it. The core is drawn by
`web/js/core.js`; the small charts and the stat strip sit in the fold below
it ("Charts, the track record and each model's notes").

## What it draws

| Element | Drawn from | When the reading is missing |
|---|---|---|
| Strategy satellites | One satellite per strategy in the fused panel, riding the gimbal rings. Mint for BUY, coral for SELL, iris for HOLD; size follows confidence; a strategy the regime switches off is hollow and silent. | No votes: empty rings, and "no votes for this candle" in the list below. |
| Agent ports | One hexagonal port per desk agent round the edge. Aqua reading, amber estimating, iris standing by; a blind agent is grey and dashed. | A blind agent sends nothing and says "can't see". |
| Pulses | A reading or a vote on its way into the core. Only a model that is reporting sends one; speed follows the strategy's confidence or the agent's state. The rhythm measures nothing. | No pulse from a blind agent or a switched-off strategy. |
| The eye and the gauge | The fused agreement score in the middle and again on the outer gauge, each with an arc for the score and a tick where the panel acts; the plasma takes the fused direction's colour. | An em dash, and an empty gauge. |
| Dressing | The plasma filaments and flares, the gimbal's spin, the accretion disk, the shockwaves as votes land, the HUD rings and the radar sweep. They carry no data. | Always drawn; still under reduced motion. |
| Touch | Drag turns the gimbal; pointing at a satellite or a port shows a card with the same numbers as its row in the list; clicking one scrolls to that row. Nothing on the core can place, change or cancel anything. | — |
| FILL | Simulated fills over signals, from the paper record. | "no signal yet". |
| HIT | Wins over wins plus losses, from closed paper trades. | "no closed trade". Under ten trades it says INSUFFICIENT SAMPLE. |
| EXPECTANCY | Mean R per closed trade. Never labelled "edge". | "no closed trade". |
| BOOK | Resting bid share from the live order book. | "stream not trusted". |
| Volume | The last 48 closed candles. | UNAVAILABLE. |
| Heat | Volume by New York hour and trading day over the last seven days of stored candles. | UNAVAILABLE. |
| Range | High, low and close of the last 96 closed candles. | UNAVAILABLE. |
| Pulse | One blink per trade on average: the period is 60 s over the tape's real trades per minute. | UNAVAILABLE. |

Every stat carries its provenance (REAL, APPROXIMATE, UNAVAILABLE), the same
labels the six agents use.

## Where the numbers come from

`GET /api/desk` carries a `core` block (`src/desk/agents.ts`, `buildCore`),
computed from the same inputs as the six agents plus the stored candles and
the paper record the server already reads for the route. The page
(`web/js/desk.js`, with `web/js/core.js` for the drawing) draws that block
and the agents, and nothing else: it makes one fetch, has
no thresholds of its own, and cannot reach an order path. Tests in
`test/desk/agents.test.ts` pin the rules: unread feeds are null, an empty
record is em dashes, small samples are labelled, the word "edge" never
appears, no random motion, and the animation stops when the desk is off
screen or the viewer prefers reduced motion.

## What it is not

It is not a forecast, not a track record, and not evidence of anything. The
picture changes shape when the votes change and speed when the tape changes;
that is all it claims.
