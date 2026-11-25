/** Copies source slide assets into the browser library and rewrites their references. */

import type { DesignAsset, DesignContent, DesignLayer, DesignSoundtrack, DesignTextRun, SlideDesign, SongAppearance, SongSlideLayout } from '../types/slideDesign'
import { saveMigratedLibraryMedia } from './mediaLibrary'
import { mapSongLayoutMedia } from './songSlideLayout'
import { MISSING_MASTER_BACKGROUND, MISSING_VERIFIED_LAYOUT_MEDIA } from './slideDesign'
import { backfillDesignMediaPlayback, backfillDesignSlidePlayback, hasDesignSlidePlayback } from './designSlidePlayback'
import { hasImportedMediaPlayback } from './easyWorshipMediaPlaybackRecovery'
import { withProfileMedia } from './easyWorshipProfileFiles'
import type { WithMediaBlob } from './zipAsset'
import { invalidImportedPresentationNotes } from './speakerNotes'
import { hasDesignGeometry, isNativeBorderOnlyLayer, restoreSlideGeometry } from './designLayerGeometry'
import { unsupportedEasyWorshipShape } from './easyWorshipShape'
import { legacyElementDecorationWarning, unsupportedElementBorder, unsupportedElementReflection } from './easyWorshipElementBorder'
import { recoverMissingParagraphLists } from './songParagraphFormatting'

export type SlideAssetReader = (sourcePath: string) => Promise<Blob>
const legacyTransitionWarning = 'เก็บเวลาเลื่อนสไลด์ได้ ส่วนเอฟเฟ็กต์เปลี่ยนฉากยังไม่รองรับ'

export async function storeSongAppearance(appearance: SongAppearance, readAsset?: SlideAssetReader,
  cache = new Map<string, string | null>(), withAsset?: WithMediaBlob) {
  if (!readAsset) return appearance
  const designs = [...(appearance.defaultDesign ? [appearance.defaultDesign] : []), ...(appearance.sections ?? []).map(({ design }) => design)]
  const result = await storeSlideDesignAssets({
    slides: designs.map((design, index) => ({ id: String(index), label: '', design })), warnings: appearance.warnings,
  }, readAsset, { cache, allowMissing: true, withAsset })
  const warnings = new Set(result.warnings)
  const offset = appearance.defaultDesign ? 1 : 0
  const slideLayout = appearance.slideLayout && await storeSongLayoutAssets(appearance.slideLayout, readAsset, cache, warnings, withAsset)
  return {
    ...(appearance.looping !== undefined ? { looping: appearance.looping } : {}),
    ...(slideLayout ? { slideLayout } : {}),
    ...(appearance.defaultDesign ? { defaultDesign: result.slides[0].design } : {}),
    ...(appearance.sections ? { sections: appearance.sections.map((entry, index) => ({ ...entry, design: result.slides[index + offset].design })) } : {}),
    ...(warnings.size ? { warnings: [...warnings] } : {}),
  }
}

