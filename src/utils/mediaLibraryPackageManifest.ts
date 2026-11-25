/** Validates media-library backups before any local writes. */

import type { DvdClip } from '../types/dvdClip'
import type { LiveFeed } from '../types/liveFeed'
import type { MediaLibraryItem } from '../types/media'
import type { ScriptureEdition } from '../types/scripture'
import { alertOutputLabels, type AlertResourceCatalog, type AlertTemplate } from '../types/alertTemplate'
import { localCollectionSet } from './collectionLibrary'
import { themeOutputs, defaultThemeSubjects, type OutputDefaultThemes } from './defaultThemes'
import { dvdThumbnailUrl } from './dvdThumbnail'
import { validOptionalSpeakerNotes } from './speakerNotes'
import { isDvdFit } from './dvdPlayback'
import { isMediaPlaybackForKind } from './mediaPlayback'
import type { DvdReplacement } from './dvdReplacement'
import type { EasyWorshipCollectionSet } from './easyWorshipCollections'
import type { SongHistory, SongHistorySong } from './easyWorshipSongHistory'
import { libraryMediaExtension, libraryMediaMime } from './mediaLibrary'
import { validCatalogDescriptor, type CatalogDescriptor } from './libraryCatalogBackup'
import { isMidiNumber, midiActions, midiBindingKey } from './midiControls'
import { isMidiOutputAction } from './midiOutput'
import { nurseryOutputs, validNurseryStyle, type NurserySettings } from './nurseryAlerts'
import { messageAlertOutputs, validMessageAlertStyle, type MessageAlertSettings } from './messageAlertSettings'
import { isOutputMargin, isScriptureOutputSettings, outputAppearanceKeys, outputSides, type OutputAppearance } from './outputSettings'
import { validFoldbackAppearance, validFoldbackContentSettings, validFoldbackServiceSettings } from './foldbackAppearance'
import { validServiceInterval } from './serviceIntervals'
import { validDesignTextRun, validSlideAsset, validSlideDesign, validSlidePlayback, validSlideTransition } from './playlistPackageManifest'
import type { PresentationControlBackup } from './presentationControlBackup'
import { isKeyboardBinding, keyboardActions } from './presentationKeyboard'
import { safeScheduleMediaPath } from './scheduleMedia'
import { localSongHistoryId } from './songHistoryLibrary'
import { splitVideoAlpha } from './videoAlpha'

export const mediaPackageMaxFiles = 10_000
export const mediaPackageMaxManifest = 32 * 1024 ** 2
export const mediaPackageMaxScripture = 128 * 1024 ** 2
const mediaPackageMaxHistory = 128 * 1024 ** 2

type PackageAsset = { id: string; mime: string; size: number; library: boolean }
type PackagePresentationSettings = { scriptureEditions: PackageScripture[]; alertTemplates: AlertTemplate[]; songHistories: PackageSongHistory[]
  defaultThemes: OutputDefaultThemes; presentationControls: PresentationControlBackup }
