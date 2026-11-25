/** Hooks for fetching and managing songs using Supabase */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Song, SongInsert } from '../types/database'
import type { CollectionSong } from '../utils/songCollectionRules'
import { recordSongAddition } from '../utils/songHistoryLibrary'

type SongQueryOptions = { collectionDetails?: boolean; credits?: boolean; query?: string }

export function useSongs(enabled = true, searchScope: 'metadata' | 'lyrics' = 'metadata', options: SongQueryOptions = {}) {
  const { collectionDetails = false, credits = false, query } = options
  const [songs, setSongs] = useState<CollectionSong[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const requestedQuery = query ?? searchQuery

  const fetchSongs = useCallback(async (query: string, signal?: AbortSignal) => {
    try {
      setLoading(true)
      setError(null)

      const filter = query.trim().replace(/[\\%_*]/g, '\\$&')
      const quotedFilter = filter.replace(/"/g, '\\"')
      const results: CollectionSong[] = []
      let lastId: string | undefined

      // Imported libraries can be larger than the Data API's per-request row limit.
      while (!signal?.aborted) {
        const query = supabase.from('songs')
        const selection = collectionDetails
          ? query.select('id,title,artist,original_key,updated_at,copyright,copyright_administrator,ccli_number,sections,raw_content')
          : credits ? query.select('id,title,artist,original_key,updated_at,copyright,copyright_administrator,ccli_number')
            : query.select('id,title,artist,original_key,updated_at')
        let request = selection.order('id').limit(500)
        if (filter) {
          request = searchScope === 'lyrics'
            ? request.ilike('raw_content', `%${filter}%`)
            : request.or(`title.ilike."%${quotedFilter}%",artist.ilike."%${quotedFilter}%"`)
        }
        if (lastId) request = request.gt('id', lastId)
        if (signal) request = request.abortSignal(signal)

        const { data, error: sbError } = await request
        if (sbError) throw new Error(sbError.message)
        if (!data.length) break

        results.push(...data)
        lastId = data[data.length - 1].id
      }

      if (!signal?.aborted) setSongs(results.sort((a, b) => b.updated_at.localeCompare(a.updated_at)))
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : 'Failed to fetch songs')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [searchScope, collectionDetails, credits])

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    void fetchSongs(requestedQuery, controller.signal)
    return () => controller.abort()
  }, [enabled, requestedQuery, fetchSongs])

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
        ...(song.copyright !== undefined ? { copyright: song.copyright } : {}),
        ...(song.copyright_administrator !== undefined ? { copyright_administrator: song.copyright_administrator } : {}),
        ...(song.ccli_number !== undefined ? { ccli_number: song.ccli_number } : {}),
        ...(song.description !== undefined ? { description: song.description } : {}),
        ...(song.appearance !== undefined ? { appearance: song.appearance } : {}),
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
    void recordSongAddition(newSong).catch(() => {
      // The song was saved to the shared library even when browser storage is unavailable.
    })
    setSongs((prev) => [newSong, ...prev])
    return newSong
  }, [])

  const updateSong = useCallback(async (id: string, updates: Partial<SongInsert>): Promise<void> => {
    // Whitelist only fields that exist in the songs table
    const allowedFields: (keyof SongInsert)[] = [
      'title', 'artist', 'original_key', 'tempo', 'time_signature', 'youtube_url',
      'raw_content', 'sections', 'tags', 'favorite', 'copyright', 'copyright_administrator', 'ccli_number', 'description', 'appearance',
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
