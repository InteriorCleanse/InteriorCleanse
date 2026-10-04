"""Picked pouch fronts, v2: the pack is the fruit.

Each pouch is the fruit's color with a deep-green leafy crown on top, so a
strawberry pouch reads as a strawberry from across a store. The fruit sticker
carries the grams, the cut fruit shows what's inside, and the flavor is named
plainly: "Strawberry, from strawberries."

Concept art: every bracketed value waits for the final formula and label review.
Run after wordmark.py (it reads wordpath.txt). Writes brand/pouch-<flavor>.svg.
"""
import io, contextlib
with contextlib.redirect_stdout(io.StringIO()):
    import pouch as P
    import device as D
from textpath import path as T, width as TW

B, F7, F5 = 'brico800.ttf', 'franklin700.ttf', 'franklin500.ttf'
INK, CREAM, DEEP, SPROUT = '#1E1A17', '#FFF7EC', '#1F4D2C', '#9BD36A'

FLAVORS = {
    # key: (name, from-line, body color, shade, ink on body, fruit drawing, fruit placement)
    'strawberry': ('Strawberry,', 'from strawberries.', '#F0505E', '#D93A4A', INK, '#FFD3D9',
                   lambda: D.strawberry_half(456, 566, 0.92)),
    'mango': ('Mango,', 'from mangoes.', '#FFB01F', '#F29A0C', INK, '#FFF0C7',
              lambda: D.mango_cheek(462, 580, 0.86, cid='mcp')),
    'raspberry-lemon': ('Raspberry Lemon,', 'from raspberries and lemons.', '#B8185A', '#9C1049', CREAM, '#F9C6DA',
                        lambda: D.raspberry_lemon_cut(446, 584, 1.0)),
}

W, H = 600, 860
CROWN = 232

def crown_edge(y):
    """The crown's lower edge: seven leaf tips hanging down, like a calyx."""
    tips = 7; step = W / tips
    d = f'M0 0 H{W} V{y} '
    for i in range(tips, 0, -1):
        x1 = i * step; xm = x1 - step / 2; x0 = x1 - step
        depth = 34 if i % 2 else 22
        d += f'C{x1 - step*0.15:.1f} {y:.1f} {xm + step*0.12:.1f} {y + depth*0.55:.1f} {xm:.1f} {y + depth:.1f} '
        d += f'C{xm - step*0.12:.1f} {y + depth*0.55:.1f} {x0 + step*0.15:.1f} {y:.1f} {x0:.1f} {y:.1f} '
    return d + 'Z'

def pouch(key):
    name, sub, col, shade, ink, halo, fruit = FLAVORS[key]
    L = []
    L.append(f'<rect width="{W}" height="{H}" fill="{col}"/>')
    # cut fruit on a pale halo, bleeding off the right edge
    L.append(f'<circle cx="468" cy="566" r="196" fill="{halo}" opacity=".55"/>')
    L.append(fruit())
    # the leafy crown
    L.append(f'<path d="{crown_edge(CROWN)}" fill="{DEEP}"/>')
    L.append(f'<rect x="0" y="0" width="{W}" height="26" fill="#173B22"/>')            # seal
    L.append(f'<line x1="36" x2="{W-36}" y1="54" y2="54" stroke="{CREAM}" stroke-opacity=".28" stroke-width="2" stroke-dasharray="2 6"/>')  # zipper
    L.append(P.wordmark(56, 84, 300, CREAM, SPROUT))
    L.append(T('REAL FRUIT PROTEIN DRINK MIX', F7, 60, 198, 15, CREAM, 3.2))
    # flavor lockup
    big = 98
    tw = TW(name, B, big, -3)
    if tw > 500: big *= 500 / tw
    L.append(T(name, B, 54, 340, big, ink, -big * 0.03))
    sz = 30
    tw = TW(sub, F7, sz, -0.3)
    if tw > 470: sz *= 470 / tw
    L.append(T(sub, F7, 58, 340 + sz * 1.45, sz, ink, -0.3))
    # the fruit sticker, slapped on at an angle
    L.append(D.sticker(key, w=312, h=208, x=30, y=470, rot=-8, standalone=False))
    # claims row
    claims = '20g PROTEIN  ·  NO SUCRALOSE  ·  MIX WITH COLD WATER'
    cs = 14.5
    tw = TW(claims, F7, cs, 2)
    if tw > 500: cs *= 500 / tw
    L.append(f'<rect x="0" y="742" width="{W}" height="54" fill="{shade}"/>')
    L.append(T(claims, F7, W / 2, 775, cs, ink, cs * 0.14, 'middle'))
    L.append(f'<rect x="0" y="796" width="{W}" height="{H-796}" fill="{DEEP}"/>')
    L.append(T('DIETARY SUPPLEMENT  ·  20 SERVINGS  ·  NET WT [TBD]', F7, W / 2, 834, 12.5, CREAM, 2.4, 'middle'))
    # pouch volume: soft side shading
    L.append(f'<rect width="{W}" height="{H}" fill="url(#vol-{key})"/>')
    defs = (f'<defs><linearGradient id="vol-{key}" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".16"/>'
            f'<stop offset=".08" stop-color="#fff" stop-opacity=".10"/><stop offset=".22" stop-color="#fff" stop-opacity="0"/>'
            f'<stop offset=".9" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>'
            f'<clipPath id="pc-{key}"><rect width="{W}" height="{H}" rx="34"/></clipPath></defs>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" '
            f'aria-label="Picked {name.rstrip(",")} pouch, concept">{defs}<g clip-path="url(#pc-{key})">{"".join(L)}</g></svg>')

if __name__ == '__main__':
    for k in FLAVORS:
        open(f'{P.OUT}/pouch-{k}.svg', 'w').write(P.__dict__.get('rnd', lambda s: s)(pouch(k)))
    print('ok')
