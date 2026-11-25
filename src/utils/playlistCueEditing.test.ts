/** Protects chord, layout, and attachment data when editing a playlist occurrence. */

import { describe, expect, it } from 'vitest'
import type { PlaylistSong, Song } from '../types/database'
import type { DesignLayer } from '../types/slideDesign'
import { cueForEditing, editCueAsset, editCueLines, editCueTextLayer, formatCueLyrics, songForPlaylistEntry, type CueSlide } from './playlistCueEditing'
import { getPlaylistSlides } from './playlistCues'
import { reflowSongCueSlide, splitSongCueSlide } from './songCueLayout'
import { formatLyricRuns } from './songLyricFormatting'

const song: Song = {
  id: 'library-id', title: 'คลังเพลง', original_key: 'C', raw_content: '',
  artist: 'ผู้แต่ง', tempo: null, time_signature: null, youtube_url: null,
  user_id: null, tags: null, favorite: null, created_at: '', updated_at: '',
  sections: [
    { type: 'hook', label: 'Chorus', marker: '**', lines: [{ lyrics: 'ก่อนแก้', chords: 'C G' }, { lyrics: 'บรรทัดต่อมา', chords: '' }] },
  ],
}
const entry: PlaylistSong = {
  id: 'entry', playlist_id: 'playlist', song_id: song.id, song, order: 2, transpose: 2, created_at: '',
}

