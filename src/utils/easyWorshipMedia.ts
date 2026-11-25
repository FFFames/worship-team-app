/** Reviews EasyWorship Media.db catalogues and same-profile Resources locally. */

import type { Database } from 'sql.js'
import type { FileEntry } from '@zip.js/zip.js'
import type { LibraryMediaPlayback, MediaClip, MediaKind, MediaLibraryItem, MediaMetadata, VideoAlphaMode } from '../types/media'
import type { DesignSoundtrack } from '../types/slideDesign'
import { getEasyWorshipSql, isEasyWorshipSqliteDatabase } from './easyWorship'
import type { LegacySongEncoding } from './easyWorshipEncoding'
import type { EasyWorshipDesignReview } from './easyWorshipDesigns'
import { easyWorshipArchiveName, easyWorshipProfileRoot, withProfileMedia,
  type EasyWorshipMediaReference, type EasyWorshipProfileAssetSource } from './easyWorshipProfileFiles'
import { readEasyWorshipMediaClip, readEasyWorshipPosterSeconds } from './easyWorshipMediaClip'
import { readEasyWorshipVideoAlpha } from './videoAlpha'
import { libraryMediaMime, listLibraryMedia, readLibraryMedia } from './mediaLibrary'
import { legacyVideoExtension, legacyVideoInputMime } from './legacyVideo'
import { readEasyWorshipFeedCatalog, type EasyWorshipFeedEntry } from './easyWorshipFeedCatalog'
import { readEasyWorshipDvds } from './easyWorshipDvds'
import { readEasyWorshipMediaFlag, readEasyWorshipMediaPlayback, readEasyWorshipMediaUsage } from './easyWorshipMediaPlayback'
import type { DvdClip } from '../types/dvdClip'
import { readZipAsset, withZipAsset, type WithMediaBlob } from './zipAsset'
import { isPowerPointFilename, powerPointFilename } from './powerPointFilename'
import { mediaFileHash } from './importIdentity'
import { externalEasyWorshipMediaKey, matchEasyWorshipExternalMedia, suppliedEasyWorshipMediaLocation } from './easyWorshipExternalMedia'

export { mediaFileHash } from './importIdentity'

type SqlRow = Record<string, unknown>
const MAX_DATABASE_BYTES = 128 * 1024 * 1024

export function easyWorshipMediaInputMime(filename: string) {
  return libraryMediaMime(filename) ?? legacyVideoInputMime(filename)
}

export type EasyWorshipMediaProfile = { id: string; name: string; databasePath: string }
export type EasyWorshipMediaEntry = {
  sourceId: string
  name: string
  kind: MediaKind
  filename: string
  catalogPath?: string
  sourcePath?: string
  rejectedPath?: string
  originalLocation?: string
  importSourceId?: string
  unregistered?: boolean
  readFile?: () => Promise<Blob>
  withFile?: <T>(consume: (blob: Blob) => Promise<T>) => Promise<T>
  metadata?: MediaMetadata
  clip?: MediaClip
  posterSeconds?: number
  alphaMode?: VideoAlphaMode
  playback?: LibraryMediaPlayback
  warning?: string
}
export type EasyWorshipMediaReview = {
  profiles: EasyWorshipMediaProfile[]
  entries?: EasyWorshipMediaEntry[]
  feeds?: EasyWorshipFeedEntry[]
  dvds?: DvdClip[]
  dvdCatalog?: Array<[string, DvdClip]>
  unsupported: Array<{ sourceId?: string; message: string }>
  legacyThemes?: EasyWorshipDesignReview
}
export type EasyWorshipMediaAssetSource = EasyWorshipProfileAssetSource
type AssetSource = EasyWorshipMediaAssetSource

export function withReviewedMedia<T>(
  entry: Pick<EasyWorshipMediaEntry, 'readFile' | 'withFile'>, consume: (blob: Blob) => Promise<T>,
): Promise<T> {
  if (entry.withFile) return entry.withFile(consume)
  if (entry.readFile) return entry.readFile().then(consume)
  return Promise.reject(new Error('ไม่พบไฟล์สื่อที่อ้างอิง'))
}

