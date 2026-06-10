/** Chord parser — converts raw pasted text into structured SongContent */

import type { SongContent, Section, SectionType, SongLine } from '../types/database';

/** Patterns for detecting section headers */
const SECTION_HEADER_REGEX = /^\s*\[?(Verse|Chorus|Pre[- ]?[Cc]horus|Pre[- ]?[Hh]ook|Hook|Bridge|Intro|Outro|Interlude|Tag)\s*(\d*)\s*\]?\s*:?\s*$/i;

/** Map various header names to canonical section types */
function normalizeSectionType(raw: string): SectionType {
  const lower = raw.toLowerCase().replace(/[-\s]/g, '');
  if (lower === 'verse') return 'verse';
  if (lower === 'prechorus' || lower === 'prehook') return 'pre_chorus';
  if (lower === 'chorus' || lower === 'hook') return 'chorus';
  if (lower === 'bridge') return 'bridge';
  if (lower === 'intro') return 'intro';
  if (lower === 'outro') return 'outro';
  if (lower === 'interlude') return 'interlude';
  if (lower === 'tag') return 'tag';
  return 'verse';
}

/** Chord pattern: starts with A-G, optionally # or b, then chord quality */
const CHORD_CHAR_REGEX = /^[A-G][#b]?(m|maj|min|dim|aug|sus|add|7|9|11|13|6|2|4|5|°|ø)?/;

/**
 * Check if a line is primarily chords (vs lyrics).
 * A line is a chord line if >60% of non-space tokens look like chords.
 */
function isChordLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 0) return false;

  let chordCount = 0;
  for (const token of tokens) {
    if (CHORD_CHAR_REGEX.test(token)) {
      chordCount++;
    }
  }

  return chordCount / tokens.length > 0.6;
}

/**
 * Check if a line is a section header
 */
function parseSectionHeader(line: string): { type: SectionType; number: string } | null {
  const match = line.match(SECTION_HEADER_REGEX);
  if (!match) return null;
  return { type: normalizeSectionType(match[1]), number: match[2] };
}

/**
 * Parse ChordPro format: [C]Amazing [G]grace [Am]how [F]sweet
 * Returns { chords: "C    G    Am   F", lyrics: "Amazing grace how sweet" }
 */
function parseChordProLine(line: string): SongLine {
  const chords: string[] = [];
  const lyrics: string[] = [];

  const regex = /\[([^\]]*)\]([^\[]*)/g;
  let lastEnd = 0;
  let match: RegExpExecArray | null;

  // Check if line has any chord brackets
  if (!line.includes('[')) {
    return { chords: '', lyrics: line };
  }

  while ((match = regex.exec(line)) !== null) {
    const chord = match[1];
    const text = match[2];

    // Pad to align chord with lyric position
    const padLength = Math.max(chord.length, text.length);
    chords.push(chord.padEnd(padLength));
    lyrics.push(text);

    lastEnd = match.index + match[0].length;
  }

  // Any remaining text after last chord
  const remaining = line.slice(lastEnd);
  if (remaining) {
    lyrics.push(remaining);
  }

  return { chords: chords.join(' '), lyrics: lyrics.join('') };
}

/**
 * Check if the input is in ChordPro format (has [Chord] brackets inline)
 */
function isChordProFormat(text: string): boolean {
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // If any non-header line has [Chord] syntax, it's ChordPro
    if (trimmed.includes('[') && !SECTION_HEADER_REGEX.test(trimmed)) {
      return true;
    }
  }
  return false;
}

/**
 * Parse raw pasted chord+lyrics text into structured SongContent.
 * Supports two formats:
 * 1. Two-line format: chord line above lyric line
 * 2. ChordPro format: [C]lyrics [G]more lyrics
 */
export function parseChordLyrics(rawText: string): SongContent {
  if (!rawText.trim()) {
    return { sections: [] };
  }

  // Detect ChordPro format
  if (isChordProFormat(rawText)) {
    return parseChordProFormat(rawText);
  }

  return parseTwoLineFormat(rawText);
}

/** Parse ChordPro format text */
function parseChordProFormat(rawText: string): SongContent {
  const lines = rawText.split('\n');
  const sections: Section[] = [];
  let currentSection: Section = { type: 'verse', marker: '', lines: [] };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check for section header
    const header = parseSectionHeader(trimmed);
    if (header) {
      if (currentSection.lines.length > 0) {
        sections.push(currentSection);
      }
      const type = header.type;
      currentSection = {
        type,
        marker: getMarker(type),
        lines: [],
      };
      continue;
    }

    // Parse ChordPro line
    const parsed = parseChordProLine(trimmed);
    currentSection.lines.push(parsed);
  }

  if (currentSection.lines.length > 0) {
    sections.push(currentSection);
  }

  return { sections };
}

/** Parse two-line format (chord line above lyric line) */
function parseTwoLineFormat(rawText: string): SongContent {
  const lines = rawText.split('\n');
  const sections: Section[] = [];
  let currentSection: Section = { type: 'verse', marker: '', lines: [] };

  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Skip empty lines (but they can separate sections)
    if (!trimmed) {
      i++;
      continue;
    }

    // Check for section header
    const header = parseSectionHeader(trimmed);
    if (header) {
      if (currentSection.lines.length > 0) {
        sections.push(currentSection);
      }
      const type = header.type;
      currentSection = {
        type,
        marker: getMarker(type),
        lines: [],
      };
      i++;
      continue;
    }

    // Check if this line is chords
    if (isChordLine(trimmed)) {
      const chordLine = trimmed;
      const nextLine = lines[i + 1]?.trim() || '';

      if (nextLine && !isChordLine(nextLine) && !parseSectionHeader(nextLine)) {
        // Pair: chord line + lyric line
        currentSection.lines.push({ chords: chordLine, lyrics: nextLine });
        i += 2;
      } else {
        // Chords only (no lyrics below)
        currentSection.lines.push({ chords: chordLine, lyrics: '' });
        i++;
      }
    } else {
      // Lyrics only (no chords above)
      currentSection.lines.push({ chords: '', lyrics: trimmed });
      i++;
    }
  }

  if (currentSection.lines.length > 0) {
    sections.push(currentSection);
  }

  return { sections };
}

/** Get the marker string for a section type */
function getMarker(type: SectionType): string {
  const markers: Record<SectionType, string> = {
    verse: '',
    pre_chorus: '*',
    chorus: '**',
    bridge: '***',
    intro: '[Intro]',
    outro: '[Outro]',
    interlude: '[Interlude]',
    tag: '[Tag]',
  };
  return markers[type];
}

/**
 * Auto-detect the song key from the first chord found in the content.
 * Returns empty string if no chords detected.
 */
export function detectKey(content: SongContent): string {
  for (const section of content.sections) {
    for (const line of section.lines) {
      if (line.chords.trim()) {
        const match = line.chords.trim().match(/^([A-G][#b]?)/);
        if (match) return match[1];
      }
    }
  }
  return '';
}
