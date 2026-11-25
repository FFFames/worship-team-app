/** Checks the shared-library snapshot packed with a full WorshipTeam backup. */

import { SECTION_LABELS, type Playlist, type PlaylistSong, type Song, type VideoBackground } from '../types/database'
import type { LibraryDesign, SlideDesign } from '../types/slideDesign'
import { presentationWebUrl } from './livePresentation'
import { validLyricRuns, validPlaylistCue, validPreparedSongLayouts, validSlideAsset, validSlideDesign, validSlidePlayback, validSlideTransition, validSongAppearance } from './playlistPackageManifest'
import { playlistMediaReferences } from './playlistMediaRecovery'
import { safeScheduleMediaPath } from './scheduleMedia'
import { songLayoutMedia } from './songSlideLayout'
import { validOptionalEasyWorshipUid } from './easyWorshipSongIdentity'
import { validOptionalSpeakerNotes } from './speakerNotes'

export type LibraryCatalog = {
  songs: Omit<Song, 'user_id'>[]
  designs: LibraryDesign[]
  playlists: Omit<Playlist, 'user_id'>[]
  entries: Omit<PlaylistSong, 'song'>[]
  backgrounds: VideoBackground[]
}
export type CatalogDescriptor = Record<keyof LibraryCatalog, number> & { size: number; missingMedia: string[] }
export const catalogBackupPath = 'catalog/records.json'
export const maxCatalogBytes = 128 * 1024 ** 2

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const isId = (value: unknown): value is string => typeof value === 'string' && uuid.test(value)
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && !value.includes('\0')
const texts = (value: unknown): value is string[] => Array.isArray(value) && value.every(text)
const nullableText = (value: unknown) => value == null || text(value)
const date = (value: unknown) => text(value) && Number.isFinite(Date.parse(value))
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value)
const postgresInteger = (value: unknown): value is number => integer(value) && value >= -2147483648 && value <= 2147483647

const shape = {
  songs: ['id', 'title', 'artist', 'original_key', 'tempo', 'time_signature', 'youtube_url', 'copyright', 'copyright_administrator',
    'ccli_number', 'easyworship_uid', 'easyworship_words_id', 'easyworship_words_record_id', 'easyworship_import_id', 'description', 'appearance', 'raw_content',
    'sections', 'tags', 'favorite', 'created_at', 'updated_at'],
  designs: ['id', 'title', 'kind', 'content', 'created_at'],
  playlists: ['id', 'name', 'date', 'notes', 'created_at', 'updated_at'],
  entries: ['id', 'playlist_id', 'song_id', 'transpose', 'order', 'created_at', 'cue', 'background_asset', 'slide_theme'],
  backgrounds: ['id', 'name', 'url', 'is_default', 'created_at'],
} as const satisfies Record<keyof LibraryCatalog, readonly string[]>

export const catalogColumns = shape
const tables = Object.keys(shape) as (keyof LibraryCatalog)[]

export function getCatalogDescriptor(catalog: LibraryCatalog, size: number, missingMedia: string[]): CatalogDescriptor {
  return { songs: catalog.songs.length, designs: catalog.designs.length, playlists: catalog.playlists.length,
    entries: catalog.entries.length, backgrounds: catalog.backgrounds.length, size, missingMedia }
}

export function validCatalogDescriptor(value: unknown): value is CatalogDescriptor {
  return record(value) && integer(value.size) && value.size > 0 && value.size <= maxCatalogBytes && texts(value.missingMedia)
    && tables.every((key) => { const count = value[key]; return integer(count) && count >= 0 })
}

function catalogAsset(value: unknown, kinds: readonly string[]) {
  return validSlideAsset(value, kinds)
    && (value.libraryId === undefined || isId(value.libraryId))
    && (value.archivePath === undefined || (text(value.archivePath) && Boolean(safeScheduleMediaPath(value.archivePath))))
    && (value.sourcePath === undefined || text(value.sourcePath))
}

