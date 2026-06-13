/** PlaylistDetail — Single playlist management with song list, reorder, transpose, and actions
 *
 * Design system:
 * - Dark theme with warm-tinted neutrals (OKLCH)
 * - Accent: warm emerald green used ≤10% of surface
 * - Balanced, centered layouts (NEVER left-leaning)
 * - Kanit font for display/body, Source Code Pro for chords
 * - Exponential ease-out motion curves only
 */

import { useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePlaylist } from '../hooks/usePlaylists'
import { usePlaylists } from '../hooks/usePlaylists'
import { SongSearchModal } from '../components/SongSearchModal'
import { transposeKey } from '../utils/transpose'
import type { PlaylistSong } from '../types/database'
import { motion } from 'framer-motion'

const easeOutExpo: [number, number, number, number] = [0.16, 1, 0.3, 1]

export default function PlaylistDetail() {
  const { id: playlistId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const playlistData = usePlaylist(playlistId)
  const { updatePlaylist } = usePlaylists()
  const { playlist, songs, loading, error, addSong, removeSong, reorderSongs, setTranspose } = playlistData

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const TRANSPOSE_OFFSETS = [-2, -1, 0, 1, 2]

  const existingSongIds = new Set(songs.map((ps) => ps.song_id))

  async function handleNameSave() {
    const name = nameDraft.trim()
    if (!name || !playlist || !playlistId) return
    try {
      await updatePlaylist(playlistId, { name })
      setEditingName(false)
    } catch (err) {
      console.error('Failed to update name:', err)
    }
  }

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
    const orderedIds = reordered.map((ps) => ps.id)
    await reorderSongs(orderedIds)
  }, [dragIndex, songs, reorderSongs])

  if (loading) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.875rem', marginBottom: 'var(--space-sm)', color: 'var(--status-error-text)' }}>{error}</p>
          <button
            onClick={() => playlistData.refresh()}
            className="btn-secondary"
            style={{ padding: 'var(--space-sm) var(--space-md)', fontSize: '0.75rem' }}
          >
            ลองอีกครั้ง
          </button>
        </div>
      </div>
    )
  }

  if (!playlist) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg-primary)' }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: easeOutExpo }}
        style={{
          padding: 'var(--space-md) var(--space-lg)',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Editable name */}
            {editingName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNameSave()
                    if (e.key === 'Escape') setEditingName(false)
                  }}
                  autoFocus
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 500,
                    padding: 'var(--space-xs) var(--space-sm)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--accent)',
                    background: 'var(--bg-input)',
                    color: 'var(--fg-primary)',
                    fontFamily: 'var(--font-display)',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleNameSave}
                  className="btn-primary"
                  style={{ padding: 'var(--space-xs) var(--space-sm)', fontSize: '0.75rem' }}
                >
                  บันทึก
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="btn-secondary"
                  style={{ padding: 'var(--space-xs) var(--space-sm)', fontSize: '0.75rem' }}
                >
                  ยกเลิก
                </button>
              </div>
            ) : (
              <motion.h2
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 500,
                  color: 'var(--fg-primary)',
                  cursor: 'pointer',
                  transition: 'color 150ms var(--ease-out)',
                  fontFamily: 'var(--font-display)',
                  margin: 0,
                }}
                onClick={() => { setNameDraft(playlist.name); setEditingName(true) }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-primary)' }}
                title="คลิกเพื่อแก้ไขชื่อ"
              >
                {playlist.name}
              </motion.h2>
            )}
            {playlist.notes && (
              <p style={{ fontSize: '0.9375rem', marginTop: 'var(--space-xs)', color: 'var(--fg-secondary)', margin: 0 }}>{playlist.notes}</p>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', marginLeft: 'var(--space-md)' }}>
            <button
              onClick={() => navigate(`/playlists/${playlistId}/stage`)}
              className="btn-secondary"
              style={{ padding: 'var(--space-xs) var(--space-sm)', fontSize: '0.75rem' }}
            >
              Stage
            </button>
            <button
              onClick={() => navigate(`/playlists/${playlistId}/pdf`)}
              className="btn-secondary"
              style={{ padding: 'var(--space-xs) var(--space-sm)', fontSize: '0.75rem' }}
            >
              ส่งออก PDF
            </button>
            <button
              onClick={() => navigate(`/playlists/${playlistId}/present`)}
              className="btn-primary"
              style={{ padding: 'var(--space-xs) var(--space-sm)', fontSize: '0.75rem' }}
            >
              นำเสนอ
            </button>
          </div>
        </div>
      </motion.div>

      {/* Song list header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-sm) var(--space-lg)', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-tertiary)', fontFamily: 'var(--font-display)' }}>
          {songs.length} เพลง
        </span>
        <button
          onClick={() => setSearchModalOpen(true)}
          className="btn-secondary"
          style={{ padding: 'var(--space-xs) var(--space-sm)', fontSize: '0.75rem' }}
        >
          + เพิ่มเพลง
        </button>
      </div>

      {/* Song list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {songs.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4xl) 0' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: 'var(--space-sm)' }}>🎼</div>
              <p style={{ fontSize: '0.9375rem', color: 'var(--fg-secondary)' }}>ยังไม่มีเพลงในเพลย์ลิสต์นี้</p>
              <button
                onClick={() => setSearchModalOpen(true)}
                className="btn-primary"
                style={{ marginTop: 'var(--space-md)', padding: 'var(--space-sm) var(--space-md)', fontSize: '0.875rem' }}
              >
                + เพิ่มเพลง
              </button>
            </div>
          </div>
        ) : (
          <div>
            {songs.map((ps: PlaylistSong, index: number) => {
              const song = ps.song
              if (!song) return null

              return (
                <motion.div
                  key={ps.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03, ease: easeOutExpo }}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(index)}
                  className={`transition-colors group ${dragIndex === index ? 'opacity-50' : ''}`}
                  style={{
                    padding: 'var(--space-md) var(--space-lg)',
                    borderBottom: '1px solid var(--border-subtle)',
                    cursor: 'grab',
                  }}
                  onMouseEnter={(e) => { if (dragIndex === null) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                  onMouseLeave={(e) => { if (dragIndex === null) e.currentTarget.style.background = 'transparent' }}
                >
                  {/* Top row: drag handle + position + song info + mobile reorder + remove */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                    {/* Drag handle + position */}
                    <div className="hidden md:flex items-center gap-2 w-8 shrink-0" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', width: 32, flexShrink: 0 }}>
                      <span style={{ fontSize: '0.75rem', cursor: 'grab', color: 'var(--fg-tertiary)', userSelect: 'none' }}>⠿</span>
                      <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--fg-tertiary)' }}>{index + 1}</span>
                    </div>

                    {/* Position number on mobile */}
                    <span className="md:hidden" style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', width: 20, flexShrink: 0, color: 'var(--fg-tertiary)' }}>{index + 1}</span>

                    {/* Song info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.9375rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--fg-primary)', fontFamily: 'var(--font-display)' }}>
                        {song.title}
                      </div>
                      <div style={{ fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--fg-tertiary)' }}>
                        {song.artist || 'Unknown Artist'}
                      </div>
                    </div>

                    {/* Desktop: inline transpose controls */}
                    <div className="hidden md:flex items-center gap-1" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      {TRANSPOSE_OFFSETS.map((offset) => {
                        const newTranspose = ps.transpose + offset
                        const isCurrent = offset === 0
                        const targetKey = transposeKey(song.original_key, newTranspose)

                        return (
                          <button
                            key={offset}
                            onClick={() => setTranspose(ps.id, newTranspose)}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '0.75rem',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 500,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: isCurrent ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                              background: isCurrent ? 'var(--accent-bg)' : 'var(--bg-input)',
                              color: isCurrent ? 'var(--accent)' : 'var(--fg-secondary)',
                              cursor: 'pointer',
                              transition: 'all 200ms var(--ease-out)',
                            }}
                            title={isCurrent ? `คีย์: ${targetKey}` : `เปลี่ยนคีย์เป็น ${targetKey}`}
                          >
                            {isCurrent ? targetKey : (offset > 0 ? `+${offset}` : `${offset}`)}
                          </button>
                        )
                      })}
                    </div>

                    {/* Mobile: up/down reorder buttons */}
                    <div className="flex md:hidden items-center gap-1 shrink-0">
                      <button
                        onClick={async () => {
                          if (index === 0) return
                          const reordered = [...songs]
                          const [moved] = reordered.splice(index, 1)
                          reordered.splice(index - 1, 0, moved)
                          const orderedIds = reordered.map((p) => p.id)
                          await reorderSongs(orderedIds)
                        }}
                        disabled={index === 0}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-input)',
                          color: 'var(--fg-secondary)',
                          opacity: index === 0 ? 0.3 : 1,
                          cursor: index === 0 ? 'not-allowed' : 'pointer',
                          transition: 'all 200ms var(--ease-out)',
                        }}
                        title="เลื่อนขึ้น"
                      >
                        ↑
                      </button>
                      <button
                        onClick={async () => {
                          if (index === songs.length - 1) return
                          const reordered = [...songs]
                          const [moved] = reordered.splice(index, 1)
                          reordered.splice(index + 1, 0, moved)
                          const orderedIds = reordered.map((p) => p.id)
                          await reorderSongs(orderedIds)
                        }}
                        disabled={index === songs.length - 1}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-input)',
                          color: 'var(--fg-secondary)',
                          opacity: index === songs.length - 1 ? 0.3 : 1,
                          cursor: index === songs.length - 1 ? 'not-allowed' : 'pointer',
                          transition: 'all 200ms var(--ease-out)',
                        }}
                        title="เลื่อนลง"
                      >
                        ↓
                      </button>
                    </div>

                    {/* Remove button — always visible on mobile, hover-only on desktop */}
                    <button
                      onClick={() => removeSong(ps.id)}
                      className="opacity-100 md:opacity-0 md:group-hover:opacity-100"
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: 'var(--fg-tertiary)',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 200ms var(--ease-out)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--status-error-text)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-tertiary)' }}
                      title="ลบออกจากเพลย์ลิสต์"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Mobile: transpose controls stacked below song info */}
                  <div className="flex md:hidden items-center gap-1 mt-2 ml-8">
                    {TRANSPOSE_OFFSETS.map((offset) => {
                      const newTranspose = ps.transpose + offset
                      const isCurrent = offset === 0
                      const targetKey = transposeKey(song.original_key, newTranspose)

                      return (
                        <button
                          key={offset}
                          onClick={() => setTranspose(ps.id, newTranspose)}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.75rem',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: isCurrent ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                            background: isCurrent ? 'var(--accent-bg)' : 'var(--bg-input)',
                            color: isCurrent ? 'var(--accent)' : 'var(--fg-secondary)',
                            cursor: 'pointer',
                            transition: 'all 200ms var(--ease-out)',
                          }}
                          title={isCurrent ? `คีย์: ${targetKey}` : `เปลี่ยนคีย์เป็น ${targetKey}`}
                        >
                          {isCurrent ? targetKey : (offset > 0 ? `+${offset}` : `${offset}`)}
                        </button>
                      )
                    })}
                  </div>
                </motion.div>
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
