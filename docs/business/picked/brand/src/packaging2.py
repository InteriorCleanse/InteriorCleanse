import re, importlib.util, io, contextlib
with contextlib.redirect_stdout(io.StringIO()):
    import pouch as P
from textpath import path as T, width as TW
B='brico800.ttf'; F5='franklin500.ttf'; F7='franklin700.ttf'
OUT=P.OUT; INK=P.INK; CREAM=P.CREAM
FL={f[0]:f for f in P.FLAVORS}
def rnd(s): return re.sub(r' d="([^"]*)"',lambda m:' d="'+re.sub(r'(\d+\.\d)\d+',r'\1',m.group(1))+'"',s)
def save(name,s): open(f'{OUT}/{name}','w').write(rnd(s))

# ---------- back panel ----------
def back(key):
    _,name,col,ink,soft,fruit,fruitline=FL[key]
    w,h=600,860; L=[]
    L.append(f'<rect width="{w}" height="{h}" rx="40" fill="{col}"/>')
    L.append(P.wordmark(50,60,120,ink,'#1F4D2C' if ink==INK else '#9BD36A'))
    L.append(T('the fruit on the label is in it.',F7,50,150,22,ink))
    story=["We make protein that tastes like "+name.lower()+" because it","is made with "+fruitline.replace('real ','')+". No candy flavor, no","sucralose. Every lot is tested for heavy metals,","and the results are one scan away."]
    for i,s in enumerate(story): L.append(T(s,F5,50,185+i*24,16,ink))
    # facts panel
    fx,fy,fw=50,300,290
    rows=[('Serving Size','1 scoop ([x] g)'),('Servings Per Container','20')]
    L.append(f'<rect x="{fx}" y="{fy}" width="{fw}" height="400" fill="#fff"/><rect x="{fx}" y="{fy}" width="{fw}" height="400" fill="none" stroke="{INK}" stroke-width="2"/>')
    L.append(T('Supplement Facts',B,fx+10,fy+36,27,INK,-0.5))
    y=fy+60
    for a,b in rows: L.append(T(a,F5,fx+10,y,12.5,INK)+T(b,F5,fx+fw-10-TW(b,F5,12.5),y,12.5,INK)); y+=18
    L.append(f'<rect x="{fx+8}" y="{y-6}" width="{fw-16}" height="8" fill="{INK}"/>'); y+=16
    L.append(T('Amount Per Serving',F7,fx+10,y,11,INK)+T('% Daily Value',F7,fx+fw-10-TW('% Daily Value',F7,11),y,11,INK)); y+=6
    items=[('Calories','[x]',''),('Total Carbohydrate','[x] g','[x]%*'),('  Total Sugars','[x] g',''),('Protein','20 g','40%'),('Sodium','[x] mg','[x]%'),('Calcium','[x] mg','[x]%'),('Potassium','[x] mg','[x]%')]
    for a,b,c in items:
        L.append(f'<line x1="{fx+8}" x2="{fx+fw-8}" y1="{y+4}" y2="{y+4}" stroke="{INK}" stroke-width="1"/>'); y+=21
        bold=F7 if not a.startswith(' ') else F5
        L.append(T(a.strip()+'  '+b,bold,fx+10+(12 if a.startswith(' ') else 0),y,13,INK)+(T(c,F7,fx+fw-10-TW(c,F7,13),y,13,INK) if c else ''))
    L.append(f'<rect x="{fx+8}" y="{y+6}" width="{fw-16}" height="4" fill="{INK}"/>'); y+=26
    for s in ['* Percent Daily Values are based on a','2,000 calorie diet. Values are placeholders','until the formula is final.']:
        L.append(T(s,F5,fx+10,y,10.5,INK)); y+=14
    # right column
    rx=365; ry=318
    def para(title,lines,y):
        out=T(title,F7,rx,y,12,ink,1.5); y+=20
        for s in lines: out+=T(s,F5,rx,y,13,ink); y+=17
        return out,y+12
    a,ry=para('OTHER INGREDIENTS',['Whey protein isolate (milk),',f'{fruitline.replace("real ","").replace(" + "," and ")} ([x]%),','citric acid, monk fruit','extract. [Final list from','the manufacturer.]'],ry); L.append(a)
    a,ry=para('CONTAINS',['Milk.'],ry); L.append(a)
    a,ry=para('DIRECTIONS',['Shake 1 scoop with 10 to','12 oz cold water.'],ry); L.append(a)
    # QR + barcode placeholders
    L.append(f'<rect x="{rx}" y="{ry}" width="96" height="96" rx="8" fill="#fff"/><rect x="{rx+8}" y="{ry+8}" width="80" height="80" fill="none" stroke="{INK}" stroke-width="2" stroke-dasharray="5 4"/>')
    L.append(T('LOT QR',F7,rx+48,ry+52,11,INK,1,'middle'))
    L.append(T('scan for this',F5,rx+108,ry+40,13,ink)+T("lot's lab results",F5,rx+108,ry+57,13,ink))
    by=ry+120
    L.append(f'<rect x="{rx}" y="{by}" width="190" height="88" rx="6" fill="#fff"/>')
    for i in range(38):
        bw=2 if i%3 else 3
        L.append(f'<rect x="{rx+12+i*4.4:.1f}" y="{by+10}" width="{bw}" height="52" fill="{INK}"/>')
    L.append(T('UPC FROM GS1 US',F7,rx+95,by+80,10,INK,1,'middle'))
    # footer
    L.append(f'<rect x="0" y="760" width="{w}" height="100" fill="{INK}" opacity=".08"/>')
    for i,s in enumerate(['Distributed by Picked [LLC name], [street], [city, state ZIP].','Questions or to report a reaction: [phone] · hello@pickedprotein.com','LOT [ ]   BEST BY [ ]   Store cool and dry. Sealed for freshness.']):
        L.append(T(s,F5,50,792+i*20,13,ink))
    clip=f'<clipPath id="bk-{key}"><rect width="{w}" height="{h}" rx="40"/></clipPath>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="Picked {name} pouch back panel concept"><defs>{clip}</defs><g clip-path="url(#bk-{key})">{"".join(L)}</g></svg>'

