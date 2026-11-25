/** Reads EasyWorship's 64-bit ScriptureRangeID and resolves it against a matching local Bible. */

import type { ScriptureEdition, ScriptureSourceRange } from '../types/scripture'
import type { DesignLayer, SlideDesign } from '../types/slideDesign'
import type { PlaylistCue } from '../types/database'
import type { EasyWorshipSchedule, EasyWorshipScheduleSlide } from './easyWorshipSchedule'
import { listScriptureEditions, readScriptureEdition } from './scriptureLibrary'
import { editDesignText } from './slideDesign'
import { scriptureBookNames, scriptureBooksInReference } from './scripture'

export type EasyWorshipScriptureLookup = ((translationId: number) => Promise<ScriptureEdition | null>) & {
  byAbbreviation?: (abbreviation: string) => Promise<ScriptureEdition | null>
}

export const scriptureAbbreviationKey = (value: string) => value.normalize('NFKC').trim().toLowerCase()

export function missingScriptureText(label: string, translationId?: number) {
  return translationId === undefined ? `ไม่พบข้อความพระคัมภีร์ของ ${label} ที่ตรงกับข้อมูลต้นทาง`
    : `นำเข้าพระคัมภีร์ EasyWorship รหัสฉบับ ${translationId} เพื่อกู้ข้อความของ ${label}`
}

export function fillScriptureDesignText(design: SlideDesign, text: string, source?: SlideDesign): SlideDesign {
  const hasContent = design.layers.some((layer) => layer.kind === 'text' && layer.slot === 'content')
  if (hasContent) return { ...design, layers: design.layers.map((layer) => layer.kind === 'text' && layer.slot === 'content'
    ? editDesignText(layer, text) : layer) }
  const sourceLayer = source?.layers.find((layer) => layer.kind === 'text' && layer.slot === 'content')
  const fallback: DesignLayer = sourceLayer?.kind === 'text' && !design.layers.some((layer) => layer.id === sourceLayer.id)
    ? editDesignText(sourceLayer, text)
    : { id: `scripture-recovered:${design.layers.length}`, kind: 'text', slot: 'content', text,
      frame: { x: .06, y: .05, width: .88, height: .9 }, style: { fitText: true, fontSize: .075, shadow: true } }
  return { ...design, layers: [...design.layers, fallback] }
}

function scriptureId(value: unknown) {
  // SQLite exposes the value as decimal text to avoid losing the upper ID bits.
  if (typeof value !== 'string' || !/^-?\d{1,20}$/.test(value)) return undefined
  const signed = BigInt(value)
  if (signed < -(1n << 63n) || signed >= (1n << 64n)) return undefined
  return BigInt.asUintN(64, signed)
}

function scripturePosition(packed: bigint) {
  const translationId = Number(packed >> 57n)
  const book = Number((packed >> 50n) & 0x7fn)
  const chapter = Number((packed >> 42n) & 0xffn)
  const verse = Number((packed >> 34n) & 0xffn)
  if (book < 1 || chapter < 1 || verse < 1) return undefined
  return { translationId, book, chapter, verse }
}

/** Collections store individual verse IDs with extra text-position bits in the low 34 bits. */
export function decodeEasyWorshipScriptureVerse(value: unknown) {
  const packed = scriptureId(value)
  return packed === undefined ? undefined : scripturePosition(packed)
}

export function decodeEasyWorshipScriptureRange(value: unknown): ScriptureSourceRange | undefined {
  const packed = scriptureId(value)
  if (packed === undefined) return undefined
  const position = scripturePosition(packed)
  if (!position) return undefined
  const { translationId, book, chapter, verse: firstVerse } = position
  const lastVerse = Number((packed >> 26n) & 0xffn) || firstVerse
  if (lastVerse < firstVerse) return undefined
  return { translationId, book, chapter, firstVerse, lastVerse }
}

