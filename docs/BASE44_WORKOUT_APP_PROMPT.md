# Base44 Prompt — Premium Workout App

Copy-paste prompts for Base44 to refine the InteriorCleanse workout app into a
premium fitness tracker people will pay for. The app belongs to the **Body**
track of the brand (*For Mind, Home, Body & Spirit*), so it inherits the dark
editorial identity of the storefront.

Base44 does best with one large master prompt followed by short, focused
follow-ups. Use the master prompt first, wait for the build, then run the
follow-up prompts in order. Each follow-up ends with an acceptance check so you
can verify the result before moving on.

---

## 1. Master prompt

Paste everything between the two rules into Base44.

---

You are building **InteriorCleanse Body**, a premium strength and fitness
tracking app. The quality bar is a paid App Store product, not a demo. Every
screen must feel finished, fast, and considered. When in doubt, do less and do
it flawlessly.

### Brand and visual identity

- **Aesthetic:** dark editorial. Think a luxury magazine, not a neon gym app.
  Generous whitespace, restrained motion, no gradients, no emoji, no stock
  clip-art icons.
- **Palette (use these exact values, nothing else):**
  - Ink `#1C1A17` — primary background
  - Black `#0A0A0A` — deepest surfaces, video player chrome
  - Bone `#F7F4EF` — primary text and light surfaces
  - Taupe `#8C8479` — secondary text, muted labels
  - Sage `#5B6357` — success, completed sets, rest timer
  - Brass `#A9895A` — the single accent: personal records, premium badges, primary buttons
  - Hairline `#E4DFD6` at 12% opacity — dividers and card borders
- **Typography:** Fraunces (serif) for display headings and large numbers;
  Inter (sans) for body, labels, and data. Numbers in tables use tabular
  figures so columns align.
- **Motion:** subtle, 200 to 400 ms, ease-out. A set completing should feel
  satisfying, a new personal record should feel earned. No bouncing, no
  confetti, no spinners longer than necessary.
- **Layout:** mobile-first, one-hand reachable. Primary actions sit in the
  bottom third of the screen. Everything must also look correct on tablet and
  desktop.
- **Accessibility:** all text passes WCAG AA contrast on Ink. Tap targets are
  at least 44 px. Every icon button has a label. Rest timers and PR alerts are
  announced to screen readers.

### Core data model

Build these entities with the fields listed. Do not invent extra fields.

- **Exercise:** name, slug, primary muscle group, secondary muscle groups
  (list), equipment (barbell, dumbbell, kettlebell, cable, machine, bodyweight,
  band), movement pattern (push, pull, hinge, squat, carry, core, isolation),
  difficulty (beginner, intermediate, advanced), instruction steps (ordered
  list), common mistakes (list), video (see video spec), thumbnail, is_premium
  (boolean), is_custom (boolean, user-created).
- **WorkoutTemplate:** name, description, goal (strength, hypertrophy,
  endurance, mobility), estimated duration, difficulty, ordered list of
  TemplateExercises, is_premium, created_by (system or user).
- **TemplateExercise:** exercise, order, target sets, target reps (single
  number or range like 8–12), target weight or percentage of 1RM, rest seconds,
  tempo (optional, e.g. 3-1-1-0), superset group (optional), notes.
- **WorkoutSession:** user, template (optional), started_at, finished_at,
  status (in_progress, completed, abandoned), total volume, total sets, notes,
  perceived exertion (1–10), body weight at the time (optional).
- **SetLog:** session, exercise, set number, set type (warmup, working, drop,
  failure, AMRAP), reps completed, weight, unit (kg or lb), RPE (optional,
  6–10 in 0.5 steps), completed (boolean), rest taken in seconds, is_pr
  (boolean), logged_at.
- **PersonalRecord:** user, exercise, record type (heaviest weight, best 1RM
  estimate, most reps at weight, most volume in a session), value, set log
  reference, achieved_at.
