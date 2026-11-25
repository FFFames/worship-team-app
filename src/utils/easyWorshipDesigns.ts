/** Reads EasyWorship slide layouts, catalog metadata, and same-profile resources. */

import { isNestedScheduleGlobal, scheduleGlobalThemeParents } from './easyWorshipScheduleThemes'
import type { FileEntry } from '@zip.js/zip.js'
import type { Database } from 'sql.js'
import type { DesignContent, DesignElementReflection, DesignElementShadow, DesignFill, DesignFrame, DesignKind, DesignLayer, DesignSlide, DesignSoundtrack, DesignTextLayout, DesignTextStyle, PresentationField, SlidePlaybackSettings, SlideTransition } from '../types/slideDesign'
import type { MediaKind } from '../types/media'
import { displayRunsFromEasyWorshipRtf, getEasyWorshipSql, isEasyWorshipSqliteDatabase, songLabelFromEasyWorshipRtf } from './easyWorship'
import { isLegacyPowerPoint, isPowerPointFilename, maxPackedPowerPointBytes, modernPowerPointName, powerPointFilename } from './powerPointFilename'
import { LEGACY_BACKGROUND_PATH, reviewLegacyBackgrounds } from './easyWorshipLegacyBackgrounds'
import type { LegacySongEncoding } from './easyWorshipEncoding'
import { easyWorshipArchiveName, easyWorshipProfileRoot, withProfileMedia, type EasyWorshipProfileAssetSource } from './easyWorshipProfileFiles'
import { createEasyWorshipMediaHashFinder, mediaFileHash, withEasyWorshipLibraryMedia } from './easyWorshipMedia'
import { prepareProfileLayoutMedia, type LayoutMediaSource, type PrepareLayoutMedia, type ResolveLayoutMedia } from './easyWorshipLayoutMedia'
import { designCollectionKey } from './collectionLibrary'
import type { ResourceCollectionCatalog } from './easyWorshipResourceCollections'
import type { DefaultThemeSlot, ThemeOutput, ThemeSubject } from './defaultThemes'
import { readEasyWorshipMediaClip, readEasyWorshipPosterSeconds } from './easyWorshipMediaClip'
import { readEasyWorshipVideoAlpha } from './videoAlpha'
import { presentationWebUrl } from './livePresentation'
import { dvdWithElementPlayback, readEasyWorshipDvds } from './easyWorshipDvds'
import { readEasyWorshipElementPlayback, readEasyWorshipMediaFlag } from './easyWorshipMediaPlayback'
import { dvdObjectFit } from './dvdPlayback'
import { createPowerPointMediaResolver, type PowerPointMediaLinkResolver } from './powerPoint/linkedMedia'
import { mediaObjectFit } from './mediaPlayback'
import { easyWorshipFeedAsset, readEasyWorshipLayoutFeeds } from './easyWorshipFeedVideo'
import type { DvdClip, DvdPlayback } from '../types/dvdClip'
import { readZipAsset, withZipAsset, type WithMediaBlob } from './zipAsset'
import { importIdentity } from './importIdentity'
import { defaultNurserySettings, nurseryPositions, validNurseryFont, type NurseryOutput, type NurseryStyle } from './nurseryAlerts'
import type { AlertOutput } from '../types/alertTemplate'
import { defaultMessageAlertStyle, type MessageAlertStyle } from './messageAlertSettings'
import type { TextEffects } from './alertTextEffects'
import { foldbackClockPositions, foldbackHorizontalAlignments, foldbackServiceFormats, foldbackVerticalAlignments, validFoldbackClockFormat,
  type FoldbackAppearance, type FoldbackContentSettings, type FoldbackContentStyle, type FoldbackServiceSettings } from './foldbackAppearance'
import { MISSING_MASTER_BACKGROUND, MISSING_VERIFIED_LAYOUT_MEDIA } from './slideDesign'
import { invalidImportedPresentationNotes, validOptionalSpeakerNotes, visibleNote } from './speakerNotes'
import { easyWorshipClipPaths, unsupportedEasyWorshipShape } from './easyWorshipShape'
import { easyWorshipElementBorder, legacyElementDecorationWarning, unsupportedElementBorder, unsupportedElementReflection } from './easyWorshipElementBorder'
import { defaultScriptureOutputSettings, isScriptureFontFamily, isScriptureFontRatio, isScriptureReferenceInset, scriptureFontRoles,
  type AlphaSource, type ScriptureOutputSettings } from './outputSettings'

const MAX_DATABASE_BYTES = 128 * 1024 * 1024
const LAYOUT_PATH = /(?:^|\/)(?:(?:databases\/)?data\/)?presentationlayouts\.db$/i
const PRESENTATIONS_PATH = /(?:^|\/)(?:(?:databases\/)?data\/)?presentations\.db$/i
const DB_PATH = /(?:^|\/)(?:presentationlayouts|presentations|themes|backgrounds)\.db$/i
export const isEasyWorshipDesignExport = (filename: string) => /\.(ewpx|ewtx)$/i.test(filename)

type SqlRow = Record<string, unknown>
type AssetSource = LayoutMediaSource
type LayoutOptions = {
  resolveAsset: ResolveLayoutMedia
  catalog?: Map<string, SqlRow>
  schedule?: boolean
  packed?: boolean
  songLayoutIds?: ReadonlySet<string>
  dvdClips?: ReadonlyMap<string, DvdClip>
  feedSources?: ReturnType<typeof readEasyWorshipLayoutFeeds>
}
export type EasyWorshipDesignProfile = { id: string; name: string; databasePath: string }
export type EasyWorshipDesignEntry = { title: string; kind: DesignKind; content: DesignContent; layoutId: string; legacyTransitionWarningAt?: number
  nativeRevision?: string; exportId?: string; exportRevisionId?: string; exportFilename?: string }
export type EasyWorshipDefaultTheme = EasyWorshipDesignEntry & { id: string; slot: DefaultThemeSlot; optionsName: string }
export type EasyWorshipScriptureOutput = { id: string; output: AlphaSource; settings: ScriptureOutputSettings }
export type EasyWorshipNurseryStyle = { id: string; output: NurseryOutput; style: NurseryStyle }
export type EasyWorshipPowerPointEntry = {
  id: string
  title: string
  filename: string
  originalFilename?: string
  sourcePath?: string
  fileChecks?: { filenames: string[]; hash: string }[]
  author?: string
  copyright?: string
  description?: string
  collectionDetails?: NonNullable<DesignContent['source']>['collectionDetails']
  warning?: string
}
export type EasyWorshipDesignReview = {
  profiles: EasyWorshipDesignProfile[]
  entries?: EasyWorshipDesignEntry[]
  powerPoints?: EasyWorshipPowerPointEntry[]
  collectionCatalog?: ResourceCollectionCatalog
  warnings: string[]
  readAsset?: (sourcePath: string) => Promise<Blob>
  withAsset?: WithMediaBlob
  powerPointMedia?: PowerPointMediaLinkResolver
}

export type EasyWorshipDesignExportReview = EasyWorshipDesignReview & {
  packedMediaPaths: string[]
  ownsAsset: (path: string) => boolean
  assetSize: (path: string) => number | undefined
  readAsset: NonNullable<EasyWorshipDesignReview['readAsset']>
  withAsset: WithMediaBlob
}

