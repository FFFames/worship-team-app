/** SongDetail — single song view with chord display, transpose, edit/delete, and add-to-playlist */

import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSong, useSongs } from '../hooks/useSongs';
import { usePlaylists } from '../hooks/usePlaylists';
import { usePlaylist } from '../hooks/usePlaylists';
import ChordDisplay from '../components/ChordDisplay';
import TransposeControls from '../components/TransposeControls';

/** Modal for selecting a playlist to add the song to */
function AddToPlaylistModal({
  songId,
  onClose,
}: {
  songId: string;
  onClose: () => void;
}) {
  const { playlists, loading } = usePlaylists();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use usePlaylist for the selected playlist so we can call addSong
  const playlistHook = usePlaylist(selectedPlaylistId ?? undefined);
  // We can't call hooks conditionally, so we use the hook always and just use its methods
  // when selectedPlaylistId is set

  const handleAdd = async () => {
    if (!selectedPlaylistId) return;
    setAdding(true);
    setError(null);
    try {
      await playlistHook.addSong(songId);
      setSuccess(true);
      setTimeout(() => onClose(), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add song');
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[#171717] border border-[#2e2e2e] rounded-lg w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#242424]">
          <h3 className="text-sm font-medium text-[#fafafa]">Add to Playlist</h3>
          <button onClick={onClose} className="text-[#898989] hover:text-[#fafafa] transition-colors text-lg">
            ×
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto p-2">
          {loading && (
            <div className="p-4 text-center text-[#898989] text-sm">Loading playlists...</div>
          )}
          {!loading && playlists.length === 0 && (
            <div className="p-4 text-center text-[#898989] text-sm">No playlists yet</div>
          )}
          {playlists.map((pl) => (
            <button
              key={pl.id}
              onClick={() => setSelectedPlaylistId(pl.id)}
              className={`w-full text-left px-4 py-2.5 rounded text-sm transition-colors ${
                selectedPlaylistId === pl.id
                  ? 'bg-[#3ecf8e]/10 text-[#3ecf8e] border border-[#3ecf8e]/30'
                  : 'text-[#b4b4b4] hover:bg-[#242424]'
              }`}
            >
              {pl.name}
              {pl.description && (
                <span className="ml-2 text-xs text-[#898989]">{pl.description}</span>
              )}
            </button>
          ))}
        </div>
        {error && (
          <div className="px-5 py-2 text-red-400 text-xs">{error}</div>
        )}
        {success && (
          <div className="px-5 py-2 text-[#3ecf8e] text-xs">Song added!</div>
        )}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#242424]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-[#2e2e2e] text-xs text-[#b4b4b4] hover:text-[#fafafa] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!selectedPlaylistId || adding || success}
            className="px-4 py-1.5 rounded-full bg-[#3ecf8e] text-[#0f0f0f] text-xs font-medium hover:bg-[#2db87a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {adding ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Delete confirmation modal */
function DeleteConfirmModal({
  songTitle,
  onConfirm,
  onClose,
}: {
  songTitle: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    onConfirm();
  };

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
  );
}

/** Song Detail page — shows a single song with chord chart and actions */
export default function SongDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { song, loading, error, deleteSong } = useSong(id);
  const { refresh } = useSongs();

  const [transpose, setTranspose] = useState(0);
  const [useFlats, setUseFlats] = useState(false);
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteSong();
      await refresh();
      navigate('/');
    } catch {
      // Error handled by modal state
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0f0f0f]">
        <div className="text-[#898989] text-sm">Loading song...</div>
      </div>
    );
  }

  if (error || !song) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0f0f0f]">
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
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#0f0f0f]">
      {/* Header */}
      <header className="px-6 py-4 border-b border-[#242424]">
        <div className="flex items-start justify-between">
          <div>
            <button
              onClick={() => navigate('/')}
              className="text-xs text-[#898989] hover:text-[#3ecf8e] transition-colors mb-1"
            >
              ← Back to Library
            </button>
            <h1 className="text-xl font-medium text-[#fafafa]">{song.title}</h1>
            {song.artist && (
              <p className="text-sm text-[#b4b4b4] mt-0.5">{song.artist}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddToPlaylist(true)}
              className="px-3 py-1.5 rounded border border-[#2e2e2e] text-xs text-[#b4b4b4] hover:text-[#fafafa] hover:border-[#3ecf8e] transition-colors"
            >
              + Add to Playlist
            </button>
            <button
              onClick={() => navigate(`/songs/${song.id}/edit`)}
              className="px-3 py-1.5 rounded border border-[#2e2e2e] text-xs text-[#b4b4b4] hover:text-[#fafafa] hover:border-[#3ecf8e] transition-colors"
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
        <div className="mt-3">
          <TransposeControls
            originalKey={song.original_key}
            transpose={transpose}
            useFlats={useFlats}
            onTransposeChange={setTranspose}
            onFlatsChange={setUseFlats}
          />
        </div>
      </header>

      {/* Chord chart */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <ChordDisplay
          content={song.content_parsed}
          transpose={transpose}
          useFlats={useFlats}
        />
      </div>

      {/* Modals */}
      {showAddToPlaylist && (
        <AddToPlaylistModal songId={song.id} onClose={() => setShowAddToPlaylist(false)} />
      )}
      {showDeleteConfirm && (
        <DeleteConfirmModal
          songTitle={song.title}
          onConfirm={handleDelete}
          onClose={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