- **BodyMetric:** user, date, weight, body fat % (optional), measurements
  (chest, waist, hips, arms, thighs — all optional), progress photo (optional,
  private).
- **Program:** name, description, weeks, days per week, ordered schedule of
  WorkoutTemplates by week and day, progression rule (linear, double
  progression, percentage-based), is_premium.
- **UserProfile:** display name, unit preference (kg or lb), default rest
  seconds, training goal, experience level, weekly training day target,
  subscription tier (free, premium), subscription status, trial end date.

### Sets and reps: the workout logger

This is the heart of the app. It must be the fastest, cleanest set logger the
user has ever used.

- **Starting a workout:** from a template, from a program's scheduled day, or
  empty. The session starts a visible elapsed timer in the header.
- **Exercise cards:** each exercise shows its name, a small video thumbnail
  that opens the demonstration, and a table of sets. Columns: Set, Previous
  (what the user did last time, greyed in Taupe), Weight, Reps, RPE (premium),
  and a completion checkmark.
- **Pre-fill:** every new set pre-fills weight and reps from the user's last
  session of that exercise. The user should be able to log a repeat set with
  one tap.
- **Input:** a custom numeric keypad, not the system keyboard. Include quick
  increment buttons (+2.5 / +5 for kg, +5 / +10 for lb) and a plate calculator
  that shows which plates to load per side for a barbell.
- **Set types:** long-press or swipe a set to change it to warmup, drop set,
  failure, or AMRAP. Warmup sets are excluded from volume and PR calculations.
- **Completing a set:** tapping the check marks it done, turns the row Sage,
  and automatically starts the rest timer.
- **Rest timer:** full-width bar at the bottom with the countdown, +15 s and
  -15 s buttons, skip, and a subtle haptic and sound at zero. Runs in the
  background and sends a notification if the app is closed.
- **Supersets:** grouped exercises alternate automatically and share one rest
  timer.
- **Add, reorder, replace:** add an exercise mid-workout, drag to reorder,
  replace an exercise with a suggested alternative that targets the same
  muscle (e.g. barbell bench press → dumbbell bench press when a bench is
  taken).
- **Personal records:** detect a PR the instant a set is completed. Show a
  Brass badge on the row and a brief, dignified toast. Never interrupt the
  user with a modal.
- **Finishing:** a summary screen showing duration, total volume, sets
  completed, PRs hit, and a comparison against the last time this workout was
  done. Ask for perceived exertion and optional notes. Offer one-tap save as a
  new template if the user changed the workout.
- **Resilience:** the session autosaves after every change. If the app is
  closed or crashes, reopening resumes the in-progress workout exactly where
  it was.

### High-quality video demonstrations

Every exercise has a video. This is a premium differentiator, so treat it
like one.

- **Format:** short loops, 6 to 12 seconds, 1080p minimum, filmed against a
  plain dark background that matches Ink so the video sits inside the UI
  seamlessly. Show two angles: front and side, with a toggle. No music, no
  talking head, no watermarks. Optional slow-motion of the hardest part of the
  movement.
- **Storage and delivery:** host videos on a CDN with adaptive streaming.
  Generate a poster frame for each video and show it instantly while the video
  loads. Preload the videos for the current workout's exercises when the
  workout starts so playback is instant mid-set.
- **Player:** custom player that matches the palette. Autoplays muted, loops,
  no controls bar. Tap to expand to a full-screen sheet with: angle toggle,
  0.5× speed, step-by-step instructions, common mistakes, and muscles worked
  shown on a simple monochrome body diagram in Bone and Brass.
- **Fallback:** if a video fails to load, show the poster frame and the
  written instructions. Never show a broken player.
- **Content pipeline:** build an admin screen where I can upload or link a
  video per exercise, set the poster frame, mark the angle, and preview it in
  the real player before publishing. Seed the library with at least 150
  exercises covering every major movement pattern and equipment type, with
  placeholder poster frames where videos are not yet uploaded.