/** Retain the original hash input for layouts imported before the presentation fields. */
export function easyWorshipDesignIdentityContent(content: DesignContent, legacyTransitionWarningAt?: number): DesignContent {
  const { webLayersImported: _webLayersImported, dvdLayersImported: _dvdLayersImported, cameraLayersImported: _cameraLayersImported,
    easyWorshipChecksumImportId: _checksumImportId, notes: _notes, easyWorshipDecorationWarningAt,
    ...identity } = content
  if (identity.source) {
    const { collectionDetails: _details, ...source } = identity.source
    identity.source = source
  }
  const warnings = (content.warnings ?? []).filter((warning) => !warning.startsWith(MISSING_MASTER_BACKGROUND)
    && !warning.startsWith(MISSING_VERIFIED_LAYOUT_MEDIA) && warning !== invalidImportedPresentationNotes && warning !== unsupportedEasyWorshipShape
    && warning !== unsupportedElementBorder && warning !== unsupportedElementReflection)
  if (!warnings.length && content.warnings?.length) delete identity.warnings
  if (easyWorshipDecorationWarningAt !== undefined && !warnings.includes(legacyElementDecorationWarning)) {
    warnings.splice(easyWorshipDecorationWarningAt, 0, legacyElementDecorationWarning)
  }
  if (legacyTransitionWarningAt !== undefined) {
    warnings.splice(legacyTransitionWarningAt, 0, legacyTransitionWarning)
  }
  return {
    ...identity,
    slides: content.slides.map(({ transition: _transition, transitionEdited: _transitionEdited, playback: _playback, songLabel: _songLabel, design, ...slide }) => {
      const { cameraMasterImported: _master, backgroundMasterImported: _background, ...originalDesign } = design
      const layers = design.layers.flatMap((originalLayer): DesignLayer[] => {
        if (isNativeBorderOnlyLayer(originalLayer)) return []
        const { rotation: _rotation, clipPaths: _clipPaths, shapePaths: _shapePaths, presetShape: _presetShape,
          elementBorder: _elementBorder, elementShadow: _elementShadow,
          elementReflection: _elementReflection, ...unclipped } = originalLayer
        const layer = withoutVisualRole(unclipped)
        if (layer.kind === 'web' || layer.kind === 'camera' || isDvdLayer(layer)) return []
        if (layer.inheritedFromMaster && (layer.kind !== 'media' || !layer.asset.easyWorshipFileHash)) return []
        if (layer.kind === 'media' && (layer.asset.clip || layer.asset.easyWorshipFileHash || layer.asset.posterSeconds !== undefined
          || layer.asset.playback || layer.easyWorshipLegacyPlayback)) {
          const { easyWorshipLegacyPlayback, ...original } = layer
          const { clip: _clip, posterSeconds: _poster, playback: _playback, ...asset } = layer.asset
          return [{ ...original, ...easyWorshipLegacyPlayback, asset: checksumAssetIdentity(asset) }]
        }
        if (layer.kind !== 'text') return [layer]
        if (layer.presentationField && layer.id.startsWith('template:')) return []
        const { presentationField: _field, runs: _runs, textLayout: _layout, ...original } = layer
        return [original]
      })
      const { soundtracks, ...original } = originalDesign
      const tracks = soundtracks?.map(({ playback: _playback, easyWorshipLegacyRepeat, ...track }) => {
        if (easyWorshipLegacyRepeat === false) delete track.repeat
        return checksumAssetIdentity(track)
      })
      return { ...slide, design: { ...original, layers, ...(tracks ? { soundtracks: tracks } : {}) } }
    }),
    ...(warnings.length ? { warnings } : {}),
  }
}

function checksumAssetIdentity<T extends DesignAsset | DesignSoundtrack>(asset: T): T {
  if (!asset.easyWorshipFileHash) return asset
  const identity = { ...asset, filename: '' }
  delete identity.libraryId
  delete identity.sourcePath
  return identity
}

function orderedJson(value: unknown) {
  return JSON.stringify(value, (_, item: unknown) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    return item
  })
}

function withoutVideoPoster(layer: DesignLayer): DesignLayer {
  const rest = withoutVisualRole(layer)
  if (rest.kind !== 'media' || rest.asset.posterSeconds === undefined) return rest
  const { posterSeconds: _poster, ...asset } = rest.asset
  return { ...rest, asset }
}

function withoutVisualRole(layer: DesignLayer): DesignLayer {
  if ((layer.kind !== 'media' && layer.kind !== 'fill') || layer.role === undefined) return layer
  const { role: _role, ...rest } = layer
  return rest
}

function isDvdLayer(layer: DesignLayer) {
  return layer.kind === 'media' && Boolean(layer.asset.dvd)
}

