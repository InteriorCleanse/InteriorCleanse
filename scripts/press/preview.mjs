// Screenshot single pages of a download for review: node scripts/press/preview.mjs <slug> <page> [out]
import { DOCS } from './downloads.mjs'
import { png, close } from './lib.mjs'
const [slug, n, out = `preview-${slug}-${n}.jpg`] = process.argv.slice(2)
const html = DOCS[slug]
const pages = html.match(/<section class="page[\s\S]*?<\/section>/g)
const one = html.replace(/<body>[\s\S]*<\/body>/, `<body>${pages[Number(n) - 1]}</body>`)
await png(one, { width: 816, height: 1056, scale: 1, out, type: 'jpeg', quality: 70 })
await close()
console.log('wrote', out, 'of', pages.length)
