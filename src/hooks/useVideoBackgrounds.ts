/** React hook for fetching video backgrounds from Supabase */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { VideoBackground } from '../types/database';

export function useVideoBackgrounds() {
  const [backgrounds, setBackgrounds] = useState<VideoBackground[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase
        .from('video_backgrounds')
        .select('*')
        .order('created_at', { ascending: true });

      if (!error && data) {
        setBackgrounds(data as VideoBackground[]);
      }
      setLoading(false);
    }
    fetch();
  }, []);

  const addBackground = useCallback(async (name: string, url: string): Promise<void> => {
    const { error } = await supabase
      .from('video_backgrounds')
      .insert({ name, url });

    if (error) throw new Error(error.message);
    // Refresh
    const { data } = await supabase.from('video_backgrounds').select('*').order('created_at', { ascending: true });
    if (data) setBackgrounds(data as VideoBackground[]);
  }, []);

  const removeBackground = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('video_backgrounds')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
    setBackgrounds((prev) => prev.filter((b) => b.id !== id));
  }, []);

  return { backgrounds, loading, addBackground, removeBackground };
}
