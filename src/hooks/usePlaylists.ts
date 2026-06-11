/** Hooks for fetching and managing playlists and their songs using Supabase */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Playlist, PlaylistInsert, PlaylistSong, Song } from '../types/database'

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
  }, [])

  return { playlists, loading, error, createPlaylist, updatePlaylist, deletePlaylist, refresh: fetchPlaylists }
}

export function usePlaylist(playlistId: string | undefined) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const [songs, setSongs] = useState<(PlaylistSong & { song?: Song })[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPlaylist = useCallback(async () => {
    if (!playlistId) {
      setPlaylist(null)
      setSongs([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
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

      if (psError) throw psError
      setSongs(psData as (PlaylistSong & { song?: Song })[])
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

    const nextOrder = songs.length > 0
      ? Math.max(...songs.map((s) => s.order)) + 1
      : 0

    const { error: sbError } = await supabase
      .from('playlist_songs')
      .insert({
        playlist_id: playlistId,
        song_id: songId,
        transpose: 0,
        order: nextOrder,
      })

    if (sbError) throw sbError
    await fetchPlaylist()
  }, [playlistId, songs, fetchPlaylist])

  const removeSong = useCallback(async (playlistSongId: string): Promise<void> => {
    const { error: sbError } = await supabase
      .from('playlist_songs')
      .delete()
      .eq('id', playlistSongId)

    if (sbError) throw sbError
    await fetchPlaylist()
  }, [fetchPlaylist])

  const reorderSongs = useCallback(async (orderedIds: string[]): Promise<void> => {
    if (!playlistId) return

    // Update order for each playlist song — use allSettled for partial failure tolerance
    const updates = orderedIds.map((psId, index) =>
      supabase
        .from('playlist_songs')
        .update({ order: index })
        .eq('id', psId)
    )

    const results = await Promise.allSettled(updates)
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failures.length > 0) {
      console.error('Some reorder updates failed:', failures)
      // Still refresh to get current DB state
    }
    await fetchPlaylist()
  }, [fetchPlaylist, playlistId])

  const setTranspose = useCallback(async (playlistSongId: string, semitones: number): Promise<void> => {
    const { error: sbError } = await supabase
      .from('playlist_songs')
      .update({ transpose: semitones })
      .eq('id', playlistSongId)

    if (sbError) throw sbError

    setSongs((prev) =>
      prev.map((ps) =>
        ps.id === playlistSongId ? { ...ps, transpose: semitones } : ps
      )
    )
  }, [])

  return { playlist, songs, loading, error, addSong, removeSong, reorderSongs, setTranspose, refresh: fetchPlaylist }
}