function design(value: unknown) { return validSlideDesign(value, catalogAsset) }

function designSource(value: unknown) {
  return value === undefined || (record(value) && (value.format === 'easyworship' || value.format === 'powerpoint') && text(value.uid)
    && [value.catalogUid, value.author, value.copyright, value.description].every(nullableText)
    && (value.collectionDetails === undefined || (record(value.collectionDetails)
      && Object.values(value.collectionDetails).every(text))))
}

function songSections(value: unknown) {
  return value === null || (Array.isArray(value) && value.every((section) => {
    if (!record(section) || !text(section.type) || !Object.prototype.hasOwnProperty.call(SECTION_LABELS, section.type)
      || !nullableText(section.label) || (section.slideLabel !== undefined && !text(section.slideLabel))
      || !text(section.marker) || !Array.isArray(section.lines)) return false
    if (!section.lines.every((line) => record(line) && text(line.lyrics) && text(line.chords))) return false
    const lyrics = section.lines.map((line: { lyrics: string }) => line.lyrics).join('\n')
    return validLyricRuns(section.lyricRuns, lyrics) && validPreparedSongLayouts(section.slideLayouts, lyrics.length, catalogAsset)
      && (section.transition == null || validSlideTransition(section.transition))
      && (section.playback === undefined || validSlidePlayback(section.playback))
      && (section.slideBreaks == null || (Array.isArray(section.slideBreaks) && section.slideBreaks.every(postgresInteger)))
  }))
}

const valid = {
  songs: (row: Record<string, unknown>) => text(row.title) && text(row.original_key) && text(row.raw_content) && songSections(row.sections)
    && validOptionalEasyWorshipUid(row.easyworship_uid)
    && (row.easyworship_words_id == null || isId(row.easyworship_words_id))
    && (row.easyworship_words_record_id == null || (isId(row.easyworship_words_record_id) && isId(row.easyworship_words_id)))
    && (row.easyworship_import_id == null || (isId(row.easyworship_import_id)
      && isId(row.easyworship_words_id) && (row.id === row.easyworship_words_id || row.id === row.easyworship_words_record_id)
      && row.id !== row.easyworship_import_id))
    && (row.appearance == null || validSongAppearance(row.appearance, design, catalogAsset))
    && [row.artist, row.time_signature, row.youtube_url, row.copyright, row.copyright_administrator, row.ccli_number, row.description].every(nullableText)
    && (row.tempo == null || postgresInteger(row.tempo)) && (row.favorite == null || typeof row.favorite === 'boolean')
    && (row.tags === null || texts(row.tags)) && date(row.updated_at),
  designs: (row: Record<string, unknown>) => text(row.title) && text(row.kind)
    && ['presentation', 'song-theme', 'scripture-theme', 'presentation-theme', 'text-theme'].includes(row.kind)
    && record(row.content) && designSource(row.content.source) && (row.content.warnings === undefined || texts(row.content.warnings))
    && validOptionalSpeakerNotes(row.content.notes)
    && Array.isArray(row.content.slides) && row.content.slides.length > 0
    && row.content.slides.every((slide) => record(slide) && text(slide.id) && text(slide.label) && design(slide.design)
      && validOptionalSpeakerNotes(slide.speakerNotes)
      && (slide.playback === undefined || validSlidePlayback(slide.playback))
      && (slide.transition === undefined || validSlideTransition(slide.transition))
      && (slide.transitionEdited === undefined || slide.transitionEdited === true)),
  playlists: (row: Record<string, unknown>) => text(row.name) && nullableText(row.date) && nullableText(row.notes) && date(row.updated_at),
  entries: (row: Record<string, unknown>) => isId(row.playlist_id) && (row.song_id === null || isId(row.song_id))
    && postgresInteger(row.order) && postgresInteger(row.transpose)
    && (row.cue == null ? isId(row.song_id) : validPlaylistCue(row.cue, catalogAsset) && (row.song_id === null || row.cue.kind === 'song'))
    && (row.background_asset == null || (catalogAsset(row.background_asset, ['image', 'video']) && record(row.background_asset)
      && row.background_asset.role === 'background' && isId(row.background_asset.libraryId)))
    && (row.slide_theme == null || (record(row.slide_theme) && text(row.slide_theme.title) && design(row.slide_theme.design)
      && (row.slide_theme.transition === undefined || validSlideTransition(row.slide_theme.transition)))),
  backgrounds: (row: Record<string, unknown>) => text(row.name) && text(row.url) && Boolean(presentationWebUrl(row.url))
    && typeof row.is_default === 'boolean',
}

