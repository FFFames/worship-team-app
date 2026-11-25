/** Reads SQLite EWSX schedule archives locally in the browser. */

import type { Database } from 'sql.js'
import type { FileEntry } from '@zip.js/zip.js'
import { displayTextFromEasyWorshipRtf, getEasyWorshipSql, isEasyWorshipSqliteDatabase } from './easyWorship'
import { importIdentity } from './importIdentity'
import type { DesignTextRun, SlideDesign, SlidePlaybackSettings, SlideTransition } from '../types/slideDesign'
import type { PlaylistCue } from '../types/database'
import type { MediaClip, MediaPlayback, VideoAlphaMode } from '../types/media'
import type { FeedAsset, FeedSound, FeedVideo } from '../types/liveFeed'
import type { ScriptureBookName, ScriptureSourceRange, ScriptureVerseStart } from '../types/scripture'
import type { LegacySongEncoding } from './easyWorshipEncoding'
import { readEasyWorshipLayouts } from './easyWorshipDesigns'
import {
  createEasyWorshipScriptureLookup, decodeEasyWorshipScriptureRange, fillScriptureDesignText, missingScriptureText, resolveEasyWorshipScriptureRange, scheduleScriptureBookNames,
  type EasyWorshipScriptureLookup,
} from './easyWorshipScheduleScripture'
import { presentationWebUrl } from './livePresentation'
import { readEasyWorshipMediaClip, readEasyWorshipPosterSeconds } from './easyWorshipMediaClip'
import { readEasyWorshipVideoAlpha } from './videoAlpha'
import { dvdWithElementPlayback, readEasyWorshipDvds } from './easyWorshipDvds'
import { readEasyWorshipElementPlayback, readEasyWorshipMediaFlag } from './easyWorshipMediaPlayback'
import { easyWorshipFeedAsset, readEasyWorshipLayoutFeeds } from './easyWorshipFeedVideo'
import type { DvdClip } from '../types/dvdClip'
import { verifyEasyWorshipPackedMedia, type RejectedPackedMedia } from './easyWorshipPackedMedia'
import { isNestedScheduleGlobal } from './easyWorshipScheduleThemes'
import { recordEasyWorshipExternalMediaLocations } from './easyWorshipExternalMedia'

const MAX_MAIN_DATABASE_BYTES = 128 * 1024 * 1024
export const LEGACY_SCHEDULE_HEADER = 'EasyWorship Schedule File Version '

type SqlRow = Record<string, unknown>

export type EasyWorshipScheduleAsset = {
  kind: 'image' | 'video' | 'audio' | 'web' | 'camera' | 'powerpoint'
  filename: string
  archivePath?: string
  easyWorshipFileHash?: string
  easyWorshipFileSize?: number
  easyWorshipSourceLocationId?: string
  /** ZIP CRC32, when exposed by the archive, for idempotent local-media refresh. */
  crc32?: number
  role: 'background' | 'foreground'
  repeat?: boolean
  inheritedFromMaster?: true
  clip?: MediaClip
  posterSeconds?: number
  alphaMode?: VideoAlphaMode
  playback?: MediaPlayback
  url?: string
  hideScrollbars?: boolean
  dvd?: DvdClip
  deviceHints?: string[]
  feedVideo?: FeedVideo
  feedSound?: FeedSound
}

export type EasyWorshipScheduleSlide = {
  id: string
  order: number
  label: string
  previousSongLabel?: string
  lines: string[]
  lyricRuns?: DesignTextRun[]
  assets: EasyWorshipScheduleAsset[]
  design?: SlideDesign
  template?: string
  transition?: SlideTransition
  advanceMs?: number
  playback?: SlidePlaybackSettings
  warnings: string[]
  scriptureRange?: ScriptureSourceRange
  scriptureVerseStarts?: ScriptureVerseStart[]
  scriptureBookNames?: ScriptureBookName[]
  scriptureRecovery?: { fallbackLabel: string; missingText: boolean; replaceLabel: boolean }
}

export type EasyWorshipScheduleCue = {
  id: string
  order: number
  kind: PlaylistCue['kind']
  label: string
  slides: EasyWorshipScheduleSlide[]
  looping?: boolean
  metadata: {
    presentationUid: string | null
    type: number
    author: string | null
    copyright: string | null
    administrator: string | null
    description?: string
    tags?: string
    referenceNumber: string | null
    scripturePassage?: string
    abbreviation?: string | null
    notes: string | null
    groupLevel: number | null
    presentationPreview?: boolean
  }
  warnings: string[]
}

