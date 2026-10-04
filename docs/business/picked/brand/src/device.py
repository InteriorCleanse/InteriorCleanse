"""Picked brand devices: the fruit sticker and the cut-fruit illustrations.

The fruit sticker borrows the oval label every piece of produce wears in a
store, and puts Picked's proof on it: the grams of real fruit per serving.
The cut-fruit drawings show each fruit sliced open, because the brand's whole
idea is showing what's inside.

Run from a folder holding brico800.ttf, franklin700.ttf and franklin500.ttf
(see README.md). Writes to brand/fruit/ and brand/sticker/.
"""
import math, os, io, contextlib
with contextlib.redirect_stdout(io.StringIO()):
    import pouch as P
from textpath import path as T, width as TW

B = 'brico800.ttf'; F7 = 'franklin700.ttf'; F5 = 'franklin500.ttf'
INK = '#1E1A17'; CREAM = '#FFF7EC'; LEAF = '#2F7D3A'; DEEP = '#1F4D2C'
OUT = P.OUT

def save(sub, name, svg):
    os.makedirs(f'{OUT}/{sub}', exist_ok=True)
    open(f'{OUT}/{sub}/{name}', 'w').write(svg)

def f(n): return f'{n:.1f}'

# ---------------------------------------------------------------- strawberry
def _berry(cx, cy, k):
    return (f'M{f(cx)} {f(cy-104*k)} '
            f'C{f(cx+52*k)} {f(cy-140*k)} {f(cx+150*k)} {f(cy-118*k)} {f(cx+140*k)} {f(cy-30*k)} '
            f'C{f(cx+130*k)} {f(cy+60*k)} {f(cx+56*k)} {f(cy+168*k)} {f(cx)} {f(cy+190*k)} '
            f'C{f(cx-56*k)} {f(cy+168*k)} {f(cx-130*k)} {f(cy+60*k)} {f(cx-140*k)} {f(cy-30*k)} '
            f'C{f(cx-150*k)} {f(cy-118*k)} {f(cx-52*k)} {f(cy-140*k)} {f(cx)} {f(cy-104*k)}Z')

def strawberry_half(cx=200, cy=240, s=1.0):
    """A strawberry cut lengthwise: red skin, coral flesh, a pale heart, and
    the fine threads that run from the heart out to every seed."""
    out = [f'<path d="{_berry(cx, cy, s)}" fill="#C81E3A"/>',
           f'<path d="{_berry(cx, cy+4*s, s*0.9)}" fill="#F0505E"/>',
           f'<path d="{_berry(cx, cy+14*s, s*0.6)}" fill="#F57C88"/>']
    # threads: symmetric fans from the heart to the rim
    for side in (-1, 1):
        for i, (y0, x1, y1) in enumerate([(-50, 112, -78), (-26, 124, -28), (0, 122, 22), (26, 110, 70), (52, 88, 112), (78, 58, 148)]):
            sx, sy = cx + side*12*s, cy + y0*s
            ex, ey = cx + side*x1*s, cy + y1*s
            mx, my = (sx+ex)/2 + side*4*s, (sy+ey)/2 - 14*s
            out.append(f'<path d="M{f(sx)} {f(sy)} Q{f(mx)} {f(my)} {f(ex)} {f(ey)}" stroke="#FFE3E6" '
                       f'stroke-width="{f(3.6*s)}" stroke-linecap="round" fill="none" opacity=".85"/>')
            out.append(f'<ellipse cx="{f(ex + side*7*s)}" cy="{f(ey)}" rx="{f(4.2*s)}" ry="{f(6.8*s)}" fill="#FFE9A8" '
                       f'transform="rotate({f(side*(70 - i*14))} {f(ex + side*7*s)} {f(ey)})"/>')
    # the pale heart
    out.append(f'<path d="M{f(cx)} {f(cy-78*s)} C{f(cx+30*s)} {f(cy-60*s)} {f(cx+26*s)} {f(cy+70*s)} {f(cx)} {f(cy+128*s)} '
               f'C{f(cx-26*s)} {f(cy+70*s)} {f(cx-30*s)} {f(cy-60*s)} {f(cx)} {f(cy-78*s)}Z" fill="#FFE3E6"/>')
    out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy-6*s)}" rx="{f(6*s)}" ry="{f(44*s)}" fill="#FFF4F5"/>')
    # calyx: a flat star of sepals, then the stem
    for ang in (-78, -46, -16, 16, 46, 78):
        a = math.radians(ang - 90)
        ln = (64 if abs(ang) > 40 else 52)*s
        x0, y0 = cx, cy - 108*s
        x1, y1 = x0 + math.cos(a)*ln, y0 + math.sin(a)*ln*0.62
        nx, ny = -math.sin(a)*11*s, math.cos(a)*11*s
        out.append(f'<path d="M{f(x0-nx*0.6)} {f(y0-ny*0.3)} Q{f((x0+x1)/2+nx)} {f((y0+y1)/2+ny)} {f(x1)} {f(y1)} '
                   f'Q{f((x0+x1)/2-nx)} {f((y0+y1)/2-ny)} {f(x0+nx*0.6)} {f(y0+ny*0.3)}Z" fill="{LEAF}"/>')
    out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy-108*s)}" rx="{f(22*s)}" ry="{f(9*s)}" fill="{DEEP}"/>')
    out.append(f'<path d="M{f(cx)} {f(cy-112*s)} q{f(2*s)} {f(-30*s)} {f(18*s)} {f(-46*s)}" stroke="{DEEP}" stroke-width="{f(9*s)}" stroke-linecap="round" fill="none"/>')
    return ''.join(out)

