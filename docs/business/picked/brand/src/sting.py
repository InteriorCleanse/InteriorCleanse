"""Picked brand sting: a 3.6-second vertical intro or outro for TikTok, Reels and Shorts.

The crown drops in, the leaf sprouts, the cut strawberry pops up, the fruit
sticker slaps on, and the line lands: "The fruit is in it."

Writes brand/motion/sting.html, a self-contained page with every SVG inlined.
render_sting.js steps through it frame by frame and ffmpeg joins the frames
into brand/motion/picked-sting-1080x1920.mp4. Run from brand/src/:
    python3 sting.py && node render_sting.js
"""
import os, re

BRAND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BRAND, 'motion')
W, H = 1080, 1920
DEEP, STRAW, HALO, INK, CREAM = '#1F4D2C', '#F0505E', '#FFD3D9', '#1E1A17', '#FFF7EC'


def read(rel):
    s = open(os.path.join(BRAND, rel)).read()
    return re.sub(r'\s(role|aria-label)="[^"]*"', '', s, count=2)


def crown(w, y, tips=9, deep=70, shallow=44):
    step = w / tips
    d = f'M0 0 H{w} V{y} '
    for i in range(tips, 0, -1):
        x1 = i * step; xm = x1 - step / 2; x0 = x1 - step
        dep = deep if i % 2 else shallow
        d += (f'C{x1 - step*.15:.1f} {y} {xm + step*.12:.1f} {y + dep*.55:.1f} {xm:.1f} {y + dep} '
              f'C{xm - step*.12:.1f} {y + dep*.55:.1f} {x0 + step*.15:.1f} {y} {x0:.1f} {y} ')
    return f'<svg viewBox="0 0 {w} {y + deep}" width="{w}" height="{y + deep}"><path d="{d}Z" fill="{DEEP}"/></svg>'


wordmark = read('picked-wordmark-reverse.svg').replace('<g fill="#9BD36A">', '<g class="leaf" fill="#9BD36A">', 1)
words = ''.join(f'<span class="w" style="--i:{i}">{w}</span> ' for i, w in enumerate('The fruit is in it.'.split()))

html = f'''<!doctype html><html><head><meta charset="utf-8"><title>Picked sting</title>
<style>
@font-face{{font-family:B;src:url(../../site/assets/fonts/bricolage-800.woff2)}}
@font-face{{font-family:L;src:url(../../site/assets/fonts/librefranklin-700.woff2)}}
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden;background:{STRAW}}}
*{{animation-fill-mode:both!important}}
.crown{{position:absolute;left:0;top:0;width:{W}px;animation:drop .5s 0s cubic-bezier(.16,1,.3,1)}}
.wm{{position:absolute;left:220px;top:190px;width:640px;animation:rise .45s .32s cubic-bezier(.16,1,.3,1)}}
.wm svg{{width:100%;height:auto;overflow:visible}}
.leaf{{transform-box:fill-box;transform-origin:15% 100%;animation:sprout .5s .62s cubic-bezier(.34,1.7,.64,1)}}
.halo{{position:absolute;left:200px;top:760px;width:680px;height:680px;border-radius:50%;background:{HALO};opacity:.6;animation:grow .5s .72s cubic-bezier(.16,1,.3,1)}}
.fruit{{position:absolute;left:260px;top:700px;width:560px;animation:pop .55s .82s cubic-bezier(.34,1.56,.64,1)}}
.fruit svg,.sticker svg{{width:100%;height:auto;display:block}}
.sticker{{position:absolute;left:96px;top:1180px;width:540px;transform:rotate(-8deg);filter:drop-shadow(0 18px 22px rgba(30,26,23,.28));
  animation:slap .26s 1.38s cubic-bezier(.55,0,.9,.5)}}
.shake{{position:absolute;inset:0;animation:shake .3s 1.64s linear}}
.line{{position:absolute;left:96px;right:60px;top:1560px;font:800 128px/1 B;letter-spacing:-.045em;color:{INK}}}
.w{{display:inline-block;animation:word .4s calc(1.9s + var(--i) * .13s) cubic-bezier(.16,1,.3,1)}}
.url{{position:absolute;left:100px;top:1760px;font:700 30px L;letter-spacing:.14em;color:{INK};opacity:.8;animation:fade .4s 2.65s}}
@keyframes drop{{from{{transform:translateY(-105%)}}to{{transform:none}}}}
@keyframes rise{{from{{transform:translateY(40px);opacity:0}}to{{transform:none;opacity:1}}}}
@keyframes sprout{{0%{{transform:scale(0) rotate(-30deg)}}100%{{transform:none}}}}
@keyframes grow{{from{{transform:scale(0)}}to{{transform:none}}}}
@keyframes pop{{from{{transform:scale(.5) rotate(-12deg);opacity:0}}to{{transform:none;opacity:1}}}}
@keyframes slap{{from{{transform:scale(1.9) rotate(-26deg);opacity:0;filter:drop-shadow(0 90px 60px rgba(30,26,23,.0))}}
  to{{transform:rotate(-8deg);opacity:1}}}}
@keyframes shake{{0%,100%{{transform:none}}25%{{transform:translate(6px,4px)}}50%{{transform:translate(-5px,-3px)}}75%{{transform:translate(3px,2px)}}}}
@keyframes word{{from{{transform:translateY(60px);opacity:0}}to{{transform:none;opacity:1}}}}
@keyframes fade{{from{{opacity:0}}to{{opacity:.8}}}}
</style></head><body>
<div class="shake">
  <div class="halo"></div>
  <div class="fruit">{read('fruit/strawberry.svg')}</div>
  <div class="sticker">{read('sticker/sticker-strawberry.svg')}</div>
  <div class="crown">{crown(W, 600)}</div>
  <div class="wm">{wordmark}</div>
  <div class="line">{words}</div>
  <div class="url">PICKEDPROTEIN.COM</div>
</div>
</body></html>'''

os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, 'sting.html'), 'w').write(html)
print('ok')