export type PackageScheduleAsset = { playlistId: string; archivePath: string; assetId: string; mime: string }
export type PackageScripture = { id: string; name: string; abbreviation: string; size: number }
export type PackageSongHistory = { id: string; name: string; savedAt: number; size: number; actions: number }
export type MediaLibraryPackage = {
  format: 'worshipteam.media-library'
  items: MediaLibraryItem[]
  assets: PackageAsset[]
  scheduleAssets: PackageScheduleAsset[]
  feeds: LiveFeed[]
  dvds: DvdClip[]
  replacements: { dvdId: string; replacement: DvdReplacement }[]
  collectionSets: EasyWorshipCollectionSet[]
} & (
  { version: 1; scriptureEditions?: never; alertTemplates?: never; songHistories?: never; defaultThemes?: never; presentationControls?: never }
  | { version: 2; scriptureEditions: PackageScripture[]; alertTemplates?: never; songHistories?: never; defaultThemes?: never; presentationControls?: never }
  | { version: 3; scriptureEditions: PackageScripture[]; alertTemplates: AlertTemplate[]; songHistories?: never; defaultThemes?: never; presentationControls?: never }
  | { version: 4; scriptureEditions: PackageScripture[]; alertTemplates: AlertTemplate[]; songHistories: PackageSongHistory[]; defaultThemes?: never; presentationControls?: never }
  | { version: 5; scriptureEditions: PackageScripture[]; alertTemplates: AlertTemplate[]; songHistories: PackageSongHistory[]; defaultThemes: OutputDefaultThemes; presentationControls?: never }
  | ({ version: 6 } & PackagePresentationSettings)
  | ({ version: 7; outputAppearance: OutputAppearance } & PackagePresentationSettings)
  | ({ version: 8; outputAppearance: OutputAppearance; nurserySettings: NurserySettings } & PackagePresentationSettings)
  | ({ version: 9; outputAppearance: OutputAppearance; messageAlertSettings: MessageAlertSettings } & PackagePresentationSettings)
  | ({ version: 10; outputAppearance: OutputAppearance; alertResourceCatalogs: AlertResourceCatalog[] } & PackagePresentationSettings)
  | ({ version: 11; outputAppearance: OutputAppearance; catalog: CatalogDescriptor } & PackagePresentationSettings)
) & { outputAppearance?: OutputAppearance; nurserySettings?: NurserySettings; messageAlertSettings?: MessageAlertSettings;
  alertResourceCatalogs?: AlertResourceCatalog[]; catalog?: CatalogDescriptor }

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && !v.includes('\0')
const name = (v: unknown): v is string => text(v) && Boolean(v.trim())
const identifier = (v: unknown): v is string => name(v) && !['__proto__', 'constructor', 'prototype'].includes(v)
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const integer = (v: unknown): v is number => number(v) && Number.isSafeInteger(v)
const bool = (v: unknown): v is boolean => typeof v === 'boolean'
const absent = (v: unknown, valid: (v: unknown) => boolean) => v === undefined || valid(v)
const nullable = (v: unknown, valid: (v: unknown) => boolean) => v === null || valid(v)
const list = (v: unknown, valid: (v: unknown) => boolean) => Array.isArray(v) && v.every(valid)
const mediaId = (v: unknown): v is string => typeof v === 'string' && uuid.test(v)
const choice = (v: unknown, options: string[]) => text(v) && options.includes(v)
const alphaMode = (v: unknown) => Boolean(splitVideoAlpha(v))
const subtitle = (v: unknown) => nullable(v, (value) => integer(value) && value >= 1 && value <= 32)
const metadata = (v: unknown) => object(v) && Object.values(v).every((value) => value === null || text(value) || number(value) || bool(value))
const dictionary = (v: unknown, valid: (v: unknown) => boolean) => object(v) && Object.entries(v).every(([key, value]) => identifier(key) && valid(value))
const themeSlots = new Set<string>(themeOutputs.flatMap((output) => defaultThemeSubjects.map((subject) => `${output}:${subject}`)))

