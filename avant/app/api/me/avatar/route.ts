import { NextResponse, type NextRequest } from 'next/server'
import { ownProfile, updateProfile } from '@/lib/server/accounts'
import { deletePhoto, MAX_PHOTO_BYTES, PhotoError, savePhoto } from '@/lib/server/photos'
import { currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readBytes } from '@/lib/security/request'

export const runtime = 'nodejs'

/** The profile photo: raw JPEG bytes, re-encoded on the device first. */
export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.upload, limitKey: 'upload', requireJson: false })
  if (blocked) return blocked
  if (req.headers.get('content-type') !== 'image/jpeg') return problem(415, 'Send a JPEG.')
  const user = await currentUser()
  if (!user) return signInRequired()
  try {
    const photo = await savePhoto({ ownerId: user.id, kind: 'avatar', bytes: await readBytes(req, MAX_PHOTO_BYTES) })
    const next = await updateProfile(user.id, { avatarPhotoId: photo.id })
    // The old photo stops being served the moment it's replaced.
    if (user.avatarPhotoId && user.avatarPhotoId !== photo.id) await deletePhoto(user.id, user.avatarPhotoId)
    return NextResponse.json({ user: next ? ownProfile(next) : null })
  } catch (err) {
    return problem(err instanceof PhotoError ? 400 : 413, err instanceof PhotoError ? err.message : 'Photos must be under 6 MB.')
  }
}
