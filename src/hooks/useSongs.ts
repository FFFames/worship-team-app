/** Hooks for fetching and managing songs using Supabase */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Song, SongInsert } from '../types/database'

export function useSongs() {
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')

  const fetchSongs = useCallback(async (query: string) => {
    try {
      setLoading(true)
      setError(null)

      let q = supabase
        .from('songs')
        .select('*')
        .order('updated_at', { ascending: false })

      if (query.trim()) {
        // Use ilike for search on title and artist
        q = q.or(`title.ilike.%${query}%,artist.ilike.%${query}%`)
      }

      const { data, error: sbError } = await q

      if (sbError) throw sbError
      setSongs(data as Song[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch songs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSongs(searchQuery)
  }, [searchQuery, fetchSongs])

  const search = useCallback((query: string) => {
    setSearchQuery(query)
  }, [])

  const addSong = useCallback(async (song: SongInsert): Promise<Song> => {
    const { data, error: sbError } = await supabase
      .from('songs')
      .insert({
        title: song.title,
        artist: song.artist ?? null,
        original_key: song.original_key,
        tempo: song.tempo ?? 120,
        time_signature: song.time_signature ?? '4/4',
        youtube_url: song.youtube_url ?? null,
        raw_content: song.raw_content,
        sections: song.sections ?? null,
        tags: song.tags ?? [],
        favorite: song.favorite ?? false,
        user_id: 'default',
      })
      .select()
      .single()

    if (sbError) throw sbError

    const newSong = data as Song
    setSongs((prev) => [newSong, ...prev])
    return newSong
  }, [])

  const updateSong = useCallback(async (id: string, updates: Partial<SongInsert>): Promise<void> => {
    // Whitelist only fields that exist in the songs table
    const allowedFields: (keyof SongInsert)[] = [
      'title', 'artist', 'original_key', 'tempo', 'time_signature', 'youtube_url',
      'raw_content', 'sections', 'tags', 'favorite',
    ]
    const safeUpdates: Record<string, unknown> = {}
    for (const key of allowedFields) {
      if (key in updates) {
        safeUpdates[key] = updates[key]
      }
    }

    const { error: sbError } = await supabase
      .from('songs')
      .update(safeUpdates)
      .eq('id', id)

    if (sbError) throw sbError

    setSongs((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...safeUpdates, updated_at: new Date().toISOString() } : s))
    )
  }, [])

  const deleteSong = useCallback(async (id: string): Promise<void> => {
    const { error: sbError } = await supabase
      .from('songs')
      .delete()
      .eq('id', id)

    if (sbError) throw sbError
    setSongs((prev) => prev.filter((s) => s.id !== id))
  }, [])

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

    const fetchSong = async () => {
      try {
        setLoading(true)
        setError(null)

        const { data, error: sbError } = await supabase
          .from('songs')
          .select('*')
          .eq('id', id)
          .single()

        if (sbError) throw sbError
        setSong(data as Song)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch song')
      } finally {
        setLoading(false)
      }
    }

    fetchSong()
  }, [id])

  const updateSong = useCallback(async (updates: Partial<SongInsert>): Promise<void> => {
    if (!id) return

    const { error: sbError } = await supabase
      .from('songs')
      .update(updates)
      .eq('id', id)

    if (sbError) throw sbError
    setSong((prev) => (prev ? { ...prev, ...updates, updated_at: new Date().toISOString() } : prev))
  }, [id])

  const deleteSong = useCallback(async (): Promise<void> => {
    if (!id) return

    const { error: sbError } = await supabase
      .from('songs')
      .delete()
      .eq('id', id)

    if (sbError) throw sbError
    setSong(null)
  }, [id])

  return { song, loading, error, updateSong, deleteSong }
}
