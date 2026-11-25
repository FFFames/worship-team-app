/** Checks portable playlist structure before saving any records. */

import { SECTION_LABELS, type PlaylistCue, type SectionType } from '../types/database'
import type { DesignTextRun } from '../types/slideDesign'
import { libraryMediaExtension } from './mediaLibrary'
import { CUE_LABELS } from './playlistCues'
import { feedAudioLevel, feedDimension, feedFrameRate, presentationWebUrl } from './livePresentation'
import { powerPointOnlineVideoUrl } from './powerPoint/onlineVideo'
import type { PlaylistPackageManifest } from './playlistPackage'

import { splitVideoAlpha } from './videoAlpha'
import { dvdThumbnailUrl } from './dvdThumbnail'
import { isDvdFit } from './dvdPlayback'
import { isMediaPlaybackForKind } from './mediaPlayback'
import { isLyricLayout } from './slideBuilder'
import { validOptionalEasyWorshipUid } from './easyWorshipSongIdentity'
import { maxPowerPointBuildChanges, maxPowerPointBuildSteps } from './powerPoint/buildNavigation'
import { validOptionalSpeakerNotes } from './speakerNotes'
import { validDesignClipPaths, validDesignShapePaths } from './designClipPaths'
import { isSlideShapePreset } from './slideShapePresets'
import { isListPunctuation, isNumberedListStyle, maxListLevel, maxListStart, normalizeListMarker } from './slideParagraphLists'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown): value is string {
  return typeof value === 'string' && !value.includes('\0')
}

function name(value: unknown): value is string {
  return text(value) && Boolean(value.trim())
}

function texts(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(text)
}

function optionalText(value: unknown) {
  return value === undefined || text(value)
}

function nullableText(value: unknown) {
  return value === null || text(value)
}

function numeric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function inRange(value: unknown, min: number, max: number) {
  return numeric(value) && value >= min && value <= max
}

function colorHex(value: unknown) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

function validElementEffects(value: Record<string, unknown>, grouped: boolean) {
  const { elementBorder: border, elementShadow: shadow, elementReflection: reflection } = value
  return (border === undefined || border === false || (record(border) && colorHex(border.color) && inRange(border.opacity, 0, 1)
    && numeric(border.width) && border.width > 0 && border.width <= .2
    && ['inner', 'center', 'outer'].includes(String(border.position)) && ['round', 'miter', 'bevel'].includes(String(border.join))))
    && (shadow === undefined || shadow === false || (record(shadow) && (!grouped || name(shadow.group))
      && colorHex(shadow.color) && inRange(shadow.opacity, 0, 1) && inRange(shadow.blur, 0, .2) && inRange(shadow.offset, 0, .2)
      && numeric(shadow.angle) && shadow.angle >= 0 && shadow.angle < 360))
    && (reflection === undefined || reflection === false || (record(reflection) && (!grouped || name(reflection.group))
      && inRange(reflection.opacity, 0, 1) && inRange(reflection.size, 0, 1)
      && inRange(reflection.blur, 0, .2) && inRange(reflection.distance, 0, .2)))
}

function integer(value: unknown): value is number {
  return numeric(value) && Number.isInteger(value) && Math.abs(value) <= 2147483647
}

function optionalNumber(value: unknown): boolean {
  return value === undefined || numeric(value)
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean'
}

function textStyle(value: unknown): boolean {
  if (value === undefined) return true
  if (!record(value)) return false
  return [value.color, value.fontFamily, value.shadowColor, value.outlineColor, value.align, value.verticalAlign].every(optionalText)
    && [value.fontSize, value.padding, value.sizeScale].every(optionalNumber)
    && [value.bold, value.italic, value.underline, value.shadow, value.fitText].every(optionalBoolean)
}