# ---------- stick pack ----------
def stick(key):
    _,name,col,ink,soft,fruit,fruitline=FL[key]
    w,h=200,640
    teeth=''.join(f'L{x+5} {6 if i%2==0 else 0} ' for i,x in enumerate(range(0,w,10)))
    top=f'M0 0 {teeth}L{w} 0'
    body=f'<path d="M0 6 Q0 0 6 0 H{w-6} Q{w} 0 {w} 6 V{h-6} Q{w} {h} {w-6} {h} H6 Q0 {h} 0 {h-6}Z" fill="{col}"/>'
    serr=''.join(f'<path d="M{x} 0 l5 7 l5 -7Z" fill="#FFF7EC"/>' for x in range(0,w,10))+''.join(f'<path d="M{x} {h} l5 -7 l5 7Z" fill="#FFF7EC"/>' for x in range(0,w,10))
    lines=[name] if len(name)<12 else name.split(' ')
    size=min(76, 360/(TW(max(lines,key=len),B,100,-2)/100))
    thick=size*(0.78+0.95*(len(lines)-1))
    g=f'<g transform="translate({100+thick/2:.1f} 128) rotate(90)">'
    for i,t in enumerate(lines): g+=T(t,B,0,size*0.78+i*size*0.95,size,ink,-2)
    g+='</g>'
    wm=P.wordmark(30,30,140,ink,'#1F4D2C' if ink==INK else '#9BD36A')
    badge=T('20g',B,100,572,36,ink,0,'middle')+T('PROTEIN',F7,100,594,11,ink,2,'middle')
    sub=T('REAL FRUIT · 1 SERVING',F7,100,520,10.5,ink,1.5,'middle')
    sheen='<rect x="0" y="0" width="200" height="640" fill="url(#st)"/>'
    defs='<defs><linearGradient id="st" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".12"/><stop offset=".2" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient></defs>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="Picked {name} stick pack concept">{defs}{body}{wm}{g}{sub}{badge}{sheen}{serr}</svg>'

