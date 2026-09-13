# HIT-IT — Base44 Build Prompt (refined, paste-ready)

This replaces the earlier `BASE44_HIT_IT_DATING_APP_PROMPT.md`. It keeps
your product, your electric-lime palette, and your section content, and
fixes what made the original hard for Base44 to execute: fifty sections with
overlapping instructions, a compatibility score with no formula, privacy
rules stated as intentions, and tier benefits with no numbers.

Naming reminder: "HIT IT!" is a live US trademark in fitness instruction.
See `APP_NAME_SEARCH.md` before launch. The prompt below uses HIT-IT as the
working name; find-and-replace it if you rename.

How to use: paste Part A as one message. Wait for the build. Then paste the
phase prompts in Part B one at a time, checking each acceptance list before
moving on.

---

# PART A — MASTER BUILD PROMPT

Build **HIT-IT**, a production-quality, mobile-first web application: a
fitness-focused social and dating platform where people discover and connect
based on attraction, friendship, workout compatibility, gym, goals,
interests, schedule, and location.

It combines a premium dating app, a fitness social network, a workout-partner
finder, and a lifestyle community. Use familiar interaction patterns (swipe
cards, matching, messaging, boosts, subscriptions) but make every visual,
term, animation, and component original to HIT-IT. Do not copy the branding,
logos, illustrations, or proprietary UI of Tinder, Bumble, Hinge, Strava, or
anyone else. Do not produce a generic dating template.

The result must feel fast, premium, highly visual, and healthy: exciting to
open, easy to leave, built for meeting people in real life.

## 1. Brand

- **Name:** HIT-IT. **Tagline:** Meet. Match. Move. **Positioning line:**
  Dating. Friends. Workout Partners.
- **Personality:** confident, athletic, attractive, energetic, modern,
  premium, social, slightly edgy, sophisticated, fun, motivating. Think
  premium consumer technology and luxury nightlife, not a gym poster.
- **Never:** flames, dumbbell icons, cartoon muscles, cheap neon glow,
  stereotypical bodybuilding imagery, generic fitness-app styling, emoji as
  UI icons, a generic heart as the brand mark.

### Colour system

| Token | Hex | Use |
| --- | --- | --- |
| Void | `#0B0D0F` | App background |
| Carbon | `#171B20` | Cards, sheets, nav |
| Graphite | `#242A31` | Inputs, dividers, inactive |
| Chalk | `#F5F7F2` | Primary text |
| Ash | `#9BA3AD` | Secondary text, labels |
| Lime | `#C7FF2F` | Primary brand accent |
| Volt | `#8BFF00` | Secondary lime, gradients and pressed states only |
| Pulse | `#FF4F5E` | Romantic: Date mode, likes, "It's a HIT-IT" |
| Flow | `#43A7FF` | Workout and information: Workout mode, invites, schedule |

Balance: roughly 70% dark neutrals, 20% Chalk and Ash, 10% Lime and
contextual accents. Lime is used only for primary buttons, the active tab,
match indicators, progress, compatibility scores, selected filters and chips,
and brand details. Never lime text on lime, never large lime surfaces, never
lime as a background. Pulse and Flow appear only when their context is on
screen (Date mode, Workout mode). Gradients are subtle, Lime to Volt, and
appear only on the primary button and the match moment.

### Typography

Load from Google Fonts: **Archivo** (700 and 900, use the wide axis at 110%
for headlines and big numbers) and **DM Sans** (400, 500, 600) for UI and
body. Headlines are large and bold with tight tracking. Uppercase labels are
11 px with 0.12 em tracking in Ash. Body is 15 px. Numbers use tabular
figures. Never a rounded or playful face; never below 12 px.

### Logo and app icon

Create an original wordmark: HIT-IT in Archivo 900, wide, with the hyphen
replaced by a short Lime bar that reads as a "strike". App icon: the two
letters "H" and "I" merged into a single geometric mark with the Lime strike
through the centre, on Void. It must read at 32 px. No hearts, dumbbells,
flames, or borrowed symbols.