function textRunStyle(value: unknown): boolean {
  if (value === undefined) return true
  if (!record(value) || !textStyle(value)) return false
  const { outline, textShadow, fontOpacity, strike, baseline } = value
  return (outline === undefined || outline === false || (record(outline) && optionalText(outline.color) && optionalNumber(outline.width)))
    && (textShadow === undefined || textShadow === false || (record(textShadow) && optionalText(textShadow.color)
      && [textShadow.blur, textShadow.offset, textShadow.angle].every(optionalNumber)))
    && optionalBoolean(strike) && (fontOpacity === undefined || (numeric(fontOpacity) && fontOpacity >= 0 && fontOpacity <= 100))
    && (baseline === undefined || baseline === 'super' || baseline === 'sub' || baseline === 'normal')
}

function paragraphFormat(value: unknown): boolean {
  if (value === undefined) return true
  if (!record(value) || !integer(value.index) || value.index < 0) return false
  if (![value.leftIndent, value.rightIndent, value.firstLineIndent, value.spaceBefore, value.spaceAfter].every(optionalNumber)) return false
  const list = value.list
  if (list !== undefined && list !== false) {
    if (!record(list) || (list.style !== 'bullet' && list.style !== 'literal' && !isNumberedListStyle(list.style))) return false
    if (list.level !== undefined && (!integer(list.level) || list.level < 0 || list.level > maxListLevel)) return false
    if (list.start !== undefined && (!isNumberedListStyle(list.style) || !integer(list.start) || list.start < 1 || list.start > maxListStart)) return false
    if (list.punctuation !== undefined && (!isNumberedListStyle(list.style) || !isListPunctuation(list.punctuation))) return false
    if (list.text !== undefined && ((list.style !== 'bullet' && list.style !== 'literal') || !text(list.text) || normalizeListMarker(list.text) !== list.text)) return false
    if (list.style === 'literal' && !list.text) return false
  }
  const spacing = value.lineSpacing
  return spacing === undefined || (record(spacing) && numeric(spacing.value) && spacing.value > 0
    && (spacing.mode === 'exact' || spacing.mode === 'minimum' || spacing.mode === 'multiple'))
}

export function validDesignTextRun(run: unknown): run is DesignTextRun {
  return record(run) && text(run.text) && textRunStyle(run.style) && paragraphFormat(run.paragraph)
    && (run.align === undefined || run.align === 'left' || run.align === 'center' || run.align === 'right')
}

export function validLyricRuns(value: unknown, lyrics: string) {
  return value === undefined || (Array.isArray(value) && value.every(validDesignTextRun)
    && value.map((run) => run.text).join('') === lyrics)
}

function textLayout(value: unknown): boolean {
  if (value === undefined) return true
  if (!record(value) || (value.sizing !== undefined && value.sizing !== 'fixed' && value.sizing !== 'fit')) return false
  return value.insets === undefined || (record(value.insets) && Object.values(value.insets)
    .every((inset) => numeric(inset) && inset >= 0 && inset <= 1))
}

function optionalList(value: unknown, valid: (item: unknown) => boolean): boolean {
  return value === undefined || (Array.isArray(value) && value.every(valid))
}

function requireValid(condition: unknown, error: string): asserts condition {
  if (!condition) throw new Error(error)
}

function sectionType(value: unknown): value is SectionType {
  return text(value) && Object.prototype.hasOwnProperty.call(SECTION_LABELS, value)
}

