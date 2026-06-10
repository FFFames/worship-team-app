/** TypeScript type definitions matching the Supabase database schema */

/** A single chord+lyric line pair */
export type SongLine = {
  chords: string;
  lyrics: string;
};

/** Section types for song structure */
export type SectionType =
  | 'verse'
  | 'pre_chorus'
  | 'chorus'
  | 'bridge'
  | 'intro'
  | 'outro'
  | 'interlude'
  | 'tag';

/** A parsed song section (verse, chorus, bridge, etc.) */
export type Section = {
  type: SectionType;
  marker: string;
  lines: SongLine[];
};

/** The full parsed content stored in content_parsed JSONB */
export type SongContent = {
  sections: Section[];
};

/** Maps section types to their display markers */
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

/** Human-readable section labels for UI display */
export const SECTION_LABELS: Record<SectionType, string> = {
  verse: 'Verse',
  pre_chorus: 'Pre-Chorus',
  chorus: 'Chorus',
  bridge: 'Bridge',
  intro: 'Intro',
  outro: 'Outro',
  interlude: 'Interlude',
  tag: 'Tag',
};

/** Song row from Supabase */
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

/** Data needed to insert a new song */
export type SongInsert = {
  title: string;
  artist?: string | null;
  original_key: string;
  content_raw: string;
  content_parsed: SongContent;
};

/** Playlist row from Supabase */
export type Playlist = {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Playlist insert data */
export type PlaylistInsert = {
  name: string;
  description?: string | null;
};

/** PlaylistSong join row from Supabase */
export type PlaylistSong = {
  id: string;
  playlist_id: string;
  song_id: string;
  position: number;
  transpose_semitones: number;
  song?: Song; // populated when joined
};

/** VideoBackground row from Supabase */
export type VideoBackground = {
  id: string;
  name: string;
  url: string;
  is_default: boolean;
  created_at: string;
};
