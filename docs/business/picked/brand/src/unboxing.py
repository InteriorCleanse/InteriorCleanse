"""Picked unboxing: the mailer box faces and the insert card.

The box is the first Picked thing a buyer touches, so it carries the whole
system: the green crown on the lid, the fruit stand of cut fruit, and the
fruit sticker used as the seal. Inside the lid, the Lot Book QR.

Sizes are in pixels at 100 px per inch: a 10 x 7 x 3 in mailer that fits one
pouch, and a 5 x 7 in insert card. The packaging supplier's dieline sets the
final size, bleed and glue flaps. Concept art until the first run.

Writes brand/unboxing/*.svg. Run from the folder that holds the fonts (see README.md).
"""
import io, contextlib, os, re
with contextlib.redirect_stdout(io.StringIO()):
    import pouch as P
    import device as D
from textpath import path as T, width as TW

B, F5, F7 = 'brico800.ttf', 'franklin500.ttf', 'franklin700.ttf'
INK, CREAM, DEEP, SPROUT, LEAF = '#1E1A17', '#FFF7EC', '#1F4D2C', '#9BD36A', '#2F7D3A'
STRAW, MANGO, RASP = '#F0505E', '#FFB01F', '#B8185A'
OUT = os.path.join(P.OUT, 'unboxing')
LOT_URL = 'https://pickedprotein.com/lots/'


def svg(w, h, body, label, defs=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="{label}">'
            f'{defs}{body}</svg>')


def crown(w, y, tips=None, deep=34, shallow=22):
    """The crown's lower edge, leaf tips hanging down, for any width."""
    tips = tips or max(3, round(w / 86))
    step = w / tips
    d = f'M0 0 H{w} V{y} '
    for i in range(tips, 0, -1):
        x1 = i * step; xm = x1 - step / 2; x0 = x1 - step
        dep = deep if i % 2 else shallow
        d += (f'C{x1 - step*.15:.1f} {y} {xm + step*.12:.1f} {y + dep*.55:.1f} {xm:.1f} {y + dep} '
              f'C{xm - step*.12:.1f} {y + dep*.55:.1f} {x0 + step*.15:.1f} {y} {x0:.1f} {y} ')
    return f'<path d="{d}Z" fill="{DEEP}"/>'


def qr(x, y, size):
    import segno
    m = [list(r) for r in segno.make(LOT_URL, error='q', boost_error=False).matrix]
    q = 2; n = len(m) + 2*q; u = size / n; d = []
    for r, row in enumerate(m):
        c = 0
        while c < len(row):
            if row[c]:
                s = c
                while c < len(row) and row[c]: c += 1
                d.append(f'M{x+(s+q)*u:.2f} {y+(r+q)*u:.2f}h{(c-s)*u:.2f}v{u:.2f}h{-(c-s)*u:.2f}z')
            else:
                c += 1
    return f'<rect x="{x}" y="{y}" width="{size}" height="{size}" rx="{size*.06:.1f}" fill="#fff"/><path d="{"".join(d)}" fill="{INK}"/>'


# ---------------------------------------------------------------- box faces
def lid():
    """Box top, 1000 x 700: crown, wordmark, the line, and a fruit stand along the bottom."""
    w, h = 1000, 700
    L = [f'<rect width="{w}" height="{h}" fill="{CREAM}"/>']
    # fruit stand: three cut fruits on their halos, bleeding off the bottom edge
    for cx, col, art in ((610, '#FFD3D9', D.strawberry_half(610, 640, 0.9)),
                         (775, '#FFF0C7', D.mango_cheek(782, 640, 0.72, cid='lidm')),
                         (930, '#F9C6DA', D.raspberry_lemon_cut(925, 650, 0.85))):
        L.append(f'<circle cx="{cx}" cy="660" r="150" fill="{col}"/>')
        L.append(art)
    L.append(crown(w, 170, tips=12))
    L.append(P.wordmark(60, 34, 250, CREAM, SPROUT))
    L.append(T('REAL FRUIT PROTEIN DRINK MIX', F7, 64, 140, 15, CREAM, 3.2))
    L.append(T('The fruit', B, 60, 330, 112, INK, -4.2))
    L.append(T('is in it.', B, 60, 440, 112, LEAF, -4.2))
    L.append(T('pickedprotein.com', F7, 64, 640, 20, INK, 1.2))
    return svg(w, h, f'<defs><clipPath id="lidc"><rect width="{w}" height="{h}"/></clipPath></defs><g clip-path="url(#lidc)">{"".join(L)}</g>',
               'Picked mailer box lid, concept')


def front():
    """Front face, 1000 x 300: green, with the sticker seal hanging over the top edge."""
    w, h = 1000, 300
    L = [f'<rect width="{w}" height="{h}" fill="{DEEP}"/>',
         T('EVERY LOT TESTED  ·  RESULTS ONLINE  ·  PICKEDPROTEIN.COM/LOTS', F7, w/2, 262, 16, CREAM, 3, 'middle')]
    return svg(w, h, ''.join(L), 'Picked mailer box front, concept')