export function validSlideAsset(value: unknown, kinds: readonly string[]): value is Record<string, unknown> & { kind: string; filename: string } {
  if (!record(value) || !text(value.kind) || !kinds.includes(value.kind) || !name(value.filename)
    || !optionalText(value.url)) return false
  if (value.easyWorshipFileHash !== undefined && (!['image', 'video', 'audio', 'powerpoint'].includes(value.kind)
    || !text(value.easyWorshipFileHash) || !/^[a-f0-9]{64}$/.test(value.easyWorshipFileHash))) return false
  if (value.easyWorshipSourceLocationId !== undefined && (!['image', 'video', 'audio', 'powerpoint'].includes(value.kind)
    || !text(value.easyWorshipSourceLocationId) || !/^[a-f0-9]{64}$/.test(value.easyWorshipSourceLocationId))) return false
  if (value.easyWorshipFileSize !== undefined && ((!value.easyWorshipFileHash && !value.easyWorshipSourceLocationId) || !integer(value.easyWorshipFileSize)
    || !Number.isSafeInteger(value.easyWorshipFileSize) || value.easyWorshipFileSize <= 0)) return false
  if (value.hideScrollbars !== undefined && (value.kind !== 'web' || !optionalBoolean(value.hideScrollbars))) return false
  if (value.mediaCatalog !== undefined && (!['image', 'video', 'audio'].includes(value.kind) || !record(value.mediaCatalog)
    || !text(value.mediaCatalog.id) || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value.mediaCatalog.id)
    || !name(value.mediaCatalog.name))) return false
  if (value.alphaMode !== undefined && (value.kind !== 'video' || !splitVideoAlpha(value.alphaMode))) return false
  if (value.posterSeconds !== undefined && (value.kind !== 'video' || !numeric(value.posterSeconds) || value.posterSeconds < 0)) return false
  if (value.playback !== undefined && (!isMediaPlaybackForKind(value.playback, value.kind)
    || value.playback.repeat !== undefined || value.playback.usage !== undefined)) return false
  if (value.easyWorshipLegacyRepeat !== undefined && (value.kind !== 'audio' || value.easyWorshipLegacyRepeat !== false)) return false
  if (value.inheritedFromMaster !== undefined && (value.kind !== 'audio' || value.inheritedFromMaster !== true)) return false
  if (value.dvd !== undefined) {
    const dvd = value.dvd
    if (value.kind !== 'video' || !record(dvd) || !name(dvd.id) || !name(dvd.name)
      || !optionalText(dvd.discName) || !optionalText(dvd.discUid) || !optionalBoolean(dvd.repeat)) return false
    if (![dvd.title, dvd.chapter, dvd.angle, dvd.audioTrack, dvd.subtitleTrack, dvd.segmentStart, dvd.segmentDuration, dvd.frameRateFlag]
      .every((field) => field === undefined || (numeric(field) && Number.isSafeInteger(field) && field >= 0))) return false
    if (dvd.lastChapter != null && (!integer(dvd.lastChapter) || dvd.lastChapter < 1 || dvd.lastChapter > 99
      || (numeric(dvd.chapter) && dvd.lastChapter < dvd.chapter))) return false
    if (dvd.subtitleSelection != null && (!integer(dvd.subtitleSelection) || dvd.subtitleSelection < 1 || dvd.subtitleSelection > 32)) return false
    if (dvd.thumbnail != null && !dvdThumbnailUrl(dvd.thumbnail)) return false
    if (dvd.metadata !== undefined && (!record(dvd.metadata) || !Object.values(dvd.metadata)
      .every((field) => text(field) && field.length <= 4_000))) return false
    if (dvd.playback !== undefined && (!record(dvd.playback) || !optionalBoolean(dvd.playback.muted)
      || (dvd.playback.fit !== undefined && !isDvdFit(dvd.playback.fit))
      || (dvd.playback.volume !== undefined && (!numeric(dvd.playback.volume) || dvd.playback.volume < 0 || dvd.playback.volume > 1)))) return false
    if (dvd.clip !== undefined && (!record(dvd.clip) || !optionalNumber(dvd.clip.startSeconds) || !optionalNumber(dvd.clip.endSeconds))) return false
  }
  if (value.deviceHints !== undefined && (value.kind !== 'camera' || !texts(value.deviceHints))) return false
  if (value.audioDeviceHint !== undefined && (value.kind !== 'camera' || !text(value.audioDeviceHint))) return false
  if (value.feedId !== undefined && (value.kind !== 'camera' || !name(value.feedId))) return false
  if (value.feedSound !== undefined && (value.kind !== 'camera' || !record(value.feedSound)
    || typeof value.feedSound.muted !== 'boolean' || feedAudioLevel(value.feedSound.level) === undefined)) return false
  const video = value.feedVideo
  if (video !== undefined && (value.kind !== 'camera' || !record(video)
    || (video.width !== undefined && feedDimension(video.width) === undefined)
    || (video.height !== undefined && feedDimension(video.height) === undefined)
    || (video.frameRate !== undefined && feedFrameRate(video.frameRate) === undefined)
    || (video.fit !== undefined && !isDvdFit(video.fit)))) return false
  if (value.clip !== undefined && (!record(value.clip) || !optionalNumber(value.clip.startSeconds) || !optionalNumber(value.clip.endSeconds)
    || (value.clip.endTrimSeconds !== undefined && (!numeric(value.clip.endTrimSeconds) || value.clip.endTrimSeconds < 0)))) return false
  if (value.powerPointMediaId !== undefined && (value.kind !== 'audio' || !name(value.powerPointMediaId))) return false
  if (value.role !== undefined && value.role !== 'foreground' && value.role !== 'background') return false
  if (!optionalBoolean(value.repeat)) return false
  return true
}

