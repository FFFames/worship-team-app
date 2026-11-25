/** Converts reviewed EasyWorship schedule entries into stored playlist cues. */

import type { PlaylistCue } from '../types/database'
import type { DesignLayer } from '../types/slideDesign'
import type { EasyWorshipSchedule } from './easyWorshipSchedule'
import { sectionTypeFromLabel } from './chordParser'
import { restoreMasterLayers } from './slideDesignAssets'
import { MISSING_MASTER_BACKGROUND } from './slideDesign'
import { hasDesignGeometry, restoreDesignGeometry } from './designLayerGeometry'
import { legacyElementDecorationWarning, unsupportedElementBorder, unsupportedElementReflection } from './easyWorshipElementBorder'
import { unsupportedEasyWorshipShape } from './easyWorshipShape'
import { hasParagraphList, recoverMissingParagraphLists } from './songParagraphFormatting'

export type ScheduleImportIds = { sourceId: string; previousSourceId?: string }

export async function mapScheduleImportIds(ids: ScheduleImportIds, map: (id: string) => Promise<string>): Promise<ScheduleImportIds> {
  const [sourceId, previousSourceId] = await Promise.all([map(ids.sourceId), ids.previousSourceId ? map(ids.previousSourceId) : undefined])
  return { sourceId, previousSourceId }
}

export function convertEasyWorshipCues(schedule: EasyWorshipSchedule): PlaylistCue[] {
  return schedule.cues.map((cue) => ({
    kind: cue.kind,
    label: cue.label,
    sourceId: cue.id,
    sourceOrder: cue.order,
    ...(cue.looping ? { looping: true } : {}),
    metadata: cue.metadata,
    slides: cue.slides.map((slide) => ({
      label: slide.label,
      lines: slide.lines,
      ...(slide.lyricRuns ? { lyricRuns: slide.lyricRuns } : {}),
      assets: slide.assets,
      sourceId: slide.id,
      sourceOrder: slide.order,
      ...(cue.kind === 'song' ? { sectionType: sectionTypeFromLabel(slide.label) } : {}),
      ...(slide.scriptureRange ? { scriptureRange: slide.scriptureRange } : {}),
      ...(slide.scriptureVerseStarts ? { scriptureVerseStarts: slide.scriptureVerseStarts } : {}),
      ...(slide.scriptureBookNames ? { scriptureBookNames: slide.scriptureBookNames } : {}),
      ...(slide.design ? { design: slide.design } : {}),
      ...(slide.template ? { template: slide.template } : {}),
      ...(slide.advanceMs ? { advanceMs: slide.advanceMs } : {}),
      ...(slide.transition ? { transition: slide.transition } : {}),
      ...(slide.playback ? { playback: slide.playback } : {}),
    })),
    warnings: [...new Set([...cue.warnings, ...cue.slides.flatMap((slide) => slide.warnings)])],
  }))
}

type RecoveredSongLabel = { previous: string; label: string; sectionType: ReturnType<typeof sectionTypeFromLabel> }
export type RecoveredScheduleSongLabels = ReadonlyMap<string, ReadonlyMap<string, RecoveredSongLabel>>

/** The old placeholder is indexed by its original position, even when the playlist has since been rearranged. */
export function recoveredScheduleSongLabels(schedule: EasyWorshipSchedule): RecoveredScheduleSongLabels {
  const labels = new Map<string, Map<string, RecoveredSongLabel>>()
  for (const cue of schedule.cues) {
    if (cue.kind !== 'song') continue
    const slides = new Map<string, RecoveredSongLabel>()
    for (const { id, label, previousSongLabel } of cue.slides) {
      if (previousSongLabel) slides.set(id, { previous: previousSongLabel, label, sectionType: sectionTypeFromLabel(label) })
    }
    if (slides.size) labels.set(cue.id, slides)
  }
  return labels
}

export function fillScheduleSongLabels(cue: PlaylistCue, recovered: RecoveredScheduleSongLabels) {
  const labels = cue.kind === 'song' && cue.sourceId ? recovered.get(cue.sourceId) : undefined
  if (!labels?.size) return undefined
  let count = 0
  const slides = cue.slides.map((slide) => {
    const source = slide.sourceId ? labels.get(slide.sourceId) : undefined
    if (!source || slide.labelEdited || slide.label !== source.previous) return slide
    count++
    return { ...slide, label: source.label, sectionType: slide.sectionType ?? source.sectionType }
  })
  return count ? { cue: { ...cue, slides }, count } : undefined
}