def side():
    """Side face, 700 x 300: the three fruit colors as crate bands."""
    w, h = 700, 300
    band = w / 3
    L = [f'<rect x="{i*band:.1f}" width="{band+1:.1f}" height="{h}" fill="{c}"/>' for i, c in enumerate((STRAW, MANGO, RASP))]
    L.append(crown(w, 70, tips=8, deep=20, shallow=12))
    labels = (('STRAWBERRY', INK), ('MANGO', INK), ('RASPBERRY LEMON', CREAM))
    for i, (t, c) in enumerate(labels):
        sz = 17 if len(t) < 12 else 14
        L.append(T(t, F7, i*band + band/2, 200, sz, c, 2.6, 'middle'))
    return svg(w, h, ''.join(L), 'Picked mailer box side, concept')


def inside():
    """Inside of the lid, 1000 x 700: strawberry field, a thank-you, the Lot Book QR."""
    w, h = 1000, 700
    L = [f'<rect width="{w}" height="{h}" fill="{STRAW}"/>',
         f'<circle cx="840" cy="250" r="230" fill="#FFD3D9" opacity=".55"/>',
         D.strawberry_half(840, 260, 1.15),
         T('You got in line.', B, 60, 150, 76, INK, -2.6),
         T('Here’s the fruit.', B, 60, 236, 76, INK, -2.6)]
    L.append(f'<rect x="60" y="430" width="560" height="210" rx="22" fill="{CREAM}"/>')
    L.append(qr(84, 452, 166))
    L.append(T('Check your lot.', B, 278, 500, 34, INK, -1))
    for i, s in enumerate(('The lot number is on the back of', 'your pouch. Scan for its lab results:', 'heavy metals, microbiology, protein.')):
        L.append(T(s, F5, 278, 540 + i*26, 19, INK))
    return svg(w, h, ''.join(L), 'Inside of the Picked mailer lid, concept')


# ---------------------------------------------------------------- insert card
def card_front():
    """5 x 7 in, 1000 x 1400. The founder's note is theirs to write: left as a bracket."""
    w, h = 1000, 1400
    L = [f'<rect width="{w}" height="{h}" fill="{CREAM}"/>', crown(w, 260, tips=11)]
    L.append(P.wordmark(80, 70, 300, CREAM, SPROUT))
    L.append(T('Lot 001.', B, 80, 470, 120, INK, -4.6))
    L.append(T('You were in line for it.', B, 84, 560, 58, LEAF, -1.8))
    L.append(f'<rect x="80" y="650" width="840" height="430" rx="20" fill="none" stroke="{INK}" stroke-opacity=".35" stroke-width="3" stroke-dasharray="10 10"/>')
    for i, s in enumerate(('[Your note to the first buyers, in your own words.', 'Under 60 words. Write it by hand if you can:', 'a handwritten card is the part people photograph.]')):
        L.append(T(s, F5, 120, 740 + i*44, 30, '#5A514A'))
    L.append(T('[Your name], founder', F7, 120, 1020, 30, INK))
    # by the time a box ships the number is real: the sticker carries it
    L.append(D.sticker('strawberry', w=330, h=220, x=600, y=1110, rot=-8, standalone=False, lot='LOT 001'))
    return svg(w, h, ''.join(L), 'Picked insert card front, concept')


def card_back():
    w, h = 1000, 1400
    L = [f'<rect width="{w}" height="{h}" fill="{DEEP}"/>']
    L.append(T('How to drink it', B, 80, 170, 78, CREAM, -2.6))
    steps = (('1', 'One scoop, [x] oz of cold water.'),
             ('2', 'Shake for ten seconds.'),
             ('3', 'Cloudy on purpose. That’s the fruit.'))
    for i, (n, s) in enumerate(steps):
        y = 290 + i*110
        L.append(f'<circle cx="118" cy="{y-14}" r="38" fill="{SPROUT}"/>')
        L.append(T(n, B, 118, y + 2, 44, DEEP, 0, 'middle'))
        L.append(T(s, F7, 186, y, 36, CREAM))
    L.append(f'<rect x="80" y="660" width="840" height="300" rx="24" fill="{CREAM}"/>')
    L.append(qr(110, 690, 240))
    L.append(T('Check your lot.', B, 390, 760, 46, INK, -1.4))
    for i, s in enumerate(('The lot number is on the back', 'of the pouch. Its lab results', 'are at pickedprotein.com/lots.')):
        L.append(T(s, F5, 390, 812 + i*36, 27, INK))
    L.append(T('Tell us the truth.', B, 80, 1080, 54, CREAM, -1.6))
    for i, s in enumerate(('Reply to any email from us, or write to hello@pickedprotein.com.',
                           'First Picks vote on the next flavor before anyone else.')):
        L.append(T(s, F5, 80, 1140 + i*44, 27, '#E9E1D3'))
    L.append(T('The fruit is in it.', B, 80, 1320, 44, SPROUT, -1.2))
    return svg(w, h, ''.join(L), 'Picked insert card back, concept')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    rnd = lambda t: re.sub(r'(\d+\.\d)\d+', r'\1', t)   # one decimal is plenty at 100 px per inch
    for name, fn in (('mailer-lid', lid), ('mailer-front', front), ('mailer-side', side), ('mailer-inside', inside),
                     ('insert-card-front', card_front), ('insert-card-back', card_back)):
        open(os.path.join(OUT, f'{name}.svg'), 'w').write(rnd(fn()))
    print('ok')
