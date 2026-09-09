'use client'

import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import type { AdminProductRow, AdminProductsResponse } from '@/app/api/admin/products/route'
import type { GumroadCheck } from '@/app/api/admin/validate-gumroad/route'
import {
  CATALOG_CATEGORIES,
  CATALOG_ENVIRONMENTS,
  CATALOG_STATUSES,
  type CatalogProduct,
  type CatalogStatus,
} from '@/lib/catalog-schema'

const fetcher = async (url: string) => {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Request failed')
  return data
}

type Filter = CatalogStatus | 'all'

const STATUS_LABEL: Record<CatalogStatus, string> = {
  draft: 'Draft',
  'needs-assets': 'Needs assets',
  'needs-pricing': 'Needs pricing',
  approved: 'Approved',
  published: 'Published',
}

async function call(url: string, init: RequestInit) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const issues = Array.isArray(data.issues) ? `: ${data.issues.map((i: { message: string }) => i.message).join(' ')}` : ''
    const problems = Array.isArray(data.problems) ? `\n${data.problems.join('\n')}` : ''
    throw new Error(`${data.error ?? 'Request failed'}${issues}${problems}`)
  }
  return data
}

/**
 * The product manager.
 *
 * One table over the whole catalog, filtered by status. The cells that change
 * most — name, price, category, status — edit inline and save on blur; the
 * rest lives in a side panel. Every row shows what still blocks publishing,
 * and the server refuses a publish that the panel would have shown as blocked,
 * so the two can never disagree.
 */
