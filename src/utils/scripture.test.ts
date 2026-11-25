/** Covers scripture reference lookup, Unicode keyword search, and slide labels. */

import { describe, expect, it } from 'vitest'
import type { ScriptureEdition } from '../types/scripture'
import { buildScriptureCue, findScripturePassage, matchScriptureVerses, paginateScriptureCue, scriptureChapterVerses, searchScriptureText, verseReference } from './scripture'
import { scriptureOutputDesign, scriptureOutputLayout, scriptureOutputText, scriptureReference } from './scriptureOutput'
import { defaultScriptureOutputSettings } from './outputSettings'

const edition: ScriptureEdition = {
  id: 'test-edition', name: 'Thai test edition', abbreviation: 'TEST',
  books: [
    { id: 'john', name: 'ยอห์น', aliases: ['Jn', 'John', 'ยน.'], verses: [
      { chapter: 3, verse: 16, text: 'พระเจ้าทรงรัก' },
      { chapter: 3, verse: 17, text: 'ความหวัง' },
      { chapter: 3, verse: 18, text: 'ความเชื่อ' },
      { chapter: 4, verse: 1, text: 'อีกบทหนึ่ง' },
    ] },
    { id: '1john', name: '1 ยอห์น', aliases: ['1 John'], verses: [{ chapter: 1, verse: 1, text: 'ข้อทดสอบ' }] },
  ],
}

describe('scripture lookups', () => {
  it('finds Thai digits, abbreviations, chapter-only references and true disjoint selections', () => {
    expect(findScripturePassage(edition, 'ยน. ๓:๑๖, ๑๘').map(verseReference)).toEqual(['ยอห์น 3:16', 'ยอห์น 3:18'])
    expect(findScripturePassage(edition, 'Jn3').map(verseReference)).toEqual(['ยอห์น 3:16', 'ยอห์น 3:17', 'ยอห์น 3:18'])
    expect(findScripturePassage(edition, '1 John 1 1').map(verseReference)).toEqual(['1 ยอห์น 1:1'])
  })

  it('resolves ranges across chapters and rejects missing or reversed endpoints', () => {
    expect(findScripturePassage(edition, 'John 3:17–4:1').map(verseReference)).toEqual(['ยอห์น 3:17', 'ยอห์น 3:18', 'ยอห์น 4:1'])
    expect(findScripturePassage(edition, 'John 3:17–4:9')).toEqual([])
    expect(findScripturePassage(edition, 'John 3:18–16')).toEqual([])
    expect(searchScriptureText(edition, '  ความหวัง  ').map(verseReference)).toEqual(['ยอห์น 3:17'])
  })

  it('finds multiple words in any order within a verse and keeps quoted words together', () => {
    const english = { ...edition, books: [{ ...edition.books[0], verses: [
      { chapter: 3, verse: 16, text: 'Love endures and gives us hope' },
      { chapter: 3, verse: 17, text: 'We have hope and\n love' },
      { chapter: 3, verse: 18, text: 'We have hope' },
    ] }] }
    expect(searchScriptureText(english, 'HOPE love').map(verseReference)).toEqual(['ยอห์น 3:16', 'ยอห์น 3:17'])
    expect(searchScriptureText(english, '"hope and love"').map(verseReference)).toEqual(['ยอห์น 3:17'])
    expect(searchScriptureText(english, '"  "')).toEqual([])
  })

  it('opens a chapter in verse order and matches across localized editions without filling gaps', () => {
    const book = { ...edition.books[0], verses: [...edition.books[0].verses].reverse() }
    expect(scriptureChapterVerses(book, 3).map(({ verse }) => verse)).toEqual([16, 17, 18])
    const references = findScripturePassage(edition, 'John 3:16,18')
    const translated = { ...edition, books: [{
      ...book, name: 'Juan', aliases: [], verses: [{ chapter: 3, verse: 18, text: 'Texto de la otra edición' }],
    }] }
    expect(matchScriptureVerses(translated, references)).toEqual([
      { bookId: 'john', bookName: 'Juan', chapter: 3, verse: 18, text: 'Texto de la otra edición' },
    ])
  })
})

