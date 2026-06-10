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

  return (
    <div className="h-full flex">
      {/* Left panel — Sidebar component */}
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

      {/* Right panel — song detail or empty state */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0f0f0f]">
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
