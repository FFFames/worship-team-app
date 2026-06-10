/** Hooks for fetching and managing playlists and their songs */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Playlist, PlaylistInsert, PlaylistSong } from '../types/database'

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPlaylists = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('playlists')
      .select('*')
      .order('created_at', { ascending: false })

    if (err) {
      setError(err.message)
    } else {
      setPlaylists(data as Playlist[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchPlaylists()
  }, [fetchPlaylists])

  const createPlaylist = useCallback(async (name: string, description?: string): Promise<Playlist> => {
    const insert: PlaylistInsert = { name, description: description ?? null }
    const { data, error: err } = await supabase
      .from('playlists')
      .insert(insert)
      .select()
      .single()

    if (err) throw new Error(err.message)
    const newPlaylist = data as Playlist
    setPlaylists((prev) => [newPlaylist, ...prev])
    return newPlaylist
  }, [])

  const updatePlaylist = useCallback(async (id: string, updates: Partial<PlaylistInsert>): Promise<void> => {
    const { error: err } = await supabase
      .from('playlists')
      .update(updates)
      .eq('id', id)

    if (err) throw new Error(err.message)
    setPlaylists((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    )
  }, [])

  const deletePlaylist = useCallback(async (id: string): Promise<void> => {
    const { error: err } = await supabase
      .from('playlists')
      .delete()
      .eq('id', id)

    if (err) throw new Error(err.message)
    setPlaylists((prev) => prev.filter((p) => p.id !== id))
  }, [])

  return { playlists, loading, error, createPlaylist, updatePlaylist, deletePlaylist, refresh: fetchPlaylists }
}

export function usePlaylist(playlistId: string | undefined) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const [songs, setSongs] = useState<PlaylistSong[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPlaylist = useCallback(async () => {
    if (!playlistId) {
      setPlaylist(null)
      setSongs([])
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

  /** Add a song at the next available position */
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

  /** Remove a song by playlist_song id */
  const removeSong = useCallback(async (playlistSongId: string): Promise<void> => {
    if (!playlistId) return

    const { error: err } = await supabase
      .from('playlist_songs')
      .delete()
      .eq('id', playlistSongId)

    if (err) throw new Error(err.message)
    await fetchPlaylist()
  }, [fetchPlaylist])

  /** Reorder songs by providing an array of playlist_song ids in the desired order */
  const reorderSongs = useCallback(async (orderedIds: string[]): Promise<void> => {
    if (!playlistId) return

    const updates = orderedIds.map((psId, index) =>
      supabase
        .from('playlist_songs')
        .update({ position: index })
        .eq('id', psId)
    )

    await Promise.all(updates)
    await fetchPlaylist()
  }, [fetchPlaylist])

  /** Set transpose semitones for a specific playlist song entry */
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
  }, [])

  return { playlist, songs, loading, error, addSong, removeSong, reorderSongs, setTranspose, refresh: fetchPlaylist }
}
