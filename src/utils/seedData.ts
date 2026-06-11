/**
 * Seed sample songs and playlists for first-time users
 * @deprecated No longer used — data now comes from Supabase.
 * Kept for reference only.
 */

export const STORAGE_KEYS = {
  songs: 'worshipteam_songs',
  playlists: 'worshipteam_playlists',
  playlistSongs: 'worshipteam_playlist_songs',
  backgrounds: 'worshipteam_backgrounds',
}

/** Check if data exists, seed if empty — DEPRECATED, use Supabase instead */
export function seedDataIfEmpty() {
  // No-op — Supabase is the data source now
}
