/**
 * Trip evidence: the photos that settle "was that scratch already there?".
 *
 * Each photo is fingerprinted (SHA-256 of the exact bytes kept) and
 * timestamped when it is added. The set for a trip is summarised in a
 * manifest whose own SHA-256 changes if any entry is added, removed or
 * edited, so a guest and a host can each keep a copy and compare them.
 *
 * Pure except for Web Crypto, so it runs in the browser and in Node tests.
 */

export type EvidencePhase = 'check-in' | 'check-out'

export const ANGLES = [
  { id: 'front', label: 'Front' },
  { id: 'rear', label: 'Rear' },
  { id: 'left', label: 'Driver side' },
  { id: 'right', label: 'Passenger side' },
  { id: 'interior', label: 'Interior' },
  { id: 'dash', label: 'Odometer & fuel' },
] as const

export type AngleId = (typeof ANGLES)[number]['id']

export interface EvidenceMeta {
  id: string
  tripId: string
  phase: EvidencePhase
  angle: AngleId
  /** ISO time the photo was added in the app. */
  capturedAt: string
  /** SHA-256 hex of the stored image bytes. */
  sha256: string
  bytes: number
  width: number
  height: number
  type: string
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function coverage(items: EvidenceMeta[], phase: EvidencePhase): { done: AngleId[]; missing: AngleId[]; complete: boolean } {
  const have = new Set(items.filter((i) => i.phase === phase).map((i) => i.angle))
  const done = ANGLES.map((a) => a.id).filter((id) => have.has(id))
  const missing = ANGLES.map((a) => a.id).filter((id) => !have.has(id))
  return { done, missing, complete: missing.length === 0 }
}

/** Newest photo per phase and angle; older retakes stay stored but aren't current. */
export function current(items: EvidenceMeta[]): EvidenceMeta[] {
  const latest = new Map<string, EvidenceMeta>()
  for (const i of items) {
    const k = `${i.phase}:${i.angle}`
    const prev = latest.get(k)
    if (!prev || i.capturedAt > prev.capturedAt) latest.set(k, i)
  }
  return [...latest.values()]
}

export interface Manifest {
  version: 1
  tripId: string
  generatedAt: string
  photos: Pick<EvidenceMeta, 'phase' | 'angle' | 'capturedAt' | 'sha256' | 'bytes' | 'width' | 'height'>[]
  /** SHA-256 of the canonical photo list: changes if anything is edited. */
  digest: string
}

const PHASE_ORDER: EvidencePhase[] = ['check-in', 'check-out']

function canonicalPhotos(items: EvidenceMeta[]): Manifest['photos'] {
  const order = (i: EvidenceMeta) => PHASE_ORDER.indexOf(i.phase) * 100 + ANGLES.findIndex((a) => a.id === i.angle) * 10
  return [...items]
    .sort((a, b) => order(a) - order(b) || a.capturedAt.localeCompare(b.capturedAt) || a.sha256.localeCompare(b.sha256))
    .map((i) => ({ phase: i.phase, angle: i.angle, capturedAt: i.capturedAt, sha256: i.sha256, bytes: i.bytes, width: i.width, height: i.height }))
}

export async function buildManifest(tripId: string, items: EvidenceMeta[], generatedAt = new Date().toISOString()): Promise<Manifest> {
  const photos = canonicalPhotos(items.filter((i) => i.tripId === tripId))
  const digest = await sha256Hex(new TextEncoder().encode(JSON.stringify({ tripId, photos })))
  return { version: 1, tripId, generatedAt, photos, digest }
}

/** Recomputes the digest; false means the manifest was altered. */
export async function verifyManifest(m: Manifest): Promise<boolean> {
  const digest = await sha256Hex(new TextEncoder().encode(JSON.stringify({ tripId: m.tripId, photos: m.photos })))
  return digest === m.digest
}