function rows(db: Database, query: string, parameters?: string[]): SqlRow[] {
  const statement = db.prepare(query, parameters)
  const result: SqlRow[] = []
  try {
    while (statement.step()) result.push(statement.getAsObject())
    return result
  } finally {
    statement.free()
  }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function designCollectionDetails(row: SqlRow) {
  return { tags: text(row.tags), filename: text(row.filename), folder: text(row.folder) }
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function pathName(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/')
}

function relativePath(path: string): string | undefined {
  const normalized = pathName(path)
  return normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || normalized.includes('\0')
    || normalized.split('/').some((component) => !component || component === '.' || component === '..') ? undefined : normalized
}

function root(path: string): string {
  return easyWorshipProfileRoot(path.slice(0, path.lastIndexOf('/') + 1))
}

function addPath(paths: Map<string, string[]>, path: string) {
  const key = path.toLowerCase()
  const matches = paths.get(key)
  if (matches) matches.push(path)
  else paths.set(key, [path])
}

function sourceFromFiles(files: File[]): EasyWorshipProfileAssetSource {
  const paths = new Map<string, string[]>()
  const indexed = new Map<string, File>()
  for (const file of files) {
    const path = relativePath(file.webkitRelativePath || file.name)
    if (!path) continue
    addPath(paths, path)
    indexed.set(path, file)
  }
  return {
    paths,
    size: (path) => indexed.get(path)?.size,
    read: async (path) => {
      const file = indexed.get(path)
      if (!file) throw new Error('ไม่พบไฟล์สื่อ EasyWorship ที่อ้างอิง')
      return file
    },
  }
}

async function sourceFromArchive(file: File): Promise<EasyWorshipProfileAssetSource> {
  const { BlobReader, ZipReader } = await import('@zip.js/zip.js')
  const archive = new ZipReader(new BlobReader(file))
  try {
    const paths = new Map<string, string[]>()
    const entries = new Map<string, FileEntry>()
    for await (const entry of archive.getEntriesGenerator()) {
      if (entry.directory) continue
      const path = relativePath(entry.filename)
      if (!path) continue
      addPath(paths, path)
      entries.set(path, entry)
    }
    return {
      paths,
      size: (path) => entries.get(path)?.uncompressedSize,
      read: async (path) => {
        const entry = entries.get(path)
        if (!entry || entry.encrypted) throw new Error('เปิดไฟล์ที่อ้างอิงไม่ได้หรือไฟล์ต้องใช้รหัสผ่าน')
        if (DB_PATH.test(path) && entry.uncompressedSize > MAX_DATABASE_BYTES) throw new Error('ฐานข้อมูลออกแบบมีขนาดเกิน 128 MB')
        if (/(?:^|\/)backgrounds\.mb$/i.test(path) && entry.uncompressedSize > 4 * MAX_DATABASE_BYTES) throw new Error('BackGrounds.MB มีขนาดเกิน 512 MB')
        if (isPowerPointFilename(path) && entry.uncompressedSize > MAX_DATABASE_BYTES) throw new Error('ไฟล์ PowerPoint ในโปรไฟล์มีขนาดเกิน 128 MB')
        return readZipAsset(file, entry)
      },
      withMedia: (path, consume) => {
        const entry = entries.get(path)
        if (!entry || entry.encrypted) return Promise.reject(new Error('เปิดไฟล์สื่อไม่ได้หรือไฟล์ต้องใช้รหัสผ่าน'))
        return withZipAsset(file, entry, consume)
      },
    }
  } finally {
    await archive.close()
  }
}

function kindFor(type: unknown): DesignKind | undefined {
  if (type === 8) return 'presentation'
  if (type === 12) return 'presentation-theme'
  if (type === 13) return 'song-theme'
  if (type === 14) return 'scripture-theme'
  return undefined
}

function groupBy(data: SqlRow[], field: string): Map<string, SqlRow[]> {
  const groups = new Map<string, SqlRow[]>()
  for (const row of data) {
    const key = String(row[field])
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  return groups
}

function propertyGroups(db: Database, tables: Set<string>, prefix: 'element' | 'slide') {
  const groups = prefix + '_property_group'
  const props = prefix + '_property'
  if (!tables.has(groups) || !tables.has(props)) return new Map<string, SqlRow[]>()
  return groupBy(rows(db, `SELECT g.*, p.key, p.value FROM ${groups} g JOIN ${props} p ON p.group_id = g.rowid ORDER BY p.rowid`), 'link_id')
}

function property(properties: SqlRow[] | undefined, group: string, key: string): unknown {
  return properties?.find((item) => item.group_name === group && item.key === key)?.value
}

function opacity(properties: SqlRow[] | undefined, group: string): number | undefined {
  const value = property(properties, group, 'Opacity')
  if (value == null) return undefined
  const result = Number(value)
  return result >= 0 && result <= 100 ? result / 100 : undefined
}

function elementRotation(properties: SqlRow[] | undefined): number | undefined {
  const stored = property(properties, 'Element', 'Rotation')
  if ((typeof stored !== 'number' && typeof stored !== 'string') || !String(stored).trim()) return undefined
  const degrees = Number(stored)
  // EasyWorship applies 360 minus the stored angle around the element center.
  return Number.isSafeInteger(degrees) ? -(degrees % 360) || 0 : undefined
}

function windowsColor(value: number): string {
  const hex = (part: number) => part.toString(16).padStart(2, '0')
  return '#' + hex(value & 0xff) + hex((value >>> 8) & 0xff) + hex((value >>> 16) & 0xff)
}

function resourceFills(db: Database, tables: Set<string>) {
  const fills = new Map<string, DesignFill>()
  if (tables.has('resource_color')) {
    for (const row of rows(db, 'SELECT resource_id,color FROM resource_color NOT INDEXED')) {
      const color = number(row.color)
      if (color !== undefined) fills.set(String(row.resource_id), { type: 'solid', color: windowsColor(color) })
    }
  }
  if (tables.has('resource_gradient') && tables.has('resource_gradient_color')) {
    const stops = groupBy(rows(db, 'SELECT * FROM resource_gradient_color NOT INDEXED ORDER BY rowid'), 'resource_id')
    for (const row of rows(db, 'SELECT resource_id,angle FROM resource_gradient NOT INDEXED')) {
      const id = String(row.resource_id)
      const segments = (stops.get(id) ?? []).flatMap((row) => {
        const from = number(row.color_from)
        const to = number(row.color_to)
        const start = number(row.percent_from)
        const end = number(row.percent_to)
        const scale = Math.max(start ?? 0, end ?? 0) > 1 ? 100 : 1
        return [
          ...(from !== undefined ? [{ color: windowsColor(from), position: (start ?? 0) / scale }] : []),
          ...(to !== undefined ? [{ color: windowsColor(to), position: end === undefined ? 1 : end / scale }] : []),
        ]
      })
      if (segments.length) fills.set(id, { type: 'gradient', angle: number(row.angle) ?? 0, stops: segments.sort((a, b) => a.position - b.position) })
    }
  }
  return fills
}

function frameFor(row: SqlRow, fallback?: DesignFrame): DesignFrame {
  return { x: number(row.x) ?? fallback?.x ?? 0, y: number(row.y) ?? fallback?.y ?? 0,
    width: number(row.width) ?? fallback?.width ?? 1, height: number(row.height) ?? fallback?.height ?? 1 }
}

function aspectRatio(value: unknown): number | undefined {
  const ratio = text(value)
  const parts = ratio?.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/)
  const parsed = parts ? Number(parts[1]) / Number(parts[2]) : Number(ratio ?? value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function layoutFilename(value: string, kind: MediaKind): string {
  const prefix = kind === 'image' ? /^<images>\/?/i : kind === 'video' ? /^<videos>\/?/i : /^<(?:audio|audioresourcesdir)>\/?/i
  return pathName(value).replace(prefix, '')
}

function textStyle(rtf: string | undefined, frame: DesignFrame, properties: SqlRow[] | undefined): DesignTextStyle {
  const paragraph = rtf?.split(/\\pard\b/).slice(1).find((line) => !/\\sdparawysiwghidden\b/.test(line))
  const family = rtf?.match(/\\f\d+\s+([^\\;{}]+);/)?.[1].trim()
  const nominalSize = paragraph?.match(/\\fs(\d+)\b/)?.[1]
  const size = nominalSize ? Math.min(frame.height * 0.8, Number(nominalSize) / 2160) : Math.min(frame.height * 0.65, 0.07)
  return {
    ...(family ? { fontFamily: family } : {}),
    fontSize: size,
    align: /\\ql\b/.test(paragraph ?? '') ? 'left' : /\\qr\b/.test(paragraph ?? '') ? 'right' : 'center',
    ...(/\\sdfsauto\b/.test(paragraph ?? '') ? { fitText: true } : {}),
    ...(/\\b(?:1)?\b/.test(paragraph ?? '') ? { bold: true } : {}),
    ...(String(property(properties, 'Shadow', 'Enabled')) === '1' ? { shadow: true } : {}),
  }
}

function textLayout(properties: SqlRow[] | undefined): DesignTextLayout | undefined {
  const insets: NonNullable<DesignTextLayout['insets']> = {}
  for (const [key, side] of [['Top', 'top'], ['Right', 'right'], ['Bottom', 'bottom'], ['Left', 'left']] as const) {
    const value = property(properties, 'Text_Margins', key)
    const size = typeof value === 'number' || text(value) ? Number(value) : NaN
    if (size >= 0 && size <= 1) insets[side] = size
  }
  const auto = String(property(properties, 'Text_Format', 'Auto_Size'))
  const result: DesignTextLayout = {
    ...(Object.keys(insets).length ? { insets } : {}),
    ...(auto === '0' || auto === '1' ? { sizing: auto === '1' ? 'fit' : 'fixed' } : {}),
  }
  if (result.insets || result.sizing) return result
}

function selectedSlot(kind: DesignKind, uid: unknown) {
  return (kind === 'song-theme' && uid === 'CONTENT_SONG') || (kind === 'scripture-theme' && uid === 'CONTENT_SCRIPTURE')
    || (kind === 'presentation-theme' && uid === 'CONTENT_PRESENTATION')
}

const presentationFields = new Map<string, PresentationField>([
  ['TITLE', 'title'], ['SUBTITLE', 'subtitle'], ['CONTENT_PRESENTATION', 'content'], ['CONTENT_SCRIPTURE', 'scripture'],
])

function inheritedSlideSettings(parentFor: (slide: SqlRow) => SqlRow | undefined, properties: Map<string, SqlRow[]>) {
  type Settings = { transition?: SlideTransition; advance: Record<string, string> }
  const cache = new Map<string, Settings>()
  function read(slide: SqlRow, parents = new Set<string>()): Settings | undefined {
    const id = String(slide._id)
    if (parents.has(id) || parents.size >= 12) return undefined
    if (cache.has(id)) return cache.get(id)
    const parent = parentFor(slide)
    const inherited = parent ? read(parent, new Set([...parents, id])) : undefined
    const group = (name: string) => Object.fromEntries((properties.get(id) ?? []).flatMap(({ group_name, key, value }) =>
      group_name === name && typeof key === 'string' && !key.startsWith('@') && value != null ? [[key, String(value)]] : []))
    const values = group('TransitionIn')
    const { UID: uid, ...parameters } = values
    const baseTransition = inherited?.transition
    const source = uid !== undefined && uid !== baseTransition?.uid
      ? Object.fromEntries(Object.entries(baseTransition?.values ?? {}).filter(([key]) => !key.startsWith('Value-')))
      : baseTransition?.values
    const transition = Object.keys(values).length
      ? { uid: uid ?? baseTransition?.uid, values: { ...source, ...parameters } } : baseTransition
    const result = { transition, advance: { ...inherited?.advance, ...group('SlideAdvance') } }
    cache.set(id, result)
    return result
  }
  return read
}

const advanceModes = new Map<string, SlidePlaybackSettings['mode']>([['0', 'manual'], ['1', 'timer'], ['2', 'media']])

function nativeSlidePlayback(advance: Record<string, string>, reset?: string): SlidePlaybackSettings | undefined {
  const mode = advanceModes.get(advance.Action)
  const delay = Number(advance.Delay)
  const loop = advance.Looping
  if (mode === undefined && loop === undefined && reset === undefined) return undefined
  return {
    ...(mode ? { mode } : {}),
    ...(Number.isSafeInteger(delay) && delay >= 0 ? { delayMs: delay } : {}),
    ...(loop === undefined ? {} : { loop: /^(1|true)$/i.test(loop) }),
    ...(reset === undefined ? {} : { restart: /^(1|true)$/i.test(reset) }),
  }
}

/** Shared reader for profile designs and the layered presentation cues in main.db. */
export function readEasyWorshipLayouts(db: Database, { resolveAsset, catalog, schedule, packed, songLayoutIds, dvdClips, feedSources }: LayoutOptions) {
  const tables = new Set(rows(db, "SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => String(row.name).toLowerCase()))
  if (!['presentation', 'slide', 'element', 'resource_text'].every((table) => tables.has(table))) {
    throw new Error('ไม่พบตารางออกแบบ EasyWorship ที่รองรับ')
  }

  const warnings: string[] = []
  const presentations = rows(db, 'SELECT rowid AS _id, * FROM presentation NOT INDEXED ORDER BY rowid')
  const slides = groupBy(rows(db, 'SELECT rowid AS _id, * FROM slide NOT INDEXED ORDER BY presentation_id, order_index, rowid'), 'presentation_id')
  const elements = groupBy(rows(db, 'SELECT rowid AS _id, * FROM element NOT INDEXED ORDER BY slide_id, order_index, rowid'), 'slide_id')
  const elementProps = propertyGroups(db, tables, 'element')
  const slideProps = propertyGroups(db, tables, 'slide')
  const globalParents = schedule || packed ? scheduleGlobalThemeParents(presentations) : new Map<string, string>()
  const parentFor = (slide: SqlRow) => {
    const uid = text(slide.theme_slide_uid)
    if (!uid) return undefined
    const explicit = Number(slide.theme_id) > 0
    const layout = String(explicit ? slide.theme_id : slide.presentation_id)
    const parent = slides.get(layout)?.find((candidate) => candidate.slide_uid === uid)
    if (parent || explicit) return parent
    const global = globalParents.get(layout)
    return global ? slides.get(global)?.find((candidate) => candidate.slide_uid === uid) : undefined
  }
  const getSettings = inheritedSlideSettings(parentFor, slideProps)
  const fills = resourceFills(db, tables)
  const resourceRows = (table: string, idColumn = 'resource_id') => new Map(tables.has(table)
    ? rows(db, `SELECT rowid AS _id, * FROM ${table} NOT INDEXED`).map((row) => [String(row[idColumn]), row])
    : [])
  const texts = resourceRows('resource_text')
  const images = resourceRows('resource_image')
  const videos = resourceRows('resource_video')
  const audio = resourceRows('resource_audio')
  const shapes = resourceRows('resource_shape')
  const webpages = resourceRows('resource_web')
  const feeds = feedSources ?? readEasyWorshipLayoutFeeds(db)
  const dvds = dvdClips ?? readEasyWorshipDvds(db, true)
  const elementPlayback = dvds.size || feeds.size || images.size || videos.size || audio.size ? readEasyWorshipElementPlayback(db) : undefined
  const files = resourceRows('file', '_id')
  const entries: EasyWorshipDesignEntry[] = []
  const soundtrackCache = new Map<string, DesignSoundtrack[]>()
  type VisualLayer = Extract<DesignLayer, { kind: 'camera' | 'fill' | 'media' }>
  type Slot = 'foreground' | 'background'
  type Placement = { element: SqlRow; slot: Slot; layer: VisualLayer; resourceId: string; playback?: DvdPlayback; shape?: string }
  const visualCache = new Map<string, Placement[]>()
  const roles = ['background', 'foreground'] as const
  const shapeCache = new Map<string, ReturnType<typeof easyWorshipClipPaths>>()

  function decorationsFor(element: SqlRow, slide: SqlRow) {
    if (element.element_uid === 'BACKGROUND') return { border: undefined, unsupported: false, shadow: undefined, reflection: undefined }
    const native = [element]
    const ancestors = new Set([String(slide._id)])
    let parent = element.element_uid ? parentFor(slide) : undefined
    while (parent && !ancestors.has(String(parent._id)) && ancestors.size < 12) {
      const parentId = String(parent._id)
      ancestors.add(parentId)
      const matches = elements.get(parentId)?.filter((item) => item.element_uid === element.element_uid) ?? []
      if (matches.length > 1) break
      if (matches[0]) native.push(matches[0])
      parent = parentFor(parent)
    }
    const properties = native.map((item) => elementProps.get(String(item._id)))
    const read = (group: string, key: string) => {
      for (const item of properties) {
        const value = property(item, group, key)
        if (value != null) return value
      }
      return undefined
    }
    const id = String(element._id)
    return {
      ...easyWorshipElementBorder((key) => read('Border', key)),
      shadow: elementShadow((key) => read('Shadow', key), id),
      reflection: elementReflection((key) => read('Reflection', key), id),
    }
  }

  function clipFor(id: string, frame: DesignFrame, aspect: number, reported: Set<string>) {
    const key = `${id}:${frame.width}:${frame.height}:${aspect}`
    const raw = text(shapes.get(id)?.shape_data)
    if (!raw) return {}
    let result = shapeCache.get(key)
    if (!result) {
      result = easyWorshipClipPaths(raw, frame.width * aspect * 1_000_000, frame.height * 1_000_000)
      shapeCache.set(key, result)
    }
    if (result.unsupported) reported.add(unsupportedEasyWorshipShape)
    return { ...(result.clipPaths ? { clipPaths: result.clipPaths } : {}), ...(result.shapePaths ? { shapePaths: result.shapePaths } : {}) }
  }

  function visualLayerPlayback(layer: Extract<DesignLayer, { kind: 'media' }>, playback: DvdPlayback | undefined,
    repeat: boolean | undefined, background: boolean) {
    const settings = layer.asset.kind === 'image' ? (playback?.fit ? { fit: playback.fit } : undefined) : playback
    const fit = mediaObjectFit(settings, background) ?? layer.fit
    const loop = repeat ?? layer.loop
    const previous = { ...(fit !== layer.fit ? { fit: layer.fit } : {}), ...(loop !== layer.loop ? { loop: layer.loop } : {}) }
    return { ...layer, fit, loop, ...(Object.keys(previous).length ? { easyWorshipLegacyPlayback: previous } : {}),
      ...(settings ? { asset: { ...layer.asset, playback: settings } } : {}) }
  }

  function flag(element: SqlRow, group: string, key: string) {
    return /^(1|true)$/i.test(String(property(elementProps.get(String(element._id)), group, key)))
  }

  function fileVisual(resourceId: string) {
    const image = images.get(resourceId)
    const video = videos.get(resourceId)
    const media = image ?? video
    const original = text(media?.original_filename)
    if (!original) return undefined
    const kind = image ? 'image' as const : 'video' as const
    const file = files.get(String(media?.file_id))
    const resolved = resolveAsset(kind, original, text(file?.filename), text(file?.file_hash), media?.filesize)
    const filename = layoutFilename(original, kind).split('/').pop() ?? original
    const clip = kind === 'video' ? readEasyWorshipMediaClip(media?.start_pos, media?.end_pos) : undefined
    const posterSeconds = kind === 'video' ? readEasyWorshipPosterSeconds(media?.poster_frame_pos) : undefined
    const alphaMode = kind === 'video' ? readEasyWorshipVideoAlpha(media?.alpha_channel_mode) : undefined
    return { asset: { kind, filename, ...resolved, ...(clip ? { clip } : {}), ...(alphaMode ? { alphaMode } : {}),
      ...(posterSeconds !== undefined ? { posterSeconds } : {}) },
      repeat: readEasyWorshipMediaFlag(media?.repeating), legacyRepeat: media?.repeating === 1 }
  }

  function directVisuals(children: SqlRow[]): Placement[] {
    return children.flatMap((element) => {
      if (flag(element, 'Element', 'Hidden')) return []
      const id = String(element._id)
      const props = elementProps.get(id)
      return roles.flatMap((slot): Placement[] => {
        const resourceId = String(element[`${slot}_resource_id`])
        const feed = feeds.get(resourceId)
        const frame = frameFor(element)
        const shape = text(shapes.get(String(element.shape_resource_id))?.shape_data) ? String(element.shape_resource_id) : undefined
        const rotation = elementRotation(props)
        const base = { id: `${id}-${slot}`, frame, opacity: opacity(props, slot === 'background' ? 'Background' : 'Foreground'),
          ...(rotation !== undefined ? { rotation } : {}) }
        const background = element.element_uid === 'BACKGROUND'
        if (feed && (!schedule || (number(element.width) !== undefined && number(element.height) !== undefined))) {
          const playback = elementPlayback?.get(`${id}:${slot}`)
          const role = background ? 'background' : slot
          return [{ element, slot, resourceId, playback, shape, layer: { ...base, kind: 'camera', asset: easyWorshipFeedAsset(feed, role, playback) } }]
        }
        if (!background) return []
        const fill = fills.get(resourceId)
        if (fill) return [{ element, slot, resourceId, shape, layer: { ...base, kind: 'fill', role: 'background', fill } }]
        const media = fileVisual(resourceId)
        if (!media) return []
        const playback = elementPlayback?.get(`${id}:${slot}`)
        const layer = { ...base, kind: 'media' as const, role: 'background' as const, asset: media.asset, fit: 'cover' as const }
        const video = media.asset.kind === 'video'
        return [{ element, slot, resourceId, playback, shape,
          layer: visualLayerPlayback(video ? { ...layer, loop: true } : layer, playback, video ? media.repeat : undefined, true) }]
      })
    })
  }

  function inheritVisuals(slide: SqlRow, master: Placement[]): Placement[] {
    const children = elements.get(String(slide._id)) ?? []
    const local = directVisuals(children)
    if (!master.length) return local
    const byUid = groupBy(children.filter((element) => text(element.element_uid)), 'element_uid')
    for (const source of master) {
      const uid = text(source.element.element_uid)
      const matching = uid ? byUid.get(uid) : undefined
      // A child with a resource or an explicit override owns that slot, even when blank.
      const child = matching?.[0]
      const { slot, resourceId } = source
      const group = slot === 'background' ? 'Background' : 'Foreground'
      if ((matching && matching.length !== 1) || (child && (flag(child, 'Element', 'Hidden')
        || child[`${slot}_resource_id`] != null || flag(child, 'Overrides', `mof${group}`)))) continue
      const props = child && elementProps.get(String(child._id))
      const feed = source.layer.kind === 'camera' ? feeds.get(resourceId) : undefined
      const playback = { ...source.playback, ...(child ? elementPlayback?.get(`${child._id}:${slot}`) : undefined) }
      const frame = child && flag(child, 'Overrides', 'mofDims') ? frameFor(child, source.layer.frame) : source.layer.frame
      const rotation = elementRotation(props) ?? source.layer.rotation
      let layer = source.layer
      if (layer.kind === 'camera' && feed) {
        layer = { ...layer, asset: easyWorshipFeedAsset(feed, layer.asset.role ?? slot, playback) }
      } else if (layer.kind === 'media') {
        const fit = playback.fit === 'auto' ? 'cover' : playback.fit
        if (layer.asset.kind === 'video') {
          const { easyWorshipLegacyPlayback: previous, ...base } = layer
          layer = visualLayerPlayback({ ...base, fit: fit ?? previous?.fit ?? base.fit, loop: previous?.loop ?? base.loop },
            Object.keys(playback).length ? playback : undefined, readEasyWorshipMediaFlag(videos.get(resourceId)?.repeating), true)
        } else if (fit) {
          const { easyWorshipLegacyPlayback: previous, ...base } = layer
          layer = visualLayerPlayback({ ...base, fit: previous?.fit ?? base.fit }, playback, undefined, true)
        }
      }
      const shape = child && text(shapes.get(String(child.shape_resource_id))?.shape_data) ? String(child.shape_resource_id) : source.shape
      local.push({ ...source, shape, element: child ?? source.element, playback, layer: { ...layer, inheritedFromMaster: true, frame,
        ...(rotation !== undefined ? { rotation } : {}), opacity: opacity(props, group) ?? layer.opacity } })
    }
    return local
  }

  function slideVisuals(slide: SqlRow): Placement[] {
    if (!feeds.size && !fills.size && !images.size && !videos.size) return []
    const chain: SqlRow[] = []
    const seen = new Set<string>()
    let next: SqlRow | undefined = slide
    while (next && !visualCache.has(String(next._id))) {
      const id = String(next._id)
      if (seen.has(id) || chain.length >= 12) return directVisuals(elements.get(String(slide._id)) ?? [])
      seen.add(id)
      chain.push(next)
      next = parentFor(next)
    }
    let visuals = (next && visualCache.get(String(next._id))) ?? []
    for (const item of chain.reverse()) {
      visuals = inheritVisuals(item, visuals)
      visualCache.set(String(item._id), visuals)
    }
    return visuals
  }

  function readSoundtracks(slide: SqlRow, visited = new Set<string>()): DesignSoundtrack[] {
    const slideId = String(slide._id)
    if (!audio.size || visited.has(slideId) || visited.size >= 12) return []
    const cached = soundtrackCache.get(slideId)
    if (cached) return cached
    const seen = new Set<string>()
    const tracks: DesignSoundtrack[] = []
    let overridesMaster = false

    for (const element of elements.get(slideId) ?? []) {
      const elementProperties = elementProps.get(String(element._id))
      const hidden = ['1', 'true'].includes(String(property(elementProperties, 'Element', 'Hidden')).toLowerCase())
      if (element.element_uid === 'AUDIO' && (hidden || String(property(elementProperties, 'Overrides', 'mofForeground')) === '1')) {
        overridesMaster = true
      }
      if (hidden) continue
      for (const role of ['background', 'foreground'] as const) {
        const id = String(element[role + '_resource_id'])
        const resource = audio.get(id)
        const original = text(resource?.original_filename)
        if (!resource || !original || seen.has(id)) continue
        seen.add(id)
        const file = files.get(String(resource.file_id))
        const { audioRole, ...asset } = resolveAsset('audio', original, text(file?.filename), text(file?.file_hash), resource.filesize)
        const filename = layoutFilename(original, 'audio').split('/').pop() || original
        const clip = readEasyWorshipMediaClip(resource.start_pos, resource.end_pos)
        const repeat = readEasyWorshipMediaFlag(resource.repeating)
        const playback = elementPlayback?.get(`${element._id}:${role}`)
        tracks.push({
          kind: 'audio', filename, ...asset,
          role: role === 'background' ? role : audioRole ?? (element.element_uid === 'AUDIO' ? 'background' : role),
          ...(repeat !== undefined ? { repeat } : {}),
          ...(repeat !== undefined && resource.repeating !== 1 ? { easyWorshipLegacyRepeat: false as const } : {}),
          ...(playback?.volume !== undefined || playback?.muted !== undefined ? { playback: { volume: playback.volume, muted: playback.muted } } : {}),
          ...(clip ? { clip } : {}),
        })
      }
    }

    const parent = !tracks.length && !overridesMaster ? parentFor(slide) : undefined
    const resolved = parent ? readSoundtracks(parent, new Set([...visited, slideId])) : tracks
    const result = parent && schedule ? resolved.map((track) => ({ ...track, inheritedFromMaster: true as const })) : resolved
    soundtrackCache.set(slideId, result)
    return result
  }

  for (const presentation of presentations) {
    const layoutId = String(presentation._id)
    const nativeSong = presentation.presentation_type === 6
    const nativeScripture = schedule && presentation.presentation_type === 7
    if (songLayoutIds && (!songLayoutIds.has(layoutId) || !nativeSong)) continue
    if (schedule && !nativeSong && !nativeScripture && presentation.presentation_type !== 8) continue
    const kind = nativeScripture ? 'scripture-theme'
      : nativeSong && (schedule || songLayoutIds) ? 'song-theme' : kindFor(presentation.presentation_type)
    if (!kind) {
      if (packed && isNestedScheduleGlobal(presentation)) continue
      warnings.push('ข้ามชนิดเลย์เอาต์ EasyWorship ' + (presentation.presentation_type ?? 'ไม่ทราบ'))
      continue
    }
    const linked = catalog?.get(layoutId)
    const title = text(linked?.title) ?? text(presentation.title) ?? `เลย์เอาต์ ${layoutId}`
    const reported = new Set<string>()
    const legacyWarnings = () => [...reported].filter((message) => !message.startsWith(MISSING_MASTER_BACKGROUND)
      && !message.startsWith(MISSING_VERIFIED_LAYOUT_MEDIA) && message !== unsupportedEasyWorshipShape
      && message !== unsupportedElementBorder && message !== unsupportedElementReflection)
    let legacyTransitionWarningAt: number | undefined
    const aspect = aspectRatio(presentation.aspect_ratio) ?? aspectRatio(linked?.aspect_ratio)
    if (!aspect) reported.add('ใช้สัดส่วน 16:9 เพราะต้นทางไม่ระบุสัดส่วนที่อ่านได้')

    const designSlides: DesignSlide[] = (slides.get(layoutId) ?? []).map((slide, index) => {
      const slideId = String(slide._id)
      const layers: DesignLayer[] = []
      let songLabel = nativeSong ? text(slide.title) : undefined
      const properties = slideProps.get(slideId)
      const delay = Number(property(properties, 'SlideAdvance', 'Delay'))
      const advanceMs = String(property(properties, 'SlideAdvance', 'Action')) === '1' && Number.isFinite(delay) && delay > 0 ? delay : undefined
      if (legacyTransitionWarningAt === undefined && properties?.some((item) => item.group_name === 'TransitionIn')) {
        legacyTransitionWarningAt = legacyWarnings().length
      }
      const settings = getSettings(slide)
      const transition = settings?.transition
      const playback = settings && nativeSlidePlayback(settings.advance, transition?.values.AlwaysReset)
      const soundtracks = readSoundtracks(slide)
      if (!schedule) {
        for (const track of soundtracks) {
          if (!track.sourcePath) reported.add(track.easyWorshipFileHash
            ? MISSING_VERIFIED_LAYOUT_MEDIA + track.filename : `ไม่พบไฟล์เสียง ${track.filename} ที่อ้างอิงจากเลย์เอาต์`)
        }
      }

      const localElements = elements.get(slideId) ?? []
      const placements = slideVisuals(slide)
      const visuals = new Map<string, VisualLayer>(placements.map(({ element, slot, layer, shape }) => {
        const geometry = shape ? clipFor(shape, layer.frame, aspect ?? 16 / 9, reported) : {}
        return [`${element._id}-${slot}`, { ...layer, ...geometry }] as const
      }))
      const inheritedElements = [...new Map(placements.filter(({ element }) => String(element.slide_id) !== slideId)
        .map(({ element }) => [String(element._id), element])).values()]
      const order = (element: SqlRow) => number(element.order_index) ?? Number.MIN_SAFE_INTEGER
      const ordered = inheritedElements.length ? [...inheritedElements, ...localElements].sort((a, b) => order(a) - order(b)) : localElements
      function addVisual(layer: VisualLayer) {
        if (layer.kind === 'media' && !layer.asset.sourcePath && !layer.asset.archivePath) {
          const { filename, easyWorshipFileHash } = layer.asset
          reported.add(easyWorshipFileHash ? MISSING_VERIFIED_LAYOUT_MEDIA + filename
            : layer.inheritedFromMaster ? MISSING_MASTER_BACKGROUND + filename : `ไม่พบไฟล์ ${filename} ที่อ้างอิงจากเลย์เอาต์`)
        }
        layers.push(layer)
      }
      for (const element of ordered) {
        if (nativeScripture && element.element_uid === 'CONTENT_SONG') continue
        const id = String(element._id)
        const start = layers.length
        const { border, unsupported, shadow, reflection } = decorationsFor(element, slide)
        const applyDecorations = () => {
          if (unsupported) reported.add(unsupportedElementBorder)
          if (border !== undefined && layers.length > start) layers[layers.length - 1].elementBorder = border
          for (let index = start; index < layers.length; index++) {
            if (shadow !== undefined) layers[index].elementShadow = shadow
            if (reflection !== undefined) layers[index].elementReflection = reflection
          }
        }
        if (String(element.slide_id) !== slideId) {
          for (const role of roles) {
            const visual = visuals.get(`${id}-${role}`)
            if (visual) addVisual(visual)
          }
          applyDecorations()
          continue
        }
        const elementProperties = elementProps.get(id)
        if (['1', 'true'].includes(String(property(elementProperties, 'Element', 'Hidden')).toLowerCase())) continue
        const frame = frameFor(element)
        const rotation = elementRotation(elementProperties)
        const paths = clipFor(String(element.shape_resource_id), frame, aspect ?? 16 / 9, reported)
        const geometry = { frame, ...(rotation !== undefined ? { rotation } : {}), ...paths }
        const slot = selectedSlot(kind, element.element_uid)
        const field = kind === 'presentation' || kind === 'presentation-theme'
          ? presentationFields.get(String(element.element_uid)) : undefined
        const foregroundRtf = text(texts.get(String(element.foreground_resource_id))?.rtf)
        for (const role of roles) {
          const resourceId = String(element[role + '_resource_id'])
          const layerId = `${id}-${role}`
          const layerRole = element.element_uid === 'BACKGROUND' ? 'background' : role
          const transparency = opacity(elementProperties, role === 'background' ? 'Background' : 'Foreground')
          const visual = visuals.get(layerId)
          const fill = visual?.kind !== 'fill' && fills.get(resourceId)
          if (fill) layers.push({ id: layerId, kind: 'fill', role: layerRole, ...geometry, fill, opacity: transparency })
          if (visual) addVisual(visual)
          const webpage = webpages.get(resourceId)
          if (webpage) {
            const url = presentationWebUrl(text(webpage.url))
            if (url) {
              layers.push({ id: layerId, kind: 'web', ...geometry, url, opacity: transparency, role: layerRole,
                ...(Number(webpage.remove_scroll_bars) === 1 ? { hideScrollbars: true } : {}) })
            } else if (!schedule) {
              warnings.push(`พบที่อยู่เว็บที่เปิดไม่ได้ในเลย์เอาต์ ${title}`)
            }
          }
          const sourceDvd = dvds.get(resourceId)
          if (sourceDvd) {
            const dvd = dvdWithElementPlayback(sourceDvd, elementPlayback?.get(`${id}:${role}`))
            const isBackground = layerRole === 'background'
            layers.push({ id: layerId, kind: 'media', role: layerRole, ...geometry, opacity: transparency,
              asset: { kind: 'video', filename: dvd.name, dvd },
              fit: dvdObjectFit(dvd.playback, isBackground) ?? (isBackground ? 'fill' : 'contain'),
              loop: Boolean(dvd.repeat || isBackground) })
          }
          const media = visual?.kind !== 'media' && fileVisual(resourceId)
          if (media) {
            const isBackground = layerRole === 'background'
            const video = media.asset.kind === 'video'
            const playback = elementPlayback?.get(`${id}:${role}`)
            const layer = { id: layerId, kind: 'media' as const, role: layerRole, ...geometry, asset: media.asset,
              opacity: transparency, fit: 'cover' as const }
            addVisual(visualLayerPlayback(video ? { ...layer, loop: media.legacyRepeat || isBackground } : layer,
              playback, video ? media.repeat : undefined, isBackground))
          }
          const rtf = text(texts.get(resourceId)?.rtf)
          const fieldForLayer = role === 'foreground' ? field : undefined
          const emptySlot = role === 'foreground' && !foregroundRtf && (slot || (kind === 'presentation-theme' && fieldForLayer))
          if (rtf || emptySlot) {
            if (nativeSong && !songLabel && rtf && slot && role === 'foreground') songLabel = songLabelFromEasyWorshipRtf(rtf)
            const style = textStyle(rtf, frame, elementProperties)
            const box = textLayout(elementProperties)
            const textId = !rtf && !slot ? `template:${layerId}` : layers.some((layer) => layer.id === layerId) ? `text:${layerId}` : layerId
            layers.push({
              id: textId, kind: 'text', ...geometry,
              ...(rtf ? displayRunsFromEasyWorshipRtf(rtf, style) : { text: '' }), style,
              ...(box ? { textLayout: box } : {}),
              ...(slot && role === 'foreground' ? { slot: 'content' } : {}),
              ...(fieldForLayer ? { presentationField: fieldForLayer } : {}),
            })
          }
        }
        if (elementProperties?.some((item) => item.group_name === 'Border' || item.group_name === 'Reflection')) reported.add(legacyElementDecorationWarning)
        if (border && layers.length === start) layers.push({ id: `native-border:${id}`, kind: 'fill', role: 'foreground', ...geometry,
          fill: { type: 'solid', color: 'transparent' } })
        applyDecorations()
      }
      const template = kind === 'presentation' ? text(slide.theme_slide_uid) : text(slide.slide_uid)
      return {
        id: text(slide.slide_uid) ?? slideId,
        label: text(slide.title) ?? (kind !== 'presentation' ? template : undefined) ?? `สไลด์ ${index + 1}`,
        ...(songLabel ? { songLabel } : {}),
        design: { aspectRatio: aspect ?? 16 / 9, layers, ...(soundtracks.length ? { soundtracks } : {}),
          ...(layers.some((layer) => layer.kind === 'camera' && layer.inheritedFromMaster) ? { cameraMasterImported: true } : {}),
          ...(layers.some((layer) => (layer.kind === 'fill' || layer.kind === 'media') && layer.inheritedFromMaster) ? { backgroundMasterImported: true } : {}) },
        ...(template ? { template } : {}),
        ...(advanceMs ? { advanceMs } : {}),
        ...(transition ? { transition } : {}),
        ...(playback ? { playback } : {}),
      }
    })
    if (!designSlides.length) reported.add('ไม่พบสไลด์ในเลย์เอาต์นี้')
    const author = text(linked?.author) ?? text(presentation.author)
    const copyright = text(linked?.copyright) ?? text(presentation.copyright)
    const description = text(linked?.description) ?? text(presentation.description)
    const notes = !schedule && kind === 'presentation' ? visibleNote(presentation.notes) : undefined
    const validNotes = validOptionalSpeakerNotes(notes)
    if (!validNotes) reported.add(invalidImportedPresentationNotes)
    const decorationWarningAt = legacyWarnings().indexOf(legacyElementDecorationWarning)
    reported.delete(legacyElementDecorationWarning)
    entries.push({
      layoutId, title, kind, legacyTransitionWarningAt, nativeRevision: text(presentation.presentation_rev_uid),
      content: {
        slides: designSlides,
        ...(notes && validNotes ? { notes } : {}),
        ...(decorationWarningAt >= 0 ? { easyWorshipDecorationWarningAt: decorationWarningAt } : {}),
        ...(designSlides.some((slide) => slide.design.layers.some((layer) => layer.kind === 'web')) ? { webLayersImported: true } : {}),
        ...(designSlides.some((slide) => slide.design.layers.some((layer) => layer.kind === 'media' && layer.asset.dvd)) ? { dvdLayersImported: true } : {}),
        ...(designSlides.some((slide) => slide.design.layers.some((layer) => layer.kind === 'camera')) ? { cameraLayersImported: true } : {}),
        ...(presentation.looping === 1 ? { looping: true } : {}),
        source: {
          format: 'easyworship',
          uid: text(presentation.presentation_uid) ?? text(linked?.file_item_uid) ?? layoutId,
          ...(author ? { author } : {}),
          ...(copyright ? { copyright } : {}),
          ...(description ? { description } : {}),
          ...(linked ? { collectionDetails: designCollectionDetails(linked) } : {}),
        },
        ...(reported.size ? { warnings: [...reported] } : {}),
      },
    })
  }
  for (const [layoutId, item] of catalog ?? []) {
    if (!entries.some((entry) => entry.layoutId === layoutId)) {
      warnings.push(`ไม่พบเลย์เอาต์ของ ${text(item.title) ?? layoutId} ในฐานออกแบบ`)
    }
  }
  return { entries, warnings: [...new Set(warnings)] }
}

async function openDatabase(source: AssetSource, path: string) {
  const blob = await source.read(path)
  if (blob.size > MAX_DATABASE_BYTES) throw new Error('ฐานข้อมูลออกแบบมีขนาดเกิน 128 MB')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (!isEasyWorshipSqliteDatabase(bytes)) throw new Error(`${path.split('/').pop()} ไม่ใช่ฐานข้อมูล SQLite ของ EasyWorship ที่รองรับ`)
  const SQL = await getEasyWorshipSql()
  return new SQL.Database(bytes)
}

export async function readEasyWorshipDefaultThemes(source: AssetSource, path: string, fallback: ResolveLayoutMedia, prepareMedia?: PrepareLayoutMedia) {
  const output: ThemeOutput = /(?:^|\/)alt\.settings\.db$/i.test(path) ? 'alternate' : 'live'
  const optionsName = /\/([^/]+)\.ewo\/data\//i.exec(path)?.[1] ?? ''
  const subjectFor: Partial<Record<DesignKind, ThemeSubject>> = {
    'song-theme': 'song', 'scripture-theme': 'scripture', 'presentation-theme': 'presentation',
  }
  const db = await openDatabase(source, path)
  try {
    const resolveAsset = prepareMedia ? await prepareMedia(db, fallback) : fallback
    const { entries, warnings } = readEasyWorshipLayouts(db, { resolveAsset })
    const themes: EasyWorshipDefaultTheme[] = entries.flatMap((entry) => {
      const subject = subjectFor[entry.kind]
      if (!subject || !entry.content.slides.length) return []
      if (subject !== 'presentation' && !entry.content.slides.some((slide) => slide.design.layers.some((layer) =>
        layer.kind === 'text' && layer.slot === 'content'))) {
        warnings.push(`${entry.title} · ไม่พบกรอบข้อความของธีมเริ่มต้น`)
        return []
      }
      const slot: DefaultThemeSlot = `${output}:${subject}`
      return [{ ...entry, id: `${path}:${entry.layoutId}`, slot, optionsName }]
    })
    const scripture = readScriptureOutputSettings(db)
    return { themes, warnings, logo: readNativeDisplayLogo(db), output, optionsName,
      scripture: scripture ? { id: path, output, settings: scripture } satisfies EasyWorshipScriptureOutput : undefined }
  } finally {
    db.close()
  }
}

function readNativeDisplayLogo(db: Database) {
  const tables = new Set(rows(db, "SELECT name FROM sqlite_master WHERE type = 'table'").map(({ name }) => String(name).toLowerCase()))
  if (!['presentation', 'presentation_property_global', 'presentation_property_group_global'].every((name) => tables.has(name))) return
  const groups = rows(db, `SELECT g.group_name, p.key, CAST(p.value AS TEXT) AS value
    FROM presentation_property_group_global g JOIN presentation_property_global p ON p.group_id = g.rowid
    JOIN presentation t ON t.rowid = g.link_id
    WHERE UPPER(t.presentation_uid) = 'P' AND g.group_name = 'Default_Logo_BK' ORDER BY p.rowid`)
  const id = text(property(groups, 'Default_Logo_BK', 'ID'))
  if (!id || !/^[1-9]\d{0,18}$/.test(id)) return
  const type = nativeNumber(property(groups, 'Default_Logo_BK', 'FileType'))
  return { id, type }
}

export type EasyWorshipMessageStyle = { id: string; output: AlertOutput; style: MessageAlertStyle }

function nativeNumber(value: unknown) {
  return typeof value === 'string' && value.trim() ? number(Number(value)) : number(value)
}

function nativeBoolean(value: unknown) {
  const flag = String(value ?? '').trim().toLowerCase()
  if (flag === '1' || flag === '-1' || flag === 'true') return true
  if (flag === '0' || flag === 'false') return false
  return undefined
}

function nativeColor(value: unknown) {
  const color = nativeNumber(value)
  return color !== undefined && Number.isInteger(color) && color >= 0 && color <= 0xffffff ? windowsColor(color) : undefined
}

function elementShadow(read: (key: string) => unknown, group: string): DesignElementShadow | false | undefined {
  const enabled = nativeBoolean(read('Enabled'))
  if (!enabled) return enabled
  const distance = (key: string, fallback: number) => Math.min(0.2, Math.max(0, (nativeNumber(read(key)) ?? fallback) / 1080))
  const angle = nativeNumber(read('Angle')) ?? 315
  return {
    group, color: nativeColor(read('Color')) ?? '#000000',
    opacity: Math.min(100, Math.max(0, nativeNumber(read('Opacity')) ?? 90)) / 100,
    blur: distance('Radius', 5), offset: distance('Offset', 10),
    angle: (angle % 360 + 360) % 360,
  }
}

function elementReflection(read: (key: string) => unknown, group: string): DesignElementReflection | false | undefined {
  const enabled = nativeBoolean(read('Enabled'))
  if (!enabled) return enabled
  const percent = (key: string, fallback: number) => Math.min(100, Math.max(0, nativeNumber(read(key)) ?? fallback)) / 100
  const distance = (key: string) => Math.min(0.2, Math.max(0, (nativeNumber(read(key)) ?? 0) / 1080))
  return { group, opacity: percent('Opacity', 50), size: percent('Size', 75), blur: distance('Blur'), distance: distance('Distance') }
}

function readScriptureOutputSettings(db: Database): ScriptureOutputSettings | undefined {
  const tables = new Set(rows(db, "SELECT name FROM sqlite_master WHERE type = 'table'").map(({ name }) => String(name).toLowerCase()))
  const hasNamedGroup = (table: string) => tables.has(table) && rows(db, `PRAGMA table_info(${table})`).some(({ name }) => name === 'group_name')
  const groups = ['presentation', 'presentation_property_global'].every((name) => tables.has(name)) && hasNamedGroup('presentation_property_group_global')
    ? rows(db, `SELECT g.group_name, p.key, p.value FROM presentation_property_group_global g
      JOIN presentation_property_global p ON p.group_id = g.rowid JOIN presentation t ON t.rowid = g.link_id
      WHERE UPPER(t.presentation_uid) = 'P' AND g.group_name IN ('Scripture_Attributes', 'Text_Attributes') ORDER BY p.rowid`) : []
  const properties = ['element', 'slide', 'presentation', 'element_property'].every((name) => tables.has(name)) && hasNamedGroup('element_property_group')
    ? rows(db, `SELECT g.group_name, p.key, p.value FROM element_property_group g
      JOIN element_property p ON p.group_id = g.rowid JOIN element e ON e.rowid = g.link_id
      JOIN slide s ON s.rowid = e.slide_id JOIN presentation t ON t.rowid = s.presentation_id
      WHERE UPPER(t.presentation_uid) = 'P' AND UPPER(s.slide_uid) = 'SCRIPTURE' AND UPPER(e.element_uid) = 'CONTENT_SCRIPTURE'
        AND g.group_name IN ('Text_Style_201', 'Text_Style_202', 'Text_Style_203')
      ORDER BY e.rowid, p.rowid`) : []
  const attribute = (key: string) => property(groups, 'Scripture_Attributes', key)
  const showReference = nativeBoolean(attribute('Show_Reference'))
  const onlyReference = nativeBoolean(attribute('Only_Show_Reference'))
  const completePassage = nativeBoolean(attribute('Show_Complete_Passage'))
  const abbreviateBooks = nativeBoolean(attribute('Abbr_Book_Names'))
  const flow = nativeBoolean(attribute('Enable_Scripture_Flow'))
  const breakOnVerse = nativeBoolean(attribute('One_Verse_Per_Slide'))
  const minimum = nativeNumber(property(groups, 'Text_Attributes', 'Minimum_Size_Limit'))
  const pagination = {
    ...(flow === undefined ? {} : { flow }),
    ...(breakOnVerse === undefined ? {} : { breakOnVerse }),
    ...(isScriptureFontRatio(minimum) ? { minFontRatio: minimum } : {}),
  }
  const location = nativeNumber(attribute('Reference_Location'))
  const referenceLocations = ['before-slide', 'after-slide', 'after-passage'] as const
  const placement = location === undefined ? undefined : referenceLocations[location]
  const hiddenNumbers = nativeBoolean(property(properties, 'Text_Style_203', 'Hidden'))
  const referenceInsets: NonNullable<ScriptureOutputSettings['referenceInsets']> = {}
  const margins = { left: 'Left_Margin', right: 'Right_Margin', top: 'Top_Margin', bottom: 'Bottom_Margin' } as const
  for (const side of ['left', 'right', 'top', 'bottom'] as const) {
    const length = nativeNumber(property(properties, 'Text_Style_202', margins[side]))
    if (isScriptureReferenceInset(length)) referenceInsets[side] = length
  }
  const fontGroups = { text: 'Text_Style_201', number: 'Text_Style_203', reference: 'Text_Style_202' }
  const fonts: NonNullable<ScriptureOutputSettings['fonts']> = {}
  for (const role of scriptureFontRoles) {
    const read = (key: string) => property(properties, fontGroups[role], key)
    const fontFamily = text(read('Font_Name'))?.trim()
    const color = nativeColor(read('Font_Color'))
    const fontRatio = nativeNumber(read('Font_Size'))
    const bold = nativeBoolean(read('Font_Bold'))
    const italic = nativeBoolean(read('Font_Italic'))
    const effects = nativeTextEffects(read)
    const font = {
      ...(isScriptureFontFamily(fontFamily) ? { fontFamily } : {}), ...(color ? { color } : {}),
      ...(isScriptureFontRatio(fontRatio) ? { fontRatio } : {}),
      ...(bold === undefined ? {} : { bold }), ...(italic === undefined ? {} : { italic }),
      ...(effects ? { effects } : {}),
    }
    if (Object.keys(font).length) fonts[role] = font
  }
  if ([showReference, onlyReference, completePassage, placement, hiddenNumbers, abbreviateBooks].every((value) => value === undefined)
    && !Object.keys(fonts).length && !Object.keys(referenceInsets).length && !Object.keys(pagination).length) return undefined
  return {
    reference: onlyReference ? 'reference-only' : showReference === false ? 'hidden' : placement ?? defaultScriptureOutputSettings.reference,
    completePassage: completePassage ?? defaultScriptureOutputSettings.completePassage,
    ...(hiddenNumbers === undefined ? {} : { verseNumbers: !hiddenNumbers }),
    ...(abbreviateBooks === undefined ? {} : { abbreviateBooks }),
    ...(Object.keys(fonts).length ? { fonts } : {}),
    ...(Object.keys(referenceInsets).length ? { referenceInsets } : {}),
    ...(Object.keys(pagination).length ? { pagination } : {}),
  }
}

function nativeTextEffects(font: (key: string) => unknown): TextEffects | undefined {
  function measure(key: string, max: number) {
    const value = nativeNumber(font(key))
    return value !== undefined && value >= 0 && value <= max ? value : undefined
  }
  const outlineEnabled = nativeBoolean(font('Outline_Enabled'))
  const shadowEnabled = nativeBoolean(font('Shadow_Enabled'))
  const superscript = nativeBoolean(font('Font_Superscript'))
  const subscript = nativeBoolean(font('Font_Subscript'))
  const angle = nativeNumber(font('Shadow_Angle'))
  const outline = {
    color: nativeColor(font('Outline_Color')),
    opacity: measure('Outline_Opacity', 100),
    width: measure('Outline_Size', 1),
    position: (['outer', 'center', 'inner'] as const)[nativeNumber(font('Outline_Position')) ?? -1],
    join: (['round', 'square', 'bevel'] as const)[nativeNumber(font('Outline_Join')) ?? -1],
  }
  const shadow = {
    color: nativeColor(font('Shadow_Color')),
    opacity: measure('Shadow_Opacity', 100),
    blur: measure('Shadow_Blur', 1),
    offset: measure('Shadow_Offset', 1),
    angle: angle === undefined ? undefined : angle % 360,
  }
  const effects: TextEffects = {
    underline: nativeBoolean(font('Font_Underline')),
    strike: nativeBoolean(font('Font_StrikeThrough')),
    baseline: subscript ? 'sub' : superscript ? 'super' : superscript === false || subscript === false ? 'normal' : undefined,
    fontOpacity: measure('Font_Opacity', 100),
    outline: outlineEnabled !== undefined || Object.values(outline).some((value) => value !== undefined)
      ? { ...outline, enabled: outlineEnabled ?? false } : undefined,
    shadow: shadowEnabled !== undefined || Object.values(shadow).some((value) => value !== undefined)
      ? { ...shadow, enabled: shadowEnabled ?? false } : undefined,
  }
  return Object.values(effects).some((value) => value !== undefined) ? effects : undefined
}

async function readAlertLayout(source: AssetSource, path: string, uid: string, group: string) {
  const db = await openDatabase(source, path)
  try {
    const result = db.exec('SELECT EXISTS (SELECT 1 FROM presentation) OR EXISTS (SELECT 1 FROM presentation_property_global)')
    const hasNativeStyle = result[0]?.values[0]?.[0] === 1
    if (!hasNativeStyle) return { hasNativeStyle }
    const element = rows(db, `SELECT CAST(e.rowid AS TEXT) AS element_id, CAST(e.background_resource_id AS TEXT) AS background_id
      FROM element e JOIN slide s ON s.rowid = e.slide_id
      WHERE UPPER(e.element_uid) = ? ORDER BY (UPPER(s.slide_uid) = ?) DESC, e.rowid LIMIT 1`, [uid, uid])[0]
    const settings = rows(db, `SELECT g.group_name, p.key, p.value FROM presentation_property_group_global g
      JOIN presentation_property_global p ON p.group_id = g.rowid
      LEFT JOIN presentation t ON t.rowid = g.link_id
      WHERE g.group_name = ? ORDER BY (UPPER(t.presentation_uid) = 'GLOBAL') DESC, p.rowid`, [group])
    if (!element && !settings.length) return { hasNativeStyle }

    const properties = element ? rows(db, `SELECT g.group_name, p.key, p.value FROM element_property_group g
      JOIN element_property p ON p.group_id = g.rowid WHERE g.link_id = ? ORDER BY p.rowid`, [String(element.element_id)]) : []
    const backgroundId = text(element?.background_id)
    const background = backgroundId ? rows(db, 'SELECT color FROM resource_color WHERE resource_id = ? ORDER BY rowid LIMIT 1', [backgroundId])[0]?.color : undefined
    const read = (key: string) => property(settings, group, key)
    return { layout: { read, properties, background: nativeColor(background), hasElement: Boolean(element) }, hasNativeStyle }
  } finally { db.close() }
}

function alertLayoutAppearance(
  layout: Pick<NonNullable<Awaited<ReturnType<typeof readAlertLayout>>['layout']>, 'properties' | 'background' | 'hasElement'>,
  fontGroup: string,
) {
  const { properties, background, hasElement } = layout
  const font = (key: string) => property(properties, fontGroup, key)
  const opacityFraction = opacity(properties, 'Background')
  const color = nativeColor(font('Font_Color'))
  const fontFamily = text(font('Font_Name'))
  const ratio = nativeNumber(font('Font_Size'))
  const bold = nativeBoolean(font('Font_Bold'))
  const italic = nativeBoolean(font('Font_Italic'))
  const effects = nativeTextEffects(font)
  return {
    ...(hasElement ? { enabled: nativeBoolean(property(properties, 'Element', 'Hidden')) !== true } : {}),
    ...(background ? { backgroundColor: background } : {}),
    ...(opacityFraction === undefined ? {} : { opacity: Math.round(opacityFraction * 100) }),
    ...(color ? { textColor: color } : {}),
    ...(validNurseryFont(fontFamily) ? { fontFamily } : {}),
    ...(ratio !== undefined && ratio > 0 && ratio <= 0.25 ? { fontRatio: ratio } : {}),
    ...(bold === undefined ? {} : { bold }),
    ...(italic === undefined ? {} : { italic }),
    ...(effects ? { effects } : {}),
  }
}

export async function readEasyWorshipNurseryStyle(source: AssetSource, path: string): Promise<{ entry?: EasyWorshipNurseryStyle; hasNativeStyle: boolean }> {
  const output = /(?:^|\/)altoutnursery\.settings\.db$/i.test(path) ? 'alternate' : 'live'
  const { layout, hasNativeStyle } = await readAlertLayout(source, path, 'NURSERY_ALERT', 'Nursery_Attributes')
  if (!layout) return { hasNativeStyle }

  const style = { ...defaultNurserySettings[output], ...alertLayoutAppearance(layout, 'Text_Style_500') }
  const location = nativeNumber(layout.read('Location'))
  if (location !== undefined) style.position = nurseryPositions[location] ?? style.position
  const autoRemove = nativeBoolean(layout.read('Auto_Remove'))
  const delay = nativeNumber(layout.read('Delay'))
  if (autoRemove === false) style.seconds = null
  else if (delay !== undefined && delay >= 0) style.seconds = Math.max(1, Math.min(5999, Math.ceil(delay / 1000)))
  if (style.fontRatio !== undefined) style.fontSize = Math.max(12, Math.min(160, Math.round(style.fontRatio * 1080)))
  return { entry: { id: path, output, style }, hasNativeStyle }
}

export async function readEasyWorshipMessageStyle(source: AssetSource, path: string): Promise<{ entry?: EasyWorshipMessageStyle; hasNativeStyle: boolean }> {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  const output = name.startsWith('foldback') ? 'stage' : name.startsWith('altout') ? 'alternate' : 'live'
  const { layout, hasNativeStyle } = await readAlertLayout(source, path, 'MESSAGE_ALERT', 'Message_Attributes')
  if (!layout) return { hasNativeStyle }

  const style = { ...defaultMessageAlertStyle[output], ...alertLayoutAppearance(layout, 'Text_Style_600') }
  const location = nativeNumber(layout.read('Location'))
  if (location === 0 || location === 1) style.position = location === 0 ? 'top' : 'bottom'
  const speed = nativeNumber(layout.read('ScrollSpeed') ?? property(layout.properties, 'Text_Format', 'ScrollSpeed'))
  if (speed !== undefined && Number.isInteger(speed) && speed >= 0 && speed <= 100) style.scrollSpeed = speed
  return { entry: { id: path, output, style }, hasNativeStyle }
}

export async function readEasyWorshipFoldbackSettings(source: AssetSource, path: string): Promise<{
  appearance?: FoldbackAppearance; content?: FoldbackContentSettings; service?: FoldbackServiceSettings
}> {
  const db = await openDatabase(source, path)
  try {
    const groups = rows(db, `SELECT g.group_name, p.key, p.value FROM presentation_property_group_global g
      JOIN presentation_property_global p ON p.group_id = g.rowid
      JOIN presentation t ON t.rowid = g.link_id
      WHERE UPPER(t.presentation_uid) = 'P' AND g.group_name IN ('NextLine_Attributes', 'FoldBack_Attributes', 'Text_Attributes')
      ORDER BY p.rowid`)

    function elementAppearance(uid: string, fontGroup: string, slideUid = 'SONG') {
      const element = rows(db, `SELECT CAST(e.rowid AS TEXT) AS element_id, color.color
        FROM element e JOIN slide s ON s.rowid = e.slide_id
        LEFT JOIN resource_color color ON color.resource_id = e.background_resource_id
        WHERE UPPER(e.element_uid) = ? ORDER BY (UPPER(s.slide_uid) = ?) DESC, e.rowid, color.rowid LIMIT 1`, [uid, slideUid])[0]
      if (!element) return undefined
      const properties = rows(db, `SELECT g.group_name, p.key, p.value FROM element_property_group g
        JOIN element_property p ON p.group_id = g.rowid WHERE g.link_id = ? ORDER BY p.rowid`, [String(element.element_id)])
      const { enabled, ...style } = alertLayoutAppearance({
        hasElement: true, properties, background: nativeColor(element.color),
      }, fontGroup)
      if (style.fontRatio !== undefined && style.fontRatio < 0.001) delete style.fontRatio
      return { enabled, style, properties }
    }

    // Delphi's comma-text list quotes phrases and doubles literal quote characters.
    const nativeWords = text(property(groups, 'Text_Attributes', 'Proper_Words')) ?? ''
    const properWords: string[] = []
    for (const match of nativeWords.matchAll(/(?:^|,)\s*(?:"((?:[^"]|"")*)"|([^,]*))(?=,|$)/g)) {
      const word = (match[1]?.replace(/""/g, '"') ?? match[2]).trim()
      if (word.length > 0 && word.length <= 160 && !/[\r\n\0]/.test(word)) properWords.push(word)
      if (properWords.length === 500) break
    }

    function contentStyle(uid: string, group: string, slideUid: string): FoldbackContentStyle | undefined {
      const element = elementAppearance(uid, group, slideUid)
      if (!element) return undefined
      const { style, properties } = element
      const horizontal = nativeNumber(property(properties, group, 'Text_Alignment'))
      const vertical = nativeNumber(property(properties, 'Text_Layout', 'Vertical_Alignment'))
      const format = (key: string) => nativeBoolean(property(properties, 'Text_Format', key))
      const content: FoldbackContentStyle = {
        ...style,
        align: horizontal === undefined ? undefined : foldbackHorizontalAlignments[horizontal],
        verticalAlign: vertical === undefined ? undefined : foldbackVerticalAlignments[vertical],
        layout: textLayout(properties),
        wrap: format('Word_Wrapping'),
        normalize: format('Normalize_Text'),
        uppercase: format('Capitalize_All'),
        capitalizeFirst: format('Capitalize_First'),
        properWords: format('Capitalize_Proper') ? properWords : undefined,
      }
      return Object.values(content).some((value) => value !== undefined) ? content : undefined
    }

    const song = contentStyle('CONTENT_SONG', 'Text_Style_101', 'SONG')
    const scripture = contentStyle('CONTENT_SCRIPTURE', 'Text_Style_201', 'SCRIPTURE')

    const next = elementAppearance('NEXT_SLIDE', 'Text_Style_400')
    const nextCount = nativeNumber(property(groups, 'NextLine_Attributes', 'Line_Count'))
    const nextLines = next?.enabled === false || nextCount === 0 ? 0
      : nextCount === 2 ? 2 : nextCount === 1 || next ? 1 : undefined
    const clock = elementAppearance('FOLDBACK_CLOCK', 'Text_Style_401')
    const setting = (key: string) => property(groups, 'FoldBack_Attributes', key)
    const corner = (key: string) => {
      const location = nativeNumber(setting(key))
      return location === undefined ? undefined : foldbackClockPositions[location]
    }
    const value = setting('Clock_Format')
    const format = validFoldbackClockFormat(value) ? value : undefined
    const position = corner('Clock_Location')
    const service = elementAppearance('FOLDBACK_SI', 'Text_Style_402')
    const serviceFormat = foldbackServiceFormats.find((format) => format === text(setting('SI_Format'))?.toLowerCase())
    const servicePosition = corner('SI_Location')
    const allowOverrun = nativeBoolean(setting('SI_Allow_Overrun'))

    return {
      ...(nextLines !== undefined || clock || format || position ? { appearance: {
        ...(nextLines !== undefined ? { nextLines } : {}),
        ...(next && Object.keys(next.style).length ? { next: next.style } : {}),
        ...(clock || format || position ? { clock: { ...clock?.style, enabled: clock?.enabled, format, position } } : {}),
      } } : {}),
      ...(song || scripture ? { content: { ...(song ? { song } : {}), ...(scripture ? { scripture } : {}) } } : {}),
      ...(service || serviceFormat || servicePosition || allowOverrun !== undefined ? {
        service: { ...service?.style, enabled: service?.enabled, format: serviceFormat, position: servicePosition, allowOverrun },
      } : {}),
    }
  } finally { db.close() }
}

type ProfilePowerPointFiles = {
  byName: Map<string, string[]>
  paths: string[]
  hashOnly: ReadonlySet<string>
  size?: AssetSource['size']
  findByHash: ReturnType<typeof createEasyWorshipMediaHashFinder<string>>
}

function catalogDeckName(value: unknown) {
  const name = text(value)
  return name && isPowerPointFilename(name) ? powerPointFilename(name) : undefined
}

async function profilePowerPoint(row: SqlRow, resources: ProfilePowerPointFiles): Promise<EasyWorshipPowerPointEntry | undefined> {
  const storedName = catalogDeckName(row.filename)
  const aliasName = catalogDeckName(row.alias_filename)
  const sourceName = catalogDeckName(row.source_filename)
  const names = [storedName, aliasName, sourceName].filter((name): name is string => Boolean(name))
  if (!names.length) return undefined
  const original = sourceName ?? names[0]
  const desktop = typeof window !== 'undefined' && Boolean(window.worshipPowerPoint)
  const named = (name: string) => resources.byName.get(name.toLowerCase()) ?? []
  const checks = [
    { name: storedName ?? aliasName ?? original, hash: text(row.file_hash), size: nativeNumber(row.filesize), aliases: [storedName, aliasName] },
    { name: original, hash: text(row.source_file_hash), size: undefined, aliases: [sourceName] },
  ].flatMap((check) => check.hash && /^[a-f0-9]{64}$/i.test(check.hash)
    ? [{ ...check, hash: check.hash.toLowerCase() }] : [])
  let path: string | undefined
  let warning: string | undefined
  if (checks.length) {
    if (!desktop) checks.sort((a, b) => Number(isLegacyPowerPoint(a.name)) - Number(isLegacyPowerPoint(b.name)))
    for (const { name, hash, size, aliases } of checks) {
      const sameFormat = (candidate: string) => isLegacyPowerPoint(candidate) === isLegacyPowerPoint(name)
      const preferred = new Set(aliases.flatMap((alias) => alias ? named(alias).filter(sameFormat) : []))
      path = await resources.findByHash(hash, preferred)
      if (!path) {
        const alternatives = resources.paths.filter((candidate) => !preferred.has(candidate) && sameFormat(candidate))
        const likely = alternatives.filter((candidate) => {
          const bytes = resources.size?.(candidate)
          return !size || bytes === undefined || bytes === size
        })
        path = await resources.findByHash(hash, likely)
          ?? (likely.length === alternatives.length ? undefined : await resources.findByHash(hash, alternatives))
      }
      if (path) break
    }
    if (!path) warning = 'ไม่พบไฟล์ PowerPoint ที่ตรงกับ SHA-256 ใน Presentations.db กรุณาแนบไฟล์เดิม'
  } else {
    const unqualified = (name: string) => named(name).filter((path) => !resources.hashOnly.has(path))
    const exact = names.map(unqualified).find((paths) => paths.length)
    const modern = names.map(modernPowerPointName).map(unqualified).find((paths) => paths.length)
    const matched = !desktop && modern?.length === 1 ? modern : exact ?? modern
    if (matched?.length === 1) path = matched[0]
    else warning = matched ? 'พบไฟล์ PowerPoint ชื่อเดียวกันหลายไฟล์ในโปรไฟล์' : 'ไม่พบไฟล์ PowerPoint ใน Resources ของโปรไฟล์นี้'
  }

  const filename = path ? powerPointFilename(path) : original
  const legacy = isLegacyPowerPoint(filename)
  if (path && legacy && !desktop) warning = 'เปิดไฟล์ .ppt ใน WorshipTeam Desktop ที่ติดตั้ง LibreOffice Impress หรือนำเข้า .pptx ที่แปลงแล้วในคลังสไลด์'
  return {
    id: text(row.file_item_uid) ?? String(row._id),
    title: text(row.title) ?? filename.replace(/\.pptx?$/i, ''),
    filename,
    originalFilename: original,
    author: text(row.author),
    copyright: text(row.copyright),
    description: text(row.description),
    collectionDetails: designCollectionDetails(row),
    ...(checks.length ? { fileChecks: checks.map(({ name, hash, aliases }) => ({
      filenames: [...new Set([name, ...aliases.filter((alias): alias is string => alias !== undefined
        && isLegacyPowerPoint(alias) === isLegacyPowerPoint(name))])], hash,
    })) } : {}),
    ...(path && (!legacy || desktop) ? { sourcePath: path } : {}),
    ...(warning ? { warning } : {}),
  }
}

/** Reviews one selected profile and verifies PowerPoint files with catalog checksums. */
export async function reviewEasyWorshipDesigns(
  input: File | File[], selectedProfile?: string, legacyEncoding?: LegacySongEncoding,
): Promise<EasyWorshipDesignReview> {
  const files = Array.isArray(input) ? input : [input]
  if (files.length && files.every((file) => isEasyWorshipDesignExport(file.name))) return reviewEasyWorshipDesignExports(files)
  const source = input instanceof File && /\.(ewprofile|ewpck|zip)$/i.test(input.name)
    ? await sourceFromArchive(input)
    : sourceFromFiles(files)
  return reviewEasyWorshipDesignsFromSource(withEasyWorshipLibraryMedia(source).source, selectedProfile, legacyEncoding)
}

/** Read the same native layout tables that the library exporter packs with its media. */
export async function reviewEasyWorshipDesignExports(files: readonly File[], { preserveRevisions = false } = {}): Promise<EasyWorshipDesignExportReview> {
  const entries: EasyWorshipDesignEntry[] = []
  const warnings: string[] = []
  const sources = new Map<string, AssetSource>()
  const packedMediaPaths: string[] = []
  const ids = new Set<string>()
  for (const [index, file] of files.entries()) {
    try {
      if (!isEasyWorshipDesignExport(file.name)) throw new Error('เลือกไฟล์ .ewpx หรือ .ewtx')
      const source = await sourceFromArchive(file)
      const databases = [...source.paths.values()].flat().filter((path) => /(?:^|\/)main\.db$/i.test(path))
      if (databases.length !== 1) throw new Error('แพ็กเกจต้องมี main.db เพียงหนึ่งไฟล์')
      const databasePath = databases[0]
      if ((source.size(databasePath) ?? 0) > MAX_DATABASE_BYTES) throw new Error('main.db มีขนาดเกิน 128 MB')
      const directory = databasePath.slice(0, databasePath.lastIndexOf('/') + 1)
      const prefix = `@easyworship-export-${index}:`
      const media = new Map<string, string[]>()
      for (const [key, paths] of source.paths) {
        if (!key.startsWith((directory + 'media/').toLowerCase()) || paths.length !== 1) continue
        const name = key.slice(key.lastIndexOf('/') + 1)
        const matches = media.get(name) ?? []
        matches.push(paths[0])
        media.set(name, matches)
      }
      const scoped = withEasyWorshipLibraryMedia({ ...source, attachedMedia: [...media.values()].flat() }).source
      const db = await openDatabase(source, databasePath)
      try {
        const resolve = await prepareProfileLayoutMedia(scoped, directory)(db, (kind, original, packed, _hash, size) => {
          const matches = media.get(layoutFilename(packed ?? original, kind).split('/').pop()?.toLowerCase() ?? '')
          const path = matches?.length === 1 ? matches[0] : undefined
          return path && (typeof size !== 'number' || size <= 0 || scoped.size(path) === size) ? { sourcePath: path } : {}
        })
        const parsed = readEasyWorshipLayouts(db, { packed: true, resolveAsset: (...args) => {
          const asset = resolve(...args)
          return asset.sourcePath ? { ...asset, sourcePath: prefix + asset.sourcePath } : asset
        } })
        const presentation = /\.ewpx$/i.test(file.name)
        const groups = new Map(rows(db, 'SELECT rowid AS _id, * FROM presentation NOT INDEXED').map((row) => [String(row._id), row]))
        const candidates = parsed.entries.filter((entry) => entry.content.slides.length
          && (entry.kind === 'presentation') === presentation && !(Number(groups.get(entry.layoutId)?.group_level) > 0))
        if (!candidates.length) throw new Error(presentation ? 'ไม่พบงานนำเสนอในไฟล์ .ewpx' : 'ไม่พบธีมเพลง พระคัมภีร์ หรืองานนำเสนอในไฟล์ .ewtx')
        sources.set(prefix, scoped)
        packedMediaPaths.push(...[...media.values()].flat().map((path) => prefix + path))
        warnings.push(...parsed.warnings.map((warning) => `${file.name} · ${warning}`))
        let databaseHash: string | undefined
        for (const entry of candidates) {
          const uid = text(groups.get(entry.layoutId)?.presentation_uid)
          if (!uid) databaseHash ??= await mediaFileHash(await source.read(databasePath))
          const identity = uid?.trim().toLowerCase() ?? [databaseHash, entry.layoutId]
          const exportId = await importIdentity(['easyworship-resource-export-v1', entry.kind, identity])
          const exportRevisionId = preserveRevisions && entry.nativeRevision
            ? await importIdentity(['easyworship-resource-export-revision-v1', exportId, entry.nativeRevision.toLowerCase()])
            : undefined
          const key = exportRevisionId ?? exportId
          if (ids.has(key)) {
            warnings.push(`${file.name} · ${entry.title} ซ้ำกับไฟล์ที่เลือกก่อนหน้า`)
            continue
          }
          ids.add(key)
          const content = !uid && entry.content.source ? { ...entry.content, source: { ...entry.content.source, uid: exportId } } : entry.content
          entries.push({ ...entry, content, exportId, exportRevisionId, exportFilename: file.name })
        }
      } finally {
        db.close()
      }
    } catch (cause) {
      warnings.push(`${file.name} · ${cause instanceof Error ? cause.message : 'อ่านแพ็กเกจ EasyWorship ไม่สำเร็จ'}`)
    }
  }
  function locate(path: string) {
    const split = path.indexOf(':') + 1
    const source = sources.get(path.slice(0, split))
    if (!source) throw new Error('ไม่พบไฟล์แพ็กเกจ EasyWorship ที่อ้างอิง')
    return { source, asset: path.slice(split) }
  }
  return { profiles: [], entries, warnings, packedMediaPaths,
    ownsAsset: (path) => sources.has(path.slice(0, path.indexOf(':') + 1)),
    assetSize: (path) => {
      const { source, asset } = locate(path)
      return source.size?.(asset)
    },
    readAsset: async (path) => {
      const { source, asset } = locate(path)
      return source.read(asset)
    },
    withAsset: async (path, consume) => {
      const { source, asset } = locate(path)
      return withProfileMedia(source, asset, consume)
    } }
}

/** Reviews layouts using the scoped file index of an already opened profile. */
export async function reviewEasyWorshipDesignsFromSource(
  source: AssetSource, selectedProfile?: string, legacyEncoding?: LegacySongEncoding,
  audioRole?: (path: string) => DesignSoundtrack['role'] | undefined,
  prepareMedia?: PrepareLayoutMedia,
): Promise<EasyWorshipDesignReview> {
  const profilesByDirectory = new Map<string, EasyWorshipDesignProfile>()
  for (const matches of source.paths.values()) {
    const databasePath = matches[0]
    const legacy = LEGACY_BACKGROUND_PATH.test(databasePath)
    if (!legacy && !LAYOUT_PATH.test(databasePath) && !PRESENTATIONS_PATH.test(databasePath)) continue
    if (matches.length !== 1) throw new Error(`พบฐานข้อมูลออกแบบซ้ำใน ${databasePath}`)
    const directory = (legacy ? 'legacy:' : '') + databasePath.slice(0, databasePath.lastIndexOf('/') + 1).toLowerCase()
    if (profilesByDirectory.has(directory) && !LAYOUT_PATH.test(databasePath)) continue
    const name = root(databasePath).replace(/\/$/, '') || 'EasyWorship profile'
    const snapshot = easyWorshipArchiveName(databasePath.slice(0, databasePath.lastIndexOf('/') + 1))
    profilesByDirectory.set(directory, { id: databasePath.toLowerCase(), name: snapshot ? `${name} · ฐานข้อมูลย้อนหลัง ${snapshot}` : name, databasePath })
  }
  const profiles = [...profilesByDirectory.values()]
  if (!profiles.length) throw new Error('ไม่พบ PresentationLayouts.db, Presentations.db หรือ BackGrounds.DB ในไฟล์ที่เลือก')
  const profile = selectedProfile
    ? profiles.find(({ id, databasePath }) => selectedProfile === id || selectedProfile === databasePath)
    : profiles.length === 1 ? profiles[0] : undefined
  if (!profile) return { profiles, warnings: ['เลือกโปรไฟล์ที่จะตรวจ'] }
  if (LEGACY_BACKGROUND_PATH.test(profile.databasePath)) {
    const { legacyThemes } = await reviewLegacyBackgrounds(source, profile.databasePath, root(profile.databasePath), legacyEncoding)
    return { ...legacyThemes, profiles }
  }

  const directory = profile.databasePath.slice(0, profile.databasePath.lastIndexOf('/') + 1)
  const resourceRoot = (root(profile.databasePath) + 'Resources/').toLowerCase()
  const mediaPaths = new Set(source.attachedMedia)
  const byName = new Map<string, string[]>()
  const paths = new Set<string>()
  function indexDeck(path: string) {
    if (!isPowerPointFilename(path) || paths.has(path)) return
    const bytes = source.size?.(path)
    if (bytes !== undefined && (!bytes || bytes > maxPackedPowerPointBytes)) return
    paths.add(path)
    const filename = powerPointFilename(path).toLowerCase()
    const list = byName.get(filename) ?? []
    list.push(path)
    byName.set(filename, list)
  }
  for (const [key, matches] of source.paths) {
    if (key.startsWith(resourceRoot)) matches.forEach((path) => { indexDeck(path); mediaPaths.add(path) })
  }
  const powerPointMedia = createPowerPointMediaResolver([...mediaPaths].map((path) => ({ path, filename: powerPointFilename(path),
    readFile: () => source.read(path) })))
  source.attachedMedia?.forEach(indexDeck)
  source.hashOnlyMedia?.forEach(indexDeck)
  const resources: ProfilePowerPointFiles = {
    byName, paths: [...paths], size: source.size, hashOnly: new Set(source.hashOnlyMedia),
    findByHash: createEasyWorshipMediaHashFinder((path: string) => withProfileMedia(source, path, mediaFileHash)),
  }
  const catalog = new Map<string, SqlRow>()
  const collectionRows: { resource: 'presentations' | 'themes'; row: SqlRow; deckId?: string }[] = []
  const warnings: string[] = []
  const powerPoints: EasyWorshipPowerPointEntry[] = []
  for (const name of ['Presentations.db', 'Themes.db']) {
    const matches = source.paths.get((directory + name).toLowerCase()) ?? []
    if (!matches.length) continue
    try {
      if (matches.length !== 1) throw new Error('พบฐานข้อมูลซ้ำ')
      const db = await openDatabase(source, matches[0])
      try {
        for (const row of rows(db, 'SELECT CAST(rowid AS TEXT) AS _id, * FROM file_item NOT INDEXED ORDER BY rowid')) {
          const powerPoint = name === 'Presentations.db' ? await profilePowerPoint(row, resources) : undefined
          collectionRows.push({ resource: name === 'Themes.db' ? 'themes' : 'presentations', row, deckId: powerPoint && text(row.file_item_uid) })
          if (powerPoint) powerPoints.push(powerPoint)
          else if (row.presentation_id != null) catalog.set(String(row.presentation_id), row)
          else warnings.push(`ไฟล์นำเข้า ${text(row.title) ?? name} ต้องใช้ไฟล์งานนำเสนอต้นฉบับ`)
        }
      } finally {
        db.close()
      }
    } catch {
      warnings.push(`อ่านดัชนี ${name} ไม่สำเร็จ ใช้ข้อมูลจาก PresentationLayouts.db`)
    }
  }

  function buildCollectionCatalog(entries: EasyWorshipDesignEntry[]): ResourceCollectionCatalog {
    const byLayout = new Map(entries.map((entry) => [entry.layoutId, entry]))
    const catalog: ResourceCollectionCatalog = { presentations: [], themes: [] }
    for (const { resource, row, deckId } of collectionRows) {
      const id = text(row._id)
      if (!id) continue
      const layout = byLayout.get(String(row.presentation_id))
      const sameResource = layout && (resource === 'presentations' ? layout.kind === 'presentation' : layout.kind !== 'presentation')
      const key = deckId ? `powerpoint:${deckId}` : sameResource ? designCollectionKey(layout.content.source) : undefined
      const fields = {
        title: text(row.title) ?? null, author: text(row.author) ?? null, copyright: text(row.copyright) ?? null,
        description: text(row.description) ?? null, tags: text(row.tags) ?? null,
        filename: text(row.filename) ?? null, folder: text(row.folder) ?? null,
      }
      catalog[resource]?.push({ id, key, fields })
    }
    return catalog
  }

  if (!LAYOUT_PATH.test(profile.databasePath)) {
    if (catalog.size) warnings.push(`งานนำเสนอ ${catalog.size} รายการต้องใช้ PresentationLayouts.db ในโปรไฟล์เดียวกัน`)
    return { profiles, entries: [], powerPoints, collectionCatalog: buildCollectionCatalog([]), warnings, readAsset: source.read, powerPointMedia }
  }

  const db = await openDatabase(source, profile.databasePath)
  try {
    const fallback: ResolveLayoutMedia = (kind, filename) => {
      const relative = relativePath(layoutFilename(filename, kind))
      if (!relative) return {}
      const folder = kind === 'image' ? 'Images/' : kind === 'video' ? 'Videos/' : 'Audio/'
      const expected = root(profile.databasePath) + 'Resources/' + folder + relative
      const matches = source.paths.get(expected.toLowerCase()) ?? []
      return matches.length === 1 ? { sourcePath: matches[0], ...(kind === 'audio' ? { audioRole: audioRole?.(matches[0]) } : {}) } : {}
    }
    const resolveAsset = await (prepareMedia ?? prepareProfileLayoutMedia(source, root(profile.databasePath), audioRole))(db, fallback)
    const result = readEasyWorshipLayouts(db, { resolveAsset, catalog })
    return {
      profiles, entries: result.entries, powerPoints, collectionCatalog: buildCollectionCatalog(result.entries),
      warnings: [...warnings, ...result.warnings],
      readAsset: (path) => source.read(path),
      powerPointMedia,
    }
  } finally {
    db.close()
  }
}
