/** UI store — global UI state (sidebar, theme) */

import { create } from 'zustand';

interface UiState {
  /** Whether the sidebar is open */
  sidebarOpen: boolean;
  /** Current theme */
  theme: 'dark';

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  theme: 'dark',

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
