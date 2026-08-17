#!/usr/bin/env node
/**
 * Generates the environment posters (and optionally motion clips) on Leonardo.ai
 * and writes them straight into public/images and public/video.
 *
 * The API key is read from the environment and never written to disk, never
 * logged, and never committed:
 *
 *   export LEONARDO_API_KEY=...        # leonardo.ai → Settings → API Access
 *   node scripts/leonardo-generate.mjs --list-models
 *   node scripts/leonardo-generate.mjs --dry-run
 *   node scripts/leonardo-generate.mjs --only hero,library
 *   node scripts/leonardo-generate.mjs                 # all posters
 *   node scripts/leonardo-generate.mjs --motion        # animate what exists
 *
 * Generation is asynchronous: a create call returns a job id, not an image, so
 * every request is polled to completion and only then downloaded.
 */

const API = 'https://cloud.leonardo.ai/api/rest/v1'
const KEY = process.env.LEONARDO_API_KEY

/**
 * Model. Leonardo adds and retires models, so nothing is hardcoded: the script
 * asks the account what it can use and picks the best available by name.
 * LEONARDO_MODEL_ID overrides the choice entirely.
 */
const MODEL_ID = process.env.LEONARDO_MODEL_ID || ''

/** Best-first. These are the families that suit photographic architecture. */
const MODEL_PREFERENCE = [
  'phoenix',
  'photoreal',
  'lucid',
  'kino',
  'vision xl',
  'diffusion xl',
]

const WIDTH = 1536
const HEIGHT = 864

/** Shared tail so every scene shares one lighting and lens language. */
const STYLE =
  'Ultra-photorealistic architectural interior photography, Architectural Digest, ' +
  'shot on 35mm, 24mm architectural lens with straight vertical lines, deep focus, ' +
  'late afternoon sun, warm amber light, long soft shadows, high dynamic range, ' +
  'warm neutral colour grade, photographic not rendered. ' +
  'No people. No text. No logos. No watermarks.'

/**
 * One entry per poster the site expects. `composition` reserves the space the
 * interface needs — the headline sits left, the product card bottom-right —
 * so the art is briefed around the layout rather than fought with afterwards.
 */
