/** SongDetail — single song detail view with chord chart, transpose, edit/delete actions */

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSong } from '../hooks/useSong'
import { useSongs } from '../hooks/useSongs'
import { ChordDisplay } from '../components/ChordDisplay'
import { TransposeControls } from '../components/TransposeControls'
import type { Song } from '../types/database'

interface SongDetailProps {
  /** When provided, skips fetching and uses this song directly (inline mode) */
  song?: Song
}

/** Delete confirmation modal */
function DeleteConfirmModal({
  songTitle,
  onConfirm,
  onClose,
}: {
  songTitle: string
  onConfirm: () => void
  onClose: () => void
}) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    onConfirm()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[#171717] border border-[#2e2e2e] rounded-lg w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4">
          <h3 className="text-sm font-medium text-[#fafafa] mb-2">Delete Song</h3>
          <p className="text-sm text-[#b4b4b4]">
            Are you sure you want to delete <strong className="text-[#fafafa]">{songTitle}</strong>?
            This action cannot be undone.
          </p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#242424]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-[#2e2e2e] text-xs text-[#b4b4b4] hover:text-[#fafafa] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-1.5 rounded-full bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Song Detail — works standalone (/songs/:id) or inline (passed song prop) */
export default function SongDetail({ song: songProp }: SongDetailProps) {
  const navigate = useNavigate()
  const { id: paramId } = useParams<{ id: string }>()
  const { song: fetchedSong, loading, error } = useSong(songProp ? undefined : paramId)
  const { deleteSong: deleteSongById, refresh } = useSongs()

  // Use prop if provided, otherwise use fetched song
  const song = songProp ?? fetchedSong

  const [transpose, setTranspose] = useState(0)
  const [useFlats, setUseFlats] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDelete = async () => {
    if (!song) return
    try {
      await deleteSongById(song.id)
      await refresh()
      navigate('/')
    } catch {
      // Error handled by modal state
    }
  }

  // Standalone mode loading/error states
  if (!songProp) {
    if (loading) {
      return (
        <div className="h-full flex items-center justify-center">
          <div className="text-[#898989] text-sm">Loading song...</div>
        </div>
      )
    }
    if (error || !song) {
      return (
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-400 text-sm mb-2">{error || 'Song not found'}</p>
            <button
              onClick={() => navigate('/')}
              className="text-[#3ecf8e] text-sm hover:underline"
            >
              Back to Library
            </button>
          </div>
        </div>
      )
    }
  }

  if (!song) return null

  return (
    <div className="h-full flex flex-col">
      {/* Header — title, artist, key, action buttons */}
      <div className="px-8 py-5 border-b border-[#2e2e2e]">
        <div className="flex items-start justify-between">
          <div>
            {!songProp && (
              <button
                onClick={() => navigate('/')}
                className="text-xs text-[#898989] hover:text-[#3ecf8e] transition-colors mb-1 block"
              >
                ← Back to Library
              </button>
            )}
            <h2 className="text-xl text-[#fafafa]">{song.title}</h2>
            <p className="text-sm text-[#b4b4b4] mt-0.5">
              {song.artist || 'Unknown artist'} · Key of {song.original_key}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/songs/${song.id}/edit`)}
              className="px-3 py-1.5 rounded border border-[#2e2e2e] text-xs text-[#b4b4b4] hover:text-[#fafafa] hover:border-[#363636] transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-3 py-1.5 rounded border border-red-900/50 text-xs text-red-400 hover:bg-red-900/20 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Transpose controls */}
        <div className="mt-4">
          <TransposeControls
            currentKey={song.original_key}
            transpose={transpose}
            useFlats={useFlats}
            onTransposeChange={setTranspose}
            onFlatsToggle={() => setUseFlats((f) => !f)}
          />
        </div>
      </div>

      {/* Chord chart */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <ChordDisplay
          sections={song.content_parsed.sections}
          transpose={transpose}
          useFlats={useFlats}
        />
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <DeleteConfirmModal
          songTitle={song.title}
          onConfirm={handleDelete}
          onClose={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  )
}
