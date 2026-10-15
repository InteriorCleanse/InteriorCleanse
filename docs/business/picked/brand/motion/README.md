# The Picked sting

`picked-sting-1080x1920.mp4`: 3.6 seconds, 1080 × 1920, 30 fps, silent.
The crown drops in, the leaf sprouts, the cut strawberry pops up, the fruit
sticker slaps on, and the line lands: "The fruit is in it."

**Use it** as the last 3 seconds of a TikTok, Reel or Short. Never as an
intro: the first 2 seconds belong to the hook (`marketing/TIKTOK.md`). Add sound in the app from the commercial
library; the file has no audio so it never carries a licensing problem.

`picked-sting-end-frame.png` is the final frame, for thumbnails and covers.

Rebuild after any brand change: from `brand/src/`, run `python3 sting.py`,
then `node render_sting.js` (needs Playwright and ffmpeg). It steps through
the animation one frame at a time, so the timing is exact on any machine.