describe('scripture slides', () => {
  it('attaches edition and references, including gaps, in both slide layouts', () => {
    const verses = findScripturePassage(edition, 'John 3:16,18')
    const verseCue = buildScriptureCue(edition, verses, 'verse')
    expect(verseCue?.slides.map((slide) => slide.label)).toEqual(['ยอห์น 3:16 · TEST', 'ยอห์น 3:18 · TEST'])

    const continuous = buildScriptureCue(edition, verses, 'continuous')
    expect(continuous?.label).toBe('ยอห์น 3:16, 18 · TEST')
    expect(continuous?.slides).toEqual([{ label: 'ยอห์น 3:16, 18 · TEST', lines: ['พระเจ้าทรงรัก', 'ความเชื่อ'],
      scriptureVerseStarts: [{ line: 0, verse: 16 }, { line: 1, verse: 18 }] }])
  })

  it('uses an edition’s book abbreviations in the output without changing original or edited references', () => {
    const localized = { ...edition, books: [
      { ...edition.books[0], abbreviation: 'ยน.' },
      { ...edition.books[1], abbreviation: '1 ยน.' },
    ] }
    const verses = [...findScripturePassage(localized, 'ยอห์น 3:16'), ...findScripturePassage(localized, '1 ยน. 1:1')]
    const cue = buildScriptureCue(localized, verses, 'verse')!
    const [first, last] = cue.slides
    const firstRef = scriptureReference(cue, first.label, 0)!
    const abbreviation = { ...defaultScriptureOutputSettings, abbreviateBooks: true }
    expect(scriptureOutputLayout(firstRef, defaultScriptureOutputSettings).reference).toBe('ยอห์น 3:16 · TEST')
    expect(scriptureOutputLayout(firstRef, abbreviation).reference).toBe('ยน. 3:16 · TEST')
    expect(scriptureOutputLayout(scriptureReference(cue, last.label, 1)!, { ...abbreviation, reference: 'after-passage' }).reference)
      .toBe('ยน. 3:16 / 1 ยน. 1:1 · TEST')
    const edited = { ...first, label: 'ยอห์น 4:1', labelEdited: true as const }
    const editedCue = { ...cue, slides: [edited, last] }
    expect(scriptureOutputLayout(scriptureReference(editedCue, edited.label, 0)!, abbreviation).reference).toBe(edited.label)
    expect(first.label).toBe('ยอห์น 3:16 · TEST')
  })

  it('keeps fitting verses together, honors verse breaks, and keeps the full passage on one slide when flow is off', () => {
    const verses = findScripturePassage(edition, 'ยอห์น 3:16–18')
    const fits = (cue: NonNullable<ReturnType<typeof buildScriptureCue>>) => cue.slides[0].lines.length <= 2
    expect(paginateScriptureCue(edition, verses, false, fits)?.slides.map((slide) => slide.lines))
      .toEqual([['พระเจ้าทรงรัก', 'ความหวัง'], ['ความเชื่อ']])
    expect(paginateScriptureCue(edition, verses, true, fits)?.slides).toHaveLength(3)
    expect(paginateScriptureCue(edition, verses, true)).toMatchObject({ scriptureFlow: true, slides: [{
      lines: ['พระเจ้าทรงรัก', 'ความหวัง', 'ความเชื่อ'],
      scriptureVerseStarts: [{ line: 0, verse: 16 }, { line: 1, verse: 17 }, { line: 2, verse: 18 }],
    }] })
  })

  it('splits an oversize Thai verse on Unicode boundaries and numbers only its first fragment', () => {
    const [verse] = findScripturePassage(edition, 'ยอห์น 3:16')
    const text = 'พระเจ้าทรงรักความหวัง'.repeat(20)
    const paginated = paginateScriptureCue(edition, [{ ...verse, text }], false,
      (cue) => cue.slides[0].lines[0].length <= 32)!
    expect(paginated.slides.length).toBeGreaterThan(1)
    expect(paginated.slides.flatMap((slide) => slide.lines).join('')).toBe(text)
    expect(paginated.slides.flatMap((slide) => slide.scriptureVerseStarts ?? [])).toEqual([{ line: 0, verse: 16 }])
    expect(paginated.slides.every((slide) => slide.label === 'ยอห์น 3:16 · TEST' && !/^\p{M}/u.test(slide.lines[0]))).toBe(true)
  })

  it('numbers only the starts of verses, without inserting numbers into saved text', () => {
    const [first] = findScripturePassage(edition, 'John 3:16')
    const cue = buildScriptureCue(edition, [{ ...first, text: 'ถ้อยคำ '.repeat(100) }], 'verse')!
    const [start, continuation] = cue.slides
    expect(start.lines[0]).toMatch(/^ถ้อยคำ/)
    const settings = { ...defaultScriptureOutputSettings, verseNumbers: true }
    const layout = scriptureOutputLayout(scriptureReference(cue, start.label, 0)!, settings)
    expect(scriptureOutputText(start.lines.join('\n'), layout).text).toMatch(/^16 ถ้อยคำ/)
    expect(scriptureReference(cue, continuation.label, 1)?.numbering).toBeUndefined()
    expect(start.lines[0]).toMatch(/^ถ้อยคำ/)
  })

  it('keeps formatting in an imported single verse and leaves an ambiguous range alone', () => {
    const text = 'เริ่มต้น\nความหวัง'
    const cue = { kind: 'scripture' as const, label: 'ยอห์น ๓:๑๖', slides: [
      { sourceId: 'imported', label: 'ยอห์น ๓:๑๖ (TEST)', lines: text.split('\n') },
      { sourceId: 'ambiguous', label: 'ยอห์น 3:16–4:1', lines: text.split('\n') },
    ] }
    const settings = { reference: 'hidden' as const, completePassage: false, verseNumbers: true }
    const layout = scriptureOutputLayout(scriptureReference(cue, cue.slides[0].label, 0)!, settings)
    const design = { aspectRatio: 16 / 9, layers: [{ kind: 'text' as const, slot: 'content' as const, id: 'reading', text,
      frame: { x: 0, y: 0, width: 1, height: 1 }, runs: [{ text: 'เริ่มต้น', style: { bold: true } }, { text: '\nความหวัง' }] }] }
    expect(scriptureOutputDesign(design, layout).layers[0]).toMatchObject({ text: '16 เริ่มต้น\nความหวัง',
      runs: [{ text: '16 เ', style: { bold: true } }, { text: 'ริ่มต้น', style: { bold: true } }, { text: '\nความหวัง' }] })
    expect(scriptureReference(cue, cue.slides[1].label, 1)?.numbering).toBeUndefined()
    expect(design.layers[0].text).toBe(text)
  })

  it('styles verse starts and inline references independently of saved Scripture text and paragraphs', () => {
    const text = 'In the beginning\nThe same'
    const frame = { x: 0, y: 0, width: 1, height: 1 }
    const design = { aspectRatio: 16 / 9, layers: [{ kind: 'text' as const, slot: 'content' as const, id: 'reading', text,
      frame, runs: [{ text: 'In the beginning\n', paragraph: { index: 1 }, style: { italic: true, color: '#abcdef' } },
        { text: 'The same', paragraph: { index: 2, leftIndent: 0.5 } }] }] }
    const source = { slide: 'John 1:1–2', passage: 'John 1:1–3', last: false, numbering: { text, starts: [{ line: 0, verse: 1 }, { line: 1, verse: 2 }] } }
    const fonts = { text: { color: '#123456', sizeScale: 1.2 }, number: { color: '#654321', sizeScale: 0.6 }, reference: { fontFamily: 'Georgia' } }
    for (const reference of ['before-slide', 'after-slide'] as const) {
      const layout = scriptureOutputLayout(source, { reference, completePassage: false, verseNumbers: true, fonts })
      const layer = scriptureOutputDesign(design, layout).layers[0]
      if (layer.kind !== 'text') throw Error('Expected the Scripture text layer')
      expect(layer.runs?.map((run) => run.text).join('')).toBe(layer.text)
      expect(layer.runs).toEqual(expect.arrayContaining([
        expect.objectContaining({ text: '1 ', style: { color: '#654321', italic: true, sizeScale: 0.6 } }),
        expect.objectContaining({ text: 'In the beginning\n', style: { color: '#123456', italic: true, sizeScale: 1.2 } }),
        expect.objectContaining({ text: '2 ', paragraph: { index: 2, leftIndent: 0.5 }, style: { color: '#654321', sizeScale: 0.6 } }),
        expect.objectContaining({ text: expect.stringContaining('John 1:1–2'), style: expect.objectContaining({ fontFamily: 'Georgia' }) }),
      ]))
    }
    const only = scriptureOutputLayout(source, { reference: 'reference-only', completePassage: true, verseNumbers: true, fonts })
    expect(scriptureOutputDesign(design, only).layers[0]).toMatchObject({ text: 'John 1:1–3',
      runs: [{ text: 'John 1:1–3', style: { fontFamily: 'Georgia' } }] })
    expect(design.layers[0].runs[0]).toMatchObject({ text: 'In the beginning\n', style: { color: '#abcdef' } })
  })

  it('keeps normalized output font sizes separate across body, verse number and reference', () => {
    const text = 'Start'
    const source = { slide: 'John 1:1', passage: 'John 1:1', last: true, numbering: { text, starts: [{ line: 0, verse: 1 }] } }
    const layout = scriptureOutputLayout(source, { reference: 'after-slide', completePassage: false, verseNumbers: true,
      fonts: { text: { fontRatio: .065, effects: { underline: true } }, number: { sizeScale: .75, effects: { underline: false } },
        reference: { fontRatio: .035, effects: { fontOpacity: 75 } } } })
    const saved = [{ text, style: { italic: true } }]
    const output = scriptureOutputText(text, layout, saved)
    expect(output.runs).toEqual([
      { text: '1 ', style: { italic: true, sizeScale: .75, output: { effects: { underline: false } } } },
      { text, style: { italic: true, output: { fontRatio: .065, effects: { underline: true } } } },
    ])
    expect(layout.referenceRuns).toEqual([{ text: source.slide, style: { output: { fontRatio: .035, effects: { fontOpacity: 75 } } } }])
    expect(saved).toEqual([{ text, style: { italic: true } }])
  })

  it('applies spacing to the generated reference and places the gap next to visible verse text', () => {
    const text = 'In the beginning'
    const frame = { x: 0, y: 0, width: 1, height: 1 }
    const body = { text, paragraph: { index: 0, leftIndent: 1 }, style: { italic: true } }
    const design = { aspectRatio: 16 / 9, layers: [{ kind: 'text' as const, slot: 'content' as const, id: 'reading', text, frame, runs: [body] }] }
    const source = { slide: 'John 1:1', passage: 'John 1:1–2', last: false }
    const settings = { completePassage: false, referenceInsets: { left: .06, right: .02, top: .03, bottom: .05 } }
    const before = scriptureOutputLayout(source, { ...settings, reference: 'before-slide' })
    expect(before.referenceInsets).toEqual({ left: .06, right: .02, bottom: .05 })
    expect(scriptureOutputDesign(design, before).layers[0]).toMatchObject({
      text: `John 1:1\n${text}`, runs: [{ text: 'John 1:1\n', paragraph: { outputInsets: before.referenceInsets } }, body],
    })
    const after = scriptureOutputLayout(source, { ...settings, reference: 'after-slide' })
    expect(after.referenceInsets).toEqual({ left: .06, right: .02, top: .03 })
    expect(scriptureOutputDesign(design, after).layers[0]).toMatchObject({
      text: `${text}\nJohn 1:1`, runs: [body, { text: '\nJohn 1:1', paragraph: { outputInsets: after.referenceInsets } }],
    })
    const only = scriptureOutputLayout(source, { ...settings, reference: 'reference-only' })
    expect(only.referenceInsets).toEqual({ left: .06, right: .02 })
    const separate = { ...design, layers: [...design.layers, {
      kind: 'text' as const, slot: 'reference' as const, id: 'caption', text: 'John 1:1', frame,
    }] }
    expect(scriptureOutputDesign(separate, only).layers).toMatchObject([
      { text: '' }, { text: 'John 1:1', runs: [{ text: 'John 1:1', paragraph: { outputInsets: only.referenceInsets } }] },
    ])
    expect(scriptureOutputLayout(source, { ...settings, reference: 'after-passage' }).referenceInsets).toBeUndefined()
    expect(design.layers[0].runs).toEqual([body])
  })
})
