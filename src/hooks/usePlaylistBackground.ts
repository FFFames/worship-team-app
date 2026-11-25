/** Updates the background applied to an individual playlist occurrence. */

import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { PlaylistCueAsset } from '../types/database'

export function usePlaylistBackground() {
  return useCallback(async (playlistId: string, entryId: string, asset: PlaylistCueAsset | null) => {
    const { error } = await supabase.from('playlist_songs')
      .update({ background_asset: asset })
      .eq('id', entryId)
      .eq('playlist_id', playlistId)
      .select('id')
      .single()

    if (error) throw new Error(error.message)
  }, [])
}
