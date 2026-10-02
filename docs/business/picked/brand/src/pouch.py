import re
from textpath import path as T, width as TW
B='brico800.ttf'; F5='franklin500.ttf'; F7='franklin700.ttf'
OUT='/home/user/InteriorCleanse/docs/business/picked/brand'
meta,word,lf=open('wordpath.txt').read().split('\n',2)
W,vby,vbh,icx,by=[float(v) for v in meta.split('|')]
INK='#1E1A17'; CREAM='#FFF7EC'
def wordmark(x,y,width,ink,leaf):
    s=width/W
    return f'<g transform="translate({x} {y}) scale({s:.4f})"><path fill="{ink}" d="{word}"/><g fill="{leaf}">{lf}</g></g>'
def strawberry(cx,cy,s=1):
    seeds=''.join(f'<ellipse cx="{cx+dx*s}" cy="{cy+dy*s}" rx="{3.2*s}" ry="{5*s}" fill="#FFE9A8" transform="rotate({r} {cx+dx*s} {cy+dy*s})"/>' for dx,dy,r in [(-40,-20,-20),(-10,-30,0),(22,-25,15),(48,-12,25),(-50,15,-25),(-20,8,-8),(12,5,8),(42,20,20),(-30,45,-15),(0,40,0),(28,50,12),(-8,75,-5),(15,78,6)])
    body=f'<path d="M{cx-78*s} {cy-35*s} C{cx-90*s} {cy+30*s} {cx-30*s} {cy+110*s} {cx} {cy+118*s} C{cx+30*s} {cy+110*s} {cx+90*s} {cy+30*s} {cx+78*s} {cy-35*s} C{cx+60*s} {cy-70*s} {cx-60*s} {cy-70*s} {cx-78*s} {cy-35*s}Z" fill="#C81E3A"/>'
    hull=''.join(f'<path d="M{cx} {cy-52*s} L{cx+dx*s} {cy+dy*s} L{cx+dx2*s} {cy+dy2*s}Z" fill="#2F7D3A"/>' for dx,dy,dx2,dy2 in [(-70,-50,-40,-70),(-35,-30,-5,-45),(40,-72,70,-48),(5,-45,35,-30),(-18,-90,18,-90)])
    return body+seeds+hull+f'<rect x="{cx-4*s}" y="{cy-112*s}" width="{8*s}" height="{40*s}" rx="{4*s}" fill="#2F7D3A"/>'
def mango(cx,cy,s=1):
    return (f'<path d="M{cx-60*s} {cy+70*s} C{cx-120*s} {cy-10*s} {cx-70*s} {cy-110*s} {cx+10*s} {cy-105*s} C{cx+95*s} {cy-100*s} {cx+110*s} {cy+20*s} {cx+60*s} {cy+80*s} C{cx+20*s} {cy+125*s} {cx-30*s} {cy+110*s} {cx-60*s} {cy+70*s}Z" fill="url(#mg)"/>'
            f'<path d="M{cx-40*s} {cy+40*s} C{cx-70*s} {cy-20*s} {cx-30*s} {cy-80*s} {cx+20*s} {cy-80*s}" fill="none" stroke="#FFC34D" stroke-width="{12*s}" stroke-linecap="round" opacity=".8"/>'
            f'<path d="M{cx+8*s} {cy-104*s} C{cx+40*s} {cy-160*s} {cx+110*s} {cy-150*s} {cx+130*s} {cy-120*s} C{cx+90*s} {cy-100*s} {cx+40*s} {cy-95*s} {cx+8*s} {cy-104*s}Z" fill="#2F7D3A"/>')
