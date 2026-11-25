/** Stores alert templates and imported alert resources in the browser library. */

import type { AlertResourceCatalog, AlertTemplate } from '../types/alertTemplate'

export const alertLibraryChannel = 'worshipteam:alert-templates'
const storeName = 'templates'
const resourceStore = 'resourceCatalogs'

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, setResult: (value: T) => void) => void,
  name = storeName) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('worship-team-alert-templates', 2)
    request.onupgradeneeded = ({ oldVersion }) => {
      if (oldVersion === 0) request.result.createObjectStore(storeName, { keyPath: 'id' })
      request.result.createObjectStore(resourceStore, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('เปิดคลังข้อความไม่ได้'))
  })
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(name, mode)
      let result: T
      transaction.oncomplete = () => resolve(result)
      transaction.onabort = () => reject(transaction.error ?? new Error('บันทึกคลังข้อความไม่ได้'))
      action(transaction.objectStore(name), (value) => { result = value })
    })
  } finally {
    db.close()
  }
}

function announceChange() {
  const channel = new BroadcastChannel(alertLibraryChannel)
  channel.postMessage('changed')
  channel.close()
}

export async function listAlertTemplates() {
  const templates = await withStore<AlertTemplate[]>('readonly', (store, setResult) => {
    const request = store.getAll()
    request.onsuccess = () => setResult(request.result)
  })
  if (templates.some((template) => template.source?.tokens.length && /\\sdewtagguid\b/i.test(template.source.rtf))) {
    const { restoreUneditedNativeTags } = await import('./easyWorshipAlertTags')
    return templates.map(restoreUneditedNativeTags).sort((a, b) => a.title.localeCompare(b.title, 'th'))
  }
  return templates.sort((a, b) => a.title.localeCompare(b.title, 'th'))
}

export async function addImportedAlertTemplate(template: AlertTemplate) {
  let updatedIntervals = false
  const result = await withStore<'saved' | 'duplicate'>('readwrite', (store, setResult) => {
    const existing = store.get(template.id)
    existing.onsuccess = () => {
      const saved = existing.result as AlertTemplate | undefined
      if (saved) {
        const serviceIntervals = template.source?.serviceIntervals
        if (serviceIntervals && saved.source && JSON.stringify(saved.source.serviceIntervals) !== JSON.stringify(serviceIntervals)) {
          store.put({ ...saved, source: { ...saved.source, serviceIntervals } })
          updatedIntervals = true
        }
        setResult('duplicate')
        return
      }
      store.add(template)
      setResult('saved')
    }
  })
  if (result === 'saved' || updatedIntervals) announceChange()
  return result
}

export async function saveAlertTemplate(template: AlertTemplate) {
  await withStore<void>('readwrite', (store) => { store.put(template) })
  announceChange()
}

async function restoreNewRows(rows: (AlertTemplate | AlertResourceCatalog)[], name: string) {
  if (!rows.length) return 0
  const saved = await withStore<number>('readwrite', (store, setResult) => {
    let count = 0
    setResult(count)
    for (const row of rows) {
      const existing = store.getKey(row.id)
      existing.onsuccess = () => {
        if (existing.result !== undefined) return
        store.add(row)
        setResult(++count)
      }
    }
  }, name)
  if (saved) announceChange()
  return saved
}

export function restoreAlertTemplates(templates: AlertTemplate[]) {
  return restoreNewRows(templates, storeName)
}

export function listAlertResourceCatalogs() {
  return withStore<AlertResourceCatalog[]>('readonly', (store, setResult) => {
    const request = store.getAll()
    request.onsuccess = () => setResult(request.result)
  }, resourceStore)
}

export function restoreAlertResourceCatalogs(catalogs: AlertResourceCatalog[]) {
  return restoreNewRows(catalogs, resourceStore)
}

export async function addImportedAlertResourceCatalog(catalog: AlertResourceCatalog) {
  return await restoreAlertResourceCatalogs([catalog]) ? 'saved' : 'duplicate'
}
