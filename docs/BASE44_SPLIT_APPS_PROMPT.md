# Base44 — Splitting the Merged Project into Two Apps

Base44 put both ideas into one project. The clean fix is two projects, each
built from its own master prompt. Do not try to make one project serve both
brands; the data models, palettes, and paywalls conflict.

## Recommended path: start two clean projects

1. In Base44, create a new project named **Get-it** and paste
   `BASE44_GET_IT_FITNESS_APP_PROMPT.md`.
2. Create a second new project named **Hit-it** and paste
   `BASE44_HIT_IT_DATING_APP_PROMPT.md`.
3. Keep the merged project as an archive. Export any data or copy you want
   to keep from it before deleting it.

## If you want to keep the existing project as Get-it

Paste this into the merged project:

> This project must become **Get-it only**, a fitness app. Remove every
> dating, matching, swiping, messaging, crew, session-invite, and profile-
> discovery feature, including their entities, pages, navigation entries,
> and seeded data. Keep only: user profile and intake, workout plans and
> exercises, workout logging, nutrition targets, food logging, diet plans,
> progress, and subscription. After removing, list every entity and page
> that remains, and confirm nothing references a removed entity. Then
> apply the Get-it master prompt I will paste next, updating the existing
> screens rather than duplicating them.

Then paste the Get-it master prompt in full, and build Hit-it as a brand-new
project.

## Why the two must be separate

- **Different users at different moments.** A person opens Get-it mid-set
  and Hit-it on the sofa. Mixing them makes both feel wrong.
- **Different palettes.** Get-it is Ember on Graphite; Hit-it is Pulse on
  Midnight. One app cannot carry both identities.
- **Different trust models.** Hit-it needs moderation, verification, and
  safety tooling that would be dead weight in a fitness tracker.
- **Different store listings, pricing, and reviews.** Two products, two
  App Store entries.

## What they can share later

If both ship, a single account system and a "train together" hand-off
(Hit-it session → Get-it logs the workout) is a good premium feature. Build
that as an integration between two apps, not as one app.
