const STORE = 'icons'
let database: Promise<IDBDatabase> | undefined

function openCache(): Promise<IDBDatabase> {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('velum-icon-cache', 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).catch((error) => {
    database = undefined
    throw error
  })
  return database
}

export async function writeIconCache(key: string, value: string): Promise<boolean> {
  try {
    const db = await openCache()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
      transaction.objectStore(STORE).put(value, key)
    })
    return true
  } catch {
    return false
  }
}

export async function readIconCache(key: string, legacyKey: string): Promise<string | undefined> {
  try {
    const db = await openCache()
    const cached = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(key)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    if (typeof cached === 'string') return cached
  } catch {
    // The legacy cache can still be available.
  }

  try {
    const legacy = localStorage.getItem(legacyKey)
    if (!legacy) return undefined
    if (await writeIconCache(key, legacy)) {
      if (localStorage.getItem(legacyKey) === legacy) localStorage.removeItem(legacyKey)
    }
    return legacy
  } catch {
    return undefined
  }
}
