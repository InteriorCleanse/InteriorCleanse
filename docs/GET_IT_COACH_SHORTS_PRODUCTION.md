# Get-it Coach Shorts — Production System

How to produce Fitonomy-style coaching shorts for Get-it at scale, using
Higgsfield for the footage, CapCut for assembly, and Base44 to host the feed.
The pilot batch of six was generated from this session; everything below is
what you repeat for the next hundred.

## What Fitonomy's shorts actually are

Their format, reduced to parts you can reproduce:

- A faceless 3D anatomical figure on a plain dark background performing one
  exercise, with the working muscles highlighted in a hot colour.
- A big text hook in the first second ("Your rows are wrong", "Chest not
  growing? Do this").
- One cue per short. Sometimes a "❌ / ✅" split: wrong form on the left,
  right form on the right, or one after the other.
- Set and rep prescription at the end ("3 × 10", "Rest 90 s").
- 15 to 40 seconds, vertical 9:16, trending sound or a calm voiceover, and
  captions burned in.

## The Get-it version: what makes ours ours

- **The Coach figure:** matte charcoal, faceless, muscles glow **Amber
  `#F5A623`** with an Ember `#FF6A2B` edge, on a near-black background. Same
  figure, same lighting, every clip, so the feed reads as one brand.
- **Type:** Space Grotesk Bold for hooks and numbers, Inter for cues.
  Bone `#F4F1EC` text, Amber for the key number, Signal `#FF3B5C` for "❌"
  and Mint `#3DDC97` for "✅".
- **Lower-third lockup:** the Get-it wordmark bottom-left at 60% opacity on
  every clip. Never a centre watermark.
- **Structure (30 s target):**
  1. 0–1.5 s: hook text slams in over the figure at rest (the muscle already
     glowing).
  2. 1.5–12 s: the movement, two clean reps, cue text appears on the second
     rep.
  3. 12–22 s: the mistake (figure performs the wrong version, muscle glow
     turns Signal red) then the fix (glow back to Amber). Skip for pure
     demonstration shorts.
  4. 22–28 s: prescription card: sets × reps, rest, tempo.
  5. 28–30 s: end card: "Full plan in Get-it" with the wordmark and the
     heartbeat-free Ember progress ring.

## Pipeline

### Step 1 — Keyframe (Higgsfield, ~2 credits each)

Model `nano_banana_pro`, aspect `9:16`. Use this master prompt and change
only the bracketed parts:

```
Stylized 3D render of a faceless athletic anatomical mannequin figure made of
smooth matte charcoal-grey material, [POSITION AND EXERCISE AT MID-REP].
The [TARGET MUSCLES] glow a warm amber-orange emissive light from within the
figure, [SECONDARY MUSCLES] glow faintly; every other muscle stays matte
charcoal. Pure near-black studio background, dark reflective floor, soft cool
rim light from behind, subtle volumetric haze. [CAMERA ANGLE], full body in
frame, centered, generous empty space at the top and bottom of the vertical
frame for captions. Cinematic, ultra clean, photoreal CGI, 4K. No text, no
logo, no watermark, no face details.
```

For "wrong form" frames add: "performing the exercise with [THE MISTAKE,
e.g. rounded lower back], the glowing muscles tinted red instead of amber".

### Step 2 — Motion (Higgsfield, ~14 credits per 8 s clip)

Model `kling3_0`, `mode: pro`, `sound: off`, `9:16`, `duration: 8`, with the
keyframe as `start_image`. Prompt pattern:

```
The charcoal mannequin figure performs two slow, controlled [EXERCISE]
repetitions: [ECCENTRIC over two seconds], [CONCENTRIC over one second],
repeats. The glowing amber [MUSCLES] brighten at [THE PEAK]. [FORM CUE, e.g.
elbows stay pinned]. Camera holds locked, no camera movement. Background
stays pure black, lighting constant. Smooth, realistic biomechanics, no extra
limbs, no morphing, no text.
```

If Higgsfield answers with a preset recommendation instead of a job, resubmit
with `declined_preset_id` set to that preset. Generate two takes when the
movement is complex (squat, deadlift, leg raise) and keep the cleaner one.
Use `seedance_2_5` at 1080p (about 72 credits) only for hero clips that will
run as ads; Kling pro is enough for the feed.

