/** Presentation store — manages state for live presentation mode */

import { create } from 'zustand'
import type { VideoBackground } from '../types/database'

interface PresentationState {
  currentSongIndex: number
  currentBlockIndex: number
  isShowingWelcome: boolean
  isBlacked: boolean
  videoBackground: VideoBackground | null
  currentLyrics: string // currently projected lyrics text
  setSongIndex: (index: number) => void
  setBlockIndex: (index: number) => void
  showWelcome: () => void
  showBlack: () => void
  showLyrics: (text: string) => void
  setVideoBackground: (bg: VideoBackground | null) => void
}

export const usePresentationStore = create<PresentationState>((set) => ({
  currentSongIndex: 0,
  currentBlockIndex: 0,
  isShowingWelcome: false,
  isBlacked: false,
  videoBackground: null,
  currentLyrics: '',

  setSongIndex: (index) => set({ currentSongIndex: index, currentBlockIndex: 0 }),
  setBlockIndex: (index) => set({ currentBlockIndex: index }),
  showWelcome: () => set({ isShowingWelcome: true, isBlacked: false }),
  showBlack: () => set({ isBlacked: true, isShowingWelcome: false }),
  showLyrics: (text) =>
    set({ currentLyrics: text, isShowingWelcome: false, isBlacked: false }),
  setVideoBackground: (bg) => set({ videoBackground: bg }),
}))