export function parseLibraryCatalog(value: unknown, descriptor?: CatalogDescriptor): LibraryCatalog {
  if (!record(value)) throw new Error('รายการฐานข้อมูลในแพ็กเกจไม่ถูกต้อง')
  const catalog = Object.fromEntries(tables.map((key) => {
    const rows = value[key]
    if (!Array.isArray(rows) || (descriptor && rows.length !== descriptor[key])) throw new Error(`จำนวนรายการฐานข้อมูล ${key} ไม่ตรงกับแพ็กเกจ`)
    const ids = new Set<string>()
    const checked = rows.map((row: unknown) => {
      if (!record(row) || !isId(row.id) || ids.has(row.id) || !date(row.created_at) || !valid[key](row)) {
        throw new Error(`ข้อมูลฐานข้อมูล ${key} ในแพ็กเกจไม่ถูกต้อง`)
      }
      ids.add(row.id)
      return Object.fromEntries(shape[key].filter((field) => field in row).map((field) => [field, row[field]]))
    })
    return [key, checked]
  })) as LibraryCatalog
  const songs = new Set(catalog.songs.map(({ id }) => id))
  const playlists = new Set(catalog.playlists.map(({ id }) => id))
  if (catalog.entries.some((entry) => !playlists.has(entry.playlist_id) || (entry.song_id !== null && !songs.has(entry.song_id)))) {
    throw new Error('รายการในตารางอ้างถึงเพลงหรือเพลย์ลิสต์ที่ไม่อยู่ในแพ็กเกจ')
  }
  return catalog
}

export function missingCatalogMedia(catalog: LibraryCatalog, libraryIds: ReadonlySet<string>, schedulePaths: ReadonlySet<string>) {
  const missing = new Set<string>()
  const check = (asset: { filename: string; libraryId?: string; archivePath?: string; sourcePath?: string }, playlistId?: string) => {
    const library = asset.libraryId && libraryIds.has(asset.libraryId)
    const attachment = playlistId && asset.archivePath && schedulePaths.has(`${playlistId}\0${safeScheduleMediaPath(asset.archivePath)}`)
    if ((asset.libraryId || asset.sourcePath || asset.archivePath) && !library && !attachment) missing.add(asset.filename)
  }
  const checkDesign = (value?: SlideDesign) => {
    value?.layers.forEach((layer) => { if (layer.kind === 'media') check(layer.asset) })
    value?.soundtracks?.forEach((track) => check(track))
  }
  catalog.designs.forEach(({ content }) => content.slides.forEach((slide) => checkDesign(slide.design)))
  catalog.songs.forEach(({ appearance, sections }) => {
    checkDesign(appearance?.defaultDesign)
    appearance?.sections?.forEach(({ design: style }) => checkDesign(style))
    songLayoutMedia(appearance?.slideLayout).forEach((asset) => check(asset))
    sections?.forEach(({ slideLayouts }) => slideLayouts?.forEach(({ layout }) =>
      songLayoutMedia(layout).forEach((asset) => check(asset))))
  })
  playlistMediaReferences(catalog.entries).forEach(({ asset, playlistId }) => check(asset, playlistId))
  return [...missing].sort((left, right) => left.localeCompare(right, 'th'))
}
