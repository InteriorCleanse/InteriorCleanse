import { type NextRequest } from 'next/server'
import { readPhoto } from '@/lib/server/photos'

export const runtime = 'nodejs'

/** Serves a stored photo. Ids are random and the bytes never change. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const photo = await readPhoto((await params).id)
  if (!photo) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
  return new Response(Buffer.from(photo.bytes), {
    headers: {
      'content-type': photo.mime,
      'cache-control': 'public, max-age=31536000, immutable',
      etag: `"${photo.sha256}"`,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  })
}