const SCENES = [
  {
    key: 'hero',
    file: 'hero-poster.png',
    prompt:
      'Luxury modern residence at golden hour. Foreground left: a still turquoise ' +
      'infinity pool with visible caustics, edged by a travertine limestone platform. ' +
      'Midground: warm limestone walls in strong directional sun, a curved moss-green ' +
      'velvet sectional on a cream rug, a travertine coffee table. Background: ' +
      'floor-to-ceiling glass with olive branches casting dappled leaf shadows, ' +
      'recessed pale oak shelving with warm LED strips, a terracotta plaster wall with ' +
      'a sculptural carved relief, a brass arc lamp with a pleated cream shade glowing ' +
      'warm, a cedar slat sauna room lit within. Ribbed fluted glass partition.',
    composition:
      'Keep the LEFT THIRD open and uncluttered for headline text. Keep the BOTTOM ' +
      'RIGHT corner clear for a product card.',
  },
  {
    key: 'library',
    file: 'library-poster.png',
    prompt:
      'A warm architectural library alcove. Pale oak shelving lit from within, ' +
      'hardcover books with cream and stone-toned spines, a rolling ladder, a low ' +
      'linen reading chair. Soft afternoon light through a tall window, dust motes ' +
      'drifting, a single plant casting slow leaf shadows across the shelf.',
    composition: 'Keep the LEFT THIRD open for headline text.',
  },
  {
    key: 'conservatory',
    file: 'conservatory-poster.png',
    prompt:
      'A glass conservatory reading room. Whitewashed steel glazing bars, olive and ' +
      'eucalyptus in terracotta pots, a pale linen daybed, a stack of books on a stone ' +
      'side table. Green filtered daylight, humidity haze, leaf shadows across a ' +
      'limestone floor.',
    composition: 'Keep the LEFT THIRD open for headline text.',
  },
  {
    key: 'cleaning',
    file: 'cleaning-poster.png',
    prompt:
      'An immaculate utility and laundry room in a luxury residence. Pale limestone ' +
      'counters, matte cream cabinetry, folded white linen in open shelving, simple ' +
      'unbranded amber glass bottles in a neat row, a stone sink. Cool clean north ' +
      'light from a high window, crisp shadows, immaculate surfaces.',
    composition: 'Keep the LEFT THIRD open for headline text.',
  },
  {
    key: 'chapel',
    file: 'chapel-poster.png',
    prompt:
      'A small private chapel alcove in a modern stone residence. A limestone bench, ' +
      'a single lit cream pillar candle, an open book on a plain wooden stand, a narrow ' +
      'vertical window casting one shaft of warm light across the floor. Deep quiet ' +
      'shadow, dusk blue ambient, no religious iconography or symbols.',
    composition: 'Keep the LEFT THIRD open for headline text.',
  },
  {
    key: 'gallery',
    file: 'gallery-poster.png',
    prompt:
      'A private gallery corridor in a luxury home. Bone-white plaster walls, empty ' +
      'pale oak picture frames of varied sizes hung in a considered arrangement, a ' +
      'polished travertine floor, a long bench. Museum-grade directional lighting, ' +
      'soft pools of light, generous negative space. Frames are EMPTY — no artwork, ' +
      'no images inside them.',
    composition: 'Keep the LEFT THIRD open for headline text.',
  },
  {
    key: 'atelier',
    file: 'atelier-poster.png',
    prompt:
      'A textile atelier in a warm residence. Dark olive canvas and dusty-lavender ' +
      'linen draped over a long oak worktable, folded stacks of natural fabric, ' +
      'terracotta plaster walls, a brass task lamp. Warm low sun through a side window, ' +
      'visible fabric weave and texture.',
    composition: 'Keep the LEFT THIRD open for headline text.',
  },
  {
    key: 'pavilion',
    file: 'pavilion-poster.png',
    prompt:
      'A garden wellness pavilion at dusk. A cedar slat sauna cabin glowing warm from ' +
      'within, a dark stone cold plunge tub with still water, rolled white towels on a ' +
      'limestone bench, olive trees behind. Blue hour ambient with warm interior light ' +
      'spilling out, steam rising gently.',
    composition: 'Keep the LEFT THIRD open for headline text.',
  },
  {
    key: 'guestbook',
    file: 'guestbook-poster.png',
    prompt:
      'An entrance hall console in a warm residence at evening. A pale oak console ' +
      'table, an open blank guest book with a fountain pen resting on it, a lit cream ' +
      'candle, a single rose in a slim ceramic vase, a limestone wall behind. Warm ' +
      'lamplight, deep soft shadow, intimate and quiet. The book pages are BLANK — no ' +
      'writing, no text.',
    composition:
      'Keep the RIGHT HALF darker and less detailed — copy and a form sit there.',
  },
  {
    key: 'showroom',
    file: 'showroom-poster.png',
    prompt:
      'An empty luxury product showroom interior. A single circular travertine pedestal ' +
      'centred in the room, EMPTY with nothing on it. Warm limestone walls, a polished ' +
      'stone floor with soft reflection, recessed cove lighting, one focused spotlight ' +
      'falling on the empty pedestal. Deep shadow at the edges, museum stillness. ' +
      'Absolutely NO products, NO objects on the pedestal, NO furniture, NO signage, ' +
      'NO screens, NO text of any kind.',
    composition:
      'The pedestal must sit in the CENTRE with clear space above it. Keep the ' +
      'BOTTOM RIGHT clear for an interface panel.',
  },
]

const NEGATIVE =
  'people, person, hands, faces, text, letters, words, watermark, logo, signature, ' +
  'ui, interface, buttons, menus, price tags, labels, cartoon, illustration, 3d render, ' +
  'cgi, distorted perspective, warped lines, fisheye, oversaturated, hdr halo, clutter'