### Terminology (use these words everywhere, nothing else)

| Concept | HIT-IT term |
| --- | --- |
| Like | **HIT-IT** (verb: "Hit it") |
| Pass | **Pass** |
| Super like | **Super Hit** |
| Mutual match | **It's a HIT-IT** |
| Compatibility score | **HIT-IT Match** (a percentage) |
| Workout invitation | **Workout Date** |
| Same-gym discovery | **Gym Crush** |
| Visibility purchase | **Boost** |
| Undo last swipe | **Rewind** |
| Social feed | **Fitness** |
| Daily curated set (Elite) | **Match Pack** |

## 2. Structure and navigation

Five primary sections in a bottom tab bar on mobile, a left rail on tablet
and desktop: **Discover**, **Likes**, **Matches**, **Fitness**, **Profile**.
Transitions between sections are 220 ms cross-fades with a 8 px slide.
Desktop uses a two-column layout (discovery stack left, detail or chat
right); never a stretched phone layout.

## 3. Onboarding (12 steps, one screen each)

A stepper with a thin Lime progress line at the top and a persistent "Back"
and "Continue". Save after every step so an abandoned onboarding resumes.
Ask for an account (email, Apple, Google) after step 2, once photos are in.

1. **You:** name, birthday (age computed, 18+ enforced), gender, pronouns
   (optional), orientation (optional), who you want to meet.
2. **Photos:** at least one required, up to six, drag to reorder, first
   photo must contain a face (check on upload, gentle retry message).
   Optional 10-second video.
3. **About:** height, weight (optional, hidden from others by default),
   city or neighbourhood (never exact address), occupation, education,
   languages.
4. **Workout types** (multi-select): Strength, Bodybuilding, Powerlifting,
   CrossFit, Running, Cycling, Yoga, Pilates, Calisthenics, HIIT, Walking,
   Sports, Martial Arts, Swimming, Other.
5. **Goals** (multi-select): Build muscle, Lose fat, Get stronger, Improve
   endurance, Athletic performance, Health, Weight management, Competition,
   Lifestyle, Just stay active.
6. **Training personality:** one of Solo Grinder, Social Gym-Goer,
   Accountability Seeker, Workout Coach; plus level: Beginner,
   Intermediate, Advanced, Competitive.
7. **Schedule:** days per week (1–7), preferred days, preferred windows
   (Early Morning 5–7, Morning 7–10, Lunch 11–2, Afternoon 2–5, Evening
   5–8, Late Night 8–11). Multi-select windows.
8. **Gym:** search a seeded gym list or add one (name plus neighbourhood).
   Toggle "Show my gym on my profile" (default on) and "Gym Crush"
   (default on). Explain in one line that only the gym name is shared,
   never when the user is there.
9. **Interests** (multi-select, at least three). Fitness: Weightlifting,
   Running, CrossFit, Yoga, Pilates, Cycling, Basketball, Football, Soccer,
   Swimming, Hiking, Tennis, Boxing, MMA, Dance, Surfing. Lifestyle:
   Travel, Food, Coffee, Fashion, Music, Movies, Beach, Technology,
   Entrepreneurship, Photography, Gaming, Cars, Art, Nightlife, Wellness.
10. **Looking for** (multi-select): Dating, Workout Partner, Friends, or
    Open to All.
11. **Bio and prompts:** bio up to 300 characters; pick three prompts from:
    "My ideal workout is…", "Ask me about…", "After the gym I…", "My
    current fitness goal…", "My favorite exercise…", "My perfect workout
    date…". Answers up to 120 characters.
12. **Discovery preferences:** age range, distance (5–100 mi, or "anywhere"),
    gender, fitness level, workout style, workout frequency, workout time,
    gym, relationship intention, connection type.

