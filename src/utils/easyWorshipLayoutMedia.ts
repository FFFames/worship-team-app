/** Verifies media linked by a native EasyWorship layout before it enters the library. */

import type { Database } from 'sql.js'
import type { MediaKind } from '../types/media'
import type { DesignAsset, DesignSoundtrack } from '../types/slideDesign'
import { withProfileMedia, type EasyWorshipProfileAssetSource } from './easyWorshipProfileFiles'
import { createEasyWorshipMediaHashFinder, easyWorshipMediaInputMime, mediaFileHash, type CatalogMediaLookup } from './easyWorshipMedia'
import { externalEasyWorshipMediaKey, matchEasyWorshipExternalMedia } from './easyWorshipExternalMedia'

export type LayoutMediaSource = Pick<EasyWorshipProfileAssetSource, 'paths' | 'read'>
  & Partial<Pick<EasyWorshipProfileAssetSource, 'size' | 'attachedMedia' | 'attachedMediaLocations' | 'hashOnlyMedia' | 'withMedia' | 'findLibraryMedia'>>
export type ResolveLayoutMedia = (kind: MediaKind, filename: string, packedFilename?: string, hash?: string, size?: unknown) =>
  Partial<Omit<DesignAsset, 'kind'>> & { audioRole?: DesignSoundtrack['role'] }
export type PrepareLayoutMedia = (db: Database, fallback: ResolveLayoutMedia) => Promise<ResolveLayoutMedia>

function sha256(value: unknown) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim()) ? value.trim().toLowerCase() : undefined
}

function filename(path: string) {
  return path.replace(/\\/g, '/').replace(/^<[^<>]+>\/?/, '').split('/').pop() ?? path
}

const mediaTable = { image: 'resource_image', video: 'resource_video', audio: 'resource_audio' } as const

