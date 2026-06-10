/** TypeScript types matching the Supabase database schema */

/** A single chord+lyric line pair */
export type SongLine = {
  chords: string;
  lyrics: string;
};

/** Section types detected from chord chart headers */
export type SectionType =
  | 'verse'
  | 'pre_chorus'
  | 'chorus'
  | 'bridge'
  | 'intro'
  | 'outro'
  | 'interlude'
  | 'tag';

/** A song section (verse, chorus, bridge, etc.) */
export type Section = {
  type: SectionType;
  marker: string;
  lines: SongLine[];
};

/** The full parsed song content stored in content_parsed JSONB */
export type SongContent = {
  sections: Section[];
};

/** songs table row */
export type Song = {
  id: string;
  title: string;
  artist: string | null;
  original_key: string;
  content_raw: string;
  content_parsed: SongContent;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Input type for creating/updating a song */
export type SongInsert = {
  title: string;
  artist?: string | null;
  original_key: string;
  content_raw: string;
  content_parsed: SongContent;
};

/** playlists table row */
export type Playlist = {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Input type for creating a playlist */
export type PlaylistInsert = {
  name: string;
  description?: string | null;
};

/** playlist_songs table row (with optional joined song) */
export type PlaylistSong = {
  id: string;
  playlist_id: string;
  song_id: string;
  position: number;
  transpose_semitones: number;
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

/** Section type → marker mapping */
export const SECTION_MARKERS: Record<SectionType, string> = {
  verse: '',
  pre_chorus: '*',
  chorus: '**',
  bridge: '***',
  intro: '[Intro]',
  outro: '[Outro]',
  interlude: '[Interlude]',
  tag: '[Tag]',
};

/** All chromatic notes (sharp) */
export const CHROMATIC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** All chromatic notes (flat) */
export const CHROMATIC_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