- **Offline:** premium users can download a workout's videos for offline use.

### Free versus premium

The free tier must be genuinely useful so people trust the app. The premium
tier must be obviously worth it within the first week.

**Free:**
- Log unlimited workouts with sets, reps, and weight
- 25 starter exercises with video
- 3 built-in workout templates
- Basic history: a list of past workouts
- Personal records for heaviest weight
- Rest timer

**Premium (monthly and annual, with a 7-day free trial):**
- Full exercise library with every video, both angles, slow-motion
- Unlimited custom templates and programs
- Structured multi-week programs with automatic progression: the app raises
  the target weight or reps when the user hits the previous target
- Advanced analytics: volume per muscle group per week, estimated 1RM trends,
  strength standards compared to body weight, consistency streaks, a weekly
  muscle-balance heatmap that flags neglected muscle groups
- RPE logging and auto-regulation suggestions
- Body metrics with charts and private progress photos side by side
- Plate calculator and warmup set generator based on working weight
- Offline mode with video downloads
- Data export (CSV) and Apple Health / Google Fit sync
- Cloud backup and multi-device sync
- Priority support

**Paywall behaviour:**
- Locked features show a small Brass lock. Tapping opens a clean upgrade sheet
  that shows the exact feature the user wanted, the price, and a one-line
  benefit. Never a full-screen interstitial on app open.
- Start the 7-day trial with one tap. Show the trial end date clearly in
  settings. Send a reminder two days before the trial ends.
- Use Stripe for web billing. Make the subscription entity ready for App
  Store and Play Store billing later.

### Screens to build

1. **Onboarding (3 screens max):** goal, experience level, units, training
   days per week. Then land the user on a recommended template. No account
   required to start; ask for an account when they finish their first
   workout.
2. **Today:** the home screen. Shows the scheduled workout if on a program,
   otherwise a "start workout" card, the current streak, and this week's
   completed days as seven small dots.
3. **Workout logger:** described above.
4. **Exercise library:** searchable, filterable by muscle group, equipment,
   and movement pattern. Grid of video thumbnails. Each exercise opens a
   detail page with the full player, history for that exercise, and its PRs.
5. **Templates and programs:** browse built-in ones, create custom ones with
   a drag-and-drop editor.
6. **History:** calendar view with training days marked; tap a day to see the
   session. Includes a per-exercise history view with a chart of weight and
   estimated 1RM over time.
7. **Progress (premium):** the analytics dashboard described above.
8. **Body (premium):** body metrics and progress photos.
9. **Profile and settings:** units, rest timer defaults, subscription
   management, data export, delete account.
10. **Admin (owner only):** exercise and video management, template
    authoring, subscription overview.

### Non-negotiable quality requirements

- Every interaction responds in under 100 ms. Logging a set never waits on
  the network.
- Works fully offline for logging; syncs when back online without duplicates.
- No placeholder text, lorem ipsum, or default component styling anywhere.
- Empty states are designed: a new user with no history sees a helpful,
  on-brand screen, not a blank list.
- All numbers respect the user's unit preference everywhere, including
  history logged in a different unit.
- Dates and times use the user's locale.
- Error states are human: "Couldn't save this set. It's kept locally and will
  sync when you're back online."
- Test every flow on a 375 px wide viewport before considering it done.

Build the full app. Start with the data model, the workout logger, and the
video player, since everything else depends on them. Seed realistic demo data
so every screen can be reviewed with content in it.

---

## 2. Follow-up prompts

Run these one at a time after the master build, in order. Each is short on
purpose so Base44 focuses.

### 2.1 Logger polish

> Open the workout logger. Make these refinements: (1) the numeric keypad must
> slide up from the bottom and never cover the set being edited; (2) pressing
> the checkmark on the last set of an exercise should scroll the next exercise
> into view after the rest timer starts; (3) the Previous column must show
> "60 kg × 8" style text and become a tap target that copies those values into
> the current row; (4) a PR must be detected for heaviest weight, best
> estimated 1RM (use the Epley formula), and most reps at a given weight, each
> with its own Brass badge label. Acceptance check: log three sets of one
> exercise on a phone-sized viewport without the keypad ever hiding the active
> row, and confirm the PR badge appears on a set heavier than any previous set.

