/** Hooks for fetching and managing playlists and their songs using Supabase */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import type { Playlist, PlaylistCue, PlaylistInsert, PlaylistSong } from '../types/database'
import { deleteScheduleMedia } from '../utils/scheduleMedia'
import { isLegacyGlobalThemeEntry } from '../utils/easyWorshipScheduleThemes'

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPlaylists = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: sbError } = await supabase
        .from('playlists')
        .select('*')
        .order('created_at', { ascending: false })

      if (sbError) throw sbError
      setPlaylists(data as Playlist[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch playlists')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPlaylists()
  }, [fetchPlaylists])

  const createPlaylist = useCallback(async (name: string, description?: string): Promise<Playlist> => {
    const { data, error: sbError } = await supabase
      .from('playlists')
      .insert({
        name,
        date: new Date().toISOString().split('T')[0],
        notes: description ?? null,
        user_id: 'default',
      })
      .select()
      .single()

    if (sbError) throw sbError

    const newPlaylist = data as Playlist
    setPlaylists((prev) => [newPlaylist, ...prev])
    return newPlaylist
  }, [])

  const updatePlaylist = useCallback(async (id: string, updates: Partial<PlaylistInsert>): Promise<void> => {
    const { error: sbError } = await supabase
      .from('playlists')
      .update(updates)
      .eq('id', id)

    if (sbError) throw sbError

    setPlaylists((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p))
    )
  }, [])

  const deletePlaylist = useCallback(async (id: string): Promise<void> => {
    // playlist_songs should cascade delete via FK
    const { error: sbError } = await supabase
      .from('playlists')
      .delete()
      .eq('id', id)

    if (sbError) throw sbError
    setPlaylists((prev) => prev.filter((p) => p.id !== id))
    await deleteScheduleMedia(id).catch(() => {})
  }, [])

  return { playlists, loading, error, createPlaylist, updatePlaylist, deletePlaylist, refresh: fetchPlaylists }
}

/** Fetch only playlist metadata for lightweight origin breadcrumbs. */
export function usePlaylistInfo(playlistId: string | undefined) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null)

  useEffect(() => {
    if (!playlistId) {
      setPlaylist(null)
      return
    }

    let cancelled = false
    supabase
      .from('playlists')
      .select('*')
      .eq('id', playlistId)
      .single()
      .then(({ data, error }) => {
        if (!cancelled && !error) setPlaylist(data as Playlist)
      })

    return () => {
      cancelled = true
    }
  }, [playlistId])

  return playlist
}

export function usePlaylist(playlistId: string | undefined) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const [songs, setSongs] = useState<PlaylistSong[]>([])
  const visibleSongs = useMemo(() => songs.filter((entry) => !isLegacyGlobalThemeEntry(entry)), [songs])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPlaylist = useCallback(async (showLoading = true) => {
    if (!playlistId) {
      setPlaylist(null)
      setSongs([])
      setLoading(false)
      return
    }

    try {
      if (showLoading) setLoading(true)
      setError(null)

      // Fetch playlist metadata
      const { data: plData, error: plError } = await supabase
        .from('playlists')
        .select('*')
        .eq('id', playlistId)
        .single()

      if (plError) throw plError
      setPlaylist(plData as Playlist)

      // Fetch playlist songs joined with song details
      const { data: psData, error: psError } = await supabase
        .from('playlist_songs')
        .select('*, song:songs(*)')
        .eq('playlist_id', playlistId)
        .order('order', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })

      if (psError) throw psError
      setSongs(psData as PlaylistSong[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch playlist')
    } finally {
      setLoading(false)
    }
  }, [playlistId])

  useEffect(() => {
    fetchPlaylist()
  }, [fetchPlaylist])

  const addSong = useCallback(async (songId: string): Promise<void> => {
    if (!playlistId) return

    const { error: sbError } = await supabase.rpc('append_playlist_song', {
      p_playlist_id: playlistId,
      p_song_id: songId,
    })

    if (sbError) throw new Error(sbError.message)
    await fetchPlaylist(false)
  }, [playlistId, fetchPlaylist])

  const removeSong = useCallback(async (playlistSongId: string): Promise<void> => {
    const { error: sbError } = await supabase
      .from('playlist_songs')
      .delete()
      .eq('id', playlistSongId)

    if (sbError) throw sbError
    await fetchPlaylist(false)
  }, [fetchPlaylist])

  const reorderSongs = useCallback(async (orderedIds: string[]): Promise<void> => {
    if (!playlistId) return

    let position = 0
    const fullOrder = songs.length !== visibleSongs.length && orderedIds.length === visibleSongs.length
      ? songs.map((entry) => isLegacyGlobalThemeEntry(entry) ? entry.id : orderedIds[position++])
      : orderedIds
    const { error: sbError } = await supabase.rpc('reorder_playlist_entries', {
      p_playlist_id: playlistId,
      p_entry_ids: fullOrder,
    })
    await fetchPlaylist(false)
    if (sbError) throw new Error(sbError.message)
  }, [fetchPlaylist, playlistId, songs, visibleSongs.length])

  const setTranspose = useCallback(async (playlistSongId: string, semitones: number): Promise<void> => {
    const { error: sbError } = await supabase
      .from('playlist_songs')
      .update({ transpose: semitones })
      .eq('id', playlistSongId)
      .not('song_id', 'is', null)

    if (sbError) throw sbError

    setSongs((prev) =>
      prev.map((ps) =>
        ps.id === playlistSongId ? { ...ps, transpose: semitones } : ps
      )
    )
  }, [])

  const editCue = useCallback(async (entry: PlaylistSong, cue: PlaylistCue | null) => {
    if (!playlistId || entry.playlist_id !== playlistId) throw new Error('ไม่พบรายการในเพลย์ลิสต์นี้')
    const { error: saveError } = await supabase.rpc('edit_playlist_cue', {
      p_playlist_id: playlistId,
      p_entry_id: entry.id,
      p_expected_cue: entry.cue ?? null,
      p_cue: cue,
    })
    if (saveError?.code === '40001') {
      const { data: latest, error: refreshError } = await supabase.from('playlist_songs')
        .select('cue').eq('playlist_id', playlistId).eq('id', entry.id).maybeSingle()
      if (!refreshError) {
        setSongs((current) => latest ? current.map((row) => row.id === entry.id ? { ...row, cue: latest.cue as PlaylistCue | null } : row)
          : current.filter((row) => row.id !== entry.id))
      }
      throw new Error('รายการนี้ถูกแก้ไขหรือลบจากอีกหน้าต่างแล้ว กรุณาเปิดรายการล่าสุดก่อนบันทึก')
    }
    if (saveError) throw new Error(saveError.message)
    setSongs((current) => current.map((row) => row.id === entry.id ? { ...row, cue } : row))
  }, [playlistId])

  return { playlist, songs: visibleSongs, loading, error, addSong, removeSong, reorderSongs, setTranspose, editCue, refresh: fetchPlaylist }
}
