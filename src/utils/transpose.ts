/**
 * transpose.ts — Transpose chords and keys by a given number of semitones.
 * Pure functions for music theory transposition.
 */

import { CHROMATIC_SHARP, CHROMATIC_FLAT } from '../types/database';

/** Regex to split a chord into root note and suffix */
const CHORD_REGEX = /^([A-G][#b]?)(.*)$/;

/**
 * Transpose a single chord by a number of semitones.
 *
 * @param chord     - The chord string (e.g. "Am7", "C#sus4")
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
  const suffix = match[2];

  const chromatic = useFlats ? CHROMATIC_FLAT : CHROMATIC_SHARP;

  // Also check flat chromatic for roots like "Bb" or "Db"
  let rootIndex = chromatic.indexOf(root);
  if (rootIndex === -1) {
    // Root might be in the opposite notation — try both arrays
    rootIndex = CHROMATIC_SHARP.indexOf(root);
    if (rootIndex === -1) {
      rootIndex = CHROMATIC_FLAT.indexOf(root);
    }
    if (rootIndex === -1) return chord; // unrecognised root
  }

  // Calculate new index with wrap-around (handle negatives properly)
  const newIndex =
    ((rootIndex + semitones) % 12 + 12) % 12;
  const newRoot = chromatic[newIndex];

  return newRoot + suffix;
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
    .split(/(\s+)/)
    .map((segment) => {
      // Only transpose non-whitespace segments that look like chords
      if (segment.trim() === '') return segment;
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
