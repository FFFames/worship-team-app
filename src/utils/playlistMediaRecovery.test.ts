/** Regression coverage for repeated and layer-only media references. */

import { describe, expect, it } from 'vitest'
import type { PlaylistSong } from '../types/database'
import { playlistMediaReferences } from './playlistMediaRecovery'

describe('recovering media from a schedule', () => {
  it('collects each file once per playlist and shows every occurrence that references it', () => {
    const image = { kind: 'image' as const, filename: 'picture.png', archivePath: 'Media/picture.png' }
    const audio = { kind: 'audio' as const, filename: 'sound.wav', archivePath: 'Media/sound.wav', role: 'background' as const }
    const entry: PlaylistSong = {
      id: 'first', playlist_id: 'one', song_id: null, order: 0, transpose: 0, created_at: '',
      cue: { kind: 'presentation', label: 'Slides', slides: [
        { label: 'One', lines: [], assets: [image], design: { aspectRatio: 16 / 9, layers: [
          { kind: 'media', id: 'picture', asset: image, frame: { x: 0, y: 0, width: 1, height: 1 } },
        ], soundtracks: [audio] } },
        { label: 'Two', lines: [], assets: [{ kind: 'video', filename: 'Disc', dvd: { id: 'disc', name: 'Disc' } }] },
      ] },
    }
    const second: PlaylistSong = { ...entry, id: 'second', order: 1, cue: null, background_asset: image }
    expect(playlistMediaReferences([entry, second]).map(({ asset, positions }) => ({ filename: asset.filename, positions }))).toEqual([
      { filename: 'picture.png', positions: [1, 2] }, { filename: 'sound.wav', positions: [1] },
    ])
  })
})
