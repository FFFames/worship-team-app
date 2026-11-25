/** Appends a cue to a playlist through the same ordering lock as linked songs. */

import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { PlaylistCue } from '../types/database'

export function useAppendPlaylistCue() {
  return useCallback(async (playlistId: string, entryId: string, cue: PlaylistCue) => {
    const { error } = await supabase.rpc('append_playlist_cue', {
      p_playlist_id: playlistId,
      p_entry_id: entryId,
      p_cue: cue,
    })
    if (error) throw new Error(error.message)
  }, [])
}