# ---------------------------------------------------------------- mango
def mango_cheek(cx=200, cy=236, s=1.0, cid='mc'):
    """A mango cheek, cut from the stone and scored in diamonds."""
    def cheek(k, dx=0, dy=0):
        x, y = cx + dx, cy + dy
        return (f'M{f(x-20*k)} {f(y-150*k)} '
                f'C{f(x+90*k)} {f(y-160*k)} {f(x+150*k)} {f(y-40*k)} {f(x+128*k)} {f(y+60*k)} '
                f'C{f(x+104*k)} {f(y+160*k)} {f(x-30*k)} {f(y+190*k)} {f(x-104*k)} {f(y+120*k)} '
                f'C{f(x-170*k)} {f(y+56*k)} {f(x-140*k)} {f(y-140*k)} {f(x-20*k)} {f(y-150*k)}Z')
    out = [f'<defs><clipPath id="{cid}"><path d="{cheek(s*0.9, 4*s, 6*s)}"/></clipPath></defs>',
           f'<path d="{cheek(s)}" fill="#7DA62E"/>',
                      f'<path d="{cheek(s*0.95, 2*s, 3*s)}" fill="#F08A24"/>',
           f'<path d="{cheek(s*0.9, 4*s, 6*s)}" fill="#FFB01F"/>',
           f'<g clip-path="url(#{cid})" stroke="#E8890B" stroke-width="{f(5*s)}" stroke-linecap="round">']
    step = 46*s
    for i in range(-8, 9):
        o = i*step
        out.append(f'<line x1="{f(cx+o-260*s)}" y1="{f(cy-260*s)}" x2="{f(cx+o+260*s)}" y2="{f(cy+260*s)}"/>')
        out.append(f'<line x1="{f(cx+o+260*s)}" y1="{f(cy-260*s)}" x2="{f(cx+o-260*s)}" y2="{f(cy+260*s)}"/>')
    out.append('</g>')
    # soft highlight on the flesh
    out.append(f'<path d="M{f(cx-90*s)} {f(cy-40*s)} C{f(cx-92*s)} {f(cy-100*s)} {f(cx-50*s)} {f(cy-128*s)} {f(cx-6*s)} {f(cy-128*s)}" '
               f'stroke="#FFD27A" stroke-width="{f(12*s)}" stroke-linecap="round" fill="none"/>')
    defs = out.pop(0)
    return defs + f'<g transform="rotate(-78 {f(cx)} {f(cy)})">' + ''.join(out) + '</g>'

# ---------------------------------------------------------------- raspberry + lemon
def lemon_wheel(cx, cy, r):
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="#F2C513"/>',
           f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r*0.9)}" fill="#FFF6C9"/>']
    n = 10
    for i in range(n):
        a0 = 2*math.pi*i/n + 0.06; a1 = 2*math.pi*(i+1)/n - 0.06
        ri, ro = r*0.12, r*0.8
        p = (f'M{f(cx+math.cos(a0)*ri)} {f(cy+math.sin(a0)*ri)} L{f(cx+math.cos(a0)*ro)} {f(cy+math.sin(a0)*ro)} '
             f'A{f(ro)} {f(ro)} 0 0 1 {f(cx+math.cos(a1)*ro)} {f(cy+math.sin(a1)*ro)} '
             f'L{f(cx+math.cos(a1)*ri)} {f(cy+math.sin(a1)*ri)}Z')
        out.append(f'<path d="{p}" fill="#F6DD3D" stroke="#F6DD3D" stroke-width="{f(r*0.05)}" stroke-linejoin="round"/>')
        am = (a0+a1)/2
        out.append(f'<ellipse cx="{f(cx+math.cos(am)*r*0.52)}" cy="{f(cy+math.sin(am)*r*0.52)}" rx="{f(r*0.035)}" ry="{f(r*0.07)}" '
                   f'fill="#FFF6C9" transform="rotate({f(math.degrees(am)+90)} {f(cx+math.cos(am)*r*0.52)} {f(cy+math.sin(am)*r*0.52)})"/>')
    return ''.join(out)