export function resolveEasyWorshipScriptureRange(range: ScriptureSourceRange, edition: ScriptureEdition) {
  const book = edition.books.find((entry) => entry.id === String(range.book))
  if (!book) return undefined
  const verses = book.verses.filter(({ chapter, verse }) => chapter === range.chapter
    && verse >= range.firstVerse && verse <= range.lastVerse).sort((a, b) => a.verse - b.verse)
  if (verses.length !== range.lastVerse - range.firstVerse + 1
    || verses.some((verse, index) => verse.verse !== range.firstVerse + index)) return undefined
  const span = range.firstVerse === range.lastVerse ? String(range.firstVerse) : `${range.firstVerse}–${range.lastVerse}`
  const lines: string[] = []
  let numberOfLines = 0
  const verseStarts = verses.flatMap(({ text, verse }) => {
    const content = text.trim()
    if (!content) return []
    const start = { line: numberOfLines, verse }
    lines.push(content)
    numberOfLines += content.split('\n').length
    return [start]
  })
  return {
    label: `${book.name} ${range.chapter}:${span} · ${edition.abbreviation}`,
    lines, verseStarts,
  }
}

export function createEasyWorshipScriptureLookup(): EasyWorshipScriptureLookup {
  let list: ReturnType<typeof listScriptureEditions> | undefined
  async function fromInstalled(matches: (edition: Awaited<ReturnType<typeof listScriptureEditions>>[number]) => boolean) {
    if (typeof indexedDB === 'undefined') return null
    list ??= listScriptureEditions()
    const candidates = (await list).filter((edition) => edition.id.startsWith('easyworship-') && matches(edition))
    return candidates.length === 1 ? readScriptureEdition(candidates[0].id) : null
  }
  const lookup: EasyWorshipScriptureLookup = (translationId) => fromInstalled((edition) => edition.id.startsWith(`easyworship-${translationId}-`))
  lookup.byAbbreviation = (abbreviation) => fromInstalled((edition) =>
    scriptureAbbreviationKey(edition.abbreviation) === scriptureAbbreviationKey(abbreviation))
  return lookup
}

function referenceEdition(label: string) {
  const suffix = /\s+(?:\(([^()]{1,48})\)|·\s+([^·]{1,48}))$/u.exec(label)
  return suffix ? (suffix[1] ?? suffix[2]).trim() : undefined
}

export async function scheduleScriptureBookNames(cues: EasyWorshipSchedule['cues'], lookup: EasyWorshipScriptureLookup,
  editions: ReadonlyMap<number, ScriptureEdition | null> = new Map()) {
  const namedEditions = new Map<string, Promise<ScriptureEdition | null>>()
  function namedEdition(abbreviation: string | undefined) {
    if (!abbreviation || !lookup.byAbbreviation) return null
    const key = scriptureAbbreviationKey(abbreviation)
    let edition = namedEditions.get(key)
    if (!edition) {
      edition = lookup.byAbbreviation(abbreviation).catch(() => null)
      namedEditions.set(key, edition)
    }
    return edition
  }
  return Promise.all(cues.map(async (cue) => {
    if (cue.kind !== 'scripture') return cue
    const cueAbbreviation = cue.metadata.abbreviation?.trim() || referenceEdition(cue.metadata.scripturePassage ?? cue.label)
    const slides = await Promise.all(cue.slides.map(async (slide) => {
      const range = slide.scriptureRange
      const edition = range ? editions.get(range.translationId) : await namedEdition(referenceEdition(slide.label) ?? cueAbbreviation)
      if (!edition) return slide
      const book = range && edition.books.find(({ id }) => id === String(range.book))
      const names = range ? (book ? scriptureBookNames(edition, book) : []) : scriptureBooksInReference(edition, slide.label)
      if (!names.length) return slide
      return { ...slide, scriptureBookNames: names,
        scriptureRecovery: slide.scriptureRecovery ?? { fallbackLabel: slide.label, missingText: false, replaceLabel: false } }
    }))
    return { ...cue, slides }
  }))
}

type ScriptureSlide = EasyWorshipScheduleSlide & {
  scriptureRecovery: NonNullable<EasyWorshipScheduleSlide['scriptureRecovery']>
}
export type RecoveredScheduleScripture = ReadonlyMap<string, ReadonlyMap<string, ScriptureSlide>>

