/** Layout — Split panel shell: minimal top bar (48px) with logo + nav tabs + outlet for page content.
 *  Responsive: hamburger + bottom tab bar on mobile, normal nav tabs on desktop.
 */

import { Outlet, NavLink } from 'react-router-dom'
import { useUIStore } from '../store/uiStore'

/** Nav tab button used in top bar (desktop) */
function NavTab({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `px-3 py-1.5 text-xs rounded-md border transition-colors ${
          isActive
            ? 'bg-[rgba(62,207,142,0.1)] border-[rgba(62,207,142,0.3)] text-[#3ecf8e]'
            : 'border-[#2e2e2e] text-[#b4b4b4] hover:border-[#363636] hover:text-[#fafafa]'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

/** Bottom tab bar item (mobile) */
function BottomTab({ to, children, icon }: { to: string; children: React.ReactNode; icon: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-0.5 py-1 flex-1 transition-colors ${
          isActive ? 'text-[#3ecf8e]' : 'text-[#898989]'
        }`
      }
    >
      <span className="text-lg leading-none">{icon}</span>
      <span className="text-[10px] font-medium">{children}</span>
    </NavLink>
  )
}

/** Root layout: 48px top bar + main content area via <Outlet /> */
export function Layout() {
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUIStore()

  return (
    <div className="h-screen flex flex-col bg-[#0f0f0f]">
      {/* Top bar — matches sketches/003-split-panel */}
      <header className="h-12 flex items-center px-5 gap-4 shrink-0 bg-[#171717] border-b border-[#2e2e2e]">
        {/* Logo */}
        <div className="text-base font-semibold">
          <span className="text-[#3ecf8e]">♫ Worship</span>
          <span className="text-[#fafafa]">Team</span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Hamburger button — mobile only */}
        <button
          onClick={toggleSidebar}
          className="md:hidden w-8 h-8 flex items-center justify-center text-[#b4b4b4] hover:text-[#fafafa] rounded-md border border-[#2e2e2e] hover:border-[#363636] transition-colors"
          aria-label="Toggle sidebar"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="3" y1="4.5" x2="15" y2="4.5" />
            <line x1="3" y1="9" x2="15" y2="9" />
            <line x1="3" y1="13.5" x2="15" y2="13.5" />
          </svg>
        </button>

        {/* Nav tabs — desktop only */}
        <nav className="hidden md:flex gap-2">
          <NavTab to="/">Songs</NavTab>
          <NavTab to="/playlists">Playlists</NavTab>
          <NavTab to="/playlists?present=true">Present</NavTab>
        </nav>
      </header>

      {/* Main content — pages render here, they handle their own split panels.
          On mobile, clicking the main area closes the sidebar overlay. */}
      <main
        className="flex-1 flex overflow-hidden relative"
        onClick={() => {
          if (sidebarOpen) setSidebarOpen(false)
        }}
      >
        <Outlet />
      </main>

      {/* Bottom tab bar — mobile only */}
      <nav className="md:hidden flex items-center shrink-0 h-14 bg-[#171717] border-t border-[#2e2e2e]">
        <BottomTab to="/" icon="♪">Songs</BottomTab>
        <BottomTab to="/playlists" icon="☰">Playlists</BottomTab>
        <BottomTab to="/playlists?present=true" icon="▶">Present</BottomTab>
      </nav>
    </div>
  )
}
