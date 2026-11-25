/** Applies the reviewed decision with the same source and destination revisions. */

import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { PlaylistSong } from '../types/database'
import { songPayloadFromOccurrence, type SongDecision } from '../utils/playlistSongReconciliation'
import { readScheduleMedia } from '../utils/scheduleMedia'
import { storeSongAppearance, storeSongLayoutAssets } from '../utils/slideDesignAssets'
import type { ReviewedLibrarySong } from './useEasyWorshipScheduleSongCatalog'

export function usePlaylistSongReconciliation() {
  return useCallback(async (entry: PlaylistSong, action: SongDecision, id: string, target?: ReviewedLibrarySong) => {
    const payload = action === 'add' || action === 'replace' ? songPayloadFromOccurrence(entry, action === 'replace' ? target : undefined) : undefined
    const warnings = new Set<string>()
    if (action === 'replace' && target && payload?.appearance?.looping !== undefined
      && Object.keys(payload.appearance).length === 1) {
      const { data, error } = await supabase.from('songs').select('appearance').eq('id', target.id)
        .eq('updated_at', target.updated_at).maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new Error('เพลงในคลังถูกแก้จากอีกหน้าต่าง กรุณาตรวจฉบับล่าสุดอีกครั้ง')
      payload.appearance = { ...data.appearance, looping: payload.appearance.looping }
    }
    if (payload) {
      const cache = new Map<string, string | null>()
      const readAsset = async (path: string) => {
        const blob = await readScheduleMedia(entry.playlist_id, path)
        if (!blob) throw new Error('ไม่พบแฟ้มสื่อในเบราว์เซอร์นี้')
        return blob
      }
      if (payload.appearance) {
        payload.appearance = await storeSongAppearance(payload.appearance, readAsset, cache)
        payload.appearance.warnings?.forEach((warning) => warnings.add(warning))
      }
      for (const section of payload.sections) {
        for (const prepared of section.slideLayouts ?? []) {
          prepared.layout = await storeSongLayoutAssets(prepared.layout, readAsset, cache, warnings)
        }
      }
    }
    const { data, error } = await supabase.rpc('reconcile_playlist_song', {
      p_playlist_id: entry.playlist_id,
      p_entry_id: entry.id,
      p_expected_song_id: entry.song_id,
      p_expected_cue: entry.cue,
      p_action: action,
      p_target_id: id,
      p_target_updated_at: target?.updated_at ?? null,
      p_song: payload ?? null,
    })
    if (error?.code === '40001') throw new Error('เพลงในตารางหรือคลังถูกแก้จากอีกหน้าต่าง กรุณาตรวจฉบับล่าสุดอีกครั้ง')
    if (error) throw new Error(error.message)
    if (data !== id) throw new Error('ยังยืนยันผลการบันทึกไม่ได้ กรุณาตรวจรายการอีกครั้ง')
    return { warnings: [...warnings] }
  }, [])
}
