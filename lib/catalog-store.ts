import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { CatalogProduct } from './catalog-schema'

/**
 * Where catalog writes go.
 *
 * There is no database. The repository is the database: content/catalog.json
 * and public/products/** are the records, and a deploy is how they reach the
 * site. That is not a workaround — it is the property that lets every product
 * change be reviewed, diffed, and reverted like code.
 *
 * Two backends, chosen by where the code is running:
 *
 * - **Local** (`next dev`, or any writable checkout): writes straight to disk.
 *   Commit and push as usual.
 * - **Vercel** (read-only, ephemeral filesystem): writes go through the GitHub
 *   Contents API as commits to the deploy branch. Vercel picks the commit up
 *   and redeploys; the change is live in about a minute. This needs
 *   `GITHUB_TOKEN` (a fine-grained token with *Contents: read and write* on
 *   this one repository) plus optionally `GITHUB_REPO` and `GITHUB_BRANCH`.
 *
 * Reads on Vercel come from GitHub too, so the admin sees an edit immediately
 * rather than after the redeploy. The public site always reads the JSON that
 * was bundled at build time.
 */

const CATALOG_PATH = 'content/catalog.json'
const ROOT = process.cwd()

const onVercel = () => Boolean(process.env.VERCEL) || process.env.CATALOG_BACKEND === 'github'

const github = () => {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO || 'InteriorCleanse/InteriorCleanse'
  const branch = process.env.GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || 'main'
  return { token, repo, branch }
}

export type StoreInfo = {
  backend: 'filesystem' | 'github'
  writable: boolean
  /** What to do when it is not writable. */
  blocker: string | null
  target: string
}

export function storeInfo(): StoreInfo {
  if (!onVercel()) {
    return { backend: 'filesystem', writable: true, blocker: null, target: CATALOG_PATH }
  }
  const { token, repo, branch } = github()
  return {
    backend: 'github',
    writable: Boolean(token),
    blocker: token
      ? null
      : 'Writes on Vercel commit to GitHub and need GITHUB_TOKEN — a fine-grained token with Contents: read & write on this repository. Add it in Vercel → Settings → Environment Variables.',
    target: `${repo}@${branch}:${CATALOG_PATH}`,
  }
}

/* ── GitHub Contents API ────────────────────────────────────────────── */

async function ghRequest(pathInRepo: string, init: RequestInit = {}) {
  const { token, repo } = github()
  if (!token) throw new Error(storeInfo().blocker!)
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${pathInRepo}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  })
  return res
}

async function ghRead(pathInRepo: string): Promise<{ content: Buffer; sha: string } | null> {
  const { branch } = github()
  const res = await ghRequest(`${pathInRepo}?ref=${encodeURIComponent(branch)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub read of ${pathInRepo} failed: ${res.status} ${await res.text()}`)
  const json = (await res.json()) as { content: string; sha: string; encoding: string }
  return { content: Buffer.from(json.content, 'base64'), sha: json.sha }
}

async function ghWrite(pathInRepo: string, content: Buffer, message: string) {
  const { branch } = github()
  const existing = await ghRead(pathInRepo)
  const res = await ghRequest(pathInRepo, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: content.toString('base64'),
      branch,
      ...(existing ? { sha: existing.sha } : {}),
      committer: { name: 'InteriorCleanse Admin', email: 'admin@interiorcleanse.com' },
    }),
  })
  if (!res.ok) throw new Error(`GitHub write of ${pathInRepo} failed: ${res.status} ${await res.text()}`)
  const json = (await res.json()) as { commit?: { sha?: string } }
  return json.commit?.sha ?? null
}

/* ── Public API ─────────────────────────────────────────────────────── */

export async function readCatalog(): Promise<CatalogProduct[]> {
  if (onVercel()) {
    const file = await ghRead(CATALOG_PATH)
    if (!file) return []
    return JSON.parse(file.content.toString('utf8')) as CatalogProduct[]
  }
  const raw = await fs.readFile(path.join(ROOT, CATALOG_PATH), 'utf8')
  return JSON.parse(raw) as CatalogProduct[]
}

/**
 * Replaces the catalog. Returns the commit sha on GitHub, null on disk.
 * Records are sorted by slug so diffs stay readable.
 */
export async function writeCatalog(products: CatalogProduct[], message: string): Promise<string | null> {
  const sorted = [...products].sort((a, b) => a.slug.localeCompare(b.slug))
  const body = Buffer.from(JSON.stringify(sorted, null, 2) + '\n')
  if (onVercel()) return ghWrite(CATALOG_PATH, body, message)
  await fs.writeFile(path.join(ROOT, CATALOG_PATH), body)
  return null
}

/**
 * Writes a file under public/ and returns its URL path. Used for product
 * images and cut-outs. `relPath` is relative to public/, e.g.
 * `products/ic-signature-candle/hero.jpg`.
 */
export async function writePublicAsset(relPath: string, bytes: Buffer, message: string): Promise<string> {
  const safe = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (safe.includes('..')) throw new Error('Refusing a path that escapes public/.')
  if (onVercel()) {
    await ghWrite(`public/${safe}`, bytes, message)
  } else {
    const abs = path.join(ROOT, 'public', safe)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, bytes)
  }
  return `/${safe}`
}

/**
 * Reads a file under public/ from wherever it actually lives right now — the
 * checkout on disk, or the deploy branch on GitHub. A production server does
 * not serve a file uploaded after it was built, so anything that needs the
 * bytes (the cut-out, for one) must not go through HTTP for a local path.
 */
export async function readPublicAsset(relPath: string): Promise<Buffer | null> {
  const safe = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (safe.includes('..')) throw new Error('Refusing a path that escapes public/.')
  if (onVercel()) {
    const file = await ghRead(`public/${safe}`)
    return file?.content ?? null
  }
  try {
    return await fs.readFile(path.join(ROOT, 'public', safe))
  } catch {
    return null
  }
}

/** Upserts one product by id and writes the result. */
export async function upsertProduct(
  next: CatalogProduct,
  message = `catalog: update ${next.slug}`
): Promise<{ catalog: CatalogProduct[]; commit: string | null }> {
  const all = await readCatalog()
  const idx = all.findIndex((p) => p.id === next.id)
  if (idx >= 0) all[idx] = next
  else all.push(next)
  const commit = await writeCatalog(all, message)
  return { catalog: all, commit }
}
