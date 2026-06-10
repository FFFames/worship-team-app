/** Transpose utility — chromatic transposition for chords and keys */

/** Chromatic scale using sharps */
export const CHROMATIC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Chromatic scale using flats */
export const CHROMATIC_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Keys that conventionally use flats */
export const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'd', 'g', 'c', 'f', 'bb', 'eb']);

/** Regex to parse a chord into root + suffix */
const CHORD_REGEX = /^([A-G][#b]?)(.*)/;

/** Normalize a root note to our canonical representation */
function normalizeRoot(root: string): { note: string; isFlat: boolean } {
  const flatToSharp: Record<string, string> = {
    'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
  };
  const sharpToFlat: Record<string, string> = {
    'C#': 'Db', 'D#': 'Eb', 'E#': 'F', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb', 'B#': 'C',
  };

  if (flatToSharp[root]) return { note: flatToSharp[root], isFlat: true };
  if (sharpToFlat[root]) return { note: root, isFlat: root.length > 1 };
  return { note: root, isFlat: false };
}

/** Find a note's index in the chromatic scale */
function chromaticIndex(note: string): number {
  const idx = CHROMATIC_SHARP.indexOf(note);
  if (idx !== -1) return idx;
  // Try flats
  return CHROMATIC_FLAT.indexOf(note);
}

/**
 * Transpose a single chord by a number of semitones.
 * @param chord - e.g. "Am7", "G/B", "F#m"
 * @param semitones - positive = up, negative = down
 * @param useFlats - prefer flat notation for accidentals
 */
export function transposeChord(chord: string, semitones: number, useFlats = false): string {
  if (semitones === 0) return chord;

  // Handle slash chords (e.g. G/B)
  if (chord.includes('/')) {
    const [main, bass] = chord.split('/');
    return `${transposeChord(main, semitones, useFlats)}/${transposeChord(bass, semitones, useFlats)}`;
  }

  const match = chord.match(CHORD_REGEX);
  if (!match) return chord;

  const root = match[1];
  const suffix = match[2];

  const { note } = normalizeRoot(root);
  const idx = chromaticIndex(note);
  if (idx === -1) return chord;

  const newIdx = ((idx + semitones) % 12 + 12) % 12;
  const scale = useFlats ? CHROMATIC_FLAT : CHROMATIC_SHARP;
  const newRoot = scale[newIdx];

  return `${newRoot}${suffix}`;
}

/**
 * Transpose all chords in a chord line string.
 * Preserves spacing between chords.
 */
export function transposeChordLine(line: string, semitones: number, useFlats = false): string {
  if (semitones === 0) return line;

  // Tokenize: split on whitespace boundaries but preserve spacing
  return line.replace(/[A-G][#b]?[m maj min dim aug sus add ° ø \d]*/g, (match) => {
    // Only transpose if it looks like a real chord
    if (CHORD_REGEX.test(match)) {
      return transposeChord(match, semitones, useFlats);
    }
    return match;
  });
}

/**
 * Transpose a key name by semitones.
 * @param key - e.g. "C", "G", "Bb"
 * @param semitones - positive = up, negative = down
 * @param useFlats - prefer flat notation
 */
export function transposeKey(key: string, semitones: number, useFlats = false): string {
  if (semitones === 0) return key;

  const { note } = normalizeRoot(key);
  const idx = chromaticIndex(note);
  if (idx === -1) return key;

  const newIdx = ((idx + semitones) % 12 + 12) % 12;

  if (useFlats) return CHROMATIC_FLAT[newIdx];
  // Auto-detect: if original key was flat, keep flats unless sharps requested
  const wasFlat = key.includes('b') && key !== 'B';
  if (wasFlat && !useFlats) {
    const sharpNote = CHROMATIC_SHARP[newIdx];
    // If the sharp note has a flat equivalent, use it
    const flatEquivs: Record<string, string> = {
      'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
    };
    return flatEquivs[sharpNote] || sharpNote;
  }

  return CHROMATIC_SHARP[newIdx];
}

/**
 * Format a key using the preferred accidental style.
 */
export function formatKey(key: string, useFlats: boolean): string {
  if (useFlats) {
    const sharpToFlat: Record<string, string> = {
      'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
    };
    return sharpToFlat[key] || key;
  }
  const flatToSharp: Record<string, string> = {
    'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#',
  };
  return flatToSharp[key] || key;
}
