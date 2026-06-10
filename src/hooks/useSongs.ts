/** Hooks for fetching and managing songs — useSongs for the library, useSong for a single song */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Song, SongInsert } from '../types/database'

export function useSongs() {
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')

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

  /** Filter songs by title or artist via Supabase ilike */
  const search = useCallback((query: string) => {
    setSearchQuery(query)
  }, [])

  const addSong = useCallback(async (song: SongInsert): Promise<Song> => {
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

  const updateSong = useCallback(async (id: string, updates: Partial<SongInsert>): Promise<void> => {
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

  /** Re-fetch from Supabase */
  const refresh = useCallback(() => {
    fetchSongs(searchQuery)
  }, [fetchSongs, searchQuery])

  return {
    songs, loading, error,
    search, searchQuery, setSearchQuery,
    addSong, updateSong, deleteSong, refresh,
  }
}

export function useSong(id: string | undefined) {
  const [song, setSong] = useState<Song | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setSong(null)
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchSong() {
      setLoading(true)
      const { data, error: err } = await supabase
        .from('songs')
        .select('*')
        .eq('id', id)
        .single()

      if (cancelled) return
      if (err) {
        setError(err.message)
      } else {
        setSong(data as Song)
      }
      setLoading(false)
    }

    fetchSong()
    return () => { cancelled = true }
  }, [id])

  const updateSong = useCallback(async (updates: Partial<SongInsert>): Promise<void> => {
    if (!id) return
    const { error: err } = await supabase
      .from('songs')
      .update(updates)
      .eq('id', id)

    if (err) throw new Error(err.message)
    setSong((prev) => (prev ? { ...prev, ...updates } : prev))
  }, [id])

  const deleteSong = useCallback(async (): Promise<void> => {
    if (!id) return
    const { error: err } = await supabase
      .from('songs')
      .delete()
      .eq('id', id)

    if (err) throw new Error(err.message)
    setSong(null)
  }, [id])

  return { song, loading, error, updateSong, deleteSong }
}