If Leonardo AI is preferred for keyframes, use the same keyframe prompt with
the Leonardo Phoenix model and "cinematic" preset, then bring the PNG into
Higgsfield or Leonardo Motion for the clip. The prompt does not change.

### Step 3 — Assembly (CapCut)

One CapCut template, reused for every short:

1. New project, 1080 × 1920, 30 fps.
2. Track 1: the 8 s clip, slowed to 0.8× and looped to fill the segment.
   For the mistake segment, use the "wrong" clip with a red tint filter at
   30% if a red-glow keyframe was not generated.
3. Track 2: text layers with the fonts and colours above. Hook: 96 px,
   top third, 1.5 s, "slam" in-animation. Cue: 64 px, bottom third. Rep
   card: 120 px numbers in Amber.
4. Track 3: the Get-it wordmark PNG, bottom-left, 60% opacity, whole
   duration.
5. Audio: a licensed track from CapCut's commercial library, or a voiceover
   recorded from the script card (Higgsfield `generate_audio` with a calm
   male or female voice works well). Duck music under voice by 12 dB.
6. Auto-captions on, styled Bone on a 40% black pill, Inter 44 px.
7. Export 1080p, 30 fps, H.264, and save the project as a template so the
   next short is a media swap.

### Step 4 — Publish and host

- Post to TikTok, Reels, and YouTube Shorts with the hook as the first line
  of the caption and #getit in every post.
- Upload the MP4 and its poster frame to the Get-it admin Coach screen,
  tagged by muscle group and exercise, so the short appears in the in-app
  Coach feed and on the exercise page.

## Pilot batch (generated this session)

| # | Exercise | Muscle group | Hook | Cue | Prescription |
| --- | --- | --- | --- | --- | --- |
| 1 | Barbell bench press | Chest | "Chest not growing? Start here." | "Bar to lower chest. Elbows 45°." | 4 × 8 · Rest 120 s |
| 2 | Bent-over barbell row | Back | "Your rows are working your arms." | "Pull to the hips, not the chest. Pause 1 s." | 4 × 10 · Rest 90 s |
| 3 | Back squat | Legs | "Depth builds legs. Half reps don't." | "Hips to parallel. Knees track the toes." | 4 × 6 · Rest 150 s |
| 4 | Dumbbell lateral raise | Shoulders | "Stop swinging your lateral raises." | "Lead with the elbows. 2 s down." | 3 × 15 · Rest 60 s |
| 5 | Hammer curl | Arms | "The curl that builds thicker arms." | "Elbows pinned. Squeeze at the top." | 3 × 12 · Rest 60 s |
| 6 | Hanging leg raise | Core | "Leg raises aren't working? Tilt." | "Tuck the pelvis. Lift with the abs, not the hips." | 3 × 12 · Rest 75 s |

## Next 24 scripts (one keyframe and one clip each)

