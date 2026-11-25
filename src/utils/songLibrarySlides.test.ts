/** Protects authored slide offsets across library playback and chart edits. */

import { describe, expect, it } from 'vitest'
import type { PlaylistSong, Section, Song } from '../types/database'
import { formatLyricsOnly } from './chordParser'
import { cueForEditing } from './playlistCueEditing'
import { getSongPresentationSlides } from './playlistCues'
import { preparedLibrarySection, reparseLibrarySong, songLibrarySections } from './songLibrarySlides'

const lines = ['First', 'Second', 'Third', 'Fourth', 'Fifth']
const section: Section = { type: 'verse', label: 'Verse 1', marker: '', lines: lines.map((lyrics) => ({ lyrics, chords: '' })) }

describe('library song slide layouts', () => {
  it('plays older migrated sections verbatim until the operator selects automatic reflow', () => {
    const source = { raw_content: formatLyricsOnly([{ label: 'Verse 1', lines }]), sections: [section] } as Song
    expect(songLibrarySections(source)[0].slideBreaks).toEqual([])
    expect(getSongPresentationSlides(source, 1).map(({ lines }) => lines)).toEqual([lines])
    const automatic = { ...source, sections: [{ ...section, slideBreaks: null }] }
    expect(getSongPresentationSlides(automatic, 2).map(({ lines }) => lines)).toEqual([lines.slice(0, 2), lines.slice(2, 4), lines.slice(4)])
  })

  it('projects multiple custom cuts and initializes occurrences with the same styled lyrics and chords', () => {
    const prepared: Section = { ...section, lines: [{ lyrics: 'Alpha Beta', chords: 'C     Am' }, { lyrics: 'Gamma', chords: 'G' }], slideBreaks: [6, 10] }
    const design = { aspectRatio: 16 / 9, layers: [{ kind: 'text' as const, id: 'lyrics', slot: 'content' as const,
      text: '', frame: { x: 0, y: 0, width: 1, height: 1 }, runs: [{ text: 'Alpha ' }, { text: 'Beta\nGamma', style: { bold: true } }] }] }
    const song = { raw_content: '', sections: [prepared], appearance: { defaultDesign: design } } as Song
    const shown = getSongPresentationSlides(song, 4)
    expect(shown.map(({ lines }) => lines)).toEqual([['Alpha '], ['Beta'], ['Gamma']])
    expect(shown[1].design?.layers[0]).toMatchObject({ text: 'Beta', runs: [{ text: 'Beta', style: { bold: true } }] })
    const cue = cueForEditing({ song } as PlaylistSong)
    expect(cue?.slides.map(({ chords }) => chords)).toEqual([['C'], ['Am'], ['G']])
    expect(preparedLibrarySection(prepared).map(({ lines }) => lines)).toEqual(shown.map(({ lines }) => lines))
  })

  it('keeps a moved boundary after a preceding edit and preserves explicit automatic mode in an import', () => {
    const original = formatLyricsOnly([{ label: 'Verse 1', lines }])
    const updated = original.replace('First', 'Longer First')
    const after = reparseLibrarySong(updated, { sections: [{ ...section, slideBreaks: [12] }] })
    expect(after.sections[0].slideBreaks).toEqual([19])
    expect(preparedLibrarySection(after.sections[0]).map(({ lines }) => lines))
      .toEqual([['Longer First', 'Second'], ['Third', 'Fourth', 'Fifth']])
    expect(reparseLibrarySong(updated.replace('Section Verse 1', 'Section New name'), after).sections[0].slideBreaks).toEqual([19])
    expect(reparseLibrarySong(updated, { sections: [{ ...section, slideBreaks: null }] }).sections[0].slideBreaks).toBeNull()
  })

  it('keeps section effects through chart edits, library reflow and materializing a schedule occurrence', () => {
    const transition = { uid: 'sdDXReveal', values: { Duration: '500' } }
    const raw_content = formatLyricsOnly([{ label: 'Verse 1', lines }])
    const styled = { ...section, transition, slideBreaks: [12] }
    const sections = reparseLibrarySong(raw_content.replace('First', 'Longer First'), { sections: [styled] }).sections
    const song = { raw_content, sections } as Song
    expect(sections[0].transition).toBe(transition)
    expect(getSongPresentationSlides(song, 4).map((slide) => slide.localTransition)).toEqual([transition, transition])
    expect(cueForEditing({ song } as PlaylistSong)?.slides.map((slide) => slide.transition)).toEqual([transition, transition])
    const automatic = { ...song, sections: [{ ...styled, slideBreaks: null }] }
    expect(getSongPresentationSlides(automatic, 2).map((slide) => slide.transition)).toEqual([transition, transition, transition])
  })
})
