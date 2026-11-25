/** Stores media files and their searchable catalog locally in the browser. */

import { mediaInfoFields, type LibraryMediaPlayback, type MediaClip, type MediaInfo, type MediaKind, type MediaLibraryItem,
  type MediaMetadata, type VideoAlphaMode } from '../types/media'
import type { PlaylistCueAsset } from '../types/database'
import type { LiveFeed } from '../types/liveFeed'
import type { DvdClip } from '../types/dvdClip'
import { importBlobIdentity, importIdentity, mediaFileHash } from './importIdentity'
import { mediaClipKey } from './mediaClip'
import { splitVideoAlpha } from './videoAlpha'
import { mediaObjectFit, resolveLibraryMediaPlayback, sameMediaPlayback } from './mediaPlayback'
import { createLegacyVideoReader, legacyVideoExtension, legacyVideoMaxBytes } from './legacyVideo'

const DB_NAME = 'worship-team-media-library'
const ITEMS = 'items'
const ASSETS = 'assets'
const FEEDS = 'feeds'
const DVDS = 'dvdClips'

type StoredAsset = { id: string; blob: Blob }

type MediaDetails = {
  filename: string
  name?: string
  kind?: MediaKind
  sourceId?: string
  metadata?: MediaMetadata
  clip?: MediaClip
  posterSeconds?: number
  alphaMode?: VideoAlphaMode
  playback?: LibraryMediaPlayback
  generatedReference?: true
  /** Hash of the original source bytes when storing a transcoded video. */
  convertedFrom?: string
}

export function libraryMediaCueAsset(item: MediaLibraryItem, role: PlaylistCueAsset['role']): PlaylistCueAsset {
  const { playback, repeat } = resolveLibraryMediaPlayback(item.kind, item.playback)
  return { kind: item.kind, filename: item.filename, libraryId: item.assetId, role,
    mediaCatalog: { id: item.id, name: item.name },
    ...(item.clip ? { clip: item.clip } : {}), ...(item.alphaMode ? { alphaMode: item.alphaMode } : {}),
    ...(item.posterSeconds !== undefined ? { posterSeconds: item.posterSeconds } : {}),
    ...(repeat !== undefined ? { repeat } : {}), ...(playback ? { playback } : {}) }
}

export function libraryMediaVisual(item: MediaLibraryItem, background = false) {
  const kind = item.kind
  if (kind === 'audio') return undefined
  const { repeat, role: _role, ...asset } = libraryMediaCueAsset(item, background ? 'background' : 'foreground')
  return { asset: { ...asset, kind }, fit: mediaObjectFit(asset.playback, background) ?? (background ? 'cover' as const : 'contain' as const),
    ...(repeat !== undefined ? { loop: repeat } : {}) }
}

const MEDIA_TYPES: Record<string, string> = {
  avif: 'image/avif', bmp: 'image/bmp', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  aac: 'audio/aac', flac: 'audio/flac', m4a: 'audio/mp4', mp3: 'audio/mpeg',
  oga: 'audio/ogg', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav',
}

export function libraryMediaMime(filename: string): string | undefined {
  const suffix = filename.match(/\.([a-z\d]+)$/i)?.[1].toLowerCase()
  return suffix ? MEDIA_TYPES[suffix] : undefined
}

/** Finds an accepted file extension for stored MIME data. */
export function libraryMediaExtension(mime: string): string | undefined {
  return Object.keys(MEDIA_TYPES).find((extension) => MEDIA_TYPES[extension] === mime)
}

export function mediaLibraryIdentityInput(blob: Blob) {
  return ['media-library-v1', blob.size]
}

export function mediaLibraryAssetId(blob: Blob): Promise<string> {
  return importBlobIdentity(mediaLibraryIdentityInput(blob), blob)
}

function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3)
    request.onupgradeneeded = ({ oldVersion }) => {
      const db = request.result
      if (oldVersion < 1) {
        db.createObjectStore(ASSETS, { keyPath: 'id' })
        db.createObjectStore(ITEMS, { keyPath: 'id' }).createIndex('assetId', 'assetId')
      }
      if (oldVersion < 2) db.createObjectStore(FEEDS, { keyPath: 'id' })
      if (oldVersion < 3) db.createObjectStore(DVDS, { keyPath: 'id' })
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error ?? new Error('เปิดคลังสื่อในเบราว์เซอร์ไม่ได้'))
  })
}

function getRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('อ่านคลังสื่อไม่สำเร็จ'))
  })
}

