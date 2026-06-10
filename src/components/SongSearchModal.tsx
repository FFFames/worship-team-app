/** SongSearchModal — modal dialog for searching and adding songs to a playlist */

import { useSongs } from '../hooks/useSongs'

interface SongSearchModalProps {
  open: boolean
  onClose: () => void
  onAdd: (songId: string) => void
  existingSongIds: Set<string>
}

export function SongSearchModal({ open, onClose, onAdd, existingSongIds }: SongSearchModalProps) {
  const { songs, loading, searchQuery, setSearchQuery } = useSongs()

  if (!open) return null

  function handleAdd(songId: string) {
    onAdd(songId)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg mx-4 bg-[#171717] border border-[#2e2e2e] rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#242424]">
          <h2 className="text-base font-medium text-[#fafafa]">Add Song</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[#898989] hover:text-[#fafafa] transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-[#242424]">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title or artist..."
            className="w-full px-3 py-2 text-sm rounded-lg bg-[#0f0f0f] border border-[#2e2e2e] text-[#fafafa] placeholder:text-[#898989] focus:outline-none focus:border-[#3ecf8e] transition-colors"
            autoFocus
          />
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {loading && (
            <div className="px-4 py-8 text-center text-[#898989] text-sm">Searching...</div>
          )}

          {!loading && songs.length === 0 && (
            <div className="px-4 py-8 text-center text-[#898989] text-sm">
              {searchQuery ? 'No songs found' : 'Type to search for songs'}
            </div>
          )}

          {!loading && songs.map((song) => {
            const isAdded = existingSongIds.has(song.id)
            return (
              <div
                key={song.id}
                className="flex items-center justify-between px-4 py-3 border-b border-[#242424] last:border-b-0 hover:bg-[#1a1a1a] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#fafafa] truncate">
                    {song.title}
                  </div>
                  <div className="text-xs text-[#898989] truncate">
                    {song.artist || 'Unknown Artist'} · Key of {song.original_key}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => isAdded ? undefined : handleAdd(song.id)}
                  disabled={isAdded}
                  className={`ml-3 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    isAdded
                      ? 'bg-[#242424] text-[#898989] border border-[#2e2e2e] cursor-not-allowed'
                      : 'bg-[#3ecf8e] text-[#0f0f0f] hover:bg-[#2db87a]'
                  }`}
                >
                  {isAdded ? 'Added' : 'Add'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
