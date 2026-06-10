/** Hook for fetching and managing playlists */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Playlist, PlaylistInsert } from '../types/database'

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

  const updatePlaylist = useCallback(async (
    id: string,
    updates: Partial<Pick<Playlist, 'name' | 'description'>>
  ): Promise<void> => {
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