/** Fill previously unsupported layers while preserving the operator's saved layers and edits. */
export function restoreMasterLayers(saved: SlideDesign | undefined, source: SlideDesign | undefined) {
  const camera = source?.cameraMasterImported && !saved?.cameraMasterImported
  const background = source?.backgroundMasterImported && !saved?.backgroundMasterImported
  if (!source || !(camera || background)) return undefined
  const existing = saved?.layers ?? []
  const ids = new Set(existing.map(({ id }) => id))
  const layers: DesignLayer[] = []
  let cameras = 0
  let backgrounds = 0
  let index = 0
  for (const layer of source.layers) {
    if (layer.inheritedFromMaster && !ids.has(layer.id)) {
      if (layer.kind === 'camera' && camera) { layers.push(layer); cameras++ }
      if ((layer.kind === 'fill' || layer.kind === 'media') && background) { layers.push(layer); backgrounds++ }
      continue
    }
    const current = existing[index++]
    if (current?.id !== layer.id || current.kind !== layer.kind) return undefined
    layers.push(current)
  }
  if (index !== existing.length || !(cameras || backgrounds)) return undefined
  return { cameras, backgrounds, design: { ...(saved ?? source), layers,
    ...(cameras ? { cameraMasterImported: true as const } : {}), ...(backgrounds ? { backgroundMasterImported: true as const } : {}) } }
}

function comparableTextRuns(runs: DesignTextRun[], keepAlignment: boolean): DesignTextRun[] {
  const result: DesignTextRun[] = []
  for (const { align, paragraph: _paragraph, ...run } of runs) {
    const alignment = keepAlignment ? align : undefined
    const previous = result[result.length - 1]
    if (previous && previous.align === alignment && orderedJson(previous.style) === orderedJson(run.style)) previous.text += run.text
    else result.push({ ...run, ...(alignment ? { align: alignment } : {}) })
  }
  return result
}

export function backfillImportedTextLayout(layer: DesignLayer, next?: DesignLayer): DesignLayer {
  if (layer.kind !== 'text' || next?.kind !== 'text' || layer.text !== next.text || layer.slot !== next.slot) return layer
  const listRuns = recoverMissingParagraphLists(layer.text, layer.runs, next.runs)
  if (orderedJson(layer.frame) !== orderedJson(next.frame) || orderedJson(layer.style) !== orderedJson(next.style)) {
    return listRuns ? { ...layer, runs: listRuns } : layer
  }
  const textLayout = layer.textLayout ?? next.textLayout
  const formatted = next.runs
  const oldRuns = layer.runs
  let runs = listRuns ?? oldRuns
  const hasAlignment = oldRuns?.some((run) => run.align) ?? false
  const missingAlignment = formatted?.some((run) => run.align) && !hasAlignment
  const hasParagraphs = oldRuns?.some((run) => run.paragraph)
  const missingParagraphs = formatted?.some((run) => run.paragraph) && !hasParagraphs
  if (formatted && (missingParagraphs || (missingAlignment && !hasParagraphs))) {
    const previousStylesMatch = oldRuns
      ? orderedJson(comparableTextRuns(oldRuns, hasAlignment)) === orderedJson(comparableTextRuns(formatted, hasAlignment))
      : formatted.every((run) => Object.entries(run.style ?? {}).every(([key, value]) =>
        (key === 'bold' || key === 'italic' || key === 'underline') && value === Boolean(layer.style?.[key])))
    if (previousStylesMatch) runs = formatted
  }
  if (runs === oldRuns && textLayout === layer.textLayout) return layer
  return { ...layer, ...(textLayout ? { textLayout } : {}), ...(runs ? { runs } : {}) }
}

export function hasImportedLayoutDetails(content: DesignContent): boolean {
  return content.source?.format === 'easyworship' && (Boolean(content.notes) || hasDesignSlidePlayback(content.slides) || content.slides.some(({ design }) =>
    design.layers.some((layer) => layer.kind === 'web' || layer.kind === 'camera'
      || isDvdLayer(layer)
      || (layer.kind === 'media' && layer.asset.easyWorshipFileHash && layer.asset.libraryId)
      || (layer.kind === 'text' && (layer.textLayout || layer.runs?.some((run) => run.align || run.paragraph))))
    || design.soundtracks?.some((track) => track.easyWorshipFileHash && track.libraryId)
    || hasImportedMediaPlayback(design) || hasDesignGeometry(design)))
}