function finish(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('บันทึกคลังสื่อไม่สำเร็จ'))
  })
}

/** Reads a consistent catalog and its blobs, including assets referenced by shared designs. */
export async function readMediaLibraryBackup() {
  const db = await openLibrary()
  try {
    const tx = db.transaction([ITEMS, ASSETS, FEEDS, DVDS])
    const [items, assets, feeds, dvds] = await Promise.all([
      getRequest<MediaLibraryItem[]>(tx.objectStore(ITEMS).getAll()),
      getRequest<StoredAsset[]>(tx.objectStore(ASSETS).getAll()),
      getRequest<LiveFeed[]>(tx.objectStore(FEEDS).getAll()),
      getRequest<DvdClip[]>(tx.objectStore(DVDS).getAll()),
    ])
    return { items, assets, feeds, dvds }
  } finally { db.close() }
}

/** Restores one verified asset with its original catalog IDs in the same transaction. */
export async function restoreMediaLibraryAsset(asset: StoredAsset, records: MediaLibraryItem[]): Promise<string[]> {
  const db = await openLibrary()
  try {
    const tx = db.transaction([ITEMS, ASSETS], 'readwrite')
    const done = finish(tx)
    const assets = tx.objectStore(ASSETS)
    const items = tx.objectStore(ITEMS)
    const saved: string[] = []
    const existingAsset = assets.getKey(asset.id)
    existingAsset.onsuccess = () => { if (existingAsset.result === undefined) assets.add(asset) }
    for (const item of records) {
      const existing = items.get(item.id)
      existing.onsuccess = () => {
        const current = existing.result as MediaLibraryItem | undefined
        if (current && current.assetId !== asset.id) {
          tx.abort()
          return
        }
        if (!current || (current.generatedReference && !item.generatedReference)) {
          items.put(item)
          saved.push(item.id)
        }
      }
    }
    await done
    return saved
  } finally { db.close() }
}

export async function restoreMediaLibrarySources(feeds: LiveFeed[], dvds: DvdClip[]) {
  const db = await openLibrary()
  try {
    const tx = db.transaction([FEEDS, DVDS], 'readwrite')
    const done = finish(tx)
    const counts = { feeds: 0, dvds: 0 }
    for (const [key, store, rows] of [['feeds', FEEDS, feeds], ['dvds', DVDS, dvds]] as const) {
      const resource = tx.objectStore(store)
      for (const row of rows) {
        const existing = resource.getKey(row.id)
        existing.onsuccess = () => {
          if (existing.result !== undefined) return
          resource.add(row)
          counts[key]++
        }
      }
    }
    await done
    return counts
  } finally { db.close() }
}

export async function listLibraryDvds(): Promise<DvdClip[]> {
  const db = await openLibrary()
  try {
    const clips = await getRequest<DvdClip[]>(db.transaction(DVDS).objectStore(DVDS).getAll())
    return clips.sort((a, b) => a.name.localeCompare(b.name, 'th', { numeric: true }))
  } finally { db.close() }
}

export async function saveLibraryDvd(clip: DvdClip): Promise<'saved' | 'duplicate'> {
  const db = await openLibrary()
  try {
    const transaction = db.transaction(DVDS, 'readwrite')
    const done = finish(transaction)
    const store = transaction.objectStore(DVDS)
    const existing = store.get(clip.id)
    let duplicate = false
    existing.onsuccess = () => {
      const saved = existing.result as DvdClip | undefined
      duplicate = Boolean(saved)
      if (!saved) store.add(clip)
      else {
        const thumbnail = saved.thumbnail === undefined ? clip.thumbnail : saved.thumbnail
        const metadata = saved.metadata ?? clip.metadata
        const playback = saved.playback ?? clip.playback
        const sourceFolder = saved.sourceFolder ?? clip.sourceFolder
        if (thumbnail !== saved.thumbnail || metadata !== saved.metadata || playback !== saved.playback || sourceFolder !== saved.sourceFolder) {
          store.put({ ...saved, thumbnail, metadata, playback, sourceFolder })
        }
      }
    }
    await done
    return duplicate ? 'duplicate' : 'saved'
  } finally { db.close() }
}

export async function updateLibraryDvd(clip: DvdClip): Promise<void> {
  const db = await openLibrary()
  try {
    const transaction = db.transaction(DVDS, 'readwrite')
    const done = finish(transaction)
    const store = transaction.objectStore(DVDS)
    const existing = store.getKey(clip.id)
    existing.onsuccess = () => {
      if (existing.result === undefined) transaction.abort()
      else store.put(clip)
    }
    await done
  } finally { db.close() }
}