export function validSlideTransition(value: unknown) {
  return record(value) && (value.uid === undefined || text(value.uid))
    && record(value.values) && Object.values(value.values).every(text)
}

export function validSlidePlayback(value: unknown) {
  return record(value) && optionalBoolean(value.loop) && optionalBoolean(value.restart) && optionalNumber(value.delayMs)
    && (value.mode === undefined || value.mode === 'manual' || value.mode === 'timer' || value.mode === 'media')
}

function validFill(value: unknown) {
  if (!record(value)) return false
  if (value.type === 'solid') return text(value.color)
  return value.type === 'gradient' && numeric(value.angle) && Array.isArray(value.stops)
    && value.stops.every((stop: unknown) => record(stop) && numeric(stop.position) && text(stop.color))
}

export function validSlideDesign(value: unknown, validAsset: (asset: unknown, kinds: readonly string[]) => boolean): boolean {
  if (!record(value) || !numeric(value.aspectRatio) || value.aspectRatio <= 0 || !Array.isArray(value.layers)) return false
  if (value.cameraMasterImported !== undefined && value.cameraMasterImported !== true) return false
  if (value.backgroundMasterImported !== undefined && value.backgroundMasterImported !== true) return false
  if (value.powerPointResolvedMediaLinks !== undefined && (!texts(value.powerPointResolvedMediaLinks)
    || value.powerPointResolvedMediaLinks.length > maxPowerPointBuildChanges)) return false
  if (value.powerPointBuild !== undefined) {
    const build = value.powerPointBuild
    if (!Array.isArray(build) || build.length > maxPowerPointBuildSteps) return false
    let changes = 0
    for (const step of build) {
      if (!Array.isArray(step) || !step.length || (changes += step.length) > maxPowerPointBuildChanges
        || !step.every((item: unknown) => record(item) && name(item.layerId) && typeof item.visible === 'boolean')) return false
    }
  }
  if (value.powerPointStopTransitionSound !== undefined && value.powerPointStopTransitionSound !== true) return false
  if (value.powerPointTablesImported !== undefined && value.powerPointTablesImported !== true) return false
  if (value.soundtracks !== undefined) {
    if (!Array.isArray(value.soundtracks)) return false
    let hasSoundAction = value.powerPointStopTransitionSound === true
    for (const track of value.soundtracks) {
      if (!record(track) || !validAsset(track, ['audio'])) return false
      if (track.powerPointTransitionSound === undefined) continue
      if (hasSoundAction || track.powerPointTransitionSound !== true || track.powerPointMediaId !== undefined) return false
      hasSoundAction = true
    }
  }
  return value.layers.every((layer: unknown) => {
    if (!record(layer) || !name(layer.id) || !record(layer.frame)) return false
    if (![layer.frame.x, layer.frame.y, layer.frame.width, layer.frame.height].every(numeric) || !optionalNumber(layer.rotation)) return false
    if (layer.clipPaths !== undefined && !validDesignClipPaths(layer.clipPaths)) return false
    if (layer.shapePaths !== undefined && !validDesignShapePaths(layer.shapePaths)) return false
    const preset = layer.presetShape
    if (preset !== undefined && preset !== false && (!record(preset) || !isSlideShapePreset(preset.preset)
      || (preset.adjustment !== undefined && !inRange(preset.adjustment, 0, 1)))) return false
    if (!validElementEffects(layer, true)) return false
    if (layer.inheritedFromMaster !== undefined && (layer.inheritedFromMaster !== true || !['camera', 'fill', 'media'].includes(String(layer.kind)))) return false
    if (layer.songArtwork !== undefined && (layer.songArtwork !== true || !['text', 'media', 'camera', 'fill'].includes(String(layer.kind)))) return false
    if (['media', 'fill', 'web'].includes(String(layer.kind)) && layer.role !== undefined
      && layer.role !== 'background' && layer.role !== 'foreground') return false
    if (layer.kind === 'media') {
      if (layer.powerPointMedia !== undefined && layer.powerPointMedia !== true) return false
      const previous = layer.easyWorshipLegacyPlayback
      return validAsset(layer.asset, ['image', 'video']) && (previous === undefined || (record(previous)
        && optionalBoolean(previous.loop) && (previous.fit === undefined || ['fill', 'contain', 'cover'].includes(String(previous.fit)))))
    }
    if (layer.kind === 'camera') return optionalNumber(layer.opacity) && validAsset(layer.asset, ['camera'])
    if (layer.kind === 'web') {
      if (!text(layer.url) || !optionalBoolean(layer.hideScrollbars)) return false
      if (layer.powerPointMedia === true) return Boolean(powerPointOnlineVideoUrl(layer.url))
      return layer.powerPointMedia === undefined && Boolean(presentationWebUrl(layer.url))
    }
    if (layer.kind === 'text') return text(layer.text) && textStyle(layer.style) && textLayout(layer.textLayout)
      && optionalList(layer.runs, validDesignTextRun) && validScriptureFrameSource(layer.scriptureSource)
    return layer.kind === 'fill' && validFill(layer.fill)
  })
}

