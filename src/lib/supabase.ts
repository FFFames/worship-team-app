/** Supabase client no-op — localStorage is used instead of Supabase */

/**
 * This file is kept for compatibility but does nothing.
 * The app now uses localStorage for all data persistence via hooks in src/hooks/
 *
 * - useSongs: stores songs in 'worshipteam_songs'
 * - usePlaylists: stores playlists in 'worshipteam_playlists'
 * - useVideoBackgrounds: stores backgrounds in 'worshipteam_backgrounds'
 */

export const supabase = null as any
