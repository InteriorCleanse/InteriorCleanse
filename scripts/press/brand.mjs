// Shared brand ingredients for everything the press renders: the mark, the
// palette, and the self-hosted fonts (copied from the build so this runs
// without one). Fraunces carries the SOFT/WONK axes the site uses.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const font = (f) => `url("data:font/woff2;base64,${readFileSync(path.join(here, 'fonts', f)).toString('base64')}") format("woff2")`

export const FONT_CSS = `
@font-face{font-family:"Fraunces";font-weight:100 900;font-style:normal;src:${font('cb9f64d62d112b41-s.p.woff2')},${font('287637279c44650d-s.woff2')},${font('b387097da7407747-s.woff2')};}
@font-face{font-family:"Jakarta";font-weight:200 800;font-style:normal;src:${font('636a5ac981f94f8b-s.p.woff2')},${font('6fe53d21e6e7ebd8-s.woff2')},${font('8ebc6e9dde468c4a-s.woff2')},${font('9e7b0a821b9dfcb4-s.woff2')};}
`

export const C = {
  cream: '#F2ECE0', paper: '#FAF6EE', ink: '#1B1815', brass: '#7E6234', gold: '#B08D57', goldHi: '#E6CB96',
  line: 'rgba(27,24,21,0.14)', dim: 'rgba(27,24,21,0.62)', muted: 'rgba(27,24,21,0.74)',
  sage: '#3F6A4C', lapis: '#2B4C7E', clay: '#A4593A', aubergine: '#5A3F72', verdigris: '#2E5E58',
}

/** The threshold mark. `color` for strokes, `sun` for the disc. */
export const mark = (size, color = 'currentColor', sun = color) => `
<svg viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M11 42 V23 A13 13 0 0 1 37 23 V42"/><path d="M8.5 42 H39.5" opacity=".55"/><path d="M17.5 32 H30.5"/>
  <path d="M19 32 A5 5 0 0 1 29 32 Z" fill="${sun}" stroke="none" opacity=".95"/>
  <g opacity=".75" stroke-width="1.7"><path d="M24 19.5 V22.5"/><path d="M17.6 22.4 L19.8 24.6"/><path d="M30.4 22.4 L28.2 24.6"/></g>
</svg>`

export const BASE_CSS = `
${FONT_CSS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:${C.cream};color:${C.ink};font-family:"Jakarta",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.serif{font-family:"Fraunces",Georgia,serif;font-variation-settings:"SOFT" 55,"opsz" 144}
.swash{font-family:"Fraunces",Georgia,serif;font-variation-settings:"SOFT" 100,"WONK" 1,"opsz" 144}
.caps{text-transform:uppercase;letter-spacing:.28em;font-weight:600;font-size:10px}
`
