/** Browser-local IndexedDB persistence for imported EasyWorship Bible editions. */
import type { ScriptureEdition, ScriptureEditionInfo } from '../types/scripture'

const DB_NAME = 'worship-team-scripture-library'
const DB_VERSION = 1
const EDITIONS_STORE = 'editions'
const METADATA_STORE = 'edition_metadata'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(EDITIONS_STORE)) db.createObjectStore(EDITIONS_STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(METADATA_STORE)) db.createObjectStore(METADATA_STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('เปิดคลังพระคัมภีร์ไม่สำเร็จ'))
  })
}

function metadataOf(edition: ScriptureEdition): ScriptureEditionInfo {
  const { books: _books, ...metadata } = edition
  return metadata
}

export async function listScriptureEditions(): Promise<ScriptureEditionInfo[]> {
  const db = await openDatabase()
  try {
    return await new Promise<ScriptureEditionInfo[]>((resolve, reject) => {
      const request = db.transaction(METADATA_STORE, 'readonly').objectStore(METADATA_STORE).getAll()
      request.onsuccess = () => {
        const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
        resolve((request.result as ScriptureEditionInfo[]).sort((a, b) => collator.compare(a.name, b.name)))
      }
      request.onerror = () => reject(request.error ?? new Error('อ่านรายการพระคัมภีร์ไม่สำเร็จ'))
    })
  } finally {
    db.close()
  }
}

export async function readScriptureEdition(id: string): Promise<ScriptureEdition | null> {
  const db = await openDatabase()
  try {
    return await new Promise<ScriptureEdition | null>((resolve, reject) => {
      const request = db.transaction(EDITIONS_STORE, 'readonly').objectStore(EDITIONS_STORE).get(id)
      request.onsuccess = () => resolve((request.result as ScriptureEdition | undefined) ?? null)
      request.onerror = () => reject(request.error ?? new Error('อ่านฉบับพระคัมภีร์ไม่สำเร็จ'))
    })
  } finally {
    db.close()
  }
}

async function writeScriptureEdition(edition: ScriptureEdition, preserveExisting: boolean): Promise<boolean> {
  const db = await openDatabase()
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const transaction = db.transaction([EDITIONS_STORE, METADATA_STORE], 'readwrite')
      const editions = transaction.objectStore(EDITIONS_STORE)
      let saved = false
      function write() {
        editions.put(edition)
        transaction.objectStore(METADATA_STORE).put(metadataOf(edition))
        saved = true
      }
      if (preserveExisting) {
        const existing = editions.getKey(edition.id)
        existing.onsuccess = () => { if (existing.result === undefined) write() }
      } else write()
      transaction.oncomplete = () => resolve(saved)
      transaction.onabort = () => reject(transaction.error ?? new Error('บันทึกฉบับพระคัมภีร์ไม่สำเร็จ'))
      transaction.onerror = () => reject(transaction.error ?? new Error('บันทึกฉบับพระคัมภีร์ไม่สำเร็จ'))
    })
  } finally {
    db.close()
  }
}

export async function saveScriptureEdition(edition: ScriptureEdition): Promise<void> {
  await writeScriptureEdition(edition, false)
}

export function restoreScriptureEdition(edition: ScriptureEdition): Promise<boolean> {
  return writeScriptureEdition(edition, true)
}

export async function deleteScriptureEdition(id: string): Promise<void> {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([EDITIONS_STORE, METADATA_STORE], 'readwrite')
      transaction.objectStore(EDITIONS_STORE).delete(id)
      transaction.objectStore(METADATA_STORE).delete(id)
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error ?? new Error('ลบฉบับพระคัมภีร์ไม่สำเร็จ'))
      transaction.onerror = () => reject(transaction.error ?? new Error('ลบฉบับพระคัมภีร์ไม่สำเร็จ'))
    })
  } finally {
    db.close()
  }
}