type ValidateAsset = (asset: unknown, kinds: readonly string[]) => boolean

function validScriptureFrameSource(value: unknown) {
  return value === undefined || (record(value) && name(value.editionId) && name(value.editionName) && name(value.label)
    && Array.isArray(value.verses) && value.verses.length > 0 && value.verses.every((address: unknown) => record(address)
      && name(address.bookId) && integer(address.chapter) && address.chapter >= 1 && integer(address.verse) && address.verse >= 1))
}

function validSongArtwork(value: unknown, validAsset: ValidateAsset) {
  if (value === undefined) return true
  if (!record(value)) return false
  const seen = new Set<string>()
  return (value.order === undefined || (Array.isArray(value.order) && value.order.every(name)
    && new Set(value.order).size === value.order.length))
    && optionalList(value.changes, (change) => {
      if (!record(change)) return false
      let id: unknown
      if (change.action === 'hide') id = change.id
      else {
        if ((change.action !== 'add' && change.action !== 'update') || !record(change.layer)) return false
        const layer = change.layer
        if (!['text', 'media', 'camera', 'fill'].includes(String(layer.kind)) || layer.slot !== undefined
          || !optionalNumber(layer.rotation) || !optionalNumber(layer.opacity)
          || !validSlideDesign({ aspectRatio: 1, layers: [layer] }, validAsset)) return false
        id = layer.id
      }
      if (!name(id) || seen.has(id)) return false
      seen.add(id)
      return true
    })
}

