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
trader's desk. The step bar follows it. It flies to the desks on screen and
checks the rest in step, so the flight stays in view. The real cycle runs in
milliseconds on the server; the flight is a picture of it.

How it moves:

- **Takeoff:** a crouch, then a jump that stretches and springs back.
- **Flight:** swooping curves that weave side to side and bank into each turn,
  growing slightly as it comes toward you. The longest leg of each patrol gets a
  barrel roll: the body and wings roll around the neck while the head stays
  still and level, eyes on you, as an owl's does.
- **Landing:** a flare with wings beating, then a squash on touchdown and one
  soft bounce.

Perched, its form is the floor's call, and each form has its own landing beat
and idle moves:

| Form | When | Look | After landing | Idle moves |
|---|---|---|---|---|
| Perched | No setup | Looks around, blinks | A hoot | Shake, stretch, head swivel, hop, hoot |
| Watching | A WATCH is forming | Pupils wide, curious head tilts | A slow radar scan | Scan, head swivel |
| Stooping | LONG or SHORT ready | Leans in, wings mantled, pupils narrow | Wings spread in a V: the call | Keeps still and focused |
| Holding | A paper position is open | Settled, sleepy eyes | A feather shake | Shake, stretch |
| Blind | Four or more desks cannot see | Eyes shut, head tucked | — | Keeps still |

When a setup is ready (stooping), the patrol ends differently: the owl climbs
off to one side, loops the loop, then dives onto the head desk with its wings
tucked and flares at the last moment before the call. The motion only ever
reflects the floor's state; it says nothing about how a trade will turn out.

It looks toward your pointer when you move over the floor. The owl is about
400 px wide on a desktop and 230 px on a phone.

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
