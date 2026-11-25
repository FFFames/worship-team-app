/** TypeScript types matching the actual Supabase database schema */

import type { AppliedSlideTheme, DesignTextRun, SlideDesign, SlidePlaybackSettings, SlideTransition, SongAppearance, SongSlideLayout } from './slideDesign'
import type { MediaClip, MediaPlayback, VideoAlphaMode } from './media'
import type { FeedSound } from './liveFeed'
import type { ScriptureBookName, ScriptureSourceRange, ScriptureVerseStart } from './scripture'
import type { LyricLayout } from '../utils/slideBuilder'

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
  | 'end'
  | 'instrumental'
  | 'tag';

/** A song section (verse, chorus, bridge, etc.) used by ChordDisplay */
export type Section = {
  type: SectionType;
  /** Human-readable section label, e.g. "Verse 1", "Hook", "Instrumental" */
  label: string;
  /** Label from the slide editor, independent of the chart header. */
  slideLabel?: string;
  /** Legacy display marker kept for old saved songs while migrating away from *, **, *** */
  marker: string;
  lines: SongLine[];
  /** Character formatting for the section's lyric lines joined with newlines. */
  lyricRuns?: DesignTextRun[];
  /** Incoming effect for the section's slides. Null records an explicit choice to use the theme. */
  transition?: SlideTransition | null;
  playback?: SlidePlaybackSettings;
  /** Lyric cursor offsets for prepared slides. Null uses automatic reflow. */
  slideBreaks?: number[] | null;
  /** Layout overrides indexed by the start boundary of a prepared slide. */
  slideLayouts?: { start: number; layout: SongSlideLayout }[];
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
  youtube_url: string | null;
  copyright?: string | null;
  copyright_administrator?: string | null;
  ccli_number?: string | null;
  easyworship_uid?: string | null;
  easyworship_words_id?: string | null;
  easyworship_words_record_id?: string | null;
  easyworship_import_id?: string | null;
  description?: string | null;
  appearance?: SongAppearance | null;
  raw_content: string;
  sections: Section[] | null;
  user_id: string | null;
  tags: string[] | null;
  favorite: boolean | null;
  created_at: string;
  updated_at: string;
};

/** Fields needed for song library cards and the playlist song picker. */
export type SongListItem = Pick<Song, 'id' | 'title' | 'artist' | 'original_key' | 'updated_at'>;

/** Input type for creating/updating a song */
export type SongInsert = {
  title?: string;
  artist?: string | null;
  original_key?: string;
  tempo?: number | null;
  time_signature?: string | null;
  youtube_url?: string | null;
  copyright?: string | null;
  copyright_administrator?: string | null;
  ccli_number?: string | null;
  description?: string | null;
  appearance?: SongAppearance | null;
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

/** An attachment referenced by an imported schedule slide. */
export type PlaylistCueAsset = {
  kind: 'image' | 'video' | 'audio' | 'web' | 'camera' | 'powerpoint';
  filename: string;
  archivePath?: string;
  libraryId?: string;
  mediaCatalog?: import('./media').MediaCatalogReference;
  mediaImportId?: string;
  easyWorshipFileHash?: string;
  easyWorshipFileSize?: number;
  easyWorshipSourceLocationId?: string;
  role?: 'foreground' | 'background';
  repeat?: boolean;
  inheritedFromMaster?: true;
  url?: string;
  hideScrollbars?: boolean;
  dvd?: import('./dvdClip').DvdClip;
  deviceHints?: string[];
  audioDeviceHint?: string;
  feedId?: string;
  feedSound?: FeedSound;
  feedVideo?: import('./liveFeed').FeedVideo;
  crc32?: number;
  clip?: MediaClip;
  posterSeconds?: number;
  alphaMode?: VideoAlphaMode;
  playback?: MediaPlayback;
};

/** A schedule occurrence whose content is saved with the playlist. */
export type PlaylistCue = {
  kind: 'song' | 'scripture' | 'presentation' | 'image' | 'video' | 'audio' | 'web' | 'camera' | 'powerpoint' | 'unknown';
  label: string;
  slides: {
    label: string;
    speakerNotes?: string;
    /** Marks a locally chosen label, including reuse of a former import placeholder. */
    labelEdited?: true;
    /** Keeps a locally edited Scripture text box, including a deliberately empty slide. */
    textEdited?: true;
    lines: string[];
    chords?: string[];
    lyricRuns?: DesignTextRun[];
    slideLayout?: SongSlideLayout;
    sectionType?: SectionType;
    assets?: PlaylistCueAsset[];
    /** Keeps a deliberate removal of the previous soundtrack on repeat EasyWorship imports. */
    soundtrackEdited?: true;
    design?: SlideDesign;
    template?: string;
    transition?: SlideTransition;
    /** Preserves a local choice to inherit the theme when the effect is unset. */
    transitionEdited?: true;
    advanceMs?: number;
    playback?: SlidePlaybackSettings;
    sourceId?: string;
    sourceOrder?: number;
    scriptureRange?: ScriptureSourceRange;
    scriptureVerseStarts?: ScriptureVerseStart[];
    scriptureBookNames?: ScriptureBookName[];
  }[];
  looping?: boolean;
  /** Uses fit-to-frame rendering for passages paginated in the Scripture library. */
  scriptureFlow?: true;
  lyricLayout?: LyricLayout;
  slideLayout?: SongSlideLayout;
  /** Identifies the related library presentation while its slides stay in this schedule. */
  libraryDesignId?: string;
  assets?: PlaylistCueAsset[];
  sourceId?: string;
  sourceOrder?: number;
  metadata?: Record<string, string | number | boolean | null>;
  warnings?: string[];
};

/** An ordered playlist entry, containing either a linked song or a cue. */
export type PlaylistSong = {
  id: string;
  playlist_id: string;
  song_id: string | null;
  transpose: number;
  order: number;
  created_at: string;
  song?: Song | null;
  cue?: PlaylistCue | null;
  background_asset?: PlaylistCueAsset | null;
  slide_theme?: AppliedSlideTheme | null;
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
  end: 'End',
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
  end: '[End]',
  instrumental: '[Interlude]',
  tag: '[Tag]',
};

/** All chromatic notes (sharp) */
export const CHROMATIC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** All chromatic notes (flat) */
export const CHROMATIC_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