export function backfillImportedCollectionDetails(existing: DesignContent, imported: DesignContent): DesignContent {
  const saved = existing.source
  const incoming = imported.source
  if (!saved || !incoming || saved.format !== incoming.format || saved.uid !== incoming.uid) return existing
  const catalogUid = saved.catalogUid ?? incoming.catalogUid
  let collectionDetails = saved.collectionDetails
  if (incoming.collectionDetails) {
    const details = Object.fromEntries(Object.entries(incoming.collectionDetails).filter(([, value]) => value !== undefined))
    collectionDetails = !saved.catalogUid && catalogUid
      ? { ...saved.collectionDetails, ...details } : { ...details, ...saved.collectionDetails }
  }
  if (catalogUid === saved.catalogUid && orderedJson(collectionDetails) === orderedJson(saved.collectionDetails)) return existing
  return { ...existing, source: { ...saved, catalogUid, collectionDetails } }
}

/** Fill newer formatting fields and live layers while preserving edited designs. */
export function backfillImportedLayoutDetails(existing: DesignContent, imported: DesignContent): DesignContent {
  if (existing.source?.format !== 'easyworship' || imported.source?.format !== 'easyworship' || existing.source.uid !== imported.source.uid) return existing
  const incomingSlides = new Map(imported.slides.map((slide) => [slide.id, slide]))
  const playback = backfillDesignSlidePlayback(existing.slides, imported.slides)
  const geometry = restoreSlideGeometry(playback.slides, imported.slides)
  const restoredShape = geometry.masks > 0 && !imported.warnings?.includes(unsupportedEasyWorshipShape)
  const obsoleteWarning = playback.matchedTransition && existing.warnings?.includes(legacyTransitionWarning)
  const notes = existing.notes === undefined ? imported.notes : undefined
  const replacedDecorationWarning = imported.easyWorshipDecorationWarningAt !== undefined && existing.warnings?.includes(legacyElementDecorationWarning)
  let changed = Boolean(playback.count || geometry.slides !== playback.slides || obsoleteWarning || notes || replacedDecorationWarning)
  let restoredWeb = false
  let restoredDvd = false
  let restoredCamera = false
  const updatedSlides = geometry.slides.map((slide) => {
    const incoming = incomingSlides.get(slide.id)
    if (!incoming) return slide
    const sourceLayers = incoming.design.layers
    const incomingLayers = new Map(sourceLayers.map((layer) => [layer.id, layer]))
    const layers = slide.design.layers.map((layer) => {
      const next = incomingLayers.get(layer.id)
      const filled = layer.kind === 'media' && next?.kind === 'media' && canRestoreAsset(layer.asset, next.asset, Boolean(layer.inheritedFromMaster && next.inheritedFromMaster))
        ? { ...layer, asset: { ...layer.asset, libraryId: next.asset.libraryId, filename: next.asset.filename } }
        : backfillImportedTextLayout(layer, next)
      changed ||= filled !== layer
      return filled
    })
    const soundtracks = slide.design.soundtracks?.map((track) => {
      const next = track.easyWorshipFileHash && incoming.design.soundtracks?.find((candidate) =>
        candidate.easyWorshipFileHash === track.easyWorshipFileHash && candidate.role === track.role)
      if (!next || !canRestoreAsset(track, next)) return track
      changed = true
      return { ...track, libraryId: next.libraryId, filename: next.filename }
    })
    const webMissing = !existing.webLayersImported && !layers.some((layer) => layer.kind === 'web')
    const dvdMissing = !existing.dvdLayersImported && !layers.some(isDvdLayer)
    const cameraMissing = !existing.cameraLayersImported && !layers.some((layer) => layer.kind === 'camera')
    const missingLayer = (layer: DesignLayer) => (webMissing && layer.kind === 'web') || (dvdMissing && isDvdLayer(layer))
      || (cameraMissing && layer.kind === 'camera' && !layer.inheritedFromMaster)
    const withoutMaster = sourceLayers.filter((layer) => !layer.inheritedFromMaster)
    let restored = layers
    if (withoutMaster.some(missingLayer) && orderedJson(layers.map(withoutVideoPoster))
      === orderedJson(withoutMaster.filter((layer) => !missingLayer(layer)).map(withoutVideoPoster))) {
      let index = 0
      restored = withoutMaster.map((layer) => missingLayer(layer) ? layer : layers[index++])
      changed = true
      restoredWeb ||= webMissing && sourceLayers.some((layer) => layer.kind === 'web')
      restoredDvd ||= dvdMissing && sourceLayers.some(isDvdLayer)
      restoredCamera ||= cameraMissing && withoutMaster.some((layer) => layer.kind === 'camera')
    }
    const design = { ...slide.design, layers: restored, ...(soundtracks ? { soundtracks } : {}) }
    const inherited = restoreMasterLayers(design, incoming.design)
    changed ||= Boolean(inherited)
    restoredCamera ||= Boolean(inherited?.cameras)
    return { ...slide, design: inherited?.design ?? design }
  })
  const { slides, count: mediaCount } = backfillDesignMediaPlayback(updatedSlides, imported.slides)
  changed ||= mediaCount > 0
  if (!changed) return existing
  const warnings = new Set((existing.warnings ?? []).filter((warning) => !warning.startsWith(MISSING_MASTER_BACKGROUND)
    && !warning.startsWith(MISSING_VERIFIED_LAYOUT_MEDIA) && !(obsoleteWarning && warning === legacyTransitionWarning)
    && !(replacedDecorationWarning && warning === legacyElementDecorationWarning)
    && !(geometry.reflections && warning === unsupportedElementReflection)
    && !(restoredShape && warning === unsupportedEasyWorshipShape)
    && !(notes && warning === invalidImportedPresentationNotes)))
  if (replacedDecorationWarning) for (const warning of [unsupportedElementBorder, unsupportedElementReflection]) {
    if (imported.warnings?.includes(warning)) warnings.add(warning)
  }
  for (const { design } of slides) {
    for (const layer of design.layers) {
      if (layer.kind !== 'media' || layer.asset.libraryId || layer.asset.archivePath || layer.asset.sourcePath) continue
      if (layer.asset.easyWorshipFileHash) warnings.add(MISSING_VERIFIED_LAYOUT_MEDIA + layer.asset.filename)
      else if (layer.inheritedFromMaster) warnings.add(MISSING_MASTER_BACKGROUND + layer.asset.filename)
    }
    for (const track of design.soundtracks ?? []) {
      if (track.easyWorshipFileHash && !track.libraryId && !track.archivePath && !track.sourcePath) {
        warnings.add(MISSING_VERIFIED_LAYOUT_MEDIA + track.filename)
      }
    }
  }
  const { warnings: _warnings, ...content } = existing
  return { ...content, slides, ...(notes ? { notes } : {}),
    ...(replacedDecorationWarning ? { easyWorshipDecorationWarningAt: imported.easyWorshipDecorationWarningAt } : {}),
    ...(restoredWeb ? { webLayersImported: true } : {}), ...(restoredDvd ? { dvdLayersImported: true } : {}),
    ...(restoredCamera ? { cameraLayersImported: true } : {}), ...(warnings.size ? { warnings: [...warnings] } : {}) }
}

