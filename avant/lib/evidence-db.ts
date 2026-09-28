'use client'

/**
 * Evidence photos live in IndexedDB on the guest's device: too large for
 * localStorage, and private until the guest chooses to share them.
 * Every call fails soft (returns empty) when IndexedDB is unavailable, as in
 * some private-browsing modes.
 */

import type { EvidenceMeta } from './evidence'

const DB = 'avant-evidence'
const STORE = 'photos'

interface Row {
  id: string
  meta: EvidenceMeta
  blob: Blob
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'))
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'id' })
      store.createIndex('tripId', 'meta.tripId')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = run(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        t.oncomplete = () => db.close()
      }),
  )
}

export async function listEvidence(tripId: string): Promise<EvidenceMeta[]> {
  try {
    const rows = await tx<Row[]>('readonly', (s) => s.index('tripId').getAll(tripId) as IDBRequest<Row[]>)
    return rows.map((r) => r.meta)
  } catch {
    return []
  }
}

export async function getEvidenceBlob(id: string): Promise<Blob | null> {
  try {
    const row = await tx<Row | undefined>('readonly', (s) => s.get(id) as IDBRequest<Row | undefined>)
    return row?.blob ?? null
  } catch {
    return null
  }
}

export async function putEvidence(meta: EvidenceMeta, blob: Blob): Promise<void> {
  await tx('readwrite', (s) => s.put({ id: meta.id, meta, blob } satisfies Row))
}

export async function clearEvidence(): Promise<void> {
  try {
    await tx('readwrite', (s) => s.clear())
  } catch {
    /* nothing stored */
  }
}
