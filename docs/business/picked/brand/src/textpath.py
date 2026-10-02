from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
_F={}
def font(n):
    if n not in _F:
        f=TTFont(n); _F[n]=(f.getGlyphSet(),f.getBestCmap(),f['head'].unitsPerEm)
    return _F[n]
def width(text,fn,size,track=0):
    gs,cm,upm=font(fn); s=size/upm
    return sum(gs[cm.get(ord(c),cm[32])].width*s+track for c in text)-track
def path(text,fn,x,y,size,fill,track=0,anchor='start'):
    gs,cm,upm=font(fn); s=size/upm
    if anchor=='middle': x-=width(text,fn,size,track)/2
    pen=SVGPathPen(gs); cx=x
    for c in text:
        g=cm.get(ord(c),cm[32])
        gs[g].draw(TransformPen(pen,(s,0,0,-s,cx,y))); cx+=gs[g].width*s+track
    return f'<path fill="{fill}" d="{pen.getCommands()}"/>'
