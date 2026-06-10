/** UI store — global UI state (sidebar, mobile menu) */

import { create } from 'zustand'

interface UIState {
  sidebarWidth: number // default 300
  isMobileMenuOpen: boolean
  setSidebarWidth: (width: number) => void
  toggleMobileMenu: () => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarWidth: 300,
  isMobileMenuOpen: false,

  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  toggleMobileMenu: () => set((s) => ({ isMobileMenuOpen: !s.isMobileMenuOpen })),
}))
