import sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
OUT=sys.argv[1]
f=TTFont('brico800.ttf'); gs=f.getGlyphSet()
g=gs['p']; bp=BoundsPen(gs); g.draw(bp); x0,y0,x1,y1=bp.bounds   # font units, y up
pen=SVGPathPen(gs); g.draw(TransformPen(pen,(1,0,0,-1,-x0,y1))); pth=pen.getCommands()
w,h=x1-x0,y1-y0
def leaf(cx,cy,scale,rot):
    L=230*scale
    up=f"M0 -3 C {0.25*L:.1f} {-0.26*L:.1f} {0.7*L:.1f} {-0.30*L:.1f} {L:.1f} -3 Z"
    lo=f"M0 3 C {0.3*L:.1f} {0.24*L:.1f} {0.72*L:.1f} {0.24*L:.1f} {L:.1f} 3 Z"
    return f'<g transform="translate({cx:.1f} {cy:.1f}) rotate({rot})"><path d="{up}"/><path d="{lo}"/></g>'
# stem of the p: left side, top at y=0 in local coords; stem width approx 0.33w
sx=w*0.17
def glyph(ink,leafc):
    stalk=f'<path d="M{sx:.1f} 30 C{sx:.1f} 0 {sx+4:.1f} -26 {sx+10:.1f} -46" fill="none" stroke="{leafc}" stroke-width="34" stroke-linecap="round"/>'
    return f'<path fill="{ink}" d="{pth}"/><g fill="{leafc}">{stalk}{leaf(sx+6,-40,1.55,-70)}</g>'
top=-46-230*1.55*0.95
tot_h=h-top; tot_w=w+60
k=350/tot_h; tx=256-(w*k)/2+10; ty=256-(tot_h*k)/2-top*k+6
def mark(bg,ink,leafc,circle=True):
    shape=f'<circle cx="256" cy="256" r="256" fill="{bg}"/>' if circle else f'<rect width="512" height="512" rx="112" fill="{bg}"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Picked mark">{shape}'
            f'<g transform="translate({tx:.1f} {ty:.1f}) scale({k:.4f})">{glyph(ink,leafc)}</g></svg>')
open(f'{OUT}/picked-mark.svg','w').write(mark('#1F4D2C','#FFF7EC','#9BD36A'))
open(f'{OUT}/favicon.svg','w').write(mark('#1F4D2C','#FFF7EC','#9BD36A',False).replace('viewBox="0 0 512 512"','viewBox="0 0 512 512" width="64" height="64"'))
print('ok')