function canRestoreAsset(current: DesignAsset | DesignSoundtrack, incoming: DesignAsset | DesignSoundtrack, inherited = false) {
  return !current.libraryId && !current.archivePath && !current.sourcePath && Boolean(incoming.libraryId) && current.kind === incoming.kind
    && (current.easyWorshipFileHash ? current.easyWorshipFileHash === incoming.easyWorshipFileHash : inherited && current.filename === incoming.filename)
}

function slideAssetStore(
  readAsset: SlideAssetReader,
  cache: Map<string, string | null>,
  warnings: Set<string>,
  allowMissing?: boolean,
  withAsset?: WithMediaBlob,
) {
  return async function storeAsset<T extends DesignAsset | DesignSoundtrack>(original: T): Promise<T> {
    const { sourcePath, importSourceId, importName } = original
    if (!sourcePath) return original
    if (!cache.has(sourcePath)) {
      try {
        const source = { read: readAsset, withMedia: sourcePath.startsWith('\0') ? undefined : withAsset }
        const saved = await withProfileMedia(source, sourcePath, (blob) => saveMigratedLibraryMedia(blob, {
          filename: original.filename, kind: original.kind, sourceId: importSourceId, name: importName,
          ...(original.kind === 'video' && original.alphaMode ? { alphaMode: original.alphaMode } : {}),
          ...(!importSourceId ? { generatedReference: true } : {}),
        }))
        cache.set(sourcePath, saved.assetId)
      } catch (cause) {
        if (allowMissing === false || (!allowMissing && original.kind !== 'audio')) {
          const reason = cause instanceof Error ? ` · ${cause.message}` : ''
          throw new Error(`เก็บไฟล์ ${original.filename} ในเบราว์เซอร์ไม่สำเร็จ${reason}`)
        }
        cache.set(sourcePath, null)
      }
    }
    const libraryId = cache.get(sourcePath)
    if (!libraryId) warnings.add(original.easyWorshipFileHash
      ? MISSING_VERIFIED_LAYOUT_MEDIA + original.filename : `เก็บไฟล์ ${original.filename} ในคลังสื่อไม่สำเร็จ`)
    const asset = { ...original, ...(libraryId ? { libraryId } : {}) }
    delete asset.sourcePath
    delete asset.importSourceId
    delete asset.importName
    return asset
  }
}