export async function listLibraryFeeds(): Promise<LiveFeed[]> {
  const db = await openLibrary()
  try {
    const feeds = await getRequest<LiveFeed[]>(db.transaction(FEEDS).objectStore(FEEDS).getAll())
    return feeds.sort((a, b) => a.name.localeCompare(b.name, 'th', { numeric: true }))
  } finally { db.close() }
}

export async function saveLibraryFeed(feed: LiveFeed): Promise<'saved' | 'duplicate'> {
  const name = feed.name.trim()
  if (!name) throw new Error('กรุณาใส่ชื่อสัญญาณสด')
  const db = await openLibrary()
  try {
    const transaction = db.transaction(FEEDS, 'readwrite')
    const done = finish(transaction)
    const store = transaction.objectStore(FEEDS)
    let duplicate = false
    const existing = store.get(feed.id)
    existing.onsuccess = () => {
      const saved = existing.result as LiveFeed | undefined
      duplicate = Boolean(saved)
      store.put(saved ? {
        ...saved, deviceHints: feed.deviceHints.length ? feed.deviceHints : saved.deviceHints,
        metadata: feed.metadata ?? saved.metadata,
      } : { ...feed, name })
    }
    await done
    return duplicate ? 'duplicate' : 'saved'
  } finally { db.close() }
}

export async function renameLibraryFeed(id: string, name: string): Promise<void> {
  const title = name.trim()
  if (!title) throw new Error('กรุณาใส่ชื่อสัญญาณสด')
  const db = await openLibrary()
  try {
    const transaction = db.transaction(FEEDS, 'readwrite')
    const done = finish(transaction)
    const store = transaction.objectStore(FEEDS)
    const existing = store.get(id)
    existing.onsuccess = () => {
      const feed = existing.result as LiveFeed | undefined
      if (!feed) transaction.abort()
      else store.put({ ...feed, name: title })
    }
    await done
  } finally { db.close() }
}

export async function deleteLibraryFeed(id: string): Promise<void> {
  const db = await openLibrary()
  try {
    const transaction = db.transaction(FEEDS, 'readwrite')
    const done = finish(transaction)
    transaction.objectStore(FEEDS).delete(id)
    await done
  } finally { db.close() }
}

function reimportLibraryPlayback(saved: MediaLibraryItem, incoming: LibraryMediaPlayback | undefined) {
  if (!incoming) return saved.playback
  const { usage, ...playback } = incoming
  return { ...saved.playback, ...(!saved.playbackEdited ? playback : {}),
    ...(usage !== undefined && !saved.usageEdited ? { usage } : {}) }
}

