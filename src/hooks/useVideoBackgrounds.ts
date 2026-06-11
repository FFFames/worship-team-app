/** Hook for fetching and managing video backgrounds using Supabase */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { VideoBackground } from '../types/database'

export function useVideoBackgrounds() {
  const [backgrounds, setBackgrounds] = useState<VideoBackground[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBackgrounds = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: sbError } = await supabase
        .from('video_backgrounds')
        .select('*')
        .order('created_at', { ascending: true })

      if (sbError) throw sbError
      setBackgrounds(data as VideoBackground[])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch backgrounds'
      setError(message)
      console.error('Failed to fetch backgrounds:', err)
      setBackgrounds([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBackgrounds()
  }, [fetchBackgrounds])

  const addBackground = useCallback(async (name: string, url: string): Promise<void> => {
    const { error: sbError } = await supabase
      .from('video_backgrounds')
      .insert({ name, url, is_default: false })

    if (sbError) throw sbError
    await fetchBackgrounds()
  }, [fetchBackgrounds])

  const removeBackground = useCallback(async (id: string): Promise<void> => {
    const { error: sbError } = await supabase
      .from('video_backgrounds')
      .delete()
      .eq('id', id)

    if (sbError) throw sbError
    setBackgrounds((prev) => prev.filter(b => b.id !== id))
  }, [])

  return { backgrounds, loading, error, addBackground, removeBackground, refresh: fetchBackgrounds }
}
