// Front covers for the founder's five titles, in the house system: cream
// stock, the title set large in the display face, a colour field for the
// series, the threshold mark above. 1600×2400 (2:3), which is what Amazon's
// listing and the site's 3:4 card both crop from cleanly.
import { readFileSync, writeFileSync } from 'node:fs'
import { BASE_CSS, C, mark } from './brand.mjs'
import { png, close } from './lib.mjs'

const books = JSON.parse(readFileSync('content/books.json', 'utf8'))
const TINT = {
  'the-calm-room-method': C.sage,
  'small-home-reset': C.lapis,
  'edited-kitchen': C.clay,
  'the-rested-body': C.aubergine,
  'clean-air-clean-home': C.verdigris,
}

const cover = (b, tint) => `<!doctype html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
body{width:1600px;height:2400px;overflow:hidden;position:relative;background:${C.cream}}
.frame{position:absolute;inset:64px;border:1.5px solid rgba(27,24,21,.16)}
.field{position:absolute;left:64px;right:64px;bottom:64px;height:860px;background:${tint}}
.mark{position:absolute;top:150px;left:0;right:0;display:grid;place-items:center;color:${C.brass}}
.series{position:absolute;top:262px;left:0;right:0;text-align:center;font-size:22px;letter-spacing:.42em;text-transform:uppercase;font-weight:600;color:${C.dim}}
.title{position:absolute;left:150px;right:150px;top:520px;font-size:${b.title.length > 18 ? 168 : 196}px;line-height:.94;letter-spacing:-.025em;font-weight:500;color:${C.ink}}
.sub{position:absolute;left:150px;right:150px;top:${b.title.length > 18 ? 1120 : 1080}px;font-size:34px;line-height:1.35;color:${C.muted};max-width:1100px}
.rule{position:absolute;left:150px;top:1330px;width:180px;height:2px;background:${C.brass}}
.hook{position:absolute;left:150px;right:150px;top:1660px;color:#fff;font-size:40px;line-height:1.45;max-width:1180px;font-weight:400}
.author{position:absolute;left:150px;bottom:150px;color:rgba(255,255,255,.9);font-size:26px;letter-spacing:.4em;text-transform:uppercase;font-weight:600}
.pk{position:absolute;right:150px;bottom:150px;color:rgba(255,255,255,.75);font-size:22px;letter-spacing:.3em;text-transform:uppercase;font-weight:500}
</style></head><body>
<div class="frame"></div>
<div class="mark">${mark(120, C.brass)}</div>
<div class="series">InteriorCleanse · ${b.track === 'health' ? 'For the body' : 'For the mind'}</div>
<h1 class="title serif">${b.title}</h1>
<p class="sub">${b.subtitle}</p>
<div class="rule"></div>
<div class="field"></div>
<p class="hook serif">${b.hook}</p>
<p class="author">InteriorCleanse</p>
<p class="pk">Paperback · Kindle</p>
</body></html>`

for (const b of books) {
  const tint = TINT[b.slug] ?? C.brass
  const html = cover(b, tint)
  await png(html, { width: 1600, height: 2400, out: `public/products/covers/${b.slug}.jpg`, type: 'jpeg', quality: 86 })
  console.log('cover', b.slug, tint)
}
await close()
