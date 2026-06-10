/** React hooks for Playlist CRUD and playlist_songs management via Supabase */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Playlist, PlaylistInsert, PlaylistSong } from '../types/database';

/** Hook for fetching and managing all playlists */
export function usePlaylists() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlaylists = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('playlists')
      .select('*')
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      setPlaylists(data as Playlist[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  const createPlaylist = useCallback(async (name: string, description?: string): Promise<Playlist> => {
    const insert: PlaylistInsert = { name, description: description || null };
    const { data, error: err } = await supabase
      .from('playlists')
      .insert(insert)
      .select()
      .single();

    if (err) throw new Error(err.message);
    const newPlaylist = data as Playlist;
    setPlaylists((prev) => [newPlaylist, ...prev]);
    return newPlaylist;
  }, []);

  const updatePlaylist = useCallback(async (id: string, updates: Partial<Playlist>): Promise<void> => {
    const { error: err } = await supabase
      .from('playlists')
      .update(updates)
      .eq('id', id);

    if (err) throw new Error(err.message);
    setPlaylists((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  }, []);

  const deletePlaylist = useCallback(async (id: string): Promise<void> => {
    const { error: err } = await supabase
      .from('playlists')
      .delete()
      .eq('id', id);

    if (err) throw new Error(err.message);
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { playlists, loading, error, createPlaylist, updatePlaylist, deletePlaylist, refresh: fetchPlaylists };
}

/** Hook for fetching a single playlist with its songs */
export function usePlaylist(playlistId: string | undefined) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<PlaylistSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlaylist = useCallback(async () => {
    if (!playlistId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    // Fetch playlist
    const { data: plData, error: plErr } = await supabase
      .from('playlists')
      .select('*')
      .eq('id', playlistId)
      .single();

    if (plErr) {
      setError(plErr.message);
      setLoading(false);
      return;
    }
    setPlaylist(plData as Playlist);

    // Fetch playlist songs joined with songs
    const { data: psData, error: psErr } = await supabase
      .from('playlist_songs')
      .select('*, song:songs(*)')
      .eq('playlist_id', playlistId)
      .order('position', { ascending: true });

    if (psErr) {
      setError(psErr.message);
    } else {
      setSongs(psData as PlaylistSong[]);
    }
    setLoading(false);
  }, [playlistId]);

  useEffect(() => {
    fetchPlaylist();
  }, [fetchPlaylist]);

  const addSong = useCallback(async (songId: string): Promise<void> => {
    if (!playlistId) return;

    // Get next position
    const nextPos = songs.length > 0 ? Math.max(...songs.map((s) => s.position)) + 1 : 0;

    const { error: err } = await supabase
      .from('playlist_songs')
      .insert({ playlist_id: playlistId, song_id: songId, position: nextPos });

    if (err) throw new Error(err.message);
    await fetchPlaylist(); // refresh
  }, [playlistId, songs, fetchPlaylist]);

  const removeSong = useCallback(async (songId: string): Promise<void> => {
    if (!playlistId) return;

    const { error: err } = await supabase
      .from('playlist_songs')
      .delete()
      .eq('playlist_id', playlistId)
      .eq('song_id', songId);

    if (err) throw new Error(err.message);
    await fetchPlaylist(); // refresh
  }, [playlistId, fetchPlaylist]);

  const reorderSongs = useCallback(async (orderedSongIds: string[]): Promise<void> => {
    if (!playlistId) return;

    // Batch update positions
    const updates = orderedSongIds.map((songId, index) =>
      supabase
        .from('playlist_songs')
        .update({ position: index })
        .eq('playlist_id', playlistId)
        .eq('song_id', songId)
    );

    await Promise.all(updates);
    await fetchPlaylist(); // refresh
  }, [playlistId, fetchPlaylist]);

  const setTranspose = useCallback(async (songId: string, semitones: number): Promise<void> => {
    if (!playlistId) return;

    const { error: err } = await supabase
      .from('playlist_songs')
      .update({ transpose_semitones: semitones })
      .eq('playlist_id', playlistId)
      .eq('song_id', songId);

    if (err) throw new Error(err.message);
    setSongs((prev) =>
      prev.map((ps) => (ps.song_id === songId ? { ...ps, transpose_semitones: semitones } : ps))
    );
  }, [playlistId]);

  return { playlist, songs, loading, error, addSong, removeSong, reorderSongs, setTranspose, refresh: fetchPlaylist };
}
