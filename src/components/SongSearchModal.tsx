/** SongSearchModal — modal dialog for searching and adding songs to a playlist
 *
 * Uses CSS variable tokens (no hardcoded hex). Animated entrance via
 * Framer Motion; closes on backdrop click or Escape.
 */

import { useEffect } from 'react'
import { useSongs } from '../hooks/useSongs'
import { motion, AnimatePresence } from 'framer-motion'

const easeOutExpo: [number, number, number, number] = [0.16, 1, 0.3, 1]

interface SongSearchModalProps {
  open: boolean
  onClose: () => void
  onAdd: (songId: string) => void
  existingSongIds: Set<string>
}

export function SongSearchModal({ open, onClose, onAdd, existingSongIds }: SongSearchModalProps) {
  const { songs, loading, searchQuery, setSearchQuery } = useSongs()

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  function handleAdd(songId: string) {
    onAdd(songId)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: easeOutExpo }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'oklch(0 0 0 / 0.6)', backdropFilter: 'blur(3px)', padding: 'var(--space-md)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.25, ease: easeOutExpo }}
            className="w-full max-w-lg overflow-hidden"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-standard)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-float)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-md) var(--space-lg)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <h2 style={{ fontSize: '1.0625rem', fontWeight: 600, color: 'var(--fg-primary)', fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                Add Song
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid transparent',
                  background: 'transparent',
                  color: 'var(--fg-tertiary)',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  transition: 'all var(--duration-fast) var(--ease-out)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-tertiary)'
                  e.currentTarget.style.color = 'var(--fg-primary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--fg-tertiary)'
                }}
              >
                ✕
              </button>
            </div>

            {/* Search */}
            <div style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--border-subtle)' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title or artist..."
                className="input-field"
                style={{ fontSize: '0.9375rem' }}
                autoFocus
              />
            </div>

            {/* Results */}
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              {loading && (
                <div style={{ padding: 'var(--space-2xl) var(--space-lg)', textAlign: 'center', color: 'var(--fg-tertiary)', fontSize: '0.875rem' }}>
                  Searching...
                </div>
              )}

              {!loading && songs.length === 0 && (
                <div style={{ padding: 'var(--space-2xl) var(--space-lg)', textAlign: 'center', color: 'var(--fg-tertiary)', fontSize: '0.875rem' }}>
                  {searchQuery ? 'No songs found' : 'Type to search for songs'}
                </div>
              )}

              {!loading &&
                songs.map((song) => {
                  const isAdded = existingSongIds.has(song.id)
                  return (
                    <div
                      key={song.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 'var(--space-md)',
                        padding: 'var(--space-sm) var(--space-lg)',
                        borderBottom: '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        transition: 'background var(--duration-fast) var(--ease-out)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.9375rem', fontWeight: 500, color: 'var(--fg-primary)', fontFamily: 'var(--font-display)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {song.title}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--fg-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {song.artist || 'Unknown Artist'} · Key of {song.original_key}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => (isAdded ? undefined : handleAdd(song.id))}
                        disabled={isAdded}
                        style={{
                          flexShrink: 0,
                          padding: 'var(--space-xs) var(--space-md)',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          fontFamily: 'var(--font-display)',
                          borderRadius: 'var(--radius-full)',
                          cursor: isAdded ? 'not-allowed' : 'pointer',
                          border: isAdded ? '1px solid var(--border-subtle)' : '1px solid var(--accent)',
                          background: isAdded ? 'var(--bg-tertiary)' : 'var(--accent)',
                          color: isAdded ? 'var(--fg-tertiary)' : 'oklch(0.18 0.02 156)',
                          transition: 'all var(--duration-fast) var(--ease-out)',
                        }}
                      >
                        {isAdded ? 'Added' : 'Add'}
                      </button>
                    </div>
                  )
                })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
