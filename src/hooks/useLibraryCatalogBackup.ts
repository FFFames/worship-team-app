/** Reads and restores the shared records carried by a full library backup. */

import { supabase } from '../lib/supabase'
import { catalogColumns, parseLibraryCatalog, type LibraryCatalog } from '../utils/libraryCatalogBackup'

const tables = { songs: 'songs', designs: 'slide_designs', playlists: 'playlists', entries: 'playlist_songs', backgrounds: 'video_backgrounds' } as const
const pageSize = 100

async function readTable(key: keyof LibraryCatalog) {
  const rows: Record<string, unknown>[] = []
  let lastId: string | undefined
  for (;;) {
    let request = supabase.from(tables[key]).select(catalogColumns[key].join(',')).order('id').limit(pageSize)
    if (lastId) request = request.gt('id', lastId)
    const { data, error } = await request
    if (error) throw new Error(`อ่าน ${tables[key]} ไม่สำเร็จ · ${error.message}`)
    const page = data as unknown as { id: string }[]
    rows.push(...page)
    if (page.length < pageSize) return rows
    lastId = page[page.length - 1].id
  }
}

export async function readLibraryCatalog() {
  const keys = Object.keys(tables) as (keyof LibraryCatalog)[]
  const rows = await Promise.all(keys.map(readTable))
  return parseLibraryCatalog(Object.fromEntries(keys.map((key, index) => [key,
    // Each project creates its own built-in welcome background with an empty URL.
    key === 'backgrounds' ? rows[index].filter((row) => row.url !== '') : rows[index],
  ])))
}

async function restoreTable(table: 'songs' | 'slide_designs' | 'video_backgrounds', rows: { id: string }[]) {
  let restored = 0
  // Keep individual requests small for legacy catalogs whose songs have large slide designs.
  const batchSize = 15
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const { data, error } = await supabase.from(table).upsert(rows.slice(offset, offset + batchSize),
      { onConflict: 'id', ignoreDuplicates: true }).select('id')
    if (error) throw new Error(`เรียกคืน ${table} ไม่สำเร็จ · ${error.message}`)
    restored += data.length
  }
  return restored
}

export async function restoreLibraryCatalog(catalog: LibraryCatalog) {
  const songs = await restoreTable('songs', catalog.songs.map((song) => ({ ...song, user_id: 'default' })))
  const designs = await restoreTable('slide_designs', catalog.designs)
  const backgrounds = await restoreTable('video_backgrounds', catalog.backgrounds)
  const byPlaylist = new Map<string, LibraryCatalog['entries']>()
  for (const entry of catalog.entries) {
    const group = byPlaylist.get(entry.playlist_id) ?? []
    group.push(entry)
    byPlaylist.set(entry.playlist_id, group)
  }
  let playlists = 0
  let entries = 0
  for (const playlist of catalog.playlists) {
    const occurrences = byPlaylist.get(playlist.id) ?? []
    const { data, error } = await supabase.rpc('restore_library_playlist', { p_playlist: playlist, p_entries: occurrences })
    if (error) throw new Error(`เรียกคืนเพลย์ลิสต์ ${playlist.name} ไม่สำเร็จ · ${error.message}`)
    if (typeof data !== 'boolean') throw new Error(`ยืนยันผลการเรียกคืนเพลย์ลิสต์ ${playlist.name} ไม่ได้`)
    if (data === true) {
      playlists++
      entries += occurrences.length
    }
  }
  return { songs, designs, playlists, entries, backgrounds }
}
