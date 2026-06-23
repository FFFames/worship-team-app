/**
 * chordParser.ts — Parses raw chord chart text into structured SongContent.
 * Detects section headers, chord lines, and pairs chords with lyrics.
 */

import {
  type SongContent,
  type Section,
  type SectionType,
  SECTION_LABELS,
} from '../types/database';

type SectionHeader = {
  type: SectionType;
  label: string;
};

type InlineSectionMarker = {
  section: SectionHeader;
  lyrics: string;
};

/** Regex matching a section header like Verse 1:, Prehook, [Hook], etc. */
const SECTION_HEADER_REGEX =
  /^\s*(?:\[(Verse|Verse\s+\d+|Pre[-\s]?Chorus|Prehook|Pre\s+Hook|Chorus|Hook|Bridge|Intro|Outro|Ending|Interlude|Instrumental|Solo|Tag)\s*:?\s*\]|(Verse|Verse\s+\d+|Pre[-\s]?Chorus|Prehook|Pre\s+Hook|Chorus|Hook|Bridge|Intro|Outro|Ending|Interlude|Instrumental|Solo|Tag)\s*:?)\s*$/i;

/**
 * Comprehensive chord token regex — matches a COMPLETE chord token.
 *
 * Root:   A-G with optional #/b
 * Body:   maj, min, m, M, dim, aug, sus, add, and any tension/alteration digits
 *         (e.g. 7, 9, 11, 13, b5, #11, m7b5, maj7#11, sus4, add9, 7sus4)
 * Slash:  /BassNote (e.g. G/B, Cmaj7/G)
 */
const CHORD_LINE_REGEX =
  /^[A-G][#b]?(?:maj|min|m|M|dim|aug|sus|add|#?b?\d+)*(?:\/[A-G][#b]?)?$/;

/**
 * Map raw header text to canonical section data while preserving section numbers.
 */
function mapSectionHeader(raw: string): SectionHeader {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  const normalized = cleaned.toLowerCase().replace(/[-\s]/g, '');
  const verseMatch = cleaned.match(/^verse\s*(\d+)?$/i);

  if (verseMatch) {
    const number = verseMatch[1]?.trim();
    return {
      type: 'verse',
      label: number ? `Verse ${number}` : 'Verse',
    };
  }

  switch (normalized) {
    case 'prehook':
    case 'prechorus':
      return { type: 'prehook', label: 'Prehook' };
    case 'chorus':
    case 'hook':
      return { type: 'hook', label: 'Hook' };
    case 'bridge':
      return { type: 'bridge', label: 'Bridge' };
    case 'intro':
      return { type: 'intro', label: 'Intro' };
    case 'outro':
    case 'ending':
      return { type: 'outro', label: 'Outro' };
    case 'interlude':
    case 'instrumental':
    case 'solo':
      return { type: 'instrumental', label: 'Instrumental' };
    case 'tag':
      return { type: 'tag', label: 'Tag' };
    default:
      return { type: 'verse', label: SECTION_LABELS.verse };
  }
}

function createSection(sectionHeader: SectionHeader): Section {
  return {
    type: sectionHeader.type,
    label: sectionHeader.label,
    marker: sectionHeader.label,
    lines: [],
  };
}

function getInlineSectionMarker(line: string): InlineSectionMarker | null {
  const trimmed = line.trim();
  const verseMatch = trimmed.match(/^(\d+)[.:]\s*(.+)$/);
  if (verseMatch) {
    return {
      section: { type: 'verse', label: `Verse ${verseMatch[1]}` },
      lyrics: verseMatch[2].trim(),
    };
  }

  const hookMatch = trimmed.match(/^\*\s*(.+)$/);
  if (hookMatch) {
    return {
      section: { type: 'hook', label: 'Hook' },
      lyrics: hookMatch[1].trim(),
    };
  }

  return null;
}

/** Resolve the display text for old and new section shapes. */
export function getSectionDisplayLabel(section: Section): string {
  if (section.label?.trim().length > 0) return section.label;
  if (!section.marker || section.marker.trim().length === 0) return '';

  switch (section.marker) {
    case '*':
      return 'Prehook';
    case '**':
      return 'Hook';
    case '***':
      return 'Bridge';
    case '[Interlude]':
      return 'Instrumental';
    default:
      return section.marker.replace(/^\[(.*)\]$/, '$1');
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
    label: SECTION_LABELS.verse,
    marker: '',
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

      const rawType = headerMatch[1] || headerMatch[2] || 'Verse';
      const sectionHeader = mapSectionHeader(rawType);

      currentSection = createSection(sectionHeader);
      i++;
      continue;
    }

    // Check if this line is a chord line
    if (isChordLine(line)) {
      const chords = line.trim();
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      const inlineMarker = getInlineSectionMarker(nextLine);

      // The next line is lyrics only if it's not a chord line or section header
      let lyrics = '';
      if (inlineMarker) {
        if (currentSection.lines.length > 0) {
          sections.push(currentSection);
        }
        currentSection = createSection(inlineMarker.section);
        lyrics = inlineMarker.lyrics;
        i += 2;
      } else if (
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
      const inlineMarker = getInlineSectionMarker(line);
      if (inlineMarker) {
        if (currentSection.lines.length > 0) {
          sections.push(currentSection);
        }
        currentSection = createSection(inlineMarker.section);
        currentSection.lines.push({ chords: '', lyrics: inlineMarker.lyrics });
      } else {
        currentSection.lines.push({ chords: '', lyrics: trimmed });
      }
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
