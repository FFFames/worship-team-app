/** Zustand store for the song editor page */
import { create } from 'zustand';
import type { SongContent } from '../types/database';

interface SongEditorState {
  rawText: string;
  parsedContent: SongContent | null;
  detectedKey: string;
  transpose: number;
  useFlats: boolean;
  isDirty: boolean;
  editingSongId: string | null;
  setRawText: (text: string) => void;
  setParsedContent: (content: SongContent | null) => void;
  setDetectedKey: (key: string) => void;
  setTranspose: (semitones: number) => void;
  setUseFlats: (useFlats: boolean) => void;
  toggleFlats: () => void;
  setEditingSongId: (id: string | null) => void;
  reset: () => void;
}

export const useSongEditorStore = create<SongEditorState>((set) => ({
  rawText: '',
  parsedContent: null,
  detectedKey: '',
  transpose: 0,
  useFlats: false,
  isDirty: false,
  editingSongId: null,

  setRawText: (text) => set({ rawText: text, isDirty: true }),
  setParsedContent: (content) => set({ parsedContent: content }),
  setDetectedKey: (key) => set({ detectedKey: key }),
  setTranspose: (semitones) => set({ transpose: semitones }),
  setUseFlats: (useFlats) => set({ useFlats }),
  toggleFlats: () => set((s) => ({ useFlats: !s.useFlats })),
  setEditingSongId: (id) => set({ editingSongId: id }),
  reset: () =>
    set({
      rawText: '',
      parsedContent: null,
      detectedKey: '',
      transpose: 0,
      useFlats: false,
      isDirty: false,
      editingSongId: null,
    }),
}));
