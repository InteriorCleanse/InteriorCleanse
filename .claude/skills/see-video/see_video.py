#!/usr/bin/env python3
"""
SEE A VIDEO: turn any video into something Claude can actually look at.

    python3 see_video.py <youtube-url-or-local-file> [--every 5] [--cols 4]

Claude reads a transcript and misses everything the transcript does not say: what
is on screen, which button was clicked, what the chart showed, whether the person
is lying. This extracts frames and lays them out as CONTACT SHEETS with a
timestamp burned under each one, so Claude can flip through the whole video and
still quote the exact second something happened.

WHY CONTACT SHEETS AND NOT FRAMES. A 30 minute video at one frame a second is
1,800 images. No agent can hold that. Tiled 16-to-a-sheet it is 113 images, and
at one frame every 5 seconds it is 23. That is the whole trick: the sheet is what
makes a long video fit.

DEPENDENCIES, deliberately minimal:
    yt-dlp      only if you pass a URL
    ffmpeg      only `-r` and `scale`, no fps/tile/select/drawtext filters, so it
                works with cut-down builds that lack them
    pillow      the tiling and the timestamps

Source: the "Claude's Eyes" guide, transcribed as published. Local changes are
marked `# local:`: frame timing (the guide's labels ran one slot late) and
the timestamp font search beyond macOS.
"""
import argparse
import glob
import json
import os
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont


def sh(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)


def find(name, extra=()):
    p = shutil.which(name)
    if p:
        return p
    for c in extra:
        for g in glob.glob(os.path.expanduser(c)):
            return g
    return None


FFMPEG = find('ffmpeg', ('~/Downloads/brand-system/node_modules/@remotion/compositor-*/ffmpeg',))
YTDLP = find('yt-dlp', ('~/.local/bin/yt-dlp',))

# local: the guide only tried the macOS Arial path, which leaves Linux (and so
# every cloud session) with Pillow's tiny bitmap font. Try common bold fonts on
# each platform first, then fall back exactly as the guide does.
FONT_CANDIDATES = (
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
)


def env():
    e = dict(os.environ)
    if FFMPEG and 'compositor' in FFMPEG:
        e['DYLD_LIBRARY_PATH'] = os.path.dirname(FFMPEG)
    return e


def fetch(url, out):
    """Download the video AND its subtitles if any exist."""
    if not YTDLP:
        sys.exit('yt-dlp not found. pip install -U yt-dlp')
    sh([YTDLP, '-f', 'bv*[height<=720]+ba/b[height<=720]/b',
        '--write-auto-subs', '--write-subs', '--sub-langs', 'en.*',
        '--convert-subs', 'srt', '-o', os.path.join(out, 'video.%(ext)s'), url])
    vids = [f for f in glob.glob(os.path.join(out, 'video.*'))
            if not f.endswith(('.srt', '.vtt'))]
    if not vids:
        sys.exit('download produced no video')
    return vids[0]


def duration(path):
    p = subprocess.run([FFMPEG, '-i', path], capture_output=True, text=True, env=env())
    for line in p.stderr.splitlines():
        if 'Duration:' in line:
            h, m, s = line.split('Duration:')[1].split(',')[0].strip().split(':')
            return int(h) * 3600 + int(m) * 60 + float(s)
    return 0.0