| # | Exercise | Group | Hook | Cue |
| --- | --- | --- | --- | --- |
| 7 | Incline dumbbell press | Chest | "Upper chest is a 30° problem." | "Bench at 30°. Dumbbells over the collarbone." |
| 8 | Cable fly | Chest | "Flys are for the squeeze, not the weight." | "Arc, don't press. Hold 1 s at the centre." |
| 9 | Push-up | Chest | "Perfect push-ups in 3 cues." | "Hands under shoulders. Body a plank. Chest to floor." |
| 10 | Pull-up | Back | "Can't pull-up yet? Do this." | "Slow negatives, 5 s down. 5 reps." |
| 11 | Lat pulldown | Back | "Pulldowns: stop leaning back." | "Chest up, elbows to the pockets." |
| 12 | Romanian deadlift | Hamstrings | "The RDL is a hinge, not a squat." | "Push the hips back. Bar stays on the legs." |
| 13 | Conventional deadlift | Back/legs | "Deadlift set-up in 4 seconds." | "Bar over mid-foot. Shins to bar. Brace. Push the floor." |
| 14 | Hip thrust | Glutes | "Glutes: this beats squats." | "Chin tucked. Full lockout. Squeeze 2 s." |
| 15 | Bulgarian split squat | Legs | "The leg exercise everyone skips." | "Front shin vertical. Straight down." |
| 16 | Leg press | Quads | "Leg press: feet low = quads." | "Feet low and narrow. Don't lock the knees." |
| 17 | Walking lunge | Legs | "Lunges without knee pain." | "Long step. Torso tall. Knee tracks the toe." |
| 18 | Standing calf raise | Calves | "Calves grow with a 3 s pause." | "Full stretch at the bottom. Pause. Up on the big toe." |
| 19 | Overhead press | Shoulders | "Overhead press: stop arching." | "Glutes tight. Bar path straight. Head through." |
| 20 | Face pull | Rear delts | "The fix for rounded shoulders." | "Pull to the eyes. Elbows high. Squeeze." |
| 21 | Barbell curl | Biceps | "Curls: your elbows are moving." | "Elbows pinned. No swing. 2 s down." |
| 22 | Incline dumbbell curl | Biceps | "The curl for the long head." | "Arms behind the body. Full stretch." |
| 23 | Triceps rope pushdown | Triceps | "Pushdowns: split the rope." | "Elbows still. Split at the bottom." |
| 24 | Skull crusher | Triceps | "Bigger triceps: lower behind the head." | "Bar to behind the head, not the forehead." |
| 25 | Dips | Chest/triceps | "Dips: lean for chest, upright for triceps." | "Pick one. Lower to 90°." |
| 26 | Plank | Core | "Your plank is too easy." | "Squeeze glutes. Tuck pelvis. 30 s hard beats 2 min lazy." |
| 27 | Cable crunch | Abs | "Abs need load too." | "Round the spine. Elbows to the knees." |
| 28 | Pallof press | Core | "The anti-rotation core exercise." | "Press out. Don't let it twist you. 10 s hold." |
| 29 | Farmer's carry | Full body | "Grip, core, traps in one move." | "Heavy. Tall. 40 m. Don't shrug." |
| 30 | Kettlebell swing | Posterior chain | "Swings are a hinge, not a squat." | "Hips snap. Arms are ropes. Chest height only." |

## Budget

| Item | Credits |
| --- | --- |
| Keyframe (nano_banana_pro) | 2 |
| Clip, Kling 3.0 pro, 8 s, silent | 14 |
| Per short, one take | 16 |
| Per short with a wrong-form clip | 32 |
| Pilot batch of 6 | ~96 |
| Next 24 at one take each | ~384 |

At the current balance you can produce the full 30-short library with a
second take on about ten of them. Buy credits before adding wrong-form
clips to every short.

## Pilot assets (Higgsfield, generated 10 September 2026)

All six clips: Kling 3.0 pro, 9:16, 8 s, silent, from the nano_banana_pro
keyframe. Open them in the Higgsfield library (Generations) or from these
links, then drop them into the CapCut template above.

| # | Exercise | Keyframe job | Clip job | Clip |
| --- | --- | --- | --- | --- |
| 1 | Bench press | `76f44f6a-57d4-46fe-98bc-ae52cf854457` | `6bafbc47-53bd-4054-86e8-23336e65b728` | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091339_6bafbc47-53bd-4054-86e8-23336e65b728.mp4 |
| 2 | Bent-over row | `097aaadf-1ef2-412e-bb0f-bc06e0ca0f75` | `5dba85c2-8eda-443b-8c34-b52d4c73c553` | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091400_5dba85c2-8eda-443b-8c34-b52d4c73c553.mp4 |
| 3 | Back squat | `b2da158d-e49f-4872-987a-29ee3957061c` | `cb9e0693-4bf3-4339-9f97-52dc9ec056cc` | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091339_cb9e0693-4bf3-4339-9f97-52dc9ec056cc.mp4 |
| 4 | Lateral raise | `69899166-bfe6-4fb3-b062-71f19b33adbb` | `1e1de46d-e60a-485a-947c-afa3373b1802` | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091339_1e1de46d-e60a-485a-947c-afa3373b1802.mp4 |
| 5 | Hammer curl | `14aecd0d-ae7a-43b9-93b4-2536da824886` | `5388e106-7b9a-4048-befe-241190134a92` | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091339_5388e106-7b9a-4048-befe-241190134a92.mp4 |
| 6 | Hanging leg raise | `1afaae02-d9f5-4a9e-9715-c276a29bad6f` | `dd35150c-f309-4648-bc1c-a8a7b73ba485` | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091340_dd35150c-f309-4648-bc1c-a8a7b73ba485.mp4 |

Keyframe PNGs use the same base URL with `hf_20260910_091006_<keyframe job>.png`.
Review each clip for limb glitches before use; regenerate any bad take with
the same keyframe and prompt (14 credits).
