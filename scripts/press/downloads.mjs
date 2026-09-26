// The three digital downloads, authored and typeset: the Room Reset
// Checklist, The Considered Pantry, and The Calm Room Workbook. Letter
// pages, printable in black and white, set in the house faces. Each PDF
// lands in assets/downloads/ (for Gumroad) and its cover in
// public/products/downloads/ (for the storefront).
import { BASE_CSS, C, mark } from './brand.mjs'
import { pdf, png, close } from './lib.mjs'
import { pathToFileURL } from 'node:url'

const PAGE_CSS = `
${BASE_CSS}
@page{size:Letter;margin:0}
body{background:#fff}
.page{width:8.5in;height:11in;padding:.85in .9in;position:relative;page-break-after:always;overflow:hidden;background:#fff}
.page:last-child{page-break-after:auto}
.cover{background:${C.cream};padding:1in}
.eyebrow{font-size:9px;letter-spacing:.32em;text-transform:uppercase;font-weight:600;color:${C.brass}}
h1{font-size:44px;line-height:1.02;letter-spacing:-.02em;font-weight:500;margin:.35in 0 .18in}
h2{font-size:26px;line-height:1.1;font-weight:500;margin:.1in 0 .18in}
h3{font-size:12px;letter-spacing:.2em;text-transform:uppercase;font-weight:600;color:${C.brass};margin:.28in 0 .1in}
p{font-size:11.5px;line-height:1.65;color:${C.muted};max-width:5.6in}
.lead{font-size:14px;line-height:1.55;color:${C.ink}}
.rule{width:64px;height:1.5px;background:${C.brass};margin:.22in 0}
ul.check{list-style:none;margin:.06in 0}
ul.check li{font-size:11.5px;line-height:1.5;color:${C.ink};padding:.075in 0 .075in .34in;position:relative;border-bottom:1px solid ${C.line}}
ul.check li::before{content:"";position:absolute;left:0;top:.115in;width:.15in;height:.15in;border:1.2px solid ${C.ink};border-radius:2px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:.45in}
.foot{position:absolute;left:.9in;right:.9in;bottom:.55in;display:flex;justify-content:space-between;font-size:8.5px;letter-spacing:.24em;text-transform:uppercase;color:${C.dim};font-weight:600}
.lines{margin-top:.12in}
.lines div{height:.32in;border-bottom:1px solid ${C.line}}
.note{font-size:10px;color:${C.dim};line-height:1.5}
.num{font-family:"Fraunces";font-size:80px;line-height:.8;color:rgba(27,24,21,.08);position:absolute;right:.9in;top:.7in;font-variation-settings:"SOFT" 55,"opsz" 144}
.labels{display:grid;grid-template-columns:repeat(3,1fr);gap:.18in .2in;margin-top:.2in}
.label{height:1.25in;border:1px solid ${C.ink};border-radius:3px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.05in;padding:.1in}
.label .n{font-family:"Fraunces";font-size:15px;font-variation-settings:"SOFT" 55,"opsz" 144}
.label .s{font-size:7.5px;letter-spacing:.24em;text-transform:uppercase;color:${C.dim};font-weight:600}
.label .m{color:${C.brass}}
table{width:100%;border-collapse:collapse;font-size:10.5px;margin-top:.15in}
th{text-align:left;font-size:8.5px;letter-spacing:.2em;text-transform:uppercase;color:${C.brass};padding:.08in 0;border-bottom:1.5px solid ${C.ink}}
td{padding:.14in 0;border-bottom:1px solid ${C.line};color:${C.ink}}
td.blank{color:transparent}
svg.map{width:100%;height:auto;display:block;margin:.15in 0}
`

