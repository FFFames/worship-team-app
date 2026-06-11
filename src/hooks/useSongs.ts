/** Hooks for fetching and managing songs using localStorage */

import { useState, useEffect, useCallback } from 'react'
import type { Song, SongInsert } from '../types/database'
import { seedDataIfEmpty, STORAGE_KEYS } from '../utils/seedData'

const STORAGE_KEY = STORAGE_KEYS.songs

// Seed data on module load
if (typeof window !== 'undefined') {
  seedDataIfEmpty()
}

function getAllSongs(): Song[] {
  const data = localStorage.getItem(STORAGE_KEY)
  return data ? JSON.parse(data) : []
}

function saveAllSongs(songs: Song[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(songs))
}

function filterSongs(songs: Song[], query: string): Song[] {
  if (!query.trim()) return songs
  const lowerQuery = query.toLowerCase()
  return songs.filter(s =>
    s.title.toLowerCase().includes(lowerQuery) ||
    (s.artist && s.artist.toLowerCase().includes(lowerQuery))
  )
}

export function useSongs() {
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')

  const fetchSongs = useCallback((query: string) => {
    try {
      setLoading(true)
      setError(null)
      const allSongs = getAllSongs()
      const filtered = filterSongs(allSongs, query)
      setSongs(filtered)
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
    const newSong: Song = {
      id: crypto.randomUUID(),
      title: song.title,
      artist: song.artist ?? null,
      original_key: song.original_key,
      content_raw: song.content_raw,
      content_parsed: song.content_parsed,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const allSongs = getAllSongs()
    allSongs.unshift(newSong)
    saveAllSongs(allSongs)

    setSongs((prev) => [newSong, ...prev])
    return newSong
  }, [])

  const updateSong = useCallback(async (id: string, updates: Partial<SongInsert>): Promise<void> => {
    const allSongs = getAllSongs()
    const index = allSongs.findIndex(s => s.id === id)

    if (index === -1) {
      throw new Error(`Song with id ${id} not found`)
    }

    allSongs[index] = {
      ...allSongs[index],
      ...updates,
      updated_at: new Date().toISOString(),
    }

    saveAllSongs(allSongs)
    setSongs((prev) =>
      prev.map((s) => (s.id === id ? allSongs[index] : s))
    )
  }, [])

  const deleteSong = useCallback(async (id: string): Promise<void> => {
    const allSongs = getAllSongs()
    const filtered = allSongs.filter(s => s.id !== id)

    if (filtered.length === allSongs.length) {
      throw new Error(`Song with id ${id} not found`)
    }

    saveAllSongs(filtered)
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

    try {
      setLoading(true)
      setError(null)

      const allSongs = getAllSongs()
      const found = allSongs.find(s => s.id === id)

      if (found) {
        setSong(found)
      } else {
        setError('Song not found')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch song')
    } finally {
      setLoading(false)
    }
  }, [id])

  const updateSong = useCallback(async (updates: Partial<SongInsert>): Promise<void> => {
    if (!id) return

    const allSongs = getAllSongs()
    const index = allSongs.findIndex(s => s.id === id)

    if (index === -1) {
      throw new Error(`Song with id ${id} not found`)
    }

    allSongs[index] = {
      ...allSongs[index],
      ...updates,
      updated_at: new Date().toISOString(),
    }

    saveAllSongs(allSongs)
    setSong((prev) => (prev ? { ...prev, ...updates, updated_at: allSongs[index].updated_at } : prev))
  }, [id])

  const deleteSong = useCallback(async (): Promise<void> => {
    if (!id) return

    const allSongs = getAllSongs()
    const filtered = allSongs.filter(s => s.id !== id)

    if (filtered.length === allSongs.length) {
      throw new Error(`Song with id ${id} not found`)
    }

    saveAllSongs(filtered)
    setSong(null)
  }, [id])

  return { song, loading, error, updateSong, deleteSong }
}