export async function saveLibraryMedia(blob: Blob, details: MediaDetails): Promise<MediaLibraryItem> {
  const filename = details.filename.replace(/\\/g, '/').split('/').pop() ?? ''
  const mediaType = libraryMediaMime(filename)
  const kind = mediaType?.split('/')[0] as MediaKind | undefined
  if (!mediaType || !kind || (details.kind && kind !== details.kind)) {
    throw new Error(`รูปแบบไฟล์ ${filename || 'สื่อ'} ยังไม่รองรับ`)
  }
  if (!blob.size) throw new Error(`ไฟล์ ${filename} ไม่มีข้อมูล`)

  const assetId = await mediaLibraryAssetId(blob)
  const id = details.convertedFrom ? await convertedVideoId(details, details.convertedFrom)
    : details.sourceId ? await importIdentity(['easyworship-media', details.sourceId, assetId]) : assetId
  const alphaMode = kind === 'video' ? splitVideoAlpha(details.alphaMode) : undefined
  const item: MediaLibraryItem = {
    id, assetId, filename, kind, size: blob.size, mediaType,
    name: details.name?.trim() || filename,
    addedAt: new Date().toISOString(),
    metadata: details.metadata,
    ...(details.clip ? { clip: details.clip } : {}),
    ...(kind === 'video' && details.posterSeconds !== undefined ? { posterSeconds: details.posterSeconds } : {}),
    ...(alphaMode ? { alphaMode } : {}),
    ...(details.playback ? { playback: details.playback } : {}),
    ...(details.generatedReference ? { generatedReference: true } : {}),
  }

  const db = await openLibrary()
  try {
    const transaction = db.transaction([ITEMS, ASSETS], 'readwrite')
    const done = finish(transaction)
    const items = transaction.objectStore(ITEMS)
    const assets = transaction.objectStore(ASSETS)
    let result = item

    function update(saved: MediaLibraryItem | undefined, replaceMissingAsset = false) {
      if (!saved) items.put(item)
      else if (saved.generatedReference && !item.generatedReference) {
        result = {
          ...item, addedAt: saved.addedAt,
          ...(!('posterSeconds' in details) || saved.posterEdited ? { posterSeconds: saved.posterSeconds, posterEdited: saved.posterEdited } : {}),
          ...(!('alphaMode' in details) || saved.alphaModeEdited ? { alphaMode: saved.alphaMode, alphaModeEdited: saved.alphaModeEdited } : {}),
          playback: reimportLibraryPlayback(saved, item.playback), playbackEdited: saved.playbackEdited, usageEdited: saved.usageEdited,
        }
        items.put(result)
      } else {
        const reimportClip = details.sourceId && 'clip' in details && !saved.clipEdited && mediaClipKey(item.clip) !== mediaClipKey(saved.clip)
        const reimportPoster = details.sourceId && saved.kind === 'video' && 'posterSeconds' in details
          && !saved.posterEdited && saved.posterSeconds !== item.posterSeconds
        const reimportAlpha = saved.kind === 'video' && !saved.alphaModeEdited && 'alphaMode' in details && saved.alphaMode !== alphaMode
          && (details.sourceId || (details.generatedReference && !saved.alphaMode))
        const catalogFilename = details.sourceId && !saved.metadata?.catalogFilename && item.metadata?.catalogFilename
        const nextPlayback = reimportLibraryPlayback(saved, item.playback)
        const reimportPlayback = details.sourceId && !sameMediaPlayback(saved.playback, nextPlayback)
        result = reimportClip || reimportPoster || reimportAlpha || catalogFilename || reimportPlayback ? {
          ...saved, ...(reimportClip ? { clip: item.clip } : {}), ...(reimportAlpha ? { alphaMode } : {}),
          ...(reimportPoster ? { posterSeconds: item.posterSeconds } : {}),
          ...(reimportPlayback ? { playback: nextPlayback } : {}),
          ...(catalogFilename ? { metadata: { ...saved.metadata, catalogFilename } } : {}),
        } : saved
        if (replaceMissingAsset) result = { ...result, assetId, size: item.size, mediaType: item.mediaType }
        if (result !== saved) items.put(result)
      }
      if (result.assetId === assetId) {
        const existingBlob = assets.getKey(assetId)
        existingBlob.onsuccess = () => {
          if (!existingBlob.result) assets.put({ id: assetId, blob: blob.slice(0, blob.size, item.mediaType) })
        }
      }
    }
    const existing = items.get(id)
    existing.onsuccess = () => {
      const saved = existing.result as MediaLibraryItem | undefined
      if (details.convertedFrom && saved && saved.assetId !== assetId) {
        const stored = assets.getKey(saved.assetId)
        stored.onsuccess = () => update(saved, stored.result === undefined)
      } else update(saved)
    }

    await done
    return result
  } finally {
    db.close()
  }
}

function convertedVideoId(details: MediaDetails, original: string) {
  return importIdentity(['easyworship-converted-video', details.sourceId ?? null, original])
}

/** Reuses an earlier conversion of the same source and keeps independent catalog settings. */
export async function saveMigratedLibraryMedia(source: Blob, details: MediaDetails): Promise<MediaLibraryItem> {
  const extension = (!details.kind || details.kind === 'video') ? legacyVideoExtension(details.filename) : undefined
  if (!extension) return saveLibraryMedia(source, details)
  if (!source.size || source.size > legacyVideoMaxBytes) throw new Error('ไฟล์วิดีโอต้นฉบับว่างหรือใหญ่เกิน 4 GB')
  const digest = await mediaFileHash(source)
  const id = await convertedVideoId(details, digest)
  const db = await openLibrary()
  let previous: MediaLibraryItem | undefined
  try { previous = await getRequest(db.transaction(ITEMS).objectStore(ITEMS).get(id)) }
  finally { db.close() }
  const converted = { ...details, filename: details.filename.replace(/\.[^.]+$/, '.mp4'), convertedFrom: digest,
    metadata: { ...details.metadata, catalogFilename: details.metadata?.catalogFilename ?? details.filename,
      legacyVideoSourceHash: digest, legacyVideoSourceSize: source.size } }
  const saved = previous && await readLibraryMedia(previous.assetId)
  if (saved) return saveLibraryMedia(saved, converted)
  const conversion = createLegacyVideoReader()
  try {
    const blob = await conversion.read(id, extension, async () => source)
    return await saveLibraryMedia(blob, converted)
  } finally { await conversion.close() }
}

