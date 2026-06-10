/** Hook for fetching and managing a single song by id */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Song, UpdateSong } from '../types/database'

export function useSong(id: string | undefined) {
  const [song, setSong] = useState<Song | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchSong() {
      setLoading(true)
      setError(null)
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

  const updateSong = useCallback(async (updates: UpdateSong): Promise<void> => {
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
