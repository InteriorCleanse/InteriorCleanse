import { NextResponse } from 'next/server'
import { readCatalog, writeCatalog, writePublicAsset } from '@/lib/catalog-store'
import { errorBody } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 8 * 1024 * 1024
const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

/**
 * Uploads a product image to public/products/[slug]/ and records it.
 *
 * multipart/form-data: `slug`, `kind` (hero | gallery | transparent), `file`.
 * The saved path is written straight onto the product, so an upload is one
 * step, not an upload followed by a copy-and-paste of the URL.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const slug = String(form.get('slug') ?? '')
    const kind = String(form.get('kind') ?? 'hero')
    const file = form.get('file')

    if (!/^[a-z0-9-]+$/.test(slug)) return NextResponse.json({ error: 'Invalid slug.' }, { status: 400 })
    if (!['hero', 'gallery', 'transparent'].includes(kind)) {
      return NextResponse.json({ error: 'kind must be hero, gallery, or transparent.' }, { status: 400 })
    }
    if (!(file instanceof File)) return NextResponse.json({ error: 'file is required.' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Images must be under 8 MB.' }, { status: 413 })
    const ext = TYPES[file.type]
    if (!ext) return NextResponse.json({ error: 'Only JPEG, PNG, WebP, or AVIF.' }, { status: 415 })
    if (kind === 'transparent' && ext !== 'png' && ext !== 'webp') {
      return NextResponse.json({ error: 'A transparent cut-out needs PNG or WebP (alpha).' }, { status: 415 })
    }

    const all = await readCatalog()
    const product = all.find((p) => p.slug === slug)
    if (!product) return NextResponse.json({ error: `No product with slug "${slug}".` }, { status: 404 })

    const name =
      kind === 'hero'
        ? `hero.${ext}`
        : kind === 'transparent'
          ? 'transparent.png'
          : `gallery-${Date.now().toString(36)}.${ext}`
    const bytes = Buffer.from(await file.arrayBuffer())
    const url = await writePublicAsset(`products/${slug}/${name}`, bytes, `catalog: ${kind} image for ${slug}`)

    if (kind === 'hero') product.images.hero = url
    else if (kind === 'transparent') product.images.transparent = url
    else product.images.gallery = [...product.images.gallery, url]
    product.updatedAt = new Date().toISOString()
    const commit = await writeCatalog(all, `catalog: record ${kind} image for ${slug}`)

    return NextResponse.json({ url, product, commit })
  } catch (e) {
    console.error('[admin/products/upload]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}
