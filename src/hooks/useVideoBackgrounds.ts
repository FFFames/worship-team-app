/** Hook for fetching and managing video backgrounds */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { VideoBackground } from '../types/database'

export function useVideoBackgrounds() {
  const [backgrounds, setBackgrounds] = useState<VideoBackground[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBackgrounds = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('video_backgrounds')
      .select('*')
      .order('created_at', { ascending: true })

    if (err) {
      setError(err.message)
    } else {
      setBackgrounds(data as VideoBackground[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchBackgrounds()
  }, [fetchBackgrounds])

  const addBackground = useCallback(async (name: string, url: string): Promise<void> => {
    const { error: err } = await supabase
      .from('video_backgrounds')
      .insert({ name, url })

    if (err) throw new Error(err.message)
    await fetchBackgrounds()
  }, [fetchBackgrounds])

  const removeBackground = useCallback(async (id: string): Promise<void> => {
    const { error: err } = await supabase
      .from('video_backgrounds')
      .delete()
      .eq('id', id)

    if (err) throw new Error(err.message)
    setBackgrounds((prev) => prev.filter((b) => b.id !== id))
  }, [])

  return { backgrounds, loading, error, addBackground, removeBackground, refresh: fetchBackgrounds }
}
