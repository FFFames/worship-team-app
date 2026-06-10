/** Hook for fetching a single playlist with its ordered songs and managing them */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Playlist, PlaylistSong } from '../types/database'

export function usePlaylist(playlistId: string | undefined) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const [songs, setSongs] = useState<PlaylistSong[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPlaylist = useCallback(async () => {
    if (!playlistId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    // Fetch playlist metadata
    const { data: plData, error: plErr } = await supabase
      .from('playlists')
      .select('*')
      .eq('id', playlistId)
      .single()

    if (plErr) {
      setError(plErr.message)
      setLoading(false)
      return
    }
    setPlaylist(plData as Playlist)

    // Fetch playlist songs joined with song details, ordered by position
    const { data: psData, error: psErr } = await supabase
      .from('playlist_songs')
      .select('*, song:songs(*)')
      .eq('playlist_id', playlistId)
      .order('position', { ascending: true })

    if (psErr) {
      setError(psErr.message)
    } else {
      setSongs(psData as PlaylistSong[])
    }
    setLoading(false)
  }, [playlistId])

  useEffect(() => {
    fetchPlaylist()
  }, [fetchPlaylist])

  // Add a song at the next available position
  const addSong = useCallback(async (songId: string): Promise<void> => {
    if (!playlistId) return

    const nextPos = songs.length > 0
      ? Math.max(...songs.map((s) => s.position)) + 1
      : 0

    const { error: err } = await supabase
      .from('playlist_songs')
      .insert({ playlist_id: playlistId, song_id: songId, position: nextPos })

    if (err) throw new Error(err.message)
    await fetchPlaylist()
  }, [playlistId, songs, fetchPlaylist])

  // Remove a song by playlist_song id, then re-index positions
  const removeSong = useCallback(async (playlistSongId: string): Promise<void> => {
    if (!playlistId) return

    const { error: err } = await supabase
      .from('playlist_songs')
      .delete()
      .eq('id', playlistSongId)

    if (err) throw new Error(err.message)
    await fetchPlaylist()
  }, [playlistId, fetchPlaylist])

  // Reorder songs by providing an array of song_ids in the desired order
  const reorderSongs = useCallback(async (orderedSongIds: string[]): Promise<void> => {
    if (!playlistId) return

    const updates = orderedSongIds.map((songId, index) =>
      supabase
        .from('playlist_songs')
        .update({ position: index })
        .eq('playlist_id', playlistId)
        .eq('song_id', songId)
    )

    await Promise.all(updates)
    await fetchPlaylist()
  }, [playlistId, fetchPlaylist])

  // Set transpose semitones for a specific playlist song entry
  const setTranspose = useCallback(async (playlistSongId: string, semitones: number): Promise<void> => {
    if (!playlistId) return

    const { error: err } = await supabase
      .from('playlist_songs')
      .update({ transpose_semitones: semitones })
      .eq('id', playlistSongId)

    if (err) throw new Error(err.message)
    setSongs((prev) =>
      prev.map((ps) =>
        ps.id === playlistSongId ? { ...ps, transpose_semitones: semitones } : ps
      )
    )
  }, [playlistId])

  return { playlist, songs, loading, error, addSong, removeSong, reorderSongs, setTranspose, refresh: fetchPlaylist }
}
