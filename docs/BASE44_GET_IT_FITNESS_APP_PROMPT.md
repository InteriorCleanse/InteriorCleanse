# Base44 Master Prompt — Get-it (Fitness App)

Get-it is the **fitness app**: intake-driven workout plans for every muscle
group, a calorie tracker, and a personalised diet plan. It is a separate
Base44 project from Hit-it, the fitness dating app. See
`BASE44_SPLIT_APPS_PROMPT.md` for how to pull the two apart if Base44 has
merged them, and `BASE44_WORKOUT_APP_PROMPT.md` for the deeper sets-and-reps
logger and video-player spec, which this app also uses.

Paste everything between the two rules into a **new, empty** Base44 project.

---

You are building **Get-it**, a premium fitness app. Get-it is only a fitness
app. It has no dating, matching, swiping, or messaging features of any kind.
If you find any such feature in this project, remove it. The quality bar is a
paid App Store product that people compare favourably to Fitonomy, Fitbod,
and MyFitnessPal. Every screen must feel finished, fast, and considered.

### Brand and visual identity: "Ember on Graphite"

Get-it looks like a performance product, not a lifestyle magazine. Dark,
sharp, energetic, with one hot accent.

- **Palette (exact values, nothing else):**
  - Graphite `#111214` — app background
  - Charcoal `#1B1D21` — cards and sheets
  - Slate `#2A2E35` — inputs, dividers, inactive states
  - Bone `#F4F1EC` — primary text
  - Steel `#8A9099` — secondary text, labels
  - Ember `#FF6A2B` — the primary accent: buttons, active tab, progress rings
  - Amber `#F5A623` — the "working muscle" glow colour used in every muscle
    diagram, chart highlight, and PR badge
  - Mint `#3DDC97` — success, completed sets, on-target nutrition
  - Signal `#FF3B5C` — over target, missed day, destructive actions
- **Typography:** Space Grotesk for headings and large numbers, Inter for
  body and data. Big numbers everywhere: today's calories, protein left,
  weight on the bar. Numbers use tabular figures.
- **Signature element:** the **Get-it Coach figure**, a faceless matte
  charcoal 3D figure whose working muscles glow Amber. It appears in every
  exercise thumbnail, every muscle-group card, and the muscle-balance
  diagram. Never use a stock anatomy chart or a cartoon.
- **Motion:** 200 to 350 ms ease-out. Progress rings fill on load. Completing
  a set pulses the row Mint once. No confetti.
- **Layout:** mobile-first, bottom tab bar with five tabs: Today, Train,
  Fuel, Progress, Profile. Primary actions sit in the bottom third of the
  screen. Everything must also look correct on tablet and desktop.
- **Accessibility:** WCAG AA contrast on Graphite, 44 px tap targets,
  labelled icon buttons, screen-reader announcements for timers and PRs.

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

Use the sets-and-reps logger, rest timer, PR detection, and video-player
specification from the companion workout-app document, unchanged. Every
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

**Free:** intake, one generated program, workout logging, 25 exercises with
video, calorie tracking by search, daily targets, basic weight chart.

**Premium (monthly and annual, 7-day trial, Stripe):** unlimited program
regeneration and per-muscle sessions, the full exercise library, the
seven-day diet plan generator with swaps and grocery lists, barcode and
photo logging, the Coach shorts feed, muscle balance and strength analytics,
progress photos, offline mode, data export, and Apple Health / Google Fit
sync. Lock icons in Amber; tapping one opens an upgrade sheet naming the
feature, never a full-screen interstitial on open.

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

---

## Follow-up prompts

Run in order after the master build.

1. **Plan engine check.** "Create three test users: a new lifter with 3 days
   and dumbbells only; a 3+ year lifter with 5 days, full gym, chest and
   glute priority, bad knees; a vegan woman with 4 days, home barbell, fat
   loss goal and a target date 8 weeks out. Show me each generated program
   and each set of nutrition targets, and explain every number."
2. **Per-muscle sessions.** "Open Target a muscle, tap biceps, choose 30
   minutes with dumbbells only, and confirm the session is 4 exercises, all
   biceps-primary, with videos."
3. **Diet plan check.** "Generate the seven-day plan for the vegan test user
   and verify every day is within 3% of calories and 5% of protein. Show
   the grocery list."
4. **Tracker polish.** "Log a full day of food for the demo user using
   search, a recent food, and a saved meal. The remaining-calorie number
   must update instantly. Confirm the rings turn Mint on target."
5. **Coach feed.** "Build the Coach shorts feed with vertical full-bleed
   video, swipe navigation, save button, and a jump-to-exercise link. Seed
   it with the six pilot shorts."
6. **Final quality pass.** "Audit every screen at 375 px and at desktop.
   Fix any colour outside the palette, any missing empty state, and any tap
   target under 44 px. List every fix."
