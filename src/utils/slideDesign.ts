/** Converts reusable designs into playlist slides and substitutes live theme content. */

import type { PlaylistCue, PlaylistCueAsset } from '../types/database'
import type { DesignLayer, DesignTextRun, LibraryDesign, PresentationField, SlideDesign } from '../types/slideDesign'
import { presentationWebUrl } from './livePresentation'
import { powerPointOnlineVideoUrl } from './powerPoint/onlineVideo'
import { mediaObjectFit } from './mediaPlayback'

export const DESIGN_KIND_LABELS = {
  presentation: 'งานนำเสนอ',
  'song-theme': 'ธีมเพลง',
  'scripture-theme': 'ธีมพระคัมภีร์',
  'text-theme': 'ธีมเพลงและพระคัมภีร์',
  'presentation-theme': 'ธีมงานนำเสนอ',
}

type TextLayer = Extract<DesignLayer, { kind: 'text' }>

export function visibleDesignTextRuns(layer: TextLayer): DesignTextRun[] | undefined {
  return layer.runs?.map((run) => run.text).join('') === layer.text ? layer.runs : undefined
}

function withoutTextRuns(layer: TextLayer, text: string): TextLayer {
  const { runs: _runs, ...unformatted } = layer
  return { ...unformatted, text }
}

export function sliceTextRuns(runs: DesignTextRun[], start: number, end: number) {
  let offset = 0
  return runs.flatMap((run) => {
    const fragment = run.text.slice(Math.max(0, start - offset), Math.max(0, end - offset))
    offset += run.text.length
    return fragment ? [{ ...run, text: fragment }] : []
  })
}

export function compactTextRuns(runs: DesignTextRun[]) {
  const compact: DesignTextRun[] = []
  let previousFormat: string | undefined
  for (const run of runs) {
    if (!run.text) continue
    const { style, ...fields } = run
    const formatted = style && Object.values(style).some((value) => value !== undefined) ? style : undefined
    const format = JSON.stringify([run.align, run.paragraph, formatted])
    if (format === previousFormat) compact[compact.length - 1].text += run.text
    else compact.push(formatted ? { ...fields, style: formatted } : fields)
    previousFormat = format
  }
  return compact
}

function reflowTextRuns(runs: DesignTextRun[], text: string): DesignTextRun[] | undefined {
  const compact = runs.map((run) => ({ ...run, text: run.text.replace(/\s/g, '') }))
  const original = compact.map((run) => run.text).join('')
  const fragment = text.replace(/\s/g, '')
  const found = original.indexOf(fragment)
  if (!fragment || found < 0 || original.lastIndexOf(fragment) !== found) return undefined
  const sections = sliceTextRuns(compact, found, found + fragment.length)
  let offset = 0
  // The lyric wrapper can insert a line break between Thai words with no source space.
  return sections.map((run, index) => {
    const start = offset
    let characters = run.text.length
    while (characters > 0 && offset < text.length) {
      if (/\S/.test(text[offset])) characters--
      offset++
    }
    return { ...run, text: text.slice(start, index === sections.length - 1 ? text.length : offset) }
  })
}

/** Keeps the original formatting on either side of a plain-text edit. */
export function editDesignText(layer: TextLayer, text: string): TextLayer {
  if (layer.text === text) return layer
  const runs = editTextRuns(visibleDesignTextRuns(layer), layer.text, text)
  return runs ? { ...layer, text, runs } : withoutTextRuns(layer, text)
}

function joinEditedParagraphs(runs: DesignTextRun[]) {
  let previousIndex: number | undefined
  let previousText = ''
  let format: Pick<DesignTextRun, 'paragraph' | 'align'> = {}
  return runs.map((run) => {
    const index = run.paragraph?.index
    if (index !== previousIndex && (!run.paragraph || !format.paragraph || previousText.endsWith('\n') || run.text.startsWith('\n'))) {
      format = { paragraph: run.paragraph, align: run.align }
    }
    previousIndex = index
    previousText = run.text
    return format.paragraph && format.paragraph !== run.paragraph && format.paragraph.index !== index ? { ...run, ...format } : run
  })
}

