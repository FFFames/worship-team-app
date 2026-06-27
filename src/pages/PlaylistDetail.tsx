/** PlaylistDetail — Single playlist management with song list, reorder, transpose, and actions
 *
 * Design system:
 * - Warm-tinted dark neutrals (OKLCH)
 * - Accent emerald used sparingly
 * - Balanced, breathable layouts
 * - Kanit display/body + Source Code Pro mono
 * - Exponential ease-out motion only
 */

import { useState, useCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { usePlaylist, usePlaylists } from '../hooks/usePlaylists'
import { SongSearchModal } from '../components/SongSearchModal'
import { transposeKey } from '../utils/transpose'
import type { PlaylistSong } from '../types/database'
import { motion } from 'framer-motion'

const easeOutExpo: [number, number, number, number] = [0.16, 1, 0.3, 1]

/** A small inline key-step button shared by desktop + mobile transpose rows */
function KeyStep({
  label,
  active,
  title,
  onClick,
}: {
  label: string
  active: boolean
  title: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        height: 28,
        minWidth: 28,
        padding: '0 6px',
        borderRadius: 'var(--radius-sm)',
        fontSize: '0.75rem',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: active ? '1px solid var(--accent-muted)' : '1px solid var(--border-subtle)',
        background: active ? 'var(--accent-bg)' : 'var(--bg-input)',
        color: active ? 'var(--accent)' : 'var(--fg-secondary)',
        cursor: 'pointer',
        transition: 'all var(--duration-fast) var(--ease-out)',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = 'var(--border-prominent)'
          e.currentTarget.style.color = 'var(--fg-primary)'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.borderColor = 'var(--border-subtle)'
          e.currentTarget.style.color = 'var(--fg-secondary)'
        }
      }}
    >
      {label}
    </button>
  )
}

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
  const [shareCopied, setShareCopied] = useState(false)

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

  async function handleShare() {
    if (!playlist) return
    const playlistUrl = new URL(`/playlists/${playlist.id}`, window.location.origin).toString()
    const shareData = {
      title: playlist.name,
      url: playlistUrl,
    }

    const copyPlaylistUrl = async () => {
      await navigator.clipboard.writeText(playlistUrl)
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 2000)
    }

    try {
      if (navigator.share) {
        await navigator.share(shareData)
        return
      }

      await copyPlaylistUrl()
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      try {
        await copyPlaylistUrl()
      } catch (copyError) {
        console.error('Failed to share playlist:', copyError)
      }
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
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.9375rem', marginBottom: 'var(--space-md)', color: 'var(--status-error-text)' }}>{error}</p>
          <button onClick={() => playlistData.refresh()} className="btn-secondary">
            ลองอีกครั้ง
          </button>
        </div>
      </div>
    )
  }

  if (!playlist) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: easeOutExpo }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-lg)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
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
                  className="input-field"
                  style={{ fontSize: '1.25rem', fontWeight: 500, maxWidth: 360 }}
                />
                <button onClick={handleNameSave} className="btn-primary" style={{ padding: 'var(--space-xs) var(--space-md)', fontSize: '0.8125rem' }}>
                  บันทึก
                </button>
                <button onClick={() => setEditingName(false)} className="btn-secondary" style={{ padding: 'var(--space-xs) var(--space-md)', fontSize: '0.8125rem' }}>
                  ยกเลิก
                </button>
              </div>
            ) : (
              <motion.h1
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  fontSize: 'clamp(1.5rem, 3vw, 2rem)',
                  fontWeight: 600,
                  color: 'var(--fg-primary)',
                  cursor: 'pointer',
                  transition: 'color 150ms var(--ease-out)',
                  fontFamily: 'var(--font-display)',
                  letterSpacing: '-0.02em',
                  margin: 0,
                }}
                onClick={() => { setNameDraft(playlist.name); setEditingName(true) }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-primary)' }}
                title="คลิกเพื่อแก้ไขชื่อ"
              >
                {playlist.name}
              </motion.h1>
            )}
            {playlist.notes && (
              <p style={{ fontSize: '0.9375rem', marginTop: 'var(--space-xs)', color: 'var(--fg-secondary)', margin: 0 }}>{playlist.notes}</p>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
            <button onClick={handleShare} className="btn-secondary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              {shareCopied ? 'คัดลอกลิงก์แล้ว' : 'แชร์'}
            </button>
            <button onClick={() => navigate(`/playlists/${playlistId}/stage`)} className="btn-secondary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              Stage
            </button>
            <button onClick={() => navigate(`/playlists/${playlistId}/pdf`)} className="btn-secondary">
              ส่งออก PDF
            </button>
            <button onClick={() => navigate(`/playlists/${playlistId}/present`)} className="btn-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              นำเสนอ
            </button>
          </div>
        </div>
      </motion.div>

      {/* Song list container */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05, ease: easeOutExpo }}
        className="surface"
        style={{ overflow: 'hidden' }}
      >
        {/* Song list header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-sm) var(--space-md)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <span className="section-label">{songs.length} เพลง</span>
          <button onClick={() => setSearchModalOpen(true)} className="chip-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            เพิ่มเพลง
          </button>
        </div>

        {/* Song list */}
        {songs.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4xl) var(--space-lg)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, margin: '0 auto var(--space-md)', borderRadius: 'var(--radius-lg)', background: 'var(--accent-bg)', border: '1px solid var(--accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 28, height: 28 }}>
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </div>
              <p style={{ fontSize: '0.9375rem', color: 'var(--fg-secondary)', margin: 0 }}>ยังไม่มีเพลงในเพลย์ลิสต์นี้</p>
              <button onClick={() => setSearchModalOpen(true)} className="btn-primary" style={{ marginTop: 'var(--space-md)' }}>
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
                  style={{
                    padding: 'var(--space-md)',
                    borderBottom: '1px solid var(--border-subtle)',
                    cursor: 'grab',
                    opacity: dragIndex === index ? 0.4 : 1,
                    transition: 'background var(--duration-fast) var(--ease-out), opacity var(--duration-fast) var(--ease-out)',
                  }}
                  onMouseEnter={(e) => { if (dragIndex === null) e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                  onMouseLeave={(e) => { if (dragIndex === null) e.currentTarget.style.background = 'transparent' }}
                >
                  {/* Top row: drag handle + position + song info + transpose + remove */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                    {/* Drag handle + position */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', width: 34, flexShrink: 0 }}>
                      <span style={{ fontSize: '0.875rem', cursor: 'grab', color: 'var(--fg-tertiary)', userSelect: 'none' }}>⠿</span>
                      <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--fg-tertiary)', fontWeight: 600 }}>{index + 1}</span>
                    </div>

                    {/* Song info */}
                    <Link
                      to={`/songs/${song.id}?fromPlaylist=${playlist.id}`}
                      style={{ flex: 1, minWidth: 0, textDecoration: 'none', borderRadius: 'var(--radius-sm)' }}
                      title={`เปิดเพลง ${song.title}`}
                    >
                      <div style={{ fontSize: '0.9375rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--fg-primary)', fontFamily: 'var(--font-display)', transition: 'color var(--duration-fast) var(--ease-out)' }}>
                        {song.title}
                      </div>
                      <div style={{ fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--fg-tertiary)' }}>
                        {song.artist || 'Unknown Artist'}
                      </div>
                    </Link>

                    {/* Desktop: inline transpose controls */}
                    <div className="hidden md:flex items-center gap-1" style={{ gap: 2 }}>
                      {TRANSPOSE_OFFSETS.map((offset) => {
                        const newTranspose = ps.transpose + offset
                        const isCurrent = offset === 0
                        const targetKey = transposeKey(song.original_key, newTranspose)
                        return (
                          <KeyStep
                            key={offset}
                            label={isCurrent ? targetKey : offset > 0 ? `+${offset}` : `${offset}`}
                            active={isCurrent}
                            title={isCurrent ? `คีย์: ${targetKey}` : `เปลี่ยนคีย์เป็น ${targetKey}`}
                            onClick={() => setTranspose(ps.id, newTranspose)}
                          />
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
                        className="icon-button"
                        style={{ width: 28, height: 28, opacity: index === 0 ? 0.3 : 1, cursor: index === 0 ? 'not-allowed' : 'pointer' }}
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
                        className="icon-button"
                        style={{ width: 28, height: 28, opacity: index === songs.length - 1 ? 0.3 : 1, cursor: index === songs.length - 1 ? 'not-allowed' : 'pointer' }}
                        title="เลื่อนลง"
                      >
                        ↓
                      </button>
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={() => removeSong(ps.id)}
                      className="icon-button"
                      style={{ width: 28, height: 28, color: 'var(--fg-tertiary)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--status-error-text)'; e.currentTarget.style.borderColor = 'var(--status-error-border)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-tertiary)'; e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
                      title="ลบออกจากเพลย์ลิสต์"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Mobile: transpose controls stacked below song info */}
                  <div className="flex md:hidden items-center gap-1 mt-2 ml-[34px]">
                    {TRANSPOSE_OFFSETS.map((offset) => {
                      const newTranspose = ps.transpose + offset
                      const isCurrent = offset === 0
                      const targetKey = transposeKey(song.original_key, newTranspose)
                      return (
                        <KeyStep
                          key={offset}
                          label={isCurrent ? targetKey : offset > 0 ? `+${offset}` : `${offset}`}
                          active={isCurrent}
                          title={isCurrent ? `คีย์: ${targetKey}` : `เปลี่ยนคีย์เป็น ${targetKey}`}
                          onClick={() => setTranspose(ps.id, newTranspose)}
                        />
                      )
                    })}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </motion.div>

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
