/** Durable browser-local storage for media from EasyWorship schedules. */
import type { PlaylistCue, PlaylistCueAsset } from '../types/database'
import type { FileEntry } from '@zip.js/zip.js'
import { libraryMediaMime, readLibraryMedia, saveLibraryDvd } from './mediaLibrary'
import { readZipAsset, withZipAsset, type WithMediaBlob } from './zipAsset'
import { createLegacyVideoReader, legacyVideoExtension, legacyVideoMaxBytes } from './legacyVideo'

const DB_NAME = 'worship-team-schedule-media'
const DB_VERSION = 1
const STORE_NAME = 'assets'
const SUPPORTED_KINDS = new Set(['image', 'video', 'audio'])

type StoredAsset = { key: string; playlistId: string; archivePath: string; blob: Blob }

/** Packed replacements may use a newer format than the source resource name. */
export function playlistMediaFilename(asset: Pick<PlaylistCueAsset, 'kind' | 'filename' | 'archivePath'>): string {
  const packedName = asset.archivePath?.split('/').pop()
  const mime = packedName && libraryMediaMime(packedName)
  if (asset.kind === 'video' && packedName && !mime && (legacyVideoExtension(packedName) || legacyVideoExtension(asset.filename))) {
    return legacyVideoExtension(asset.filename) ? asset.filename.replace(/\.[^.]+$/, '.mp4') : packedName.replace(/\.[^.]+$/, '.mp4')
  }
  return packedName && mime && mime.startsWith(`${asset.kind}/`) && mime !== libraryMediaMime(asset.filename) ? packedName : asset.filename
}

export function packedLegacyVideoExtension(path: string | undefined, asset: Pick<PlaylistCueAsset, 'kind' | 'filename'>) {
  return path && asset.kind === 'video' && !libraryMediaMime(path)
    ? legacyVideoExtension(path) ?? legacyVideoExtension(asset.filename) : undefined
}

export function scheduleMediaAssets(cues: readonly PlaylistCue[]): PlaylistCueAsset[] {
  return cues.flatMap((cue) => [
    ...(cue.assets ?? []),
    ...cue.slides.flatMap((slide) => [
      ...(slide.assets ?? []),
      ...(slide.design?.layers.flatMap((layer) => layer.kind === 'media' ? [layer.asset] : []) ?? []),
      ...(slide.design?.soundtracks ?? []),
    ]),
  ])
}

export function safeScheduleMediaPath(value: string | undefined): string | null {
  if (!value) return null
  const path = value.replace(/\\/g, '/')
  if (path.startsWith('/') || /^[a-z]:/i.test(path) || path.includes('\0')) return null
  const parts = path.split('/')
  if (parts.some((part) => !part || part === '.' || part === '..')) return null
  return parts.join('/')
}

function keyFor(playlistId: string, archivePath: string): string {
  return `${playlistId}\0${archivePath}`
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        store.createIndex('playlistId', 'playlistId', { unique: false })
      }
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error ?? new Error('เปิดพื้นที่จัดเก็บไฟล์ไม่สำเร็จ'))
  })
}

function putAsset(db: IDBDatabase, asset: StoredAsset): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(asset)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('บันทึกไฟล์ไม่สำเร็จ'))
    transaction.onabort = () => reject(transaction.error ?? new Error('บันทึกไฟล์ไม่สำเร็จ'))
  })
}

export async function readScheduleMediaBackup(): Promise<StoredAsset[]> {
  const db = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll()
      request.onsuccess = () => resolve(request.result as StoredAsset[])
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}

export async function restoreScheduleMediaAssets(assets: Omit<StoredAsset, 'key'>[]): Promise<number> {
  if (!assets.length) return 0
  const db = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      let restored = 0
      for (const asset of assets) {
        const key = keyFor(asset.playlistId, asset.archivePath)
        const current = store.getKey(key)
        current.onsuccess = () => {
          if (current.result !== undefined) return
          store.add({ ...asset, key })
          restored++
        }
      }
      tx.oncomplete = () => resolve(restored)
      tx.onabort = () => reject(tx.error ?? new Error('เรียกคืนไฟล์ในตารางไม่สำเร็จ'))
    })
  } finally { db.close() }
}

