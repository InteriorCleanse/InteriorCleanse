# The Signal Core

The moving picture on the Desk tab, between the hero and the track record.
It exists because a live desk should look alive, and it is built so that it
cannot look more alive than the feeds behind it.

## What it draws

| Element | Drawn from | When the reading is missing |
|---|---|---|
| The wireframe | One vertex per strategy in the fused panel, pushed out by its confidence; every pair joined. Mint for a long lean, red for a short lean, grey for none. | No votes: the rings only, and "no votes for this candle". |
| Rotation speed | The tape's trades per minute when the trade stream is trusted. | A constant slow turn. Motion never implies a tape that is not being read. |
| Breathing | The volatility ratio of the current candle. | None. |
| The number in the middle | The fused agreement score and the score it would act at. | An em dash. |
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
(`web/js/desk.js`) draws that block and nothing else: it makes one fetch, has
no thresholds of its own, and cannot reach an order path. Tests in
`test/desk/agents.test.ts` pin the rules: unread feeds are null, an empty
record is em dashes, small samples are labelled, the word "edge" never
appears, no random motion, and the animation stops when the desk is off
screen or the viewer prefers reduced motion.

## What it is not

It is not a forecast, not a track record, and not evidence of anything. The
picture changes shape when the votes change and speed when the tape changes;
that is all it claims.
