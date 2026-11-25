/** Places a Scripture slide or passage reference without modifying the saved verse text. */

import type { PlaylistCue } from '../types/database'
import type { DesignLayer, DesignTextLayout, DesignTextRun, SlideDesign } from '../types/slideDesign'
import type { ScriptureVerseStart } from '../types/scripture'
import type { ScriptureFont, ScriptureOutputSettings } from './outputSettings'
import { editDesignText, visibleDesignTextRuns } from './slideDesign'
import { replaceInTextRuns } from './textRunReplacement'
import { alignedLyricRuns, applySongLyricRuns } from './songLyricFormatting'
import { abbreviateScriptureReference } from './scripture'

type ScriptureNumbering = { text: string; starts: ScriptureVerseStart[] }
export type ScriptureReference = {
  slide: string; passage: string; last: boolean; numbering?: ScriptureNumbering
  abbreviatedSlide?: string; abbreviatedPassage?: string
}

export function legacyScriptureReference(cue: PlaylistCue) {
  if (cue.kind !== 'scripture' || cue.metadata?.type !== 2 || cue.metadata.presentationUid !== null) return undefined
  return typeof cue.metadata.author === 'string' && cue.metadata.author.trim() ? cue.metadata.author : cue.label
}

export function scripturePassageReference(cue: PlaylistCue) {
  const original = cue.metadata?.scripturePassage
  const passage = typeof original === 'string' && original.trim() ? original : legacyScriptureReference(cue) ?? cue.label
  const names = cue.slides.flatMap((item) => item.scriptureBookNames ?? [])
  const shortened = names.length ? abbreviateScriptureReference(passage, names) : passage
  return shortened === passage ? { passage } : { passage, abbreviatedPassage: shortened }
}

export function scriptureReference(cue: PlaylistCue, slide: string, index: number,
  passage?: ReturnType<typeof scripturePassageReference>): ScriptureReference | undefined {
  if (cue.kind !== 'scripture') return undefined
  const source = cue.slides[index]
  const starts = source?.scriptureVerseStarts ?? importedVerseStart(source, legacyScriptureReference(cue) !== undefined, index)
  const numbering = starts?.length && source ? { text: source.lines.join('\n'), starts } : undefined
  const slideNames = source?.scriptureBookNames
  const abbreviatedSlide = slideNames?.length && !source?.labelEdited ? abbreviateScriptureReference(slide, slideNames) : slide
  return { slide, ...(passage ?? scripturePassageReference(cue)), last: index >= cue.slides.length - 1, ...(numbering ? { numbering } : {}),
    ...(abbreviatedSlide !== slide ? { abbreviatedSlide } : {}) }
}

function importedVerseStart(source: PlaylistCue['slides'][number] | undefined, legacy: boolean, index: number) {
  if (!source?.sourceId || source.textEdited || !source.lines[0]?.trim() || (legacy && index > 0)) return undefined
  const range = source.scriptureRange
  const englishDigits = (text: string) => text.replace(/[๐-๙]/g, (digit) => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(digit)))
  const reference = !source.labelEdited && englishDigits(source.label).match(/^[^:]+\s\d+\s*:\s*(\d{1,3})(?:\s*\([^()]+\)|\s*·[^·]+)?\s*$/)
  const verse = range ? (range.firstVerse === range.lastVerse ? range.firstVerse : undefined) : reference ? Number(reference[1]) : undefined
  if (!verse || englishDigits(source.lines[0]).trimStart().match(/^\d+/)?.[0] === String(verse)) return undefined
  return [{ line: 0, verse }]
}