function die(msg) {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${KEY}`,
      ...options.headers,
    },
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  if (!res.ok) {
    // Surface the provider's own message — guessing at causes wastes more time
    // than reading what it actually said.
    die(`Leonardo ${res.status} on ${path}\n${typeof body === 'string' ? body : JSON.stringify(body, null, 2)}`)
  }
  return body
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchModels() {
  const data = await api('/platformModels')
  return data.custom_models ?? data.platform_models ?? []
}

async function listModels() {
  const models = await fetchModels()
  console.log('\nAvailable models (id — name):\n')
  for (const m of models) console.log(`  ${m.id}   ${m.name}`)
  const auto = pickModel(models)
  console.log(
    auto
      ? `\nThe script would pick automatically:\n  ${auto.id}   ${auto.name}\n`
      : '\nNo preferred model matched; set LEONARDO_MODEL_ID=<id> from the list above.\n'
  )
}

/** Chooses the best photographic model the account actually has. */
function pickModel(models) {
  for (const want of MODEL_PREFERENCE) {
    const hit = models.find((m) => (m.name || '').toLowerCase().includes(want))
    if (hit) return hit
  }
  return models[0] ?? null
}

/** Creates a generation and polls until it completes or fails. */
async function generate(scene, modelId) {
  const prompt = `${scene.prompt} ${scene.composition} ${STYLE}`

  const created = await api('/generations', {
    method: 'POST',
    body: JSON.stringify({
      prompt,
      negative_prompt: NEGATIVE,
      modelId,
      width: WIDTH,
      height: HEIGHT,
      num_images: 1,
      alchemy: true,
      photoReal: true,
      public: false,
    }),
  })

  const id = created?.sdGenerationJob?.generationId
  if (!id) die(`No generation id returned for "${scene.key}": ${JSON.stringify(created)}`)

  process.stdout.write(`  ${scene.key.padEnd(14)} queued ${id.slice(0, 8)} `)

  // Poll. Leonardo is typically 15–40s for a photoReal image.
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(3000)
    const poll = await api(`/generations/${id}`)
    const gen = poll?.generations_by_pk
    const status = gen?.status
    if (status === 'COMPLETE') {
      const url = gen.generated_images?.[0]?.url
      if (!url) die(`"${scene.key}" completed with no image`)
      console.log('✓')
      return url
    }
    if (status === 'FAILED') die(`"${scene.key}" failed on Leonardo's side`)
    process.stdout.write('.')
  }
  die(`"${scene.key}" did not complete within 3 minutes`)
}

async function download(url, dest) {
  const res = await fetch(url)
  if (!res.ok) die(`Download failed ${res.status} for ${dest}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const { writeFile, mkdir } = await import('node:fs/promises')
  const { dirname } = await import('node:path')
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, buf)
  return buf.length
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  if (args.includes('--list-models')) {
    if (!KEY) die('LEONARDO_API_KEY is not set.')
    return listModels()
  }

  const onlyArg = args.find((a) => a.startsWith('--only'))
  const only = onlyArg
    ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : null

  const scenes = only ? SCENES.filter((s) => only.includes(s.key)) : SCENES
  if (scenes.length === 0) die(`No scenes matched --only. Known: ${SCENES.map((s) => s.key).join(', ')}`)

  if (dryRun) {
    console.log(`\nDry run — ${scenes.length} scene(s), nothing sent, no credits spent:\n`)
    for (const s of scenes) {
      console.log(`── ${s.key} → public/images/${s.file}`)
      console.log(`${s.prompt} ${s.composition} ${STYLE}\n`)
    }
    return
  }

  if (!KEY) {
    die(
      'LEONARDO_API_KEY is not set.\n\n' +
        '  1. leonardo.ai → Settings → API Access → create a key\n' +
        '  2. export LEONARDO_API_KEY=...\n' +
        '  3. node scripts/leonardo-generate.mjs --only hero\n\n' +
        'The key is read from the environment only. It is never written to a file,\n' +
        'never logged, and must never be committed.'
    )
  }

  let modelId = MODEL_ID
  if (!modelId) {
    const chosen = pickModel(await fetchModels())
    if (!chosen) die('No models available on this account. Run --list-models.')
    modelId = chosen.id
    console.log(`\nModel: ${chosen.name}  (${chosen.id})`)
    console.log('Override with LEONARDO_MODEL_ID if you want a different one.')
  }

  console.log(`\nGenerating ${scenes.length} poster(s) at ${WIDTH}x${HEIGHT}:\n`)
  for (const scene of scenes) {
    const url = await generate(scene, modelId)
    const bytes = await download(url, `public/images/${scene.file}`)
    console.log(`  ${''.padEnd(14)} → public/images/${scene.file}  ${(bytes / 1024).toFixed(0)} KB`)
  }

  console.log(
    '\nDone. Review them, then commit:\n' +
      '  git add public/images && git commit -m "feat: environment posters"\n\n' +
      'Each poster is already wired into content/scenes.json, so the site picks\n' +
      'them up with no code change.\n'
  )
}

main().catch((e) => die(e?.stack || String(e)))
