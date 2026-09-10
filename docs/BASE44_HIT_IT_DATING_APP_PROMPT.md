# Base44 Master Prompt — Hit-it (Fitness Dating App)

Hit-it is the **fitness dating and community app**: an active-lifestyle
brand where people meet through training. It is a separate Base44 project
from Get-it, the fitness app. See `BASE44_SPLIT_APPS_PROMPT.md` if Base44 has
merged the two.

Naming note: "HIT IT!" is a registered US trademark in the fitness
instruction category. Read `APP_NAME_SEARCH.md` before launching under this
name. The prompt below uses "Hit-it" as a working title; swap in the final
name everywhere before building.

Paste everything between the two rules into a **new, empty** Base44 project.

---

You are building **Hit-it**, a premium fitness dating and community app.
Hit-it is only a dating and community product. It has no workout logger,
calorie tracker, or diet planner. If you find any such feature in this
project, remove it. The bar is Hinge, Bumble, and Tinder. Ours must feel
more alive than theirs, more honest, and more beautiful. People should open
it because it feels like a culture, not because they are lonely.

### Positioning

Hit-it is for people who train. The unit of connection is not a swipe, it is
a shared session: a run, a lift, a class, a hike. Profiles lead with how
someone moves, not just how they look. The community layer (crews, events,
challenges) is as important as the matching layer, because a good gym has
always been a good place to meet people.

### Brand and visual identity: "Pulse"

The competitors own their colours: Tinder's red-orange gradient, Bumble's
yellow, Hinge's monochrome with purple. Hit-it owns **coral on midnight with
a lime charge**. Never use any of those competitor palettes.

- **Palette (exact values, nothing else):**
  - Midnight `#0E0B14` — app background
  - Night `#17131F` — cards and sheets
  - Dusk `#2A2435` — inputs, dividers, inactive states
  - Cloud `#F7F5FA` — primary text
  - Haze `#9A93A8` — secondary text, labels
  - Pulse `#FF4D6D` — primary accent: like, match, primary buttons, the
    heartbeat mark
  - Charge `#C8F135` — secondary accent: active-now indicator, session
    invites, streaks, community energy
  - Lilac `#B8A7FF` — tertiary: verified badges, premium
  - Ember `#FF8A5B` — used only inside the Pulse-to-Ember gradient on the
    match moment and the app icon, nowhere else
- **Typography:** Clash Display (or Space Grotesk if unavailable) for
  headings, names, and big numbers; Inter for body. Names are set large and
  tight, like a poster.
- **Signature elements:** a **heartbeat line** in Pulse that runs under the
  wordmark, animates on match, and doubles as the loading indicator; and a
  **Charge dot** next to anyone who trained today. Photos are shown
  full-bleed with a Midnight gradient at the bottom, never in small
  rounded tiles.
- **Motion:** confident and physical. Cards have weight and momentum when
  dragged. The match moment is a 1.2 second sequence: both photos slide
  together, the heartbeat line pulses once in Pulse-to-Ember, then the
  first-message prompt appears. Everything else is 200 to 350 ms ease-out.
  No confetti, no cartoon hearts.
- **Layout:** mobile-first, bottom tab bar with five tabs: Discover, Crews,
  Sessions, Chats, You. Everything must also look correct on tablet and
  desktop.
- **Accessibility:** WCAG AA on Midnight, 44 px targets, every icon
  labelled, reduced-motion respected.

### Profiles: built around how you move

Onboarding takes under three minutes and ends on the Discover feed. Ask for
an account after the first three cards, not before.

- **Basics:** name, age, photos (4 to 6, first one must show a face,
  at least one must be an action or training shot, enforced with a gentle
  prompt), location, looking for (dating, training partners, both), gender
  and who they want to see, distance and age range.
- **Training identity:** primary disciplines (choose up to three from
  lifting, running, CrossFit, yoga, climbing, cycling, swimming, martial
  arts, hiking, team sports, dance, calisthenics, pilates, and more),
  experience level per discipline, training days per week, usual training
  time (early, morning, lunch, evening, late), home gym or studio (name it,
  with a privacy toggle to show only the neighbourhood).
- **Prompts:** three answered prompts from a set written for this
  audience: "My rest-day looks like…", "Best thing I've done on two legs",
  "I'll never skip…", "First date, my pick", "A PR I'm proud of",
  "Training partner I'm looking for", "The song that gets me through the
  last set". Answers are shown as large typographic cards between photos.
- **Verification:** photo verification with a pose match, shown as a Lilac
  badge. Optional fitness-platform link (Strava, Apple Health, Garmin) that
  only unlocks the Charge dot and a "trained this week" count, never raw
  data on the profile.
- **Vibe tags:** short honest tags such as "6 am club", "goes to the
  gym to talk", "quiet lifter", "race season", "beginner friendly".

### Discover: better than a swipe deck

- **Cards** are full-bleed, one at a time, scrollable vertically inside the
  card through photos and prompts, like Hinge, with a like on any specific
  photo or prompt, and a required or optional comment on the like. Drag
  right to like, left to pass, with real physics.
