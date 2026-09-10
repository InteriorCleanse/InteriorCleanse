# Base44 Prompt — Get-it UI System, Custom Controls, and Tiers

Run this in the Get-it project after the master prompt in
`BASE44_GET_IT_FITNESS_APP_PROMPT.md`. It replaces that document's palette
section with the final "Ember and Earth" system built around the approved
logo, adds the holistic Restore side of the app, defines the custom
controls, and sets the subscription tiers. The live reference for every
control is the Get-it Design System artifact; match it.

Paste everything between the two rules.

---

Apply the following design system to every screen of Get-it. Where the
existing screens disagree with this, change the screens.

### Brand idea

Get-it trains like a sprinter and recovers like a forest. It takes its
intensity from Nike Training Club and Under Armour's MapMyRun and its calm
from the outdoors. The app has two moods that colour everything:
**Effort**, in Ember, for training; and **Restore**, in Moss and Fern, for
mobility, breathwork, outdoor sessions, and sleep. The user always knows
which mood they are in.

### Logo

Use the supplied Get-it wordmark: bone-white "Get" and "it" in a bold
geometric grotesque, an ember-orange tilted bar in place of the hyphen, and
an amber glowing dot on the i. The app icon is the letter G with the same
tick and dot inside its counter, on Graphite. Never redraw, recolour, or
stretch these. Minimum clear space equals the height of the dot.

### Palette (exact values, nothing else)

| Token | Hex | Use |
| --- | --- | --- |
| Graphite | `#111214` | App ground (dark mode) |
| Basalt | `#191C1A` | Cards and sheets |
| Slate | `#22272A` | Inputs, dividers, inactive |
| Moss | `#24382E` | Restore surfaces, revealed under completed sets |
| Fern | `#5BBF7A` | Done, on target, growth, Restore actions |
| Sage | `#9DB39B` | Secondary text and labels |
| Sand | `#E6D9C3` | Light mode ground ("outdoor mode") |
| Bone | `#F4F1EC` | Primary text on dark; light-mode cards |
| Ember | `#FF5A1F` | Effort: primary buttons, active tab, session progress |
| Amber | `#F5A623` | Light: muscle glow, records, selected chips |
| Signal | `#FF3B5C` | Over target, missed day, destructive |

Light mode uses Sand ground, Bone cards, Graphite text, and the same
accents. Dark-mode cards carry a 3% grain overlay so surfaces feel like
stone, not plastic. No gradients anywhere except the soft amber glow behind
the dot and behind lit muscles.

### Typography

- **Bricolage Grotesque** 800 for headlines and every big number, with
  tabular figures. Headline sizes 34, 30, 26. Big numbers 44 and 34.
- **Manrope** 400, 600, 700 for body, labels, and buttons. Body 15 px.
- Uppercase labels 11 px, 0.12 em tracking, Sage.
- Load both from Google Fonts. Never fall back to a default UI font.

### Custom controls

Build these as reusable components and use them everywhere. Each has a
physical idea; nothing merely changes colour.

1. **Effort / Restore switch.** A pill-shaped segmented control at the top
   of Today and Train. The thumb springs across in 320 ms with slight
   overshoot; Ember on Effort, Fern on Restore. Switching swaps the primary
   button colour and copy across the screen.
2. **Primary button.** Full-width pill, Ember (or Fern in Restore), label on
   the left and a circular arrow on the right. On press: scale to 96% in
   160 ms, an amber spark expands from the touch point and fades in 550 ms,
   and a 10 ms haptic tick. Always in the bottom third of the screen.
3. **Hold-to-log ring.** The set-complete control. A 64 px ring next to the
   set; holding for 700 ms fills an Amber arc, releasing early cancels, and
   completing turns the row Fern, fires a 12-40-12 ms haptic pattern, and
   starts the rest timer. A personal record turns the ring Amber and shows
   a one-line toast naming the record. Never a modal.
4. **Swipe-to-complete rows.** Any set row can also be dragged right; past
   40% of its width it locks as complete and reveals Moss beneath it.
   Dragging a completed row left reopens it. Rows snap back in 350 ms.
5. **Breathing rest timer.** A Moss bar with the countdown in Bricolage 34
   px. While running, the number swells and settles on a four-second
   cycle as a breathing cue. Buttons for −15, Skip, +15. Runs in the
   background and vibrates at zero.
