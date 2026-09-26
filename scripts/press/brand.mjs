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

/** The seal. `color` for rings and letters. */
export const mark = (size, color = 'currentColor') => `
<svg viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" aria-hidden="true">
  <circle cx="24" cy="24" r="22" stroke="${color}" stroke-width="1.3"/>
  <circle cx="24" cy="24" r="18.6" stroke="${color}" stroke-width=".6" opacity=".7"/>
  <text x="24" y="31.6" text-anchor="middle" fill="${color}" font-size="21" font-weight="500" style="font-family:'Fraunces',Georgia,serif;font-variation-settings:'SOFT' 100,'WONK' 1,'opsz' 144;letter-spacing:-1px">IC</text>
</svg>`

export const BASE_CSS = `
${FONT_CSS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:${C.cream};color:${C.ink};font-family:"Jakarta",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.serif{font-family:"Fraunces",Georgia,serif;font-variation-settings:"SOFT" 55,"opsz" 144}
.swash{font-family:"Fraunces",Georgia,serif;font-variation-settings:"SOFT" 100,"WONK" 1,"opsz" 144}
.caps{text-transform:uppercase;letter-spacing:.28em;font-weight:600;font-size:10px}
`
