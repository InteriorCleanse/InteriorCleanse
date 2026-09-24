# The Signal Core

The moving picture on the Home tab: a brain with every model Mr. Cash runs.
It exists because a live desk should look alive, and it is built so that it
cannot look more alive than the feeds behind it. The brain is drawn by
`web/js/brain.js`; the small charts and the stat strip sit in the fold below
it ("Charts, the track record and each model's notes").

## What it draws

| Element | Drawn from | When the reading is missing |
|---|---|---|
| Strategy neurons | One neuron per strategy in the fused panel, inside the brain. Mint for BUY, coral for SELL, iris for HOLD; size follows confidence; a strategy the regime switches off is hollow and silent. | No votes: the brain with no neurons, and "no votes for this candle" in the list below. |
| Agent inputs | One node per desk agent round the outside. Aqua reading, amber estimating, iris standing by; a blind agent is grey and dashed. | A blind agent sends nothing and says "can't see". |
| Pulses | A reading or a vote on its way to the core. Only a model that is reporting sends one; speed follows the strategy's confidence or the agent's state. The rhythm measures nothing. | No pulse from a blind agent or a switched-off strategy. |
| The core | The fused agreement score in the middle, an arc for the score and a tick where the panel acts; its light is the fused direction. | An em dash. |
| Dressing | The cortex itself (two hemispheres of folds and dust), the cerebellum, the stem, the turn and nod, the breathing, the twinkle, the drifting motes, the orbit rings round the core and the wave of light across the brain. They carry no data. The flash and the ring of light round a neuron mark its pulse leaving and nothing more. | Always drawn; still under reduced motion. |
| Sparks | Signals racing along the folds. How many run is the one real thing about them: more models reporting (reading agents plus strategies the regime has not switched off) means more sparks. Where they run is dressing. | A quiet panel still shows a few; none under reduced motion. |
| Touch | Drag turns the brain; pointing at a neuron or an agent shows a card with the same numbers as its row in the list; clicking one scrolls to that row. Nothing on the brain can place, change or cancel anything. | — |
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
(`web/js/desk.js`, with `web/js/brain.js` for the drawing) draws that block
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