export function scriptureOutputLayout(source: ScriptureReference, settings: ScriptureOutputSettings) {
  const { reference: mode, completePassage } = settings
  const hidden = mode === 'hidden' || (mode === 'after-passage' && !source.last)
  const usePassage = completePassage || mode === 'after-passage'
  const abbreviated = usePassage ? source.abbreviatedPassage : source.abbreviatedSlide
  const reference = (settings.abbreviateBooks ? abbreviated : undefined) ?? (usePassage ? source.passage : source.slide)
  const fonts = Object.values(settings.fonts ?? {}).some((font) => Object.keys(font).length)
    ? settings.fonts : undefined
  const before = mode === 'before-slide'
  const showText = mode !== 'reference-only'
  const insets = settings.referenceInsets
  const referenceInsets = !hidden && insets ? {
    left: insets.left, right: insets.right,
    top: showText && !before ? insets.top : undefined,
    bottom: showText && before ? insets.bottom : undefined,
  } : undefined
  return { reference: hidden ? '' : reference, before, showText,
    numbering: settings.verseNumbers ? source.numbering : undefined, fonts,
    referenceInsets: referenceInsets && Object.values(referenceInsets).some((value) => value && value > 0) ? referenceInsets : undefined,
    referenceRuns: !hidden && fonts?.reference ? fontRuns([{ text: reference }], fonts.reference) : undefined }
}

function scriptureRunStyle(previous: DesignTextRun['style'], font: ScriptureFont) {
  const { fontRatio, sizeScale, effects, ...characters } = font
  const style = { ...previous, ...characters }
  if (sizeScale !== undefined) style.sizeScale = sizeScale
  if (fontRatio !== undefined || effects || previous?.output) {
    style.output = {
      fontRatio: fontRatio ?? (sizeScale === undefined ? previous?.output?.fontRatio : undefined),
      effects: effects ? { ...previous?.output?.effects, ...effects } : previous?.output?.effects,
    }
  }
  return style
}

function fontRuns(runs: DesignTextRun[], font: ScriptureFont | undefined) {
  if (!font) return runs
  return runs.map((run) => ({ ...run, style: scriptureRunStyle(run.style, font) }))
}

export function scriptureOutputText(text: string, layout: ReturnType<typeof scriptureOutputLayout> | undefined, source?: DesignTextRun[]) {
  const bodyFont = layout?.fonts?.text
  const numberFont = layout?.fonts?.number
  const numbering = layout?.numbering
  const runs = bodyFont ? fontRuns(alignedLyricRuns(text, source) ?? [{ text }], bodyFont) : source
  if (!numbering || numbering.text !== text) return { text, runs }
  const byLine = new Map(numbering.starts.map(({ line, verse }) => [line, verse]))
  const verses = text.split('\n').flatMap((line, index) => line ? [byLine.get(index)] : [])
  let index = 0
  return replaceInTextRuns(text, numberFont ? alignedLyricRuns(text, runs) ?? [{ text }] : runs, /(?<=^|\n)[^\n]/gu, (first) => {
    const verse = verses[index++]
    if (verse && numberFont) return { prefix: `${verse} `, style: (previous) => scriptureRunStyle(previous, numberFont) }
    return verse ? `${verse} ${first}` : first
  })
}

type TextLayer = Extract<DesignLayer, { kind: 'text' }>
type ScriptureInsets = DesignTextLayout['insets']

function referenceRuns(source: DesignTextRun[], font?: ScriptureFont, insets?: ScriptureInsets) {
  const styled = fontRuns(source, font)
  if (!insets) return styled
  // Give the projected reference its own block even when the saved text has no paragraph formatting.
  const paragraph = { ...source[0]?.paragraph, index: -1, outputInsets: insets }
  return styled.map((run) => ({ ...run, paragraph }))
}

export function scriptureFlowDesign(text: string, theme?: SlideDesign, runs?: DesignTextRun[]): SlideDesign {
  const design: SlideDesign = theme ? applySongLyricRuns(theme, text, runs) : {
    aspectRatio: 16 / 9, inheritBackground: true,
    layers: [{ kind: 'text', id: 'scripture-content', slot: 'content', text, runs: alignedLyricRuns(text, runs),
      frame: { x: .06, y: .06, width: .88, height: .88 },
      style: { fontSize: .072, fontFamily: 'Kanit, sans-serif', shadow: true } }],
  }
  return { ...design, layers: design.layers.map((layer) => layer.kind === 'text' && layer.slot
    ? { ...layer, textLayout: { ...layer.textLayout, sizing: 'fit' } } : layer) }
}

