/** Looks up song records relevant to a schedule merge. */

import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { ScheduleSongCatalogEntry } from '../utils/easyWorshipScheduleSongs'
import type { Song } from '../types/database'

const fields = 'id,title,artist,copyright,ccli_number,sections,raw_content,updated_at,original_key,easyworship_uid,looping:appearance->looping'
export type ReviewedLibrarySong = ScheduleSongCatalogEntry & Pick<Song, 'updated_at' | 'original_key'>
type Lookup = { id: string | null; song: { title: string; sourceUid?: string } }

function filterList(values: string[]) {
  // PostgREST quoted list values can contain commas, quotes and parentheses.
  return '(' + values.map((value) => '"' + value.replace(/[\\"]/g, '\\$&') + '"').join(',') + ')'
}

async function findBy(column: 'title' | 'easyworship_uid', values: string[]): Promise<ReviewedLibrarySong[]> {
  if (!values.length) return []
  const found: ReviewedLibrarySong[] = []
  const pageSize = 200
  const filter = filterList(values)
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('songs').select(fields).filter(column, 'in', filter)
      .order('id').range(offset, offset + pageSize - 1)
    if (error) throw new Error(error.message)
    found.push(...data as ReviewedLibrarySong[])
    if (data.length < pageSize) return found
  }
}

export function useEasyWorshipScheduleSongCatalog() {
  return useCallback(async (songs: Lookup[]) => {
    const found = new Map<string, ReviewedLibrarySong>()
    const batchSize = 20
    for (let offset = 0; offset < songs.length; offset += batchSize) {
      const batch = songs.slice(offset, offset + batchSize)
      const titles = [...new Set(batch.map(({ song }) => song.title))]
      const sourceIds = [...new Set(batch.flatMap(({ song }) => song.sourceUid ? [song.sourceUid] : []))]
      const linkedIds = batch.flatMap(({ id }) => id ? [id] : [])
      const [ids, matches, originals] = await Promise.all([
        linkedIds.length ? supabase.from('songs').select(fields).in('id', linkedIds) : { data: [], error: null },
        findBy('title', titles),
        findBy('easyworship_uid', sourceIds),
      ])
      if (ids.error) throw new Error(ids.error.message)
      for (const song of [...ids.data as ReviewedLibrarySong[], ...matches, ...originals]) found.set(song.id, song)
    }
    return [...found.values()]
  }, [])
}
