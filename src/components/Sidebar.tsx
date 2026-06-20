/** Sidebar — Reusable left panel for song/playlist lists, matching sketches/003-split-panel.
 *  Responsive: fixed-width on desktop, full-screen overlay on mobile.
 *
 *  Uses CSS variable tokens (no hardcoded hex).
 */

import { useUIStore } from '../store/uiStore'

export interface SidebarItem {
  id: string
  title: string
  subtitle: string // e.g. 'John Newton'
  badge?: string // e.g. 'G' (key badge)
}

export interface SidebarProps {
  title: string // e.g. '24 Songs'
  items: SidebarItem[]
  activeId?: string
  onSelect: (id: string) => void
  onAdd?: () => void
  searchPlaceholder?: string
  filterQuery?: string
  onFilterChange?: (query: string) => void
  /** Called when an item is selected on mobile (to close the overlay) */
  onClose?: () => void
}

/** Reusable sidebar list panel */
export function Sidebar({
  title,
  items,
  activeId,
  onSelect,
  onAdd,
  searchPlaceholder = 'Filter...',
  filterQuery = '',
  onFilterChange,
  onClose,
}: SidebarProps) {
  const { sidebarWidth, sidebarOpen, setSidebarOpen } = useUIStore()

  /** Handle item selection — on mobile, also close the overlay */
  function handleSelect(id: string) {
    onSelect(id)
    onClose?.()
    setSidebarOpen(false)
  }

  /** The inner sidebar panel content shared between mobile & desktop */
  const sidebarContent = (
    <>
      {/* Header — title + add button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-md) var(--space-lg)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--fg-tertiary)', fontFamily: 'var(--font-display)' }}>
          {title}
        </span>
        {onAdd && (
          <button
            onClick={onAdd}
            aria-label="Add"
            style={{
              width: 28,
              height: 28,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-tertiary)',
              color: 'var(--fg-secondary)',
              fontSize: '1.125rem',
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all var(--duration-fast) var(--ease-out)',
              fontFamily: 'var(--font-display)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent-muted)'
              e.currentTarget.style.color = 'var(--accent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-subtle)'
              e.currentTarget.style.color = 'var(--fg-secondary)'
            }}
          >
            +
          </button>
        )}
      </div>

      {/* Search / filter input */}
      {onFilterChange && (
        <div style={{ padding: 'var(--space-sm) var(--space-md)' }}>
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={filterQuery}
            onChange={(e) => onFilterChange(e.target.value)}
            style={{
              width: '100%',
              padding: 'var(--space-xs) var(--space-sm)',
              fontSize: '0.8125rem',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--fg-primary)',
              fontFamily: 'var(--font-body)',
              outline: 'none',
              transition: 'border-color var(--duration-normal) var(--ease-out), box-shadow var(--duration-normal) var(--ease-out)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)'
              e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-bg)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-subtle)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
        </div>
      )}

      {/* Scrollable item list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {items.map((item) => {
          const isActive = item.id === activeId
          return (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: 'var(--space-sm) var(--space-md)',
                border: 'none',
                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                borderBottom: '1px solid var(--border-subtle)',
                cursor: 'pointer',
                transition: 'background var(--duration-fast) var(--ease-out)',
                background: isActive ? 'var(--accent-bg)' : 'transparent',
                fontFamily: 'var(--font-body)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'var(--bg-tertiary)'
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent'
              }}
            >
              <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginTop: 2 }}>
                {item.badge && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', fontWeight: 600, background: 'var(--accent-bg)', color: 'var(--accent)', padding: '1px 6px', borderRadius: 'var(--radius-sm)' }}>
                    {item.badge}
                  </span>
                )}
                <span style={{ fontSize: '0.75rem', color: 'var(--fg-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.subtitle}
                </span>
              </div>
            </button>
          )
        })}

        {/* Empty state */}
        {items.length === 0 && (
          <div style={{ padding: 'var(--space-2xl) var(--space-md)', textAlign: 'center', fontSize: '0.8125rem', color: 'var(--fg-tertiary)' }}>
            No items found
          </div>
        )}
      </div>
    </>
  )

  return (
    <>
      {/* ── Mobile overlay (< md) ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Semi-transparent backdrop */}
          <div
            style={{ position: 'absolute', inset: 0, background: 'oklch(0 0 0 / 0.6)', backdropFilter: 'blur(2px)' }}
            onClick={() => {
              setSidebarOpen(false)
              onClose?.()
            }}
          />
          {/* Sidebar panel — slides in from left */}
          <div
            className="relative flex flex-col animate-in"
            style={{ width: '85vw', maxWidth: 360, background: 'var(--bg-elevated)', borderRight: '1px solid var(--border-standard)' }}
          >
            {sidebarContent}
          </div>
        </div>
      )}

      {/* ── Desktop fixed-width sidebar (md+) ── */}
      <div
        className="hidden md:flex flex-col shrink-0"
        style={{ width: `${sidebarWidth}px`, background: 'var(--bg-elevated)', borderRight: '1px solid var(--border-subtle)' }}
      >
        {sidebarContent}
      </div>
    </>
  )
}
