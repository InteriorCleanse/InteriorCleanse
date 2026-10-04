import { type NextRequest } from 'next/server'
import { readPhoto } from '@/lib/server/photos'

export const runtime = 'nodejs'

/**
 * Serves a stored photo. Ids are random (128-bit). Cached for a day, not
 * forever, so a photo someone deletes or replaces stops circulating.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const photo = await readPhoto((await params).id)
  if (!photo) {
    return new Response('Not found', {
      status: 404,
      headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" },
    })
  }
  return new Response(Buffer.from(photo.bytes), {
    headers: {
      'content-type': photo.mime,
      'cache-control': 'public, max-age=86400',
      etag: `"${photo.sha256}"`,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  })
}