Finish screen: "Your profile is complete." then "Let's find your people."
with one Lime button into Discover, and a three-line explanation of how the
HIT-IT Match score works.

## 4. Discover

### Header

Wordmark left. Mode selector centre: **Date** (Pulse), **Workout** (Flow),
**Friends** (Lime). Filter icon right. Under the header a personalised
greeting: "Good evening, Alex. Your gym is active tonight. 12 potential
matches nearby." Counts are real queries, not copy.

### Feeds

A horizontal chip row of feeds: **For You**, **Nearby**, **Same Gym**,
**Workout Partners**, **Dates**, **Friends**. Each feed reorders the same
candidate pool with the weights in section 6. The selected chip is Lime.

### Card stack

One large card fills the viewport below the chips, next card visible 8 px
behind it. Card content, top to bottom, over the main photo with a Void
gradient at the bottom:

- Name, age, verified check
- Height (and weight only if the person chose to show it)
- Distance, rounded: under 1 mile shows "Under a mile", otherwise to one
  decimal
- **HIT-IT Match** percentage in a Lime pill
- Up to three workout style chips
- Gym name, if shown
- "Usually trains: Evenings"
- "Looking for: Dating + Workout Partner"
- "4 shared interests"

Example card: Jasmine, 27 · Verified · 5'6" · 2.4 mi · 92% HIT-IT Match ·
Strength, Glutes, Running · Trains at Equinox · Usually 6–8 PM · Looking
for Workout Partner + Dating · 4 shared interests.

Beneath the card, three round buttons: Pass (Graphite), HIT-IT (Lime,
largest), Super Hit (Flow ring). A small Rewind button sits left of Pass
when the user has Rewinds.

### Gestures

- Drag right: card rotates up to 12°, a **HIT-IT** stamp fades in at 40% of
  the drag threshold. Release past 35% of viewport width commits.
- Drag left: **PASS** stamp, same physics.
- Drag up: **SUPER HIT** stamp in Flow; commits past 25% of viewport height.
- Tap: opens the full profile as a sheet that slides up over the stack.
- Commit animation 260 ms; the next card scales from 0.96 to 1 in 200 ms.
  Preload the next three cards' first photos. A swipe must never wait on
  the network: write the swipe locally, sync in the background, and on a
  sync failure keep the local decision and retry.
- Haptics where supported: 8 ms on drag threshold, 12 ms on commit.

### Below the stack (scroll)

**Workout partners near you** (horizontal cards from Workout Partner
posts), **Fitness** (three most recent feed posts), **Your challenges**
(progress rings). Each has a "See all" into its section.

### Empty states

Designed, never blank. Examples: "No one new in Same Gym right now. Turn on
Nearby or check back after tonight's rush." with a button that does that.
"You're out of daily HIT-ITs. They reset at midnight, or go unlimited with
Plus." with the upgrade sheet.

## 5. Full profile

A full-screen sheet. Photo carousel with dots, then video if present. Name,
age, verified, distance, height. Sections with uppercase Ash labels:
**Fitness** (styles, level, goals, personality), **Schedule** (days and
windows), **Gym** (name only), **About** (occupation, education, languages,
lifestyle), **Prompts** (three large cards), **Bio**, **Interests** (chips,
shared ones in Lime), **Social links** if enabled.

Then the **Why you match** block:

```
HIT-IT MATCH  94%
Workout      96%
Schedule     88%
Interests    94%
Lifestyle    91%
Location     97%
✓ Same workout style   ✓ Same gym   ✓ 4 shared interests
✓ Similar schedule     ✓ Both looking for workout partners
```

Sticky bottom bar: **HIT-IT**, **Message** (enabled after a match or with
the Pro "message first" allowance), **Plan Workout**. Overflow menu:
Share (internal), Report, Block.

## 6. HIT-IT Match: the compatibility formula

Store every input and compute the score on the server whenever either
profile changes. Never random, never based on photos.

