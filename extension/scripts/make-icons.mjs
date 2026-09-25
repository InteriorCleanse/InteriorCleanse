/**
 * Draws the icons for the extension and the desktop app with no image
 * library: a PNG is a zlib stream of rows with a CRC, and Node has zlib. The
 * mark is a rounded dark tile with a signal-coloured ring — recognisable at
 * 16 px, which is the size that matters in a toolbar.
 *
 *   node extension/scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n += 1) {
    c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, pixel) {
  const rows = []
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4)
    row[0] = 0
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5, size)
      row.set([r, g, b, a], 1 + x * 4)
    }
    rows.push(row)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Signed distance to a rounded square centred in the tile. */
function roundedSquare(x, y, size, radius) {
  const half = size / 2
  const dx = Math.abs(x - half) - (half - radius)
  const dy = Math.abs(y - half) - (half - radius)
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
  return outside + Math.min(Math.max(dx, dy), 0) - radius
}

function coverage(distance) {
  // Antialias across one pixel.
  return Math.min(1, Math.max(0, 0.5 - distance))
}

const DARK = [23, 24, 28]
const SIGNAL = [79, 209, 197]

function mark(x, y, size) {
  const tile = coverage(roundedSquare(x, y, size, size * 0.22))
  const cx = size / 2
  const cy = size / 2
  const d = Math.hypot(x - cx, y - cy)
  const outer = size * 0.3
  const inner = size * 0.17
  const ring = coverage(d - outer) * (1 - coverage(d - inner))
  const r = DARK[0] + (SIGNAL[0] - DARK[0]) * ring
  const g = DARK[1] + (SIGNAL[1] - DARK[1]) * ring
  const b = DARK[2] + (SIGNAL[2] - DARK[2]) * ring
  return [Math.round(r), Math.round(g), Math.round(b), Math.round(255 * tile)]
}

/** macOS menu-bar template: black shape on transparency; the OS recolours it. */
function template(x, y, size) {
  const cx = size / 2
  const cy = size / 2
  const d = Math.hypot(x - cx, y - cy)
  const ring = coverage(d - size * 0.4) * (1 - coverage(d - size * 0.22))
  return [0, 0, 0, Math.round(255 * ring)]
}

const out = (rel, buf) => {
  const file = path.join(root, rel)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, buf)
  console.log(`${rel} ${buf.length}b`)
}

for (const size of [16, 48, 128]) out(`extension/icons/icon${size}.png`, png(size, mark))
out('desktop/assets/icon.png', png(512, mark))
out('desktop/assets/tray.png', png(32, mark))
out('desktop/assets/trayTemplate.png', png(16, template))
out('desktop/assets/trayTemplate@2x.png', png(32, template))