type CueSlide = PlaylistCue['slides'][number]
type TextLayer = Extract<DesignLayer, { kind: 'text' }>
export type RecoveredScheduleSlideDetails = ReadonlyMap<string, { slides: ReadonlyMap<string, CueSlide>; warnings?: string[] }>

function inheritedSoundtrack(slide: CueSlide) {
  const audio = slide.assets?.filter((asset) => asset.kind === 'audio')
  return audio?.length && audio.every((asset) => asset.inheritedFromMaster && (asset.archivePath || asset.libraryId)) ? audio : undefined
}

export function recoverableScheduleSlideDetails(cues: readonly PlaylistCue[]): RecoveredScheduleSlideDetails {
  const recovered = new Map<string, { slides: ReadonlyMap<string, CueSlide>; warnings?: string[] }>()
  for (const cue of cues) {
    if (!cue.sourceId) continue
    const slides = new Map<string, CueSlide>()
    for (const slide of cue.slides) {
      if (slide.sourceId && (slide.assets?.some((asset) => asset.kind === 'camera' && (asset.feedVideo || asset.feedSound))
        || slide.design?.backgroundMasterImported || slide.design?.layers.some((layer) => layer.kind === 'camera')
        || hasDesignGeometry(slide.design) || inheritedSoundtrack(slide))) slides.set(slide.sourceId, slide)
    }
    if (slides.size) recovered.set(cue.sourceId, { slides, warnings: cue.warnings })
  }
  return recovered
}

export function fillScheduleSlideDetails(cue: PlaylistCue, recovered: RecoveredScheduleSlideDetails, hasAppliedSoundtrack = false) {
  const recovery = cue.sourceId ? recovered.get(cue.sourceId) : undefined
  if (!recovery) return undefined
  let count = 0
  let backgrounds = 0
  let soundtracks = 0
  let rotations = 0
  let masks = 0
  let borders = 0
  let shadows = 0
  let reflections = 0
  const soundtrackAssets: NonNullable<CueSlide['assets']> = []
  const hasCueSoundtrack = hasAppliedSoundtrack || cue.assets?.some((asset) => asset.kind === 'audio')
  const slides = cue.slides.map((slide) => {
    const source = slide.sourceId ? recovery.slides.get(slide.sourceId) : undefined
    if (!source) return slide
    const previousCount = count
    const positioned = recoverPositionedScheduleFeeds(slide, source)
    count += positioned?.count ?? 0
    const assets = (positioned?.assets ?? slide.assets)?.map((asset) => {
      if (asset.kind !== 'camera' || asset.feedId) return asset
      const matching = source.assets?.filter((item) => item.kind === 'camera' && item.filename === asset.filename && item.role === asset.role)
      const video = matching?.length === 1 && !asset.feedVideo ? matching[0].feedVideo : undefined
      const sound = matching?.length === 1 && !asset.feedSound ? matching[0].feedSound : undefined
      if (!video && !sound) return asset
      count++
      return { ...asset, ...(video ? { feedVideo: video } : {}), ...(sound ? { feedSound: sound } : {}) }
    })
    const design = positioned?.design ?? slide.design
    const inherited = restoreMasterLayers(design, source.design)
    count += inherited?.cameras ?? 0
    backgrounds += inherited?.backgrounds ?? 0
    const geometry = restoreDesignGeometry(inherited?.design ?? design, source.design)
    rotations += geometry?.rotations ?? 0
    masks += geometry?.masks ?? 0
    borders += geometry?.borders ?? 0
    shadows += geometry?.shadows ?? 0
    reflections += geometry?.reflections ?? 0
    const soundtrack = slide.soundtrackEdited || hasCueSoundtrack
      || assets?.some((asset) => asset.kind === 'audio') || design?.soundtracks?.length ? undefined : inheritedSoundtrack(source)
    if (soundtrack) {
      soundtracks++
      soundtrackAssets.push(...soundtrack)
    }
    return count === previousCount && !inherited && !soundtrack && !geometry ? slide : { ...slide,
      ...(soundtrack ? { assets: [...(assets ?? []), ...soundtrack] } : assets ? { assets } : {}),
      ...(geometry ? { design: geometry.design } : inherited ? { design: inherited.design } : positioned ? { design: positioned.design } : {}) }
  })
  if (!count && !backgrounds && !soundtracks && !rotations && !masks && !borders && !shadows && !reflections) return undefined
  const warnings = new Set((cue.warnings ?? []).filter((warning) => !backgrounds || !warning.startsWith(MISSING_MASTER_BACKGROUND)))
  if (reflections) warnings.delete(unsupportedElementReflection)
  if (masks && !recovery.warnings?.includes(unsupportedEasyWorshipShape)) warnings.delete(unsupportedEasyWorshipShape)
  if ((borders || reflections) && warnings.delete(legacyElementDecorationWarning)) for (const warning of [unsupportedElementBorder, unsupportedElementReflection]) {
    if (recovery.warnings?.includes(warning)) warnings.add(warning)
  }
  if (backgrounds) for (const { design } of slides) for (const layer of design?.layers ?? []) {
    if (layer.kind === 'media' && layer.inheritedFromMaster && !layer.asset.libraryId && !layer.asset.archivePath) {
      warnings.add(`${MISSING_MASTER_BACKGROUND}${layer.asset.filename}`)
    }
  }
  const { warnings: _warnings, ...content } = cue
  return { cue: { ...content, slides, ...(warnings.size || cue.warnings ? { warnings: [...warnings] } : {}) },
    count, backgrounds, soundtracks, rotations, masks, borders, shadows, reflections, soundtrackAssets }
}

