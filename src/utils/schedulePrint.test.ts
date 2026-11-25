import { describe, expect, it } from 'vitest'
import type { PlaylistSong, Song } from '../types/database'
import { schedulePrintEntries } from './schedulePrint'

const position = { playlist_id: 'schedule', song_id: null, transpose: 0, order: 0, created_at: '' }

describe('schedule print content', () => {
  it('preserves repeated cues and lyrics while retaining additional positioned text and media titles', () => {
    const first: PlaylistSong = {
      ...position, id: 'first',
      cue: { kind: 'song', label: 'บทเพลง', metadata: { author: 'ผู้แต่ง', referenceNumber: 14908 }, slides: [{
        label: 'Verse', lines: ['เนื้อร้องเดิม', 'เนื้อร้องเดิม'],
        assets: [{ kind: 'image', filename: 'Opening.jpg' }],
        design: { aspectRatio: 16 / 9, layers: [
          { kind: 'text', id: 'lyrics', frame: { x: 0, y: 0, width: 1, height: 1 }, text: 'เนื้อร้องเดิม\nSource annotation' },
          { kind: 'media', id: 'image', frame: { x: 0, y: 0, width: 1, height: 1 }, asset: { kind: 'image', filename: 'Opening.jpg' } },
        ] },
      }] },
    }
    const rows = schedulePrintEntries([first, { ...first, id: 'repeat' }])
    expect(rows.map(({ id, title, position }) => [id, title, position])).toEqual([['first', 'บทเพลง', 1], ['repeat', 'บทเพลง', 2]])
    expect(rows[0]).toMatchObject({ author: 'ผู้แต่ง', reference: '14908', slides: [{
      lines: ['เนื้อร้องเดิม', 'เนื้อร้องเดิม', 'Source annotation'], assets: ['Opening.jpg'],
    }] })
  })

  it('uses the saved lyric lines and CCLI credit of a linked library song', () => {
    const song: Song = {
      id: 'library-song', title: 'Library song', artist: 'Writer', original_key: 'C', tempo: null,
      time_signature: null, youtube_url: null, ccli_number: '1010', raw_content: '',
      sections: [{ label: 'Chorus', type: 'hook', marker: '', lines: [{ chords: 'G Am', lyrics: 'Written lyrics' }] }],
      tags: [], favorite: false, created_at: '', updated_at: '', user_id: null,
    }
    expect(schedulePrintEntries([{ ...position, id: 'first', song }])[0]).toMatchObject({
      ccli: '1010', slides: [{ label: 'Chorus', lines: ['Written lyrics'] }],
    })
  })
})
