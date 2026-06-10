/** Layout — Main app shell with split-panel design (sidebar + detail view) */

import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useUiStore } from '../store/uiStore';

/** Root layout: fixed left sidebar (300px) + scrollable right detail panel */
export function Layout() {
  const { sidebarOpen } = useUiStore();

  return (
    <div
      className="h-screen flex overflow-hidden"
      style={{ background: 'var(--color-bg-deepest)' }}
    >
      {/* Left panel — Sidebar */}
      {sidebarOpen && (
        <div
          className="flex-shrink-0"
          style={{ width: '300px' }}
        >
          <Sidebar />
        </div>
      )}

      {/* Right panel — Detail view */}
      <div
        className="flex-1 flex flex-col overflow-hidden"
        style={{
          background: 'var(--color-bg-page)',
          borderLeft: sidebarOpen ? 'none' : '1px solid var(--color-border-standard)',
        }}
      >
        <Outlet />
      </div>
    </div>
  );
}