- **Session invite instead of a super-like.** Every card has a Charge
  button: "Invite to train". It proposes a session type from their
  disciplines and a time window. If they accept, it becomes a match with a
  session already on the calendar. This is the product's signature move and
  the thing Tinder and Bumble do not have.
- **Compatibility, shown honestly.** A small line under the name: "Both
  train early · 2 km apart · You both climb". Never a fake percentage.
- **Filters:** distance, age, disciplines, training time, verified only,
  active in the last 7 days.
- **Daily limit** of likes on free, with a clean upgrade sheet; no
  interstitials on open.
- **Quality controls:** a report and block flow two taps from any profile,
  automatic nudity and harassment moderation on photos and messages,
  invisible mode, and the option to hide from people you know via contact
  hash.

### Matching and chat

- Match screen as described in the brand section. Either person can start
  the conversation, with a first-message prompt suggested from the profile
  ("Ask about their PR").
- Chats support text, photos, voice notes, and **session cards**: a
  structured message proposing a place, time, and activity, with accept and
  suggest-another-time buttons, that lands on both calendars when accepted.
- Safety tools in every chat: share session details with a friend, report,
  unmatch. Location share is optional and time-boxed for a session.
- Video call for a five-minute pre-session check-in.
- Unanswered matches expire after 14 days on free, never on premium.

### Crews and Sessions: the community layer

This is what makes Hit-it a culture instead of a catalogue.

- **Crews** are local groups by discipline and neighbourhood ("Hackney
  Run Club", "Tuesday Hyrox", "Beginners Lifting, Brooklyn"). Anyone can
  create one. A crew has a feed, members, a weekly schedule, and a chat.
  Joining a crew is free and needs no match. Crews are where people meet
  before they match.
- **Sessions** are events: a crew session, a public session anyone can post
  ("5k easy pace, Saturday 8 am, all welcome"), or a private session
  between two matches. Sessions have an RSVP, a map, a capacity, and a
  post-session check-in that asks who you trained with and whether you'd
  train with them again. Mutual "yes" between two attendees who are both
  looking to date creates a match.
- **Challenges** run monthly across the whole app ("March: 20 sessions
  logged") and inside crews, with a Charge-coloured progress bar and a
  leaderboard by consistency, not by weight lifted.
- **Feed** on the Crews tab: session recaps with photos, crew
  announcements, and challenge milestones. No infinite doom-scroll: the
  feed shows a day at a time and ends.

### Premium

**Free:** full profile, limited daily likes, unlimited crews and public
sessions, chat with matches, one session invite per day.

**Hit-it Plus (monthly, quarterly, annual, 7-day trial, Stripe):**
unlimited likes, see who liked you, unlimited session invites, advanced
filters, matches never expire, incognito browsing, one weekly "Spotlight"
that boosts your card in your crews, travel mode to browse another city
before a trip, and read receipts. Locked features show a small Lilac lock
and open an upgrade sheet naming the feature.

### Screens to build

1. Onboarding (profile, training identity, prompts, verification)
2. Discover feed with card interactions and session invites
3. Match moment and first message
4. Chats with session cards and safety tools
5. Crews: browse, crew page, create crew, crew chat
6. Sessions: calendar, session page, create session, RSVP, check-in
7. Challenges
8. You: profile editor, preferences, verification, subscription, safety
   centre, data export, delete account
9. Admin (owner only): moderation queue, reports, crews, challenges,
   subscription overview

### Non-negotiable quality requirements

- Card gestures run at 60 fps on a mid-range phone. Photos are preloaded
  two cards ahead.
- Moderation runs before a photo or message is delivered, never after.
- Every list has a designed empty state ("No crews near you yet. Start
  the first one.").
- No placeholder copy, no default component styling, no colour outside the
  palette.
- Test every flow at 375 px width before calling it done.

Build the full app. Start with profiles, Discover, and the match and chat
flow, then Crews and Sessions. Seed realistic demo profiles, crews, and
sessions across two cities so every screen can be reviewed with content.

---

## Follow-up prompts

1. **Card feel.** "Open Discover on a phone viewport. The card must follow
   the finger with momentum and rotate slightly on drag. Liking a specific
   prompt must show that prompt quoted on the match screen. Confirm both."
2. **Session invite.** "As demo user A, send a session invite to demo user
   B proposing Saturday 8 am run. As B, accept. Confirm a match is created,
   the session is on both calendars, and the chat opens with the session
   card pinned."
3. **Crews.** "Create a crew, add a weekly session, join it as a second
   demo user, complete the session, run the post-session check-in with
   mutual yes, and confirm a match is created."
4. **Moderation.** "Upload a test image flagged by the moderation model and
   confirm it never appears on the profile and the user sees a clear,
   non-judgemental message."
5. **Paywall.** "As a free user, hit the daily like limit, open the upgrade
   sheet, start the trial, and confirm likes are unlimited without a
   reload."
6. **Final quality pass.** "Audit every screen at 375 px and desktop. Fix
   any colour outside the palette, any missing empty state, any tap target
   under 44 px. List every fix."
