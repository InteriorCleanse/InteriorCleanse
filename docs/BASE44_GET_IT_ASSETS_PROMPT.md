# Get-it — Asset Import Prompt for Base44

Paste everything below the rule into the Get-it project as one message.
The links are public CDN files from Higgsfield. If Base44 cannot fetch
external URLs, download each file in a browser and upload it through
Base44's file uploader instead; the table tells you where each one goes.

---

Import the following brand and content assets into Get-it. Create the
records exactly as tabled, download and store each file in the app's own
media storage (do not hot-link the source URLs), and then show me each
screen with the assets in place.

## 1. Logo (vector, final)

Save these two SVG files as the app's official logo assets and use them
everywhere the spec calls for the wordmark or the app icon. Do not redraw
or recolour them. The font is Bricolage Grotesque; load it from Google
Fonts so the wordmark renders correctly.

**Wordmark — `get-it-wordmark.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 520" width="1400" height="520" role="img" aria-label="Get-it">
  <defs>
    <radialGradient id="dotGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F5A623" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#F5A623" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1400" height="520" fill="#111214"/>
  <g font-family="'Space Grotesk','Manrope','Inter','Helvetica Neue',Arial,sans-serif" font-weight="700" font-size="300" letter-spacing="-4" fill="#F4F1EC">
    <text x="150" y="370">Get</text>
    <text x="905" y="370">ıt</text>
  </g>
  <!-- Ember tick: a rotated bar standing in for the hyphen -->
  <rect x="770" y="242" width="150" height="46" rx="4" fill="#FF5A1F" transform="rotate(-18 845 265)"/>
  <!-- Amber dot of the i, with a soft glow -->
  <circle cx="948" cy="120" r="68" fill="url(#dotGlow)"/>
  <circle cx="948" cy="120" r="30" fill="#F5A623"/>
</svg>
```

**App icon — `get-it-logo.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024" role="img" aria-label="Get-it app icon">
  <defs>
    <radialGradient id="dotGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F5A623" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#F5A623" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" rx="228" fill="#111214"/>
  <text x="150" y="742" font-family="'Space Grotesk','Manrope','Inter','Helvetica Neue',Arial,sans-serif" font-weight="700" font-size="640" fill="#F4F1EC">G</text>
  <!-- Ember tick tucked into the counter of the G -->
  <rect x="470" y="512" width="230" height="70" rx="6" fill="#FF5A1F" transform="rotate(-18 585 547)"/>
  <!-- Amber dot above the tick's tip -->
  <circle cx="720" cy="392" r="96" fill="url(#dotGlow)"/>
  <circle cx="720" cy="392" r="44" fill="#F5A623"/>
</svg>
```

Raster reference of the approved wordmark (for comparison only):
https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091349_6b8f6da8-a063-4434-b509-361b9357cb2d.png

## 2. Brand images

| Use | File |
| --- | --- |
| App icon concept, raster (compare against the SVG) | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091925_1da613d4-fcb2-4699-af31-cf33eea41b8d.png |
| Wordmark, refined dark version | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091925_a03cede7-341c-44af-a6e5-fa50192d3751.png |
| Wordmark, light version (Graphite on Bone) for light mode and email | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091925_6e61ae4d-cc7b-4976-b1b2-8b72cc91c10d.png |
| App Store screenshot mock-up (reference for the Today screen layout) | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091924_7462aad4-972f-4704-a28d-3bdedf631c36.png |

Store the light wordmark as `get-it-wordmark-light.png` and use it on Sand
backgrounds. Use the mock-up only as a layout reference; it is not a screen.

## 3. Coach shorts and exercise videos

Create six **CoachShort** records and attach each video to its matching
**Exercise** record as the exercise's demonstration video and poster frame.
If an exercise does not exist yet, create it with the muscle group shown.
Videos are 9:16, 8 seconds, silent, 1080 × 1920; posters are 9:16 PNG.

| # | Exercise | Muscle group | Hook (title) | Cue (caption) | Prescription | Video (MP4) | Poster (PNG) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Barbell bench press | Chest | Chest not growing? Start here. | Bar to lower chest. Elbows 45°. | 4 × 8 · Rest 120 s | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091339_6bafbc47-53bd-4054-86e8-23336e65b728.mp4 | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091006_76f44f6a-57d4-46fe-98bc-ae52cf854457.png |
| 2 | Bent-over barbell row | Back | Your rows are working your arms. | Pull to the hips, not the chest. Pause 1 s. | 4 × 10 · Rest 90 s | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091400_5dba85c2-8eda-443b-8c34-b52d4c73c553.mp4 | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091006_097aaadf-1ef2-412e-bb0f-bc06e0ca0f75.png |
| 3 | Barbell back squat | Legs | Depth builds legs. Half reps don't. | Hips to parallel. Knees track the toes. | 4 × 6 · Rest 150 s | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091339_cb9e0693-4bf3-4339-9f97-52dc9ec056cc.mp4 | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091006_b2da158d-e49f-4872-987a-29ee3957061c.png |
| 4 | Dumbbell lateral raise | Shoulders | Stop swinging your lateral raises. | Lead with the elbows. 2 s down. | 3 × 15 · Rest 60 s | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091339_1e1de46d-e60a-485a-947c-afa3373b1802.mp4 | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091006_69899166-bfe6-4fb3-b062-71f19b33adbb.png |
| 5 | Dumbbell hammer curl | Arms | The curl that builds thicker arms. | Elbows pinned. Squeeze at the top. | 3 × 12 · Rest 60 s | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091339_5388e106-7b9a-4048-befe-241190134a92.mp4 | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091006_14aecd0d-ae7a-43b9-93b4-2536da824886.png |
| 6 | Hanging leg raise | Core | Leg raises aren't working? Tilt. | Tuck the pelvis. Lift with the abs, not the hips. | 3 × 12 · Rest 75 s | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091340_dd35150c-f309-4648-bc1c-a8a7b73ba485.mp4 | https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260910_091006_1afaae02-d9f5-4a9e-9715-c276a29bad6f.png |

For each CoachShort set: `title` = hook, `caption` = cue, `prescription`
as shown, `muscle_group` as shown, `exercise` linked, `video` and `poster`
uploaded, `is_premium` = false for #1, #3 and #6 (free samples) and true
for the rest, `order` = the # column.

Poster frames double as the exercise thumbnails in the library and the
"Target a muscle" screen.

## 4. Then show me

1. The Coach feed with all six shorts playing inline, in order.
2. The Bench press exercise page with the video, poster, and the cue.
3. The Today screen header and the tab bar using the SVG wordmark and
   icon, in dark mode and in light mode.