export function validSongSlideLayout(value: unknown, validAsset: ValidateAsset) {
  if (value === undefined) return true
  if (!record(value)) return false
  const { frame, style, background } = value
  if (frame !== undefined && (!record(frame) || !Object.entries(frame).every(([key, amount]) =>
    ['x', 'y', 'width', 'height'].includes(key) && numeric(amount) && amount <= 1
      && amount >= (key === 'width' || key === 'height' ? .01 : 0)))) return false
  if (style !== undefined && (!record(style) || !Object.keys(style).every((key) => ['align', 'verticalAlign', 'fontSize', 'fitText'].includes(key))
    || (style.align !== undefined && (!text(style.align) || !['left', 'center', 'right'].includes(style.align)))
    || (style.verticalAlign !== undefined && (!text(style.verticalAlign) || !['top', 'center', 'bottom'].includes(style.verticalAlign)))
    || (style.fontSize !== undefined && (!numeric(style.fontSize) || style.fontSize < .01 || style.fontSize > .3))
    || !optionalBoolean(style.fitText))) return false
  return validSongArtwork(value.artwork, validAsset)
    && optionalList(value.elementEffects, (change) => record(change) && (change.layerId === undefined || name(change.layerId))
      && record(change.effects) && validElementEffects(change.effects, false))
    && (background === undefined || (record(background) && (background.kind === 'fill' ? validFill(background.fill)
      : background.kind === 'camera' ? record(background.asset) && background.asset.role === 'background' && validAsset(background.asset, ['camera'])
        : background.kind === 'media' && optionalBoolean(background.loop) && validAsset(background.asset, ['image', 'video']))))
}

export function validPreparedSongLayouts(value: unknown, length: number, validAsset: ValidateAsset) {
  const starts = new Set<number>()
  return optionalList(value, (entry) => {
    if (!record(entry) || !integer(entry.start) || entry.start < 0 || (entry.start > 0 && entry.start >= length)
      || starts.has(entry.start) || entry.layout === undefined || !validSongSlideLayout(entry.layout, validAsset)) return false
    starts.add(entry.start)
    return true
  })
}

export function validSongAppearance(value: unknown, validDesign: (design: unknown) => boolean, validAsset: ValidateAsset) {
  return record(value) && (value.defaultDesign === undefined || validDesign(value.defaultDesign))
    && optionalBoolean(value.looping)
    && validSongSlideLayout(value.slideLayout, validAsset)
    && optionalList(value.sections, (section) => record(section) && integer(section.index) && text(section.label) && validDesign(section.design))
    && (value.warnings === undefined || texts(value.warnings))
}