export type EasyWorshipSchedule = {
  source: { filename: string; version: string | null; importId: string; previousScriptureImportId?: string }
  cues: EasyWorshipScheduleCue[]
  unsupported: Array<{ cueId?: string; message: string }>
  packedMedia?: ReadonlyMap<string, Blob>
  rejectedPackedMedia?: RejectedPackedMedia
  externalMediaLocations?: ReadonlyMap<string, string>
}

type ResourceReference = {
  slideId: string
  elementUid: string | null
  role: 'background' | 'foreground'
  rtf: string | null
  imageFilename: string | null
  videoFilename: string | null
  audioFilename: string | null
  repeat?: boolean
  clip?: MediaClip
  posterSeconds?: number
  alphaMode?: VideoAlphaMode
  playback?: MediaPlayback
  powerpointFilename: string | null
  webUrl: string | null
  dvd?: DvdClip
  webHideScrollbars?: boolean
  layerId: string
  feedHidden?: boolean
  feed?: FeedAsset
  packedFilename: string | null
  fileHash: string | null
  fileSize: unknown
}

function rows(database: Database, query: string): SqlRow[] {
  const statement = database.prepare(query)
  const result: SqlRow[] = []
  try {
    while (statement.step()) result.push(statement.getAsObject())
  } finally {
    statement.free()
  }
  return result
}

