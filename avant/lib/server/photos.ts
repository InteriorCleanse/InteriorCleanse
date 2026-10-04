/**
 * Photos people upload: listing photos (by hosts, of their own car) and
 * profile photos. Stored as bytes in Postgres, which keeps the whole app on
 * one service; move to object storage when volume calls for it.
 *
 * Only JPEGs are accepted, checked by parsing the file itself. The browser
 * re-encodes every upload (dropping location data), and the server strips
 * all metadata again before storing, so no photo ever carries GPS.
 */

import { createHash } from 'node:crypto'
import { randomId } from '../security/crypto.ts'
import { MIN_PHOTO_EDGE, PHOTO_ANGLES, type PhotoAngle } from '../listing.ts'
import { db } from './db.ts'
import { jpegSize, MAX_EDGE, stripJpegMetadata } from './jpeg.ts'

export const MAX_PHOTO_BYTES = 6 * 1024 * 1024

export class PhotoError extends Error {}

export interface StoredPhoto {
  id: string
  angle: PhotoAngle | null
  width: number
  height: number
  sha256: string
}

export async function savePhoto(input: { ownerId: string; kind: 'listing' | 'avatar'; angle?: string | null; bytes: Uint8Array }): Promise<StoredPhoto> {
  if (input.bytes.length === 0 || input.bytes.length > MAX_PHOTO_BYTES) throw new PhotoError('Photos must be under 6 MB.')
  const size = jpegSize(input.bytes)
  const bytes = size ? stripJpegMetadata(input.bytes) : null
  if (!size || !bytes) throw new PhotoError('That file is not a photo we can use.')
  if (Math.max(size.width, size.height) > MAX_EDGE) throw new PhotoError('That photo is larger than we can use. Try a smaller copy.')
  if (Math.min(size.width, size.height) < (input.kind === 'avatar' ? 200 : MIN_PHOTO_EDGE)) throw new PhotoError('That photo is too small to look sharp.')
  const angle = input.kind === 'listing' ? (PHOTO_ANGLES.find((a) => a.id === input.angle)?.id ?? null) : null
  if (input.kind === 'listing' && !angle) throw new PhotoError('Unknown photo angle.')
  const photo: StoredPhoto = { id: randomId(16), angle, ...size, sha256: createHash('sha256').update(bytes).digest('hex') }
  await (await db()).query(
    `insert into photos (id, owner_id, kind, angle, mime, width, height, sha256, bytes) values ($1, $2, $3, $4, 'image/jpeg', $5, $6, $7, $8)`,
    [photo.id, input.ownerId, input.kind, angle, size.width, size.height, photo.sha256, Buffer.from(bytes)],
  )
  return photo
}

export async function readPhoto(id: string): Promise<{ bytes: Uint8Array; mime: string; sha256: string } | null> {
  if (!/^[\w-]{10,40}$/.test(id)) return null
  const [row] = await (await db()).query<{ bytes: Uint8Array; mime: string; sha256: string }>(`select bytes, mime, sha256 from photos where id = $1`, [id])
  return row ? { bytes: new Uint8Array(row.bytes), mime: row.mime, sha256: row.sha256 } : null
}

/** The owner's own listing photos by id, for attaching to a listing. */
export async function ownListingPhotos(ownerId: string, ids: string[]): Promise<StoredPhoto[]> {
  if (!ids.length) return []
  const rows = await (await db()).query<{ id: string; angle: PhotoAngle; width: number; height: number; sha256: string }>(
    `select id, angle, width, height, sha256 from photos where owner_id = $1 and kind = 'listing' and id = any($2::text[])`,
    [ownerId, ids],
  )
  return rows.map((r) => ({ id: r.id, angle: r.angle, width: r.width, height: r.height, sha256: r.sha256 }))
}

/** Deletes one of the owner's own photos. */
export async function deletePhoto(ownerId: string, id: string): Promise<void> {
  await (await db()).query(`delete from photos where id = $1 and owner_id = $2`, [id, ownerId])
}