const foot = (title, n) => `<div class="foot"><span>${title}</span><span>InteriorCleanse · ${n}</span></div>`
const coverPage = (eyebrow, title, sub, meta) => `
<section class="page cover">
  <div style="color:${C.brass}">${mark(64, C.brass)}</div>
  <p class="eyebrow" style="margin-top:.5in">${eyebrow}</p>
  <h1 class="serif" style="font-size:58px;max-width:5.4in">${title}</h1>
  <p class="lead" style="max-width:4.8in">${sub}</p>
  <div class="rule"></div>
  <p class="note">${meta}</p>
  <div class="foot"><span>InteriorCleanse</span><span>interiorcleanse.com</span></div>
</section>`
const doc = (pages) => `<!doctype html><html><head><meta charset="utf-8"><style>${PAGE_CSS}</style></head><body>${pages.join('\n')}</body></html>`
const checks = (items) => `<ul class="check">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`
const lines = (n) => `<div class="lines">${'<div></div>'.repeat(n)}</div>`

/* ───────────── 1. The Room Reset Checklist (12 pages) ───────────── */
const rooms = [
  ['Entry', 'The first three seconds of coming home.', ['Clear the drop zone: mail, keys, receipts, the bag that lives there', 'Shoes: pair, and keep only this week\'s by the door', 'Wipe the console and the mirror', 'Shake or vacuum the mat', 'Coats: one hook each; the rest go back to the closet', 'Sweep or vacuum the floor last'], 'A tray for keys and a single hook per person do more here than any cabinet.'],
  ['Kitchen', 'Surfaces first, then the floor. Always.', ['Dishes: run or empty the dishwasher, then clear the sink', 'Counters: everything back to its zone, then wipe', 'Stovetop and the wall behind it', 'Fridge front and handles; one shelf inside', 'Bin out, liner in', 'Sweep, then mop the traffic path only'], 'If the counters are clear the room reads as clean, whatever the cupboards hold.'],
  ['Living room', 'The room you look at most; edit before you clean.', ['Return everything that lives in another room', 'Fold throws, plump cushions, square the coffee table', 'Cables: coil and tuck; remotes into one place', 'Dust surfaces top to bottom: shelves, then table, then sills', 'Plants: water, remove dead leaves', 'Vacuum, corners first'], 'One empty surface per room. Leave it empty.'],
  ['Bedroom', 'Calm is mostly the absence of small things.', ['Open a window while you work', 'Strip or straighten the bed; fresh pillowcases if not the whole set', 'Clear nightstands to a lamp, a book, and water', 'The chair: clothes to the wardrobe, the hamper, or the wash', 'Dust, then vacuum under the bed edge', 'Close the wardrobe doors'], 'The nightstand rule: what you touch in the dark, and nothing else.'],
  ['Bathroom', 'Fast, if you keep the products down.', ['Products: back to the cabinet; keep out only what you use daily', 'Mirror and tap chrome', 'Basin, then toilet, then floor (in that order, one cloth each)', 'Fresh hand towel; hang bath towels to dry', 'Bin out', 'Shower glass squeegee, if you have one; it saves the deep clean'], 'A tray under the daily bottles keeps the counter one wipe away from done.'],
  ['Workspace', 'Clear the desk, keep the tools.', ['Paper: file, recycle, or a single action tray', 'Desk surface wiped; monitor and keyboard dusted', 'Cables to one side; chargers to one drawer', 'Pens: test, keep five', 'Return mugs and glasses to the kitchen', 'Chair pushed in when you leave'], 'A finished desk in the evening is the first fifteen minutes of tomorrow.'],
  ['Kids & multi-use rooms', 'Zones, not perfection.', ['Everything to its zone: books, blocks, art, soft things', 'One basket per category; lids off so it gets used', 'Rotate: a box of toys away for a month reads as new later', 'Surfaces wiped; walls spot-checked', 'Laundry gathered', 'Vacuum with the small head under furniture'], 'Label the baskets with pictures for readers-to-be.'],
  ['Laundry & utility', 'The room that resets the others.', ['Machines: drum wiped, filter checked, door left ajar', 'Fold what is dry; one basket per room, delivered', 'Wipe the top of the machines and the shelf', 'Refill: detergent, cloths, bags', 'Floor swept; the space behind the door too', 'Note anything you ran out of on the restock list'], 'A single shelf of cloths and refills, visible, keeps every other room\'s reset short.'],
]
const checklist = doc([
  coverPage('A printable', 'The Room Reset Checklist', 'One page per room, in the order that makes the work compound: surfaces before floors, baskets before bins. With a fifteen-minute version for the nights you have nothing left.', 'Twelve pages · Letter · prints cleanly in black and white'),
  `<section class="page"><p class="eyebrow">How to use it</p><h2 class="serif">Work in order. Stop when the timer stops.</h2>
   <p class="lead">Each room page is ordered so that what you do first is not undone by what you do next: things back to their homes, then surfaces, then the floor last. Tick as you go; the ticking is half the point.</p>
   <h3>Three ways to run a reset</h3>
   <p><strong>The fifteen-minute reset</strong> is the short list on the next page. One room, one timer, nothing else. Most nights this is enough.</p>
   <p><strong>The room reset</strong> is one room page, start to finish. Twenty to forty minutes depending on the room and the week.</p>
   <p><strong>The full reset</strong> is every room page in sequence, entry first, laundry last, across a morning. Do it monthly if you can; seasonally if you cannot.</p>
   <h3>Two rules</h3>
   <p>Nothing new comes into a room during a reset. If you find something that belongs elsewhere, put it by the door and deliver it at the end. And leave one surface in every room completely empty. It is the surface that tells you the room is done.</p>
   ${foot('The Room Reset Checklist', '2')}</section>`,
  `<section class="page"><span class="num">15</span><p class="eyebrow">The short version</p><h2 class="serif">The fifteen-minute reset</h2>
   <p class="lead">Pick one room. Set a timer. When it rings, you are finished, whether or not the list is.</p>
   ${checks(['Open a window', 'Gather everything that lives in another room into one basket', 'Return what you can in two minutes; the rest waits by the door', 'Clear and wipe the one surface you look at most', 'Straighten soft things: cushions, throws, the bed', 'Bin out if it is more than half full', 'Floor: the traffic path only, not the corners', 'Deliver the basket. Close the door behind you.'])}
   <p class="note" style="margin-top:.3in">If you have five more minutes, do the corners. If you do not, you still did the reset.</p>
   ${foot('The Room Reset Checklist', '3')}</section>`,
  `<section class="page"><p class="eyebrow">Keep close</p><h2 class="serif">Within arm\'s reach</h2>
   <p class="lead">A reset is short when nothing has to be fetched. This is the whole kit; it fits in one caddy or one drawer per floor.</p>
   <div class="two"><div>${checks(['Three cloths: one wet, one dry, one for the bathroom', 'An all-purpose spray you like the smell of', 'A small brush and pan', 'Bin liners, folded flat at the bottom of the bin'])}</div><div>${checks(['One basket for things that live elsewhere', 'A squeegee, if you have shower glass', 'A microfibre for glass and chrome', 'This list, on the inside of the cupboard door'])}</div></div>
   <h3>What is not on the list</h3><p>Specialist products for every surface, a second vacuum, a label maker. Buy those when a reset keeps stalling for want of them, not before.</p>
   ${foot('The Room Reset Checklist', '4')}</section>`,
  ...rooms.map(([name, sub, items, tip], i) => `<section class="page"><span class="num">0${i + 1}</span><p class="eyebrow">Room ${i + 1} of 8</p><h2 class="serif">${name}</h2><p class="lead">${sub}</p>${checks(items)}<h3>Worth knowing</h3><p>${tip}</p><h3>Notes</h3>${lines(9)}${foot('The Room Reset Checklist', String(5 + i))}</section>`),
])

