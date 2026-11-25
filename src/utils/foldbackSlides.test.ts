import { describe, expect, it } from 'vitest'
import type { PlaylistSong } from '../types/database'
import { getFoldbackNext } from './foldbackSlides'
import type { PlaylistSlide } from './playlistCues'

const first: PlaylistSlide = { sectionType: 'verse', sectionLabel: 'Verse 1', lines: ['', 'Line one', 'Line two', 'Line three'] }
const last: PlaylistSlide = { sectionType: 'hook', sectionLabel: 'Chorus', lines: ['Chorus'] }
const song: PlaylistSong = {
  id: 'a', playlist_id: 'test', song_id: null, transpose: 0, order: 0, created_at: '',
  cue: { kind: 'song', label: 'Song', slides: [], looping: true },
}
const scripture: PlaylistSong = {
  ...song, id: 'b', order: 1,
  cue: { kind: 'scripture', label: 'John 3', slides: [{ label: 'John 3:16', lines: ['Scripture text'] }] },
}

describe('Foldback next item', () => {
  it('shows up to two lines of the next slide and only the title of the next schedule item', () => {
    const blocks = [last, first]
    const schedule = [song, { ...song, id: 'missing', cue: null }, scripture]
    expect(getFoldbackNext(blocks, 0, song, schedule, 4))
      .toEqual({ label: 'Verse 1', lines: ['Line one', 'Line two'] })
    expect(getFoldbackNext(blocks, 1, song, schedule, 4)).toEqual({ label: 'John 3' })
  })

  it('previews a timed wrap only when the live slide will actually loop', () => {
    const blocks = [first, { ...last, advanceMs: 500 }]
    expect(getFoldbackNext(blocks, 1, song, [song, scripture], 4))
      .toEqual({ label: 'Verse 1', lines: ['Line one', 'Line two'] })
    expect(getFoldbackNext([blocks[1]], 0, song, [song, scripture], 4)).toEqual({ label: 'John 3' })
    expect(getFoldbackNext([first, last], 1, song, [song], 4)).toBeNull()
  })
})
