from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import math, os
OUT='/home/user/InteriorCleanse/docs/business/picked/brand'
f=TTFont('brico800.ttf'); gs=f.getGlyphSet(); cmap=f.getBestCmap()
ASC=760  # baseline position in svg units
track=-14
glyphs=['p','dotlessi','c','k','e','d']
x=0; parts=[]; ipos=None
for g in glyphs:
    pen=SVGPathPen(gs)
    tp=TransformPen(pen,(1,0,0,-1,x,ASC))
    gs[g].draw(tp); parts.append(pen.getCommands())
    if g=='dotlessi': ipos=x
    x+=gs[g].width+track
W=x-track
word=' '.join(parts)
# leaf: base at top of dotless i
icx=ipos+117; base_y=ASC-528-26
def leaf(cx,cy,scale=1.0,rot=-58):
    L=230*scale
    # two halves with a hairline midrib gap
    up=f"M0 -3 C {0.25*L:.1f} {-0.26*L:.1f} {0.7*L:.1f} {-0.30*L:.1f} {L:.1f} -3 Z"
    lo=f"M0 3 C {0.3*L:.1f} {0.24*L:.1f} {0.72*L:.1f} {0.24*L:.1f} {L:.1f} 3 Z"
    return f'<g transform="translate({cx:.1f} {cy:.1f}) rotate({rot})"><path d="{up}"/><path d="{lo}"/></g>'
lf=leaf(icx-22,base_y+10,1.18,-60)
top=base_y-250  # approx leaf top
vb_y=top-10; vb_h=ASC+150-vb_y
def svg(ink,leafc,bg=None,pad=40):
    vx=-pad; vy=vb_y-pad; vw=W+2*pad; vh=vb_h+2*pad
    b=f'<rect x="{vx}" y="{vy}" width="{vw}" height="{vh}" fill="{bg}"/>' if bg else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vx} {vy:.0f} {vw} {vh:.0f}" role="img" aria-label="Picked">'
            f'{b}<path fill="{ink}" d="{word}"/><g fill="{leafc}">{lf}</g></svg>')
open(f'{OUT}/picked-wordmark.svg','w').write(svg('#1E1A17','#2F7D3A'))
open(f'{OUT}/picked-wordmark-reverse.svg','w').write(svg('#FFF7EC','#9BD36A'))
open(f'{OUT}/picked-wordmark-onfruit.svg','w').write(svg('#1E1A17','#1E1A17'))
# mark: leaf + small dot (fruit) in a circle
mark=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Picked mark">'
      f'<circle cx="256" cy="256" r="256" fill="#E8364F"/>'
      f'<g fill="#FFF7EC">{leaf(148,378,1.42,-48)}</g></svg>')
open(f'{OUT}/picked-mark.svg','w').write(mark)
fav=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#E8364F"/>'
     f'<g fill="#FFF7EC" transform="scale(0.125)">{leaf(148,378,1.42,-48)}</g></svg>')
open(f'{OUT}/favicon.svg','w').write(fav)
open('wordpath.txt','w').write(f"{W}|{vb_y}|{vb_h}|{icx}|{base_y}\n{word}\n{lf}")
print('W',W,'vb',vb_y,vb_h)