function textOrNull(value: unknown): string | null {
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function hasTable(database: Database, table: string): boolean {
  return rows(database, "SELECT name FROM sqlite_master WHERE type = 'table' AND lower(name) = lower('" + table + "')").length === 1
}

type ArchiveEntry = { path: string; crc32?: number }

function getArchivePaths(entries: FileEntry[]): Map<string, ArchiveEntry> {
  const paths = new Map<string, ArchiveEntry>()
  const ambiguous = new Set<string>()
  for (const entry of entries) {
    if (entry.directory) continue
    const normalized = entry.filename.replace(/\\/g, '/')
    const filename = normalized.split('/').pop()?.toLowerCase()
    const signature = (entry as FileEntry & { signature?: unknown }).signature
    const crc32 = typeof signature === 'number' && Number.isFinite(signature) ? signature : undefined
    if (!filename || ambiguous.has(filename)) continue
    if (paths.has(filename)) {
      ambiguous.add(filename)
      paths.delete(filename)
    } else paths.set(filename, { path: normalized, crc32 })
  }
  return paths
}

function cueKind(type: number): EasyWorshipScheduleCue['kind'] {
  if (type === 6) return 'song'
  if (type === 7) return 'scripture'
  if (type === 8) return 'presentation'
  return 'unknown'
}

function safeFilename(filename: string): string {
  return filename.replace(/\\/g, '/').replace(/^<[^<>/]+>\/?/, '').split('/').pop() || 'Unnamed resource'
}

function sourceMediaDetails(hash?: string | null, size?: unknown, locationId?: string) {
  const checksum = hash && /^[a-f0-9]{64}$/i.test(hash) ? hash.toLowerCase() : undefined
  return { ...(checksum ? { easyWorshipFileHash: checksum } : {}),
    ...(locationId ? { easyWorshipSourceLocationId: locationId } : {}),
    ...((checksum || locationId) && typeof size === 'number' && Number.isSafeInteger(size) && size > 0 ? { easyWorshipFileSize: size } : {}) }
}

function getAsset(reference: ResourceReference, paths: Map<string, ArchiveEntry>, locate: (path: string) => string | undefined): EasyWorshipScheduleAsset | undefined {
  if (reference.dvd) return {
    kind: 'video', filename: reference.dvd.name, role: reference.role, dvd: reference.dvd,
    ...(reference.dvd.repeat ? { repeat: true } : {}),
  }
  const files: Array<[EasyWorshipScheduleAsset['kind'], string | null]> = [
    ['image', reference.imageFilename],
    ['video', reference.videoFilename],
    ['audio', reference.audioFilename],
    ['powerpoint', reference.powerpointFilename],
  ]
  const match = files.find(([, filename]) => filename !== null)
  if (match) {
    const [kind, filename] = match
    const archive = reference.packedFilename ? paths.get(safeFilename(reference.packedFilename).toLowerCase()) : undefined
    return {
      kind,
      filename: safeFilename(filename ?? reference.packedFilename ?? 'Unnamed resource'),
      archivePath: archive?.path,
      crc32: archive?.crc32,
      ...sourceMediaDetails(reference.fileHash, reference.fileSize, filename ? locate(filename) : undefined),
      role: kind === 'audio' && reference.elementUid === 'AUDIO' ? 'background' : reference.role,
      ...((kind === 'video' || kind === 'audio') && reference.repeat !== undefined ? { repeat: reference.repeat } : {}),
      ...(kind === 'video' && reference.playback ? { playback: reference.playback } : {}),
      ...(kind === 'image' && reference.playback?.fit ? { playback: { fit: reference.playback.fit } } : {}),
      ...(kind === 'audio' && reference.playback ? { playback: { volume: reference.playback.volume, muted: reference.playback.muted } } : {}),
      ...((kind === 'video' || kind === 'audio') && reference.clip ? { clip: reference.clip } : {}),
      ...(kind === 'video' && reference.posterSeconds !== undefined ? { posterSeconds: reference.posterSeconds } : {}),
      ...(kind === 'video' && reference.alphaMode ? { alphaMode: reference.alphaMode } : {}),
    }
  }
  if (reference.feed) return { ...reference.feed, role: reference.role }
  const url = presentationWebUrl(reference.webUrl ?? undefined)
  return url ? { kind: 'web', filename: url, url, role: reference.role,
    ...(reference.webHideScrollbars ? { hideScrollbars: true } : {}) } : undefined
}

function schemaIsSupported(database: Database): boolean {
  return ['presentation', 'slide', 'element', 'resource_text'].every((table) => hasTable(database, table))
}

function hasColumn(database: Database, table: string, column: string): boolean {
  return rows(database, 'PRAGMA table_info(' + table + ')')
    .some((entry) => textOrNull(entry.name)?.toLowerCase() === column.toLowerCase())
}

function readScriptureRanges(database: Database): Map<string, ScriptureSourceRange> {
  if (!hasTable(database, 'element_property_group') || !hasTable(database, 'element_property')) return new Map()
  const ids = new Map<string, Set<string>>()
  for (const row of rows(database, `
    SELECT slide.rowid AS slide_id, CAST(prop.value AS TEXT) AS range_id
    FROM slide JOIN presentation ON presentation.rowid = slide.presentation_id
    JOIN element ON element.slide_id = slide.rowid
    JOIN element_property_group AS grp ON grp.link_id = element.rowid
    JOIN element_property AS prop ON prop.group_id = grp.rowid
    WHERE presentation.presentation_type = 7 AND element.element_uid = 'CONTENT_SCRIPTURE'
      AND grp.group_name = 'Element' AND prop.key = 'ScriptureRangeID'
  `)) {
    if (typeof row.range_id !== 'string') continue
    const slide = String(row.slide_id)
    const values = ids.get(slide) ?? new Set<string>()
    values.add(row.range_id)
    ids.set(slide, values)
  }
  const ranges = new Map<string, ScriptureSourceRange>()
  for (const [slide, values] of ids) {
    if (values.size !== 1) continue
    const range = decodeEasyWorshipScriptureRange([...values][0])
    if (range) ranges.set(slide, range)
  }
  return ranges
}

export async function readEasyWorshipSchedule(
  file: File, encoding?: LegacySongEncoding, lookupBible?: EasyWorshipScriptureLookup,
): Promise<EasyWorshipSchedule> {
  const header = await file.slice(0, 38).text()
  const lookup = lookupBible ?? createEasyWorshipScriptureLookup()
  if (header.startsWith(LEGACY_SCHEDULE_HEADER) || /\.ews$/i.test(file.name)) {
    const { readEasyWorshipLegacySchedule } = await import('./easyWorshipLegacySchedule')
    const schedule = await readEasyWorshipLegacySchedule(file, encoding)
    return { ...schedule, cues: await scheduleScriptureBookNames(schedule.cues, lookup) }
  }
  const { BlobReader, BlobWriter, ZipReader } = await import('@zip.js/zip.js')
  const archive = new ZipReader(new BlobReader(file))

  try {
    const entries = await archive.getEntries()
    const databases = entries.filter((entry) => !entry.directory
      && entry.filename.replace(/\\/g, '/').split('/').pop()?.toLowerCase() === 'main.db')
    if (databases.length !== 1) throw new Error('ไฟล์ .ewsx ต้องมี main.db เพียงหนึ่งไฟล์')

    const main = databases[0] as FileEntry
    if (main.encrypted) throw new Error('main.db ในไฟล์ .ewsx ต้องใช้รหัสผ่าน')
    if (main.uncompressedSize > MAX_MAIN_DATABASE_BYTES) throw new Error('main.db ในไฟล์ .ewsx มีขนาดเกิน 128 MB')
    const blob = await main.getData(new BlobWriter(), { checkSignature: true })
      .catch(() => { throw new Error('อ่าน main.db จากไฟล์ .ewsx ไม่สำเร็จ') })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    if (!isEasyWorshipSqliteDatabase(bytes)) throw new Error('main.db ไม่ใช่ฐานข้อมูล SQLite ของ EasyWorship')
    const manifest = entries.filter((entry) => !entry.directory && entry !== main)
      .map((entry) => JSON.stringify([entry.filename, entry.uncompressedSize, entry.signature]))
      .sort()
    const SQL = await getEasyWorshipSql()
    const database = new SQL.Database(bytes)
    try {
      if (!schemaIsSupported(database)) throw new Error('ไฟล์ .ewsx นี้ไม่มีตารางกำหนดการ EasyWorship ที่รองรับ')
      const version = textOrNull(rows(database, 'SELECT version FROM info ORDER BY rowid LIMIT 1')[0]?.version)
      const hasGroupLevel = hasColumn(database, 'presentation', 'group_level')
      const feeds = readEasyWorshipLayoutFeeds(database)
      const hasAudioRepeating = hasColumn(database, 'resource_audio', 'repeating')
      const hasVideoRepeating = hasColumn(database, 'resource_video', 'repeating')
      const hasVideoAlpha = hasColumn(database, 'resource_video', 'alpha_channel_mode')
      const hasVideoPoster = hasColumn(database, 'resource_video', 'poster_frame_pos')
      const hasWebScrollbars = hasColumn(database, 'resource_web', 'remove_scroll_bars')
      const dvdClips = readEasyWorshipDvds(database, true)
      const elementPlayback = readEasyWorshipElementPlayback(database)
      const hiddenFeedElements = new Set(feeds.size && hasColumn(database, 'element_property_group', 'group_name')
        && hasTable(database, 'element_property')
        ? rows(database, `SELECT CAST(g.link_id AS TEXT) AS id FROM element_property_group g JOIN element_property p ON p.group_id = g.rowid
          WHERE g.group_name = 'Element' AND p.key = 'Hidden' AND lower(CAST(p.value AS TEXT)) IN ('1', 'true')`).map((row) => String(row.id)) : [])
      const clipPosition = (column: 'start_pos' | 'end_pos') => {
        const video = hasColumn(database, 'resource_video', column) ? `rv.${column}` : 'NULL'
        const audio = hasColumn(database, 'resource_audio', column) ? `ra.${column}` : 'NULL'
        return `CASE WHEN rv.resource_id IS NOT NULL THEN ${video} ELSE ${audio} END AS ${column}`
      }
      const sizes = [['resource_image', 'ri'], ['resource_video', 'rv'], ['resource_audio', 'ra'], ['resource_powerpoint', 'rp']]
        .map(([table, alias]) => hasColumn(database, table, 'filesize') ? `${alias}.filesize` : 'NULL')
      const presentations = rows(database,
        'SELECT rowid AS id, presentation_uid, presentation_type, order_index, title, author, copyright, administrator, reference_number, notes'
        + (hasColumn(database, 'presentation', 'description') ? ', description' : '')
        + (hasColumn(database, 'presentation', 'tags') ? ', tags' : '')
        + (hasGroupLevel ? ', group_level' : ', NULL AS group_level')
        + ' FROM presentation ORDER BY order_index'
        + (hasGroupLevel ? ', group_level' : '') + ', rowid')
      const slides = rows(database,
        'SELECT rowid AS id, presentation_id, title, order_index'
        + (hasColumn(database, 'slide', 'theme_id') ? ', theme_id' : '') + ' FROM slide ORDER BY presentation_id, order_index, rowid')
      const linkedThemes = new Set(slides.filter((slide) => numberOrZero(slide.theme_id) > 0).map((slide) => String(slide.theme_id)))
      const references = rows(database,
        "WITH refs AS ("
        + " SELECT rowid AS element_id, slide_id, element_uid, order_index, foreground_resource_id AS resource_id, 'foreground' AS role FROM element WHERE foreground_resource_id IS NOT NULL"
        + " UNION ALL SELECT rowid, slide_id, element_uid, order_index, background_resource_id AS resource_id, 'background' AS role FROM element WHERE background_resource_id IS NOT NULL"
        + ") SELECT CAST(refs.element_id AS TEXT) AS element_id, refs.slide_id, refs.element_uid, refs.role, CAST(refs.resource_id AS TEXT) AS resource_id, rt.rtf,"
        + " ri.original_filename AS image_filename, rv.original_filename AS video_filename,"
        + " ra.original_filename AS audio_filename, rp.original_filename AS powerpoint_filename,"
        + (hasAudioRepeating ? ' ra.repeating AS audio_repeats,' : '')
        + (hasVideoRepeating ? ' rv.repeating AS video_repeats,' : '')
        + (hasVideoAlpha ? ' rv.alpha_channel_mode,' : '')
        + (hasVideoPoster ? ' rv.poster_frame_pos,' : '')
        + ` ${clipPosition('start_pos')}, ${clipPosition('end_pos')},`
        + " rw.url AS web_url, f.filename AS packed_filename"
        + (hasColumn(database, 'file', 'file_hash') ? ', f.file_hash' : ', NULL AS file_hash')
        + `, COALESCE(${sizes.join(', ')}) AS file_size`
        + (hasWebScrollbars ? ', rw.remove_scroll_bars AS web_hide_scrollbars' : '')
        + " FROM refs LEFT JOIN resource_text rt ON rt.resource_id = refs.resource_id"
        + " LEFT JOIN resource_image ri ON ri.resource_id = refs.resource_id"
        + " LEFT JOIN resource_video rv ON rv.resource_id = refs.resource_id"
        + " LEFT JOIN resource_audio ra ON ra.resource_id = refs.resource_id"
        + " LEFT JOIN resource_powerpoint rp ON rp.resource_id = refs.resource_id"
        + " LEFT JOIN resource_web rw ON rw.resource_id = refs.resource_id"
        + " LEFT JOIN file f ON f.rowid = COALESCE(ri.file_id, rv.file_id, ra.file_id, rp.file_id)"
        + " ORDER BY refs.slide_id, refs.order_index, refs.role").map((reference) => {
          const dvd = dvdClips.get(String(reference.resource_id))
          const feed = feeds.get(String(reference.resource_id))
          const playback = elementPlayback.get(`${reference.element_id}:${reference.role}`)
          return {
            slideId: String(reference.slide_id),
            elementUid: textOrNull(reference.element_uid),
            // Verified EWSX video backgrounds use the foreground resource slot on
            // elements named BACKGROUND. The element semantics take precedence.
            role: textOrNull(reference.element_uid) === 'BACKGROUND' || reference.role === 'background'
              ? 'background'
              : 'foreground',
            rtf: textOrNull(reference.rtf),
            imageFilename: textOrNull(reference.image_filename),
            videoFilename: textOrNull(reference.video_filename),
            audioFilename: textOrNull(reference.audio_filename),
            repeat: readEasyWorshipMediaFlag(reference.video_repeats ?? reference.audio_repeats),
            playback,
            clip: readEasyWorshipMediaClip(reference.start_pos, reference.end_pos),
            posterSeconds: readEasyWorshipPosterSeconds(reference.poster_frame_pos),
            alphaMode: readEasyWorshipVideoAlpha(reference.alpha_channel_mode),
            powerpointFilename: textOrNull(reference.powerpoint_filename),
            webUrl: textOrNull(reference.web_url),
            dvd: dvd && dvdWithElementPlayback(dvd, playback),
            webHideScrollbars: Number(reference.web_hide_scrollbars) === 1,
            layerId: `${reference.element_id}-${reference.role}`,
            feedHidden: feed ? hiddenFeedElements.has(String(reference.element_id)) : undefined,
            feed: feed && easyWorshipFeedAsset(feed, reference.role === 'background' ? 'background' : 'foreground', playback),
            packedFilename: textOrNull(reference.packed_filename),
            fileHash: textOrNull(reference.file_hash),
            fileSize: reference.file_size,
          }
        }) as ResourceReference[]

      const slidesByCue = new Map<string, SqlRow[]>()
      for (const slide of slides) {
        const cueId = String(slide.presentation_id)
        const cueSlides = slidesByCue.get(cueId) ?? []
        cueSlides.push(slide)
        slidesByCue.set(cueId, cueSlides)
      }
      const referencesBySlide = new Map<string, ResourceReference[]>()
      for (const reference of references) {
        const slideReferences = referencesBySlide.get(reference.slideId) ?? []
        slideReferences.push(reference)
        referencesBySlide.set(reference.slideId, slideReferences)
      }

      const unsupported: EasyWorshipSchedule['unsupported'] = []
      const paths = getArchivePaths(entries.filter((entry) => !entry.directory) as FileEntry[])
      const { paths: externalMediaLocations, locate } = recordEasyWorshipExternalMediaLocations()
      const layers = readEasyWorshipLayouts(database, {
        schedule: true,
        dvdClips, feedSources: feeds,
        resolveAsset: (_kind, original, packed, hash, size) => {
          const entry = packed && paths.get(safeFilename(packed).toLowerCase())
          return { ...(entry ? { archivePath: entry.path } : {}), ...sourceMediaDetails(hash, size, locate(original)) }
        },
      })
      const layouts = new Map(layers.entries.map((entry) => [entry.layoutId, entry.content]))
      const scriptureRanges = readScriptureRanges(database)
      const editionIds = new Set([...scriptureRanges.values()].map(({ translationId }) => translationId))
      const editions = new Map(await Promise.all([...editionIds].map(async (id) => [id, await lookup(id).catch(() => null)] as const)))
      const restoredScripture: [string, string, string[]][] = []
      // Linked theme rows are layout dependencies. A standalone Feed can also use type 12.
      const scheduledPresentations = presentations.filter((presentation) => !isNestedScheduleGlobal(presentation) && !(
        numberOrZero(presentation.group_level) > 0 && linkedThemes.has(String(presentation.id))
        && [12, 13, 14].includes(numberOrZero(presentation.presentation_type))))
      const cues = scheduledPresentations.map((presentation) => {
        const id = String(presentation.id)
        const type = numberOrZero(presentation.presentation_type)
        const declaredKind = cueKind(type)
        const layout = layouts.get(id)
        const warnings: string[] = []
        const cueSlides = (slidesByCue.get(id) ?? []).map((slide, index) => {
          const formatted = layout?.slides[index]
          const referencesForSlide = referencesBySlide.get(String(slide.id)) ?? []
          const contentUid = declaredKind === 'song' ? 'CONTENT_SONG' : declaredKind === 'scripture' ? 'CONTENT_SCRIPTURE' : undefined
          const texts = referencesForSlide.filter((reference) => reference.rtf !== null && (!contentUid || reference.elementUid === contentUid))
          const cameraLayerIds = new Set(formatted?.design.layers.flatMap((layer) => layer.kind === 'camera' ? [layer.id] : []) ?? [])
          const assets = referencesForSlide.filter((reference) => !reference.feed || (!reference.feedHidden && !cameraLayerIds.has(reference.layerId)))
            .map((reference) => getAsset(reference, paths, locate))
            .filter((asset): asset is EasyWorshipScheduleAsset => asset !== undefined)
            .filter((asset) => asset.kind !== 'web' || !formatted?.design.layers.some((layer) =>
              layer.kind === 'web' && layer.url === asset.url && layer.role === asset.role))
            .filter((asset) => !asset.dvd || !formatted?.design.layers.some((layer) =>
              layer.kind === 'media' && layer.asset.dvd?.id === asset.dvd?.id))
          const soundtracks = formatted?.design.soundtracks
          if (!assets.some((asset) => asset.kind === 'audio')) {
            for (const track of soundtracks ?? []) {
              const archive = track.archivePath ? paths.get(safeFilename(track.archivePath).toLowerCase()) : undefined
              assets.push({ kind: 'audio', filename: track.filename, role: track.role, repeat: track.repeat,
                clip: track.clip, playback: track.playback, archivePath: track.archivePath, crc32: archive?.crc32,
                ...sourceMediaDetails(track.easyWorshipFileHash, track.easyWorshipFileSize, track.easyWorshipSourceLocationId),
                ...(track.inheritedFromMaster ? { inheritedFromMaster: true } : {}) })
            }
          }
          const missing = assets.filter((asset) => asset.kind !== 'web' && asset.kind !== 'camera' && !asset.dvd && !asset.archivePath)
            .map((asset) => 'ไม่พบไฟล์ ' + asset.filename + ' ใน .ewsx')
          if (referencesForSlide.some(({ webUrl }) => webUrl !== null && !presentationWebUrl(webUrl))) {
            missing.push('พบที่อยู่เว็บที่เปิดไม่ได้ใน .ewsx')
          }
          const sourceLabel = textOrNull(slide.title)
          const recoveredSongLabel = !sourceLabel && declaredKind === 'song' ? formatted?.songLabel : undefined
          const fallbackLabel = `Slide ${index + 1}`
          let label = sourceLabel ?? recoveredSongLabel ?? fallbackLabel
          let lines = texts.flatMap((reference) => displayTextFromEasyWorshipRtf(reference.rtf ?? '').split('\n').filter(Boolean))
          let design = formatted?.design
          if (design?.soundtracks) {
            const { soundtracks: _soundtracks, ...visual } = design
            design = visual
          }
          const scriptureRange = scriptureRanges.get(String(slide.id))
          let scriptureRecovery: EasyWorshipScheduleSlide['scriptureRecovery']
          let scriptureVerseStarts: ScriptureVerseStart[] | undefined
          if (declaredKind === 'scripture') {
            const edition = scriptureRange && editions.get(scriptureRange.translationId)
            const passage = scriptureRange && edition ? resolveEasyWorshipScriptureRange(scriptureRange, edition) : undefined
            const unresolvedLabel = sourceLabel ?? textOrNull(presentation.title) ?? label
            label = sourceLabel ?? passage?.label ?? unresolvedLabel
            const needsText = !lines.length
            if (needsText && passage?.lines.length) {
              lines = passage.lines
              if (design) design = fillScriptureDesignText(design, lines.join('\n'))
            } else if (needsText) {
              missing.push(missingScriptureText(label, !edition ? scriptureRange?.translationId : undefined))
            }
            if (passage?.lines.length && lines.join('\n') === passage.lines.join('\n')) {
              scriptureVerseStarts = passage.verseStarts
            }
            if (passage && (needsText && lines.length || !sourceLabel)) {
              restoredScripture.push([String(slide.id), label, lines])
              scriptureRecovery = { fallbackLabel: unresolvedLabel, missingText: needsText && lines.length > 0, replaceLabel: !sourceLabel }
            }
            if (scriptureVerseStarts?.length) {
              scriptureRecovery ??= { fallbackLabel: unresolvedLabel, missingText: false, replaceLabel: false }
            }
          }
          return {
            id: String(slide.id),
            order: numberOrZero(slide.order_index),
            label, lines, assets,
            ...(recoveredSongLabel && recoveredSongLabel !== fallbackLabel ? { previousSongLabel: fallbackLabel } : {}),
            warnings: missing,
            ...(design && (design.layers.length || (declaredKind === 'presentation' && formatted?.template)) ? { design } : {}),
            ...(declaredKind === 'presentation' && formatted?.template ? { template: formatted.template } : {}),
            ...(scriptureRange ? { scriptureRange } : {}),
            ...(scriptureVerseStarts ? { scriptureVerseStarts } : {}),
            ...(scriptureRecovery ? { scriptureRecovery } : {}),
            ...(formatted?.advanceMs ? { advanceMs: formatted.advanceMs } : {}),
            ...(formatted?.transition ? { transition: formatted.transition } : {}),
            ...(formatted?.playback ? { playback: formatted.playback } : {}),
          }
        })
        const firstAsset = cueSlides[0]?.assets[0]
        const liveOnly = (firstAsset?.kind === 'camera' || firstAsset?.kind === 'web') && cueSlides.every((slide) =>
          !slide.lines.length && slide.assets.length > 0 && slide.assets.every((asset) =>
            asset.kind === firstAsset.kind && asset.role === 'foreground'))
        const audioOnly = firstAsset?.kind === 'audio' && cueSlides.every((slide) =>
          !slide.lines.length && slide.assets.length > 0 && slide.assets.every((asset) => asset.kind === 'audio' && !asset.inheritedFromMaster))
        const dvdOnly = firstAsset?.dvd && cueSlides.every((slide) =>
          !slide.lines.length && slide.assets.length > 0 && slide.assets.every((asset) => asset.dvd))
        const kind: EasyWorshipScheduleCue['kind'] = declaredKind === 'song' || declaredKind === 'scripture' ? declaredKind
          : liveOnly ? firstAsset.kind : audioOnly ? 'audio' : dvdOnly ? 'video' : declaredKind
        if (kind === 'unknown') {
          const message = 'ชนิดกำหนดการ EasyWorship ' + type + ' ยังไม่รองรับ'
          warnings.push(message)
          unsupported.push({ cueId: id, message })
        }
        if (cueSlides.length === 0) warnings.push('กำหนดการนี้ไม่มีสไลด์ที่อ่านได้')
        if (cueSlides.some((slide) => slide.assets.some((asset) => asset.kind !== 'camera' && asset.kind !== 'web'))) {
          warnings.push('นำเข้าการอ้างอิงสื่อแล้ว การเล่นขึ้นอยู่กับไฟล์ในตารางและตัวแปลงสัญญาณของเบราว์เซอร์')
        }
        if (layout?.warnings) warnings.push(...layout.warnings)
        const description = textOrNull(presentation.description)
        const tags = textOrNull(presentation.tags)
        return {
          id,
          order: numberOrZero(presentation.order_index),
          kind,
          label: textOrNull(presentation.title) ?? 'Untitled cue ' + id,
          slides: cueSlides,
          ...(layout?.looping ? { looping: true } : {}),
          metadata: {
            presentationUid: textOrNull(presentation.presentation_uid),
            type,
            author: textOrNull(presentation.author),
            copyright: textOrNull(presentation.copyright),
            administrator: textOrNull(presentation.administrator),
            ...(description ? { description } : {}),
            ...(tags ? { tags } : {}),
            referenceNumber: textOrNull(presentation.reference_number),
            notes: textOrNull(presentation.notes),
            groupLevel: hasGroupLevel && typeof presentation.group_level === 'number'
              ? presentation.group_level
              : null,
          },
          warnings,
        }
      })
      const cameraAssets = references.flatMap((reference) => reference.feed ? [reference.feed] : [])
      const hasDeviceHints = cameraAssets.some((asset) => asset.deviceHints?.length)
      const hasSplitAlpha = cues.some((cue) => cue.slides.some((slide) =>
        slide.assets.some((asset) => asset.alphaMode) || slide.design?.layers.some((layer) => layer.kind === 'media' && !layer.inheritedFromMaster && layer.asset.alphaMode)))
      const sourceFormat = cameraAssets.length ? 'easyworship-schedule-with-feeds' : 'easyworship-schedule'
      const originalId = await importIdentity([
        sourceFormat, ...(hasDeviceHints ? ['feed-device-names-v1'] : []), ...(hasSplitAlpha ? ['video-alpha-v1'] : []), ...manifest,
      ], bytes)
      const previousScriptureImportId = restoredScripture.length
        ? await importIdentity(['easyworship-schedule-scripture-v1', originalId, restoredScripture])
        : undefined
      const rejectedPackedMedia = await verifyEasyWorshipPackedMedia(cues, entries.filter((entry) => !entry.directory) as FileEntry[])
      return { source: { filename: file.name, version, importId: originalId, previousScriptureImportId },
        cues: await scheduleScriptureBookNames(cues, lookup, editions), unsupported,
        ...(externalMediaLocations.size ? { externalMediaLocations } : {}),
        ...(rejectedPackedMedia.size ? { rejectedPackedMedia } : {}) }
    } finally {
      database.close()
    }
  } finally {
    await archive.close()
  }
}