function withReferenceAppearance(layer: TextLayer, font?: ScriptureFont, insets?: ScriptureInsets): TextLayer {
  if (!layer.text || (!font && !insets)) return layer
  return { ...layer, runs: referenceRuns(visibleDesignTextRuns(layer) ?? [{ text: layer.text }], font, insets) }
}

function withInlineReference(layer: TextLayer, layout: ReturnType<typeof scriptureOutputLayout>): TextLayer {
  const { reference, before, fonts, referenceInsets } = layout
  const source = visibleDesignTextRuns(layer)
  const body = scriptureOutputText(layer.text, layout, source)
  const bodyRuns = body.runs ?? [{ text: body.text }]
  const inherited = source && source[before ? 0 : source.length - 1]
  const caption = before ? `${reference}\n` : `\n${reference}`
  const captionRuns = referenceRuns([{ text: caption, style: inherited?.style, align: inherited?.align }], fonts?.reference, referenceInsets)
  return { ...layer, text: before ? caption + body.text : body.text + caption,
    runs: before ? [...captionRuns, ...bodyRuns] : [...bodyRuns, ...captionRuns] }
}

export function scriptureOutputDesign(design: SlideDesign, layout: ReturnType<typeof scriptureOutputLayout>): SlideDesign {
  const { reference, before, showText, fonts, referenceInsets } = layout
  const referenceSlot = !before && design.layers.find((layer) => layer.kind === 'text' && layer.slot === 'reference')
  const content = design.layers.find((layer) => layer.kind === 'text' && layer.slot === 'content' && layer.text.trim())
    ?? design.layers.find((layer) => layer.kind === 'text' && layer.slot === 'content')
  const layers = design.layers.map((layer) => {
    if (layer.kind !== 'text') return layer
    if (layer.slot === 'reference') {
      return withReferenceAppearance(editDesignText(layer, layer === referenceSlot ? reference : ''), fonts?.reference, referenceInsets)
    }
    if (layer.slot !== 'content') return layer
    if (layer === content && !referenceSlot && reference && (fonts || referenceInsets)) {
      if (!showText || !layer.text) return withReferenceAppearance(editDesignText(layer, reference), fonts?.reference, referenceInsets)
      return withInlineReference(layer, layout)
    }
    const output = showText ? scriptureOutputText(layer.text, layer === content ? layout : { ...layout, numbering: undefined },
      visibleDesignTextRuns(layer)) : undefined
    const contentLayer = output && (output.text !== layer.text || (fonts?.text && layer.text)) ? { ...layer, ...output } : layer
    const body = showText ? contentLayer.text : ''
    if (layer !== content || referenceSlot || !reference) return editDesignText(contentLayer, body)
    return editDesignText(contentLayer, (before ? [reference, body] : [body, reference]).filter(Boolean).join('\n'))
  })
  if (reference && !referenceSlot && !content) {
    const caption: TextLayer = { id: 'scripture-reference', kind: 'text', slot: 'reference', text: reference,
      frame: { x: .08, y: before ? .06 : .83, width: .84, height: .11 },
      style: { fontSize: .047, fitText: true, shadow: true } }
    layers.push(withReferenceAppearance(caption, fonts?.reference, referenceInsets))
  }
  return { ...design, layers }
}

/** Early imports appended an automatic reference to the verse text before saving the layout. */
export function scriptureDesignWithoutSavedReference(design: SlideDesign, lines: string[], label: string,
  legacyReference?: string): SlideDesign {
  const text = lines.join('\n')
  const combined = [text, legacyReference ?? label].filter(Boolean).join('\n')
  return { ...design, layers: design.layers.map((layer) => {
    if (layer.kind !== 'text' || layer.text !== combined) return layer
    if (layer.slot === 'content') return editDesignText(layer, text)
    if (legacyReference && layer.id === 'lyrics' && !layer.slot) return { ...editDesignText(layer, text), slot: 'content' }
    return layer
  }) }
}
