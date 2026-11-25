/** Protects character formats across song edits, slides, and portable backups. */

import { describe, expect, it } from 'vitest'
import type { PlaylistSong, Section, Song } from '../types/database'
import type { SlideDesign } from '../types/slideDesign'
import { cueForEditing } from './playlistCueEditing'
import { getPlaylistSlides, getSongPresentationSlides } from './playlistCues'
import { validLyricRuns } from './playlistPackageManifest'
import { reparseLibrarySong } from './songLibrarySlides'
import { formatLyricRuns, lyricRunsByLine } from './songLyricFormatting'

const section: Section = { type: 'verse', label: 'Verse 1', marker: '', slideBreaks: [6],
  lines: [{ lyrics: 'Alpha Beta', chords: 'C     Am' }, { lyrics: 'Beta', chords: 'G' }],
  lyricRuns: [{ text: 'Alpha ' }, { text: 'Beta', style: { bold: true } }, { text: '\n' }, { text: 'Beta', style: { italic: true } }],
}
const song = { id: 'song', title: 'Song', raw_content: '[Verse 1]\nC     Am\nAlpha Beta\nG\nBeta', sections: [section] } as Song
const theme: SlideDesign = { aspectRatio: 16 / 9, layers: [
  { kind: 'text', id: 'lyrics', slot: 'content', text: '', frame: { x: 0, y: 0, width: 1, height: 1 }, style: { color: '#abcdef' } },
  { kind: 'text', id: 'footer', text: 'Footer', frame: { x: 0, y: .9, width: 1, height: .1 } },
] }

describe('formatting library song lyrics', () => {
  it('keeps Thai and emoji graphemes whole and preserves styles outside the selection', () => {
    const text = 'ก้😀 word'
    const result = formatLyricRuns(text, [{ text: 'ก้', style: { italic: true } }, { text: '😀 word' }], { start: 1, end: 3 }, { color: '#aabbcc' })
    expect(result).toEqual([{ text: 'ก้', style: { italic: true, color: '#aabbcc' } }, { text: '😀', style: { color: '#aabbcc' } }, { text: ' word' }])
    expect(formatLyricRuns(text, result, { start: 0, end: 2 }, null)?.[0]).toEqual({ text: 'ก้' })
    expect(formatLyricRuns(text, result, { start: 2, end: 2 }, { bold: true })).toBe(result)
  })

  it('preserves the distinction between repeated lyrics across prepared and automatic layouts', () => {
    const prepared = getSongPresentationSlides(song, 1)
    expect(prepared.map(({ lines }) => lines)).toEqual([['Alpha '], ['Beta', 'Beta']])
    expect(lyricRunsByLine(prepared[1].lines.join('\n'), prepared[1].lyricRuns)).toEqual([
      [{ text: 'Beta', style: { bold: true } }], [{ text: 'Beta', style: { italic: true } }],
    ])
    const automatic = { ...song, sections: [{ ...section, slideBreaks: null }] }
    expect(getSongPresentationSlides(automatic, 1)[1].lyricRuns).toEqual([{ text: 'Beta', style: { italic: true } }])
    const entry = { song } as PlaylistSong
    const cue = cueForEditing(entry)
    expect(cue?.slides.map(({ chords }) => chords)).toEqual([['C'], ['Am', 'G']])
    const withTheme = getPlaylistSlides({ ...entry, cue, slide_theme: { title: 'Theme', design: theme } }, 4)
    expect(withTheme[1].design?.layers[0]).toMatchObject({ runs: prepared[1].lyricRuns, style: { color: '#abcdef' } })
    expect(withTheme[1].design?.layers[1]).toEqual(theme.layers[1])
  })

  it('patches each selected effect independently and retains untouched native formatting', () => {
    const first = { text: 'Alpha', style: { outline: { color: '#aa003380', width: .05 }, bold: true } }
    const second = { text: ' Beta', style: { outline: { color: '#337700cc', width: .1 }, textShadow: { angle: -25 } } }
    const edited = formatLyricRuns('Alpha Beta', [first, second], { start: 2, end: 9 }, (style) => ({
      outline: { color: (style?.outline && style.outline.color?.slice(0, 7)) + '40' },
    }))
    expect(edited).toEqual([
      { ...first, text: 'Al' },
      { text: 'pha', style: { outline: { color: '#aa003340', width: .05 }, bold: true } },
      { text: ' Bet', style: { outline: { color: '#33770040', width: .1 }, textShadow: { angle: -25 } } },
      { ...second, text: 'a' },
    ])
    expect(validLyricRuns(edited, 'Alpha Beta')).toBe(true)
  })

  it('retains formatting through a plain lyric edit and requires matching text in packages', () => {
    const next = reparseLibrarySong(song.raw_content.replace('Alpha Beta', 'Long Alpha Beta'), { sections: [section] }).sections[0]
    expect(next.lyricRuns).toEqual([{ text: 'Long Alpha ' }, { text: 'Beta', style: { bold: true } }, { text: '\n' }, { text: 'Beta', style: { italic: true } }])
    expect(next.slideBreaks).toEqual([11])
    expect(validLyricRuns(next.lyricRuns, 'Long Alpha Beta\nBeta')).toBe(true)
    expect(validLyricRuns(next.lyricRuns, 'Unrelated lyrics')).toBe(false)
  })
})
