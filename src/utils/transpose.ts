/**
 * transpose.ts — Transpose chords and keys by a given number of semitones.
 * Pure functions for music theory transposition.
 */

import { CHROMATIC_SHARP, CHROMATIC_FLAT } from '../types/database';

/** Regex to split a chord into root note, suffix, and optional slash bass */
const CHORD_REGEX = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/;

/** Find the chromatic index of a root note, checking both sharp and flat arrays */
function findRootIndex(root: string): number {
  let idx = CHROMATIC_SHARP.indexOf(root);
  if (idx === -1) idx = CHROMATIC_FLAT.indexOf(root);
  return idx;
}

/** Transpose a single root note by semitones */
function transposeRoot(root: string, semitones: number, useFlats: boolean): string {
  const idx = findRootIndex(root);
  if (idx === -1) return root;
  const chromatic = useFlats ? CHROMATIC_FLAT : CHROMATIC_SHARP;
  return chromatic[((idx + semitones) % 12 + 12) % 12];
}

/**
 * Transpose a single chord by a number of semitones.
 *
 * @param chord     - The chord string (e.g. "Am7", "C#sus4", "G/B", "Cmaj7/E")
 * @param semitones - Number of semitones to transpose (positive = up, negative = down)
 * @param useFlats  - If true, prefer flat notation (e.g. Bb instead of A#)
 * @returns The transposed chord string
 */
export function transposeChord(
  chord: string,
  semitones: number,
  useFlats: boolean = false,
): string {
  const match = chord.match(CHORD_REGEX);
  if (!match) return chord;

  const root = match[1];
  const suffix = match[2] || '';
  const bass = match[3];

  if (findRootIndex(root) === -1) return chord; // unrecognised root

  const newRoot = transposeRoot(root, semitones, useFlats);

  // Transpose slash bass note too (e.g. G/B → A/C#)
  const newBass = bass ? '/' + transposeRoot(bass, semitones, useFlats) : '';

  return newRoot + suffix + newBass;
}

/**
 * Transpose all chords in a chord line (space-separated tokens).
 *
 * @param line      - Chord line string (e.g. "C    G    Am   F")
 * @param semitones - Number of semitones to transpose
 * @param useFlats  - If true, prefer flat notation
 * @returns The transposed chord line with spacing preserved
 */
export function transposeChordLine(
  line: string,
  semitones: number,
  useFlats: boolean = false,
): string {
  return line
    .split(/(\s+|\|)/)
    .map((segment) => {
      // Only transpose chord-like segments; preserve whitespace and bar lines.
      if (segment.trim() === '' || segment === '|') return segment;
      return transposeChord(segment, semitones, useFlats);
    })
    .join('');
}

/**
 * Transpose a key name by a number of semitones.
 *
 * @param key       - The key name (e.g. "C", "G#", "Bb")
 * @param semitones - Number of semitones to transpose
 * @param useFlats  - If true, prefer flat notation
 * @returns The transposed key name
 */
export function transposeKey(
  key: string,
  semitones: number,
  useFlats: boolean = false,
): string {
  return transposeChord(key, semitones, useFlats);
}