function requireValid(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function unique(v: unknown[], key: string) {
  const ids = v.map((value) => object(value) ? value[key] : undefined)
  return ids.every(identifier) && new Set(ids).size === ids.length
}

function clip(v: unknown) {
  return object(v) && [v.startSeconds, v.endSeconds, v.endTrimSeconds].every((value) => absent(value, (n) => number(n) && n >= 0))
}

function validDvd(v: unknown) {
  if (!object(v) || !identifier(v.id) || !name(v.name)) return false
  const { discName, discUid, sourceFolder, repeat, lastChapter, thumbnail, playback } = v
  return [discName, discUid, sourceFolder].every((n) => absent(n, text))
    && [v.title, v.chapter, v.angle, v.audioTrack, v.subtitleTrack, v.segmentStart, v.segmentDuration, v.frameRateFlag]
      .every((part) => absent(part, (n) => integer(n) && n >= 0))
    && absent(lastChapter, (n) => nullable(n, (m) => integer(m) && m >= 1 && m <= 99))
    && absent(repeat, bool) && absent(v.subtitleSelection, subtitle)
    && absent(thumbnail, (n) => n === null || Boolean(dvdThumbnailUrl(n)))
    && absent(v.clip, clip) && absent(v.metadata, (n) => dictionary(n, text))
    && absent(playback, (n) => object(n) && absent(n.volume, (m) => number(m) && m >= 0 && m <= 1)
      && absent(n.muted, bool) && absent(n.fit, isDvdFit))
}

function rule(v: unknown) {
  return object(v) && identifier(v.id) && text(v.field) && nullable(v.operator, integer)
    && nullable(v.value, text) && nullable(v.secondValue, text)
}

function group(v: unknown) {
  return object(v) && identifier(v.id) && text(v.name) && nullable(v.parentId, identifier) && nullable(v.ownerId, text)
    && nullable(v.nativeType, integer) && list(v.path, text)
    && absent(v.resource, (n) => choice(n, ['songs', 'scripture', 'media', 'presentations', 'themes', 'scripture-downloads']))
    && absent(v.scope, (n) => choice(n, ['shared', 'personal'])) && bool(v.rulesEnabled)
    && list(v.rules, rule) && nullable(v.matchType, integer) && list(v.inclusions, identifier) && list(v.exclusions, identifier)
    && nullable(v.cachedResults, (n) => list(n, identifier)) && nullable(v.cachedVersion, integer)
    && list(v.songIds, identifier) && integer(v.unresolvedSongs) && v.unresolvedSongs >= 0
    && absent(v.resourceItems, (n) => dictionary(n, identifier)) && absent(v.resourceOverrides, (n) => dictionary(n, identifier))
}

function validCollectionEdit(edit: unknown) {
  return object(edit) && name(edit.name) && nullable(edit.parentId, identifier) && identifier(edit.revision)
    && absent(edit.definition, (d) => object(d) && (d.matchType === 0 || d.matchType === 1)
      && list(d.rules, rule) && list(d.inclusions, identifier) && list(d.exclusions, identifier))
}

function validCollectionSet(v: unknown) {
  if (!object(v) || !(v.id === localCollectionSet || mediaId(v.id)) || !text(v.name)
    || !text(v.filename) || !list(v.warnings, text) || !Array.isArray(v.collections)
    || !unique(v.collections, 'id') || !v.collections.every(group)) return false
  const songs = new Set(v.collections.filter((n) => n.resource === 'songs').map((n) => n.id))
  const ids = new Set(v.collections.map((item) => item.id))
  return absent(v.songEdits, (edits) => dictionary(edits, validCollectionEdit))
    && Object.keys(v.songEdits ?? {}).every((id) => songs.has(id))
    && absent(v.collectionEdits, (edits) => dictionary(edits, validCollectionEdit))
    && Object.keys(v.collectionEdits ?? {}).every((id) => ids.has(id))
    && absent(v.removedCollections, (values) => list(values, (id) => identifier(id) && ids.has(id)))
}

function validAlertToken(v: unknown) {
  return object(v) && identifier(v.id) && text(v.name)
    && [v.uid, v.format, v.timeValue, v.fixedTime].every((part) => nullable(part, text))
    && [v.type, v.interval, v.allowOverrun].every((part) => nullable(part, integer))
    && absent(v.value, (part) => nullable(part, text))
}

function validAlertResourceCatalog(v: unknown) {
  if (!object(v) || !mediaId(v.id) || !name(v.sourceName) || !Array.isArray(v.serviceIntervals)
    || !v.serviceIntervals.every(validServiceInterval) || !Array.isArray(v.tokens) || (!v.tokens.length && !v.serviceIntervals.length)) return false
  const ids = new Set<unknown>()
  return v.tokens.every((entry) => {
    if (!object(entry) || !choice(entry.output, Object.keys(alertOutputLabels)) || !object(entry.token)
      || !validAlertToken(entry.token) || ids.has(entry.token.id)) return false
    ids.add(entry.token.id)
    return true
  })
}

function validAlertTemplate(v: unknown) {
  return object(v) && mediaId(v.id) && name(v.title) && text(v.text)
    && text(v.output) && Object.prototype.hasOwnProperty.call(alertOutputLabels, v.output)
    && (v.runs === undefined || (Array.isArray(v.runs) && v.runs.every(validDesignTextRun)
      && v.runs.map((run) => run.text).join('') === v.text))
    && absent(v.tokenSettings, (s) => object(s) && nullable(s.endToken, text)
      && Array.isArray(s.tokens) && s.tokens.every(validAlertToken) && unique(s.tokens, 'id')
      && absent(s.serviceIntervals, (part) => list(part, validServiceInterval)))
    && absent(v.playback, (p) => object(p) && choice(p.mode, ['static', 'scroll', 'when-needed'])
      && choice(p.alignment, ['left', 'center', 'right']) && nullable(p.passes, (n) => integer(n) && n >= 1 && n <= 9)
      && absent(p.endOnToken, bool))
    && absent(v.source, (s) => object(s) && text(s.profileName) && identifier(s.rowId) && typeof s.rtf === 'string'
      && [s.displayType, s.alignment, s.endType, s.repeatCount].every((part) => nullable(part, integer))
      && nullable(s.endToken, text) && list(s.tokens, validAlertToken)
      && absent(s.serviceIntervals, (part) => list(part, validServiceInterval)))
}

function validDefaultTheme(v: unknown, assets: ReadonlyMap<string, PackageAsset>) {
  if (v === null) return true
  if (!object(v) || !identifier(v.id) || !name(v.title) || !Array.isArray(v.slides) || !v.slides.length
    || !unique(v.slides, 'id') || !absent(v.looping, bool)) return false
  function validAsset(asset: unknown, kinds: readonly string[]): boolean {
    if (!validSlideAsset(asset, kinds) || !absent(asset.sourcePath, text)
      || !absent(asset.archivePath, (v) => text(v) && safeScheduleMediaPath(v) === v)) return false
    if (asset.libraryId === undefined) return true
    if (!mediaId(asset.libraryId)) return false
    const file = assets.get(asset.libraryId)
    return !file || !file.library || file.mime.startsWith(asset.kind + '/')
  }
  return v.slides.every((slide) => object(slide) && text(slide.label) && absent(slide.template, text) && absent(slide.advanceMs, integer)
    && validOptionalSpeakerNotes(slide.speakerNotes) && absent(slide.transition, validSlideTransition) && absent(slide.transitionEdited, (value) => value === true)
    && absent(slide.playback, validSlidePlayback) && validSlideDesign(slide.design, validAsset))
}

function validPresentationControls(v: unknown, allowEmpty: boolean): boolean {
  if (!object(v)) return false
  const keys = Object.keys(v)
  if ((!allowEmpty && !keys.length) || !keys.every((key) => ['keyboard', 'midiInput', 'midiOutput'].includes(key))) return false
  const channel = (n: unknown) => isMidiNumber(n) && n >= 1 && n <= 16
  const usedBindings = new Set<string>()
  return absent(v.keyboard, (k) => k === null || (object(k) && Object.keys(k).length === 2 && name(k.name) && object(k.bindings)
    && Object.entries(k.bindings).every(([key, command]) => isKeyboardBinding(key)
      && text(command) && Object.prototype.hasOwnProperty.call(keyboardActions, command))))
    && absent(v.midiInput, (m) => object(m) && Object.keys(m).length === 3 && nullable(m.channel, channel)
      && bool(m.followMaster) && object(m.bindings) && Object.entries(m.bindings).every(([key, binding]) => {
        if (!Object.prototype.hasOwnProperty.call(midiActions, key) || !object(binding) || Object.keys(binding).length !== 2
          || (binding.kind !== 'note' && binding.kind !== 'control') || !isMidiNumber(binding.number)) return false
        const id = midiBindingKey({ kind: binding.kind, number: binding.number })
        if (usedBindings.has(id)) return false
        usedBindings.add(id)
        return true
      }))
    && absent(v.midiOutput, (m) => object(m) && Object.keys(m).length === 4 && channel(m.channel) && bool(m.forwardInput)
      && object(m.groups) && Object.keys(m.groups).length === 3 && [m.groups.schedule, m.groups.overlays, m.groups.playback].every(bool)
      && object(m.notes) && Object.entries(m.notes).every(([key, note]) => isMidiOutputAction(key) && isMidiNumber(note)))
}

function validOutputAppearance(v: unknown, allowEmpty: boolean): boolean {
  if (!object(v)) return false
  const fields = Object.entries(v)
  return (allowEmpty || fields.length > 0) && fields.every(([key, value]) => {
    if (!outputAppearanceKeys.some((known) => known === key) || !object(value)) return false
    if (key === 'alternateLayers') return Object.keys(value).length === 2 && bool(value.background) && bool(value.foreground)
    if (key === 'songLabels') return Object.keys(value).length === 2 && bool(value.live) && bool(value.alternate)
    if (key === 'scripture') return Object.keys(value).length === 2 && isScriptureOutputSettings(value.live) && isScriptureOutputSettings(value.alternate)
    if (key === 'foldback') return validFoldbackAppearance(value)
    if (key === 'foldbackService') return validFoldbackServiceSettings(value)
    if (key === 'foldbackContent') return validFoldbackContentSettings(value)
    return Object.keys(value).length === outputSides.length && outputSides.every((side) => isOutputMargin(value[side]))
  })
}

export function missingDefaultThemeMedia(manifest: MediaLibraryPackage): string[] {
  if (!manifest.defaultThemes) return []
  const media = new Map(manifest.assets.filter(({ library }) => library).map(({ id, mime }) => [id, mime]))
  const replacements = new Map(manifest.replacements.map(({ dvdId, replacement }) => [dvdId, replacement.assetId]))
  const missing = new Set<string>()
  for (const theme of Object.values(manifest.defaultThemes)) {
    for (const { design } of theme?.slides ?? []) {
      const files = [...design.layers.flatMap((layer) => layer.kind === 'media' ? [layer.asset] : []), ...(design.soundtracks ?? [])]
      for (const asset of files) {
        const replacement = 'dvd' in asset && asset.dvd ? replacements.get(asset.dvd.id) : undefined
        const assetId = replacement ?? asset.libraryId
        if (!assetId || !media.get(assetId)?.startsWith(asset.kind + '/')) missing.add(asset.filename)
      }
    }
  }
  return [...missing]
}

export const mediaBackupPath = (id: string) => 'assets/' + id
export const scriptureBackupPath = (index: number) => `scripture/${index}.json`
export const historyBackupPath = (index: number) => `history/${index}.json`

function validHistorySong(v: unknown): v is SongHistorySong {
  return object(v) && identifier(v.id) && text(v.title)
    && [v.uid, v.author, v.copyright, v.administrator, v.reference, v.providerId, v.providerError].every((part) => nullable(part, text))
}

export function parsePackageSongHistory(value: unknown, expected: PackageSongHistory): SongHistory {
  const local = expected.id === localSongHistoryId
  requireValid(object(value) && value.id === expected.id && value.name === expected.name && text(value.filename)
    && (local ? value.origin === 'worshipteam' && value.filename === '' : value.origin === undefined)
    && Array.isArray(value.songs) && (!local || value.songs.length === 0) && unique(value.songs, 'id') && value.songs.every(validHistorySong)
    && Array.isArray(value.actions) && value.actions.length === expected.actions && unique(value.actions, 'id')
    && value.actions.every((action) => {
      if (!object(action) || !nullable(action.songId, identifier) || !nullable(action.type, text)
        || ![action.originalDate, action.originalTransmitDate].every((part) => nullable(part, text))) return false
      if (!local) return absent(action.songSnapshot, validHistorySong)
      const { songSnapshot, originalDate } = action
      const timestamp = text(originalDate) ? Date.parse(originalDate) : NaN
      return choice(action.type, ['0', '2']) && Number.isFinite(timestamp) && new Date(timestamp).toISOString() === originalDate
        && action.originalTransmitDate === null && validHistorySong(songSnapshot) && songSnapshot.id === action.songId
        && songSnapshot.providerId === null && songSnapshot.providerError === null
    }), `ข้อมูลประวัติการใช้เพลง ${expected.name} ในแพ็กเกจไม่ถูกต้อง`)
  return value as SongHistory
}

export function parsePackageScripture(value: unknown, expected: PackageScripture): ScriptureEdition {
  requireValid(object(value) && value.id === expected.id && value.name === expected.name && value.abbreviation === expected.abbreviation
    && [value.language, value.copyright, value.license].every((part) => absent(part, text))
    && Array.isArray(value.books) && value.books.length > 0 && unique(value.books, 'id')
    && value.books.every((book) => object(book) && name(book.name) && absent(book.abbreviation, name) && absent(book.aliases, (part) => list(part, text))
      && Array.isArray(book.verses) && book.verses.length > 0 && book.verses.every((verse) => object(verse)
        && integer(verse.chapter) && verse.chapter > 0 && integer(verse.verse) && verse.verse > 0 && typeof verse.text === 'string')),
  `ข้อมูลพระคัมภีร์ ${expected.name} ในแพ็กเกจไม่ถูกต้อง`)
  return value as ScriptureEdition
}

export function parseMediaLibraryPackage(value: unknown): MediaLibraryPackage {
  requireValid(object(value) && value.format === 'worshipteam.media-library'
    && integer(value.version) && value.version >= 1 && value.version <= 11,
    'ไฟล์นี้ไม่ใช่แพ็กเกจคลังสื่อ WorshipTeam รุ่นที่รองรับ')
  const { assets, items, feeds, dvds, replacements, collectionSets, scheduleAssets } = value
  requireValid(Array.isArray(assets) && assets.length <= mediaPackageMaxFiles && unique(assets, 'id'),
    'รายการไฟล์ในแพ็กเกจคลังสื่อไม่ถูกต้อง')
  const byAsset = new Map<string, PackageAsset>()
  let totalBytes = 0
  for (const asset of assets) {
    requireValid(object(asset) && mediaId(asset.id) && text(asset.mime) && libraryMediaExtension(asset.mime)
      && integer(asset.size) && asset.size > 0 && bool(asset.library), 'รูปแบบไฟล์ในแพ็กเกจคลังสื่อไม่ถูกต้อง')
    totalBytes += asset.size
    requireValid(Number.isSafeInteger(totalBytes), 'ขนาดรวมของไฟล์สื่อในแพ็กเกจไม่ถูกต้อง')
    byAsset.set(asset.id, { id: asset.id, size: asset.size, mime: asset.mime, library: asset.library })
  }
  requireValid(Array.isArray(items) && unique(items, 'id') && items.every((v) => {
    if (!object(v) || !mediaId(v.id) || !mediaId(v.assetId) || !name(v.name) || !name(v.filename)
      || /[/\\]/.test(v.filename) || !text(v.addedAt) || !text(v.mediaType) || !choice(v.kind, ['image', 'video', 'audio'])
      || libraryMediaMime(v.filename) !== v.mediaType || !v.mediaType.startsWith(v.kind + '/')) return false
    const asset = byAsset.get(v.assetId)
    return asset?.library && asset.size === v.size && absent(v.metadata, metadata)
      && absent(v.generatedReference, (n) => n === true) && absent(v.clipEdited, (n) => n === true)
      && absent(v.posterSeconds, (n) => v.kind === 'video' && number(n) && n >= 0)
      && absent(v.posterEdited, (n) => v.kind === 'video' && n === true)
      && absent(v.alphaModeEdited, (n) => n === true) && absent(v.clip, clip) && absent(v.alphaMode, (n) => v.kind === 'video' && alphaMode(n))
      && absent(v.playbackEdited, (n) => n === true)
      && absent(v.usageEdited, (n) => v.kind !== 'audio' && n === true)
      && absent(v.playback, (n) => isMediaPlaybackForKind(n, String(v.kind)))
  }), 'รายการสื่อในแพ็กเกจไม่ครบหรือไม่ตรงกับไฟล์')
  const pathsByPlaylist = new Set<string>()
  const scheduleAssetIds = new Set<string>()
  requireValid(Array.isArray(scheduleAssets) && scheduleAssets.every((v) => {
    if (!object(v) || !mediaId(v.playlistId) || !text(v.archivePath) || safeScheduleMediaPath(v.archivePath) !== v.archivePath
      || !text(v.mime) || !libraryMediaExtension(v.mime) || !mediaId(v.assetId) || !byAsset.has(v.assetId)) return false
    const key = v.playlistId + '\0' + v.archivePath
    if (pathsByPlaylist.has(key)) return false
    pathsByPlaylist.add(key)
    scheduleAssetIds.add(v.assetId)
    return true
  }) && [...byAsset.values()].every(({ id, library }) => library || scheduleAssetIds.has(id)), 'ข้อมูลไฟล์ในตารางไม่ถูกต้อง')
  requireValid(Array.isArray(feeds) && unique(feeds, 'id')
    && feeds.every((v) => object(v) && identifier(v.id) && name(v.name) && list(v.deviceHints, text) && absent(v.metadata, metadata)),
  'ข้อมูลสัญญาณสดไม่ถูกต้อง')
  requireValid(Array.isArray(dvds) && unique(dvds, 'id') && dvds.every(validDvd), 'ข้อมูลคลิป DVD ไม่ถูกต้อง')
  const dvdIds = new Set(dvds.map((v) => v.id))
  requireValid(Array.isArray(replacements) && unique(replacements, 'dvdId') && replacements.every((v) => {
    if (!object(v) || !dvdIds.has(v.dvdId) || !object(v.replacement)) return false
    const { assetId, useMarks, alphaMode: alpha, subtitle: track } = v.replacement
    const asset = mediaId(assetId) ? byAsset.get(assetId) : undefined
    return asset?.library && asset.mime.startsWith('video/') && bool(useMarks)
      && absent(alpha, alphaMode) && absent(track, subtitle)
  }), 'ข้อมูลการจับคู่วิดีโอแทน DVD ไม่ถูกต้อง')
  requireValid(Array.isArray(collectionSets) && unique(collectionSets, 'id') && collectionSets.every(validCollectionSet),
    'ข้อมูลกลุ่มในแพ็กเกจไม่ถูกต้อง')
  let fileCount = assets.length
  if (value.version >= 2) {
    const editions = value.scriptureEditions
    requireValid(Array.isArray(editions) && assets.length + editions.length <= mediaPackageMaxFiles && unique(editions, 'id')
      && editions.every((edition) => object(edition) && name(edition.name) && name(edition.abbreviation)
        && integer(edition.size) && edition.size > 0 && edition.size <= mediaPackageMaxScripture),
    'รายการพระคัมภีร์ในแพ็กเกจไม่ถูกต้อง')
    fileCount += editions.length
  } else requireValid(value.scriptureEditions === undefined, 'รุ่นของแพ็กเกจคลังสื่อไม่ตรงกับรายการพระคัมภีร์')
  const alerts = value.alertTemplates
  if (value.version >= 3) {
    requireValid(Array.isArray(alerts) && (value.version !== 3 || alerts.length > 0) && unique(alerts, 'id') && alerts.every(validAlertTemplate),
      'ข้อมูลข้อความแจ้งเตือนในแพ็กเกจไม่ถูกต้อง')
  } else requireValid(alerts === undefined, 'รุ่นของแพ็กเกจคลังสื่อไม่ตรงกับรายการข้อความแจ้งเตือน')
  const histories = value.songHistories
  if (value.version >= 4) {
    requireValid(Array.isArray(histories) && (value.version !== 4 || histories.length > 0) && fileCount + histories.length <= mediaPackageMaxFiles
      && unique(histories, 'id') && histories.every((history) => object(history) && (history.id === localSongHistoryId || mediaId(history.id))
        && name(history.name) && integer(history.size) && history.size > 0 && history.size <= mediaPackageMaxHistory
        && integer(history.savedAt) && Math.abs(history.savedAt) <= 8.64e15 && integer(history.actions) && history.actions >= 0),
    'รายการประวัติการใช้เพลงในแพ็กเกจไม่ถูกต้อง')
    fileCount += histories.length
  } else requireValid(histories === undefined, 'รุ่นของแพ็กเกจคลังสื่อไม่ตรงกับรายการประวัติการใช้เพลง')
  const themes = value.defaultThemes
  if (value.version >= 5) {
    requireValid(object(themes) && (value.version !== 5 || Object.keys(themes).length > 0)
      && Object.entries(themes).every(([slot, theme]) => themeSlots.has(slot) && validDefaultTheme(theme, byAsset)),
    'ข้อมูลธีมเริ่มต้นของจอในแพ็กเกจไม่ถูกต้อง')
  } else requireValid(themes === undefined, 'รุ่นของแพ็กเกจคลังสื่อไม่ตรงกับรายการธีมเริ่มต้น')
  if (value.version >= 6) {
    requireValid(validPresentationControls(value.presentationControls, value.version >= 7), 'ข้อมูลปุ่มลัดหรือ MIDI ในแพ็กเกจไม่ถูกต้อง')
  } else requireValid(value.presentationControls === undefined, 'รุ่นของแพ็กเกจคลังสื่อไม่ตรงกับรายการปุ่มลัดหรือ MIDI')
  if (value.version >= 7) {
    requireValid(validOutputAppearance(value.outputAppearance, value.version >= 8), 'ข้อมูลค่าจอในแพ็กเกจไม่ถูกต้อง')
  } else requireValid(value.outputAppearance === undefined, 'รุ่นของแพ็กเกจคลังสื่อไม่ตรงกับรายการค่าจอ')
  const nursery = value.nurserySettings
  if (value.version === 8 || (value.version >= 9 && nursery !== undefined)) {
    requireValid(object(nursery) && Object.keys(nursery).length > 0
      && Object.entries(nursery).every(([key, style]) => nurseryOutputs.some((output) => output === key) && validNurseryStyle(style)),
    'ข้อมูลค่าการเรียกผู้ปกครองในแพ็กเกจไม่ถูกต้อง')
  } else requireValid(nursery === undefined, 'รุ่นของแพ็กเกจคลังสื่อไม่ตรงกับการตั้งค่าเรียกผู้ปกครอง')
  const messages = value.messageAlertSettings
  if (value.version === 9 || (value.version >= 10 && messages !== undefined)) {
    requireValid(object(messages) && Object.keys(messages).length > 0
      && Object.entries(messages).every(([key, style]) => messageAlertOutputs.some((output) => output === key) && validMessageAlertStyle(style)),
    'ค่าเริ่มต้นข้อความแจ้งเตือนในแพ็กเกจไม่ถูกต้อง')
  } else requireValid(messages === undefined, 'รุ่นของแพ็กเกจคลังสื่อไม่ตรงกับค่าเริ่มต้นข้อความแจ้งเตือน')
  const catalogs = value.alertResourceCatalogs
  if (value.version === 10 || (value.version === 11 && catalogs !== undefined)) {
    requireValid(Array.isArray(catalogs) && catalogs.length > 0 && unique(catalogs, 'id') && catalogs.every(validAlertResourceCatalog),
      'ข้อมูลคลังโทเค็นและเวลานมัสการในแพ็กเกจไม่ถูกต้อง')
  } else requireValid(catalogs === undefined, 'รุ่นของแพ็กเกจคลังสื่อไม่ตรงกับคลังโทเค็นและเวลานมัสการ')
  if (value.version === 11) {
    requireValid(fileCount < mediaPackageMaxFiles && validCatalogDescriptor(value.catalog), 'ข้อมูลฐานข้อมูลในแพ็กเกจไม่ถูกต้อง')
  } else requireValid(value.catalog === undefined, 'รุ่นของแพ็กเกจคลังสื่อไม่ตรงกับข้อมูลฐานข้อมูล')
  return value as MediaLibraryPackage
}
