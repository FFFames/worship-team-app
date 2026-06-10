/** Layout — Split panel shell: minimal top bar (48px) with logo + nav tabs + outlet for page content */

import { Outlet, NavLink } from 'react-router-dom'

/** Nav tab button used in top bar */
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

/** Root layout: 48px top bar + main content area via <Outlet /> */
export function Layout() {
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

        {/* Nav tabs */}
        <nav className="flex gap-2">
          <NavTab to="/">Songs</NavTab>
          <NavTab to="/playlists">Playlists</NavTab>
          <NavTab to="/playlists?present=true">Present</NavTab>
        </nav>
      </header>

      {/* Main content — pages render here, they handle their own split panels */}
      <main className="flex-1 flex overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
