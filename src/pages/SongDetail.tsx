/** SongDetail — single song detail view with chord chart, transpose, edit/delete actions
 *
 * Design system:
 * - Dark theme with warm-tinted neutrals (OKLCH)
 * - Accent: warm emerald green used ≤10% of surface
 * - Balanced, centered layouts (NEVER left-leaning)
 * - Kanit font for display/body, Source Code Pro for chords
 * - Exponential ease-out motion curves only
 */

import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useSong } from '../hooks/useSongs'
import { useSongs } from '../hooks/useSongs'
import { ChordDisplay } from '../components/ChordDisplay'
import { TransposeControls } from '../components/TransposeControls'
import { parseChordLyrics } from '../utils/chordParser'
import type { Song } from '../types/database'
import { motion, AnimatePresence } from 'framer-motion'

const easeOutExpo: [number, number, number, number] = [0.16, 1, 0.3, 1]

interface SongDetailProps {
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 40, background: 'oklch(0 0 0 / 0.6)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.2, ease: easeOutExpo }}
        className="rounded-lg w-full max-w-sm mx-4"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: 'var(--space-xl) var(--space-lg)' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 'var(--space-sm)', color: 'var(--fg-primary)', fontFamily: 'var(--font-display)', letterSpacing: '-0.015em' }}>ลบเพลง</h3>
          <p style={{ fontSize: '1rem', color: 'var(--fg-secondary)', lineHeight: 1.6 }}>
            คุณแน่ใจหรือไม่ที่จะลบ <strong style={{ color: 'var(--fg-primary)' }}>{songTitle}</strong>?
            การกระทำนี้ไม่สามารถย้อนกลับได้
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)', padding: 'var(--space-md) var(--space-lg)', borderTop: '1px solid var(--border-subtle)' }}>
          <button
            onClick={onClose}
            className="btn-secondary"
            style={{ padding: 'var(--space-md) var(--space-lg)', fontSize: '1rem' }}
          >
            ยกเลิก
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              padding: 'var(--space-md) var(--space-lg)',
              borderRadius: 'var(--radius-md)',
              fontSize: '1rem',
              fontWeight: 500,
              background: 'var(--status-error-bg)',
              color: 'var(--status-error-text)',
              border: '1px solid var(--status-error-border)',
              cursor: deleting ? 'not-allowed' : 'pointer',
              opacity: deleting ? 0.5 : 1,
              transition: 'all 200ms var(--ease-out)',
              fontFamily: 'var(--font-display)',
            }}
          >
            {deleting ? 'กำลังลบ…' : 'ลบ'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/** Song Detail — works standalone (/songs/:id) or inline (passed song prop) */
export default function SongDetail({ song: songProp }: SongDetailProps) {
  const navigate = useNavigate()
  const { id: paramId } = useParams<{ id: string }>()
  const { song: fetchedSong, loading, error } = useSong(songProp ? undefined : paramId)
  const { deleteSong: deleteSongById, refresh } = useSongs()

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

  const handleCopy = async () => {
    if (!song) return
    try {
      await navigator.clipboard.writeText(song.raw_content || '')
      // Could add toast notification here
    } catch (e) {
      console.error('Failed to copy:', e)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleShare = async () => {
    if (navigator.share && song) {
      try {
        await navigator.share({
          title: song.title,
          text: `${song.title} - ${song.artist || ''}`,
          url: window.location.href,
        })
      } catch (e) {
        console.error('Failed to share:', e)
      }
    }
  }

  if (!songProp) {
    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="spinner" />
        </div>
      )
    }
    if (error || !song) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '1rem', marginBottom: 'var(--space-sm)', color: 'var(--status-error-text)', lineHeight: 1.6 }}>{error || 'ไม่พบเพลง'}</p>
            <button
              onClick={() => navigate('/')}
              style={{ fontSize: '1rem', textDecoration: 'underline', textDecorationThickness: '2px', transition: 'color 150ms ease', color: 'var(--accent)', fontFamily: 'var(--font-display)' }}
            >
              กลับไปหน้าคลังเพลง
            </button>
          </div>
        </div>
      )
    }
  }

  if (!song) return null

  return (
    <>
      {/* Navigation bar */}
      <nav style={{ position: 'sticky', top: 0, background: 'oklch(0.15 0.01 240 / 0.95)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border-subtle)', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-md) var(--space-lg)', maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xl)' }}>
            <Link
              to="/"
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', color: 'var(--fg-secondary)', textDecoration: 'none', fontSize: '0.9375rem', padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-sm)', transition: 'all 150ms var(--ease-out)', fontFamily: 'var(--font-display)' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              กลับ
            </Link>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.0625rem', color: 'var(--fg-primary)', padding: 'var(--space-sm)' }}>
              {song.title}
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, maxWidth: '1000px', width: '100%', margin: '0 auto', padding: 'var(--space-2xl) var(--space-lg)' }}>
        {/* Song Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: easeOutExpo }}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2xl)', gap: 'var(--space-lg)' }}
        >
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '2rem', color: 'var(--fg-primary)', marginBottom: 'var(--space-sm)', letterSpacing: '-0.02em' }}>
              {song.title}
            </h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-lg)', color: 'var(--fg-secondary)', fontSize: '0.9375rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, color: 'var(--fg-tertiary)' }}>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                <span>{song.artist || 'Unknown artist'}</span>
              </div>
              {song.tempo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, color: 'var(--fg-tertiary)' }}>
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <span>{song.tempo} BPM</span>
                </div>
              )}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)', background: 'var(--accent-bg)', color: 'var(--accent)', padding: 'var(--space-xs) var(--space-sm)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', fontSize: '0.875rem', fontWeight: 600 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
                {song.original_key}
              </span>
            </div>

            {/* Tags */}
            {song.tags && song.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', marginTop: 'var(--space-lg)' }}>
                {song.tags.map((tag) => (
                  <span key={tag} style={{ background: 'var(--bg-tertiary)', color: 'var(--fg-secondary)', padding: 'var(--space-xs) var(--space-md)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem' }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button
              onClick={() => navigate(`/songs/${song.id}/edit`)}
              className="icon-btn"
              title="แก้ไข"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button
              onClick={() => navigate('/stage')}
              className="icon-btn primary"
              title="เปิดบน Stage"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              Stage
            </button>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: easeOutExpo }}
          className="quick-actions"
          style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)', padding: 'var(--space-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', alignItems: 'center' }}
        >
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.875rem', color: 'var(--fg-tertiary)', marginRight: 'var(--space-md)' }}>
            ดำเนินการ:
          </span>
          <Link
            to="/stage"
            className="quick-btn"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            เล่นบน Stage
          </Link>
          <button
            onClick={handleCopy}
            className="quick-btn"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            คัดลอก
          </button>
          <button
            onClick={handlePrint}
            className="quick-btn"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            พิมพ์
          </button>
          <button
            onClick={handleShare}
            className="quick-btn"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <circle cx="18" cy="5" r="3"/>
              <circle cx="6" cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            แชร์
          </button>
        </motion.div>

        {/* Transpose controls */}
        <div style={{ marginBottom: 'var(--space-lg)', overflowX: 'auto' }}>
          <TransposeControls
            currentKey={song.original_key}
            transpose={transpose}
            useFlats={useFlats}
            onTransposeChange={setTranspose}
            onFlatsToggle={() => setUseFlats((f) => !f)}
          />
        </div>

        {/* Song Content */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, ease: easeOutExpo }}
          className="song-content"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-2xl)', overflowY: 'auto' }}
        >
          <ChordDisplay
            sections={song.sections ?? parseChordLyrics(song.raw_content).sections}
            transpose={transpose}
            useFlats={useFlats}
          />
        </motion.div>
      </main>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <DeleteConfirmModal
            songTitle={song.title}
            onConfirm={handleDelete}
            onClose={() => setShowDeleteConfirm(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

/* Icon button styles */
const iconBtnStyle = `
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  color: var(--fg-primary);
  font-size: 0.9375rem;
  cursor: pointer;
  transition: all 150ms var(--ease-out);
  min-width: 44px;
  font-family: var(--font-display);
`

const quickBtnStyle = `
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: var(--space-sm) var(--space-md);
  color: var(--fg-secondary);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 150ms var(--ease-out);
  text-decoration: none;
  font-family: var(--font-display);
`

// Inject styles (in a real app, these would be in CSS)
if (typeof document !== 'undefined') {
  const styleId = 'song-detail-styles'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      .icon-btn { ${iconBtnStyle} }
      .icon-btn:hover { background: var(--bg-secondary); border-color: var(--fg-secondary); }
      .icon-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      .icon-btn.primary { background: var(--accent); border-color: var(--accent); color: var(--bg-primary); }
      .icon-btn.primary:hover { background: var(--accent-secondary); }
      .quick-btn { ${quickBtnStyle} }
      .quick-btn:hover { background: var(--bg-primary); border-color: var(--fg-secondary); color: var(--fg-primary); }
      .quick-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    `
    document.head.appendChild(style)
  }
}
