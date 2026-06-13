/** PlaylistList — Playlist management page with sidebar list and inline detail view
 *
 * Design system:
 * - Dark theme with warm-tinted neutrals (OKLCH)
 * - Accent: warm emerald green used ≤10% of surface
 * - Balanced, centered layouts (NEVER left-leaning)
 * - Kanit font for display/body, Source Code Pro for chords
 * - Exponential ease-out motion curves only
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlaylists } from '../hooks/usePlaylists'
import { motion, AnimatePresence } from 'framer-motion'

const easeOutExpo: [number, number, number, number] = [0.16, 1, 0.3, 1]

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
    <div className="flex flex-col md:flex-row h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* ── Mobile: Full-width playlist card list (< md) ── */}
      <div className="flex-1 flex flex-col md:hidden">
        {/* Mobile header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-tertiary)', fontFamily: 'var(--font-display)' }}>
            {loading ? 'กำลังโหลด...' : `${playlists.length} เพลย์ลิสต์`}
          </span>
          <button
            onClick={() => setCreating(true)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-sm)',
              fontSize: '1.125rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border-subtle)',
              color: 'var(--fg-secondary)',
              background: 'transparent',
              cursor: 'pointer',
              transition: 'all 200ms var(--ease-out)',
            }}
            title="เพิ่มเพลย์ลิสต์"
          >
            +
          </button>
        </div>

        {/* Mobile inline create input */}
        <AnimatePresence>
          {creating && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: easeOutExpo }}
              style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--border-subtle)', overflow: 'hidden' }}
            >
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
              />
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                <button
                  onClick={handleCreate}
                  className="btn-primary"
                  style={{ padding: 'var(--space-xs) var(--space-md)', fontSize: '0.75rem' }}
                >
                  สร้าง
                </button>
                <button
                  onClick={() => { setCreating(false); setNewName('') }}
                  className="btn-secondary"
                  style={{ padding: 'var(--space-xs) var(--space-md)', fontSize: '0.75rem' }}
                >
                  ยกเลิก
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile playlist cards */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {error && (
            <div style={{ padding: 'var(--space-md) var(--space-lg)', textAlign: 'center', fontSize: '0.875rem', color: 'var(--status-error-text)' }}>{error}</div>
          )}

          {!loading && !error && playlists.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4xl) 0' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-md)' }}>🎶</div>
                <p style={{ fontSize: '0.9375rem', color: 'var(--fg-secondary)' }}>ยังไม่มีเพลย์ลิสต์</p>
                <button
                  onClick={() => setCreating(true)}
                  className="btn-primary"
                  style={{ marginTop: 'var(--space-md)', padding: 'var(--space-sm) var(--space-lg)', fontSize: '0.875rem' }}
                >
                  + เพิ่มเพลย์ลิสต์
                </button>
              </div>
            </div>
          )}

          {playlists.map((pl, index) => {
            const isConfirming = pl.id === confirmDeleteId

            return (
              <motion.div
                key={pl.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, ease: easeOutExpo }}
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <button
                  onClick={() => {
                    navigate(`/playlists/${pl.id}`)
                    setConfirmDeleteId(null)
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: 'var(--space-md) var(--space-lg)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--fg-primary)',
                    cursor: 'pointer',
                    transition: 'all 200ms var(--ease-out)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  <div style={{ fontSize: '0.9375rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-display)' }}>
                    {pl.name}
                  </div>
                  <div style={{ fontSize: '0.875rem', marginTop: '0.125rem', color: 'var(--fg-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pl.notes?.slice(0, 60) || 'ไม่มีคำอธิบาย'}
                  </div>
                </button>

                {/* Delete confirmation / button */}
                <div style={{ padding: '0 var(--space-lg) var(--space-sm)', display: 'flex', justifyContent: 'flex-end' }}>
                  {isConfirming ? (
                    <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--status-error-text)' }}>ลบ?</span>
                      <button
                        onClick={() => handleDelete(pl.id)}
                        style={{
                          padding: 'var(--space-xs) var(--space-sm)',
                          fontSize: '0.75rem',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--status-error-bg)',
                          color: 'var(--status-error-text)',
                          border: '1px solid var(--status-error-border)',
                          cursor: 'pointer',
                          transition: 'all 200ms var(--ease-out)',
                          fontFamily: 'var(--font-display)',
                        }}
                      >
                        ใช่
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="btn-secondary"
                        style={{ padding: 'var(--space-xs) var(--space-sm)', fontSize: '0.75rem' }}
                      >
                        ไม่
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(pl.id)}
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--fg-tertiary)',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'color 150ms var(--ease-out)',
                        fontFamily: 'var(--font-display)',
                      }}
                      title="ลบเพลย์ลิสต์"
                    >
                      ลบ
                    </button>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* ── Desktop: Sidebar + empty state (md+) ── */}
      {/* Left sidebar — playlist list */}
      <div className="hidden md:flex flex-col" style={{ width: 320, flexShrink: 0, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-subtle)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-tertiary)', fontFamily: 'var(--font-display)' }}>
            {loading ? 'กำลังโหลด...' : `${playlists.length} เพลย์ลิสต์`}
          </span>
          <button
            onClick={() => setCreating(true)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-sm)',
              fontSize: '1.125rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border-subtle)',
              color: 'var(--fg-secondary)',
              background: 'transparent',
              cursor: 'pointer',
              transition: 'all 200ms var(--ease-out)',
            }}
            title="เพิ่มเพลย์ลิสต์"
          >
            +
          </button>
        </div>

        {/* Inline create input */}
        <AnimatePresence>
          {creating && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: easeOutExpo }}
              style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--border-subtle)', overflow: 'hidden' }}
            >
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
              />
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                <button
                  onClick={handleCreate}
                  className="btn-primary"
                  style={{ padding: 'var(--space-xs) var(--space-md)', fontSize: '0.75rem' }}
                >
                  สร้าง
                </button>
                <button
                  onClick={() => { setCreating(false); setNewName('') }}
                  className="btn-secondary"
                  style={{ padding: 'var(--space-xs) var(--space-md)', fontSize: '0.75rem' }}
                >
                  ยกเลิก
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Playlist list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {error && (
            <div style={{ padding: 'var(--space-md) var(--space-lg)', textAlign: 'center', fontSize: '0.875rem', color: 'var(--status-error-text)' }}>{error}</div>
          )}

          {!loading && !error && playlists.length === 0 && (
            <div style={{ padding: 'var(--space-lg)', textAlign: 'center', fontSize: '0.875rem', color: 'var(--fg-tertiary)' }}>
              ยังไม่มีเพลย์ลิสต์ สร้างหนึ่งรายการเพื่อเริ่มต้น
            </div>
          )}

          {playlists.map((pl, index) => {
            const isConfirming = pl.id === confirmDeleteId

            return (
              <motion.div
                key={pl.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05, ease: easeOutExpo }}
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <button
                  onClick={() => {
                    navigate(`/playlists/${pl.id}`)
                    setConfirmDeleteId(null)
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: 'var(--space-md) var(--space-lg)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--fg-primary)',
                    cursor: 'pointer',
                    transition: 'all 200ms var(--ease-out)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  <div style={{ fontSize: '0.9375rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-display)' }}>
                    {pl.name}
                  </div>
                  <div style={{ fontSize: '0.875rem', marginTop: '0.125rem', color: 'var(--fg-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pl.notes?.slice(0, 60) || 'ไม่มีคำอธิบาย'}
                  </div>
                </button>

                {/* Delete confirmation / button */}
                <div style={{ padding: '0 var(--space-lg) var(--space-sm)', display: 'flex', justifyContent: 'flex-end' }}>
                  {isConfirming ? (
                    <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--status-error-text)' }}>ลบ?</span>
                      <button
                        onClick={() => handleDelete(pl.id)}
                        style={{
                          padding: 'var(--space-xs) var(--space-sm)',
                          fontSize: '0.75rem',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--status-error-bg)',
                          color: 'var(--status-error-text)',
                          border: '1px solid var(--status-error-border)',
                          cursor: 'pointer',
                          transition: 'all 200ms var(--ease-out)',
                          fontFamily: 'var(--font-display)',
                        }}
                      >
                        ใช่
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="btn-secondary"
                        style={{ padding: 'var(--space-xs) var(--space-sm)', fontSize: '0.75rem' }}
                      >
                        ไม่
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(pl.id)}
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--fg-tertiary)',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'color 150ms var(--ease-out)',
                        fontFamily: 'var(--font-display)',
                      }}
                      title="ลบเพลย์ลิสต์"
                    >
                      ลบ
                    </button>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Right panel — empty state (desktop only) */}
      <div className="hidden md:flex flex-1 items-center justify-center">
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 'var(--space-md)' }}>🎶</div>
          <p style={{ fontSize: '0.9375rem', color: 'var(--fg-secondary)' }}>
            เลือกเพลย์ลิสต์จากรายการเพื่อจัดการ
          </p>
          <button
            onClick={() => setCreating(true)}
            className="btn-primary"
            style={{ marginTop: 'var(--space-md)', padding: 'var(--space-sm) var(--space-lg)', fontSize: '0.875rem' }}
          >
            + เพิ่มเพลย์ลิสต์
          </button>
        </div>
      </div>
    </div>
  )
}