export function validPlaylistCue(cue: unknown, validAsset: ValidateAsset): cue is PlaylistCue {
  const validCueAsset = (asset: unknown) => validAsset(asset, ['image', 'video', 'audio', 'web', 'camera', 'powerpoint'])
  return record(cue) && name(cue.label) && text(cue.kind) && Object.prototype.hasOwnProperty.call(CUE_LABELS, cue.kind)
    && optionalBoolean(cue.looping)
    && (cue.lyricLayout === undefined || (cue.kind === 'song' && isLyricLayout(cue.lyricLayout)))
    && (cue.scriptureFlow === undefined || (cue.kind === 'scripture' && cue.scriptureFlow === true))
    && (cue.slideLayout === undefined || (cue.kind === 'song' && validSongSlideLayout(cue.slideLayout, validAsset)))
    && (cue.libraryDesignId === undefined || ((cue.kind === 'presentation' || cue.kind === 'powerpoint')
      && text(cue.libraryDesignId) && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(cue.libraryDesignId)))
    && optionalList(cue.assets, validCueAsset) && (cue.warnings === undefined || texts(cue.warnings))
    && (cue.metadata === undefined || (record(cue.metadata) && validOptionalSpeakerNotes(cue.metadata.libraryNotes) && Object.values(cue.metadata)
      .every((value) => value === null || text(value) || numeric(value) || typeof value === 'boolean')))
    && Array.isArray(cue.slides) && cue.slides.every((slide: unknown) => {
      if (!record(slide) || !text(slide.label) || !texts(slide.lines) || !optionalList(slide.assets, validCueAsset)) return false
      if (slide.labelEdited !== undefined && slide.labelEdited !== true) return false
      if (slide.soundtrackEdited !== undefined && slide.soundtrackEdited !== true) return false
      if (!validOptionalSpeakerNotes(slide.speakerNotes)) return false
      if (slide.textEdited !== undefined && (cue.kind !== 'scripture' || slide.textEdited !== true)) return false
      if (slide.design !== undefined && !validSlideDesign(slide.design, validAsset)) return false
      if (slide.sectionType !== undefined && !sectionType(slide.sectionType)) return false
      if (slide.chords !== undefined && !texts(slide.chords)) return false
      if (slide.lyricRuns !== undefined && ((cue.kind !== 'song' && cue.kind !== 'scripture')
        || !validLyricRuns(slide.lyricRuns, slide.lines.join('\n')))) return false
      if (slide.slideLayout !== undefined && (cue.kind !== 'song' || !validSongSlideLayout(slide.slideLayout, validAsset))) return false
      if (slide.transition !== undefined && !validSlideTransition(slide.transition)) return false
      if (slide.transitionEdited !== undefined && slide.transitionEdited !== true) return false
      if (slide.playback !== undefined && !validSlidePlayback(slide.playback)) return false
      if (slide.scriptureRange !== undefined) {
        const range = slide.scriptureRange
        if (!record(range) || ![range.translationId, range.book, range.chapter, range.firstVerse, range.lastVerse].every(integer)) return false
      }
      if (slide.scriptureVerseStarts !== undefined) {
        const starts = slide.scriptureVerseStarts
        const lineCount = slide.lines.join('\n').split('\n').length
        if (cue.kind !== 'scripture' || !Array.isArray(starts) || !starts.every((start, index) =>
          record(start) && integer(start.line) && start.line >= 0 && start.line < lineCount
          && (index === 0 || start.line > starts[index - 1].line)
          && integer(start.verse) && start.verse > 0)) return false
      }
      if (slide.scriptureBookNames !== undefined && (cue.kind !== 'scripture' || !Array.isArray(slide.scriptureBookNames)
        || slide.scriptureBookNames.length > 1000 || !slide.scriptureBookNames.every((book) => record(book)
          && text(book.name) && book.name.length <= 160 && Boolean(book.name.trim())
          && text(book.abbreviation) && book.abbreviation.length <= 80 && Boolean(book.abbreviation.trim())))) return false
      return optionalText(slide.template) && (slide.advanceMs === undefined || integer(slide.advanceMs))
    })
}

