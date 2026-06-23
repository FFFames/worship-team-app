/** TypeScript types matching the actual Supabase database schema */

/** A single chord+lyric line pair (used by ChordDisplay) */
export type SongLine = {
  chords: string;
  lyrics: string;
};

/** Section types detected from chord chart headers */
export type SectionType =
  | 'verse'
  | 'prehook'
  | 'hook'
  | 'bridge'
  | 'intro'
  | 'outro'
  | 'instrumental'
  | 'tag';

/** A song section (verse, chorus, bridge, etc.) used by ChordDisplay */
export type Section = {
  type: SectionType;
  /** Human-readable section label, e.g. "Verse 1", "Hook", "Instrumental" */
  label: string;
  /** Legacy display marker kept for old saved songs while migrating away from *, **, *** */
  marker: string;
  lines: SongLine[];
};

/** The full parsed song content from parseChordLyrics() */
export type SongContent = {
  sections: Section[];
};

/** songs table row — matches actual Supabase schema */
export type Song = {
  id: string;
  title: string;
  artist: string | null;
  original_key: string;
  tempo: number | null;
  time_signature: string | null;
  raw_content: string;
  sections: Section[] | null;
  user_id: string | null;
  tags: string[] | null;
  favorite: boolean | null;
  created_at: string;
  updated_at: string;
};

/** Input type for creating/updating a song */
export type SongInsert = {
  title?: string;
  artist?: string | null;
  original_key?: string;
  tempo?: number | null;
  time_signature?: string | null;
  raw_content?: string;
  sections?: Section[] | null;
  tags?: string[] | null;
  favorite?: boolean | null;
};

/** playlists table row — matches actual Supabase schema */
export type Playlist = {
  id: string;
  name: string;
  date: string | null;
  notes: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Input type for creating a playlist */
export type PlaylistInsert = {
  name?: string;
  date?: string | null;
  notes?: string | null;
};

/** playlist_songs table row — matches actual Supabase schema (with optional joined song) */
export type PlaylistSong = {
  id: string;
  playlist_id: string;
  song_id: string;
  transpose: number;
  order: number;
  created_at: string;
  song?: Song;
};

/** video_backgrounds table row */
export type VideoBackground = {
  id: string;
  name: string;
  url: string;
  is_default: boolean;
  created_at: string;
};

/** Section type → default human-readable label mapping */
export const SECTION_LABELS: Record<SectionType, string> = {
  verse: '',
  prehook: 'Prehook',
  hook: 'Hook',
  bridge: 'Bridge',
  intro: 'Intro',
  outro: 'Outro',
  instrumental: 'Instrumental',
  tag: 'Tag',
};

/** Legacy section marker mapping for backwards-compatible rendering only */
export const LEGACY_SECTION_MARKERS: Record<SectionType, string> = {
  verse: '',
  prehook: '*',
  hook: '**',
  bridge: '***',
  intro: '[Intro]',
  outro: '[Outro]',
  instrumental: '[Interlude]',
  tag: '[Tag]',
};

/** All chromatic notes (sharp) */
export const CHROMATIC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** All chromatic notes (flat) */
export const CHROMATIC_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
