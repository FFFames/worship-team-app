/** Layout — App shell: header nav + content outlet + mobile bottom tabs
 *
 * Design system:
 * - Warm-tinted dark neutrals (OKLCH) with ambient emerald glow
 * - Accent used sparingly; depth from borders, not shadows
 * - Kanit display/body + Source Code Pro mono
 * - Exponential ease-out motion only
 */

import { Outlet, NavLink } from 'react-router-dom'
import { useUIStore } from '../store/uiStore'
import { motion } from 'framer-motion'

const easeOutExpo: [number, number, number, number] = [0.16, 1, 0.3, 1]

/** Musical note icon used in the logo mark */
function LogoMark() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 34,
        height: 34,
        borderRadius: 'var(--radius-md)',
        background: 'var(--accent-bg)',
        border: '1px solid var(--accent-muted)',
        color: 'var(--accent)',
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    </span>
  )
}

/** Desktop nav tab with icon + animated active pill */
function NavTab({ to, children, icon }: { to: string; children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      style={({ isActive }) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-sm)',
        fontFamily: 'var(--font-display)',
        fontWeight: 500,
        fontSize: '0.9375rem',
        lineHeight: 1,
        padding: 'var(--space-sm) var(--space-md)',
        borderRadius: 'var(--radius-md)',
        textDecoration: 'none',
        transition: 'all var(--duration-fast) var(--ease-out)',
        background: isActive ? 'var(--accent-bg)' : 'transparent',
        border: isActive ? '1px solid var(--accent-muted)' : '1px solid transparent',
        color: isActive ? 'var(--accent)' : 'var(--fg-secondary)',
      })}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
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
      style={({ isActive }) => ({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        minWidth: 64,
        padding: 'var(--space-xs) var(--space-sm)',
        borderRadius: 'var(--radius-md)',
        textDecoration: 'none',
        transition: 'color var(--duration-fast) var(--ease-out)',
        color: isActive ? 'var(--accent)' : 'var(--fg-tertiary)',
      })}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      <span style={{ fontSize: '0.6875rem', fontWeight: 500, fontFamily: 'var(--font-display)' }}>{children}</span>
    </NavLink>
  )
}

/** Root layout */
export function Layout() {
  const { sidebarOpen, setSidebarOpen } = useUIStore()

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-primary)', position: 'relative' }}>
      {/* Sticky Header */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: easeOutExpo }}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'oklch(0.165 0.008 65 / 0.82)',
          backdropFilter: 'blur(16px) saturate(140%)',
          WebkitBackdropFilter: 'blur(16px) saturate(140%)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-sm) var(--space-lg)',
            maxWidth: 'var(--max-width)',
            margin: '0 auto',
            width: '100%',
          }}
        >
          {/* Logo */}
          <NavLink
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-sm)',
              textDecoration: 'none',
              padding: 'var(--space-xs)',
              borderRadius: 'var(--radius-md)',
              transition: 'opacity var(--duration-fast) var(--ease-out)',
            }}
          >
            <LogoMark />
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.0625rem', color: 'var(--fg-primary)', letterSpacing: '-0.015em' }}>
                Worship<span style={{ color: 'var(--accent)' }}>Team</span>
              </span>
            </span>
          </NavLink>

          {/* Nav — desktop */}
          <nav className="hidden md:flex items-center gap-1">
            <NavTab
              to="/"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 17, height: 17 }}>
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              }
            >
              Songs
            </NavTab>
            <NavTab
              to="/playlists"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 17, height: 17 }}>
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              }
            >
              Playlists
            </NavTab>
            <NavTab
              to="/playlists?present=true"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 17, height: 17 }}>
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              }
            >
              Present
            </NavTab>
          </nav>
        </div>
      </motion.header>

      {/* Main content */}
      <main
        className="flex-1"
        style={{ paddingTop: 'var(--space-2xl)', paddingBottom: 'var(--space-3xl)', position: 'relative', zIndex: 1 }}
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
        transition={{ duration: 0.3, ease: easeOutExpo }}
        className="fixed bottom-0 left-0 right-0 md:hidden"
        style={{
          zIndex: 20,
          background: 'oklch(0.165 0.008 65 / 0.88)',
          backdropFilter: 'blur(16px) saturate(140%)',
          WebkitBackdropFilter: 'blur(16px) saturate(140%)',
          borderTop: '1px solid var(--border-subtle)',
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: 'var(--space-xs) 0' }}>
          <BottomTab
            to="/"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            }
          >
            Songs
          </BottomTab>
          <BottomTab
            to="/playlists"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            }
          >
            Playlists
          </BottomTab>
          <BottomTab
            to="/playlists?present=true"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            }
          >
            Present
          </BottomTab>
        </div>
      </motion.nav>

      {/* Spacer so content isn't hidden behind the mobile tab bar */}
      <div className="h-14 md:hidden" aria-hidden="true" />
    </div>
  )
}