export function recoveredScheduleScripture(schedule: EasyWorshipSchedule): RecoveredScheduleScripture {
  const recovered = new Map<string, Map<string, ScriptureSlide>>()
  for (const cue of schedule.cues) {
    if (cue.kind !== 'scripture') continue
    const slides = new Map<string, ScriptureSlide>()
    for (const slide of cue.slides) {
      if (slide.scriptureRecovery && (slide.scriptureRange || slide.scriptureBookNames?.length)) {
        slides.set(slide.id, { ...slide, scriptureRecovery: slide.scriptureRecovery })
      }
    }
    if (slides.size) recovered.set(cue.id, slides)
  }
  return recovered
}

function sameRange(a: ScriptureSourceRange | undefined, b: ScriptureSourceRange) {
  return a?.translationId === b.translationId && a.book === b.book && a.chapter === b.chapter
    && a.firstVerse === b.firstVerse && a.lastVerse === b.lastVerse
}

export function fillScheduleScripture(cue: PlaylistCue, recovered: RecoveredScheduleScripture) {
  const sources = cue.kind === 'scripture' && cue.sourceId ? recovered.get(cue.sourceId) : undefined
  if (!sources) return undefined
  const removable = new Set<string>()
  const stillMissing = new Set<string>()
  let count = 0
  const slides = cue.slides.map((slide) => {
    const source = slide.sourceId ? sources.get(slide.sourceId) : undefined
    if (!source || (source.scriptureRange ? !sameRange(slide.scriptureRange, source.scriptureRange)
      : slide.scriptureRange || slide.labelEdited || slide.label !== source.label)) return slide
    const { fallbackLabel, missingText, replaceLabel } = source.scriptureRecovery
    const messages = [missingScriptureText(fallbackLabel), missingScriptureText(fallbackLabel, source.scriptureRange?.translationId)]
    const empty = !slide.lines.some((line) => line.trim()) && !slide.design?.layers.some((layer) =>
      layer.kind === 'text' && layer.slot === 'content' && layer.text.trim())
    const fillText = missingText && empty && !slide.textEdited && messages.some((message) => cue.warnings?.includes(message))
    const fillLabel = replaceLabel && !slide.labelEdited && slide.label === fallbackLabel && slide.label !== source.label
    const fillStarts = !slide.textEdited && !slide.scriptureVerseStarts && Boolean(source.scriptureVerseStarts?.length)
      && (fillText || slide.lines.join('\n') === source.lines.join('\n'))
    const fillNames = !slide.scriptureBookNames?.length && Boolean(source.scriptureBookNames?.length)
    if (fillText) for (const message of messages) removable.add(message)
    if (!fillText && !fillLabel && !fillStarts && !fillNames) return slide
    count++
    return {
      ...slide,
      ...(fillLabel ? { label: source.label } : {}),
      ...(fillStarts ? { scriptureVerseStarts: source.scriptureVerseStarts } : {}),
      ...(fillNames ? { scriptureBookNames: source.scriptureBookNames } : {}),
      ...(fillText ? { lines: source.lines, ...(slide.design ? {
        design: fillScriptureDesignText(slide.design, source.lines.join('\n'), source.design),
      } : {}) } : {}),
    }
  })
  if (!count) return undefined
  for (const slide of slides) {
    if (slide.lines.some((line) => line.trim())) continue
    const fallback = slide.sourceId ? sources.get(slide.sourceId)?.scriptureRecovery.fallbackLabel : undefined
    for (const label of new Set([slide.label, fallback ?? slide.label])) {
      stillMissing.add(missingScriptureText(label))
      stillMissing.add(missingScriptureText(label, slide.scriptureRange?.translationId))
    }
  }
  const warnings = cue.warnings?.filter((message) => !removable.has(message) || stillMissing.has(message))
  return { cue: { ...cue, slides, ...(cue.warnings ? { warnings } : {}) }, count }
}
