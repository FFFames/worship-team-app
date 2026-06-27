/** StageView — Dark, high-contrast chord chart display for on-stage use
 *
 * Design system:
 * - Warm-tinted dark neutrals (OKLCH), high-contrast text
 * - Accent emerald used sparingly (active states, key badges)
 * - Kanit display/body + Source Code Pro mono for chords
 * - Exponential ease-out motion only
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { usePlaylist } from '../hooks/usePlaylists'
import { ChordDisplay } from '../components/ChordDisplay'
import { YouTubeEmbed } from '../components/YouTubeEmbed'
import { parseChordLyrics } from '../utils/chordParser'
import { transposeKey } from '../utils/transpose'
import { motion } from 'framer-motion'

const easeOutExpo: [number, number, number, number] = [0.16, 1, 0.3, 1]

export default function StageView() {
  const { id } = useParams<{ id: string }>()
  const { playlist, songs, loading, error, setTranspose } = usePlaylist(id)
  const [autoScroll, setAutoScroll] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)
  const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-scroll: scroll the container down 1px every 40ms (~25px/sec)
  useEffect(() => {
    if (autoScroll) {
      scrollIntervalRef.current = setInterval(() => {
        if (mainRef.current) {
          mainRef.current.scrollTop += 1
        }
      }, 40)
    } else if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current)
      scrollIntervalRef.current = null
    }
    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current)
      }
    }
  }, [autoScroll])

  // Keyboard shortcut: Escape to stop auto-scroll
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAutoScroll(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const handleTranspose = useCallback(
    async (psId: string, current: number, delta: number) => {
      await setTranspose(psId, current + delta)
    },
    [setTranspose],
  )

  const scrollToSong = (songId: string) => {
    const el = document.getElementById(`song-${songId}`)
    if (el && mainRef.current) {
      const containerRect = mainRef.current.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      // Offset: position of element relative to container, minus nav height (~56px)
      const offset = elRect.top - containerRect.top + mainRef.current.scrollTop - 56
      mainRef.current.scrollTo({ top: offset, behavior: 'smooth' })
    }
  }

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}
      >
        <div className="spinner" />
      </motion.div>
    )
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '0 var(--space-lg)', background: 'var(--bg-primary)' }}
      >
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '1.125rem', marginBottom: 'var(--space-md)', color: 'var(--status-error-text)' }}>ข้อผิดพลาด: {error}</p>
          <Link to={`/playlists/${id}`} style={{ fontSize: '0.875rem', textDecoration: 'none', color: 'var(--accent)', transition: 'color 150ms var(--ease-out)', fontFamily: 'var(--font-display)' }}>
            ← กลับไปเพลย์ลิสต์
          </Link>
        </div>
      </motion.div>
    )
  }

  return (
    <div
      ref={mainRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'var(--bg-primary)',
        color: 'var(--fg-primary)',
        zIndex: 30,
      }}
    >
      {/* ---- Sticky mini song list ---- */}
      <motion.nav
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: easeOutExpo }}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          padding: 'var(--space-sm) var(--space-lg)',
          backdropFilter: 'blur(16px) saturate(140%)',
          WebkitBackdropFilter: 'blur(16px) saturate(140%)',
          background: 'oklch(0.165 0.008 65 / 0.85)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', flexWrap: 'wrap', maxWidth: '100rem', margin: '0 auto' }}>
          <Link to={`/playlists/${id}`} style={{ fontSize: '0.75rem', color: 'var(--fg-tertiary)', textDecoration: 'none', flexShrink: 0, transition: 'color 150ms var(--ease-out)', fontFamily: 'var(--font-display)' }}>
            ← กลับ
          </Link>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }} className="hidden sm:inline">|</span>
          <h1 style={{ fontSize: '0.875rem', fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--fg-secondary)', margin: 0, fontFamily: 'var(--font-display)' }}>
            {playlist?.name}
          </h1>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            {songs.map((ps, idx) => {
              const song = ps.song
              if (!song) return null
              return (
                <button
                  key={ps.id}
                  onClick={() => scrollToSong(ps.id)}
                  style={{
                    fontSize: '0.75rem',
                    padding: 'var(--space-xs) var(--space-sm)',
                    borderRadius: 'var(--radius-sm)',
                    maxWidth: 140,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--fg-secondary)',
                    cursor: 'pointer',
                    transition: 'all var(--duration-fast) var(--ease-out)',
                    fontFamily: 'var(--font-display)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-prominent)'; e.currentTarget.style.color = 'var(--fg-primary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--fg-secondary)' }}
                  title={song.title}
                >
                  {idx + 1}. {song.title}
                </button>
              )
            })}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }} className="hidden sm:inline">|</span>
          <button
            onClick={() => setAutoScroll((v) => !v)}
            style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              padding: 'var(--space-xs) var(--space-md)',
              borderRadius: 'var(--radius-full)',
              flexShrink: 0,
              background: autoScroll ? 'var(--accent)' : 'var(--bg-input)',
              border: autoScroll ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
              color: autoScroll ? 'oklch(0.18 0.02 156)' : 'var(--fg-secondary)',
              cursor: 'pointer',
              transition: 'all var(--duration-fast) var(--ease-out)',
              fontFamily: 'var(--font-display)',
            }}
          >
            {autoScroll ? '⏸ หยุดเลื่อน' : '▶ เลื่อนอัตโนมัติ'}
          </button>
        </div>
      </motion.nav>

      {/* ---- Song content — 2-column grid for wide screens ---- */}
      <main style={{ maxWidth: '100rem', margin: '0 auto', padding: 'var(--space-xl) var(--space-md) var(--space-3xl)', minHeight: 'calc(100dvh - 56px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {songs.length === 0 && (
          <p style={{ textAlign: 'center', fontSize: '1.125rem', padding: 'var(--space-4xl) 0', color: 'var(--fg-tertiary)' }}>
            ไม่มีเพลงในเพลย์ลิสต์นี้
          </p>
        )}

        {songs.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 30rem), 1fr))',
              gap: 'var(--space-2xl)',
              alignItems: 'start',
              width: '100%',
            }}
          >
            {songs.map((ps, idx) => {
              const song = ps.song
              if (!song) return null

              const transpose = ps.transpose ?? 0
              const transposedKey =
                transpose !== 0
                  ? transposeKey(song.original_key, transpose)
                  : song.original_key

              return (
                <motion.article
                  key={ps.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05, ease: easeOutExpo }}
                  id={`song-${ps.id}`}
                  style={{ scrollMarginTop: 72 }}
                >
                  {/* Song header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <span style={{ fontSize: '0.875rem', fontFamily: 'var(--font-mono)', width: 24, flexShrink: 0, color: 'var(--fg-tertiary)' }}>
                      {idx + 1}
                    </span>
                    <h2 style={{ fontSize: '1.375rem', fontWeight: 600, color: 'var(--fg-primary)', fontFamily: 'var(--font-display)', margin: 0 }}>{song.title}</h2>
                    <span style={{ fontSize: '0.75rem', padding: 'var(--space-xs) var(--space-sm)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', fontWeight: 600, background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-muted)' }}>
                      {transposedKey}
                    </span>

                    {/* Compact transpose controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <button
                        onClick={() => handleTranspose(ps.id, transpose, -1)}
                        style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', fontSize: '1.125rem', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--fg-secondary)', cursor: 'pointer', transition: 'all var(--duration-fast) var(--ease-out)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-prominent)'; e.currentTarget.style.color = 'var(--fg-primary)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--fg-secondary)' }}
                        title="เปลี่ยนคีย์ลง 1 โน้ต"
                      >
                        −
                      </button>
                      <span style={{ fontSize: '0.75rem', width: 30, textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--fg-tertiary)' }}>
                        {transpose > 0 ? `+${transpose}` : transpose}
                      </span>
                      <button
                        onClick={() => handleTranspose(ps.id, transpose, 1)}
                        style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', fontSize: '1.125rem', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--fg-secondary)', cursor: 'pointer', transition: 'all var(--duration-fast) var(--ease-out)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-prominent)'; e.currentTarget.style.color = 'var(--fg-primary)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--fg-secondary)' }}
                        title="เปลี่ยนคีย์ขึ้น 1 โน้ต"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {song.youtube_url ? <YouTubeEmbed url={song.youtube_url} title={song.title} compact /> : null}

                  {/* Chord display */}
                  <ChordDisplay sections={song.sections ?? parseChordLyrics(song.raw_content).sections} transpose={transpose} center />
                </motion.article>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
