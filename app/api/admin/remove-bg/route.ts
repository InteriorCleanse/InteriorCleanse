import { NextResponse } from 'next/server'
import { readCatalog, readPublicAsset, writeCatalog, writePublicAsset } from '@/lib/catalog-store'
import { errorBody } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Produces the transparent cut-out the showroom pedestal needs.
 *
 * Body: `{ slug }` (uses the product's hero image) or multipart with `slug`
 * and `file`. Calls remove.bg when REMOVEBG_API_KEY is set; otherwise falls
 * back to a white-threshold cutout, which is honest about what it is — good
 * for a product shot on a clean white sweep, useless on a lifestyle photo, and
 * the response says which path ran so nobody mistakes one for the other.
 *
 * The result is saved to public/products/[slug]/transparent.png and recorded
 * on the product.
 */
export async function POST(req: Request) {
  try {
    let slug = ''
    let source: Buffer | null = null
    const ctype = req.headers.get('content-type') ?? ''
    if (ctype.includes('multipart/form-data')) {
      const form = await req.formData()
      slug = String(form.get('slug') ?? '')
      const file = form.get('file')
      if (file instanceof File) source = Buffer.from(await file.arrayBuffer())
    } else {
      const body = (await req.json()) as { slug?: string }
      slug = String(body.slug ?? '')
    }
    if (!/^[a-z0-9-]+$/.test(slug)) return NextResponse.json({ error: 'Invalid slug.' }, { status: 400 })

    const all = await readCatalog()
    const product = all.find((p) => p.slug === slug)
    if (!product) return NextResponse.json({ error: `No product with slug "${slug}".` }, { status: 404 })

    if (!source) {
      const hero = product.images.hero
      if (!hero) return NextResponse.json({ error: 'The product has no hero image to cut out.' }, { status: 400 })
      // A site-relative path is read from the store directly: an upload made
      // after the current deploy is not yet served, but it is already there.
      source = hero.startsWith('/') ? await readPublicAsset(hero) : await fetchImage(hero)
      if (!source) return NextResponse.json({ error: `Could not read ${hero}.` }, { status: 404 })
    }

    const key = process.env.REMOVEBG_API_KEY
    const { png, method } = key ? await viaRemoveBg(source, key) : await viaThreshold(source)

    const url = await writePublicAsset(`products/${slug}/transparent.png`, png, `catalog: cut-out for ${slug}`)
    product.images.transparent = url
    product.updatedAt = new Date().toISOString()
    const commit = await writeCatalog(all, `catalog: record cut-out for ${slug}`)

    return NextResponse.json({
      url,
      method,
      note:
        method === 'threshold'
          ? 'No REMOVEBG_API_KEY set, so this is a white-threshold cutout. It only works on product shots against a clean white background — check the result before publishing.'
          : 'Cut out by remove.bg.',
      commit,
    })
  } catch (e) {
    console.error('[admin/remove-bg]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}

async function fetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not fetch the hero image (${res.status}).`)
  return Buffer.from(await res.arrayBuffer())
}

async function viaRemoveBg(image: Buffer, key: string): Promise<{ png: Buffer; method: 'remove.bg' }> {
  const form = new FormData()
  form.append('image_file', new Blob([new Uint8Array(image)]), 'image')
  form.append('size', 'auto')
  form.append('format', 'png')
  const res = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': key },
    body: form,
  })
  if (!res.ok) throw new Error(`remove.bg failed: ${res.status} ${await res.text()}`)
  return { png: Buffer.from(await res.arrayBuffer()), method: 'remove.bg' }
}

/**
 * Flood-fills transparency inward from the edges wherever the pixel is near
 * white, so a white object in the middle survives as long as it is enclosed by
 * something that is not white. Pure JS; decodes PNG and JPEG only.
 */
async function viaThreshold(image: Buffer): Promise<{ png: Buffer; method: 'threshold' }> {
  const { PNG } = await import('pngjs')
  const isPng = image[0] === 0x89 && image[1] === 0x50
  let width: number
  let height: number
  let data: Uint8Array

  if (isPng) {
    const decoded = PNG.sync.read(image)
    width = decoded.width
    height = decoded.height
    data = new Uint8Array(decoded.data)
  } else {
    const jpeg = await import('jpeg-js')
    const decoded = jpeg.decode(image, { useTArray: true, formatAsRGBA: true })
    width = decoded.width
    height = decoded.height
    data = decoded.data
  }

  const THRESH = 232
  const nearWhite = (i: number) => data[i] >= THRESH && data[i + 1] >= THRESH && data[i + 2] >= THRESH
  const visited = new Uint8Array(width * height)
  const stack: number[] = []
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const idx = y * width + x
    if (visited[idx]) return
    if (!nearWhite(idx * 4)) return
    visited[idx] = 1
    stack.push(idx)
  }
  for (let x = 0; x < width; x++) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    push(0, y)
    push(width - 1, y)
  }
  while (stack.length) {
    const idx = stack.pop()!
    const x = idx % width
    const y = (idx - x) / width
    data[idx * 4 + 3] = 0
    push(x + 1, y)
    push(x - 1, y)
    push(x, y + 1)
    push(x, y - 1)
  }

  // Soften the edge by one pixel so the cut does not read as a stencil.
  const out = new Uint8Array(data)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      if (data[i * 4 + 3] === 0) continue
      let clear = 0
      for (const n of [i - 1, i + 1, i - width, i + width]) if (data[n * 4 + 3] === 0) clear++
      if (clear) out[i * 4 + 3] = Math.max(60, 255 - clear * 60)
    }
  }

  const png = new PNG({ width, height })
  png.data = Buffer.from(out)
  return { png: PNG.sync.write(png), method: 'threshold' }
}