6. **Muscle chips.** Pills for targeting a muscle group. Selected chips
   fill Amber with a soft amber halo, matching the glow on the Coach
   figure's working muscles.
7. **Tab bar.** Five tabs: Today, Train, Fuel, Restore, You. An Ember
   indicator line above the active tab springs into place with overshoot.
   Restore has its own tab; the holistic side is never hidden in settings.
8. **Progress rings.** Calories, protein, and session progress are rings
   that fill on load in 600 ms. Ember for effort, Fern for nutrition on
   target, Signal when over by more than 10%.

### Restore: the holistic side

Add a Restore tab with programs that use the same plan engine as training:

- **Mobility** sessions by area (hips, thoracic, shoulders, ankles) with
  the Coach figure lit in Fern instead of Amber.
- **Breathwork**: box breathing, 4-7-8, and a two-minute downshift after
  every session, with the breathing number animation.
- **Outdoor sessions**: walks, hikes, and easy runs by time and terrain,
  logged with distance and elevation from the phone. Outdoor mode switches
  the app to the Sand light theme automatically.
- **Sleep routine**: a wind-down checklist and a morning readiness check
  (sleep hours, soreness, mood, 1 to 5) that adjusts the day's plan:
  readiness under 2.5 offers a Restore session in place of training.
- **Weekly balance**: a single screen showing Effort minutes against
  Restore minutes as two bars, with a note when the ratio slips past 5:1.

### Tiers

Three tiers plus an optional founding offer. Stripe for web billing with
the subscription entity ready for App Store and Play billing.

| | Free | Plus | Pro |
| --- | --- | --- | --- |
| Price | $0 | $9.99/mo or $59.99/yr | $19.99/mo or $149.99/yr |
| Trial | – | 7 days | 7 days |
| Intake and one generated program | ✓ | ✓ | ✓ |
| Logger, rest timer, records | ✓ | ✓ | ✓ |
| Exercises with Coach video | 25 | All | All |
| Calorie and protein targets, food search | ✓ | ✓ | ✓ |
| Unlimited regeneration, per-muscle sessions | | ✓ | ✓ |
| Seven-day diet plans, swaps, grocery lists | | ✓ | ✓ |
| Barcode and photo food logging | | ✓ | ✓ |
| Coach shorts feed, analytics, muscle balance | | ✓ | ✓ |
| Offline mode, Apple Health / Google Fit | | ✓ | ✓ |
| Restore programs (mobility, breathwork, outdoor, sleep) | Breathwork only | Mobility and breathwork | All |
| Weekly AI coach check-in that adjusts the plan | | | ✓ |
| Form review from an uploaded set | | | ✓ |
| Partner seat | | | ✓ |
| Early access to new shorts and programs | | | ✓ |

Founding tier: one payment of $199 for lifetime Pro, limited to the first
500 members, shown on the paywall only while seats remain.

Paywall rules: locked features show a small Amber lock. Tapping one opens
an upgrade sheet that names the feature the user tapped, shows Plus and Pro
side by side with the annual price default and a monthly toggle, and starts
the trial in one tap. Never a full-screen interstitial on app open. Show the
trial end date in You, and send a reminder two days before it ends.

### Motion rules

- 200 to 350 ms ease-out everywhere. Springs only on the segmented thumb,
  the tab indicator, and the record badge.
- Every button scales to 96% while pressed.
- Corners: pills for actions, 22 px for cards, 14 px for rows.
- Respect reduced-motion: disable springs and the breathing animation.
- Never: confetti, cartoon badges, red-and-green traffic lights, a spinner
  longer than 400 ms, default component styling.

### Acceptance checks

1. Open Today on a 375 px viewport. Toggle Effort / Restore and confirm the
   primary button changes colour and copy without a reload.
2. Hold the ring on a set for less than 700 ms and confirm nothing logs.
   Hold for 700 ms and confirm the row turns Fern and the rest timer starts.
3. Swipe a set row right past 40% and confirm it completes; swipe left to
   reopen.
4. Start an outdoor walk and confirm the app switches to the Sand theme.
5. As a free user, tap a locked diet plan, start a Plus trial, and confirm
   the plan generates without reloading.
6. Audit every screen for colours outside the palette and fonts other than
   Bricolage Grotesque and Manrope. List every fix.

---