Sub-scores (each 0–100):

- **Workout** (weight 0.30): Jaccard overlap of workout types × 60 + fitness
  level closeness × 25 (same level 25, adjacent 15, two apart 5) + training
  personality compatibility × 15 (Accountability Seeker with Social or
  Coach 15, Solo with Solo 15, others 8).
- **Schedule** (weight 0.20): shared preferred windows ÷ union × 70 +
  shared preferred days ÷ union × 30.
- **Interests** (weight 0.20): Jaccard overlap of interests × 100.
- **Lifestyle** (weight 0.15): relationship intention compatibility (both
  Dating or both Open 100, one Dating one Friends 30, both Friends 100,
  Workout Partner with anything 80) × 60 + goals overlap × 40.
- **Location** (weight 0.15): same gym 100; otherwise 100 at 0 miles
  decreasing linearly to 20 at the user's maximum distance.

Overall = weighted sum, rounded. Mode adjustment: Date mode reweights
Lifestyle to 0.30 and Workout to 0.15; Workout mode reweights Workout to
0.40 and Lifestyle to 0.05; Friends mode reweights Interests to 0.35 and
Lifestyle to 0.05. Cache per pair and per mode; recompute on profile edits.

"Why you match" lists every factor that scored 80+ as a check line.

## 7. Discovery ranking

Candidate pool: users who satisfy the viewer's preferences and whose
preferences the viewer satisfies, not blocked either way, not already
swiped in the last 30 days (Pass) or ever (HIT-IT), active in the last 30
days. Rank by:

```
score = HIT-IT Match × 0.45
      + recency (active today 100, this week 70, this month 40) × 0.15
      + profile completeness × 0.10
      + feed bonus × 0.20   (Same Gym: same gym 100 else 0;
                             Workout Partners: Workout sub-score;
                             Dates: Lifestyle sub-score, Dating intent required;
                             Friends: Interests sub-score;
                             Nearby: Location sub-score; For You: HIT-IT Match)
      + boost bonus (active Boost adds 25)   × 0.10
```

Serve in pages of 10, preloading the next page when 4 remain. When the pool
is exhausted, relax distance in 10-mile steps up to 2× the user's setting,
then show Passed profiles older than 30 days, then a designed empty state.
Log every impression, swipe, and outcome so weights can be tuned later.

## 8. Gym Crush

A feed and a filter for people who chose the same gym. Shows "You both train
here." and the overlap of preferred windows, phrased loosely: "Usually here
Tuesday and Thursday evenings." Rules: never live location, never presence
at a gym, never a check-in. Users can hide their gym, turn Gym Crush off,
or set it to Verified-only. Gym verification: a photo of a membership card
or key tag reviewed by admin, shown as "Verified at Equinox". Hidden gyms
still count toward the Location sub-score but are never displayed.

## 9. Matches and the match moment

A match is created the instant both users have HIT-IT or Super Hit each
other. Show the **It's a HIT-IT** moment immediately over the current
screen: Void background, the two profile photos slide in from the sides and
overlap, the wordmark's Lime strike draws across in 400 ms, then the text
"It's a HIT-IT" and "You and Jasmine matched", the HIT-IT Match percentage
counting up, and the shared items (interests, workouts, gym). Buttons:
**Message**, **Plan a Workout**, **Plan a Date**, and a quiet "Keep
swiping". Total sequence 1.4 s; skippable; no confetti.

Matches tab: list sorted by last activity, unread badge in Lime, a "New
matches" row at the top with photos, and a "Workout Dates" row showing
upcoming accepted sessions.

## 10. Messaging

One-on-one chat available after a match, or before a match for Pro and
Elite users (one message-first per day, clearly labelled to the recipient).
Support text, emoji, and an architecture that can accept photos and GIFs
later (an attachment type on the message entity). Special message types:
**Workout Date card**, **Date card**, and **Conversation starter**.