function recoverPositionedScheduleFeeds(slide: CueSlide, source: CueSlide) {
  const incoming = source.design
  if (!incoming || !slide.assets?.length) return undefined
  const { cameraMasterImported: _master, backgroundMasterImported: _background, ...design } = incoming
  const direct = design.layers.filter((layer) => !layer.inheritedFromMaster)
  const original = slide.design?.layers ?? []
  const surrounding = direct.filter((layer) => layer.kind !== 'camera')
  if (original.length !== surrounding.length || !surrounding.every((layer, index) =>
    original[index].id === layer.id && original[index].kind === layer.kind)) return undefined

  const replaced = new Set<NonNullable<CueSlide['assets']>[number]>()
  const feeds = direct.filter((layer) => layer.kind === 'camera')
  let index = 0
  const layers = direct.flatMap((layer) => {
    if (layer.kind !== 'camera') return [original[index++]]
    if (feeds.filter((feed) => feed.asset.filename === layer.asset.filename && feed.asset.role === layer.asset.role).length !== 1) return []
    const matching = slide.assets?.filter((asset) => !asset.feedId && asset.kind === 'camera'
      && asset.filename === layer.asset.filename && asset.role === layer.asset.role)
    if (matching?.length !== 1 || replaced.has(matching[0])) return []
    if (source.assets?.some((asset) => asset.kind === 'camera' && asset.filename === layer.asset.filename && asset.role === layer.asset.role)) return []
    replaced.add(matching[0])
    return [{ ...layer, asset: { ...layer.asset,
      ...(matching[0].feedVideo ? { feedVideo: matching[0].feedVideo } : {}),
      ...(matching[0].feedSound ? { feedSound: matching[0].feedSound } : {}),
    } }]
  })
  return replaced.size ? { count: replaced.size, assets: slide.assets.filter((asset) => !replaced.has(asset)),
    design: { ...(slide.design ?? design), layers } } : undefined
}

function formattedLegacyLayer(slide: CueSlide): TextLayer | undefined {
  return slide.design?.layers.find((layer): layer is TextLayer => layer.kind === 'text' && layer.id === 'lyrics' && Boolean(layer.runs))
}

function canRecoverLegacyFormatting(cue: PlaylistCue) {
  return ((cue.kind === 'song' && cue.metadata?.type === 1) || (cue.kind === 'scripture' && cue.metadata?.type === 2))
    && cue.metadata?.presentationUid === null
}

