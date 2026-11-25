/** Looks up Bible passages and builds scripture slides from selected verses. */

import type { PlaylistCue } from '../types/database'
import type { LocatedVerse, ScriptureBook, ScriptureBookName, ScriptureEdition, ScriptureVerse, ScriptureVerseAddress, ScriptureVerseStart } from '../types/scripture'
import { wrapLyricLine } from './slideBuilder'

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙'
const SCRIPTURE_LINE_WIDTH = 44
const SCRIPTURE_LINES_PER_SLIDE = 6
const PSALM_ALIASES = ['psalm', 'psalms']
const scriptureWords = new Intl.Segmenter('th', { granularity: 'word' })
const scriptureGraphemes = new Intl.Segmenter('th', { granularity: 'grapheme' })

export type ScriptureLayout = 'verse' | 'continuous'

type VersePosition = Pick<ScriptureVerse, 'chapter' | 'verse'>

function normalizeText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

function normalizeReference(value: string): string {
  return normalizeText(value).replace(/[๐-๙]/g, (digit) => String(THAI_DIGITS.indexOf(digit)))
    .replace(/[–—−]/g, '-')
}

function bookKey(value: string): string {
  return normalizeReference(value).replace(/[.\s]/g, '')
}

function bookKeys(book: ScriptureBook): string[] {
  const keys = [book.name, ...(book.abbreviation ? [book.abbreviation] : []), ...(book.aliases ?? [])].map(bookKey)
  return keys.some((key) => PSALM_ALIASES.includes(key)) ? [...keys, ...PSALM_ALIASES] : keys
}

export function scriptureBookNames(edition: ScriptureEdition, book: ScriptureBook): ScriptureBookName[] {
  // Older saved EWB editions kept the native short name first among their search aliases.
  const alias = book.aliases?.[0]
  const abbreviation = book.abbreviation ?? (edition.id.startsWith('easyworship-') && alias && alias.length < book.name.length ? alias : undefined)
  if (!abbreviation?.trim()) return []
  const spellings = [book.name, abbreviation, ...(book.aliases ?? [])]
  if (spellings.some((name) => PSALM_ALIASES.includes(bookKey(name)))) spellings.push(...PSALM_ALIASES)
  return [...new Set(spellings)].filter((name) => name.trim()).map((name) => ({ name, abbreviation }))
}

function referenceParts(value: string) {
  const suffix = value.match(/(?:\s+·\s+[^·]+|\s+\([^()]+\))$/u)?.[0] ?? ''
  const passage = suffix ? value.slice(0, -suffix.length) : value
  return { suffix, parts: passage.split(/(\s+\/\s+|(?<=[0-9๐-๙])[-–—](?=\s*[0-9๐-๙]*\s*\p{L}))/u) }
}

const bookInReference = /^(\s*)(.+?)(?=\s+[0-9๐-๙]+\s*:\s*[0-9๐-๙]+)/u

export function scriptureBooksInReference(edition: ScriptureEdition, reference: string) {
  const keys = new Set(referenceParts(reference).parts.flatMap((part) => {
    const match = bookInReference.exec(part)
    return match ? [bookKey(match[2])] : []
  }))
  return [...keys].flatMap((key) => {
    const matching = edition.books.filter((book) => bookKeys(book).includes(key))
    return matching.length === 1 ? scriptureBookNames(edition, matching[0]) : []
  })
}

export function abbreviateScriptureReference(reference: string, names: readonly ScriptureBookName[]) {
  const abbreviations = new Map<string, string | null>()
  for (const { name, abbreviation } of names) {
    const key = bookKey(name)
    const previous = abbreviations.get(key)
    abbreviations.set(key, previous === undefined || previous === abbreviation ? abbreviation : null)
  }
  const { parts, suffix } = referenceParts(reference)
  return parts.map((part) => {
    const match = bookInReference.exec(part)
    const abbreviation = match && abbreviations.get(bookKey(match[2]))
    return abbreviation && match ? match[1] + abbreviation + part.slice(match[0].length) : part
  }).join('') + suffix
}

function locateVerse(verse: ScriptureVerse, book: ScriptureBook): LocatedVerse {
  return { ...verse, bookId: book.id, bookName: book.name }
}

function positionOrder(a: VersePosition, b: VersePosition): number {
  return a.chapter - b.chapter || a.verse - b.verse
}