export function editTextRuns(source: DesignTextRun[] | undefined, before: string, text: string) {
  if (!source || !text || before === text) return text ? source : undefined
  const shared = Math.min(before.length, text.length)
  let prefix = 0
  let suffix = 0
  while (prefix < shared && before[prefix] === text[prefix]) prefix++
  if (prefix > 0 && /[\uD800-\uDBFF]/.test(before[prefix - 1])) prefix--
  while (suffix < shared - prefix && before[before.length - 1 - suffix] === text[text.length - 1 - suffix]) suffix++
  if (suffix > 0 && /[\uDC00-\uDFFF]/.test(before[before.length - suffix])) suffix--
  const replacedAll = !prefix && !suffix
  const initial = source.find((run) => run.text)
  if (replacedAll && !initial?.paragraph) return undefined

  const left = sliceTextRuns(source, 0, prefix)
  const right = sliceTextRuns(source, before.length - suffix, before.length)
  const replacement = text.slice(prefix, text.length - suffix)
  const original = sliceTextRuns(source, prefix, Math.min(prefix + 1, before.length))[0]
  const format = replacedAll ? { paragraph: initial?.paragraph, align: initial?.align } : original ?? left[left.length - 1]
  const paragraph = format?.paragraph
  let inserted: DesignTextRun[] = replacement ? [{ ...format, text: replacement }] : []
  if (paragraph && replacement.includes('\n')) {
    const used = new Set(source.map((run) => run.paragraph?.index))
    let index = 0
    let continuation = paragraph
    const lines = replacement.split('\n')
    inserted = lines.flatMap((line, position) => {
      if (position) {
        while (used.has(index)) index++
        continuation = { ...paragraph, index: index++ }
        if (paragraph.list && paragraph.list.start !== undefined) continuation.list = { ...paragraph.list, start: undefined }
      }
      const text = line + (position < lines.length - 1 ? '\n' : '')
      return text ? [{ ...format, text, paragraph: continuation }] : []
    })
    for (const [position, run] of right.entries()) {
      if (run.paragraph?.index !== paragraph.index) break
      right[position] = { ...run, paragraph: continuation }
    }
  }
  const candidate = [...left, ...inserted, ...right]
  const runs = candidate.some((run) => run.paragraph) ? joinEditedParagraphs(candidate) : candidate
  return runs.some((run) => run.style || run.align || run.paragraph) ? runs : undefined
}

function applySlotText(layer: TextLayer, text: string): TextLayer {
  const runs = layer.runs
  const source = runs?.map((run) => run.text).join('')
  if (!runs || !source || !text) return withoutTextRuns(layer, text)
  if (text === source) return { ...layer, text }
  const start = source.indexOf(text)
  const end = start + text.length
  if (start >= 0 && source.lastIndexOf(text) === start && (start === 0 || /\s/.test(source[start - 1]))
    && (end === source.length || /\s/.test(source[end]))) return { ...layer, text, runs: sliceTextRuns(runs, start, end) }
  const reflowed = !layer.text && reflowTextRuns(runs, text)
  return reflowed ? { ...layer, text, runs: reflowed } : withoutTextRuns(layer, text)
}

export function applyThemeText(design: SlideDesign, content: string, reference = ''): SlideDesign {
  const referenceSlot = design.layers.some((layer) => layer.kind === 'text' && layer.slot === 'reference')
  return {
    ...design,
    layers: design.layers.map((layer) => {
      if (layer.kind !== 'text' || !layer.slot) return layer
      if (layer.slot === 'reference') return applySlotText(layer, reference)
      return applySlotText(layer, [content, referenceSlot ? '' : reference].filter(Boolean).join('\n'))
    }),
  }
}