export function recoverableScheduleFormatting(cues: PlaylistCue[]) {
  const recovered = new Map<string, Map<string, CueSlide>>()
  for (const cue of cues) {
    if (!cue.sourceId) continue
    const legacy = canRecoverLegacyFormatting(cue)
    const slides = new Map<string, CueSlide>()
    for (const slide of cue.slides) {
      if (slide.sourceId && ((legacy && (slide.lyricRuns || formattedLegacyLayer(slide))) || hasParagraphList(slide.lyricRuns)
        || slide.design?.layers.some((layer) => layer.kind === 'text' && hasParagraphList(layer.runs)))) slides.set(slide.sourceId, slide)
    }
    if (slides.size) recovered.set(cue.sourceId, slides)
  }
  return recovered
}

function sameTextStyle(before: TextLayer['style'], source: TextLayer['style']) {
  const keys = Object.keys(source ?? {}) as Array<keyof NonNullable<TextLayer['style']>>
  return keys.length === Object.keys(before ?? {}).length && keys.every((key) => before?.[key] === source?.[key])
}

function fillLegacySlideFormatting(slide: CueSlide, source: CueSlide): CueSlide {
  if (slide.lyricRuns || slide.slideLayout || slide.lines.join('\n') !== source.lines.join('\n')) return slide
  if (!slide.design) return source.lyricRuns ? { ...slide, lyricRuns: source.lyricRuns } : slide
  const formatted = formattedLegacyLayer(source)
  if (!formatted?.runs) return slide
  const original = slide.design.layers.find((layer) => layer.kind === 'text' && layer.id === formatted.id)
  if (original?.kind !== 'text' || original.runs || !sameTextStyle(original.style, formatted.style)
    || !(Object.keys(formatted.frame) as Array<keyof TextLayer['frame']>).every((key) => original.frame[key] === formatted.frame[key])) return slide
  // Older colored Scripture slides stored the automatic reference inside the verse layer.
  const oldReference = formatted.slot === 'content' && !original.slot && original.text === `${formatted.text}\n${source.label}`
  if (original.text !== formatted.text && !oldReference) return slide
  const runs = oldReference ? [...formatted.runs, { text: `\n${source.label}` }] : formatted.runs
  return { ...slide, design: { ...slide.design, layers: slide.design.layers.map((layer) => layer === original ? { ...original, runs } : layer) } }
}

function fillSlideLists(slide: CueSlide, source: CueSlide): CueSlide {
  const text = slide.lines.join('\n')
  const lyricRuns = text === source.lines.join('\n') ? recoverMissingParagraphLists(text, slide.lyricRuns, source.lyricRuns) : undefined
  const layers = slide.design?.layers
  const candidates = new Map(source.design?.layers.map((layer) => [layer.id, layer]))
  const restored = layers?.map((layer) => {
    const next = candidates.get(layer.id)
    if (layer.kind !== 'text' || layer.songArtwork || next?.kind !== 'text' || layer.text !== next.text || layer.slot !== next.slot) return layer
    const runs = recoverMissingParagraphLists(layer.text, layer.runs, next.runs)
    return runs ? { ...layer, runs } : layer
  })
  const design = slide.design && restored?.some((layer, index) => layer !== layers?.[index]) ? { ...slide.design, layers: restored } : undefined
  return lyricRuns || design ? { ...slide, ...(lyricRuns ? { lyricRuns } : {}), ...(design ? { design } : {}) } : slide
}

export function fillScheduleFormatting(cue: PlaylistCue, recovered: ReturnType<typeof recoverableScheduleFormatting>) {
  const sources = cue.sourceId ? recovered.get(cue.sourceId) : undefined
  if (!sources) return undefined
  const legacy = !cue.slideLayout && canRecoverLegacyFormatting(cue)
  let count = 0
  const slides = cue.slides.map((slide) => {
    const source = slide.sourceId && sources.get(slide.sourceId)
    const formatted = source ? fillSlideLists(legacy ? fillLegacySlideFormatting(slide, source) : slide, source) : slide
    if (formatted !== slide) count++
    return formatted
  })
  return count ? { cue: { ...cue, slides }, count } : undefined
}
