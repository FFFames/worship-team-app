import type { PlaylistSong, Song } from '../types/database'
import type { SongHistorySong } from './easyWorshipSongHistory'

export type SongProjection = {
  id: string
  song: Pick<SongHistorySong, 'id' | 'uid' | 'title' | 'author' | 'copyright' | 'administrator' | 'reference'>
}

export function librarySongProjection(song: Song): SongProjection['song'] {
  return { id: song.id, uid: null, title: song.title, author: song.artist, copyright: song.copyright ?? null,
    administrator: song.copyright_administrator ?? null, reference: song.ccli_number ?? null }
}

function metadataText(value: unknown): string | null {
  return typeof value === 'number' ? String(value) : typeof value === 'string' && value.trim() ? value.trim() : null
}

export function playlistSongProjection(entry: PlaylistSong): SongProjection['song'] | undefined {
  if (!entry.cue) return entry.song ? librarySongProjection(entry.song) : undefined
  if (entry.cue.kind !== 'song') return undefined
  const { label, metadata } = entry.cue
  const uid = metadataText(metadata?.presentationUid)
  return { id: entry.song?.id ?? (uid ? `easyworship:${uid.toLowerCase()}` : `cue:${entry.id}`), uid, title: label,
    author: metadataText(metadata?.author) ?? entry.song?.artist ?? null,
    copyright: metadataText(metadata?.copyright) ?? entry.song?.copyright ?? null,
    administrator: metadataText(metadata?.administrator) ?? entry.song?.copyright_administrator ?? null,
    reference: metadataText(metadata?.referenceNumber) ?? entry.song?.ccli_number ?? null }
}

/** All updates within one song occurrence carry the same ID to every audience window. */
export function createSongProjectionTracker() {
  let current: { cueId: string; projection: SongProjection } | undefined
  return (cueId?: string, song?: SongProjection['song']): SongProjection | undefined => {
    if (!cueId || !song) {
      current = undefined
      return undefined
    }
    if (current?.cueId !== cueId) current = { cueId, projection: { id: crypto.randomUUID(), song } }
    return current.projection
  }
}
