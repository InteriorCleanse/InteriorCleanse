'use client'

/**
 * A host's listing photos, kept in IndexedDB on their device until the
 * listings service receives them. Metadata travels with the listing; the
 * image bytes live here. Fails soft when IndexedDB is unavailable.
 */

const DB = 'avant-listing-photos'
const STORE = 'photos'

interface Row {
  id: string
  listingId: string
  blob: Blob
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'))
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'id' })
      store.createIndex('listingId', 'listingId')
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

export async function putListingPhoto(id: string, listingId: string, blob: Blob): Promise<void> {
  await tx('readwrite', (s) => s.put({ id, listingId, blob } satisfies Row))
}

export async function getListingPhoto(id: string): Promise<Blob | null> {
  try {
    const row = await tx<Row | undefined>('readonly', (s) => s.get(id) as IDBRequest<Row | undefined>)
    return row?.blob ?? null
  } catch {
    return null
  }
}

export async function deleteListingPhoto(id: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(id))
  } catch {
    /* already gone */
  }
}

export async function deleteListingPhotos(listingId: string): Promise<void> {
  try {
    const keys = await tx<IDBValidKey[]>('readonly', (s) => s.index('listingId').getAllKeys(listingId))
    await Promise.all(keys.map((k) => deleteListingPhoto(String(k))))
  } catch {
    /* nothing stored */
  }
}

export async function clearListingPhotos(): Promise<void> {
  try {
    await tx('readwrite', (s) => s.clear())
  } catch {
    /* nothing stored */
  }
}
