/** SongDetail — single song detail view with chord chart, transpose, edit/delete actions
 *
 * Design system:
 * - Warm-tinted dark neutrals (OKLCH)
 * - Accent emerald used sparingly
 * - Balanced, breathable layouts
 * - Kanit display/body + Source Code Pro mono
 * - Exponential ease-out motion only
 */

import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useSong, useSongs } from '../hooks/useSongs'
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
      style={{ zIndex: 40, background: 'oklch(0 0 0 / 0.6)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.25, ease: easeOutExpo }}
        className="rounded-xl w-full max-w-sm mx-4"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-standard)', boxShadow: 'var(--shadow-float)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: 'var(--space-xl) var(--space-lg)' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 'var(--space-sm)', color: 'var(--fg-primary)', fontFamily: 'var(--font-display)', letterSpacing: '-0.015em' }}>
            ลบเพลง
          </h3>
          <p style={{ fontSize: '0.9375rem', color: 'var(--fg-secondary)', lineHeight: 1.6 }}>
            คุณแน่ใจหรือไม่ที่จะลบ <strong style={{ color: 'var(--fg-primary)' }}>{songTitle}</strong>?
            การกระทำนี้ไม่สามารถย้อนกลับได้
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)', padding: 'var(--space-md) var(--space-lg)', borderTop: '1px solid var(--border-subtle)' }}>
          <button onClick={onClose} className="btn-secondary" style={{ padding: 'var(--space-sm) var(--space-lg)' }}>
            ยกเลิก
          </button>
          <button onClick={handleDelete} disabled={deleting} className="btn-danger" style={{ opacity: deleting ? 0.5 : 1, cursor: deleting ? 'not-allowed' : 'pointer' }}>
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
    } catch (e) {
      console.error('Failed to copy:', e)
    }
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
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="spinner" />
        </div>
      )
    }
    if (error || !song) {
      return (
        <div className="min-h-[50vh] flex items-center justify-center">
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '1rem', marginBottom: 'var(--space-sm)', color: 'var(--status-error-text)', lineHeight: 1.6 }}>{error || 'ไม่พบเพลง'}</p>
            <button
              onClick={() => navigate('/')}
              style={{ fontSize: '0.9375rem', textDecoration: 'underline', textDecorationThickness: '2px', textDecorationColor: 'var(--accent)', transition: 'color 150ms ease', color: 'var(--accent)', fontFamily: 'var(--font-display)', background: 'none', border: 'none', cursor: 'pointer' }}
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
      {/* Breadcrumb */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: easeOutExpo }}
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-xl)' }}
      >
        <Link
          to="/"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)', color: 'var(--fg-tertiary)', textDecoration: 'none', fontSize: '0.875rem', fontFamily: 'var(--font-display)', transition: 'color 150ms var(--ease-out)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--fg-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-tertiary)' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          คลังเพลง
        </Link>
        <span style={{ color: 'var(--text-faint)' }}>/</span>
        <span style={{ color: 'var(--fg-secondary)', fontSize: '0.875rem', fontFamily: 'var(--font-display)' }}>{song.title}</span>
      </motion.div>

      {/* Song Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: easeOutExpo }}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-xl)', gap: 'var(--space-lg)' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'clamp(1.875rem, 4vw, 2.5rem)', color: 'var(--fg-primary)', marginBottom: 'var(--space-sm)', letterSpacing: '-0.022em', margin: 0 }}>
            {song.title}
          </h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)', color: 'var(--fg-secondary)', fontSize: '0.9375rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, color: 'var(--fg-tertiary)' }}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>{song.artist || 'Unknown artist'}</span>
            </div>
            {song.tempo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, color: 'var(--fg-tertiary)' }}>
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>{song.tempo} BPM</span>
              </div>
            )}
            <span className="badge">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
              {song.original_key}
            </span>
          </div>

          {/* Tags */}
          {song.tags && song.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-xs)', marginTop: 'var(--space-md)' }}>
              {song.tags.map((tag) => (
                <span key={tag} style={{ background: 'var(--bg-tertiary)', color: 'var(--fg-secondary)', padding: 'var(--space-xs) var(--space-sm)', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontFamily: 'var(--font-display)', border: '1px solid var(--border-subtle)' }}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button onClick={() => navigate(`/songs/${song.id}/edit`)} className="icon-button" title="แก้ไข">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button onClick={() => setShowDeleteConfirm(true)} className="icon-button" title="ลบ">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </motion.div>

      {/* Quick Actions + Transpose in a single toolbar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05, ease: easeOutExpo }}
        className="toolbar"
        style={{ marginBottom: 'var(--space-lg)' }}
      >
        <span className="section-label">เครื่องมือ</span>
        <button onClick={handleCopy} className="chip-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          คัดลอก
        </button>
        <button onClick={handleShare} className="chip-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          แชร์
        </button>

        <div style={{ flex: 1 }} />

        {/* Transpose controls */}
        <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
          <TransposeControls
            currentKey={song.original_key}
            transpose={transpose}
            useFlats={useFlats}
            onTransposeChange={setTranspose}
            onFlatsToggle={() => setUseFlats((f) => !f)}
          />
        </div>
      </motion.div>

      {/* Song Content */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1, ease: easeOutExpo }}
        className="surface"
        style={{ padding: 'var(--space-2xl)', overflowY: 'auto' }}
      >
        <ChordDisplay sections={song.sections ?? parseChordLyrics(song.raw_content).sections} transpose={transpose} useFlats={useFlats} />
      </motion.div>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <DeleteConfirmModal songTitle={song.title} onConfirm={handleDelete} onClose={() => setShowDeleteConfirm(false)} />
        )}
      </AnimatePresence>
    </>
  )
}