export function withDesignBackground(design: SlideDesign, asset: PlaylistCueAsset): SlideDesign {
  if ((asset.kind !== 'image' && asset.kind !== 'video') || !asset.libraryId) return design

  const replacement: DesignLayer = {
    id: 'playlist-background',
    kind: 'media',
    frame: { x: 0, y: 0, width: 1, height: 1 },
    fit: mediaObjectFit(asset.playback, true) ?? 'cover',
    ...(asset.kind === 'video' && asset.repeat !== undefined ? { loop: asset.repeat } : {}),
    asset: { kind: asset.kind, filename: asset.filename, libraryId: asset.libraryId, ...(asset.clip ? { clip: asset.clip } : {}),
      ...(asset.mediaCatalog ? { mediaCatalog: asset.mediaCatalog } : {}),
      ...(asset.posterSeconds !== undefined ? { posterSeconds: asset.posterSeconds } : {}),
      ...(asset.alphaMode ? { alphaMode: asset.alphaMode } : {}), ...(asset.playback ? { playback: asset.playback } : {}) },
  }
  const layers = design.layers.filter((layer) => !isCanvasBackground(layer))
  return { ...design, inheritBackground: undefined, layers: [replacement, ...layers] }
}

export const MISSING_MASTER_BACKGROUND = 'ไม่พบไฟล์พื้นหลังจากแม่แบบ '
export const MISSING_VERIFIED_LAYOUT_MEDIA = 'ไม่พบสื่อที่ตรงกับ SHA-256 ในเลย์เอาต์ · '

function fillsCanvas({ frame }: DesignLayer) {
  return frame.x <= 0.01 && frame.y <= 0.01 && frame.width >= 0.99 && frame.height >= 0.99
}

export function isOutputBackground(layer: DesignLayer): boolean {
  if (layer.kind === 'camera') return layer.asset.role === 'background'
  if (layer.songArtwork || layer.kind === 'text') return false
  if (layer.kind === 'web') return layer.role === 'background'
  return layer.role ? layer.role === 'background' : Boolean(layer.inheritedFromMaster) || fillsCanvas(layer)
}

export function isCanvasBackground(layer: DesignLayer) {
  return isOutputBackground(layer) && fillsCanvas(layer)
}

export function withoutCanvasBackground(design: SlideDesign): SlideDesign {
  return { ...design, layers: design.layers.filter((layer) => !isCanvasBackground(layer)) }
}

export function isFullCanvasMediaSlide(design: SlideDesign): boolean {
  return design.layers.filter((layer) => layer.kind === 'media').length === 1
    && design.layers.every((layer) => layer.kind === 'text' ? !layer.text.trim()
      : layer.kind === 'media' ? !layer.songArtwork && fillsCanvas(layer) : isCanvasBackground(layer))
}

export function applyPresentationBackground(theme: SlideDesign, slide: SlideDesign, replace: boolean): SlideDesign {
  if (!replace && slide.layers.some(isCanvasBackground)) return slide
  const backdrop = theme.layers.filter(isCanvasBackground).map((layer) => ({ ...layer, id: `default:${layer.id}` }))
  if (!backdrop.length) return slide
  return { ...slide, inheritBackground: undefined, layers: [...backdrop, ...withoutCanvasBackground(slide).layers] }
}

export function isScriptureFrame(layer: DesignLayer): layer is TextLayer {
  return layer.kind === 'text' && Boolean(layer.scriptureSource || layer.presentationField === 'scripture')
}

export function applyPresentationLayout(theme: SlideDesign, slide: SlideDesign): SlideDesign {
  const text: Partial<Record<PresentationField, TextLayer>> = {}
  const scripture = new Map<string, TextLayer>()
  for (const layer of slide.layers) {
    if (layer.kind === 'text' && layer.presentationField) text[layer.presentationField] = layer
    if (isScriptureFrame(layer)) scripture.set(layer.id, layer)
  }

  const used = new Set<string>()
  const layers = theme.layers.map((layer) => {
    const authored = scripture.get(layer.id)
    if (layer.kind === 'text' && layer.scriptureSource && authored?.scriptureSource && !authored.presentationField) {
      used.add(authored.id)
      return authored
    }
    if (layer.kind !== 'text' || !layer.presentationField) return layer
    const source = text[layer.presentationField]
    if (source) used.add(source.id)
    const { scriptureSource: _scriptureSource, ...target } = layer
    const styled = source?.scriptureSource ? { ...target, scriptureSource: source.scriptureSource } : target
    const runs = source && visibleDesignTextRuns(source)
    return runs ? { ...styled, text: source.text, runs } : withoutTextRuns(styled, source?.text ?? '')
  })

  const layerIds = new Set(layers.map(({ id }) => id))
  for (const frame of scripture.values()) {
    if (used.has(frame.id) || !frame.text.trim()) continue
    let id = frame.id
    while (layerIds.has(id)) id = `slide:${id}`
    layers.push(id === frame.id ? frame : { ...frame, id })
    layerIds.add(id)
  }
  return { ...theme, layers }
}

