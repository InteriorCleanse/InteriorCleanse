# The floor

**Floor** is in the main navigation, next to Home. It shows Kestrel's agents as
a trading floor: every desk has one job, a live reading, a status, and the
websites its data comes from. A 3D owl, the head trader, flies the floor while
Kestrel works and lands with the call.

## The desks

| Desk | Job | Data from |
|---|---|---|
| BOOK | Reads bids against asks on the live order book | binance.com |
| TAPE | Counts aggressive buys against sells, trade by trade | binance.com |
| WHALES | Flags large prints on the tape and insider filings | binance.com, sec.gov |
| NEWS | Watches the economic calendar and crypto headlines | faireconomy.media, coindesk.com, cointelegraph.com |
| QUIVER | Reads disclosed congress trades for the names you follow | quiverquant.com |
| REGIME | Decides whether the market is trending, ranging or wild | Kestrel engine |
| SIGNAL | Gathers every strategy's vote on the candle | Kestrel engine |
| JEV | The AI second opinion: Claude makes its own call on the same numbers | anthropic.com |
| RISK | Checks size, limits, spread and the kill switch | Kestrel engine |
| PROOF | Keeps the paper record and the validation gates | Kestrel paper record |
| HEAD TRADER | The owl: the floor's call after the risk check | all of the above |

A desk that cannot see says so: "can't see" or "not connected", with what it
needs (for example `MRCASH_QUIVER_KEY` or `ANTHROPIC_API_KEY` in `.env`). It
never shows a zero in place of "we don't know".

## The owl

Each time a new reading arrives, the owl takes off and visits the desks in the
order the cycle uses them (collect, read, vote, check), then lands on the head
trader's desk. The step bar follows it. The real cycle runs in milliseconds on
the server; the flight is a picture of it.

Perched, its form is the floor's call:

| Form | When | Look |
|---|---|---|
| Perched | No setup | Idle, looks around, blinks |
| Watching | A WATCH is forming | Pupils wide, curious head tilts, gold rim light |
| Stooping | LONG or SHORT ready | Leans in, wings mantled, ember rim light |
| Holding | A paper position is open | Settled, sleepy eyes, teal rim light |
| Blind | Four or more desks cannot see | Eyes shut, head tucked, moonlight rim light |

Now and then it shakes its feathers or stretches a wing. It looks toward your
pointer when you move over the floor.

The owl is drawn on the graphics card by one shader in `web/js/owl.js`: no
library, no images, no network. Under "reduce motion" it never flies and draws
still frames only. It stops drawing when the page is hidden or scrolled away,
and it lowers its own resolution on a slow computer. Without WebGL the floor
shows the flat Kestrel mark instead.

## What it is not

Paper only. The floor reads endpoints the app already has (`/api/desk`,
`/api/second-opinion`, `/api/watcher`, `/api/news`, `/api/bigmoney`,
`/api/paper`) and draws them. It adds no route, no threshold and no way to
place, block or size a trade. JEV is a recorded second opinion and never
trades.

Code: `web/js/floor.js` (the desks and the patrol), `web/js/owl.js` (the owl),
styles under "The floor" in `web/css/app.css`.