/** Opens each referenced media file from the schedule or from user-selected attachments. */
export async function withScheduleMediaReader<T>(
  file: File,
  assets: readonly PlaylistCueAsset[],
  packedMedia: ReadonlyMap<string, Blob> | undefined,
  use: (read: (path: string) => Promise<Blob>, paths: string[], withAsset: WithMediaBlob) => Promise<T>,
  attachments?: ReadonlyMap<string, Blob>,
): Promise<T> {
  const wanted = new Map<string, PlaylistCueAsset>()
  for (const asset of assets) {
    const path = safeScheduleMediaPath(asset.archivePath)
    if (path && SUPPORTED_KINDS.has(asset.kind)) wanted.set(path, asset)
  }
  const paths = [...wanted.keys()]
  const missing = () => new Error('ไม่พบไฟล์สื่อที่รองรับในตาราง')
  const converter = createLegacyVideoReader()
  const readLocal = async (path: string) => {
    const asset = wanted.get(path)
    const blob = attachments?.get(path) ?? packedMedia?.get(path)
    if (!asset || !blob?.type.startsWith(asset.kind + '/')) throw missing()
    const extension = packedLegacyVideoExtension(path, asset)
    if (extension && blob.type !== 'video/mp4') return converter.read(path, extension, async () => blob)
    return blob
  }

  if (packedMedia || paths.every((path) => attachments?.has(path))) {
    try { return await use(readLocal, paths, (path, consume) => readLocal(path).then(consume)) }
    finally { await converter.close() }
  }

  const { BlobReader, ZipReader } = await import('@zip.js/zip.js')
  const archive = new ZipReader(new BlobReader(file))
  try {
    const entries = new Map<string, FileEntry | null>()
    for await (const entry of archive.getEntriesGenerator()) {
      if (entry.directory) continue
      const path = safeScheduleMediaPath(entry.filename)
      if (path && wanted.has(path) && !attachments?.has(path)) entries.set(path, entries.has(path) ? null : entry)
    }
    async function readArchive<T>(path: string, consume: (blob: Blob) => Promise<T>, scoped: boolean): Promise<T> {
      if (attachments?.has(path)) return consume(await readLocal(path))
      const entry = entries.get(path)
      const asset = wanted.get(path)
      if (!entry || entry.encrypted || !asset) throw missing()
      const extension = packedLegacyVideoExtension(path, asset)
      if (extension) {
        if (entry.uncompressedSize > legacyVideoMaxBytes) throw new Error('ไฟล์วิดีโอต้นฉบับใหญ่เกิน 4 GB')
        const converted = await withZipAsset(file, entry, (blob) => converter.read(path, extension, async () => blob))
        return consume(converted)
      }
      const mime = libraryMediaMime(path) ?? libraryMediaMime(asset.filename)
      if (!mime?.startsWith(asset.kind + '/')) throw missing()
      return scoped ? withZipAsset(file, entry, consume, mime) : consume(await readZipAsset(file, entry, mime))
    }
    return await use((path) => readArchive(path, async (blob) => blob, false), paths,
      (path, consume) => readArchive(path, consume, true))
  } finally {
    await converter.close()
    await archive.close()
  }
}

export async function saveScheduleMedia(
  file: File,
  playlistId: string,
  assets: readonly PlaylistCueAsset[],
  packedMedia?: ReadonlyMap<string, Blob>,
  attachments?: ReadonlyMap<string, Blob>,
  namespace?: string,
): Promise<{ saved: number; missing: number; videoErrors?: string[] }> {
  const dvds = new Map(assets.flatMap(({ dvd }) => dvd ? [[dvd.id, dvd]] as const : []))
  for (const dvd of dvds.values()) await saveLibraryDvd(dvd)
  return withScheduleMediaReader(file, assets, packedMedia, async (_read, paths, withAsset) => {
    if (!paths.length) return { saved: 0, missing: 0 }
    const db = await openDatabase()
    const videoErrors = new Set<string>()
    const byPath = new Map(assets.map((asset) => [safeScheduleMediaPath(asset.archivePath), asset]))
    let saved = 0
    try {
      for (const path of paths) {
        try {
          const archivePath = namespace ? `${namespace}/${path}` : path
          const asset = byPath.get(path)
          if (asset && packedLegacyVideoExtension(path, asset)
            && (await readScheduleMedia(playlistId, archivePath).catch(() => null))?.type === 'video/mp4') {
            saved++
            continue
          }
          await withAsset(path, (blob) => putAsset(db, { key: keyFor(playlistId, archivePath), playlistId, archivePath, blob }))
          saved++
        } catch (cause) {
          // Keep existing records available so a later retry can recover this asset.
          const asset = byPath.get(path)
          if (asset && packedLegacyVideoExtension(path, asset)) {
            videoErrors.add(`${asset.filename} · ${cause instanceof Error ? cause.message : 'แปลงวิดีโอไม่สำเร็จ'}`)
          }
        }
      }
    } finally {
      db.close()
    }
    return { saved, missing: paths.length - saved, ...(videoErrors.size ? { videoErrors: [...videoErrors] } : {}) }
  }, attachments)
}

export async function readScheduleMedia(playlistId: string, archivePath: string): Promise<Blob | null> {
  const path = safeScheduleMediaPath(archivePath)
  if (!path) return null
  const db = await openDatabase()
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(keyFor(playlistId, path))
      request.onsuccess = () => resolve((request.result as StoredAsset | undefined)?.blob ?? null)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

/** An attachment recovered by both import routes can be available in either local store. */
export async function readPlaylistMedia(playlistId?: string, archivePath?: string, libraryId?: string): Promise<Blob | null> {
  const library = libraryId ? await readLibraryMedia(libraryId).catch((error: unknown) => {
    if (!playlistId || !archivePath) throw error
    return null
  }) : null
  return library ?? (playlistId && archivePath ? readScheduleMedia(playlistId, archivePath) : null)
}

/** Stores newly recovered packed or detached files before publishing their references. */
export function stageRecoveredScheduleMedia(file: File, packed?: ReadonlyMap<string, Blob>, attachments?: ReadonlyMap<string, Blob>) {
  const staged = new Set<string>()
  return async (playlistId: string, assets: readonly PlaylistCueAsset[]) => {
    const missing = new Map<string, PlaylistCueAsset>()
    for (const asset of assets) {
      const path = asset.archivePath
      if (!path || staged.has(keyFor(playlistId, path)) || missing.has(path)) continue
      if ((await readPlaylistMedia(playlistId, path, asset.libraryId).catch(() => null))?.size) staged.add(keyFor(playlistId, path))
      else missing.set(path, asset)
    }
    if (!missing.size) return
    const saved = await saveScheduleMedia(file, playlistId, [...missing.values()], packed, attachments)
    if (saved.missing || saved.saved !== missing.size) throw new Error('เก็บเสียงจากแม่แบบไม่ได้ กรุณาลองบันทึกตารางอีกครั้ง')
    for (const path of missing.keys()) staged.add(keyFor(playlistId, path))
  }
}

export async function deleteScheduleMedia(playlistId: string): Promise<void> {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const request = transaction.objectStore(STORE_NAME).index('playlistId').openCursor(IDBKeyRange.only(playlistId))
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        }
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}