def frames(path, out, every, width):
    """One frame every `every` seconds.

    local: the guide used `-r 1/{every}` as an output rate. On ffmpeg 6 that
    emits the opening frame twice, so every label after 00:00 lands one slot
    (`every` seconds) late. Seeking to each timestamp instead makes the label
    true by construction and still needs no fps/select filter, so cut-down
    builds keep working. The guide's `-r` pass stays as the fallback for when
    the duration cannot be read."""
    d = os.path.join(out, 'frames')
    os.makedirs(d, exist_ok=True)
    total = duration(path)
    if total <= 0:
        sh([FFMPEG, '-v', 'error', '-y', '-i', path,
            '-r', f'1/{every}', '-vf', f'scale={width}:-2',
            os.path.join(d, 'f%05d.png')], env=env())
        return sorted(glob.glob(os.path.join(d, 'f*.png')))
    made = []
    k = 0
    while k * every < total:
        f = os.path.join(d, f'f{k + 1:05d}.png')
        try:
            sh([FFMPEG, '-v', 'error', '-y', '-ss', f'{k * every:.3f}', '-i', path,
                '-frames:v', '1', '-vf', f'scale={width}:-2', f], env=env())
        except subprocess.CalledProcessError:
            pass
        if not os.path.exists(f):
            break  # seeked past the last decodable frame
        made.append(f)
        k += 1
    return made


def label_font():
    for path in FONT_CANDIDATES:  # local: see FONT_CANDIDATES
        try:
            return ImageFont.truetype(path, 22)
        except OSError:
            continue
    return ImageFont.load_default()


def sheets(files, out, every, cols, rows):
    """Tile into contact sheets, each frame labelled with its timestamp."""
    os.makedirs(out, exist_ok=True)
    font = label_font()
    per = cols * rows
    made = []
    for s in range(0, len(files), per):
        chunk = files[s:s + per]
        w, h = Image.open(chunk[0]).size
        bar = 30
        # only as many ROWS as this chunk actually fills. A part-full sheet used
        # to pad out with dead black, and an agent pays for those pixels.
        used = -(-len(chunk) // cols)
        sheet = Image.new('RGB', (cols * w, used * (h + bar)), (18, 17, 20))
        draw = ImageDraw.Draw(sheet)
        for i, f in enumerate(chunk):
            x, y = (i % cols) * w, (i // cols) * (h + bar)
            sheet.paste(Image.open(f), (x, y))
            t = (s + i) * every
            draw.text((x + 8, y + h + 4), f'{int(t)//60:02d}:{int(t)%60:02d}',
                      fill=(255, 182, 142), font=font)
        p = os.path.join(out, f'sheet{s//per:03d}.png')
        sheet.save(p, optimize=True)
        made.append(p)
    return made


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('target')
    ap.add_argument('--every', type=float, default=5, help='seconds between frames')
    ap.add_argument('--cols', type=int, default=4)
    ap.add_argument('--rows', type=int, default=4)
    ap.add_argument('--width', type=int, default=480, help='px per frame')
    ap.add_argument('--out', default='eyes_out')
    a = ap.parse_args()

    if not FFMPEG:
        sys.exit('ffmpeg not found. brew install ffmpeg')
    os.makedirs(a.out, exist_ok=True)

    if a.target.startswith(('http://', 'https://')):
        print('downloading...')
        video = fetch(a.target, a.out)
    else:
        video = a.target

    print(f'extracting 1 frame every {a.every}s...')
    fs = frames(video, a.out, a.every, a.width)
    # trust the frames over the header when they disagree
    dur = max(duration(video), (len(fs) - 1) * a.every)
    sh_dir = os.path.join(a.out, 'sheets')
    made = sheets(fs, sh_dir, a.every, a.cols, a.rows)

    srt = glob.glob(os.path.join(a.out, '*.srt'))
    meta = {'video': video, 'duration_s': round(dur, 1), 'frames': len(fs),
            'sheets': made, 'seconds_per_frame': a.every,
            'frames_per_sheet': a.cols * a.rows,
            'transcript': srt[0] if srt else None}
    json.dump(meta, open(os.path.join(a.out, 'eyes.json'), 'w'), indent=1)

    print(f'\n  {dur/60:.1f} min video -> {len(fs)} frames -> {len(made)} contact sheets')
    print(f'  transcript: {srt[0] if srt else "none found"}')
    print(f'  read these: {sh_dir}/sheet*.png')


if __name__ == '__main__':
    main()
