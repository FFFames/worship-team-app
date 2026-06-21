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
  /** URL of the welcome image shown on the welcome screen. */
  welcomeImageUrl: string;
  /** Vertical position of lyrics text. 0 = top, 50 = center, 100 = bottom. */
  textVerticalOffset: number;
  setPlaylistId: (id: string | null) => void;
  setSongIndex: (index: number) => void;
  setBlockIndex: (index: number) => void;
  showWelcome: () => void;
  showBlack: () => void;
  showLyrics: () => void;
  setVideoBackground: (bg: VideoBackground | null) => void;
  setWelcomeImageUrl: (url: string) => void;
  setTextVerticalOffset: (offset: number) => void;
  reset: () => void;
}

export const usePresentationStore = create<PresentationState>((set) => ({
  currentPlaylistId: null,
  currentSongIndex: 0,
  currentBlockIndex: 0,
  isShowingWelcome: false,
  isBlacked: false,
  videoBackground: null,
  welcomeImageUrl: '/welcome.png',
  textVerticalOffset: 50,

  setPlaylistId: (id) => set({ currentPlaylistId: id }),
  setSongIndex: (index) => set({ currentSongIndex: index, currentBlockIndex: 0 }),
  setBlockIndex: (index) => set({ currentBlockIndex: index, isShowingWelcome: false, isBlacked: false }),
  showWelcome: () => set({ isShowingWelcome: true, isBlacked: false }),
  showBlack: () => set({ isBlacked: true, isShowingWelcome: false }),
  showLyrics: () => set({ isShowingWelcome: false, isBlacked: false }),
  setVideoBackground: (bg) => set({ videoBackground: bg }),
  setWelcomeImageUrl: (url) => set({ welcomeImageUrl: url }),
  setTextVerticalOffset: (offset) => set({ textVerticalOffset: offset }),
  reset: () =>
    set({
      currentPlaylistId: null,
      currentSongIndex: 0,
      currentBlockIndex: 0,
      isShowingWelcome: false,
      isBlacked: false,
      videoBackground: null,
      welcomeImageUrl: '/welcome.png',
      textVerticalOffset: 50,
    }),
}));
