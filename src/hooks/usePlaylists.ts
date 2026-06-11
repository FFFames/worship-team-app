/** Hooks for fetching and managing playlists and their songs using localStorage */

import { useState, useEffect, useCallback } from 'react'
import type { Playlist, PlaylistInsert, PlaylistSong, Song } from '../types/database'
import { STORAGE_KEYS } from '../utils/seedData'

const PLAYLISTS_KEY = STORAGE_KEYS.playlists
const PLAYLIST_SONGS_KEY = STORAGE_KEYS.playlistSongs
const SONGS_KEY = STORAGE_KEYS.songs

function getAllPlaylists(): Playlist[] {
  const data = localStorage.getItem(PLAYLISTS_KEY)
  return data ? JSON.parse(data) : []
}

function saveAllPlaylists(playlists: Playlist[]) {
  localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists))
}

function getAllPlaylistSongs(): PlaylistSong[] {
  const data = localStorage.getItem(PLAYLIST_SONGS_KEY)
  return data ? JSON.parse(data) : []
}

function saveAllPlaylistSongs(playlistSongs: PlaylistSong[]) {
  localStorage.setItem(PLAYLIST_SONGS_KEY, JSON.stringify(playlistSongs))
}

function getAllSongs(): Song[] {
  const data = localStorage.getItem(SONGS_KEY)
  return data ? JSON.parse(data) : []
}

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPlaylists = useCallback(() => {
    try {
      setLoading(true)
      setError(null)
      const all = getAllPlaylists()
      setPlaylists(all)
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
    const newPlaylist: Playlist = {
      id: crypto.randomUUID(),
      name,
      description: description ?? null,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const all = getAllPlaylists()
    all.unshift(newPlaylist)
    saveAllPlaylists(all)

    setPlaylists((prev) => [newPlaylist, ...prev])
    return newPlaylist
  }, [])

  const updatePlaylist = useCallback(async (id: string, updates: Partial<PlaylistInsert>): Promise<void> => {
    const all = getAllPlaylists()
    const index = all.findIndex(p => p.id === id)

    if (index === -1) {
      throw new Error(`Playlist with id ${id} not found`)
    }

    all[index] = {
      ...all[index],
      ...updates,
      updated_at: new Date().toISOString(),
    }

    saveAllPlaylists(all)
    setPlaylists((prev) =>
      prev.map((p) => (p.id === id ? all[index] : p))
    )
  }, [])

  const deletePlaylist = useCallback(async (id: string): Promise<void> => {
    // Delete playlist
    const allPlaylists = getAllPlaylists()
    const filtered = allPlaylists.filter(p => p.id !== id)

    if (filtered.length === allPlaylists.length) {
      throw new Error(`Playlist with id ${id} not found`)
    }

    saveAllPlaylists(filtered)

    // Delete associated playlist_songs
    const allPlaylistSongs = getAllPlaylistSongs()
    const filteredSongs = allPlaylistSongs.filter(ps => ps.playlist_id !== id)
    saveAllPlaylistSongs(filteredSongs)

    setPlaylists((prev) => prev.filter((p) => p.id !== id))
  }, [])

  return { playlists, loading, error, createPlaylist, updatePlaylist, deletePlaylist, refresh: fetchPlaylists }
}

export function usePlaylist(playlistId: string | undefined) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const [songs, setSongs] = useState<PlaylistSong[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPlaylist = useCallback(() => {
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
      const allPlaylists = getAllPlaylists()
      const found = allPlaylists.find(p => p.id === playlistId)

      if (!found) {
        setError('Playlist not found')
        setLoading(false)
        return
      }

      setPlaylist(found)

      // Fetch playlist songs joined with song details, ordered by position
      const allPlaylistSongs = getAllPlaylistSongs()
      const allSongs = getAllSongs()

      const playlistSongs = allPlaylistSongs
        .filter(ps => ps.playlist_id === playlistId)
        .sort((a, b) => a.position - b.position)
        .map(ps => ({
          ...ps,
          song: allSongs.find(s => s.id === ps.song_id),
        }))

      setSongs(playlistSongs)
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

    const allPlaylistSongs = getAllPlaylistSongs()

    const nextPos = songs.length > 0
      ? Math.max(...songs.map((s) => s.position)) + 1
      : 0

    const newPlaylistSong: PlaylistSong = {
      id: crypto.randomUUID(),
      playlist_id: playlistId,
      song_id: songId,
      position: nextPos,
      transpose_semitones: 0,
    }

    allPlaylistSongs.push(newPlaylistSong)
    saveAllPlaylistSongs(allPlaylistSongs)

    await fetchPlaylist()
  }, [playlistId, songs, fetchPlaylist])

  const removeSong = useCallback(async (playlistSongId: string): Promise<void> => {
    if (!playlistId) return

    const allPlaylistSongs = getAllPlaylistSongs()
    const filtered = allPlaylistSongs.filter(ps => ps.id !== playlistSongId)

    if (filtered.length === allPlaylistSongs.length) {
      throw new Error(`Playlist song with id ${playlistSongId} not found`)
    }

    saveAllPlaylistSongs(filtered)
    await fetchPlaylist()
  }, [fetchPlaylist])

  const reorderSongs = useCallback(async (orderedIds: string[]): Promise<void> => {
    if (!playlistId) return

    const allPlaylistSongs = getAllPlaylistSongs()

    // Update positions for each playlist song
    orderedIds.forEach((psId, index) => {
      const psIndex = allPlaylistSongs.findIndex(ps => ps.id === psId)
      if (psIndex !== -1) {
        allPlaylistSongs[psIndex].position = index
      }
    })

    saveAllPlaylistSongs(allPlaylistSongs)
    await fetchPlaylist()
  }, [fetchPlaylist])

  const setTranspose = useCallback(async (playlistSongId: string, semitones: number): Promise<void> => {
    if (!playlistId) return

    const allPlaylistSongs = getAllPlaylistSongs()
    const index = allPlaylistSongs.findIndex(ps => ps.id === playlistSongId)

    if (index === -1) {
      throw new Error(`Playlist song with id ${playlistSongId} not found`)
    }

    allPlaylistSongs[index].transpose_semitones = semitones
    saveAllPlaylistSongs(allPlaylistSongs)

    setSongs((prev) =>
      prev.map((ps) =>
        ps.id === playlistSongId ? { ...ps, transpose_semitones: semitones } : ps
      )
    )
  }, [])

  return { playlist, songs, loading, error, addSong, removeSong, reorderSongs, setTranspose, refresh: fetchPlaylist }
}
