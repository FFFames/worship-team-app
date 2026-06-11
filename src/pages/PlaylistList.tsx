/** PlaylistList — playlist management page with sidebar list and inline detail view */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlaylists } from '../hooks/usePlaylists'

export default function PlaylistList() {
  const { playlists, loading, error, createPlaylist, deletePlaylist } = usePlaylists()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  async function handleCreate() {
    const name = newName.trim()
    if (!name) return
    try {
      const pl = await createPlaylist(name)
      setNewName('')
      setCreating(false)
      navigate(`/playlists/${pl.id}`)
    } catch (err) {
      console.error('Failed to create playlist:', err)
    }
  }

  async function handleDelete(id: string) {
    try {
      await deletePlaylist(id)
      setConfirmDeleteId(null)
    } catch (err) {
      console.error('Failed to delete playlist:', err)
    }
  }

  return (
    <div className="flex h-full">
      {/* Left sidebar — playlist list */}
      <div className="w-80 flex-shrink-0 bg-[#141414] border-r border-[#2e2e2e] flex flex-col">
        {/* Header */}
        <div className="px-4 py-4 border-b border-[#2e2e2e] flex items-center justify-between">
          <span className="text-[13px] font-medium text-[#898989] uppercase tracking-wider">
            {loading ? 'Loading...' : `${playlists.length} Playlist${playlists.length !== 1 ? 's' : ''}`}
          </span>
          <button
            onClick={() => setCreating(true)}
            className="w-7 h-7 rounded-md border border-[#2e2e2e] text-[#b4b4b4] text-sm flex items-center justify-center hover:bg-[#242424] transition-colors"
            title="New Playlist"
          >
            +
          </button>
        </div>

        {/* Inline create input */}
        {creating && (
          <div className="px-4 py-3 border-b border-[#2e2e2e]">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') { setCreating(false); setNewName('') }
              }}
              placeholder="Playlist name..."
              autoFocus
              className="w-full px-2.5 py-1.5 text-sm bg-[#1a1a1a] border border-[#3ecf8e] rounded-md text-[#fafafa] placeholder:text-[#898989] outline-none"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleCreate}
                className="px-3 py-1 text-xs font-medium rounded-full bg-[#3ecf8e] text-[#0f0f0f] hover:bg-[#2db87a] transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => { setCreating(false); setNewName('') }}
                className="px-3 py-1 text-xs font-medium rounded-md border border-[#2e2e2e] text-[#b4b4b4] hover:text-[#fafafa] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Playlist list */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="px-4 py-3 text-center text-red-400 text-sm">{error}</div>
          )}

          {!loading && !error && playlists.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-[#898989]">
              No playlists yet. Create one to get started.
            </div>
          )}

          {playlists.map((pl) => {
            const isConfirming = pl.id === confirmDeleteId

            return (
              <div
                key={pl.id}
                className={`border-b border-[#1e1e1e] border-l-2 border-l-transparent hover:bg-[#1a1a1a] transition-colors`}
              >
                <button
                  onClick={() => {
                    navigate(`/playlists/${pl.id}`)
                    setConfirmDeleteId(null)
                  }}
                  className="w-full text-left px-4 py-3 cursor-pointer"
                >
                  <div className="text-sm font-medium text-[#fafafa] truncate">
                    {pl.name}
                  </div>
                  <div className="text-xs text-[#898989] mt-0.5">
                    {pl.notes?.slice(0, 60) || 'No description'}
                  </div>
                </button>

                {/* Delete confirmation / button */}
                <div className="px-4 pb-2 flex justify-end">
                  {isConfirming ? (
                    <div className="flex gap-1.5 items-center">
                      <span className="text-xs text-red-400">Delete?</span>
                      <button
                        onClick={() => handleDelete(pl.id)}
                        className="px-2 py-0.5 text-xs rounded bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-0.5 text-xs rounded border border-[#2e2e2e] text-[#b4b4b4] hover:text-[#fafafa] transition-colors"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(pl.id)}
                      className="text-xs text-[#898989] hover:text-red-400 transition-colors"
                      title="Delete playlist"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right panel — empty state */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3">🎶</div>
          <p className="text-[#898989] text-sm">
            Select a playlist from the sidebar to manage it
          </p>
          <button
            onClick={() => setCreating(true)}
            className="mt-4 px-4 py-1.5 rounded-full bg-[#3ecf8e] text-[#0f0f0f] text-sm font-medium hover:bg-[#2db87a] transition-colors"
          >
            + New Playlist
          </button>
        </div>
      </div>
    </div>
  )
}
