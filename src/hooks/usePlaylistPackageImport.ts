/** Saves a portable playlist and its linked song copies in one transaction. */

import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { PlaylistPackageManifest, materializePlaylistPackage } from '../utils/playlistPackage'

export function usePlaylistPackageImport() {
  return useCallback(async (playlistId: string, playlist: PlaylistPackageManifest['playlist'],
    { songs, entries }: Awaited<ReturnType<typeof materializePlaylistPackage>>,
  ) => {
    const snapshots = songs.map((song) => ({ ...song, id: crypto.randomUUID() }))
    const { data, error } = await supabase.rpc('import_worshipteam_schedule', {
      p_playlist_id: playlistId,
      p_name: playlist.name,
      p_date: playlist.date,
      p_notes: playlist.notes,
      p_songs: snapshots,
      p_entries: entries.map(({ song, ...entry }) => ({
        ...entry, song_id: song === undefined ? null : snapshots[song].id,
      })),
    })
    if (error) throw new Error(error.message)
    if (data !== playlistId) throw new Error('ตรวจสอบผลการบันทึกเพลย์ลิสต์ไม่ได้ กรุณาลองอีกครั้ง')
    return playlistId
  }, [])
}