### 2.2 Video player

> Open the exercise detail page. The video must autoplay muted and loop with
> the poster frame visible until the first frame renders. Add the front/side
> angle toggle and the 0.5× speed toggle as two small pill buttons in Bone on
> Black. Make the full-screen sheet swipe-down to dismiss. Add the monochrome
> body diagram with primary muscles in Brass and secondary in Taupe.
> Acceptance check: throttle the network to slow 3G and confirm the poster
> shows instantly and the player never shows a broken state.

### 2.3 Programs and progression

> Build the program engine. When a user completes a session that belongs to a
> program, apply the program's progression rule to generate next week's
> targets: linear adds a fixed increment when all sets hit target; double
> progression raises reps to the top of the range first, then adds weight and
> resets reps to the bottom; percentage-based recalculates from the user's
> latest estimated 1RM. Show the user a short "next time: 62.5 kg × 5"
> line on the finish screen. Acceptance check: complete a linear-progression
> workout hitting all targets and confirm the next scheduled session shows the
> increased weight.

### 2.4 Analytics

> Build the premium Progress dashboard. Charts use only Bone lines on Ink with
> Brass for the highlighted point, no grid clutter, no legends when one series
> is shown. Include: weekly volume by muscle group (stacked bars, last 8
> weeks), estimated 1RM trend per lift (line), a 7×N muscle-balance heatmap
> in Sage shades, and a consistency streak card. Every chart has a designed
> empty state for users with under two weeks of data. Acceptance check: view
> the dashboard with the seeded demo data and with a brand-new account.

### 2.5 Paywall and billing

> Implement the premium gate. Add a `is_premium` check to every premium
> feature listed in the spec. Locked items show a small Brass lock icon.
> Tapping any locked item opens the upgrade sheet with the specific feature
> named at the top. Wire Stripe Checkout for monthly and annual plans with a
> 7-day trial, and a customer portal link in settings. Acceptance check: as a
> free user, tap a locked analytics card, start a trial, and confirm the card
> unlocks without reloading the app.

### 2.6 Offline and sync

> Make the logger fully offline. Every SetLog writes locally first, then
> syncs. Use an idempotency key per set so a retried sync never creates
> duplicates. Show a small Taupe "syncing" indicator in the header, never a
> blocking dialog. Acceptance check: go offline, log a full workout, come back
> online, and confirm exactly one copy of each set exists in the database.

### 2.7 Final quality pass

> Audit every screen at 375 px width and at desktop width. Fix any text that
> is not Bone or Taupe on Ink, any button that is not Brass or outlined Bone,
> any default component styling, any missing empty state, and any tap target
> under 44 px. List every fix you made.

---

## 3. Video production notes (outside Base44)

Base44 builds the player and pipeline; the footage itself comes from you.
Standard for the library so every clip matches:

| Item | Standard |
| --- | --- |
| Resolution and frame rate | 1080p at 60 fps minimum, 4K preferred for slow-motion |
| Background | Plain matte black or charcoal, no gym clutter |
| Lighting | Soft key from the front-side, subtle rim light so the body separates from the background |
| Wardrobe | Solid neutral tones (black, bone, taupe), no logos |
| Angles | Front and side for every exercise, locked-off camera, same framing across the library |
| Length | 6 to 12 seconds, 2 to 3 clean reps, cut to loop seamlessly |
| Audio | None |
| Export | H.264 MP4 and a poster frame JPEG at the top of the concentric phase |

Name files `exercise-slug_front.mp4`, `exercise-slug_side.mp4`, and
`exercise-slug_poster.jpg` so the admin uploader can match them automatically.
