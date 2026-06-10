/** React hooks for Song CRUD operations via Supabase */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Song, SongInsert } from '../types/database';

/** Hook for fetching and managing all songs */
export function useSongs() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSongs = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('songs')
      .select('*')
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      setSongs(data as Song[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSongs();
  }, [fetchSongs]);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      fetchSongs();
      return;
    }
    setLoading(true);
    const { data, error: err } = await supabase
      .from('songs')
      .select('*')
      .or(`title.ilike.%${query}%,artist.ilike.%${query}%`)
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      setSongs(data as Song[]);
    }
    setLoading(false);
  }, [fetchSongs]);

  const addSong = useCallback(async (song: SongInsert): Promise<Song> => {
    const { data, error: err } = await supabase
      .from('songs')
      .insert(song)
      .select()
      .single();

    if (err) throw new Error(err.message);
    const newSong = data as Song;
    setSongs((prev) => [newSong, ...prev]);
    return newSong;
  }, []);

  const updateSong = useCallback(async (id: string, updates: Partial<Song>): Promise<void> => {
    const { error: err } = await supabase
      .from('songs')
      .update(updates)
      .eq('id', id);

    if (err) throw new Error(err.message);
    setSongs((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }, []);

  const deleteSong = useCallback(async (id: string): Promise<void> => {
    const { error: err } = await supabase
      .from('songs')
      .delete()
      .eq('id', id);

    if (err) throw new Error(err.message);
    setSongs((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { songs, loading, error, search, addSong, updateSong, deleteSong, refresh: fetchSongs };
}

/** Hook for fetching a single song */
export function useSong(id: string | undefined) {
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    async function fetchSong() {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('songs')
        .select('*')
        .eq('id', id)
        .single();

      if (err) {
        setError(err.message);
      } else {
        setSong(data as Song);
      }
      setLoading(false);
    }

    fetchSong();
  }, [id]);

  const updateSong = useCallback(async (updates: Partial<Song>): Promise<void> => {
    if (!id) return;
    const { error: err } = await supabase
      .from('songs')
      .update(updates)
      .eq('id', id);

    if (err) throw new Error(err.message);
    setSong((prev) => (prev ? { ...prev, ...updates } : prev));
  }, [id]);

  const deleteSong = useCallback(async (): Promise<void> => {
    if (!id) return;
    const { error: err } = await supabase
      .from('songs')
      .delete()
      .eq('id', id);

    if (err) throw new Error(err.message);
    setSong(null);
  }, [id]);

  return { song, loading, error, updateSong, deleteSong };
}