export function prepareProfileLayoutMedia(source: LayoutMediaSource, root: string,
  audioRole?: (path: string) => DesignSoundtrack['role'] | undefined,
  catalogMedia?: CatalogMediaLookup): PrepareLayoutMedia {
  const digests = new Map<string, Promise<string | undefined>>()
  function digest(path: string) {
    const cached = digests.get(path)
    if (cached) return cached
    const hash = withProfileMedia(source, path, mediaFileHash).catch(() => undefined)
    digests.set(path, hash)
    return hash
  }
  const findByHash = createEasyWorshipMediaHashFinder(digest)
  const resourceRoot = (root + 'Resources/').toLowerCase()
  const matchLocation = matchEasyWorshipExternalMedia(source.attachedMediaLocations)
  let candidates: Map<MediaKind, string[]> | undefined

  function candidatesFor(kind: MediaKind) {
    if (!candidates) {
      candidates = new Map()
      const all = new Set<string>()
      for (const [key, paths] of source.paths) {
        if (key.startsWith(resourceRoot)) paths.forEach((path) => all.add(path))
      }
      for (const path of [...(source.attachedMedia ?? []), ...(source.hashOnlyMedia ?? [])]) all.add(path)
      for (const path of all) {
        const mediaKind = easyWorshipMediaInputMime(path)?.split('/')[0] as MediaKind | undefined
        if (!mediaKind || source.size?.(path) === 0) continue
        const list = candidates.get(mediaKind) ?? []
        list.push(path)
        candidates.set(mediaKind, list)
      }
    }
    return candidates.get(kind) ?? []
  }

  function verified(kind: MediaKind, original: string, hash: string, path?: string): ReturnType<ResolveLayoutMedia> {
    const catalog = kind === 'audio' ? catalogMedia?.(kind, original) : undefined
    const role = catalog?.hash === hash && catalog.audioRole !== undefined
      ? catalog.audioRole ?? undefined : path && kind === 'audio' ? audioRole?.(path) : undefined
    const audio = role ? { audioRole: role } : {}
    if (!path) return { easyWorshipFileHash: hash, ...audio }
    const actual = filename(path)
    return { sourcePath: path, easyWorshipFileHash: hash,
      ...(easyWorshipMediaInputMime(filename(original)) !== easyWorshipMediaInputMime(actual) ? { filename: actual } : {}),
      ...audio }
  }

  function locatedPath(original: string, bytes: unknown, catalog: ReturnType<CatalogMediaLookup>) {
    const match = catalog ? undefined : matchLocation(original)
    const path = catalog ? catalog.sourcePath : match?.candidates.length === 1 ? match.candidates[0] : undefined
    const actual = path && source.size?.(path)
    if (!path || (typeof bytes === 'number' && bytes > 0 && typeof actual === 'number' && actual !== bytes)) return undefined
    return path
  }

  return async (db, fallback) => {
    const tables = new Set(db.exec("SELECT lower(name) FROM sqlite_master WHERE type='table'")[0]?.values.flat())
    const fileColumns = new Set(tables.has('file') ? db.exec('PRAGMA table_info(file)')[0]?.values.map((column) => column[1]) : [])
    const locatedDigests = new Map<string, string | undefined>()
    const resolved = new Map<string, string | undefined>()
    for (const [kind, table] of Object.entries(mediaTable) as [MediaKind, string][]) {
      if (!tables.has(table)) continue
      const columns = new Set(db.exec(`PRAGMA table_info(${table})`)[0]?.values.map((column) => column[1]))
      if (!columns.has('original_filename')) continue
      const withFiles = columns.has('file_id') && fileColumns.has('file_hash')
      const references = db.exec(`SELECT r.original_filename, ${withFiles && fileColumns.has('filename') ? 'f.filename' : 'NULL'},
          ${withFiles ? 'f.file_hash' : 'NULL'}, ${columns.has('filesize') ? 'r.filesize' : 'NULL'}
        FROM ${table} AS r NOT INDEXED ${withFiles ? 'LEFT JOIN file AS f ON r.file_id=f.rowid' : ''}`)[0]?.values ?? []
      for (const [original, packed, checksum, bytes] of references) {
        if (typeof original !== 'string') continue
        const hash = sha256(checksum)
        if (!hash) {
          if (!externalEasyWorshipMediaKey(original)) continue
          const catalog = catalogMedia?.(kind, original)
          if (catalog?.hash) continue
          const path = locatedPath(original, bytes, catalog)
          if (path && !locatedDigests.has(path)) locatedDigests.set(path, await digest(path))
          continue
        }
        const key = `${kind}:${hash}`
        if (resolved.get(key)) continue
        const names = [original, packed].flatMap((name) => typeof name === 'string' ? [filename(name).toLowerCase()] : [])
        const paths = candidatesFor(kind)
        const named = new Set(paths.filter((path) => names.includes(filename(path).toLowerCase())))
        const preferred = await findByHash(hash, named)
        const other = paths.filter((path) => !named.has(path))
        const likely = other.filter((path) => {
          const size = source.size?.(path)
          return typeof bytes !== 'number' || bytes <= 0 || size === undefined || size === bytes
        })
        const match = preferred ?? await findByHash(hash, likely)
          ?? (likely.length === other.length ? undefined : await findByHash(hash, other))
        resolved.set(key, match ?? await source.findLibraryMedia?.({
          kind, filename: original, hash, size: typeof bytes === 'number' ? bytes : undefined,
        }))
      }
    }

    return (kind, original, packed, checksum, bytes) => {
      const hash = sha256(checksum)
      if (hash) return verified(kind, original, hash, resolved.get(`${kind}:${hash}`))
      const catalog = catalogMedia?.(kind, original)
      if (catalog?.hash) return verified(kind, original, catalog.hash, catalog.sourcePath)
      if (!externalEasyWorshipMediaKey(original)) return fallback(kind, original, packed, checksum, bytes)
      const path = locatedPath(original, bytes, catalog)
      const exact = path && locatedDigests.get(path)
      return exact && path ? verified(kind, original, exact, path) : {}
    }
  }
}
