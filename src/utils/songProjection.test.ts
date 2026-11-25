import { describe, expect, it } from 'vitest'
import type { PlaylistSong } from '../types/database'
import { createSongProjectionTracker, playlistSongProjection } from './songProjection'

const entry: PlaylistSong = {
  id: 'first-cue', playlist_id: 'schedule', song_id: null, transpose: 0, order: 0, created_at: '',
  cue: { kind: 'song', label: 'Gathering song', slides: [], metadata: { presentationUid: 'ABC', author: 'Composer', referenceNumber: 123 } },
}

describe('song projection activity', () => {
  it('keeps one ID through slide changes and opens a new event for another occurrence or a return', () => {
    const track = createSongProjectionTracker()
    const song = playlistSongProjection(entry)
    const first = track(entry.id, song)
    expect(first?.song).toMatchObject({ id: 'easyworship:abc', uid: 'ABC', author: 'Composer', reference: '123' })
    expect(track(entry.id, song)).toBe(first)
    const second = track('repeat-cue', song)
    expect(second?.id).not.toBe(first?.id)
    expect(second?.song.id).toBe(first?.song.id)
    expect(track(entry.id, song)?.id).not.toBe(first?.id)
  })

  it('starts a new event after a non-song cue and permits an explicit restart from the library', () => {
    const track = createSongProjectionTracker()
    const song = playlistSongProjection(entry)
    const first = track(entry.id, song)
    const scripture = playlistSongProjection({ ...entry, cue: { kind: 'scripture', label: 'Psalm', slides: [] } })
    expect(scripture).toBeUndefined()
    expect(track('scripture', scripture)).toBeUndefined()
    const resumed = track(entry.id, song)
    expect(resumed?.id).not.toBe(first?.id)
    track()
    expect(track(entry.id, song)?.id).not.toBe(resumed?.id)
  })
})