/** Handles chapter-only, continuous and comma-separated ranges within one book. */
export function findScripturePassage(edition: ScriptureEdition, value: string): LocatedVerse[] {
  const match = normalizeReference(value).match(/^(.+?)\s*([1-9]\d*)(?:(?:\s*:\s*|\s+)([\d,:\s-]+))?$/)
  if (!match) return []

  const [, name, chapter, ranges] = match
  const key = bookKey(name)
  if (!key) return []

  const exact = edition.books.filter((book) => bookKeys(book).includes(key))
  const books = exact.length > 0 ? exact : edition.books.filter((book) => bookKeys(book).some((alias) => alias.startsWith(key)))
  if (books.length !== 1) return []
  const book = books[0]
  let currentChapter = Number(chapter)
  const ordered = [...book.verses].sort(positionOrder)

  if (!ranges) return ordered.filter((verse) => verse.chapter === currentChapter).map((verse) => locateVerse(verse, book))

  const selected = new Set<ScriptureVerse>()
  for (const range of ranges.split(',')) {
    const span = range.trim().match(/^(?:(\d+)\s*:\s*)?(\d+)(?:\s*-\s*(?:(\d+)\s*:\s*)?(\d+))?$/)
    if (!span) return []

    const start = { chapter: Number(span[1] ?? currentChapter), verse: Number(span[2]) }
    const end = { chapter: Number(span[3] ?? start.chapter), verse: Number(span[4] ?? start.verse) }
    if (positionOrder(start, end) > 0) return []

    const first = ordered.findIndex((verse) => positionOrder(verse, start) === 0)
    const last = ordered.findIndex((verse) => positionOrder(verse, end) === 0)
    if (first < 0 || last < 0) return []

    for (const verse of ordered.slice(first, last + 1)) selected.add(verse)
    currentChapter = end.chapter
  }

  return ordered.filter((verse) => selected.has(verse)).map((verse) => locateVerse(verse, book))
}

export function compileScriptureTextQuery(value: string): ((text: string) => boolean) | undefined {
  const terms = [...value.normalize('NFKC').matchAll(/"([^"]*)"|([^\s"]+)/g)]
    .map(([, phrase, word]) => normalizeText(phrase ?? word)).filter(Boolean)
  if (!terms.length) return undefined
  return (text) => {
    const normalized = normalizeText(text)
    return terms.every((term) => normalized.includes(term))
  }
}

export function searchScriptureText(edition: ScriptureEdition, value: string): LocatedVerse[] {
  const matches = compileScriptureTextQuery(value)
  if (!matches) return []

  return edition.books.flatMap((book) => book.verses
    .filter((verse) => matches(verse.text))
    .map((verse) => locateVerse(verse, book)))
}

export function scriptureChapterVerses(book: ScriptureBook, chapter: number): LocatedVerse[] {
  return book.verses.filter((verse) => verse.chapter === chapter).sort(positionOrder).map((verse) => locateVerse(verse, book))
}

/** Keeps the source order and verse addresses when viewing a passage in another translation. */
export function matchScriptureVerses(edition: ScriptureEdition, references: readonly ScriptureVerseAddress[]): LocatedVerse[] {
  const desired = new Set(references.map(verseKey))
  const bookIds = new Set(references.map(({ bookId }) => bookId))
  const found = new Map<string, LocatedVerse>()
  for (const book of edition.books) {
    if (!bookIds.has(book.id)) continue
    for (const verse of book.verses) {
      const key = verseKey({ bookId: book.id, chapter: verse.chapter, verse: verse.verse })
      if (desired.has(key)) found.set(key, locateVerse(verse, book))
    }
  }
  return references.flatMap((reference) => {
    const verse = found.get(verseKey(reference))
    return verse ? [verse] : []
  })
}

export function verseKey(verse: ScriptureVerseAddress): string {
  return JSON.stringify([verse.bookId, verse.chapter, verse.verse])
}

export function verseReference(verse: LocatedVerse): string {
  return `${verse.bookName} ${verse.chapter}:${verse.verse}`
}

export function scripturePassageLabel(verses: readonly LocatedVerse[]): string {
  const first = verses[0]
  if (!first) return ''
  if (verses.length === 1) return verseReference(first)

  const last = verses[verses.length - 1]
  if (verses.every((verse) => verse.bookId === first.bookId && verse.chapter === first.chapter)) {
    if (last.verse - first.verse + 1 === verses.length) return `${verseReference(first)}–${last.verse}`
    if (verses.length <= 4) return `${first.bookName} ${first.chapter}:${verses.map((verse) => verse.verse).join(', ')}`
  }
  if (verses.length <= 3) return verses.map(verseReference).join(' / ')
  return `${verseReference(first)} +${verses.length - 1}`
}

function scriptureSlide(edition: ScriptureEdition, verses: LocatedVerse[], namesByBook: Map<string, ScriptureBookName[]>,
  lines: string[], verseStarts: ScriptureVerseStart[]): PlaylistCue['slides'][number] {
  const bookNames = [...new Set(verses.map(({ bookId }) => bookId))].flatMap((id) => namesByBook.get(id) ?? [])
  return { label: `${scripturePassageLabel(verses)} · ${edition.abbreviation}`, lines, scriptureVerseStarts: verseStarts,
    ...(bookNames.length ? { scriptureBookNames: bookNames } : {}) }
}

