# The floor

**Floor** is in the main navigation, next to Home. It shows Kestrel's agents as
a trading floor: every desk has one job, a live reading, a status, and the
websites its data comes from. Above the desks the floor is a live galaxy, and
a 3D snowy owl, the head trader, flies from world to world while Kestrel works
and lands with the call.

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

## The galaxy

A window onto space at the top of the floor, dark in either theme. It has
drifting nebula, a slowly turning spiral galaxy, three layers of twinkling
stars that shift with parallax as the owl moves, and the odd shooting star.

Every desk is a world, each a different kind:

| World | Desk |
|---|---|
| Banded gas giant (bids and asks) | BOOK |
| Ringed world | TAPE |
| Ocean world | WHALES |
| Storm world, with lightning while it reads | NEWS |
| Red rock | QUIVER |
| Swirling weather | REGIME |
| Dark crystal with veins of light | SIGNAL |
| Violet world with glinting sparks | JEV |
| Red world inside a shield | RISK |
| Gold moon | PROOF |

A world shines while its desk is reading, dims while it waits, and goes grey and
dark when it cannot see. Its name tag below it says the same in words.

The head trader's world is the planet curving across the bottom. Its night side
shows city lights and its atmosphere glows along the horizon in the colour of
the call:

| Atmosphere | Call |
|---|---|
| Blue | No setup |
| Amber | A WATCH |
| Ember | LONG or SHORT ready |
| Teal | A paper position is open |
| Grey | Blind |

Interactive:

- Tap a world (or press Enter on its tag) and the owl flies over to it, lights
  it up and flies home.
- Tap the owl and it reacts: a hoot, a hop, a head swivel, a wing-spread or a
  feather shake.
- Tap anywhere else in the sky and it looks there. It also follows your pointer.

## The owl

A snowy owl: white down with soft grey chevrons on the body and wings, a clean
white face with fine strokes around the eyes, amber-orange eyes, a small black
beak, feathered feet and dark talons.

Each time a new reading arrives, it takes off and flies world to world in the
order the cycle uses them (collect, read, vote, check), then lands on the head
trader's world. The step bar, the world tags (✓ once visited) and the desk cards
below follow it. The worlds are far away and home is close, so it shrinks as it
flies out and grows as it comes back. The real cycle runs in milliseconds on
the server; the flight is a picture of it.

How it moves:

- **Takeoff:** a crouch, then a jump that stretches and springs back.
- **Flight:** swooping curves that weave side to side and bank into each turn.
  The stars streak behind it when it flies fast. The longest leg of each patrol gets a
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
off to one side, loops the loop, then dives onto the home world with its wings
tucked and flares at the last moment before the call. The motion only ever
reflects the floor's state; it says nothing about how a trade will turn out.

The owl is about 380 px wide on a desktop and 210 px on a phone, at home on the
horizon.

The owl and the galaxy are each drawn on the graphics card by one shader
(`web/js/owl.js`, `web/js/galaxy.js`), with no library, no images and no
network. Under "reduce motion" the owl never flies and both draw still frames
only. They stop drawing when the page is hidden or scrolled away and lower
their own resolution on a slow computer. Without WebGL the floor keeps a flat
night sky with the world tags, and the flat Kestrel mark instead of the owl.

## What it is not

Paper only. The floor reads endpoints the app already has (`/api/desk`,
`/api/second-opinion`, `/api/watcher`, `/api/news`, `/api/bigmoney`,
`/api/paper`) and draws them. It adds no route, no threshold and no way to
place, block or size a trade. JEV is a recorded second opinion and never
trades.

Code:

- `web/js/floor.js`: the desks, the layout of the worlds, the patrol and the
  taps.
- `web/js/galaxy.js`: the sky and the worlds.
- `web/js/owl.js`: the owl.
- Styles: under "The floor" in `web/css/app.css`.
