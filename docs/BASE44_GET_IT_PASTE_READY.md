# Get-it — Complete Base44 Build Prompt (paste-ready)

Paste everything below this line into Base44 as one message. If the Get-it
project already exists, paste it anyway: the first paragraph tells Base44 to
refine what is there rather than start over.

---

You are building **Get-it**, a premium fitness app. If this project already
contains a Get-it app, refine it to match this specification exactly: keep
what already complies, change what does not, and remove anything not
described here. Get-it is only a fitness app. It has no dating, matching,
swiping, or messaging features of any kind; if any exist in this project,
remove them. The quality bar is a paid App Store product that people compare
favourably to Fitonomy, Fitbod, Nike Training Club, and MyFitnessPal.

This specification has two parts. Part 1 is what the app does. Part 2 is
how it looks, feels, and charges. Build both.

# PART 1 — WHAT GET-IT DOES

### Brand and visual identity

Use the design system in Part 2 below for every colour, font, control, and
motion decision. Part 2 wins wherever the two parts disagree.

### Intake: the questionnaire that drives everything

Onboarding is a five-screen intake. Every plan and every number in the app
is computed from it. Ask for an account only after the intake is complete
and the first plan is shown.

1. **About you:** sex (male, female, prefer not to say), age, height, current
   weight, unit preference (kg/cm or lb/in).
2. **Goal:** lose fat, build muscle, recomposition, maintain, improve
   endurance, get stronger. Optional target weight and target date.
3. **Training:** experience (new, under 1 year, 1–3 years, 3+ years), days
   per week available (2–6), session length (30, 45, 60, 75, 90 min),
   equipment (full gym, dumbbells only, bodyweight only, home gym with
   barbell, bands), injuries or areas to avoid (free text plus checkboxes
   for lower back, knees, shoulders, wrists).
4. **Focus:** muscle groups the user wants to prioritise, chosen from a
   tappable Coach figure: chest, back, shoulders, biceps, triceps, forearms,
   core, glutes, quads, hamstrings, calves. Up to three priorities.
5. **Lifestyle and nutrition:** activity level outside training (sedentary,
   light, moderate, very active), dietary pattern (no restriction,
   vegetarian, vegan, pescatarian, halal, kosher, gluten-free, dairy-free),
   foods disliked, meals per day (2–6), whether they cook or mostly buy.

Store every answer on the UserProfile so plans can be regenerated whenever
an answer changes. A "Retake intake" button in Profile regenerates
everything and keeps history.

### Workout plans: curated per muscle group, tailored to the intake

Build a plan engine, not a list of static templates. Templates are the raw
material; the engine assembles them.

- **Muscle-group library.** For each of the eleven muscle groups, seed at
  least 12 exercises across all equipment types and all three difficulty
  levels, each with primary and secondary muscles, movement pattern, video,
  instruction steps, common mistakes, and 2 alternatives. Minimum 150
  exercises total, with the Coach-figure thumbnail for each.
- **Split selection by days per week:**
  - 2 days: full body A/B
  - 3 days: full body, or push/pull/legs for 1+ year experience
  - 4 days: upper/lower
  - 5 days: push/pull/legs/upper/lower
  - 6 days: push/pull/legs twice
- **Volume by goal and experience.** Working sets per muscle group per
  week: new 8–10, under 1 year 10–14, 1–3 years 14–18, 3+ years 16–22.
  Priority muscle groups get the top of their range plus one extra exercise;
  non-priority groups get the bottom of the range. Never exceed the session
  length; estimate 3 minutes per working set including rest and trim the
  lowest-priority accessory first.
- **Rep ranges by goal:** strength 3–6 reps at RPE 8, muscle 8–12 at RPE
  8–9, endurance 15–20 at RPE 7, recomposition alternates 6–8 and 10–15
  across the week. Fat loss uses the muscle scheme with shorter rests and
  an optional finisher.
- **Injury filtering.** Exclude exercises flagged for the user's injury
  areas and substitute the exercise's safe alternative automatically, with
  a small note explaining the swap.
- **Progression.** Double progression by default: hit the top of the rep
  range on every set, then add the smallest increment next session. New
  lifters use linear progression for the first 8 weeks. Every four weeks
  the app suggests a deload week at 60% volume.
