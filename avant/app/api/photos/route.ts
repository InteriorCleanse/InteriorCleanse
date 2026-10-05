import { NextResponse, type NextRequest } from 'next/server'
import { MAX_PHOTO_BYTES, PhotoError, savePhoto } from '@/lib/server/photos'
import { currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readBytes } from '@/lib/security/request'

export const runtime = 'nodejs'

/** A listing photo (?angle=front) or a claim photo (?kind=claim): raw JPEG bytes, re-encoded on the device. */
export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.upload, limitKey: 'upload', requireJson: false })
  if (blocked) return blocked
  if (req.headers.get('content-type') !== 'image/jpeg') return problem(415, 'Send a JPEG.')
  const user = await currentUser()
  if (!user) return signInRequired()
  try {
    const kind = req.nextUrl.searchParams.get('kind') === 'claim' ? 'claim' : 'listing'
    const photo = await savePhoto({ ownerId: user.id, kind, angle: req.nextUrl.searchParams.get('angle'), bytes: await readBytes(req, MAX_PHOTO_BYTES) })
    return NextResponse.json({ photo })
  } catch (err) {
    return problem(err instanceof PhotoError ? 400 : 413, err instanceof PhotoError ? err.message : 'Photos must be under 6 MB.')
  }
}