export function storeSongLayoutAssets(layout: SongSlideLayout, readAsset: SlideAssetReader, cache: Map<string, string | null>, warnings: Set<string>, withAsset?: WithMediaBlob) {
  const storeAsset = slideAssetStore(readAsset, cache, warnings, true, withAsset)
  return mapSongLayoutMedia(layout, (asset) => {
    const { archivePath, ...local } = asset
    if (local.libraryId) return Promise.resolve(local)
    return storeAsset(local.sourcePath || !archivePath ? local : { ...local, sourcePath: archivePath })
  })
}

export async function storeSlideDesignAssets(
  content: DesignContent,
  readAsset: SlideAssetReader,
  options: { cache?: Map<string, string | null>; allowMissing?: boolean; withAsset?: WithMediaBlob } = {},
): Promise<DesignContent> {
  const warnings = new Set(content.warnings)
  const storeAsset = slideAssetStore(readAsset, options.cache ?? new Map(), warnings, options.allowMissing, options.withAsset)
  const slides: DesignContent['slides'] = []

  for (const slide of content.slides) {
    const layers: DesignLayer[] = []
    for (const layer of slide.design.layers) {
      layers.push(layer.kind === 'media' ? { ...layer, asset: await storeAsset(layer.asset) } : layer)
    }
    const soundtracks: DesignSoundtrack[] = []
    const { soundtracks: sourceTracks, ...design } = slide.design
    for (const track of sourceTracks ?? []) {
      const stored = await storeAsset(track)
      if (!stored.powerPointTransitionSound || stored.libraryId || stored.archivePath) soundtracks.push(stored)
    }
    slides.push({ ...slide, design: { ...design, layers, ...(soundtracks.length || sourceTracks?.length === 0 ? { soundtracks } : {}) } })
  }
  return { ...content, slides, ...(warnings.size ? { warnings: [...warnings] } : {}) }
}