def raspberry(cx, cy, s):
    out = []
    rows = [(4, -72), (5, -42), (6, -12), (5, 18), (4, 48), (3, 76), (2, 100)]
    for n, dy in rows:
        width = n * 30*s
        for i in range(n):
            x = cx - width/2 + 15*s + i*30*s
            y = cy + dy*s + (abs(i-(n-1)/2))**1.6*3*s
            r = (17.5 - abs(i-(n-1)/2)*1.2 - max(0, dy-40)/40)*s
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r+1.5*s)}" fill="#8E0F45"/>')
            out.append(f'<circle cx="{f(x-1*s)}" cy="{f(y-1*s)}" r="{f(r)}" fill="#B8185A"/>')
            out.append(f'<circle cx="{f(x-r*0.32)}" cy="{f(y-r*0.38)}" r="{f(r*0.25)}" fill="#F27FAE"/>')
    # small leaf cap
    out.append(f'<path d="M{f(cx-46*s)} {f(cy-96*s)} Q{f(cx)} {f(cy-128*s)} {f(cx+46*s)} {f(cy-96*s)} Q{f(cx)} {f(cy-78*s)} {f(cx-46*s)} {f(cy-96*s)}Z" fill="{LEAF}"/>')
    return ''.join(out)

def raspberry_lemon_cut(cx=200, cy=230, s=1.0):
    return lemon_wheel(cx+58*s, cy-22*s, 132*s) + raspberry(cx-72*s, cy+52*s, 0.95*s)

FRUIT = {'strawberry': strawberry_half, 'mango': mango_cheek, 'raspberry-lemon': raspberry_lemon_cut}

def fruit_svg(key, bg=None):
    inner = FRUIT[key]()
    rect = f'<rect width="400" height="460" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 460" role="img" aria-label="{key.replace("-", " and ")} cut open">{rect}{inner}</svg>'

# ---------------------------------------------------------------- the fruit sticker
STICKER = {  # key: (flavor color, label line 1)
    'strawberry': ('#F0505E', 'REAL STRAWBERRY'),
    'mango': ('#FFB01F', 'REAL MANGO'),
    'raspberry-lemon': ('#B8185A', 'REAL RASPBERRY + LEMON'),
}

def sticker(key, grams='[x]g', w=360, h=240, x=0, y=0, rot=0, standalone=True, lot='LOT [  ]', line2='IN EVERY SCOOP'):
    """The Picked fruit sticker: cream oval, ink keyline, the fruit grams set
    biggest, and a lot pill where a produce sticker carries its price code."""
    col, label = STICKER[key]
    cx, cy = x + w/2, y + h/2
    rx, ry = w/2, h/2
    g = [f'<g transform="rotate({rot} {f(cx)} {f(cy)})">',
         f'<ellipse cx="{f(cx+4)}" cy="{f(cy+7)}" rx="{f(rx)}" ry="{f(ry)}" fill="{INK}" opacity=".14"/>',
         f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{CREAM}" stroke="{INK}" stroke-width="{f(w/120)}"/>',
         f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx-w*0.04)}" ry="{f(ry-w*0.04)}" fill="none" stroke="{col}" stroke-width="{f(w/40)}"/>']
    g.append(P.wordmark(cx - w*0.105, y + h*0.115, w*0.21, INK, LEAF))
    big = h*0.36
    tw = TW(grams, B, big, -big*0.035)
    if tw > w*0.58: big *= w*0.58/tw
    g.append(T(grams, B, cx, y + h*0.565, big, INK, -big*0.035, 'middle'))
    for i, (txt, sz) in enumerate([(label, h*0.056), (line2, h*0.044)]):
        tw = TW(txt, F7, sz, sz*0.18)
        if tw > w*0.56: sz *= w*0.56/tw
        g.append(T(txt, F7, cx, y + h*(0.705 + i*0.068), sz, INK, sz*0.18, 'middle'))
    pw, ph = w*0.22, h*0.095
    g.append(f'<rect x="{f(cx-pw/2)}" y="{f(y+h*0.80)}" width="{f(pw)}" height="{f(ph)}" rx="{f(ph/2)}" fill="{INK}"/>')
    ls = ph*0.52
    g.append(T(lot, F7, cx, y + h*0.80 + ph*0.69, ls, CREAM, ls*0.15, 'middle'))
    g.append('</g>')
    body = ''.join(g)
    if not standalone: return body
    pad = 14
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-pad} {-pad} {w+2*pad} {h+2*pad+8}" role="img" '
            f'aria-label="Picked fruit sticker: {grams} {label.lower()}, {line2.lower()}">{body}</svg>')

if __name__ == '__main__':
    for k in FRUIT:
        save('fruit', f'{k}.svg', fruit_svg(k))
        save('sticker', f'sticker-{k}.svg', sticker(k))
    # the pre-launch teaser: the number stays blank until it's real
    save('sticker', 'sticker-blank.svg', sticker('strawberry', grams='?g', line2='WE PRINT IT WHEN IT\'S REAL', lot='LOT 001'))
    print('ok')