Starters shown above the keyboard on an empty chat: "What's your current
split?", "Favourite exercise?", "What's your fitness goal right now?",
"Which gym?", "Leg day or rest day?", "Want to hit a workout together?"

Read and delivered states, typing indicator, "Active now" or "Active
recently" only if the user allows it in privacy settings. Report, block,
and unmatch in the chat header menu. Blocked users vanish from each other
everywhere and neither is told.

## 11. Workout Date

From a profile, a match, or a chat: **Plan a Workout Date**. Fields:
activity (Lift Together, Run, Walk, Cycling, Yoga, Pilates, Boxing, Sports,
Hike, Swim, Smoothie, Coffee, Other), date, time, location (gym or a named
public place; never a home address), optional message. The recipient gets a
card: "Alex wants to hit legs with you Thursday at 6:00 PM at Equinox
Midtown." with **Accept**, **Decline**, **Suggest another time** (opens a
picker and returns a counter-proposal). Accepted sessions appear on both
users' HIT-IT schedule, in Matches, and in notifications with a reminder
one hour before. Either can cancel with a required short reason.

## 12. Likes, Super Hit, Rewind, Boost

- **Likes tab:** Free users see a blurred grid with the count ("12 people
  hit it"). Pro and Elite see everyone with photos and can HIT-IT, Super
  Hit, Pass, Report, or Block from the grid. Plus sees the three most
  compatible unblurred.
- **Super Hit:** the recipient sees "You've been Super Hit" with a Flow ring
  animation on the card and in Likes. Daily allowance by tier (section 15).
- **Rewind:** undo the last Pass within 10 seconds on Free; unlimited on
  Plus and up.
- **Boost:** 30 minutes (admin-configurable) of +25 ranking bonus. A clean
  Lime countdown ring in the Discover header. Copy never promises matches:
  "Your profile is being shown to more people nearby."

## 13. Fitness (social feed)

Post types: Workout completed, Personal record, Photo, Video, Goal, Looking
for a workout partner, Motivation, Progress update. Each post: author,
time, text up to 500 characters, optional media, optional workout type
chip, gym chip if shown. Reactions: Like, **Kudos** (fitness-specific, Flow
coloured), comments, internal share, and "Hit it" on the author from the
post. Feed is chronological within the user's distance setting, paged 20
at a time. No algorithmic doom-scroll: after 40 posts show "You're caught
up" with a button to Challenges.

**Workout Partner posts** are a structured post type: headline generated
from fields ("Looking for a leg day partner"), gym, workout type, day,
time window, level, goal, optional message, and a **HIT-IT** button that
sends a HIT-IT to the author plus a pre-filled Workout Date.

## 14. Challenges, Events, Streaks, Levels

- **Challenges:** seed 7-Day Workout, 5-Day Streak, 10-Mile Run, 100
  Push-Ups, 100,000 Steps, Leg Day Week, 30-Day Fitness. Each has a metric,
  target, start and end, and a progress ring. Users join, log progress
  (manual entry or from a Workout completed post), invite matches and
  friends, and see a leaderboard by consistency. Completion adds a subtle
  badge to the profile.
- **Events:** Group workout, Running group, Yoga session, Beach workout,
  Hiking group, Sports meetup, Fitness class, Social meetup. Fields: host,
  title, type, date, time, place (public place or gym), capacity,
  description, attendees, RSVP, invite matches, report. Host can cancel;
  attendees are notified.
- **Streaks:** one healthy streak, the **HIT-IT Streak**, counted in days
  with at least one of: a workout post, a challenge log, an event
  attended, a Workout Date completed, or a profile improvement. Swiping
  never counts. Display as "7-day HIT-IT streak" with a small Lime bar;
  missing a day resets quietly with no guilt copy.
- **Levels:** Bronze, Silver, Gold, Elite, Legend, computed from
  participation points (posts, challenges, events, Workout Dates,
  profile completeness, positive reactions received). Thresholds live in
  admin settings. Shown as a small ring around the profile photo. Copy
  never suggests a higher level means a better person.

## 15. Membership tiers

Configurable in admin; these are the defaults.

| | Free | Plus | Pro | Elite |
| --- | --- | --- | --- | --- |
| Price (mo / yr) | $0 | $14.99 / $89.99 | $29.99 / $179.99 | $49.99 / $299.99 |
| Daily HIT-ITs | 25 | Unlimited | Unlimited | Unlimited |
| Super Hits per day | 1 | 3 | 5 | 10 |
| Rewind | 10 s | Unlimited | Unlimited | Unlimited |
| Boosts per month | 0 | 1 | 3 | 6 |
| Filters | Basic (age, distance, gender) | Advanced | Advanced + gym and workout | Advanced + gym and workout |
| Compatibility detail | Overall only | Sub-scores | Sub-scores + why | Sub-scores + why + Match Intelligence |
| Same Gym and Schedule feeds | – | ✓ | ✓ | ✓ |
| See who hit it | Blurred | Top 3 | All | All |
| Message first | – | – | 1 / day | 3 / day |
| Incognito | – | – | ✓ | ✓ |
| Priority placement | – | – | ✓ | Highest |
| Match Pack (daily curated 5) | – | – | – | ✓ |
| Premium events and challenges | – | – | – | ✓ |
| Profile analytics | – | – | – | ✓ |
| Ads | Yes | None | None | None |

**Membership page** headline: "Level up your HIT-IT". Four cards in a
horizontal scroll on mobile, a row on desktop, Pro highlighted with a Lime
border and "Recommended". Monthly/annual toggle with the annual saving
shown. Benefits as short lines, not a feature matrix. Build the
subscription entity and a `billing_provider` abstraction so Stripe, Apple,
or Google can be attached later without redesign; for now, "Start trial"
activates the tier for 7 days.

## 16. Profile and settings

Profile: photos, name, age, verified, level ring, bio, fitness section,
schedule, gym, interests, prompts, posts, challenges, achievements,
subscription status. Edit Profile reuses the onboarding steps as sheets.
Settings: account, discovery preferences, notifications (granular, per
type in section 19), privacy (show gym, Gym Crush, show weight, show
active status, incognito, hide profile), safety centre, blocked users,
community guidelines, terms, privacy policy, delete account (removes all
content, messages, and media within 24 hours).

## 17. Safety and privacy

- Block, report, unmatch, hide profile from any profile, card, post, or
  chat in two taps. Report reasons: harassment, fake profile, scam,
  inappropriate photo, underage, other, with optional text. Reports go to
  the moderation queue and auto-hide the reported content from the
  reporter.
- Location: store city or neighbourhood centroid only. Show rounded
  distance. Never map pins, never live location, never gym presence.
- Height and weight, fitness data, preferences, photos, and messages are
  sensitive: exposed to other users only per privacy settings, never in
  public URLs, never to search engines.
- Verification: selfie pose match reviewed by admin, shown as a check.
  Copy: "Verified means this person matched a live selfie to their photos."
  Never imply safety.
- Photo moderation on upload (nudity, minors, text overlays with contact
  info) before the photo is visible.
- Community guidelines, terms, and privacy policy as placeholder pages in
  the safety centre.

## 18. Admin dashboard

Protected by an admin role. Overview: total, active, and new users; matches;
likes; messages; reports; blocks; subscriptions by tier; revenue; Boost and
Super Hit usage; challenges and events joined; popular gyms and workout
types; 7- and 30-day retention; system health. Queues: moderation
(photos, posts, reports), verification, gym verification. Management:
users (suspend, delete, verify), subscriptions, challenges, events, gyms.
Configuration: prices and benefits per tier, daily HIT-IT and Super Hit
limits, Boost duration and bonus, level thresholds, discovery weights
(section 7), moderation strictness, feature flags.

## 19. Notifications

Types: new match, new message, new HIT-IT (tier-gated detail), Super Hit,
Workout Date invite, accepted, declined, counter-proposed, reminder;
comment; reaction; challenge progress and completion; event invite and
reminder; subscription changes; Boost start and end. In-app inbox plus push
where supported. Each type can be toggled in settings; quiet hours default
to 11 PM–7 AM.

## 20. Data model

Create these entities with fields and indexes. Use foreign keys.

- **User:** id, email, auth provider, role (user, admin), created_at,
  last_active_at, status (active, suspended, deleted). Index last_active_at.
- **Profile:** user, name, birthday, gender, pronouns, orientation, seeking
  genders, height_cm, weight_kg, show_weight, city, neighbourhood, lat_lng
  (centroid only), occupation, education, languages, bio, verified,
  level, completeness (0–100), incognito, hidden.
- **Photo:** profile, url, order, moderation_status, is_primary. **Video:**
  profile, url, moderation_status.
- **FitnessProfile:** profile, workout_types (array), goals (array),
  personality, level, days_per_week, preferred_days, preferred_windows.
- **Gym:** id, name, neighbourhood, city, verified_count. **GymMembership:**
  profile, gym, show_gym, gym_crush_enabled, verified. Index gym.
- **Interest:** id, name, category. **ProfileInterest:** profile, interest.
  Index profile and interest.
- **Prompt:** id, text. **PromptAnswer:** profile, prompt, answer.
- **DiscoveryPreference:** profile, age_min, age_max, distance_mi, genders,
  levels, workout_types, frequency, windows, gyms, intentions,
  connection_types, verified_only.
- **Swipe:** actor, target, type (pass, hit, super), mode, created_at.
  Unique (actor, target). Index (target, type, created_at).
- **Match:** user_a, user_b, created_at, source (hit, super, workout_post,
  event), status (active, unmatched). Unique pair. Index both users.
- **Compatibility:** user_a, user_b, mode, overall, workout, schedule,
  interests, lifestyle, location, reasons (array), computed_at. Unique
  (pair, mode).
- **Conversation:** match, last_message_at, unread counts per user.
  **Message:** conversation, sender, type (text, workout_date, date,
  starter, attachment), body, attachment_url, read_at, created_at. Index
  (conversation, created_at).
- **WorkoutDate:** proposer, recipient, match, activity, date, time,
  place, message, status (pending, accepted, declined, countered,
  cancelled, completed), counter_of. Index recipient and date.
- **Post:** author, type, text, media_url, workout_type, gym, created_at,
  city. Index (city, created_at). **PartnerPost:** post, gym, workout_type,
  day, window, level, goal. **Comment:** post, author, text, created_at.
  **Reaction:** post, user, type (like, kudos). Unique (post, user, type).
- **Challenge:** id, name, metric, target, starts_at, ends_at, premium.
  **ChallengeParticipant:** challenge, user, progress, completed_at,
  streak. Index (challenge, progress).
- **Event:** host, title, type, starts_at, place, capacity, description,
  premium, status. **EventParticipant:** event, user, status.
- **Subscription:** user, tier, period, status, trial_ends_at,
  renews_at, billing_provider, external_id. **Boost:** user, starts_at,
  ends_at. **SuperHitAllowance:** user, date, used.
- **Notification:** user, type, payload, read_at, created_at. Index (user,
  read_at).
- **Report:** reporter, target_user, target_type, target_id, reason, text,
  status. **Block:** blocker, blocked. Unique pair. Index both.
- **Verification:** user, type (selfie, gym), media_url, status,
  reviewed_by. **AppSetting:** key, value (JSON). **AdminUser:** user,
  permissions. **AnalyticsEvent:** user, name, payload, created_at.

## 21. Performance

Discovery, feed, and messages must feel instant. Serve images resized to
the display size (card 1080 wide, thumbnail 240) with lazy loading below
the fold and preloading for the next three cards. Paginate every list.
Swipes, reactions, and messages write optimistically and sync in the
background. No spinner longer than 400 ms; use skeletons that match the
final layout. Cache compatibility per pair.

## 22. Animation

Card swipe physics, the match moment, Super Hit ring, compatibility
count-up (600 ms), progress rings on load, tab cross-fades, sheet slide-ups
(260 ms), button press scale to 96%. Nothing else animates. Respect
reduced-motion.

## 23. Seed data

Create 60 realistic, diverse, non-celebrity profiles across two cities,
covering beginners to competitive athletes, runners, lifters, yoga,
cyclists, CrossFit, sports, casual gym-goers, and each of Dating, Friends,
Workout Partner, and Open to All. Include 12 gyms, 30 feed posts, 8 partner
posts, 6 challenges with participants, 8 events, 20 existing matches with
conversations, 6 pending Workout Dates, and one admin account. The demo
user is Alex, 29, in the first city, with a completed profile, so the first
launch opens straight into a populated Discover.

## 24. Build order and completion

Build in this order and do not skip ahead: data model and seed → onboarding
→ Discover with gestures and ranking → full profile and HIT-IT Match →
matches and the match moment → messaging and Workout Date → Likes, Super
Hit, Rewind, Boost → Fitness feed and partner posts → Challenges, Events,
Streaks, Levels → membership page and tier gating → Profile, settings,
safety → notifications → admin.

Before reporting completion, walk every screen at 375 px and at desktop
width and fix: broken navigation or buttons, spacing and typography
inconsistencies, weak mobile layouts, slow interactions, missing loading or
empty states, colours outside the palette, unclear calls to action, missing
safety controls, duplicated components, and any discovery flow that can
dead-end. Then list what you fixed.

---

# PART B — PHASE PROMPTS (run one at a time after Part A)

### B1. Discover feel

> Open Discover on a 375 px viewport as Alex. Drag a card slowly and confirm
> the HIT-IT and PASS stamps fade in at 40% of the threshold, the card
> rotates, and releasing before the threshold snaps back. Commit a right
> swipe and confirm the next card is already loaded with its photo. Put the
> browser offline, swipe twice, come back online, and confirm both swipes
> are stored once. Show me the empty state when daily HIT-ITs run out.

### B2. Compatibility audit

> For Alex and the top five cards, print every sub-score, the weights used
> for the current mode, and the overall, and prove the overall equals the
> weighted sum. Switch to Date mode and show the reweighted numbers. Show
> that "Why you match" lists only factors at 80 or above.

### B3. Match and Workout Date

> As Alex, HIT-IT a seeded user who already hit Alex. Confirm the match
> moment plays once, is skippable, and lands in Matches. From the match,
> plan a Workout Date for Thursday 6 PM, then as the other user counter to
> 7 PM, then as Alex accept. Confirm it appears on both schedules and both
> get a reminder notification entry.

### B4. Privacy and safety

> Prove that no API response for another user includes lat_lng, exact
> address, weight when show_weight is false, or gym when show_gym is false.
> Block a user from a chat and confirm they vanish from Discover, Likes,
> Matches, Fitness, and Events for both sides. Report a photo and confirm it
> appears in the admin moderation queue.

### B5. Tiers

> As a Free user, hit the 25-swipe limit and confirm the upgrade sheet
> names the limit. Start a Pro trial and confirm unlimited swipes, the full
> Likes grid, and one message-first per day, all without a reload. As admin,
> change the Free daily limit to 10 and confirm it applies to a new session.

### B6. Final quality pass

> Audit every screen at 375 px and desktop. Fix any colour outside the
> palette, any font other than Archivo and DM Sans, any missing empty or
> loading state, any tap target under 44 px, and any duplicate component.
> List every fix.
