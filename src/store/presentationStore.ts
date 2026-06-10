/** Presentation store — manages state for the presentation control screen */

import { create } from 'zustand';
import type { VideoBackground } from '../types/database';

interface PresentationState {
  /** Current playlist ID */
  playlistId: string | null;
  /** Index of the currently selected song in the playlist */
  currentSongIndex: number;
  /** Index of the currently projected lyric block */
  currentBlockIndex: number;
  /** Whether the welcome slide is showing */
  isShowingWelcome: boolean;
  /** Whether the screen is blacked out */
  isBlacked: boolean;
  /** Selected video background */
  videoBackground: VideoBackground | null;

  setPlaylistId: (id: string | null) => void;
  setSong: (index: number) => void;
  setBlock: (index: number) => void;
  showWelcome: () => void;
  showBlack: () => void;
  showLyrics: () => void;
  setVideoBackground: (bg: VideoBackground | null) => void;
  reset: () => void;
}

export const usePresentationStore = create<PresentationState>((set) => ({
  playlistId: null,
  currentSongIndex: 0,
  currentBlockIndex: 0,
  isShowingWelcome: false,
  isBlacked: false,
  videoBackground: null,

  setPlaylistId: (id) => set({ playlistId: id, currentSongIndex: 0, currentBlockIndex: 0 }),
  setSong: (index) => set({ currentSongIndex: index, currentBlockIndex: 0 }),
  setBlock: (index) => set({ currentBlockIndex: index, isShowingWelcome: false, isBlacked: false }),
  showWelcome: () => set({ isShowingWelcome: true, isBlacked: false }),
  showBlack: () => set({ isBlacked: true, isShowingWelcome: false }),
  showLyrics: () => set({ isBlacked: false, isShowingWelcome: false }),
  setVideoBackground: (bg) => set({ videoBackground: bg }),
  reset: () =>
    set({
      playlistId: null,
      currentSongIndex: 0,
      currentBlockIndex: 0,
      isShowingWelcome: false,
      isBlacked: false,
      videoBackground: null,
    }),
}));
