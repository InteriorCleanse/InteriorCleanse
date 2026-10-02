'use client'

/**
 * The host photographs their own car, one slot per required angle. Each
 * photo is re-encoded on the device (which strips location and camera
 * data), fingerprinted, and kept with the draft. No stock or generated
 * images: what guests see is the car they will drive.
 */

import { useEffect, useRef, useState } from 'react'
import { sha256Hex } from '@/lib/evidence'
import { shortId } from '@/lib/format'
import { MIN_PHOTO_EDGE, PHOTO_ANGLES, type ListingPhoto, type PhotoAngle } from '@/lib/listing'
import { deleteListingPhoto, getListingPhoto, putListingPhoto } from '@/lib/listing-photos-db'
import { reencodePhoto } from '@/lib/photo'
import { Icon } from './Icons'
import { useToast } from './Toast'

/** Object URL for a stored listing photo, revoked when it changes. */
export function useListingPhotoUrl(id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let made: string | null = null
    let live = true
    setUrl(null)
    if (id)
      void getListingPhoto(id).then((b) => {
        if (!b || !live) return
        made = URL.createObjectURL(b)
        setUrl(made)
      })
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [id])
  return url
}

function Thumb({ id }: { id: string }) {
  const url = useListingPhotoUrl(id)
  return url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null
}

export function ListingPhotos({
  listingId,
  photos,
  onChange,
}: {
  listingId: string
  photos: ListingPhoto[]
  onChange: (next: ListingPhoto[]) => void
}) {
  const toast = useToast()
  const [busy, setBusy] = useState<PhotoAngle | null>(null)
  const inputs = useRef(new Map<PhotoAngle, HTMLInputElement>())

  const add = async (angle: PhotoAngle, file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('That isn’t a photo')
    setBusy(angle)
    try {
      const { blob, width, height } = await reencodePhoto(file, 2000)
      const photo: ListingPhoto = {
        id: shortId('ph'),
        angle,
        sha256: await sha256Hex(await blob.arrayBuffer()),
        width,
        height,
        bytes: blob.size,
        addedAt: new Date().toISOString(),
      }
      await putListingPhoto(photo.id, listingId, blob)
      const replaced = photos.find((p) => p.angle === angle)
      if (replaced) await deleteListingPhoto(replaced.id)
      onChange([...photos.filter((p) => p.angle !== angle), photo])
      if (Math.min(width, height) < MIN_PHOTO_EDGE) toast('Saved, but it’s small. A sharper photo will look better.')
    } catch {
      toast('Couldn’t read that photo. Try another one.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <ul className="evidence-grid" aria-label="Photos of your car">
      {PHOTO_ANGLES.map((a) => {
        const shot = photos.find((p) => p.angle === a.id)
        return (
          <li key={a.id} className="evidence-slot" data-done={shot ? 'true' : undefined}>
            <button
              type="button"
              className="evidence-btn"
              onClick={() => inputs.current.get(a.id)?.click()}
              disabled={busy !== null}
              aria-label={`${shot ? 'Replace' : 'Add'} ${a.label} photo`}
            >
              {shot ? <Thumb id={shot.id} /> : <Icon name={busy === a.id ? 'clock' : 'plus'} size={22} />}
            </button>
            <span className="evidence-label">
              {shot ? <Icon name="check" size={12} /> : null} {a.label}
            </span>
            <span className="evidence-hash">{shot ? `${shot.width}×${shot.height}` : a.hint}</span>
            <input
              ref={(el) => {
                if (el) inputs.current.set(a.id, el)
              }}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                void add(a.id, e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </li>
        )
      })}
    </ul>
  )
}