export function parsePlaylistPackage(input: unknown): PlaylistPackageManifest {
  requireValid(record(input) && input.format === 'worshipteam.schedule' && input.version === 1,
    'ไฟล์นี้ไม่ใช่แพ็กเกจเพลย์ลิสต์ WorshipTeam รุ่นที่รองรับ')
  requireValid(record(input.playlist) && name(input.playlist.name) && nullableText(input.playlist.date)
    && nullableText(input.playlist.notes) && Array.isArray(input.songs) && Array.isArray(input.entries)
    && Array.isArray(input.media) && texts(input.missing), 'ข้อมูลเพลย์ลิสต์ไม่ครบหรืออ่านไม่ได้')

  const media = new Map<string, string>()
  for (const asset of input.media) {
    requireValid(record(asset) && text(asset.path) && /^assets\/[1-9]\d{0,5}$/.test(asset.path) && !media.has(asset.path)
      && name(asset.filename) && text(asset.mime) && libraryMediaExtension(asset.mime) && integer(asset.size) && asset.size > 0, 'รายการไฟล์สื่อในแพ็กเกจไม่ถูกต้อง')
    media.set(asset.path, asset.mime)
  }
  const referencedAssets = new Set<string>()
  function validAsset(value: unknown, kinds: readonly string[]) {
    if (!validSlideAsset(value, kinds) || value.libraryId !== undefined || value.sourcePath !== undefined) return false
    if (value.archivePath === undefined) return true
    if (!text(value.archivePath) || !media.get(value.archivePath)?.startsWith(value.kind + '/')) return false
    referencedAssets.add(value.archivePath)
    return true
  }

  const validDesign = (value: unknown) => validSlideDesign(value, validAsset)

  const validCueAsset = (asset: unknown) => validAsset(asset, ['image', 'video', 'audio', 'web', 'camera', 'powerpoint'])

  for (const song of input.songs) {
    requireValid(record(song) && name(song.title) && name(song.original_key) && text(song.raw_content)
      && validOptionalEasyWorshipUid(song.easyworship_uid)
      && nullableText(song.artist) && nullableText(song.time_signature) && nullableText(song.youtube_url)
      && (song.tempo === null || integer(song.tempo)) && (song.tags === null || texts(song.tags))
      && [song.copyright, song.ccli_number, song.copyright_administrator, song.description]
        .every((field) => field === undefined || nullableText(field))
      && (song.appearance == null || validSongAppearance(song.appearance, validDesign, validAsset)), 'ข้อมูลเพลงในแพ็กเกจไม่ถูกต้อง')
    if (song.sections === null) continue
    requireValid(Array.isArray(song.sections), 'ข้อมูลเนื้อเพลงในแพ็กเกจไม่ถูกต้อง')
    for (const section of song.sections) {
      requireValid(record(section) && sectionType(section.type) && optionalText(section.label) && optionalText(section.slideLabel) && text(section.marker)
        && Array.isArray(section.lines) && section.lines.every((line: unknown) => record(line) && text(line.lyrics) && text(line.chords)),
      'ข้อมูลเนื้อเพลงในแพ็กเกจไม่ถูกต้อง')
      const lyrics = section.lines.map((line: { lyrics: string }) => line.lyrics).join('\n')
      requireValid(validLyricRuns(section.lyricRuns, lyrics),
        'รูปแบบเนื้อเพลงในแพ็กเกจไม่ตรงกับข้อความ')
      requireValid(validPreparedSongLayouts(section.slideLayouts, lyrics.length, validAsset), 'เค้าโครงสไลด์เพลงในแพ็กเกจไม่ถูกต้อง')
      requireValid(section.transition == null || validSlideTransition(section.transition), 'เอฟเฟ็กต์สไลด์เพลงในแพ็กเกจไม่ถูกต้อง')
      requireValid(section.playback === undefined || validSlidePlayback(section.playback), 'เวลาเลื่อนสไลด์เพลงในแพ็กเกจไม่ถูกต้อง')
      if (section.slideBreaks != null) {
        requireValid(Array.isArray(section.slideBreaks) && section.slideBreaks.every((offset: unknown, index: number, values: unknown[]) =>
          integer(offset) && offset > (index ? Number(values[index - 1]) : 0) && offset < lyrics.length), 'ข้อมูลจุดแบ่งสไลด์เพลงในแพ็กเกจไม่ถูกต้อง')
      }
      section.label ??= SECTION_LABELS[section.type]
    }
  }

  const referencedSongs = new Set<number>()
  for (const entry of input.entries) {
    requireValid(record(entry) && integer(entry.transpose)
      && (entry.background_asset === undefined || validCueAsset(entry.background_asset))
      && (entry.slide_theme === undefined || (record(entry.slide_theme) && name(entry.slide_theme.title) && validDesign(entry.slide_theme.design)
        && (entry.slide_theme.transition === undefined || validSlideTransition(entry.slide_theme.transition)))),
    'รายการในเพลย์ลิสต์ไม่ถูกต้อง')
    if (entry.song === undefined) requireValid(validPlaylistCue(entry.cue, validAsset), 'ข้อมูลคิวในแพ็กเกจไม่ถูกต้อง')
    else {
      requireValid(integer(entry.song) && entry.song >= 0 && entry.song < input.songs.length,
        'เพลงที่เพลย์ลิสต์อ้างถึงหายไป')
      requireValid(entry.cue === undefined || (validPlaylistCue(entry.cue, validAsset) && entry.cue.kind === 'song'),
        'ข้อมูลเพลงที่แก้เฉพาะในเพลย์ลิสต์ไม่ถูกต้อง')
      referencedSongs.add(entry.song)
    }
  }
  requireValid(referencedSongs.size === input.songs.length && referencedAssets.size === media.size, 'พบเพลงหรือสื่อเกินจากรายการในเพลย์ลิสต์')
  return input as PlaylistPackageManifest
}