- **Plan output.** A named program (for example "4-Day Upper/Lower · Chest
  and Glute Priority") with a week view, each day listing exercises with
  sets, reps, rest, target RPE, and the Coach figure lit for that day's
  muscles. Users can swap any exercise for one of its alternatives, reorder,
  or regenerate the whole plan.
- **Per-muscle-group plans on demand.** In the Train tab, a "Target a muscle"
  screen lets the user tap any muscle on the Coach figure and get a
  standalone 20-, 30-, or 45-minute session for that group, built with the
  same rules and their equipment. This is what people use on an off day or
  when they want an extra arm session.

### Workout logger

Build a fast sets-and-reps logger: exercise cards with a set table (Set,
Previous, Weight, Reps, RPE, done), values pre-filled from the last session,
a custom numeric keypad with +2.5/+5 kg increments and a plate calculator,
set types (warmup, working, drop, failure, AMRAP), supersets, drag to
reorder, swap for an alternative, autosave after every change, and
instant personal-record detection with a one-line toast, never a modal. Every
exercise plays its video demonstration inline. Sets pre-fill from the last
session. PRs get an Amber badge.

### Nutrition: calorie tracker and diet plan

**Daily targets** are computed from the intake and shown on the Fuel tab as
three rings: calories, protein, and a combined carbs/fat ring.

- **BMR** with Mifflin-St Jeor:
  - Men: 10 × weight(kg) + 6.25 × height(cm) − 5 × age + 5
  - Women: 10 × weight(kg) + 6.25 × height(cm) − 5 × age − 161
  - "Prefer not to say": average of the two.
- **TDEE** = BMR × activity multiplier: sedentary 1.2, light 1.375,
  moderate 1.55, very active 1.725. Add 0.05 per training day per week
  above three.
- **Goal adjustment:** lose fat −20% (never below 1,200 kcal for women or
  1,500 for men), build muscle +10%, recomposition +0%, maintain +0%,
  endurance +5%, strength +5%. If a target weight and date are set, compute
  the required weekly change and cap it at 1% of body weight per week; if
  the user's date needs more than that, tell them so and propose a
  realistic date.
- **Protein:** 1.6 g per kg of body weight for maintain and endurance,
  2.0 g/kg for build muscle and strength, 2.2 g/kg for lose fat and
  recomposition (using target weight if it is lower than current weight).
  Round to the nearest 5 g and show it as "how much protein you should eat
  a day", in grams and in plain examples (for example "about two chicken
  breasts and a scoop of whey").
- **Fat:** 25% of calories. **Carbs:** the remainder. Show a short
  explanation of why these numbers are what they are; the user should
  understand their own targets.
- **Recalculate** automatically whenever weight, goal, or activity changes,
  and re-confirm targets every four weeks.

**Calorie tracker:**

- Log food by search (seed a food database of at least 2,000 common foods
  with per-100 g and per-serving macros), by barcode scan, by photo with AI
  estimation (mark estimates clearly and let the user correct them), by
  recent and favourite foods, and by saved meals and recipes.
- Log by meal slot matching the user's meals-per-day answer. Each meal
  shows its calories and protein. The day header shows remaining calories
  and remaining protein in big numbers, turning Mint when the day lands
  within 5% of target and Signal when over by more than 10%.
- Water tracking with a daily goal of 35 ml per kg of body weight.
- Weekly view: a seven-bar chart of calories against target, average
  protein, and a one-line coaching note ("You hit protein 5 of 7 days.
  Weekends are where it slips.").

**Diet plan generator:**

- From the targets, dietary pattern, dislikes, meals per day, and whether
  the user cooks, generate a seven-day meal plan that lands within 3% of
  calories and 5% of protein each day. Each meal has a name, ingredients
  with quantities, macros, prep time, and a two-line method. Meals repeat
  sensibly (cook once, eat twice) when the user says they mostly buy or
  have little time.
- Provide a swap button on every meal that offers three alternatives with
  matching macros. Provide a "Regenerate week" button.
- Generate a grocery list grouped by aisle from the plan, with quantities
  summed across the week and a checkbox per item.
- Any meal from the plan can be logged to the tracker with one tap, which
  is how most users will hit their numbers.

### Coach shorts

The Train tab has a **Coach** feed of short vertical videos: 15 to 40
second clips of the Coach figure demonstrating an exercise with the working
muscles lit, captions for the cue of the day, and "do this / not this" form
comparisons. Users can save a short to a collection and jump from a short
to the exercise or to a plan that uses it. Build an admin screen to upload
shorts, tag them by muscle group and exercise, and order the feed.

### Progress

- Body weight trend with a seven-day moving average, body measurements,
  private progress photos side by side.
- Strength: estimated 1RM per lift over time, PR list.
- Muscle balance: the Coach figure lit by weekly volume per muscle group,
  with under-trained groups dimmed and a note suggesting what to add.
- Nutrition adherence: days within target this month.
- Streaks and a simple level system: XP per workout and per day of logging
  food, with levels named after training milestones, never cartoon badges.

### Free versus premium

Use the three tiers defined in Part 2.

### Non-negotiable quality requirements

- Every interaction responds in under 100 ms; logging never waits on the
  network. Offline logging syncs without duplicates.
- All computed numbers (targets, plans) are shown with a one-line "why".
- No placeholder text, default component styling, or missing empty states.
- Units respected everywhere including history logged in another unit.
- Test every flow at 375 px width before calling it done.

Build the full app. Start with the intake, the plan engine, and the
nutrition target calculator, since every other screen depends on them. Seed
realistic demo data so every screen can be reviewed with content in it.

# PART 2 — DESIGN SYSTEM, CUSTOM CONTROLS, RESTORE, AND TIERS

Apply the following design system to every screen of Get-it. Where Part 1
or the existing screens disagree with this, change them to match this part.

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
