/** Stores imported history and WorshipTeam audience activity in the current browser. */

import type { SongHistory, SongHistoryAction } from './easyWorshipSongHistory'
import type { Song } from '../types/database'
import { librarySongProjection, type SongProjection } from './songProjection'

type HistoryInfo = Pick<SongHistory, 'id' | 'name' | 'filename'> & { size: number; savedAt: number }
type HistoryEvent = SongProjection & { at: string; type?: '0' | '2' }
export const localSongHistoryId = 'worshipteam'
const localHistory = { id: localSongHistoryId, name: 'WorshipTeam', filename: '' }
export const songHistoryChannel = 'worshipteam:song-history'

async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('worship-team-song-history', 2)
    request.onupgradeneeded = (event) => {
      if (event.oldVersion < 1) {
        request.result.createObjectStore('histories', { keyPath: 'id' })
        request.result.createObjectStore('metadata', { keyPath: 'id' })
      }
      request.result.createObjectStore('projections', { keyPath: 'id' })
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error ?? new Error('เปิดประวัติการใช้เพลงไม่สำเร็จ'))
  })
}

async function read<T>(store: 'metadata' | 'histories' | 'projections', select: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = select(db.transaction(store).objectStore(store))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('อ่านประวัติการใช้เพลงไม่สำเร็จ'))
    })
  } finally {
    db.close()
  }
}

export async function listSongHistories() {
  const histories = await read<HistoryInfo[]>('metadata', (store) => store.getAll())
  return histories.sort((a, b) => b.savedAt - a.savedAt || a.name.localeCompare(b.name))
}

export async function getSongHistory(id: string): Promise<SongHistory | undefined> {
  if (id !== localHistory.id) return read<SongHistory | undefined>('histories', (store) => store.get(id))
  const events = await read<HistoryEvent[]>('projections', (store) => store.getAll())
  const actions: SongHistoryAction[] = events.map(({ id, song, at, type }) => ({
    id, songId: song.id, type: type ?? '2', originalDate: at, originalTransmitDate: null,
    songSnapshot: { ...song, providerId: null, providerError: null },
  }))
  return { ...localHistory, origin: 'worshipteam', songs: [], actions }
}

function announceHistoryChange(id: string) {
  const channel = new BroadcastChannel(songHistoryChannel)
  channel.postMessage(id)
  channel.close()
}

export function recordSongProjection(projection: SongProjection): Promise<void> {
  return recordSongActivity(projection, '2')
}

export function recordSongAddition(song: Song): Promise<void> {
  return recordSongActivity({ id: `added:${song.id}`, song: librarySongProjection(song) }, '0')
}

async function recordSongActivity(event: SongProjection, type: '0' | '2'): Promise<void> {
  await mergeSongActivity([{ ...event, at: new Date().toISOString(), type }])
}

async function mergeSongActivity(events: HistoryEvent[]): Promise<number> {
  if (!events.length) return 0
  const db = await openDatabase()
  try {
    const recorded = await new Promise<number>((resolve, reject) => {
      const transaction = db.transaction(['projections', 'metadata'], 'readwrite')
      const projections = transaction.objectStore('projections')
      const metadata = transaction.objectStore('metadata')
      let added = 0
      let newest = -Infinity
      let pending = events.length
      const current = metadata.get(localHistory.id)
      for (const event of events) {
        const previous = projections.getKey(event.id)
        previous.onsuccess = () => {
          if (previous.result === undefined) {
            projections.add(event)
            added++
            newest = Math.max(newest, Date.parse(event.at))
          }
          if (--pending === 0 && added) {
            const { size = 0, savedAt = newest } = (current.result as HistoryInfo | undefined) ?? {}
            metadata.put({ ...localHistory, size: size + added, savedAt: Math.max(savedAt, newest) } satisfies HistoryInfo)
          }
        }
      }
      transaction.oncomplete = () => resolve(added)
      transaction.onabort = () => reject(transaction.error ?? new Error('บันทึกกิจกรรมเพลงไม่สำเร็จ'))
    })
    if (recorded) announceHistoryChange(localHistory.id)
    return recorded
  } finally {
    db.close()
  }
}

export function saveSongHistory(history: SongHistory): Promise<'saved' | 'duplicate'> {
  return storeImportedSongHistory(history, Date.now())
}

async function storeImportedSongHistory(history: SongHistory, savedAt: number): Promise<'saved' | 'duplicate'> {
  const db = await openDatabase()
  try {
    const result = await new Promise<'saved' | 'duplicate'>((resolve, reject) => {
      const transaction = db.transaction(['metadata', 'histories'], 'readwrite')
      const metadata = transaction.objectStore('metadata')
      const { id, name, filename, actions } = history
      const previous = metadata.getKey(id)
      let result: 'saved' | 'duplicate' = 'duplicate'
      previous.onsuccess = () => {
        if (previous.result !== undefined) return
        const entry: HistoryInfo = { id, name, filename, size: actions.length, savedAt }
        metadata.add(entry)
        transaction.objectStore('histories').add(history)
        result = 'saved'
      }
      transaction.oncomplete = () => resolve(result)
      transaction.onabort = () => reject(transaction.error ?? new Error('บันทึกประวัติการใช้เพลงไม่สำเร็จ'))
    })
    if (result === 'saved') announceHistoryChange(history.id)
    return result
  } finally {
    db.close()
  }
}

export async function restoreSongHistory(history: SongHistory, savedAt: number) {
  if (history.id !== localSongHistoryId) {
    const added = await storeImportedSongHistory(history, savedAt) === 'saved'
    return { histories: added ? 1 : 0, events: added ? history.actions.length : 0 }
  }
  const events = history.actions.flatMap<HistoryEvent>(({ id, type, originalDate, songSnapshot }) => {
    if ((type !== '0' && type !== '2') || !originalDate || !songSnapshot) return []
    const { id: songId, uid, title, author, copyright, administrator, reference } = songSnapshot
    return [{ id, type, at: originalDate, song: { id: songId, uid, title, author, copyright, administrator, reference } }]
  })
  return { histories: 0, events: await mergeSongActivity(events) }
}
