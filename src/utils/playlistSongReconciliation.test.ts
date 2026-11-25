import { describe, expect, it } from 'vitest'
import type { PlaylistCue, PlaylistSong } from '../types/database'
import { formatChordRows, parseChordLyrics } from './chordParser'
import { lyricsMatch, readCueSongVersion, reviewSongMatches, songPayloadFromOccurrence } from './playlistSongReconciliation'
import { songLibrarySections } from './songLibrarySlides'

describe('schedule song reconciliation', () => {
  it('keeps a legacy timer and an explicit loop preference when copying an occurrence', () => {
    const cue: PlaylistCue = { kind: 'song', label: 'เพลงจากตาราง', looping: false, slides: [
      { label: 'Verse 1', lines: ['One'], advanceMs: 925 },
      { label: 'Verse 2', lines: ['Two'], playback: { mode: 'media', delayMs: 0, restart: true } },
    ] }
    expect(readCueSongVersion(cue)).toMatchObject({
      appearance: { looping: false }, sections: [
        { playback: { mode: 'timer', delayMs: 925 } }, { playback: { mode: 'media', delayMs: 0, restart: true } },
      ],
    })
    const replacement = songPayloadFromOccurrence({
      id: 'entry', playlist_id: 'playlist', song_id: 'original', transpose: 0, order: 1, created_at: '',
      cue: { ...cue, looping: undefined },
    }, { raw_content: '', sections: null, looping: true })
    expect(replacement.appearance).toEqual({ looping: false })
  })

  it('suggests the renamed native original by source ID and keeps an explicit link authoritative', () => {
    const cue: PlaylistCue = { kind: 'song', label: 'เพลงในตาราง', metadata: { presentationUid: 'PCI-ABC' },
      slides: [{ label: 'Verse 1', lines: ['เนื้อเพลงในตาราง'] }] }
    const sections = readCueSongVersion(cue).sections
    const base = { id: 'same-name', title: cue.label, easyworship_uid: 'pci-other',
      artist: null, copyright: null, sections, raw_content: '' }
    const renamed = { ...base, id: 'original', title: 'เพลงในคลังที่เปลี่ยนชื่อ', easyworship_uid: 'pci-abc', sections: [] }
    expect(reviewSongMatches(cue, null, [base, renamed], sections)).toEqual({ candidates: [renamed], suggested: renamed })
    expect(reviewSongMatches(cue, base.id, [base, renamed], sections).suggested).toBe(base)
    expect(reviewSongMatches(cue, null, [base], sections).suggested).toBeUndefined()
    const secondCopy = { ...renamed, id: 'copy' }
    expect(reviewSongMatches(cue, null, [renamed, secondCopy], sections).suggested).toBeUndefined()
    expect(reviewSongMatches({ ...cue, metadata: undefined }, null, [base, renamed], sections).suggested).toBe(base)
  })

  it('round-trips prepared chord positions, chord-only rows and reserved lyric text', () => {
    const lines = [
      { chords: '    C    G/B  ', lyrics: 'C' },
      { chords: 'Am', lyrics: '[Chords "G"]' },
      { chords: '', lyrics: '[Section Verse 2]' },
      { chords: '', lyrics: '\\ข้อความ' },
      { chords: 'G', lyrics: '' },
    ]
    const chordOnly = [{ chords: '   Em7', lyrics: '' }]
    const raw_content = formatChordRows([
      { type: 'hook', label: 'Chorus', marker: '', lines },
      { type: 'hook', label: 'Chorus', marker: '', lines: chordOnly },
    ]).trimEnd()

    expect(songLibrarySections({ raw_content, sections: null }).map(({ type, label, lines, slideBreaks }) => ({ type, label, lines, slideBreaks }))).toEqual([
      { type: 'hook', label: 'Chorus', lines, slideBreaks: [] },
      { type: 'hook', label: 'Chorus', lines: chordOnly, slideBreaks: [] },
    ])
  })

  it('keeps prepared slide text and formatting and uses only unambiguous matching library chords', () => {
    const cue: PlaylistCue = {
      kind: 'song', label: 'เพลงทดสอบ', metadata: { author: 'ผู้แต่ง', referenceNumber: 108 },
      slides: [
        { label: 'Verse 1', lines: ['Stale fallback'], design: { aspectRatio: 16 / 9, layers: [{
          kind: 'text', id: 'lyrics', slot: 'content', text: 'Match me\nAmbiguous', frame: { x: 0, y: 0, width: 1, height: 1 }, style: { color: '#123456' },
        }] } },
        { label: 'Verse 1', lines: ['Incoming chord', 'Changed line'], chords: ['Am', ''] },
      ],
    }
    const entry: PlaylistSong = { id: 'entry', song_id: null, playlist_id: 'playlist', order: 1, transpose: 2, created_at: '', cue }
    const raw_content = '[Verse 1]\nC  G\nMatch me\nF\nAmbiguous\nG\nAmbiguous\nC\nIncoming chord\nD\nOld line'
    const result = songPayloadFromOccurrence(entry, { raw_content, sections: null })

    expect(result).toMatchObject({ artist: 'ผู้แต่ง', ccli_number: '108', appearance: { sections: [{ index: 0, design: { layers: [{ text: '', style: { color: '#123456' } }] } }] } })
    expect(result.sections.map((section) => section.slideBreaks)).toEqual([[], []])
    expect(result.sections.flatMap((section) => section.lines)).toEqual([
      { chords: 'C  G', lyrics: 'Match me' }, { chords: '', lyrics: 'Ambiguous' },
      { chords: 'Am', lyrics: 'Incoming chord' }, { chords: '', lyrics: 'Changed line' },
    ])
    expect(lyricsMatch(parseChordLyrics(result.raw_content).sections, result.sections)).toBe(true)
    expect(lyricsMatch(parseChordLyrics(raw_content).sections, result.sections)).toBe(false)
    expect(cue.slides[0].lines).toEqual(['Stale fallback'])
  })
})