export function designTextLines(design: SlideDesign): string[] {
  return design.layers.flatMap((layer) => layer.kind === 'text' && layer.text.trim() ? layer.text.split('\n') : [])
}

export function normalizeDesignWebLayers(design: SlideDesign): SlideDesign | undefined {
  const layers: DesignLayer[] = []
  for (const layer of design.layers) {
    if (layer.kind !== 'web') {
      layers.push(layer)
      continue
    }
    const url = layer.powerPointMedia ? powerPointOnlineVideoUrl(layer.url) : presentationWebUrl(layer.url)
    if (!url) return undefined
    layers.push({ ...layer, url })
  }
  if (!design.powerPointBuild) return { ...design, layers }
  const ids = new Set([...layers.map((layer) => layer.id), ...design.soundtracks?.flatMap((track) => track.powerPointMediaId ?? []) ?? []])
  const powerPointBuild = design.powerPointBuild.map((step) => step.filter(({ layerId }) => ids.has(layerId))).filter((step) => step.length)
  return { ...design, layers, powerPointBuild }
}

export function designSoundtrackAssets(design?: SlideDesign): PlaylistCueAsset[] | undefined {
  const ordinaryTracks = design?.soundtracks?.filter((track) => !track.powerPointTransitionSound)
  if (!ordinaryTracks?.length) return undefined
  return ordinaryTracks.map(({ kind, filename, libraryId, archivePath, role, repeat, clip, playback }) => ({
    kind, filename, role, ...(libraryId ? { libraryId } : {}), ...(archivePath ? { archivePath } : {}),
    ...(repeat !== undefined ? { repeat } : {}), ...(clip ? { clip } : {}), ...(playback ? { playback } : {}),
  }))
}

/** PowerPoint streams the most recently started embedded soundtrack through the single audio slot. */
export function powerPointSoundtrackAssets(design?: SlideDesign) {
  if (!design) return undefined
  const track = design.soundtracks?.filter((candidate) => candidate.powerPointMediaId).pop()
  return track && designSoundtrackAssets({ ...design, soundtracks: [track] })
}

export function presentationCue(entry: LibraryDesign): PlaylistCue {
  const { collectionDetails: _details, ...metadata } = entry.content.source ?? {}
  const notes = entry.content.notes
  return {
    kind: entry.content.source?.format === 'powerpoint' ? 'powerpoint' : 'presentation',
    label: entry.title,
    libraryDesignId: entry.id,
    slides: entry.content.slides.map((slide) => {
      const { soundtracks, ...visual } = slide.design
      const regularTracks = soundtracks?.filter((track) => !track.powerPointMediaId)
      const embedded = soundtracks?.filter((track) => track.powerPointMediaId || track.powerPointTransitionSound)
      const assets = designSoundtrackAssets({ ...visual, soundtracks: regularTracks })
      const design = embedded?.length ? { ...visual, soundtracks: embedded } : visual
      return {
        label: slide.label,
        lines: designTextLines(design),
        design,
        ...(slide.speakerNotes !== undefined ? { speakerNotes: slide.speakerNotes } : {}),
        ...(assets?.length ? { assets } : {}),
        ...(slide.template ? { template: slide.template } : {}),
        advanceMs: slide.advanceMs,
        ...(slide.transition ? { transition: slide.transition } : {}),
        ...(slide.transitionEdited ? { transitionEdited: true as const } : {}),
        ...(slide.playback ? { playback: slide.playback } : {}),
        sourceId: slide.id,
      }
    }),
    ...(entry.content.looping ? { looping: true } : {}),
    ...(entry.content.warnings?.length ? { warnings: entry.content.warnings } : {}),
    ...(entry.content.source ? { sourceId: entry.content.source.uid } : {}),
    ...(entry.content.source || notes !== undefined ? {
      metadata: { ...metadata, ...(notes !== undefined ? { notes, libraryNotes: notes } : {}) },
    } : {}),
  }
}
