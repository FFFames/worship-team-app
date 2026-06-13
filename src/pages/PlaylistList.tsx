/** PlaylistList — Grid layout of playlist cards
 *
 * Matches SongLibrary layout: page header + filter bar (search + sort) + grid
 *
 * Design system:
 * - Dark theme with warm-tinted neutrals (OKLCH)
 * - Accent: warm emerald green used ≤10% of surface
 * - Balanced, centered layouts (NEVER left-leaning)
 * - Kanit font for display/body, Source Code Pro for chords
 * - Exponential ease-out motion curves only
 */

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlaylists } from '../hooks/usePlaylists'
import { PlaylistCard } from '../components/PlaylistCard'
import { motion, AnimatePresence } from 'framer-motion'
import type { Playlist } from '../types/database'

const easeOutExpo: [number, number, number, number] = [0.16, 1, 0.3, 1]

export default function PlaylistList() {
  const { playlists, loading, error, createPlaylist, deletePlaylist } = usePlaylists()
  const navigate = useNavigate()

  const [sortBy, setSortBy] = useState('updated')
  const [searchQuery, setSearchQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<Playlist | null>(null)

  // Filter playlists by search and sort
  const filteredPlaylists = useMemo(() => {
    let result = [...playlists]

    // Apply search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.notes && p.notes.toLowerCase().includes(q))
      )
    }

    // Apply sorting
    result.sort((a, b) => {
      if (sortBy === 'updated') {
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      }
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name, 'th')
      }
      if (sortBy === 'created') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      return 0
    })

    return result
  }, [playlists, searchQuery, sortBy])

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

  async function handleDelete() {
    if (!confirmDelete) return
    try {
      await deletePlaylist(confirmDelete.id)
      setConfirmDelete(null)
    } catch (err) {
      console.error('Failed to delete playlist:', err)
    }
  }

  return (
    <div className="min-h-screen">
      {/* Page header */}
      <div className="page-header">
        <div className="page-title">
          <h1>เพลย์ลิสต์</h1>
          <p>จัดระเบียบเพลงของคุณเป็นเซ็ตลิสต์สำหรับแสดงหรือซ้อม</p>
        </div>
        <div className="page-actions">
          <button onClick={() => setCreating(true)} className="btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            สร้างเพลย์ลิสต์
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        {/* Search box */}
        <div className="search-box">
          <div className="search-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
          <input
            type="text"
            className="search-input"
            placeholder="ค้นหาเพลย์ลิสต์..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Sort dropdown */}
        <select
          className="sort-dropdown"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="updated">เรียงตาม: ล่าสุด</option>
          <option value="name">เรียงตาม: ชื่อ A-Z</option>
          <option value="created">เรียงตาม: วันที่สร้าง</option>
        </select>
      </div>

      {/* Inline create input */}
      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 'var(--space-xl)' }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.2, ease: easeOutExpo }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                  if (e.key === 'Escape') { setCreating(false); setNewName('') }
                }}
                placeholder="ชื่อเพลย์ลิสต์..."
                autoFocus
                className="input-field"
                style={{ flex: 1 }}
              />
              <button onClick={handleCreate} className="btn-primary" style={{ whiteSpace: 'nowrap' }}>
                สร้าง
              </button>
              <button onClick={() => { setCreating(false); setNewName('') }} className="btn-secondary" style={{ whiteSpace: 'nowrap' }}>
                ยกเลิก
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading state */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-3xl) 0' }}>
          <div className="spinner" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-3xl) 0' }}>
          <p style={{ color: 'var(--status-error-text)' }}>{error}</p>
        </div>
      )}

      {/* Playlists grid */}
      {!loading && !error && filteredPlaylists.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, ease: easeOutExpo }}
          className="songs-grid"
        >
          {filteredPlaylists.map((playlist) => (
            <PlaylistCard
              key={playlist.id}
              playlist={playlist}
              onDelete={setConfirmDelete}
            />
          ))}
        </motion.div>
      )}

      {/* Empty state */}
      {!loading && !error && filteredPlaylists.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 32, height: 32 }}>
              <line x1="8" y1="6" x2="21" y2="6"/>
              <line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/>
              <line x1="3" y1="12" x2="3.01" y2="12"/>
              <line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          </div>
          <h2>ยังไม่มีเพลย์ลิสต์</h2>
          <p>สร้างเพลย์ลิสต์แรกเพื่อจัดระเบียบเพลงของคุณ</p>
          <button onClick={() => setCreating(true)} className="btn-primary">สร้างเพลย์ลิสต์</button>
        </div>
      )}

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {confirmDelete && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-30"
              style={{ background: 'oklch(0 0 0 / 0.6)' }}
              onClick={() => setConfirmDelete(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2, ease: easeOutExpo }}
              className="fixed z-40 left-1/2 top-1/2"
              style={{
                transform: 'translate(-50%, -50%)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-xl)',
                maxWidth: 400,
                width: 'calc(100% - 2rem)',
                boxShadow: 'var(--shadow-elevated)',
              }}
            >
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.125rem', marginBottom: 'var(--space-sm)' }}>
                ลบเพลย์ลิสต์?
              </h3>
              <p style={{ fontSize: '0.9375rem', color: 'var(--fg-secondary)', marginBottom: 'var(--space-lg)' }}>
                คุณแน่ใจหรือไม่ว่าต้องการลบ "{confirmDelete.name}"? การกระทำนี้ไม่สามารถย้อนกลับได้
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
                <button onClick={() => setConfirmDelete(null)} className="btn-secondary">
                  ยกเลิก
                </button>
                <button
                  onClick={handleDelete}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 'var(--space-sm)',
                    padding: 'var(--space-md) var(--space-xl)',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 500,
                    fontSize: '1rem',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--status-error-text)',
                    color: 'var(--fg-primary)',
                    cursor: 'pointer',
                    transition: 'all var(--duration-normal) var(--ease-out)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ลบ
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