export function ProductsManager() {
  const { data, error, isLoading, mutate } = useSWR<AdminProductsResponse>('/api/admin/products/', fetcher)
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [bulkStatus, setBulkStatus] = useState<CatalogStatus>('approved')
  const importRef = useRef<HTMLInputElement>(null)

  const rows = useMemo(() => {
    const list = data?.products ?? []
    const q = query.trim().toLowerCase()
    return list.filter(
      (p) =>
        (filter === 'all' || p.status === filter) &&
        (!q || p.name.toLowerCase().includes(q) || p.slug.includes(q) || p.tags.some((t) => t.includes(q)))
    )
  }, [data, filter, query])

  const open = data?.products.find((p) => p.id === openId) ?? null

  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label)
    setNotice(null)
    try {
      const text = await fn()
      await mutate()
      if (text) setNotice({ kind: 'ok', text })
    } catch (e) {
      setNotice({ kind: 'err', text: e instanceof Error ? e.message : 'Something went wrong.' })
    } finally {
      setBusy(null)
    }
  }

  const save = (id: string, patch: Partial<CatalogProduct>) =>
    run(`save-${id}`, async () => {
      await call('/api/admin/products/', { method: 'PUT', body: JSON.stringify({ id, ...patch }) })
    })

  const sync = (provider: 'printful' | 'printify') =>
    run(provider, async () => {
      const r = await call(`/api/${provider}/sync/`, { method: 'POST' })
      return `${provider}: ${r.fetched} fetched — ${r.created.length} new, ${r.updated.length} updated, ${r.unchanged.length} unchanged.`
    })

  const createPrice = (id: string) =>
    run(`price-${id}`, async () => {
      const r = await call('/api/admin/create-price/', { method: 'POST', body: JSON.stringify({ id }) })
      return `Stripe (${r.mode}): price ${r.action} — ${r.stripePriceId} at $${r.amount}.`
    })

  const bulk = () =>
    run('bulk', async () => {
      const r = await call('/api/admin/products/', {
        method: 'PATCH',
        body: JSON.stringify({ ids: selected, status: bulkStatus }),
      })
      setSelected([])
      const skipped = r.skipped.length ? ` ${r.skipped.length} skipped (not ready to publish).` : ''
      return `${r.changed.length} set to ${STATUS_LABEL[bulkStatus]}.${skipped}`
    })

  const importCsv = (file: File) =>
    run('import', async () => {
      const text = await file.text()
      const r = await call('/api/admin/products/import/', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: text,
      })
      return `Imported ${r.created.length} draft(s).${r.skipped.length ? ` Skipped ${r.skipped.length} existing slug(s): ${r.skipped.join(', ')}.` : ''}`
    })

  const createBlank = () =>
    run('new', async () => {
      const name = window.prompt('Product name')
      if (!name) return
      const r = await call('/api/admin/products/', { method: 'POST', body: JSON.stringify({ name }) })
      setOpenId(r.product.id)
      return `Created "${name}" as a draft.`
    })

  const signOut = async () => {
    await fetch('/api/admin/login/', { method: 'DELETE' })
    router.push('/admin/login')
    router.refresh()
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <span className="wordmark">
          INTERIOR<em>◇</em>CLEANSE
        </span>
        <nav className="admin-tabs">
          <Link className="admin-tab" href="/admin/">
            Dashboard
          </Link>
          <span className="admin-tab active">Products</span>
        </nav>
        <button className="admin-signout" onClick={signOut}>
          Sign out
        </button>
      </header>

      <main className="admin-main">
        {data?.store ? (
          <p className={`admin-store ${data.store.writable ? '' : 'blocked'}`}>
            {data.store.writable
              ? data.store.backend === 'github'
                ? `Edits commit to ${data.store.target} and go live on the next deploy (about a minute).`
                : `Edits write to ${data.store.target} on this machine — commit and push to publish them.`
              : data.store.blocker}
          </p>
        ) : null}

        <div className="admin-toolbar">
          <h2>Products</h2>
          <div className="admin-actions">
            <button className="btn-ghost small" onClick={createBlank} disabled={!!busy}>
              New product
            </button>
            <button className="btn-ghost small" onClick={() => sync('printful')} disabled={!!busy}>
              {busy === 'printful' ? 'Syncing…' : 'Sync from Printful'}
            </button>
            <button className="btn-ghost small" onClick={() => sync('printify')} disabled={!!busy}>
              {busy === 'printify' ? 'Syncing…' : 'Sync from Printify'}
            </button>
            <button className="btn-ghost small" onClick={() => importRef.current?.click()} disabled={!!busy}>
              {busy === 'import' ? 'Importing…' : 'Import CSV'}
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) importCsv(f)
                e.target.value = ''
              }}
            />
            <a className="btn-ghost small" href="/api/admin/products/import/" download>
              CSV template
            </a>
          </div>
        </div>

        <div className="admin-filters">
          <button className={`admin-chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            All <span>{data?.products.length ?? 0}</span>
          </button>
          {CATALOG_STATUSES.map((s) => (
            <button key={s} className={`admin-chip ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
              {STATUS_LABEL[s]} <span>{data?.counts[s] ?? 0}</span>
            </button>
          ))}
          <input
            className="admin-search"
            placeholder="Search name, slug, tag…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {selected.length > 0 ? (
          <div className="admin-bulk">
            <span>{selected.length} selected</span>
            <select className="admin-search" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as CatalogStatus)}>
              {CATALOG_STATUSES.map((s) => (
                <option key={s} value={s}>
                  Set to {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <button className="btn-ghost small" onClick={bulk} disabled={!!busy}>
              Apply
            </button>
            <button className="btn-ghost small" onClick={() => setSelected([])}>
              Clear
            </button>
          </div>
        ) : null}

        {notice ? (
          <p className={notice.kind === 'ok' ? 'admin-notice' : 'admin-error'} role="status" style={{ whiteSpace: 'pre-wrap' }}>
            {notice.text}
          </p>
        ) : null}

        {error ? <p className="admin-error">{(error as Error).message}</p> : null}
        {isLoading ? <p className="admin-muted">Loading catalog…</p> : null}

        {data ? (
          <div className="admin-split">
            <div className="admin-table-wrap">
              <table className="admin-table admin-products">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Select all shown"
                        checked={rows.length > 0 && rows.every((r) => selected.includes(r.id))}
                        onChange={(e) =>
                          setSelected(e.target.checked ? rows.map((r) => r.id) : selected.filter((id) => !rows.some((r) => r.id === id)))
                        }
                      />
                    </th>
                    <th></th>
                    <th>Name</th>
                    <th>Category</th>
                    <th className="num">Price</th>
                    <th>Sells via</th>
                    <th>Status</th>
                    <th>Blocking</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <Row
                      key={p.id}
                      p={p}
                      checked={selected.includes(p.id)}
                      active={openId === p.id}
                      onCheck={(v) => setSelected(v ? [...selected, p.id] : selected.filter((id) => id !== p.id))}
                      onOpen={() => setOpenId(openId === p.id ? null : p.id)}
                      onSave={(patch) => save(p.id, patch)}
                    />
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="admin-muted">
                        Nothing matches.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {open ? (
              <Editor
                key={open.id}
                p={open}
                busy={busy}
                onClose={() => setOpenId(null)}
                onSave={(patch) => save(open.id, patch)}
                onCreatePrice={() => createPrice(open.id)}
                onUpload={(kind, file) =>
                  run(`upload-${kind}`, async () => {
                    const form = new FormData()
                    form.append('slug', open.slug)
                    form.append('kind', kind)
                    form.append('file', file)
                    const res = await fetch('/api/admin/products/upload/', { method: 'POST', body: form })
                    const json = await res.json()
                    if (!res.ok) throw new Error(json.error)
                    return `Saved ${json.url}.`
                  })
                }
                onRemoveBg={() =>
                  run('removebg', async () => {
                    const r = await call('/api/admin/remove-bg/', { method: 'POST', body: JSON.stringify({ slug: open.slug }) })
                    return `${r.note} Saved ${r.url}.`
                  })
                }
                onDelete={() =>
                  run('delete', async () => {
                    if (!window.confirm(`Delete "${open.name}"? This cannot be undone.`)) return
                    await call('/api/admin/products/', { method: 'DELETE', body: JSON.stringify({ id: open.id }) })
                    setOpenId(null)
                    return 'Deleted.'
                  })
                }
              />
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  )
}

/* ── Row: inline edit for the four fields that change most ─────────── */

function Row({
  p,
  checked,
  active,
  onCheck,
  onOpen,
  onSave,
}: {
  p: AdminProductRow
  checked: boolean
  active: boolean
  onCheck: (v: boolean) => void
  onOpen: () => void
  onSave: (patch: Partial<CatalogProduct>) => void
}) {
  const [name, setName] = useState(p.name)
  const [price, setPrice] = useState(String(p.price))
  const sells =
    p.purchaseType === 'stripe' ? `Stripe · ${p.fulfillment}` : p.purchaseType

  return (
    <tr className={active ? 'selected' : ''}>
      <td onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" aria-label={`Select ${p.name}`} checked={checked} onChange={(e) => onCheck(e.target.checked)} />
      </td>
      <td onClick={onOpen}>
        {p.images.hero ? (
          <img className="admin-thumb" src={p.images.hero} alt="" />
        ) : (
          <span className="admin-thumb empty" title="No hero image" />
        )}
      </td>
      <td>
        <input
          className="admin-inline"
          value={name}
          aria-label="Name"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== p.name && onSave({ name })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <span className="admin-muted small">/{p.slug}</span>
      </td>
      <td>
        <select
          className="admin-inline"
          value={p.category}
          aria-label="Category"
          onChange={(e) => onSave({ category: e.target.value as CatalogProduct['category'] })}
        >
          {CATALOG_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </td>
      <td className="num">
        <input
          className="admin-inline num"
          value={price}
          inputMode="decimal"
          aria-label="Price"
          onChange={(e) => setPrice(e.target.value)}
          onBlur={() => Number(price) !== p.price && onSave({ price: Number(price) })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </td>
      <td className="admin-muted">{sells}</td>
      <td>
        <select
          className={`admin-inline status-${p.status}`}
          value={p.status}
          aria-label="Status"
          onChange={(e) => onSave({ status: e.target.value as CatalogStatus })}
        >
          {CATALOG_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </td>
      <td onClick={onOpen}>
        {p.issues.length === 0 ? (
          <span className="admin-ready">Ready</span>
        ) : (
          <span className="admin-blocking" title={p.issues.map((i) => i.message).join('\n')}>
            {p.issues.length} issue{p.issues.length === 1 ? '' : 's'} ▸
          </span>
        )}
      </td>
    </tr>
  )
}

/* ── Editor: the full record ───────────────────────────────────────── */

function Editor({
  p,
  busy,
  onClose,
  onSave,
  onCreatePrice,
  onUpload,
  onRemoveBg,
  onDelete,
}: {
  p: AdminProductRow
  busy: string | null
  onClose: () => void
  onSave: (patch: Partial<CatalogProduct>) => void
  onCreatePrice: () => void
  onUpload: (kind: 'hero' | 'gallery' | 'transparent', file: File) => void
  onRemoveBg: () => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState<CatalogProduct>(p)
  const [gumroad, setGumroad] = useState<GumroadCheck | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(stripIssues(p))
  const set = <K extends keyof CatalogProduct>(k: K, v: CatalogProduct[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const text = (k: keyof CatalogProduct, label: string, props: Record<string, unknown> = {}) => (
    <label>
      {label}
      <input
        className="admin-search"
        value={(draft[k] as string | null) ?? ''}
        onChange={(e) => set(k, (e.target.value === '' ? null : e.target.value) as never)}
        {...props}
      />
    </label>
  )
  const select = <K extends keyof CatalogProduct>(k: K, label: string, options: readonly string[]) => (
    <label>
      {label}
      <select className="admin-search" value={String(draft[k])} onChange={(e) => set(k, e.target.value as never)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
  const file = (kind: 'hero' | 'gallery' | 'transparent', label: string, accept: string) => (
    <label className="admin-file">
      {label}
      <input
        type="file"
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onUpload(kind, f)
          e.target.value = ''
        }}
      />
    </label>
  )

  const checkGumroad = async () => {
    setGumroad(null)
    try {
      setGumroad(await call('/api/admin/validate-gumroad/', { method: 'POST', body: JSON.stringify({ url: draft.gumroadUrl }) }))
    } catch (e) {
      setGumroad({ url: draft.gumroadUrl ?? '', ok: false, status: 0, name: null, price: null, note: e instanceof Error ? e.message : 'Check failed.' })
    }
  }

  return (
    <aside className="admin-panel admin-editor">
      <button className="admin-panel-close" onClick={onClose} aria-label="Close editor">
        ✕
      </button>
      <p className="eyebrow">{STATUS_LABEL[p.status]}</p>
      <h3>{p.name || 'Untitled'}</h3>

      {p.issues.length ? (
        <div className="connector-alert">
          <p className="connector-alert-title">Before this can be published</p>
          <ul>
            {p.issues.map((i) => (
              <li key={i.field + i.message}>{i.message}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="admin-ready">Ready to publish.</p>
      )}

      <div className="admin-form">
        {text('name', 'Name')}
        {text('slug', 'Slug', { pattern: '[a-z0-9-]+' })}
        {text('tagline', 'Tagline')}
        <label>
          Description <span className="admin-muted small">({(draft.description ?? '').length} chars, needs &gt; 50)</span>
          <textarea className="admin-search" rows={5} value={draft.description} onChange={(e) => set('description', e.target.value)} />
        </label>
        <div className="admin-grid-2">
          {select('category', 'Category', CATALOG_CATEGORIES)}
          {select('environment', 'Environment', CATALOG_ENVIRONMENTS)}
          {select('sizeClass', 'Size class', ['small', 'medium', 'large', 'oversized'])}
          {select('objectType', 'Object type (3D)', ['candle', 'print', 'tote', 'mug', 'cleaning', 'book', 'custom'])}
          <label>
            Price (USD)
            <input className="admin-search" inputMode="decimal" value={draft.price} onChange={(e) => set('price', Number(e.target.value) || 0)} />
          </label>
          <label>
            Compare-at price
            <input className="admin-search" inputMode="decimal" value={draft.compareAtPrice ?? ''} onChange={(e) => set('compareAtPrice', e.target.value === '' ? null : Number(e.target.value))} />
          </label>
          {select('purchaseType', 'Sells via', ['stripe', 'affiliate', 'gumroad', 'amazon'])}
          {select('fulfillment', 'Fulfilled by', ['printful', 'printify', 'digital', 'affiliate', 'manual'])}
        </div>

        {draft.purchaseType === 'stripe' ? (
          <div className="admin-row">
            {text('stripePriceId', 'Stripe Price ID', { placeholder: 'price_…' })}
            <button className="btn-ghost small" onClick={onCreatePrice} disabled={!!busy || !(draft.price > 0)} title={draft.price > 0 ? '' : 'Set a price first'}>
              {busy?.startsWith('price') ? 'Working…' : draft.stripePriceId ? 'Update Stripe Price' : 'Create Stripe Price'}
            </button>
          </div>
        ) : null}
        {draft.purchaseType === 'affiliate' ? text('affiliateUrl', 'Affiliate URL', { placeholder: 'https://… (replace PENDING_APPROVAL)' }) : null}
        {draft.purchaseType === 'amazon' ? text('amazonUrl', 'Amazon URL') : null}
        {draft.purchaseType === 'gumroad' ? (
          <div className="admin-row">
            {text('gumroadUrl', 'Gumroad URL', { placeholder: 'https://interiorcleanse.gumroad.com/l/…' })}
            <button className="btn-ghost small" onClick={checkGumroad} disabled={!draft.gumroadUrl}>
              Check
            </button>
            {gumroad ? (
              <p className={gumroad.ok ? 'admin-notice' : 'admin-error'}>
                {gumroad.ok ? `${gumroad.name ?? 'Unnamed'} — ${gumroad.price ?? 'price not shown'}. ` : ''}
                {gumroad.note}
              </p>
            ) : null}
          </div>
        ) : null}
        {draft.fulfillment === 'printful' ? text('printfulVariantId', 'Printful variant ID') : null}
        {draft.fulfillment === 'printify' ? text('printifyVariantId', 'Printify variant ID') : null}

        <fieldset className="admin-fieldset">
          <legend>Images</legend>
          <div className="admin-images">
            <figure>
              {draft.images.hero ? <img src={draft.images.hero} alt="" /> : <span className="admin-thumb empty big" />}
              <figcaption>Hero</figcaption>
              {file('hero', 'Upload hero', 'image/jpeg,image/png,image/webp,image/avif')}
            </figure>
            <figure>
              {draft.images.transparent ? <img src={draft.images.transparent} alt="" className="checker" /> : <span className="admin-thumb empty big checker" />}
              <figcaption>Cut-out (pedestal)</figcaption>
              {file('transparent', 'Upload PNG', 'image/png,image/webp')}
              <button className="btn-ghost small" onClick={onRemoveBg} disabled={!!busy || !draft.images.hero}>
                {busy === 'removebg' ? 'Cutting…' : 'Cut out background'}
              </button>
            </figure>
          </div>
          <label>
            Hero URL (or upload above)
            <input className="admin-search" value={draft.images.hero ?? ''} onChange={(e) => set('images', { ...draft.images, hero: e.target.value || null })} />
          </label>
          <div className="admin-gallery">
            {draft.images.gallery.map((g, i) => (
              <span key={g + i} className="admin-gallery-item">
                <img src={g} alt="" />
                <button type="button" aria-label="Remove" onClick={() => set('images', { ...draft.images, gallery: draft.images.gallery.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              </span>
            ))}
            {file('gallery', 'Add gallery image', 'image/jpeg,image/png,image/webp,image/avif')}
          </div>
        </fieldset>

        <div className="admin-grid-2">
          <label>
            Tags (comma separated)
            <input className="admin-search" value={draft.tags.join(', ')} onChange={(e) => set('tags', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))} />
          </label>
          <label>
            Featured
            <select className="admin-search" value={String(draft.featured)} onChange={(e) => set('featured', e.target.value === 'true')}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </label>
          {text('seoTitle', 'SEO title')}
          {text('lastVerified', 'Last verified (YYYY-MM-DD)')}
        </div>
        <label>
          SEO description
          <textarea className="admin-search" rows={2} value={draft.seoDescription ?? ''} onChange={(e) => set('seoDescription', e.target.value || null)} />
        </label>
        <label>
          Rotation frames (one URL per line, in order)
          <textarea className="admin-search" rows={2} value={(draft.rotationSequence ?? []).join('\n')} onChange={(e) => set('rotationSequence', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean).length ? e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) : null)} />
        </label>
        {text('modelUrl', 'GLB model URL')}

        <div className="admin-actions">
          <button className="btn-primary" onClick={() => onSave(diff(stripIssues(p), draft))} disabled={!dirty || !!busy}>
            {busy?.startsWith('save') ? 'Saving…' : 'Save changes'}
          </button>
          {p.status !== 'published' ? (
            <button className="btn-ghost small" onClick={() => onSave({ ...diff(stripIssues(p), draft), status: 'published' })} disabled={!!busy || p.issues.length > 0} title={p.issues.length ? 'Resolve the blocking issues first' : ''}>
              Publish
            </button>
          ) : (
            <button className="btn-ghost small" onClick={() => onSave({ status: 'approved' })} disabled={!!busy}>
              Unpublish
            </button>
          )}
          <Link className="btn-ghost small" href={`/collection/${p.slug}/`} target="_blank">
            Preview ↗
          </Link>
          <button className="admin-danger" onClick={onDelete} disabled={!!busy || p.status === 'published'}>
            Delete
          </button>
        </div>
      </div>
    </aside>
  )
}

const stripIssues = (p: AdminProductRow): CatalogProduct => {
  const { issues: _issues, ...rest } = p
  return rest
}

/** Only the fields that changed, so a save never overwrites a concurrent edit elsewhere. */
function diff(before: CatalogProduct, after: CatalogProduct): Partial<CatalogProduct> {
  const out: Partial<CatalogProduct> = {}
  for (const k of Object.keys(after) as (keyof CatalogProduct)[]) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) (out as Record<string, unknown>)[k] = after[k]
  }
  return out
}