# ---------- counter display ----------
def display():
    w,h=900,760
    s=[f'<ellipse cx="450" cy="742" rx="400" ry="16" fill="#000" opacity=".12"/>']
    # sticks standing in tray (back row)
    keys=['strawberry','mango','raspberry-lemon','strawberry','mango','raspberry-lemon','strawberry','mango','raspberry-lemon','strawberry']
    for i,k in enumerate(keys):
        col=FL[k][2]
        x=110+i*68
        s.append(f'<rect x="{x}" y="{250+(i%2)*14}" width="58" height="300" rx="5" fill="{col}"/><rect x="{x}" y="{250+(i%2)*14}" width="58" height="300" rx="5" fill="url(#dsh)"/>')
        s.append(f'<g transform="translate({x+38} {312+(i%2)*6}) rotate(90)">{T(FL[k][1].split(" ")[0].lower(),B,0,0,19,FL[k][3],-0.5)}</g>')
    # header card
    s.append('<path d="M80 40 H820 Q850 40 850 70 V300 H50 V70 Q50 40 80 40Z" fill="#1F4D2C"/>')
    s.append(P.wordmark(96,70,260,'#FFF7EC','#9BD36A'))
    s.append(T('protein that tastes like',F7,96,235,30,'#FFF7EC'))
    s.append(T('it was just picked.',F7,96,272,30,'#FFF7EC'))
    s.append('<circle cx="720" cy="170" r="92" fill="#F6DD3D"/>'+T('$3.99',B,720,178,46,INK,-1,'middle')+T('20g PROTEIN',F7,720,210,14,INK,1.5,'middle'))
    # tray front
    s.append('<path d="M50 430 H850 V690 Q850 720 820 720 H80 Q50 720 50 690Z" fill="#F0505E"/>')
    s.append('<path d="M50 430 H850 V460 H50Z" fill="#000" opacity=".08"/>')
    s.append(T('made with real fruit.',B,450,560,64,INK,-2,'middle'))
    s.append(T('STRAWBERRY  ·  MANGO  ·  RASPBERRY LEMON',F7,450,620,20,INK,3,'middle'))
    s.append(T('scan the pouch to see every lab result',F5,450,668,20,INK,0,'middle'))
    defs='<defs><linearGradient id="dsh" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".15"/><stop offset=".3" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient></defs>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="Picked counter display concept with ten stick packs">{defs}{"".join(s)}</svg>'

# ---------- shaker ----------
def shaker():
    w,h=360,720
    s=['<ellipse cx="180" cy="702" rx="120" ry="12" fill="#000" opacity=".12"/>',
       '<rect x="70" y="60" width="220" height="110" rx="26" fill="#1E1A17"/>','<rect x="150" y="20" width="60" height="50" rx="12" fill="#1E1A17"/>',
       '<path d="M60 160 H300 L284 680 Q282 700 262 700 H98 Q78 700 76 680Z" fill="#FFF7EC" stroke="#1E1A17" stroke-opacity=".15" stroke-width="2"/>',
       '<path d="M66 360 H294 L284 680 Q282 700 262 700 H98 Q78 700 76 680Z" fill="#F0505E" opacity=".85"/>',
       '<path d="M66 360 Q120 345 180 360 T294 360" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="4"/>']
    s.append(f'<g transform="translate(180 290) rotate(-90)">{P.wordmark(-120,-40,240,"#1E1A17","#2F7D3A")}</g>' if False else P.wordmark(80,220,200,'#1E1A17','#2F7D3A'))
    for i,ml in enumerate(['600','400','200']):
        y=230+i*150
        s.append(f'<line x1="270" x2="288" y1="{y+150}" y2="{y+150}" stroke="#1E1A17" stroke-width="2"/>'+T(ml,F7,264-TW(ml,F7,12),y+155,12,'#1E1A17'))
    s.append('<rect x="60" y="160" width="240" height="540" fill="url(#shs)"/>')
    defs='<defs><linearGradient id="shs" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".08"/><stop offset=".15" stop-color="#fff" stop-opacity=".35"/><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".1"/></linearGradient></defs>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="Picked shaker bottle concept">{defs}{"".join(s)}</svg>'

for k in FL: save(f'stick-{k}.svg',stick(k))
save('pouch-back-strawberry.svg',back('strawberry'))
save('counter-display.svg',display())
save('shaker.svg',shaker())
print('ok')