/* ───────────── 2. The Considered Pantry (10 pages) ───────────── */
const zoneMap = (title, shape) => {
  const box = (x, y, w, h, t, sub) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${C.ink}" stroke-width="1.2"/><text x="${x + 8}" y="${y + 18}" font-family="Fraunces" font-size="12" fill="${C.ink}">${t}</text><text x="${x + 8}" y="${y + 32}" font-family="Jakarta" font-size="7" letter-spacing="1.5" fill="${C.brass}">${sub.toUpperCase()}</text>`
  const maps = {
    galley: `${box(20, 20, 260, 60, 'Everyday', 'eye level · what you cook with most')}${box(20, 90, 260, 60, 'Baking & dry goods', 'one shelf, decanted')}${box(20, 160, 260, 60, 'Cans & jars', 'labels forward, oldest in front')}${box(320, 20, 260, 60, 'Breakfast', 'one basket, lifted out and put back')}${box(320, 90, 260, 60, 'Snacks', 'a limit: the basket, not the shelf')}${box(320, 160, 260, 60, 'Backstock', 'top or bottom, counted monthly')}<text x="300" y="130" text-anchor="middle" font-family="Jakarta" font-size="7" fill="${C.dim}" letter-spacing="2">AISLE</text>`,
    l: `${box(20, 20, 200, 60, 'Everyday', 'nearest the stove')}${box(230, 20, 200, 60, 'Cans & jars', 'labels forward')}${box(440, 20, 140, 60, 'Oils & vinegars', 'by the hob')}${box(20, 90, 200, 60, 'Baking & dry goods', 'decanted, one shelf')}${box(20, 160, 200, 60, 'Backstock', 'the corner, counted')}${box(230, 90, 350, 130, 'The corner', 'deep shelf · lazy susan or two long baskets')}`,
    single: `${box(20, 20, 140, 200, 'Backstock', 'far end · counted monthly')}${box(170, 20, 140, 95, 'Cans & jars', 'labels forward')}${box(170, 125, 140, 95, 'Baking', 'decanted')}${box(320, 20, 140, 95, 'Everyday', 'eye level · nearest the stove')}${box(320, 125, 140, 95, 'Breakfast', 'one basket')}${box(470, 20, 110, 200, 'Snacks', 'the limit is the basket')}`,
  }
  return `<svg class="map" viewBox="0 0 600 240">${maps[shape]}</svg>`
}
const LABELS = ['Flour', 'Sugar', 'Oats', 'Rice', 'Pasta', 'Lentils', 'Coffee', 'Tea', 'Salt', 'Beans', 'Cocoa', 'Granola', 'Nuts', 'Seeds', 'Honey', 'Breakfast', 'Snacks', 'Backstock']
const labelSheet = (names) => `<div class="labels">${names.map((n) => `<div class="label"><span class="m">${mark(16, C.brass)}</span><span class="n">${n || '&nbsp;'}</span><span class="s">${n ? 'InteriorCleanse' : '&nbsp;'}</span></div>`).join('')}</div>`
const pantry = doc([
  coverPage('A pantry system', 'The Considered Pantry', 'Built around how you actually cook, not how a photograph looks. Label sheets in the house type, three zone maps for three kitchen shapes, and a restock sheet you refill instead of rewriting.', 'Ten pages · Letter · labels sized for standard jars and bins'),
  `<section class="page"><p class="eyebrow">How it works</p><h2 class="serif">Zones first, containers second, labels last.</h2>
   <p class="lead">Most pantries fail in the buying: matching jars before anyone has decided what goes where. This runs the other way.</p>
   <h3>1 · Zone</h3><p>Choose the map for your kitchen\'s shape on the next three pages. Each shelf gets one job. Everyday things sit at eye level nearest the stove; backstock sits furthest away and gets counted, not browsed.</p>
   <h3>2 · Contain</h3><p>Decant only what you buy in bags and use often: flour, oats, rice, pasta. Everything else stays in its packaging with the label facing out. A basket per category holds the small things; the basket is the limit.</p>
   <h3>3 · Label</h3><p>Print the label sheets on plain paper or full-sheet sticker stock, cut on the lines, and fix them at the same height on every jar. The blank sheet is for your own words.</p>
   <h3>4 · Restock</h3><p>The last page is a sheet you keep on the inside of the door. Tick when something runs low; photograph it before you shop. It ends the duplicate-buying problem for good.</p>
   ${foot('The Considered Pantry', '2')}</section>`,
  `<section class="page"><p class="eyebrow">Zone map · one of three</p><h2 class="serif">The galley</h2><p class="lead">Two facing runs. Cooking on one side, storing on the other, and the aisle kept clear.</p>${zoneMap('galley', 'galley')}<p class="note">Put the things you reach for while a pan is hot on the cooking side. Everything that waits for a shopping list goes opposite.</p><h3>My shelves, top to bottom</h3>${lines(8)}${foot('The Considered Pantry', '3')}</section>`,
  `<section class="page"><p class="eyebrow">Zone map · two of three</p><h2 class="serif">The L-shape</h2><p class="lead">The corner is the problem and the opportunity. Give it one job and one long basket per shelf.</p>${zoneMap('l', 'l')}<p class="note">A lazy susan turns the dead corner into the easiest shelf in the room. Two long, shallow baskets do the same for less.</p><h3>My shelves, top to bottom</h3>${lines(8)}${foot('The Considered Pantry', '4')}</section>`,
  `<section class="page"><p class="eyebrow">Zone map · three of three</p><h2 class="serif">The single wall</h2><p class="lead">One run, left to right, from what you count to what you cook with.</p>${zoneMap('single', 'single')}<p class="note">With a single wall the order matters more than the containers. Backstock at the far end, everyday at the stove end, and snacks in a basket you can lift out and put away.</p><h3>My shelves, top to bottom</h3>${lines(8)}${foot('The Considered Pantry', '5')}</section>`,
  `<section class="page"><p class="eyebrow">Label sheet · one</p><h2 class="serif">Dry goods</h2>${labelSheet(LABELS.slice(0, 9))}<p class="note" style="margin-top:.25in">Cut on the outer line. Full-sheet sticker stock or plain paper with a glue stick both hold on glass.</p>${foot('The Considered Pantry', '6')}</section>`,
  `<section class="page"><p class="eyebrow">Label sheet · two</p><h2 class="serif">Baskets and the rest</h2>${labelSheet(LABELS.slice(9))}${foot('The Considered Pantry', '7')}</section>`,
  `<section class="page"><p class="eyebrow">Label sheet · three</p><h2 class="serif">Your own words</h2>${labelSheet(Array(9).fill(''))}<p class="note" style="margin-top:.25in">Write in pencil first. The names that survive a month get ink.</p>${foot('The Considered Pantry', '8')}</section>`,
  `<section class="page"><p class="eyebrow">The restock sheet</p><h2 class="serif">What we are low on</h2><p class="lead">Keep it on the inside of the door. Tick, do not write. Photograph it before you leave the house.</p>
   <table><tr><th style="width:38%">Item</th><th>Low</th><th>Out</th><th>Bought</th><th style="width:30%">Where it lives</th></tr>${['Flour', 'Oats', 'Rice', 'Pasta', 'Coffee', 'Tea', 'Olive oil', 'Salt', 'Tinned tomatoes', 'Beans', 'Stock', 'Dish soap', 'Cloths', 'Bin liners', '', '', '', ''].map((i) => `<tr><td>${i || '&nbsp;'}</td><td>☐</td><td>☐</td><td>☐</td><td class="blank">.</td></tr>`).join('')}</table>
   ${foot('The Considered Pantry', '9')}</section>`,
  `<section class="page"><p class="eyebrow">Keeping it</p><h2 class="serif">The five-minute pantry reset</h2>${checks(['Labels forward, oldest to the front', 'One basket lifted out, emptied, wiped, refilled', 'Backstock counted; the restock sheet ticked', 'Crumbs out of the decanted-goods shelf', 'One thing you have not used in a year, out'])}<h3>Notes</h3>${lines(12)}${foot('The Considered Pantry', '10')}</section>`,
])

