/** Layout — App shell: header nav + content outlet + mobile bottom tabs
 *
 * Design system (ported from ChordHub redesign):
 * - Dark theme with warm-tinted neutrals (OKLCH)
 * - Accent: warm emerald green used ≤10% of surface
 * - Kanit font for display/body, Source Code Pro for chords
 * - Exponential ease-out motion curves only
 */

import { Outlet, NavLink } from 'react-router-dom'
import { useUIStore } from '../store/uiStore'
import { motion } from 'framer-motion'

const easeOutExpo: [number, number, number, number] = [0.16, 1, 0.3, 1]

/** Desktop nav tab with icon */
function NavTab({ to, children, icon }: { to: string; children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className="flex items-center gap-2 text-sm font-medium transition-all duration-150 hover:text-[var(--fg-primary)]"
      style={({ isActive }) => ({
        background: isActive ? 'var(--accent-bg)' : 'transparent',
        border: isActive ? '1px solid var(--accent)' : '1px solid transparent',
        color: isActive ? 'var(--accent)' : 'var(--fg-secondary)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-sm) var(--space-lg)',
      })}
    >
      <span className="w-[18px] h-[18px]" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      {children}
    </NavLink>
  )
}

/** Mobile bottom tab */
function BottomTab({ to, children, icon }: { to: string; children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className="flex flex-col items-center gap-1 p-2 min-w-[60px] text-xs transition-all duration-150"
      style={({ isActive }) => ({
        color: isActive ? 'var(--accent)' : 'var(--fg-secondary)',
      })}
    >
      <span className="w-6 h-6" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      {children}
    </NavLink>
  )
}

/** Root layout */
export function Layout() {
  const { sidebarOpen, setSidebarOpen } = useUIStore()

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Sticky Header */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: easeOutExpo }}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'oklch(0.15 0.01 240 / 0.95)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-md) var(--space-lg)', maxWidth: 'var(--max-width)', margin: '0 auto' }}>
          {/* Logo */}
          <NavLink
            to="/"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: '1.5rem',
              color: 'var(--fg-primary)',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              padding: 'var(--space-sm)',
              borderRadius: 'var(--radius-sm)',
              transition: 'opacity 150ms ease',
            }}
          >
            <span style={{ color: 'var(--accent)' }}>♫</span> Worship<span style={{ color: 'var(--accent)' }}>Team</span>
          </NavLink>

          {/* Nav — desktop */}
          <nav className="hidden md:flex items-center gap-1">
            <NavTab to="/" icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                <path d="M9 18V5l12-2v13"/>
                <circle cx="6" cy="18" r="3"/>
                <circle cx="18" cy="16" r="3"/>
              </svg>
            }>
              Songs
            </NavTab>
            <NavTab to="/playlists" icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                <line x1="8" y1="6" x2="21" y2="6"/>
                <line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/>
                <line x1="3" y1="12" x2="3.01" y2="12"/>
                <line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            }>
              Playlists
            </NavTab>
            <NavTab to="/playlists?present=true" icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            }>
              Present
            </NavTab>
          </nav>
        </div>
      </motion.header>

      {/* Main content */}
      <main
        className="flex-1"
        style={{ paddingTop: 'var(--space-3xl)', paddingBottom: 'var(--space-3xl)' }}
        onClick={() => {
          if (sidebarOpen) setSidebarOpen(false)
        }}
      >
        <div style={{ maxWidth: 'var(--max-width)', margin: '0 auto', padding: '0 var(--space-lg)', width: '100%' }}>
          <Outlet />
        </div>
      </main>

      {/* Bottom tabs — mobile */}
      <motion.nav
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: easeOutExpo }}
        className="fixed bottom-0 left-0 right-0 md:hidden z-20"
        style={{
          background: 'oklch(0.15 0.01 240 / 0.95)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-around', padding: 'var(--space-sm) 0' }}>
          <BottomTab to="/" icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 24, height: 24 }}>
              <path d="M9 18V5l12-2v13"/>
              <circle cx="6" cy="18" r="3"/>
              <circle cx="18" cy="16" r="3"/>
            </svg>
          }>
            Songs
          </BottomTab>
          <BottomTab to="/playlists" icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 24, height: 24 }}>
              <line x1="8" y1="6" x2="21" y2="6"/>
              <line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/>
              <line x1="3" y1="12" x2="3.01" y2="12"/>
              <line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          }>
            Playlists
          </BottomTab>
          <BottomTab to="/playlists?present=true" icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 24, height: 24 }}>
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          }>
            Present
          </BottomTab>
        </div>
      </motion.nav>
    </div>
  )
}
