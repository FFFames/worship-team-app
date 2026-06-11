/** Hook for fetching and managing video backgrounds using localStorage */

import { useState, useEffect, useCallback } from 'react'
import type { VideoBackground } from '../types/database'
import { STORAGE_KEYS } from '../utils/seedData'

const STORAGE_KEY = STORAGE_KEYS.backgrounds

function getAllBackgrounds(): VideoBackground[] {
  const data = localStorage.getItem(STORAGE_KEY)
  return data ? JSON.parse(data) : []
}

function saveAllBackgrounds(backgrounds: VideoBackground[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(backgrounds))
}

export function useVideoBackgrounds() {
  const [backgrounds, setBackgrounds] = useState<VideoBackground[]>([])
  const [loading, setLoading] = useState(true)

  const fetchBackgrounds = useCallback(() => {
    try {
      setLoading(true)
      const all = getAllBackgrounds()
      setBackgrounds(all)
    } catch (err) {
      console.error('Failed to fetch backgrounds:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBackgrounds()
  }, [fetchBackgrounds])

  const addBackground = useCallback(async (name: string, url: string): Promise<void> => {
    const newBackground: VideoBackground = {
      id: crypto.randomUUID(),
      name,
      url,
      is_default: false,
      created_at: new Date().toISOString(),
    }

    const all = getAllBackgrounds()
    all.push(newBackground)
    saveAllBackgrounds(all)

    await fetchBackgrounds()
  }, [fetchBackgrounds])

  const removeBackground = useCallback(async (id: string): Promise<void> => {
    const all = getAllBackgrounds()
    const filtered = all.filter(b => b.id !== id)

    if (filtered.length === all.length) {
      throw new Error(`Background with id ${id} not found`)
    }

    saveAllBackgrounds(filtered)
    setBackgrounds(filtered)
  }, [])

  return { backgrounds, loading, addBackground, removeBackground }
}
