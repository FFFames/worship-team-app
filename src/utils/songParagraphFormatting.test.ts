/** Covers paragraph targeting, soft line boundaries and style preservation. */

import { describe, expect, it } from 'vitest'
import type { DesignTextRun } from '../types/slideDesign'
import { validLyricRuns } from './playlistPackageManifest'
import { reflowSongCueSlide, splitSongCueSlide } from './songCueLayout'
import { editTextRuns } from './slideDesign'
import { formatLyricParagraphs, lyricParagraphs, selectedLyricParagraphs } from './songParagraphFormatting'

describe('song paragraph editing', () => {
  it('formats the entire paragraph under a collapsed selection without changing character runs', () => {
    const text = 'First\nก้ Good\nLast'
    const runs: DesignTextRun[] = [{ text: 'First\n' }, { text: 'ก้', style: { color: '#abc123' } }, { text: ' Good\nLast' }]
    const paragraphs = lyricParagraphs(text, runs)
    const result = formatLyricParagraphs(paragraphs, selectedLyricParagraphs(paragraphs, { start: 7, end: 7 }),
      () => ({ leftIndent: 0.5, align: 'left' }))
    const format = { index: 1, leftIndent: .5 }
    expect(result).toEqual([
      { text: 'First\n', paragraph: { index: 0 } },
      { text: 'ก้', style: { color: '#abc123' }, paragraph: format, align: 'left' },
      { text: ' Good\n', paragraph: format, align: 'left' },
      { text: 'Last', paragraph: { index: 2 } },
    ])
    expect(validLyricRuns(result, text)).toBe(true)
  })

  it('keeps an imported soft line in its paragraph and honors exclusive selection ends', () => {
    const text = 'Line\nSoft\nSeparate\nEnd'
    const native = { index: 5, leftIndent: 1.5, spaceBefore: .5 }
    const runs: DesignTextRun[] = [
      { text: 'Line\n', paragraph: native, align: 'right' },
      { text: 'Soft', paragraph: native, align: 'right', style: { bold: true } },
      { text: '\nSeparate\n', paragraph: { index: 9, spaceAfter: .75 } },
      { text: 'End', paragraph: { index: 14 }, style: { italic: true } },
    ]
    const paragraphs = lyricParagraphs(text, runs)
    const selected = selectedLyricParagraphs(paragraphs, { start: 6, end: 10 })
    expect(selected).toMatchObject([{ start: 0, end: 10 }])
    const edited = formatLyricParagraphs(paragraphs, selected, () => ({ rightIndent: .5 }))
    expect(lyricParagraphs(text, edited).map(({ format }) => format)).toEqual([
      { leftIndent: 1.5, rightIndent: .5, spaceBefore: .5, align: 'right' }, { spaceAfter: .75, align: undefined }, { align: undefined },
    ])
    const updated = lyricParagraphs(text, edited)
    const restored = formatLyricParagraphs(updated, selectedLyricParagraphs(updated, { start: 5, end: 16 }), () => null)
    expect(restored).toEqual([
      { text: 'Line\n', paragraph: { index: 0 } },
      { text: 'Soft', style: { bold: true }, paragraph: { index: 0 } },
      { text: '\n', paragraph: { index: 0 } },
      { text: 'Separate\n', paragraph: { index: 1 } },
      { text: 'End', style: { italic: true }, paragraph: { index: 2 } },
    ])
  })

  it('retains authored paragraph formats in split and reflowed slides', () => {
    const lines = ['First', 'Second', 'Third']
    const paragraphs = lyricParagraphs(lines.join('\n'))
    const lyricRuns = formatLyricParagraphs(paragraphs, selectedLyricParagraphs(paragraphs, { start: 6, end: 12 }),
      () => ({ lineSpacing: { mode: 'multiple', value: 1.5 } }))
    const slide = { label: 'Verse', lines, lyricRuns, chords: ['C', 'F', 'G'] }
    const [, next] = splitSongCueSlide(slide, 5)!
    expect(next.chords).toEqual(['F', 'G'])
    expect(next.lyricRuns?.[0]).toMatchObject({ text: 'Second\n', paragraph: { lineSpacing: { mode: 'multiple', value: 1.5 } } })
    expect(reflowSongCueSlide(slide, 1)[1].lyricRuns?.[0]).toMatchObject({ text: 'Second', paragraph: { lineSpacing: { value: 1.5 } } })
  })

  it('updates paragraph boundaries when the operator adds or removes a newline', () => {
    const text = 'First\nSoft\nSecond'
    const runs: DesignTextRun[] = [
      { text: 'First\nSoft\n', paragraph: { index: 0, leftIndent: 0.5 } },
      { text: 'Second', style: { italic: true }, paragraph: { index: 1, spaceAfter: 1 } },
    ]
    const inserted = 'First\nSoft\nSec\nond'
    const edited = editTextRuns(runs, text, inserted)
    expect(lyricParagraphs(inserted, edited).map(({ format, runs }) => [format, runs.map((run) => run.text).join('')])).toEqual([
      [{ leftIndent: 0.5, align: undefined }, 'First\nSoft\n'],
      [{ spaceAfter: 1, align: undefined }, 'Sec\n'],
      [{ spaceAfter: 1, align: undefined }, 'ond'],
    ])
    const merged = 'First\nSoftSecond'
    const result = editTextRuns(runs, text, merged)
    expect(lyricParagraphs(merged, result)).toHaveLength(1)
    expect(result?.[1]).toMatchObject({ text: 'Second', paragraph: { index: 0, leftIndent: .5 }, style: { italic: true } })
    const replaced = 'New chorus\nNew verse'
    const afterReplacement = editTextRuns(runs, text, replaced)
    expect(lyricParagraphs(replaced, afterReplacement).map(({ format }) => format.leftIndent)).toEqual([.5, .5])
  })
})