describe('playlist cue editing', () => {
  it('keeps the linked song and chord alignment while projecting only the edited occurrence', () => {
    const draft = cueForEditing(entry)
    if (!draft) throw new Error('Missing cue draft')
    expect(draft.slides[0]).toMatchObject({ label: 'Chorus', sectionType: 'hook', chords: ['C G', ''] })
    const slide = { ...draft.slides[0], lines: ['เนื้อร้องเฉพาะรอบนี้', 'บรรทัดสอง'] }
    const local = { ...entry, cue: { ...draft, label: 'ชื่อเฉพาะรายการ', slides: [slide] } }

    expect(songForPlaylistEntry(local)).toMatchObject({
      id: 'library-id', title: 'ชื่อเฉพาะรายการ', original_key: 'C',
      sections: [{ label: 'Chorus', lines: [{ lyrics: 'เนื้อร้องเฉพาะรอบนี้', chords: 'C G' }, { lyrics: 'บรรทัดสอง', chords: '' }] }],
    })
    expect(getPlaylistSlides(local, 1)).toMatchObject([{ sectionType: 'hook', lines: ['เนื้อร้องเฉพาะรอบนี้', 'บรรทัดสอง'] }])
    expect(songForPlaylistEntry(entry)?.sections?.[0].lines[0].lyrics).toBe('ก่อนแก้')
  })

  it('updates only the selected text and image in a layered imported slide', () => {
    const frame = { x: 0.1, y: 0.2, width: 0.55, height: 0.25 }
    const original = { kind: 'image', filename: 'old.jpg', archivePath: 'images/old.jpg' } as const
    const photo: DesignLayer = { kind: 'media', id: 'photo', frame, asset: original }
    const heading: DesignLayer = { kind: 'text', id: 'heading', frame, text: 'ก่อนแก้', style: { bold: true } }
    const description: DesignLayer = { kind: 'text', id: 'description', frame, text: 'รายละเอียด' }
    const slide: CueSlide = {
      label: 'Announce', lines: ['ก่อนแก้', 'รายละเอียด'],
      design: { aspectRatio: 16 / 9, layers: [photo, heading, description] },
      assets: [original, { kind: 'camera', filename: 'กล้องหน้า Hall', role: 'background' }],
      sourceId: 'source-slide', advanceMs: 2500,
    }

    const text = editCueTextLayer(slide, 'heading', 'หัวข้อใหม่')
    const changed = editCueAsset(text, 0, { kind: 'image', filename: 'new.png', libraryId: 'library-photo' })
    expect(changed).toMatchObject({
      lines: ['หัวข้อใหม่', 'รายละเอียด'], sourceId: 'source-slide', advanceMs: 2500,
      assets: [{ filename: 'new.png', libraryId: 'library-photo' }, { kind: 'camera' }],
      design: { layers: [
        { id: 'photo', frame, asset: { filename: 'new.png', libraryId: 'library-photo' } },
        { id: 'heading', text: 'หัวข้อใหม่', style: { bold: true } },
        description,
      ] },
    })
    expect(editCueAsset(changed, 0).design?.layers.map((layer) => layer.id)).toEqual(['heading', 'description'])
    expect(slide.design?.layers[0]).toEqual(photo)
  })

  it('keeps static text outside the lyrics and chord rows of a song occurrence', () => {
    const frame = { x: 0, y: 0, width: 1, height: 1 }
    const slide: CueSlide = {
      label: 'Chorus', sectionType: 'hook', lines: ['First line'], chords: ['C'],
      design: { aspectRatio: 16 / 9, layers: [
        { kind: 'text', id: 'caption', frame, text: 'Caption' },
        { kind: 'text', id: 'lyrics', frame, text: 'First line', slot: 'content' },
      ] },
    }

    const caption = editCueTextLayer(slide, 'caption', 'New caption')
    expect(caption.lines).toEqual(['First line'])
    expect(editCueTextLayer(caption, 'lyrics', 'New lyrics')).toMatchObject({ lines: ['New lyrics'], chords: ['C'] })
  })

  it('formats one plain occurrence and keeps its style through a lyric edit without changing its linked song', () => {
    const cue = cueForEditing(entry)!
    const original = cue.slides[0]
    const formatted = formatCueLyrics(original, [
      { text: 'ก่อนแก้', style: { strike: true, textShadow: {} } }, { text: '\nบรรทัดต่อมา' },
    ])
    const edited = editCueLines(formatted, ['ก่อนแก้', 'บรรทัดใหม่'])
    expect(edited.chords).toBe(original.chords)
    expect(edited.lyricRuns?.[0]).toEqual({ text: 'ก่อนแก้', style: { strike: true, textShadow: {} } })
    expect(getPlaylistSlides({ ...entry, cue: { ...cue, slides: [edited] } }, 4)[0].lyricRuns).toEqual(edited.lyricRuns)
    expect(getPlaylistSlides(entry, 4)[0].lyricRuns).toBeUndefined()
    expect(formatCueLyrics(edited, [{ text: 'outdated selection' }])).toBe(edited)
  })

  it('formats just the imported lyric layer and preserves effect parameters, captions and media', () => {
    const frame = { x: 0, y: 0, width: 1, height: 1 }
    const layer: DesignLayer = { kind: 'text', id: 'lyrics', slot: 'content', frame, text: 'Grace\nPeace',
      runs: [{ text: 'Grace', style: { color: '#123456', outline: { color: '#ffffff', width: .04 } } }, { text: '\nPeace' }] }
    const caption: DesignLayer = { kind: 'text', id: 'caption', text: 'Caption', frame }
    const slide: CueSlide = { label: 'Verse 1', lines: ['Grace', 'Peace'], chords: ['', 'Em'], sourceOrder: 2,
      design: { aspectRatio: 16 / 9, layers: [caption, layer] }, assets: [{ kind: 'image', filename: 'background.jpg' }] }
    const runs = formatLyricRuns(layer.text, layer.runs, { start: 0, end: layer.text.length }, { outline: {} })!
    const formatted = formatCueLyrics(slide, runs)
    expect(formatted).toMatchObject({ lines: slide.lines, chords: slide.chords, assets: slide.assets, sourceOrder: 2 })
    expect(formatted.design?.layers).toEqual([caption, { ...layer, runs }])
    expect(runs).toEqual([{ text: 'Grace', style: { color: '#123456', outline: { color: '#ffffff', width: .04 } } }, { text: '\nPeace', style: { outline: {} } }])
  })

  it('splits a styled lyric line at the cursor, keeping whole chords and the original source ID', () => {
    const frame = { x: 0, y: 0, width: 1, height: 1 }
    const styled: DesignLayer = { kind: 'text', id: 'lyrics', slot: 'content', frame, text: 'ab cd\nตอนต่อ',
      runs: [{ text: 'ab ', style: { bold: true } }, { text: 'cd\nตอนต่อ', style: { italic: true } }] }
    const heading: DesignLayer = { kind: 'text', id: 'caption', frame, text: 'Title' }
    const slide: CueSlide = { label: 'Chorus', sectionType: 'hook', lines: ['ab cd', 'ตอนต่อ'], chords: ['C  Em', 'G'],
      design: { aspectRatio: 16 / 9, layers: [heading, styled] }, advanceMs: 2500, sourceId: '4', sourceOrder: 2 }
    const [head, tail] = splitSongCueSlide(slide, 3) ?? []
    expect(head).toMatchObject({ sourceId: '4', sourceOrder: 2, advanceMs: 2500, lines: ['ab '], chords: ['C'] })
    expect(tail).toMatchObject({ label: 'Chorus', sectionType: 'hook', lines: ['cd', 'ตอนต่อ'], chords: ['Em', 'G'] })
    expect(tail?.sourceId).toBeUndefined()
    expect(tail?.advanceMs).toBeUndefined()
    expect(tail?.design?.layers).toEqual([heading, { ...styled, text: 'cd\nตอนต่อ', runs: [{ text: 'cd\nตอนต่อ', style: { italic: true } }] }])
    expect(splitSongCueSlide({ label: 'TH', lines: ['กิจกำลังมา'] }, 1)?.map((part) => part.lines)).toEqual([['กิ'], ['จกำลังมา']])
    expect(splitSongCueSlide(slide, 5)?.map((part) => part.chords)).toEqual([['C  Em'], ['G']])
  })

  it('reflows a saved occurrence independently and retains the styles of repeated lyric fragments', () => {
    const frame = { x: 0, y: 0, width: 1, height: 1 }
    const layer: DesignLayer = { kind: 'text', id: 'lyrics', slot: 'content', frame, text: 'Amen\nAmen',
      runs: [{ text: 'Amen\n', style: { bold: true } }, { text: 'Amen', style: { italic: true } }] }
    const slide: CueSlide = { label: 'Chorus', lines: ['Amen', 'Amen'], design: { aspectRatio: 16 / 9, layers: [layer] } }
    const [first, second] = reflowSongCueSlide(slide, 1)
    expect(first.design?.layers[0]).toMatchObject({ runs: [{ text: 'Amen', style: { bold: true } }] })
    expect(second.design?.layers[0]).toMatchObject({ runs: [{ text: 'Amen', style: { italic: true } }] })
    expect(getPlaylistSlides({ ...entry, cue: { kind: 'song', label: 'Title', lyricLayout: 1, slides: [slide] } }, 4)
      .map(({ lines }) => lines)).toEqual([['Amen'], ['Amen']])
    expect(getPlaylistSlides({ ...entry, cue: { kind: 'song', label: 'Title', slides: [slide] } }, 1)
      .map(({ lines }) => lines)).toEqual([['Amen', 'Amen']])
  })
})
