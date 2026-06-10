/** Hook for fetching and managing the song library with search */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Song, InsertSong, UpdateSong } from '../types/database'

export function useSongs() {
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchSongs = useCallback(async (query: string) => {
    setLoading(true)
    setError(null)

    let qb = supabase
      .from('songs')
      .select('*')
      .order('created_at', { ascending: false })

    if (query.trim()) {
      qb = qb.or(`title.ilike.%${query}%,artist.ilike.%${query}%`)
    }

    const { data, error: err } = await qb

    if (err) {
      setError(err.message)
    } else {
      setSongs(data as Song[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSongs(searchQuery)
  }, [searchQuery, fetchSongs])

  const addSong = useCallback(async (song: InsertSong): Promise<Song> => {
    const { data, error: err } = await supabase
      .from('songs')
      .insert(song)
      .select()
      .single()

    if (err) throw new Error(err.message)
    const newSong = data as Song
    setSongs((prev) => [newSong, ...prev])
    return newSong
  }, [])

  const updateSong = useCallback(async (id: string, updates: UpdateSong): Promise<void> => {
    const { error: err } = await supabase
      .from('songs')
      .update(updates)
      .eq('id', id)

    if (err) throw new Error(err.message)
    setSongs((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    )
  }, [])

  const deleteSong = useCallback(async (id: string): Promise<void> => {
    const { error: err } = await supabase
      .from('songs')
      .delete()
      .eq('id', id)

    if (err) throw new Error(err.message)
    setSongs((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const refresh = useCallback(() => {
    fetchSongs(searchQuery)
  }, [fetchSongs, searchQuery])

  return { songs, loading, error, searchQuery, setSearchQuery, addSong, updateSong, deleteSong, refresh }
}
