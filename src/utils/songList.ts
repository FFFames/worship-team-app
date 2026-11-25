/** Applies the same collection and sort to the song library and its print report. */

import type { CollectionSong } from './songCollectionRules'

export type SongSort = 'updated' | 'title' | 'artist'

export function songSort(value: string | null, fallback: SongSort): SongSort {
  return value === 'title' || value === 'artist' || value === 'updated' ? value : fallback
}

export function orderedSongList(songs: CollectionSong[], sort: SongSort, includes?: (song: CollectionSong) => boolean) {
  const filtered = includes ? songs.filter(includes) : [...songs]
  return filtered.sort((a, b) => {
    if (sort === 'updated') return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    if (sort === 'artist') return (a.artist ?? '').localeCompare(b.artist ?? '', 'th')
    return a.title.localeCompare(b.title, 'th')
  })
}
