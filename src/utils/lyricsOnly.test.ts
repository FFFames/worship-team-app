/** Regression coverage for imported lyrics across song editing and projection. */

import { describe, expect, it } from 'vitest'
import { formatLyricsOnly, parseChordLyrics } from './chordParser'
import { buildSlides } from './slideBuilder'

describe('lyrics-only song charts', () => {
  it('round-trips section labels, repeated sections, and chord-shaped lyrics', () => {
    const content = [
      { label: 'ท่อนนำ', lines: ['C', '1. ร้องเพลง', '[Section Verse 1]', '\\ตัวอย่าง'] },
      { label: 'Chorus', lines: ['ร้องด้วยกัน'] },
      { label: 'Chorus', lines: ['ร้องด้วยกัน'] },
    ]
    const sections = parseChordLyrics(formatLyricsOnly(content)).sections

    expect(sections.map(({ label, lines }) => ({ label, lines: lines.map(({ lyrics }) => lyrics) }))).toEqual(content)
    expect(sections.flatMap(({ lines }) => lines).every(({ chords }) => !chords)).toBe(true)
    expect(sections[1].type).toBe('hook')
    expect(parseChordLyrics('[Verse 1]\nC\nร้องด้วยกัน').sections[0].lines).toEqual([
      { chords: 'C', lyrics: 'ร้องด้วยกัน' },
    ])
  })
})

describe('lyric slide reflow', () => {
  it('supports the old four-line default, other line limits, and whole stanzas', () => {
    const sections = parseChordLyrics(formatLyricsOnly([
      { label: 'Verse 1', lines: ['หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า'] },
      { label: 'Chorus', lines: ['ร้องด้วยกัน'] },
    ])).sections

    expect(buildSlides(sections).map(({ lines }) => lines.length)).toEqual([4, 1, 1])
    expect(buildSlides(sections, 1).map(({ lines }) => lines.length)).toEqual([1, 1, 1, 1, 1, 1])
    expect(buildSlides(sections, 2).map(({ lines }) => lines.length)).toEqual([2, 2, 1, 1])
    expect(buildSlides(sections, 'stanza').map(({ lines }) => lines.length)).toEqual([5, 1])
    expect(buildSlides(sections, 2).map(({ sectionLabel }) => sectionLabel)).toEqual([
      'Verse 1', 'Verse 1', 'Verse 1', 'Chorus',
    ])
  })
})