/* ───────────── 3. The Calm Room Workbook (40 pages) ───────────── */
const WB_ROOMS = ['Entry', 'Kitchen', 'Living room', 'Dining', 'Bedroom', 'Bathroom', 'Workspace', 'The room that has no name']
const roomSpread = (room, i, n) => {
  const p = 5 + i * 4
  return [
    `<section class="page"><span class="num">${String(i + 1).padStart(2, '0')}</span><p class="eyebrow">${room} · one of four</p><h2 class="serif">Photograph it. Then look.</h2><p class="lead">Take one photograph from the doorway, at eye level, without tidying first. Tape it here or describe it. The camera sees what the eye has learned to skip.</p><div style="height:3.1in;border:1px dashed ${C.line};margin:.2in 0;display:grid;place-items:center;color:${C.dim};font-size:10px;letter-spacing:.2em;text-transform:uppercase">photograph</div><h3>The first three things I notice</h3>${lines(5)}${foot('The Calm Room Workbook', String(p))}</section>`,
    `<section class="page"><p class="eyebrow">${room} · two of four</p><h2 class="serif">What stays.</h2><p class="lead">List what earns its place: used weekly, loved, or doing a job nothing else does. Be slow with this list and strict with the next.</p>${lines(16)}<h3>The one surface that stays empty</h3>${lines(1)}${foot('The Calm Room Workbook', String(p + 1))}</section>`,
    `<section class="page"><p class="eyebrow">${room} · three of four</p><h2 class="serif">What moves.</h2><p class="lead">Three columns. Nothing is thrown away on this page; it is only moved, and where to.</p><table><tr><th>To another room</th><th>To storage, dated</th><th>Out of the house</th></tr>${'<tr><td class="blank">.</td><td class="blank">.</td><td class="blank">.</td></tr>'.repeat(14)}</table><p class="note" style="margin-top:.2in">Anything in the middle column that is still boxed in six months belongs in the third.</p>${foot('The Calm Room Workbook', String(p + 2))}</section>`,
    `<section class="page"><p class="eyebrow">${room} · four of four</p><h2 class="serif">The plan.</h2><p class="lead">Now, and only now, what the room needs that it does not have. Most rooms need less than one thing.</p><h3>Storage that becomes a ritual</h3>${lines(4)}<h3>Light: morning, evening</h3>${lines(3)}<h3>Palette and one material to add</h3>${lines(3)}<h3>Done when</h3>${lines(3)}${foot('The Calm Room Workbook', String(p + 3))}</section>`,
  ]
}
const workbook = doc([
  coverPage('The companion to the book', 'The Calm Room Workbook', 'Every prompt from The Calm Room Method, laid out with room to answer. One room at a time: photograph it, mark what stays, plan what moves. Designed to be written in, not preserved.', 'Forty pages · Letter · print single-sided and keep it in a folder'),
  `<section class="page"><p class="eyebrow">How to use it</p><h2 class="serif">One room. Four pages. No shopping.</h2><p class="lead">The method in the book is a sequence: notice, keep, move, plan. Each room here gets one page for each step, in that order, and the order is the point.</p><h3>Notice</h3><p>A photograph from the doorway, before tidying. Write down the first three things you see. Those are the things everyone else sees too.</p><h3>Keep</h3><p>What earns its place. Used weekly, loved, or doing a job nothing else does. This list is usually shorter than expected and that is fine.</p><h3>Move</h3><p>Nothing is thrown away in this workbook. Things are moved: to the room they belong in, to dated storage, or out of the house. Dated storage that stays boxed for six months answers its own question.</p><h3>Plan</h3><p>Only after the first three pages: what the room needs that it does not have. Storage that becomes a ritual, light, one material. Most rooms need less than one thing.</p><p class="note" style="margin-top:.3in">Do one room a week. Eight weeks is a whole home.</p>${foot('The Calm Room Workbook', '2')}</section>`,
  `<section class="page"><p class="eyebrow">A worked example</p><h2 class="serif">A living room, before.</h2><p class="lead">From the doorway: a sofa under a window, a coffee table with a stack of magazines and three remotes, a bookcase with books lying on top of books, a chair holding a blanket and two bags, cables under the television.</p><h3>The first three things I notice</h3><p>1 · The cables. 2 · The chair that is not a chair any more. 3 · The top of the bookcase.</p><h3>What stays</h3><p>Sofa, lamp, the low table, the bookcase and the books that fit on it upright, one throw, the plant, the framed print above the sofa. The remote for the television.</p><h3>The surface that stays empty</h3><p>The coffee table.</p>${foot('The Calm Room Workbook', '3')}</section>`,
  `<section class="page"><p class="eyebrow">A worked example</p><h2 class="serif">A living room, after.</h2><h3>What moves</h3><p><strong>To another room:</strong> the bags (entry), the second blanket (bedroom), two remotes for devices nobody uses (drawer in the workspace). <strong>To storage, dated:</strong> the magazines older than this month, in one box, dated today. <strong>Out:</strong> the books lying on top, offered to friends first.</p><h3>The plan</h3><p><strong>Storage that becomes a ritual:</strong> a shallow basket under the low table for the one remote and the current magazine; it is emptied every Sunday. <strong>Light:</strong> the lamp moves to the reading end and goes on at dusk instead of the ceiling light. <strong>Palette and material:</strong> nothing new; the throw is oatmeal and the room already has enough. <strong>Done when:</strong> the coffee table is empty at the end of the day without anyone having to try.</p><p class="note" style="margin-top:.3in">Total spend: nothing. Total time: an afternoon, and ten minutes a week.</p>${foot('The Calm Room Workbook', '4')}</section>`,
  ...WB_ROOMS.flatMap((r, i) => roomSpread(r, i, WB_ROOMS.length)),
  `<section class="page"><p class="eyebrow">Across the home</p><h2 class="serif">Palette.</h2><p class="lead">Three neutrals and one accent, chosen once and carried from room to room. Paint a swatch of each here, or tape a sample.</p><div class="two" style="margin-top:.3in">${['Ground (walls, large soft things)', 'Second neutral (wood, stone, baskets)', 'Third neutral (metal, glass, dark accents)', 'The one accent (a colour that appears in every room, small)'].map((t) => `<div><div style="height:1.4in;border:1px solid ${C.line};background:#fff"></div><p class="note" style="margin-top:.08in">${t}</p></div>`).join('')}</div>${foot('The Calm Room Workbook', '37')}</section>`,
  `<section class="page"><p class="eyebrow">Across the home</p><h2 class="serif">Materials.</h2><p class="lead">Rooms feel calm when a few materials repeat. List the ones you already own, then the one you would add.</p><table><tr><th>Material</th><th>Where it already appears</th><th>Where it could</th></tr>${['Wood', 'Linen or cotton', 'Stone or ceramic', 'Metal', 'Glass', 'Wool', '', ''].map((m) => `<tr><td>${m || '&nbsp;'}</td><td class="blank">.</td><td class="blank">.</td></tr>`).join('')}</table>${foot('The Calm Room Workbook', '38')}</section>`,
  `<section class="page"><p class="eyebrow">Keeping it</p><h2 class="serif">A maintenance rhythm.</h2><p class="lead">Set it once. Revisit it every quarter, on a date you write here now.</p><h3>Daily · under ten minutes</h3>${lines(2)}<h3>Weekly · one room reset</h3>${lines(2)}<h3>Monthly · the full reset</h3>${lines(2)}<h3>Quarterly · this workbook, again, one room</h3>${lines(2)}<h3>Next review date</h3>${lines(1)}${foot('The Calm Room Workbook', '39')}</section>`,
  `<section class="page cover"><div style="color:${C.brass}">${mark(64, C.brass)}</div><h2 class="serif" style="margin-top:.6in;font-size:34px;max-width:5in">A well-kept home is the foundation of a well-kept life.</h2><div class="rule"></div><p class="note">The Calm Room Workbook accompanies The Calm Room Method, available in paperback and on Kindle. More from the library at interiorcleanse.com.</p><div class="foot"><span>InteriorCleanse</span><span>40</span></div></section>`,
])

export const DOCS = { 'room-reset-checklist': checklist, 'the-considered-pantry': pantry, 'the-calm-room-workbook': workbook }

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
const jobs = [
  ['room-reset-checklist', checklist],
  ['the-considered-pantry', pantry],
  ['the-calm-room-workbook', workbook],
]
for (const [slug, html] of jobs) {
  await pdf(html, { out: `assets/downloads/${slug}.pdf` })
  // The storefront image is the cover page itself, at 3:4 like the cards.
  const coverOnly = html.replace(/<body>[\s\S]*?(<section class="page cover">[\s\S]*?<\/section>)[\s\S]*<\/body>/, '<body style="background:#F2ECE0">$1</body>').replace('.page{width:8.5in;height:11in', '.page{width:8.5in;height:11.33in')
  await png(coverOnly, { width: 816, height: 1088, scale: 2, out: `public/products/downloads/${slug}.jpg`, type: 'jpeg', quality: 86 })
  console.log('download', slug)
}
await close()
}
