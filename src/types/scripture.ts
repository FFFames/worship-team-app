/** A Bible edition and the locally indexed verses supplied by its source file. */

export type ScriptureVerse = {
  chapter: number
  verse: number
  text: string
}

export type ScriptureBook = {
  id: string
  name: string
  abbreviation?: string
  aliases?: string[]
  verses: ScriptureVerse[]
}

export type ScriptureBookName = { name: string; abbreviation: string }

export type ScriptureEditionInfo = {
  id: string
  name: string
  abbreviation: string
  language?: string
  copyright?: string
  license?: string
}

export type ScriptureEdition = ScriptureEditionInfo & { books: ScriptureBook[] }

export type LocatedVerse = ScriptureVerse & { bookId: string; bookName: string }

export type ScriptureVerseAddress = Pick<LocatedVerse, 'bookId' | 'chapter' | 'verse'>

/** Source of an editable text frame, whose wording is saved alongside the verse addresses. */
export type ScriptureFrameSource = { editionId: string; editionName: string; label: string; verses: ScriptureVerseAddress[] }

/** Zero-based line where the verse begins in a Scripture slide. */
export type ScriptureVerseStart = { line: number; verse: number }
/** A range reference stored in an EasyWorship schedule. */
export type ScriptureSourceRange = {
  translationId: number
  book: number
  chapter: number
  firstVerse: number
  lastVerse: number
}