/** Maps each unambiguous catalog reference to its resolved file. */
export function resolvedMediaPaths(entries: readonly EasyWorshipMediaEntry[]) {
  const paths = new Map<string, Set<string | undefined>>()
  for (const { catalogPath, sourcePath } of entries) {
    if (!catalogPath) continue
    const canonical = key(catalogPath)
    const matches = paths.get(canonical) ?? new Set<string | undefined>()
    matches.add(sourcePath)
    paths.set(canonical, matches)
  }
  const resolved = new Map<string, string>()
  for (const [canonical, matches] of paths) {
    if (matches.size !== 1) continue
    const [path] = matches
    if (path) resolved.set(canonical, path)
  }
  return resolved
}

export function relocatedMediaPaths(entries: readonly EasyWorshipMediaEntry[]) {
  const paths = resolvedMediaPaths(entries)
  for (const [canonical, path] of paths) {
    if (key(path) === canonical) paths.delete(canonical)
  }
  return paths
}

function rows(database: Database, query: string): SqlRow[] {
  const statement = database.prepare(query)
  const result: SqlRow[] = []
  try { while (statement.step()) result.push(statement.getAsObject()) } finally { statement.free() }
  return result
}
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
function normalize(path: string): string { return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/') }
function key(path: string): string { return normalize(path).toLowerCase() }
function directory(path: string): string { return path.slice(0, path.lastIndexOf('/') + 1) }
function isCatalogPath(path: string): boolean {
  return /^(?:.*\/data\/|data\/)?(?:media|backgrounds)\.db$/i.test(path)
    || /^(?:media|backgrounds)\.db$/i.test(basename(path)) && Boolean(easyWorshipArchiveName(directory(path)))
}
function basename(path: string): string { return normalize(path).split('/').pop() ?? '' }
function root(path: string): string {
  return easyWorshipProfileRoot(directory(normalize(path)))
}
function profileId(path: string): string {
  return 'easyworship-media-' + key(path).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}
function mediaProfile(databasePath: string): EasyWorshipMediaProfile {
  const name = root(databasePath).replace(/\/$/, '') || 'EasyWorship profile'
  const archiveName = easyWorshipArchiveName(directory(normalize(databasePath)))
  return { id: profileId(databasePath), name: archiveName ? `${name} · ฐานข้อมูลย้อนหลัง ${archiveName}` : name, databasePath }
}
const resourceFolder = { image: 'Images', video: 'Videos', audio: 'Audio' } as const
const typeKind: Partial<Record<number, MediaKind>> = { 1: 'video', 2: 'image', 5: 'audio' }
const absoluteDiskPath = (path: string) => /^(?:[a-z]:[/\\]|[/\\]{2}[^/\\]|\/)/i.test(path) && !path.includes('\0')

function readFileReference(row: SqlRow) {
  const type = integer(row.media_type)
  const kind = type === undefined ? undefined : typeKind[type]
  const location = text(row.path) ?? ''
  const filename = text(row.filename)
  if (!kind || !filename || !basename(filename)) return
  const external = absoluteDiskPath(filename) || absoluteDiskPath(location)
  if (external ? !easyWorshipMediaInputMime(filename)?.startsWith(kind + '/') : location.toLowerCase() !== `<${resourceFolder[kind].toLowerCase()}>`) return
  const separator = location.includes('\\') ? '\\' : '/'
  return {
    kind, filename: external ? basename(filename) : filename,
    originalLocation: external ? (absoluteDiskPath(filename) ? filename : `${location.replace(/[/\\]+$/, '')}${separator}${filename}`) : undefined,
    size: integer(row.filesize), hash: text(row.file_hash),
  }
}

function expectedAssetPath(databasePath: string, kind: MediaKind, filename: string): string {
  return root(databasePath) + 'Resources/' + resourceFolder[kind] + '/' + filename
}
function hasMediaTable(database: Database): boolean {
  return rows(database, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'media'").length === 1
}

function sourceFromFiles(files: File[]): AssetSource {
  const byPath = new Map<string, File>()
  const paths = new Map<string, string[]>()
  for (const file of files) {
    const path = normalize(file.webkitRelativePath || file.name)
    byPath.set(path, file)
    paths.set(key(path), [...(paths.get(key(path)) ?? []), path])
  }
  return {
    paths,
    size: (path) => byPath.get(path)?.size,
    read: async (path) => {
      const file = byPath.get(path)
      if (!file) throw new Error('ไม่พบไฟล์สื่อ EasyWorship ที่อ้างอิง')
      return file
    },
  }
}

/** Adds supplied files as recovery candidates without indexing them as profile resources. */
export function attachEasyWorshipMediaFiles(source: AssetSource, files: readonly File[], includePowerPoint = false): AssetSource {
  if (!files.length) return source
  const attachments = new Map<string, File>()
  const attachedMediaLocations = new Map(source.attachedMediaLocations)
  files.forEach((file, index) => {
    const supported = easyWorshipMediaInputMime(file.name) || (includePowerPoint && isPowerPointFilename(file.name))
    if (!supported || !file.size || /[/\\\0]/.test(file.name)) return
    const location = suppliedEasyWorshipMediaLocation(file)
    if (file.webkitRelativePath && !location) return
    let path = `@attached-media/${index}/${file.name}`
    while (source.paths.has(key(path)) || source.attachedMedia?.includes(path)) path = '@' + path
    attachments.set(path, file)
    if (location) attachedMediaLocations.set(path, location)
  })
  const withMedia: WithMediaBlob = async (path, consume) => {
    const attached = attachments.get(path)
    return attached ? consume(attached) : withProfileMedia(source, path, consume)
  }
  return {
    ...source, attachedMedia: [...(source.attachedMedia ?? []), ...attachments.keys()], attachedMediaLocations,
    read: async (path, onWalRecovery) => attachments.get(path) ?? source.read(path, onWalRecovery),
    withMedia,
    size: (path) => attachments.get(path)?.size ?? source.size(path),
  }
}

async function sourceFromArchive(file: File): Promise<AssetSource> {
  const { BlobReader, ZipReader } = await import('@zip.js/zip.js')
  const archive = new ZipReader(new BlobReader(file))
  try {
    const paths = new Map<string, string[]>()
    const entries = new Map<string, FileEntry>()
    for await (const entry of archive.getEntriesGenerator()) {
      if (entry.directory) continue
      const path = normalize(entry.filename)
      paths.set(key(path), [...(paths.get(key(path)) ?? []), path])
      entries.set(path, entry)
    }
    function locate(path: string) {
      const entry = entries.get(path)
      if (!entry || entry.encrypted) throw new Error(`ไฟล์ ${basename(path)} เปิดไม่ได้หรือมีรหัสผ่าน`)
      if (isCatalogPath(path) && entry.uncompressedSize > MAX_DATABASE_BYTES) throw new Error(`${basename(path)} มีขนาดเกิน 128 MB`)
      if (basename(path).toLowerCase() === 'backgrounds.mb' && entry.uncompressedSize > 4 * MAX_DATABASE_BYTES) {
        throw new Error('BackGrounds.MB มีขนาดเกิน 512 MB')
      }
      return entry
    }
    return { paths, size: (path) => entries.get(path)?.uncompressedSize,
      read: async (path) => readZipAsset(file, locate(path)),
      withMedia: async (path, consume) => withZipAsset(file, locate(path), consume) }
  } finally { await archive.close() }
}

function assetMatch(source: AssetSource, expected: string): { path?: string; warning?: string } {
  const matches = source.paths.get(key(expected)) ?? []
  if (matches.length === 1) return { path: matches[0] }
  return { warning: matches.length > 1
    ? 'พบไฟล์สื่อชื่อเดียวกันมากกว่าหนึ่งไฟล์ จึงไม่นำเข้าโดยเดา'
    : 'ไม่พบไฟล์สื่อในโปรไฟล์ EasyWorship เดียวกัน' }
}

export function createEasyWorshipMediaHashFinder<T>(digest: (candidate: T) => Promise<string | undefined>) {
  const hashes = new Map<T, Promise<string | undefined>>()
  return async (expected: string, candidates: Iterable<T>) => {
    for (const candidate of candidates) {
      let hash = hashes.get(candidate)
      if (!hash) {
        hash = digest(candidate).catch(() => undefined)
        hashes.set(candidate, hash)
      }
      if (await hash === expected) return candidate
    }
    return undefined
  }
}

/** Looks for exact original bytes, with optional reuse of a previous legacy video conversion. */
export function createEasyWorshipLibraryMediaFinder() {
  let catalog: ReturnType<typeof listLibraryMedia> | undefined
  const findByHash = createEasyWorshipMediaHashFinder(async (assetId: string) => {
    const blob = await readLibraryMedia(assetId)
    return blob ? mediaFileHash(blob) : undefined
  })
  const fileKey = (name: string) => powerPointFilename(name).normalize('NFC').toLowerCase()
  return async ({ kind, filename, hash, size }: EasyWorshipMediaReference, allowConverted = false) => {
    if (!validHash(hash)) return undefined
    const expected = hash.toLowerCase()
    const items = (await (catalog ??= listLibraryMedia().catch(() => []))).filter((item) => item.kind === kind)
    const name = fileKey(filename)
    const named = items.filter((item) => fileKey(item.filename) === name).map(({ assetId }) => assetId)
    const sized = items.filter((item) => item.size === size).map(({ assetId }) => assetId)
    const exact = await findByHash(expected, new Set([...named, ...sized]))
      ?? await findByHash(expected, new Set(items.map(({ assetId }) => assetId)))
    if (exact) return items.find(({ assetId }) => assetId === exact)
    if (!allowConverted || kind !== 'video') return undefined
    const conversions = items.filter(({ metadata }) => metadata?.legacyVideoSourceHash === expected
      && (!size || metadata.legacyVideoSourceSize === size))
    const candidates = new Map(conversions.map((item) => [item.assetId, item]))
    if (candidates.size !== 1) return undefined
    const [item] = candidates.values()
    if ((await readLibraryMedia(item.assetId).catch(() => null))?.type === 'video/mp4') return item
  }
}

/** Adds borrowed media only after finding it by checksum. It never participates in filename discovery. */
export function withEasyWorshipLibraryMedia(source: AssetSource) {
  const find = createEasyWorshipLibraryMediaFinder()
  const borrowed = new Map<string, MediaLibraryItem>()
  async function readBorrowed(path: string, item: MediaLibraryItem) {
    const blob = await readLibraryMedia(item.assetId)
    if (!blob) throw new Error(`ไม่พบ ${basename(path)} ในคลังสื่อแล้ว`)
    return blob
  }
  const scoped: AssetSource = {
    ...source,
    async findLibraryMedia(reference) {
      const item = await find(reference)
      if (!item) return undefined
      let path = `@library-media/${item.assetId}/${basename(item.filename)}`
      while (source.paths.has(key(path))) path = '@' + path
      borrowed.set(path, item)
      return path
    },
    async read(path, onWalRecovery) {
      const item = borrowed.get(path)
      return item ? readBorrowed(path, item) : source.read(path, onWalRecovery)
    },
    async withMedia(path, consume) {
      const item = borrowed.get(path)
      return item ? consume(await readBorrowed(path, item)) : withProfileMedia(source, path, consume)
    },
    size: (path) => borrowed.get(path)?.size ?? source.size(path),
  }
  return { source: scoped, borrowedPaths: () => borrowed.keys() }
}

type MediaReference = NonNullable<ReturnType<typeof readFileReference>>
const recoveryKey = (kind: MediaKind, size: number) => `${kind}:${size}`
const nameSizeKey = ({ kind, filename, size }: Pick<MediaReference, 'kind' | 'filename' | 'size'>) => JSON.stringify([kind, key(basename(filename)), size])
const validHash = (value?: string): value is string => !!value && /^[a-f0-9]{64}$/i.test(value)

type CatalogMediaMatch = { hash?: string; sourcePath?: string; audioRole?: DesignSoundtrack['role'] | null }
export type CatalogMediaLookup = (kind: MediaKind, filename: string) => CatalogMediaMatch | undefined

/** Supplies a catalog checksum to a layout whose own media reference has none. */
export function createCatalogMediaLookup(entries: readonly EasyWorshipMediaEntry[], databasePath: string): CatalogMediaLookup {
  const byPath = new Map<string, CatalogMediaMatch | undefined>()
  const byLocation = new Map<string, CatalogMediaMatch | undefined>()
  for (const { kind, catalogPath, sourcePath, metadata, originalLocation } of entries) {
    const stored = metadata?.fileHash
    const role = metadata?.audioRole
    const hash = typeof stored === 'string' && validHash(stored) ? stored.toLowerCase() : undefined
    const match: CatalogMediaMatch = { hash, sourcePath, audioRole: role === 'background' || role === 'foreground' ? role : undefined }
    if (catalogPath) add(byPath, key(catalogPath), hash ? match : undefined)
    const location = externalEasyWorshipMediaKey(originalLocation)
    if (location) add(byLocation, `${kind}:${location}`, match)
  }
  function add(index: Map<string, CatalogMediaMatch | undefined>, path: string, match?: CatalogMediaMatch) {
    const previous = index.get(path)
    if (!index.has(path)) index.set(path, match)
    else if (previous && match && previous.hash === match.hash && (match.hash || previous.sourcePath === match.sourcePath)) {
      const { audioRole: priorRole } = previous
      index.set(path, {
        hash: previous.hash,
        sourcePath: previous.sourcePath ?? match.sourcePath,
        audioRole: priorRole === undefined ? match.audioRole
          : match.audioRole === undefined || priorRole === match.audioRole ? priorRole : null,
      })
    } else index.set(path, undefined)
  }
  return (kind: MediaKind, filename: string) => {
    const location = externalEasyWorshipMediaKey(filename)
    if (location) return byLocation.has(`${kind}:${location}`) ? byLocation.get(`${kind}:${location}`) ?? {} : undefined
    const relative = normalize(filename.replace(/^<(?:images|videos|audio|imageresourcesdir|videoresourcesdir|audioresourcesdir)>[/\\]*/i, ''))
    return byPath.get(key(expectedAssetPath(databasePath, kind, relative)))
  }
}

/** Makes catalogued filenames safe for use by the song and presentation layout readers. */
export function easyWorshipArtworkContext(source: AssetSource, entries: readonly EasyWorshipMediaEntry[], databasePath?: string, archived = false) {
  const rejected = entries.flatMap(({ rejectedPath }) => rejectedPath ? [rejectedPath] : [])
  const rejectedPaths = new Set(rejected.map(key))
  const resolved = resolvedMediaPaths(entries)
  const relocated = [...resolved].filter(([catalogPath, sourcePath]) => catalogPath !== key(sourcePath))
  const blocked = entries.flatMap(({ originalLocation, rejectedPath, catalogPath }) =>
    (originalLocation || rejectedPath || archived) && catalogPath && !resolved.has(key(catalogPath)) ? [key(catalogPath)] : [])
  const artwork = relocated.length || blocked.length
    ? { ...source, paths: new Map(source.paths), hashOnlyMedia: [...(source.hashOnlyMedia ?? []), ...rejected] } : source
  for (const path of blocked) artwork.paths.delete(path)
  for (const [catalogPath, sourcePath] of relocated) artwork.paths.set(catalogPath, [sourcePath])
  const roles = new Map<string, DesignSoundtrack['role'] | null>()
  for (const entry of entries) {
    const role = entry.metadata?.audioRole
    if (entry.kind !== 'audio' || !entry.sourcePath || (role !== 'background' && role !== 'foreground')) continue
    const current = roles.get(entry.sourcePath)
    roles.set(entry.sourcePath, current === undefined || current === role ? role : null)
  }
  return { source: artwork, rejectedPaths, audioRole: (path: string) => roles.get(path) ?? undefined,
    catalogMedia: databasePath ? createCatalogMediaLookup(entries, databasePath) : undefined }
}

function mediaRecovery(source: AssetSource, databasePath: string, nameCounts: ReadonlyMap<string, number>,
  checkHash: ReturnType<typeof createEasyWorshipMediaHashFinder<string>>) {
  const candidates = new Map<string, string[]>()
  const byKind = new Map<string, string[]>()
  const named = new Map<string, string[]>()
  function add(index: Map<string, string[]>, id: string, path: string) {
    const paths = index.get(id) ?? []
    paths.push(path)
    index.set(id, paths)
  }
  const resourceRoot = key(root(databasePath) + 'Resources/')
  for (const [candidateKey, paths] of source.paths) {
    if (paths.length !== 1 || !candidateKey.startsWith(resourceRoot)) continue
    const relative = candidateKey.slice(resourceRoot.length)
    const folder = /^(images|videos|audio)\//.exec(relative)?.[1]
    if (!folder || relative.split('/').some((part) => !part || part === '.' || part === '..' || part.includes(':'))) continue
    const mime = easyWorshipMediaInputMime(relative)
    const kind = folder === 'images' ? 'image' : folder === 'videos' ? 'video' : 'audio'
    const size = source.size(paths[0])
    if (!mime?.startsWith(kind + '/') || !size) continue
    add(candidates, recoveryKey(kind, size), paths[0])
    add(byKind, kind, paths[0])
  }
  const supplied = new Set(source.attachedMedia)
  const matchLocation = matchEasyWorshipExternalMedia(source.attachedMediaLocations)
  for (const path of new Set([...(source.hashOnlyMedia ?? []), ...supplied])) {
    const size = source.size(path)
    const kind = easyWorshipMediaInputMime(path)?.split('/')[0] as MediaKind | undefined
    if (!size || !kind) continue
    add(byKind, kind, path)
    add(candidates, recoveryKey(kind, size), path)
    if (supplied.has(path) && !source.attachedMediaLocations?.has(path)) add(named, nameSizeKey({ kind, size, filename: path }), path)
  }

  return async (ref: MediaReference) => {
    const { kind, size } = ref
    if (!validHash(ref.hash)) {
      const location = ref.originalLocation && matchLocation(ref.originalLocation)
      if (location) {
        const [path] = location.candidates
        return location.candidates.length === 1 && (!size || size < 0 || source.size(path) === size) ? path : undefined
      }
      const name = nameSizeKey(ref)
      const namesakes = named.get(name)
      return nameCounts.get(name) === 1 && namesakes?.length === 1 ? namesakes[0] : undefined
    }
    const expected = ref.hash.toLowerCase()
    if (!size || size < 0) return checkHash(expected, byKind.get(kind) ?? [])
    return await checkHash(expected, candidates.get(recoveryKey(kind, size)) ?? [])
      ?? checkHash(expected, byKind.get(kind) ?? [])
  }
}

async function catalog(bytes: Uint8Array, databasePath: string, source: AssetSource) {
  if (!isEasyWorshipSqliteDatabase(bytes)) throw new Error('Media.db ไม่ใช่ฐานข้อมูล SQLite ของ EasyWorship ที่รองรับ')
  const SQL = await getEasyWorshipSql()
  const database = new SQL.Database(bytes)
  try {
    if (!hasMediaTable(database)) throw new Error('Media.db นี้ไม่มีตารางสื่อ EasyWorship ที่รองรับ')
    const entries: EasyWorshipMediaEntry[] = []
    const feeds = await readEasyWorshipFeedCatalog(database, databasePath)
    const feedRows = new Set(feeds.map((feed) => feed.sourceId))
    const dvds = readEasyWorshipDvds(database)
    const unsupported: EasyWorshipMediaReview['unsupported'] = []
    const archived = Boolean(easyWorshipArchiveName(directory(normalize(databasePath))))
    const checkHash = createEasyWorshipMediaHashFinder((path: string) => withProfileMedia(source, path, mediaFileHash))
    let recover: ReturnType<typeof mediaRecovery> | undefined
    // NOT INDEXED avoids the vendor-only UTF8_U_CI collation in supplied catalogues.
    const files = rows(database, 'SELECT CAST(rowid AS TEXT) AS source_row_id, * FROM media NOT INDEXED ORDER BY rowid')
      .filter((row) => !feedRows.has(String(row.source_row_id)) && !dvds.has(String(row.source_row_id)))
      .map((row) => ({ row, ref: readFileReference(row) }))
    const nameCounts = new Map<string, number>()
    if (source.attachedMedia?.length) {
      for (const { ref } of files) {
        if (!ref?.size) continue
        const signature = nameSizeKey(ref)
        nameCounts.set(signature, (nameCounts.get(signature) ?? 0) + 1)
      }
    }
    for (const { row, ref } of files) {
      const id = text(row.source_row_id)
      const type = integer(row.media_type)
      if (id === undefined || type === undefined || !text(row.filename)) {
        unsupported.push({ sourceId: id === undefined ? undefined : String(id), message: 'ระเบียนสื่อ EasyWorship ไม่สมบูรณ์' })
        continue
      }
      if (!ref) {
        unsupported.push({ sourceId: String(id), message: 'ชนิดสื่อ EasyWorship ' + type + ' ยังไม่รองรับ' })
        continue
      }
      const { kind, filename, originalLocation, size: filesize, hash: fileHash } = ref
      const catalogPath = normalize(expectedAssetPath(databasePath, kind, filename))
      let match = originalLocation ? { warning: 'แนบไฟล์ต้นฉบับเพื่อกู้สื่อจากไดรฟ์หรือโฟลเดอร์ภายนอก' }
        : assetMatch(source, catalogPath)
      let rejectedPath: string | undefined
      if (match.path) {
        const valid = validHash(fileHash) ? Boolean(await checkHash(fileHash.toLowerCase(), [match.path]))
          : !archived || !filesize || filesize < 0 || source.size(match.path) === filesize
        if (!valid) {
          rejectedPath = match.path
          match = { warning: `ไฟล์ใน Resources ไม่ตรงกับข้อมูลใน Media.db${archived ? ' ย้อนหลัง' : ''} กรุณาแนบไฟล์ต้นฉบับ` }
        }
      }
      const relocated = match.path ? undefined : await (recover ??= mediaRecovery(source, databasePath, nameCounts, checkHash))(ref)
      const libraryPath = !match.path && !relocated && validHash(fileHash)
        ? await source.findLibraryMedia?.({ kind, filename, hash: fileHash, size: filesize }) : undefined
      const assetPath = match.path ?? relocated ?? libraryPath
      const needsDesktop = kind === 'video' && legacyVideoExtension(filename) && !legacyVideoInputMime(filename)
      const metadata: MediaMetadata = {
        mediaUid: text(row.media_uid) ?? null,
        author: text(row.author) ?? null,
        copyright: text(row.copyright) ?? null,
        description: text(row.description) ?? null,
        tags: text(row.tags) ?? null,
        ...(text(row.folder) ? { sourceFolder: text(row.folder) ?? null } : {}),
        fileHash: fileHash ?? null,
        filesize: filesize ?? null,
        modifiedDate: text(row.modified_date) ?? integer(row.modified_date) ?? null,
        duration: integer(row.duration) ?? null,
        ...(kind === 'audio' && (row.usage_type === 1 || row.usage_type === 2)
          ? { audioRole: row.usage_type === 1 ? 'background' : 'foreground' } : {}),
        width: integer(row.width) ?? null,
        height: integer(row.height) ?? null,
        ...(assetPath && basename(assetPath) !== basename(filename) ? { catalogFilename: basename(filename) } : {}),
        ready: typeof row.ready === 'number' ? row.ready !== 0 : null,
        error: text(row.error_msg) ?? null,
      }
      const clip = kind === 'image' ? undefined : readEasyWorshipMediaClip(row.start_pos, row.end_pos)
      const posterSeconds = kind === 'video' ? readEasyWorshipPosterSeconds(row.poster_frame_pos) : undefined
      const playback = readEasyWorshipMediaPlayback(kind === 'image' ? undefined : row.volume, kind === 'image' ? undefined : row.mute,
        kind === 'audio' ? undefined : row.aspect_type)
      const usage = kind === 'audio' ? undefined : readEasyWorshipMediaUsage(row.usage_type)
      const repeat = kind === 'image' ? undefined : readEasyWorshipMediaFlag(row.repeating)
      entries.push({ sourceId: String(id), name: text(row.title) ?? basename(filename), kind,
        filename: basename(assetPath ?? filename), catalogPath, metadata, originalLocation,
        ...(rejectedPath ? { rejectedPath } : {}),
        ...(kind !== 'image' && ('start_pos' in row || 'end_pos' in row) ? { clip } : {}),
        ...(kind === 'video' && (posterSeconds !== undefined || row.poster_frame_pos === -1) ? { posterSeconds } : {}),
        ...(kind === 'video' && 'alpha_channel_mode' in row ? { alphaMode: readEasyWorshipVideoAlpha(row.alpha_channel_mode) } : {}),
        ...(playback || repeat !== undefined || usage !== undefined ? { playback: { ...playback,
          ...(repeat !== undefined ? { repeat } : {}), ...(usage !== undefined ? { usage } : {}) } } : {}),
        ...(assetPath && !needsDesktop ? { sourcePath: assetPath, readFile: () => source.read(assetPath),
          withFile: (consume) => withProfileMedia(source, assetPath, consume) } : {}),
        ...(needsDesktop ? { warning: 'เปิดโปรไฟล์นี้ใน WorshipTeam Desktop เพื่อแปลงวิดีโอเป็น MP4' }
          : libraryPath ? { warning: `กู้ ${basename(libraryPath)} จากคลังสื่อในเบราว์เซอร์นี้` }
          : relocated ? { warning: `กู้การอ้างอิงไปยัง ${basename(relocated)} จากข้อมูลใน Media.db` }
          : match.warning ? { warning: match.warning } : {}) })
    }
    return { entries, ...(feeds.length ? { feeds } : {}), ...(dvds.size ? {
      dvds: [...new Map([...dvds.values()].map((clip) => [clip.id, clip])).values()], dvdCatalog: [...dvds],
    } : {}), unsupported }
  } finally { database.close() }
}

/** Reuses a caller-owned, already profile-scoped lazy source. */
export async function reviewEasyWorshipMediaFromSource(
  source: EasyWorshipMediaAssetSource, databasePath: string, legacyEncoding?: LegacySongEncoding,
): Promise<EasyWorshipMediaReview> {
  const profileRoot = root(databasePath)
  const profiles = [mediaProfile(databasePath)]
  if (basename(databasePath).toLowerCase() === 'backgrounds.db') {
    const { reviewLegacyBackgrounds } = await import('./easyWorshipLegacyBackgrounds')
    return { profiles, ...await reviewLegacyBackgrounds(source, databasePath, profileRoot, legacyEncoding) }
  }
  const blob = await source.read(databasePath)
  if (blob.size > MAX_DATABASE_BYTES) throw new Error('Media.db มีขนาดเกิน 128 MB')
  const result = await catalog(new Uint8Array(await blob.arrayBuffer()), databasePath, source)
  return { profiles, ...result }
}

/** Reviews a selected profile; archive media stays lazy until readFile() is invoked. */
export async function reviewEasyWorshipMedia(source: File | File[], selectedDatabasePath?: string, attachedMedia: readonly File[] = []): Promise<EasyWorshipMediaReview> {
  const archiveInput = source instanceof File && /\.(ewprofile|ewpck|zip)$/i.test(source.name)
  const files = archiveInput ? await sourceFromArchive(source) : sourceFromFiles(source instanceof File ? [source] : source)
  const databasePaths = [...files.paths.values()].filter(([path]) => isCatalogPath(path)).map((matches) => {
    if (matches.length !== 1) throw new Error(`พบไฟล์ฐานข้อมูลสื่อซ้ำใน ${matches[0]}`)
    return matches[0]
  })
  const profiles = databasePaths.map(mediaProfile)
  if (profiles.length === 0) throw new Error('ไม่พบ Media.db หรือ BackGrounds.DB ในไฟล์ที่เลือก')
  const selected = selectedDatabasePath
    ? profiles.find((profile) => normalize(profile.databasePath) === normalize(selectedDatabasePath))
    : profiles.length === 1 ? profiles[0] : undefined
  if (!selected) return { profiles, unsupported: [{ message: 'พบฐานข้อมูลสื่อมากกว่าหนึ่งรายการ โปรดเลือกไฟล์ที่จะนำเข้า' }] }
  const library = withEasyWorshipLibraryMedia(attachEasyWorshipMediaFiles(files, attachedMedia))
  const result = await reviewEasyWorshipMediaFromSource(library.source, selected.databasePath)
  return { ...result, profiles }
}
