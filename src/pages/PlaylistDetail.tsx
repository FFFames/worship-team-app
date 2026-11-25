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
import { EasyWorshipScheduleSongs } from '../components/EasyWorshipScheduleSongs'
import { PlaylistSongReconciliation } from '../components/PlaylistSongReconciliation'
import { PlaylistPresentationReconciliation } from '../components/PlaylistPresentationReconciliation'
import { PlaylistMediaRecovery } from '../components/PlaylistMediaRecovery'
import { PlaylistPackageExport } from '../components/PlaylistPackageExport'
import { PlaylistSlideList } from '../components/PlaylistSlideList'
import { useAppendPlaylistCue } from '../hooks/useAppendPlaylistCue'
import { usePlaylist, usePlaylists } from '../hooks/usePlaylists'
import { usePlaylistBackground } from '../hooks/usePlaylistBackground'
import { usePlaylistTheme } from '../hooks/useSlideDesigns'
import { SongSearchModal } from '../components/SongSearchModal'
import { LiveCueForm } from '../components/LiveCueForm'
import { PlaylistCueEditor } from '../components/PlaylistCueEditor'
import { CUE_LABELS } from '../utils/playlistCues'
import { arrangedCueSlides } from '../utils/songCueLayout'
import { transposeKey } from '../utils/transpose'
import type { PlaylistCue, PlaylistSong } from '../types/database'
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
  const saveBackground = usePlaylistBackground()
  const saveTheme = usePlaylistTheme()
  const appendCue = useAppendPlaylistCue()
  const { playlist, songs, loading, error, addSong, removeSong, reorderSongs, setTranspose, editCue } = playlistData

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  const [savingOrder, setSavingOrder] = useState(false)
  const [mutationError, setMutationError] = useState('')
  const [clearingAppearance, setClearingAppearance] = useState(false)
  const [editing, setEditing] = useState<{ entry: PlaylistSong; creating?: true } | null>(null)
  const [expandedEntries, setExpandedEntries] = useState<ReadonlySet<string>>(() => new Set())

  async function clearAppearance(entryId: string, kind: 'background' | 'theme') {
    if (!playlistId || clearingAppearance) return
    setClearingAppearance(true)
    setMutationError('')
    try {
      await (kind === 'theme' ? saveTheme : saveBackground)(playlistId, entryId, null)
      await playlistData.refresh(false)
    } catch {
      setMutationError(kind === 'theme' ? 'นำธีมออกไม่สำเร็จ กรุณาลองอีกครั้ง' : 'ลบพื้นหลังไม่สำเร็จ กรุณาลองอีกครั้ง')
    } finally {
      setClearingAppearance(false)
    }
  }

  const TRANSPOSE_OFFSETS = [-2, -1, 0, 1, 2]

  const existingSongIds = new Set(songs.flatMap((entry) => entry.song_id ? [entry.song_id] : []))

  async function handleNameSave() {
    const name = nameDraft.trim()
    if (!name || !playlist || !playlistId) return
    try {
      await updatePlaylist(playlistId, { name })
      await playlistData.refresh(false)
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

  const moveEntry = useCallback(async (from: number, to: number) => {
    if (from === to || savingOrder || to < 0 || to >= songs.length) return
    const reordered = [...songs]
    const [moved] = reordered.splice(from, 1)
    if (!moved) return
    reordered.splice(to, 0, moved)

    setMutationError('')
    setSavingOrder(true)
    try {
      await reorderSongs(reordered.map((entry) => entry.id))
    } catch {
      setMutationError('บันทึกลำดับไม่ได้ กรุณาลองเรียงรายการอีกครั้ง')
    } finally {
      setSavingOrder(false)
    }
  }, [savingOrder, songs, reorderSongs])

  const handleDrop = (index: number) => {
    if (dragIndex !== null) void moveEntry(dragIndex, index)
    setDragIndex(null)
  }

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
  const visibleEntries = songs.filter(({ cue, song }) => cue || song)
  const allExpanded = visibleEntries.every(({ id }) => expandedEntries.has(id))
  const anyExpanded = visibleEntries.some(({ id }) => expandedEntries.has(id))
  const easyWorshipSongs = songs.map((entry) => !entry.song_id && entry.cue?.kind === 'song'
    && typeof entry.cue.metadata?.type === 'number' ? entry.cue : null)

  function createPresentation() {
    if (!playlistId) return
    setEditing({ creating: true, entry: {
      id: crypto.randomUUID(), playlist_id: playlistId, song_id: null, order: songs.length, transpose: 0,
      created_at: new Date().toISOString(),
      cue: { kind: 'presentation', label: 'งานนำเสนอใหม่', slides: [{ label: 'สไลด์ 1', lines: [] }] },
    } })
  }

  async function saveCue(cue: PlaylistCue | null) {
    if (!editing) return
    if (!editing.creating) return editCue(editing.entry, cue)
    if (!cue) throw new Error('ไม่พบงานนำเสนอที่จะเพิ่ม')
    await appendCue(editing.entry.playlist_id, editing.entry.id, cue)
    await playlistData.refresh(false)
  }

  function toggleSlides(id: string) {
    setExpandedEntries((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
            <Link to={`/playlists/${playlistId}/print`} className="btn-secondary">พิมพ์ตาราง</Link>
            <button onClick={() => navigate(`/playlists/${playlistId}/present`)} className="btn-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              นำเสนอ
            </button>
            <PlaylistPackageExport key={playlist.id} playlist={playlist} entries={songs} />
          </div>
        </div>
      </motion.div>

      {easyWorshipSongs.some(Boolean) && (
        <EasyWorshipScheduleSongs key={playlist.id} cues={easyWorshipSongs} source={{ playlistId: playlist.id }} />
      )}
      <PlaylistSongReconciliation key={`${playlist.id}-review`} entries={songs} onRefresh={() => playlistData.refresh(false)} />
      <PlaylistPresentationReconciliation key={`${playlist.id}-presentations`} entries={songs} onRefresh={() => playlistData.refresh(false)} />
      <PlaylistMediaRecovery key={`${playlist.id}-media`} entries={songs} />

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
          <span className="section-label">{songs.length} รายการ</span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link to={`/scripture?playlist=${playlist.id}`} className="chip-btn">เพิ่มข้อพระคัมภีร์</Link>
            <Link to={`/media?playlist=${playlist.id}`} className="chip-btn">เพิ่มสื่อ</Link>
            <Link to={`/designs?playlist=${playlist.id}`} className="chip-btn">เพิ่มสไลด์หรือธีม</Link>
            <button type="button" className="chip-btn" onClick={createPresentation}>สร้างงานนำเสนอเปล่า</button>
            <Link to={`/playlists/import?into=${playlist.id}`} className="chip-btn">เพิ่มตาราง EasyWorship</Link>
            <button onClick={() => setSearchModalOpen(true)} className="chip-btn">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              เพิ่มเพลง
            </button>
          </div>
        </div>

        {mutationError && <p role="alert" className="p-3 text-sm text-[var(--status-error-text)]">{mutationError}</p>}
        <LiveCueForm key={playlist.id} playlistId={playlist.id} onSaved={() => playlistData.refresh(false)} />

        {visibleEntries.length > 0 && <div className="flex flex-wrap gap-2 border-b border-[var(--border-subtle)] px-4 py-2"
          role="group" aria-label="แสดงสไลด์ในตาราง">
          <button type="button" className="chip-btn" disabled={allExpanded}
            onClick={() => setExpandedEntries(new Set(visibleEntries.map(({ id }) => id)))}>ขยายสไลด์ทั้งหมด</button>
          <button type="button" className="chip-btn" disabled={!anyExpanded}
            onClick={() => setExpandedEntries(new Set())}>ย่อสไลด์ทั้งหมด</button>
        </div>}

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
              <p style={{ fontSize: '0.9375rem', color: 'var(--fg-secondary)', margin: 0 }}>ยังไม่มีรายการในเพลย์ลิสต์นี้</p>
              <button onClick={() => setSearchModalOpen(true)} className="btn-primary" style={{ marginTop: 'var(--space-md)' }}>
                + เพิ่มเพลง
              </button>
            </div>
          </div>
        ) : (
          <div>
            {songs.map((ps: PlaylistSong, index: number) => {
              const song = ps.song
              const cue = ps.cue
              if (!song && !cue) return null
              const label = cue?.label ?? song?.title
              const slideCount = cue && arrangedCueSlides(cue).length
              const expanded = expandedEntries.has(ps.id)
              const slidesId = `playlist-slides-${ps.id}`

              return (
                <motion.div
                  key={ps.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03, ease: easeOutExpo }}
                  draggable={!savingOrder}
                  onDragStart={() => handleDragStart(index)}
                  onDragEnd={() => setDragIndex(null)}
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
                    {song ? <Link
                      to={`/songs/${song.id}?fromPlaylist=${playlist.id}`}
                      style={{ flex: 1, minWidth: 0, textDecoration: 'none', borderRadius: 'var(--radius-sm)' }}
                      title={`เปิดเพลง ${song.title}`}
                    >
                      <div style={{ fontSize: '0.9375rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--fg-primary)', fontFamily: 'var(--font-display)', transition: 'color var(--duration-fast) var(--ease-out)' }}>
                        {label}
                      </div>
                      <div style={{ fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--fg-tertiary)' }}>
                        {song.artist || 'Unknown Artist'}{cue && ` · ฉบับในเพลย์ลิสต์ · ${slideCount} สไลด์`}
                      </div>
                    </Link> : cue && (
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium" title={cue.label}>{cue.label}</p>
                        <p className="text-xs text-[var(--fg-secondary)]">
                          {CUE_LABELS[cue.kind]} · {slideCount} สไลด์
                        </p>
                      </div>
                    )}

                    {/* Desktop: inline transpose controls */}
                    {song && <div className="hidden md:flex items-center gap-1" style={{ gap: 2 }}>
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
                    </div>}

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => void moveEntry(index, index - 1)}
                        disabled={savingOrder || index === 0}
                        className="icon-button"
                        style={{ width: 28, height: 28, opacity: index === 0 ? 0.3 : 1, cursor: index === 0 ? 'not-allowed' : 'pointer' }}
                        title="เลื่อนขึ้น"
                        aria-label={`เลื่อน ${label} ขึ้น`}
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => void moveEntry(index, index + 1)}
                        disabled={savingOrder || index === songs.length - 1}
                        className="icon-button"
                        style={{ width: 28, height: 28, opacity: index === songs.length - 1 ? 0.3 : 1, cursor: index === songs.length - 1 ? 'not-allowed' : 'pointer' }}
                        title="เลื่อนลง"
                        aria-label={`เลื่อน ${label} ลง`}
                      >
                        ↓
                      </button>
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={() => {
                        setMutationError('')
                        void removeSong(ps.id).catch(() => setMutationError('ลบรายการไม่ได้ กรุณาลองอีกครั้ง'))
                      }}
                      disabled={savingOrder}
                      className="icon-button"
                      style={{ width: 28, height: 28, color: 'var(--fg-tertiary)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--status-error-text)'; e.currentTarget.style.borderColor = 'var(--status-error-border)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--fg-tertiary)'; e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
                      title="ลบออกจากเพลย์ลิสต์"
                      aria-label={`ลบ ${label} ออกจากเพลย์ลิสต์`}
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mt-2! flex flex-wrap gap-2">
                    <button type="button" className="chip-btn" disabled={savingOrder}
                      aria-label={`แก้ไข ${label} ในเพลย์ลิสต์`} onClick={() => setEditing({ entry: ps })}>แก้ไขรายการ</button>
                    <button type="button" className="chip-btn" aria-expanded={expanded} aria-controls={slidesId}
                      aria-label={`${expanded ? 'ซ่อนสไลด์' : 'ดูสไลด์'} ${label}`} onClick={() => toggleSlides(ps.id)}>
                      {expanded ? 'ซ่อนสไลด์' : 'ดูสไลด์'}
                    </button>
                  </div>
                  <div id={slidesId} hidden={!expanded}>{expanded && <PlaylistSlideList entry={ps} />}</div>

                  {ps.background_asset && (
                    <div className="mt-2! flex min-w-0 flex-wrap items-center gap-2 text-xs">
                      <span className="wrap-anywhere text-[var(--fg-secondary)]">พื้นหลัง · {ps.background_asset.filename}</span>
                      <button type="button" className="chip-btn" disabled={clearingAppearance}
                        onClick={() => void clearAppearance(ps.id, 'background')}>ลบพื้นหลัง</button>
                    </div>
                  )}

                  {ps.slide_theme && (
                    <div className="mt-2! flex min-w-0 flex-wrap items-center gap-2 text-xs">
                      <span className="wrap-anywhere text-[var(--fg-secondary)]">ธีม · {ps.slide_theme.title}</span>
                      <button type="button" className="chip-btn" disabled={clearingAppearance}
                        onClick={() => void clearAppearance(ps.id, 'theme')}>นำธีมออก</button>
                    </div>
                  )}

                  {/* Mobile: transpose controls stacked below song info */}
                  {song && <div className="flex md:hidden items-center gap-1 mt-2 ml-[34px]">
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
                  </div>}

                  {cue?.warnings?.length ? (
                    <details className="mt-2 ml-[34px] text-xs text-[var(--fg-secondary)]">
                      <summary className="cursor-pointer">รายละเอียดการนำเข้า</summary>
                      <ul className="mt-1 list-inside list-disc">{cue.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                    </details>
                  ) : null}
                </motion.div>
              )
            })}
          </div>
        )}
      </motion.div>

      {editing && editing.entry.playlist_id === playlist.id && (
        <PlaylistCueEditor key={editing.entry.id} entry={editing.entry} creating={editing.creating}
          onSave={saveCue} onClose={() => setEditing(null)} />
      )}

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
