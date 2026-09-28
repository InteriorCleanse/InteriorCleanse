---
name: see-video
description: Use when the user wants Claude to actually WATCH a video rather than read its transcript , analysing a YouTube video, breaking down a competitor's edit, checking what is on screen at a moment, reverse-engineering a UI demo, or any request where the visuals carry the meaning. Triggers on "watch this video", "what happens in this video", "break down this video", "analyse this reel", a bare YouTube URL, or a local video file.
---

# See a video

Claude reads transcripts. A transcript is the words and nothing else: not what was
on screen, not which button was clicked, not what the chart showed, not the cut
rhythm. For a lot of video that is most of the content.

This turns a video into **contact sheets**, grids of timestamped frames, which
Claude can read directly, alongside the transcript if one exists.

## Run it

The script sits next to this file. From the repository root:

```bash
S=.claude/skills/see-video/see_video.py
python3 $S <url-or-file> --out "${TMPDIR:-/tmp}/eyes_out"              # 1 frame / 5s, 4x4 sheets
python3 $S <url-or-file> --every 2 --out "${TMPDIR:-/tmp}/eyes_out"    # denser, for fast cuts
python3 $S <url-or-file> --every 15 --out "${TMPDIR:-/tmp}/eyes_out"   # sparser, for a long talk
```

Always pass `--out` to a scratch or temp directory. The default `eyes_out/`
lands in the current directory; it is gitignored here, but downloaded videos
do not belong in a repository.

Then READ the sheets it prints, in order, and the `.srt` if one was found. Each
frame is labelled `mm:ss`, so cite times from the labels rather than guessing.

## Choosing `--every`

This is the only decision that matters, and it is a token budget, not a quality
dial. Frames per sheet is 16 by default.

| video | `--every` | 30 min becomes |
|---|---|---|
| talking head, slides | 15 | 120 frames, 8 sheets |
| tutorial, screen recording | 5 | 360 frames, 23 sheets |
| fast-cut edit, reel | 2 | 900 frames, 57 sheets |

Start sparse. Re-run denser on the range that matters instead of paying for
density across the whole thing.

## This skill or `/watch`

Both are installed. Reach for **see-video** on long videos, where sixteen frames
to an image is what makes the whole thing fit. Reach for **`/watch`** on short
clips or a specific moment (`--start`/`--end`), or when a video has no captions
and a Whisper key is set, since `/watch` can transcribe audio and this cannot.

## What it does NOT do

- **It samples. It does not see every frame.** At `--every 5` a 3-frame flash
  between samples is invisible. If a claim depends on one exact moment, re-run
  that section dense.
- **It has no audio.** Tone, music and emphasis are in the transcript at best.
- **Frames cost tokens even though decoding is free.** The decode is local and
  costs nothing; reading the sheets is the expense. That is what `--every` buys.

## Requirements

`yt-dlp` for URLs, `ffmpeg` for frames, `pillow` for the sheets. Only `-r` and
`scale` are used from ffmpeg, no `fps`/`tile`/`select`/`drawtext` filters, so
cut-down builds work.

⛔ **YouTube may demand a PO token or cookies** and fail with "Sign in to confirm
you're not a bot". Then: `yt-dlp --cookies-from-browser chrome <url>`. This is
YouTube's anti-bot, not a bug in the script, and it comes and goes.

⛔ **In a Claude Code cloud session** the environment's network policy decides
which sites yt-dlp can reach. Instagram, TikTok and similar hosts are denied by
default and fail with a proxy `403`. Allow the host in the environment's
network settings, or hand the script a local file instead.

Download what you are allowed to. Your own uploads, research, and anything
licensed that way are fine. Someone else's video is still theirs.
