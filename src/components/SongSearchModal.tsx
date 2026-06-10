/** SongSearchModal — modal dialog for searching and adding songs to a playlist */

import { useSongs } from '../hooks/useSongs';

interface SongSearchModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (songId: string) => void;
  existingSongIds: Set<string>;
}

export function SongSearchModal({ open, onClose, onAdd, existingSongIds }: SongSearchModalProps) {
  const { songs, loading, searchQuery, setSearchQuery } = useSongs();

  if (!open) return null;

  function handleAdd(songId: string) {
    onAdd(songId);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg mx-4 bg-[var(--color-bg-page)] border border-[var(--color-border-standard)] rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)]">
          <h2 className="text-base font-medium text-[var(--color-text-primary)]">Add Song</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-[var(--color-border-subtle)]">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title or artist..."
              className="flex-1 px-3 py-2 text-sm rounded-lg bg-[var(--color-bg-deepest)] border border-[var(--color-border-standard)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
              autoFocus
            />
          </div>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {loading && (
            <div className="px-4 py-8 text-center text-[var(--color-text-muted)] text-sm">Searching...</div>
          )}

          {!loading && songs.length === 0 && (
            <div className="px-4 py-8 text-center text-[var(--color-text-muted)] text-sm">
              {searchQuery ? 'No songs found' : 'Type to search for songs'}
            </div>
          )}

          {!loading && songs.map((song) => {
            const isAdded = existingSongIds.has(song.id);
            return (
              <div
                key={song.id}
                className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)] last:border-b-0 hover:bg-[var(--color-bg-deepest)] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                    {song.title}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)] truncate">
                    {song.artist || 'Unknown Artist'} · Key: {song.original_key}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => isAdded ? undefined : handleAdd(song.id)}
                  disabled={isAdded}
                  className={`ml-3 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    isAdded
                      ? 'bg-[var(--color-bg-deepest)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] cursor-not-allowed'
                      : 'bg-[var(--color-accent)] text-[var(--color-bg-deepest)] hover:opacity-90'
                  }`}
                >
                  {isAdded ? 'Added' : 'Add'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
