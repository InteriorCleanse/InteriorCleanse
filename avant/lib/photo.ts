'use client'

/**
 * Re-encodes a photo on the device before it is stored or sent anywhere.
 * Drawing it to a canvas and saving a fresh JPEG drops every byte of EXIF,
 * including GPS location, camera serials and timestamps the user did not
 * mean to share. Also caps the size so uploads stay quick.
 */
export async function reencodePhoto(file: File, maxEdge = 1600): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
  if (!blob) throw new Error('encode failed')
  return { blob, width, height }
}
