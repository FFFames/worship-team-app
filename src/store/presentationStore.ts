/** Zustand store for presentation mode state */
import { create } from 'zustand';
import type { VideoBackground } from '../types/database';

interface PresentationState {
  currentPlaylistId: string | null;
  currentSongIndex: number;
  currentBlockIndex: number;
  isShowingWelcome: boolean;
  isBlacked: boolean;
  videoBackground: VideoBackground | null;
  setPlaylistId: (id: string | null) => void;
  setSongIndex: (index: number) => void;
  setBlockIndex: (index: number) => void;
  showWelcome: () => void;
  showBlack: () => void;
  showLyrics: () => void;
  setVideoBackground: (bg: VideoBackground | null) => void;
  reset: () => void;
}

export const usePresentationStore = create<PresentationState>((set) => ({
  currentPlaylistId: null,
  currentSongIndex: 0,
  currentBlockIndex: 0,
  isShowingWelcome: false,
  isBlacked: false,
  videoBackground: null,

  setPlaylistId: (id) => set({ currentPlaylistId: id }),
  setSongIndex: (index) => set({ currentSongIndex: index, currentBlockIndex: 0 }),
  setBlockIndex: (index) => set({ currentBlockIndex: index, isShowingWelcome: false, isBlacked: false }),
  showWelcome: () => set({ isShowingWelcome: true, isBlacked: false }),
  showBlack: () => set({ isBlacked: true, isShowingWelcome: false }),
  showLyrics: () => set({ isShowingWelcome: false, isBlacked: false }),
  setVideoBackground: (bg) => set({ videoBackground: bg }),
  reset: () =>
    set({
      currentPlaylistId: null,
      currentSongIndex: 0,
      currentBlockIndex: 0,
      isShowingWelcome: false,
      isBlacked: false,
      videoBackground: null,
    }),
}));
