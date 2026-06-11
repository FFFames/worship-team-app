/** Sidebar — Reusable left panel for song/playlist lists, matching sketches/003-split-panel.
 *  Responsive: fixed-width on desktop, full-screen overlay on mobile.
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

/** Reusable sidebar list panel — matches the left panel from sketches/003-split-panel */
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
      <div className="px-4 py-4 border-b border-[#2e2e2e] flex items-center justify-between">
        <span className="text-[13px] font-medium text-[#898989] uppercase tracking-wider">
          {title}
        </span>
        {onAdd && (
          <button
            onClick={onAdd}
            className="w-7 h-7 rounded-md border border-[#2e2e2e] text-[#b4b4b4] text-sm flex items-center justify-center hover:bg-[#242424] transition-colors"
          >
            +
          </button>
        )}
      </div>

      {/* Search / filter input */}
      {onFilterChange && (
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={filterQuery}
          onChange={(e) => onFilterChange(e.target.value)}
          className="mx-4 my-3 bg-[#1a1a1a] border border-[#2e2e2e] rounded-md px-2.5 py-1.5 text-[13px] text-[#fafafa] outline-none placeholder:text-[#898989] focus:border-[#3ecf8e] transition-colors"
        />
      )}

      {/* Scrollable item list */}
      <div className="flex-1 overflow-y-auto">
        {items.map((item) => {
          const isActive = item.id === activeId
          return (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className={`w-full text-left px-4 py-3 border-b border-[#1e1e1e] cursor-pointer transition-colors ${
                isActive
                  ? 'bg-[rgba(62,207,142,0.08)] border-l-2 border-l-[#3ecf8e]'
                  : 'border-l-2 border-l-transparent hover:bg-[#1a1a1a]'
              }`}
            >
              <div className="text-sm font-medium text-[#fafafa] truncate">
                {item.title}
              </div>
              <div className="text-xs text-[#898989] mt-0.5 flex items-center gap-2">
                {item.badge && (
                  <span className="font-mono text-[11px] bg-[rgba(62,207,142,0.15)] text-[#3ecf8e] px-1.5 py-px rounded">
                    {item.badge}
                  </span>
                )}
                <span className="truncate">{item.subtitle}</span>
              </div>
            </button>
          )
        })}

        {/* Empty state */}
        {items.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-[#898989]">
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
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              setSidebarOpen(false)
              onClose?.()
            }}
          />
          {/* Sidebar panel — slides in from left */}
          <div className="relative w-[85vw] max-w-[360px] flex flex-col bg-[#141414] border-r border-[#2e2e2e] animate-in">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* ── Desktop fixed-width sidebar (md+) ── */}
      <div
        className="hidden md:flex flex-col shrink-0 bg-[#141414] border-r border-[#2e2e2e]"
        style={{ width: `${sidebarWidth}px` }}
      >
        {sidebarContent}
      </div>
    </>
  )
}
