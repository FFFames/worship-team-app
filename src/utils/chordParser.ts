/**
 * chordParser.ts — Parses raw chord chart text into structured SongContent.
 * Detects section headers, chord lines, and pairs chords with lyrics.
 */

import {
  type SongContent,
  type Section,
  type SectionType,
  SECTION_MARKERS,
} from '../types/database';

/** Regex matching a section header like [Verse 1], [Chorus], Chorus:, etc. */
const SECTION_HEADER_REGEX =
  /^\s*\[(Verse|Chorus|Pre-Chorus|Bridge|Hook|Intro|Outro|Interlude|Tag)\s*(\d*)\s*\]|^\s*(Verse|Chorus|Pre-Chorus|Bridge|Hook|Intro|Outro|Interlude|Tag)\s*(\d*)\s*:/i;

/** Regex matching a chord line — first non-space token starts with a chord root */
const CHORD_LINE_REGEX =
  /^[A-G][#b]?(m|maj|min|dim|aug|sus|add|7|9|11|13)*/;

/**
 * Map raw header text to canonical SectionType.
 * Hook → chorus, Pre-Chorus → pre_chorus
 */
function mapSectionType(raw: string): SectionType {
  const normalized = raw.toLowerCase().replace(/[-\s]/g, '_');
  switch (normalized) {
    case 'hook':
      return 'chorus';
    case 'pre_chorus':
    case 'prechorus':
      return 'pre_chorus';
    case 'verse':
      return 'verse';
    case 'chorus':
      return 'chorus';
    case 'bridge':
      return 'bridge';
    case 'intro':
      return 'intro';
    case 'outro':
      return 'outro';
    case 'interlude':
      return 'interlude';
    case 'tag':
      return 'tag';
    default:
      return 'verse';
  }
}

/** Returns true if the line looks like it contains chords rather than lyrics */
function isChordLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '') return false;
  const tokens = trimmed.split(/\s+/);
  return tokens.every((token) => CHORD_LINE_REGEX.test(token));
}

/**
 * Parse raw chord chart text into a structured SongContent object.
 *
 * - Splits input by newlines
 * - Detects section headers (e.g. [Verse 1], Chorus:)
 * - Identifies chord lines and pairs them with the following lyric line
 * - Lines before any section header are treated as a verse
 */
export function parseChordLyrics(rawText: string): SongContent {
  const lines = rawText.split('\n');
  const sections: Section[] = [];

  let currentSection: Section = {
    type: 'verse',
    marker: SECTION_MARKERS.verse,
    lines: [],
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Check for section header
    const headerMatch = line.match(SECTION_HEADER_REGEX);
    if (headerMatch) {
      // Save previous section if it has content
      if (currentSection.lines.length > 0) {
        sections.push(currentSection);
      }

      const rawType =
        headerMatch[1] || headerMatch[3] || 'Verse';
      const sectionType = mapSectionType(rawType);

      currentSection = {
        type: sectionType,
        marker: SECTION_MARKERS[sectionType],
        lines: [],
      };
      i++;
      continue;
    }

    // Check if this line is a chord line
    if (isChordLine(line)) {
      const chords = line.trim();
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';

      // The next line is lyrics only if it's not a chord line or section header
      let lyrics = '';
      if (
        nextLine.trim() !== '' &&
        !isChordLine(nextLine) &&
        !nextLine.match(SECTION_HEADER_REGEX)
      ) {
        lyrics = nextLine.trim();
        i += 2; // skip both chord and lyric lines
      } else {
        // Chords with no following lyrics
        lyrics = '';
        i += 1;
      }

      currentSection.lines.push({ chords, lyrics });
      continue;
    }

    // Non-chord, non-header, non-empty line → lyrics only (no chords)
    const trimmed = line.trim();
    if (trimmed !== '' && !line.match(SECTION_HEADER_REGEX)) {
      currentSection.lines.push({ chords: '', lyrics: trimmed });
    }

    i++;
  }

  // Push the last section
  if (currentSection.lines.length > 0) {
    sections.push(currentSection);
  }

  return { sections };
}

/**
 * Detect the musical key by finding the first chord in the sections
 * and returning its root note (e.g. "C", "G#", "Bb").
 */
export function detectKey(sections: Section[]): string {
  for (const section of sections) {
    for (const line of section.lines) {
      if (line.chords.trim() !== '') {
        const firstToken = line.chords.trim().split(/\s+/)[0];
        const rootMatch = firstToken.match(/^([A-G][#b]?)/);
        if (rootMatch) {
          return rootMatch[1];
        }
      }
    }
  }
  return 'C'; // default fallback
}
