/** SongLibrary — main song library page with split-panel layout (Sidebar + SongDetail) */

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSongs } from '../hooks/useSongs'
import { Sidebar } from '../components/Sidebar'
import SongDetail from './SongDetail'
import type { SidebarItem } from '../components/Sidebar'

/** Song Library page — left sidebar lists songs, right panel shows selected song detail */
export default function SongLibrary() {
  const navigate = useNavigate()
  const { songs, loading, error, searchQuery, setSearchQuery } = useSongs()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Map songs to sidebar items
  const sidebarItems: SidebarItem[] = useMemo(
    () =>
      songs.map((s) => ({
        id: s.id,
        title: s.title,
        subtitle: s.artist || 'Unknown artist',
        badge: s.original_key,
      })),
    [songs]
  )

  // Find the selected song object
  const selectedSong = useMemo(
    () => songs.find((s) => s.id === selectedId) ?? null,
    [songs, selectedId]
  )

  const handleSelect = (id: string) => {
    setSelectedId(id)
  }

  const handleAdd = () => {
    navigate('/songs/new')
  }

  // Filter songs by search query for the mobile list view
  const filteredSongs = useMemo(() => {
    if (!searchQuery) return songs
    const q = searchQuery.toLowerCase()
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.artist && s.artist.toLowerCase().includes(q))
    )
  }, [songs, searchQuery])

  return (
    <div className="h-full flex flex-col md:flex-row">
      {/* ── Desktop: Sidebar component (md+) ── */}
      <Sidebar
        title={`${songs.length} Song${songs.length !== 1 ? 's' : ''}`}
        items={sidebarItems}
        activeId={selectedId ?? undefined}
        onSelect={handleSelect}
        onAdd={handleAdd}
        searchPlaceholder="Search songs..."
        filterQuery={searchQuery}
        onFilterChange={setSearchQuery}
      />

      {/* ── Mobile: Full-width song list (< md) — only when no song selected ── */}
      {!selectedSong && (
        <div className="flex-1 flex flex-col min-w-0 bg-[#0f0f0f] md:hidden">
          {/* Mobile header with search */}
          <div className="px-4 py-3 border-b border-[#2e2e2e] flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#898989] uppercase tracking-wider">
              {loading ? 'Loading...' : `${songs.length} Song${songs.length !== 1 ? 's' : ''}`}
            </span>
            <button
              onClick={handleAdd}
              className="w-7 h-7 rounded-md border border-[#2e2e2e] text-[#b4b4b4] text-sm flex items-center justify-center hover:bg-[#242424] transition-colors"
              title="New Song"
            >
              +
            </button>
          </div>

          {/* Mobile search */}
          <div className="px-4 py-2 border-b border-[#1e1e1e]">
            <input
              type="text"
              placeholder="Search songs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#2e2e2e] rounded-md px-2.5 py-1.5 text-[13px] text-[#fafafa] outline-none placeholder:text-[#898989] focus:border-[#3ecf8e] transition-colors"
            />
          </div>

          {/* Mobile song list */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex-1 flex items-center justify-center py-16">
                <div className="text-[#898989] text-sm">Loading songs...</div>
              </div>
            )}
            {error && (
              <div className="flex-1 flex items-center justify-center py-16">
                <div className="text-red-400 text-sm">{error}</div>
              </div>
            )}
            {!loading && !error && filteredSongs.length === 0 && (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="text-4xl mb-3">🎵</div>
                  <p className="text-[#898989] text-sm">No songs found</p>
                </div>
              </div>
            )}
            {!loading &&
              !error &&
              filteredSongs.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSelect(s.id)}
                  className="w-full text-left px-4 py-3 border-b border-[#1e1e1e] cursor-pointer transition-colors hover:bg-[#1a1a1a]"
                >
                  <div className="text-sm font-medium text-[#fafafa] truncate">
                    {s.title}
                  </div>
                  <div className="text-xs text-[#898989] mt-0.5 flex items-center gap-2">
                    {s.original_key && (
                      <span className="font-mono text-[11px] bg-[rgba(62,207,142,0.15)] text-[#3ecf8e] px-1.5 py-px rounded">
                        {s.original_key}
                      </span>
                    )}
                    <span className="truncate">{s.artist || 'Unknown artist'}</span>
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* ── Mobile: Full-width SongDetail with back button (< md) ── */}
      {selectedSong && (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-[#0f0f0f] md:hidden">
          {/* Mobile back button */}
          <button
            onClick={() => setSelectedId(null)}
            className="px-4 py-2 border-b border-[#2e2e2e] text-xs text-[#898989] hover:text-[#3ecf8e] transition-colors text-left"
          >
            ← Back to Songs
          </button>
          <SongDetail song={selectedSong} />
        </div>
      )}

      {/* ── Desktop: Right panel — song detail or empty state (md+) ── */}
      <div className="hidden md:flex flex-1 flex-col min-w-0 bg-[#0f0f0f]">
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-[#898989] text-sm">Loading songs...</div>
          </div>
        )}
        {error && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-red-400 text-sm">{error}</div>
          </div>
        )}
        {!loading && !error && selectedSong ? (
          <SongDetail song={selectedSong} />
        ) : null}
        {!loading && !error && !selectedSong && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-3">🎵</div>
              <p className="text-[#898989] text-sm">
                Select a song from the list to view its chord chart
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