def raspberry_lemon(cx,cy,s=1):
    out=f'<g><circle cx="{cx+48*s}" cy="{cy+20*s}" r="{78*s}" fill="#F6DD3D"/><circle cx="{cx+48*s}" cy="{cy+20*s}" r="{66*s}" fill="#FFF2A6"/>'
    import math
    for i in range(8):
        a=i*math.pi/4+math.pi/8
        out+=f'<path d="M{cx+48*s} {cy+20*s} L{cx+48*s+58*s*math.cos(a-0.3):.1f} {cy+20*s+58*s*math.sin(a-0.3):.1f} A{58*s} {58*s} 0 0 1 {cx+48*s+58*s*math.cos(a+0.3):.1f} {cy+20*s+58*s*math.sin(a+0.3):.1f}Z" fill="#F6DD3D"/>'
    out+='</g>'
    pts=[(0,0),(-22,-6),(22,-6),(-30,18),(0,20),(30,18),(-20,40),(20,40),(0,58),(-12,-26),(12,-26)]
    for dx,dy in pts:
        x=cx-48*s+dx*s; y=cy-10*s+dy*s
        out+=f'<circle cx="{x}" cy="{y}" r="{16*s}" fill="#B8185A"/><circle cx="{x-5*s}" cy="{y-5*s}" r="{4.5*s}" fill="#F0679A"/>'
    out+=f'<path d="M{cx-48*s} {cy-40*s} l{-26*s} {-24*s} l{22*s} {6*s} l{4*s} {-26*s} l{6*s} {26*s} l{22*s} {-6*s}Z" fill="#2F7D3A"/>'
    return out
FLAVORS=[('strawberry','Strawberry','#F0505E',INK,'#FFD3D9',strawberry,'real strawberries'),
         ('mango','Mango','#FFB01F',INK,'#FFF0C7',mango,'real mango'),
         ('raspberry-lemon','Raspberry Lemon','#B8185A',CREAM,'#F9C6DA',raspberry_lemon,'real raspberries + lemon')]
def pouch(key,name,col,ink,soft,fruit,fruitline):
    w,h=600,860
    lines=[name] if len(name)<12 else name.split(' ')
    big=min(124, min(470/ (TW(l,B,100,-3)/100) for l in lines))
    title=''.join(T(t,B,62,470+i*big*0.95,big,ink,-3) for i,t in enumerate(lines))
    leafc = '#1F4D2C' if ink==INK else '#9BD36A'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h+40}" role="img" aria-label="Picked {name} pouch concept">
<defs><linearGradient id="mg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#E5482B"/><stop offset=".55" stop-color="#F59A1B"/><stop offset="1" stop-color="#F9C93A"/></linearGradient><clipPath id="c-{key}"><path d="M40 70 Q40 30 80 30 H520 Q560 30 560 70 V800 Q560 850 510 850 H90 Q40 850 40 800Z"/></clipPath>
<linearGradient id="g-{key}" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".10"/><stop offset=".12" stop-color="#fff" stop-opacity=".18"/><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset=".85" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient></defs>
<ellipse cx="300" cy="868" rx="250" ry="14" fill="#000" opacity=".12"/>
<g clip-path="url(#c-{key})">
<rect x="0" y="0" width="{w}" height="{h}" fill="{col}"/>
<circle cx="425" cy="215" r="175" fill="{soft}" opacity=".55"/>
<g>{fruit(410 if key=="mango" else 425,{"mango":222,"strawberry":205}.get(key,212),1.0)}</g>
{wordmark(64,92,190,ink,leafc)}
{T('REAL FRUIT PROTEIN DRINK MIX',F7,66,350,17,ink,3,'start')}
{title}
{T('made with '+fruitline,F5,66,560 if len(lines)==1 else 470+big*0.95+62,24,ink,0,'start')}
<g transform="translate(64 {640 if len(lines)==1 else 674})"><rect width="170" height="94" rx="47" fill="none" stroke="{ink}" stroke-width="3"/>
{T('20g',B,85,52,40,ink,0,'middle')}
{T('PROTEIN',F7,85,78,14,ink,2,'middle')}</g>
{T('mix with cold water.',F7,250,690 if len(lines)==1 else 724,17,ink,0,'start')}
{T('no sucralose. no fake fruit.',F7,250,714 if len(lines)==1 else 748,17,ink,0,'start')}
<rect x="40" y="776" width="520" height="80" fill="{ink}" opacity=".08"/>
{T('DIETARY SUPPLEMENT · 20 SERVINGS · NET WT [TBD]',F7,66,822,15,ink,1.5,'start')}
<rect x="40" y="30" width="520" height="830" fill="url(#g-{key})"/>
<line x1="40" x2="560" y1="112" y2="112" stroke="#000" stroke-opacity=".12" stroke-width="2" stroke-dasharray="2 6"/>
</g>
<path d="M40 58 l10 6 l-10 6" fill="#fff" opacity=".7"/>
</svg>'''
for f in FLAVORS:
    open(f'{OUT}/pouch-{f[0]}.svg','w').write(pouch(*f))
print('ok')
