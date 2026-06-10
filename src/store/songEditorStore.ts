/** Song editor store — manages state for the chord/lyrics editor */

import { create } from 'zustand';
import type { SongContent } from '../types/database';
import { parseChordLyrics, detectKey } from '../utils/chordParser';

interface SongEditorState {
  /** Raw text in the editor textarea */
  rawText: string;
  /** Parsed structured content */
  parsedContent: SongContent | null;
  /** Auto-detected key from chords */
  detectedKey: string;
  /** Current transpose semitones (preview only, not saved) */
  transpose: number;
  /** Whether to use flats instead of sharps */
  useFlats: boolean;
  /** Whether we're editing an existing song */
  editingSongId: string | null;

  setRawText: (text: string) => void;
  parse: () => void;
  setTranspose: (semitones: number) => void;
  setUseFlats: (useFlats: boolean) => void;
  setEditingSongId: (id: string | null) => void;
  reset: () => void;
}

export const useSongEditorStore = create<SongEditorState>((set, get) => ({
  rawText: '',
  parsedContent: null,
  detectedKey: '',
  transpose: 0,
  useFlats: false,
  editingSongId: null,

  setRawText: (text) => set({ rawText: text }),

  parse: () => {
    const { rawText } = get();
    const content = parseChordLyrics(rawText);
    const key = detectKey(content);
    set({ parsedContent: content, detectedKey: key });
  },

  setTranspose: (semitones) => set({ transpose: semitones }),

  setUseFlats: (useFlats) => set({ useFlats }),

  setEditingSongId: (id) => set({ editingSongId: id }),

  reset: () =>
    set({
      rawText: '',
      parsedContent: null,
      detectedKey: '',
      transpose: 0,
      useFlats: false,
      editingSongId: null,
    }),
}));
