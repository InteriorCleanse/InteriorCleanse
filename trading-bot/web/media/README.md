# Media

Optional ambient media for the app's backdrop. The app runs without it: if
these files are missing, the backdrop falls back to the drawn gold light.

| File | What | Made with |
|---|---|---|
| `hero.mp4` | 8-second seamless loop, 1920×1080, no audio: molten champagne gold on black obsidian | Higgsfield, Seedance 2.0 (job `a471857e-0a81-4c6e-8b68-528b536b37f7`) |
| `hero.jpg` | The poster frame shown before the video plays and to anyone who prefers reduced motion | Higgsfield, GPT Image 2.5 (job `777b0b33-b17f-4d9f-8ada-a4c44f600e12`) |

To install them, download both from your Higgsfield library (Generations),
save them here with exactly these names, and reload the app. Keep `hero.mp4`
under about 8 MB; the page plays it muted, looped, dimmed, and pauses it when
the tab is hidden or the device asks for reduced motion.

The files are served by `GET /media/<name>` from this folder only (see
`src/server.ts`), with byte ranges so Safari can play the video.
