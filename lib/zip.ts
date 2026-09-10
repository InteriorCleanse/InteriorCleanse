/**
 * A store-only ZIP writer.
 *
 * Obsidian is a folder of Markdown files, and the only way to hand a person a
 * folder over HTTP is an archive. Adding an archiver dependency for that is
 * the wrong trade: the format's uncompressed variant is a few dozen lines, has
 * been stable since 1989, and every unarchiver on every platform opens it.
 * Markdown compresses well but a briefing is kilobytes; nobody is waiting on
 * the download.
 *
 * Store-only means no deflate: each file's bytes are copied verbatim with a
 * local header before it and a central directory after everything. The one
 * piece of arithmetic is the CRC-32 every entry must carry, computed with the
 * standard table so it matches what `unzip -t` expects.
 *
 * Filenames are written as UTF-8 with the flag that says so (bit 11), which is
 * what makes "Résumé 2026.md" open with its accent on macOS and Windows alike.
 */

export type ZipEntry = {
  /** Forward slashes for directories, no leading slash. */
  name: string
  content: string | Uint8Array
  /** Defaults to now. Stored in DOS format, so two-second resolution. */
  modifiedAt?: Date
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getUTCFullYear())
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  }
}

/**
 * Typed as `Uint8Array<ArrayBuffer>` rather than the bare `Uint8Array`: the
 * fresh allocation below is always backed by an ArrayBuffer, and saying so is
 * what lets the result go straight into a `Response` body under the current
 * DOM typings, which refuse an `ArrayBufferLike` view.
 */
export function buildZip(entries: readonly ZipEntry[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const name = encoder.encode(entry.name.replace(/^\/+/, ''))
    const data = typeof entry.content === 'string' ? encoder.encode(entry.content) : entry.content
    const crc = crc32(data)
    const { time, date } = dosDateTime(entry.modifiedAt ?? new Date())

    const local = new DataView(new ArrayBuffer(30 + name.length))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true) // version needed
    local.setUint16(6, 0x0800, true) // UTF-8 names
    local.setUint16(8, 0, true) // stored
    local.setUint16(10, time, true)
    local.setUint16(12, date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, name.length, true)
    local.setUint16(28, 0, true)
    new Uint8Array(local.buffer).set(name, 30)

    const central = new DataView(new ArrayBuffer(46 + name.length))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, 20, true) // made by
    central.setUint16(6, 20, true) // needed
    central.setUint16(8, 0x0800, true)
    central.setUint16(10, 0, true)
    central.setUint16(12, time, true)
    central.setUint16(14, date, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, data.length, true)
    central.setUint32(24, data.length, true)
    central.setUint16(28, name.length, true)
    central.setUint16(30, 0, true) // extra
    central.setUint16(32, 0, true) // comment
    central.setUint16(34, 0, true) // disk
    central.setUint16(36, 0, true) // internal attrs
    central.setUint32(38, 0, true) // external attrs
    central.setUint32(42, offset, true)
    new Uint8Array(central.buffer).set(name, 46)

    locals.push(new Uint8Array(local.buffer), data)
    centrals.push(new Uint8Array(central.buffer))
    offset += 30 + name.length + data.length
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(4, 0, true)
  end.setUint16(6, 0, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)
  end.setUint16(20, 0, true)

  const total = offset + centralSize + 22
  const out = new Uint8Array(new ArrayBuffer(total))
  let at = 0
  for (const chunk of [...locals, ...centrals, new Uint8Array(end.buffer)]) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}
