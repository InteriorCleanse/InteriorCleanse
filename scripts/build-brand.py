#!/usr/bin/env python3
"""
Derives the InteriorCleanse logo system from the master artwork.

The master is 1254x1254 black line art on white. Everything the site needs is
cut from it here rather than by hand, so re-running this after a master update
regenerates the whole set consistently.

Two rules shape the output:

1. The site is dark (#0A0A0A), so every asset ships in a bone-on-dark variant
   as well as the original ink-on-light. The inversion is done on luminance,
   not by a hue shift, so the pencil shading survives.
2. Nothing smaller than ~64px uses the raster. The rose and vase are fine
   graphite work and turn to mud at favicon size — small marks come from the
   hand-authored SVG instead.

Usage: python3 scripts/build-brand.py
"""

from PIL import Image, ImageOps
import os

SRC = 'source-assets/interior-cleanse-logo-master-original.png'
BRAND = 'public/brand'
IMAGES = 'public/images'

# Regions measured off the 1254x1254 master, as (left, top, right, bottom).
REGIONS = {
    # Vase + rose + flowing C, above the wordmark.
    'symbol': (300, 40, 1000, 880),
    # The spaced serif INTERIOR CLEANSE wordmark.
    'wordmark': (110, 880, 1140, 970),
    # The compact horizontal lockup at the foot of the master.
    'lockup': (330, 1020, 920, 1200),
}

BONE = (247, 244, 239)
INK = (28, 26, 23)


def load():
    im = Image.open(SRC).convert('RGBA')
    # The master has a white field; flatten onto white so crops are predictable.
    flat = Image.new('RGBA', im.size, (255, 255, 255, 255))
    flat.alpha_composite(im)
    return flat.convert('RGB')


def to_alpha(im):
    """White field → transparent; ink → opaque. Keeps anti-aliased edges."""
    g = im.convert('L')
    # Luminance inverted becomes coverage: black ink = full alpha.
    alpha = ImageOps.invert(g)
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.putalpha(alpha)
    return out


def tint(mask, rgb):
    """Paints a coverage mask in a flat colour."""
    solid = Image.new('RGBA', mask.size, rgb + (255,))
    solid.putalpha(mask.getchannel('A'))
    return solid


def save(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)
    kb = os.path.getsize(path) / 1024
    print(f'  {path:<52} {im.size[0]}x{im.size[1]}  {kb:6.1f} KB')


def main():
    master = load()
    print('Brand assets:')

    # Canonical master under its proper name.
    save(master, f'{BRAND}/interior-cleanse-logo-master.png')

    for name, box in REGIONS.items():
        crop = master.crop(box)
        mask = to_alpha(crop)
        save(tint(mask, INK), f'{BRAND}/{name}-light.png')
        save(tint(mask, BONE), f'{BRAND}/{name}-dark.png')

    # Header lockup, sized for a 72px header at 2x.
    lock = Image.open(f'{BRAND}/lockup-dark.png')
    ratio = lock.size[0] / lock.size[1]
    h = 88
    save(lock.resize((int(h * ratio), h), Image.LANCZOS), f'{BRAND}/header-lockup-dark.png')
    lockl = Image.open(f'{BRAND}/lockup-light.png')
    save(lockl.resize((int(h * ratio), h), Image.LANCZOS), f'{BRAND}/header-lockup-light.png')

    # Apple touch icon: bone mark on the brand charcoal, 180x180 with padding.
    sym = Image.open(f'{BRAND}/symbol-dark.png')
    touch = Image.new('RGBA', (180, 180), INK + (255,))
    s = sym.copy()
    s.thumbnail((132, 132), Image.LANCZOS)
    touch.alpha_composite(s, ((180 - s.size[0]) // 2, (180 - s.size[1]) // 2))
    save(touch.convert('RGB'), f'{IMAGES}/apple-touch-icon.png')

    # Open Graph card: 1200x630, charcoal field, lockup centred.
    og = Image.new('RGBA', (1200, 630), INK + (255,))
    l = Image.open(f'{BRAND}/lockup-dark.png')
    l.thumbnail((760, 320), Image.LANCZOS)
    og.alpha_composite(l, ((1200 - l.size[0]) // 2, (630 - l.size[1]) // 2))
    save(og.convert('RGB'), f'{IMAGES}/og-image.png')

    print('\nNote: favicon.ico is built from brand/flowing-c.svg, not from this')
    print('raster — the rose and vase do not survive below ~48px.')


if __name__ == '__main__':
    main()
