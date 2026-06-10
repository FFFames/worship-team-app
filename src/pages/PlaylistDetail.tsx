/** PlaylistDetail — single playlist management with song list, reorder, transpose, and actions */

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlaylist } from '../hooks/usePlaylist'
import { usePlaylists } from '../hooks/usePlaylists'
import { SongSearchModal } from '../components/SongSearchModal'
import { transposeKey } from '../utils/transpose'
import type { PlaylistSong } from '../types/database'

interface PlaylistDetailProps {
  playlistId: string
  playlistData: ReturnType<typeof usePlaylist>
  onPlaylistDeleted?: () => void
}

export default function PlaylistDetail({ playlistId, playlistData, onPlaylistDeleted }: PlaylistDetailProps) {
  const navigate = useNavigate()
  const { updatePlaylist } = usePlaylists()
  const { playlist, songs, loading, error, addSong, removeSong, reorderSongs, setTranspose } = playlistData

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  // Per-song quick transpose offsets (-2, -1, 0, +1, +2)
  const TRANSPOSE_OFFSETS = [-2, -1, 0, 1, 2]

  // Suppress unused prop warning — used by parent for post-delete cleanup
  void onPlaylistDeleted

  // Build set of song IDs already in the playlist
  const existingSongIds = new Set(songs.map((ps) => ps.song_id))

  // Editable playlist name
  async function handleNameSave() {
    const name = nameDraft.trim()
    if (!name || !playlist) return
    try {
      await updatePlaylist(playlistId, { name })
      setEditingName(false)
    } catch (err) {
      console.error('Failed to update name:', err)
    }
  }

  // Drag-and-drop reorder handlers
  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback(async (dropIndex: number) => {
    if (dragIndex === null || dragIndex === dropIndex) return
    const reordered = [...songs]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(dropIndex, 0, moved)
    setDragIndex(null)
    // Update positions via hook
    const orderedIds = reordered.map((ps) => ps.song_id)
    await reorderSongs(orderedIds)
  }, [dragIndex, songs, reorderSongs])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#2e2e2e] border-t-[#3ecf8e] rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => playlistData.refresh()}
            className="mt-3 px-3 py-1.5 text-xs rounded-md border border-[#2e2e2e] text-[#b4b4b4] hover:text-[#fafafa] transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!playlist) return null

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#2e2e2e]">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {/* Editable name */}
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNameSave()
                    if (e.key === 'Escape') setEditingName(false)
                  }}
                  autoFocus
                  className="text-xl font-medium text-[#fafafa] bg-[#1a1a1a] border border-[#3ecf8e] rounded-md px-2 py-0.5 outline-none"
                />
                <button
                  onClick={handleNameSave}
                  className="px-2 py-1 text-xs rounded-md bg-[#3ecf8e] text-[#0f0f0f] font-medium hover:bg-[#2db87a] transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="px-2 py-1 text-xs rounded-md border border-[#2e2e2e] text-[#b4b4b4] hover:text-[#fafafa] transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <h2
                className="text-xl font-medium text-[#fafafa] cursor-pointer hover:text-[#3ecf8e] transition-colors"
                onClick={() => { setNameDraft(playlist.name); setEditingName(true) }}
                title="Click to edit name"
              >
                {playlist.name}
              </h2>
            )}
            {playlist.description && (
              <p className="text-sm text-[#b4b4b4] mt-0.5">{playlist.description}</p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 ml-4">
            <button
              onClick={() => navigate(`/playlists/${playlistId}/stage`)}
              className="px-3 py-1.5 rounded-md border border-[#2e2e2e] text-xs text-[#b4b4b4] hover:text-[#fafafa] hover:border-[#363636] transition-colors"
            >
              Stage
            </button>
            <button
              onClick={() => navigate(`/playlists/${playlistId}/pdf`)}
              className="px-3 py-1.5 rounded-md border border-[#2e2e2e] text-xs text-[#b4b4b4] hover:text-[#fafafa] hover:border-[#363636] transition-colors"
            >
              Export PDF
            </button>
            <button
              onClick={() => navigate(`/playlists/${playlistId}/present`)}
              className="px-3 py-1.5 rounded-full bg-[#3ecf8e] text-[#0f0f0f] text-xs font-medium hover:bg-[#2db87a] transition-colors"
            >
              Present
            </button>
          </div>
        </div>
      </div>

      {/* Song list header */}
      <div className="px-6 py-3 border-b border-[#2e2e2e] flex items-center justify-between bg-[#141414]">
        <span className="text-xs font-medium text-[#898989] uppercase tracking-wider">
          {songs.length} Song{songs.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => setSearchModalOpen(true)}
          className="px-3 py-1.5 rounded-md border border-[#2e2e2e] text-xs text-[#b4b4b4] hover:text-[#fafafa] hover:border-[#3ecf8e] transition-colors"
        >
          + Add Song
        </button>
      </div>

      {/* Song list */}
      <div className="flex-1 overflow-y-auto">
        {songs.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="text-3xl mb-2">🎼</div>
              <p className="text-[#898989] text-sm">No songs in this playlist yet</p>
              <button
                onClick={() => setSearchModalOpen(true)}
                className="mt-3 px-3 py-1.5 rounded-full bg-[#3ecf8e] text-[#0f0f0f] text-xs font-medium hover:bg-[#2db87a] transition-colors"
              >
                + Add Song
              </button>
            </div>
          </div>
        ) : (
          <div>
            {songs.map((ps: PlaylistSong, index: number) => {
              const song = ps.song
              if (!song) return null

              return (
                <div
                  key={ps.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(index)}
                  className={`flex items-center gap-3 px-6 py-3 border-b border-[#1e1e1e] transition-colors group ${
                    dragIndex === index ? 'opacity-50' : 'hover:bg-[#1a1a1a]'
                  }`}
                >
                  {/* Drag handle + position */}
                  <div className="flex items-center gap-2 w-8 shrink-0">
                    <span className="text-[#898989] text-xs cursor-grab active:cursor-grabbing select-none">⠿</span>
                    <span className="text-xs text-[#898989] font-mono">{index + 1}</span>
                  </div>

                  {/* Song info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#fafafa] truncate">
                      {song.title}
                    </div>
                    <div className="text-xs text-[#898989] truncate">
                      {song.artist || 'Unknown Artist'}
                    </div>
                  </div>

                  {/* Per-song transpose controls */}
                  <div className="flex items-center gap-1">
                    {TRANSPOSE_OFFSETS.map((offset) => {
                      const newTranspose = ps.transpose_semitones + offset
                      const isCurrent = offset === 0
                      const targetKey = transposeKey(song.original_key, newTranspose)

                      return (
                        <button
                          key={offset}
                          onClick={() => setTranspose(ps.id, newTranspose)}
                          className={`w-7 h-7 rounded-md text-xs font-mono font-medium flex items-center justify-center transition-colors ${
                            isCurrent
                              ? 'border border-[rgba(62,207,142,0.3)] bg-[rgba(62,207,142,0.15)] text-[#3ecf8e]'
                              : 'border border-[#2e2e2e] bg-[#242424] text-[#b4b4b4] hover:bg-[#2e2e2e] hover:text-[#fafafa]'
                          }`}
                          title={isCurrent ? `Key: ${targetKey}` : `Transpose to ${targetKey}`}
                        >
                          {isCurrent ? targetKey : (offset > 0 ? `+${offset}` : `${offset}`)}
                        </button>
                      )
                    })}
                  </div>

                  {/* Remove button */}
                  <button
                    onClick={() => removeSong(ps.id)}
                    className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-md flex items-center justify-center text-[#898989] hover:text-red-400 hover:bg-red-400/10 transition-all"
                    title="Remove from playlist"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Song search modal */}
      <SongSearchModal
        open={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onAdd={async (songId) => {
          await addSong(songId)
        }}
        existingSongIds={existingSongIds}
      />
    </div>
  )
}