export function visibleLibraryMedia(items: readonly MediaLibraryItem[]): MediaLibraryItem[] {
  const cataloged = new Set(items.filter((item) => !item.generatedReference).map((item) => item.assetId))
  return items.filter((item) => !item.generatedReference || !cataloged.has(item.assetId))
}

export async function listLibraryMedia(): Promise<MediaLibraryItem[]> {
  const db = await openLibrary()
  try {
    const items = (await getRequest(db.transaction(ITEMS).objectStore(ITEMS).getAll())) as MediaLibraryItem[]
    return visibleLibraryMedia(items)
      .sort((a, b) => a.name.localeCompare(b.name, 'th', { numeric: true }))
  } finally {
    db.close()
  }
}

export async function readLibraryMedia(assetId: string): Promise<Blob | null> {
  const db = await openLibrary()
  try {
    const asset = (await getRequest(db.transaction(ASSETS).objectStore(ASSETS).get(assetId))) as StoredAsset | undefined
    return asset?.blob ?? null
  } finally {
    db.close()
  }
}

export async function renameLibraryMedia(id: string, name: string): Promise<void> {
  const title = name.trim()
  if (!title) throw new Error('กรุณาใส่ชื่อสื่อ')
  await updateLibraryMediaRecord(id, (item) => ({ ...item, name: title }))
}

async function updateLibraryMediaRecord(id: string, update: (item: MediaLibraryItem) => MediaLibraryItem | undefined): Promise<void> {
  const db = await openLibrary()
  try {
    const transaction = db.transaction(ITEMS, 'readwrite')
    const done = finish(transaction)
    const store = transaction.objectStore(ITEMS)
    const request = store.get(id)
    request.onsuccess = () => {
      const item = request.result as MediaLibraryItem | undefined
      const changed = item && update(item)
      if (!changed) transaction.abort()
      else store.put({ ...changed, generatedReference: undefined })
    }
    await done
  } finally {
    db.close()
  }
}

export function setLibraryMediaInfo(id: string, changes: Partial<MediaInfo>): Promise<void> {
  return updateLibraryMediaRecord(id, (item) => {
    const metadata = { ...item.metadata }
    for (const field of mediaInfoFields) {
      const value = changes[field]
      if (value !== undefined) metadata[field] = value.trim() || null
    }
    return { ...item, metadata }
  })
}

export function setLibraryMediaClip(id: string, clip: MediaClip | undefined): Promise<void> {
  return updateLibraryMediaRecord(id, (item) => item.kind === 'image' ? undefined : { ...item, clip, clipEdited: true })
}

export function setLibraryMediaPoster(id: string, posterSeconds: number | undefined): Promise<void> {
  return updateLibraryMediaRecord(id, (item) => item.kind === 'video' ? { ...item, posterSeconds, posterEdited: true } : undefined)
}

export function setLibraryMediaAlpha(id: string, mode: VideoAlphaMode | undefined): Promise<void> {
  return updateLibraryMediaRecord(id, (item) => item.kind === 'video' ? { ...item, alphaMode: mode, alphaModeEdited: true } : undefined)
}

export function setLibraryMediaPlayback(id: string, playback: LibraryMediaPlayback): Promise<void> {
  return updateLibraryMediaRecord(id, (item) => {
    const { usage: before, ...oldPlayback } = item.playback ?? {}
    const { usage, ...nextPlayback } = playback
    return { ...item, playback, playbackEdited: item.playbackEdited || (!sameMediaPlayback(oldPlayback, nextPlayback) ? true : undefined),
      usageEdited: item.usageEdited || (before !== usage ? true : undefined) }
  })
}

export async function deleteLibraryMedia(id: string): Promise<void> {
  const db = await openLibrary()
  try {
    const transaction = db.transaction([ITEMS, ASSETS], 'readwrite')
    const done = finish(transaction)
    const store = transaction.objectStore(ITEMS)
    const request = store.get(id)
    request.onsuccess = () => {
      const item = request.result as MediaLibraryItem | undefined
      if (!item) return

      store.delete(id)
      const remaining = store.index('assetId').count(item.assetId)
      remaining.onsuccess = () => {
        if (remaining.result === 0) transaction.objectStore(ASSETS).delete(item.assetId)
      }
    }
    await done
  } finally {
    db.close()
  }
}