function scriptureCue(edition: ScriptureEdition, verses: LocatedVerse[], slides: PlaylistCue['slides']): PlaylistCue {
  return {
    kind: 'scripture',
    label: `${scripturePassageLabel(verses)} · ${edition.abbreviation}`,
    metadata: { translation: edition.name, abbreviation: edition.abbreviation, copyright: edition.copyright ?? null },
    slides,
  }
}

export function buildScriptureCue(edition: ScriptureEdition, verses: LocatedVerse[], layout: ScriptureLayout): PlaylistCue | null {
  if (verses.length === 0) return null

  const slides: PlaylistCue['slides'] = []
  const namesByBook = new Map(edition.books.map((book) => [book.id, scriptureBookNames(edition, book)]))
  let lines: string[] = []
  let consecutive: LocatedVerse[] = []
  let verseStarts: ScriptureVerseStart[] = []

  function addSlide() {
    if (lines.length === 0) return
    slides.push(scriptureSlide(edition, consecutive, namesByBook, lines, verseStarts))
    lines = []
    consecutive = []
    verseStarts = []
  }

  for (const verse of verses) {
    const text = verse.text.replace(/\s+/g, ' ')
    const wrapped = wrapLyricLine(text, SCRIPTURE_LINE_WIDTH)
    if (layout === 'verse' || lines.length + wrapped.length > SCRIPTURE_LINES_PER_SLIDE) addSlide()

    for (let offset = 0; offset < wrapped.length; offset += SCRIPTURE_LINES_PER_SLIDE) {
      consecutive.push(verse)
      if (offset === 0) verseStarts.push({ line: lines.length, verse: verse.verse })
      lines.push(...wrapped.slice(offset, offset + SCRIPTURE_LINES_PER_SLIDE))
      if (lines.length === SCRIPTURE_LINES_PER_SLIDE) addSlide()
    }
  }
  addSlide()

  return slides.length ? scriptureCue(edition, verses, slides) : null
}

type ScriptureFragment = { verse: LocatedVerse; text: string; startsVerse: boolean }
type ScriptureFit = (cue: PlaylistCue, last: boolean) => boolean

function fittingBoundary(text: string, segmenter: Intl.Segmenter, fits: (fragment: string) => boolean) {
  const ends = [...segmenter.segment(text)].map(({ index, segment }) => index + segment.length)
  let low = 0
  let high = ends.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (fits(text.slice(0, ends[middle - 1]).trimEnd())) low = middle
    else high = middle - 1
  }
  return low ? ends[low - 1] : 0
}

/** Persists measured page breaks and keeps verse numbering attached to the first fragment. */
export function paginateScriptureCue(edition: ScriptureEdition, verses: LocatedVerse[], breakOnVerse: boolean, fits?: ScriptureFit): PlaylistCue | null {
  const fragments = verses.flatMap((verse): ScriptureFragment[] => {
    const text = verse.text.replace(/\s+/g, ' ').trim()
    return text ? [{ verse, text, startsVerse: true }] : []
  })
  if (!fragments.length) return null
  const namesByBook = new Map(edition.books.map((book) => [book.id, scriptureBookNames(edition, book)]))
  const cue: PlaylistCue = { ...scriptureCue(edition, verses, []), scriptureFlow: true }
  function toSlide(parts: ScriptureFragment[]) {
    return scriptureSlide(edition, parts.map(({ verse }) => verse), namesByBook, parts.map(({ text }) => text),
      parts.flatMap(({ verse, startsVerse }, line) => startsVerse ? [{ line, verse: verse.verse }] : []))
  }
  if (!fits) return { ...cue, slides: [toSlide(fragments)] }

  const canFit = (parts: ScriptureFragment[], last: boolean) => fits({ ...cue, slides: [toSlide(parts)] }, last)
  let page: ScriptureFragment[] = []
  function completePage() {
    if (page.length) cue.slides.push(toSlide(page))
    page = []
  }
  for (const [index, fragment] of fragments.entries()) {
    if (breakOnVerse) completePage()
    const last = index === fragments.length - 1
    if (canFit([...page, fragment], last)) {
      page.push(fragment)
      continue
    }
    if (page.length) {
      completePage()
      if (canFit([fragment], last)) {
        page.push(fragment)
        continue
      }
    }
    let remainder = fragment
    while (remainder.text) {
      const fitsFragment = (text: string) => canFit([{ ...remainder, text }], false)
      const boundary = fittingBoundary(remainder.text, scriptureWords, fitsFragment)
        || fittingBoundary(remainder.text, scriptureGraphemes, fitsFragment)
      if (!boundary) {
        page.push(remainder)
        break
      }
      page.push({ ...remainder, text: remainder.text.slice(0, boundary).trimEnd() })
      completePage()
      remainder = { ...remainder, text: remainder.text.slice(boundary).trimStart(), startsVerse: false }
      if (remainder.text && canFit([remainder], last)) {
        page.push(remainder)
        break
      }
    }
  }
  completePage()
  return cue
}
