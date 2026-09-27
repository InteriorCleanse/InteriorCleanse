# The Playbook — a map

The guides live in `src/playbook/content.ts` as data (`GUIDES`) and render on
the Playbook screen. Each guide has a level, a reading time, sections (body or
numbered steps, with an optional tip and warning) and a checklist whose ticks
are saved on the member's device.

| Order | Guide | Level | For |
|---|---|---|---|
| 1 | Your first auction car, start to finish | Start here | The whole path: pick, verify (VIN, history report), inspect, set the number, register, bid, win, pay, title, transport, insure, first week |
| 2 | Going to an auction in person | Start here | Finding public auctions, preview day, what to bring, the ten-minute walk-around, the lane, when to stop |
| 3 | Do I need a dealer licence? | Next | Public vs dealer-only, the per-year sale limit (varies by state), title jumping, what a licence unlocks, the steps, the buying-service shortcut |
| 4 | Flipping: buy, fix, sell | Next | The maths, what flips, the paid inspection, fixes that pay and don't, hiring cheap labour, selling safely, the rules |
| 5 | Minor fixes you can do with basic tools | Next | Easy jobs, careful jobs, hire-it jobs, leave-it-alone jobs, with the safety warnings |
| 6 | Starting a rental car company | Later | Peer-to-peer vs own fleet, insurance first, the first car, the numbers to track, the first ninety days, records |
| 7 | Reading a listing like a pro | Start here | Title statuses, damage words, photos that hide things, money words, run-away phrases |

## Editing rules

- Short sentences. Explain a term the first time.
- Numbers only where they are stable and certain; otherwise "varies" and
  where to check. Never a single national figure for a state law.
- No promise words (the test `test/playbook.test.ts` fails the build on
  guaranteed, risk-free, proven profit, get rich).
- Legal and safety weight goes in a `warning`: title jumping, airbags,
  jack stands, insurance before moving a car, wiring money to strangers.
- Every guide keeps a checklist of 5–12 items.
