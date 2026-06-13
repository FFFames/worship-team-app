/** SongEditor — Create or edit a song with raw text input, parse, live preview, and draggable chord aligner
 *
 * Design system:
 * - Dark theme with warm-tinted neutrals (OKLCH)
 * - Accent: warm emerald green used ≤10% of surface
 * - Balanced, centered layouts (NEVER left-leaning)
 * - Kanit font for display/body, Source Code Pro for chords
 * - Exponential ease-out motion curves only
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSongEditorStore } from '../store/songEditorStore'
import { useSong } from '../hooks/useSongs'
import { useSongs } from '../hooks/useSongs'
import { parseChordLyrics, detectKey } from '../utils/chordParser'
import type { SongLine } from '../types/database'
import { motion, AnimatePresence } from 'framer-motion'

const easeOutExpo: [number, number, number, number] = [0.16, 1, 0.3, 1]

/** All keys for dropdown */
const KEY_OPTIONS = [
  'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F',
  'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
]

/** A single draggable chord token extracted from a chord line */
interface ChordToken {
  chord: string
  /** Index into the original chord string where this chord starts */
  pos: number
}

/** Parse a chord line string into individual chord tokens with positions */
function tokenizeChordLine(line: string): ChordToken[] {
  const tokens: ChordToken[] = []
  const regex = /([A-G][#b]?(?:m|maj|min|dim|aug|sus|add|7|9|11|13|6|2|4|5|°|ø)?(?:\/[A-G][#b]?)?)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(line)) !== null) {
    tokens.push({ chord: match[1], pos: match.index })
  }
  return tokens
}

/** Reconstruct a chord line string from tokens */
function reconstructLine(tokens: ChordToken[]): string {
  if (tokens.length === 0) return ''
  const lastToken = tokens[tokens.length - 1]
  const totalLen = lastToken.pos + lastToken.chord.length
  const chars = new Array(totalLen).fill(' ')
  for (const token of tokens) {
    for (let i = 0; i < token.chord.length; i++) {
      chars[token.pos + i] = token.chord[i]
    }
  }
  return chars.join('')
}

/** Draggable chord line — each chord token can be dragged horizontally */
function DraggableChordLine({
  line,
  lineIndex,
  sectionIndex,
  onChordMove,
}: {
  line: SongLine
  lineIndex: number
  sectionIndex: number
  onChordMove: (si: number, li: number, tokens: ChordToken[]) => void
}) {
  const tokens = tokenizeChordLine(line.chords)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ tokenIndex: number; startX: number; startPos: number } | null>(null)

  const handleMouseDown = useCallback(
    (tokenIndex: number, e: React.MouseEvent) => {
      e.preventDefault()
      dragRef.current = {
        tokenIndex,
        startX: e.clientX,
        startPos: tokens[tokenIndex].pos,
      }

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current || !containerRef.current) return
        const charWidth = 8.4
        const dx = ev.clientX - dragRef.current.startX
        const charDelta = Math.round(dx / charWidth)
        const newPos = Math.max(0, dragRef.current.startPos + charDelta)

        const updated = tokens.map((t, i) => (i === dragRef.current!.tokenIndex ? { ...t, pos: newPos } : t))
        for (let i = 1; i < updated.length; i++) {
          const minPos = updated[i - 1].pos + updated[i - 1].chord.length + 1
          if (updated[i].pos < minPos) {
            updated[i] = { ...updated[i], pos: minPos }
          }
        }
        onChordMove(sectionIndex, lineIndex, updated)
      }

      const handleMouseUp = () => {
        dragRef.current = null
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [tokens, sectionIndex, lineIndex, onChordMove]
  )

  const handleTouchStart = useCallback(
    (tokenIndex: number, e: React.TouchEvent) => {
      const touch = e.touches[0]
      const startX = touch.clientX
      const startY = touch.clientY
      const startPos = tokens[tokenIndex].pos

      let dragLocked = false
      let cancelled = false

      dragRef.current = {
        tokenIndex,
        startX,
        startPos,
      }

      const handleTouchMove = (ev: TouchEvent) => {
        if (cancelled) return

        const dx = ev.touches[0].clientX - startX
        const dy = ev.touches[0].clientY - startY

        if (!dragLocked) {
          if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
            cancelled = true
            dragRef.current = null
            return
          }
          if (Math.abs(dx) > 8) {
            dragLocked = true
          } else {
            return
          }
        }

        if (!dragRef.current || !containerRef.current) return
        const charWidth = 8.4
        const charDelta = Math.round(dx / charWidth)
        const newPos = Math.max(0, startPos + charDelta)

        const updated = tokens.map((t, i) => (i === dragRef.current!.tokenIndex ? { ...t, pos: newPos } : t))
        for (let i = 1; i < updated.length; i++) {
          const minPos = updated[i - 1].pos + updated[i - 1].chord.length + 1
          if (updated[i].pos < minPos) {
            updated[i] = { ...updated[i], pos: minPos }
          }
        }
        onChordMove(sectionIndex, lineIndex, updated)
      }

      const cleanup = () => {
        dragRef.current = null
        window.removeEventListener('touchmove', handleTouchMove)
        window.removeEventListener('touchend', cleanup)
      }

      window.addEventListener('touchmove', handleTouchMove, { passive: false })
      window.addEventListener('touchend', cleanup)
    },
    [tokens, sectionIndex, lineIndex, onChordMove]
  )

  if (tokens.length === 0) {
    return (
      <>
        {line.chords && (
          <div className="font-mono text-sm leading-tight whitespace-pre" style={{ color: 'var(--accent)' }}>
            {line.chords}
          </div>
        )}
      </>
    )
  }

  const lastToken = tokens[tokens.length - 1]
  const totalWidth = lastToken.pos + lastToken.chord.length

  return (
    <>
      <div ref={containerRef} className="font-mono text-sm leading-tight whitespace-pre relative select-none" style={{ minWidth: `${totalWidth}ch` }}>
        {tokens.map((token, ti) => (
          <span
            key={ti}
            className="absolute cursor-grab active:cursor-grabbing transition-colors"
            style={{ left: `${token.pos}ch`, color: 'var(--accent)' }}
            onMouseDown={(e) => handleMouseDown(ti, e)}
            onTouchStart={(e) => handleTouchStart(ti, e)}
            title="ลากเพื่อปรับตำแหน่ง"
          >
            {token.chord}
          </span>
        ))}
        {' '}
      </div>
    </>
  )
}

/** Song Editor page — paste raw chord+lyrics, parse, preview with draggable chords, save */
export default function SongEditor() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)

  const { song, loading: songLoading } = useSong(isEditing ? id : undefined)
  const { addSong, updateSong } = useSongs()

  const {
    rawText,
    parsedContent,
    detectedKey,
    useFlats,
    editingSongId,
    setRawText,
    setParsedContent,
    setDetectedKey,
    setEditingSongId,
    reset,
  } = useSongEditorStore()

  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [selectedKey, setSelectedKey] = useState('C')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (isEditing && id) {
      setEditingSongId(id)
    }
    return () => {
      reset()
    }
  }, [id, isEditing, setEditingSongId, reset])

  useEffect(() => {
    if (song && isEditing && editingSongId === song.id) {
      setTitle(song.title)
      setArtist(song.artist ?? '')
      setSelectedKey(song.original_key)
      setRawText(song.raw_content)
      const content = parseChordLyrics(song.raw_content)
      setParsedContent(content)
      const key = detectKey(content.sections)
      setDetectedKey(key)
    }
  }, [song, isEditing, editingSongId, setRawText, setParsedContent, setDetectedKey])

  useEffect(() => {
    if (detectedKey && !isEditing) {
      setSelectedKey(detectedKey)
    }
  }, [detectedKey, isEditing])

  const handleParse = useCallback(() => {
    const content = parseChordLyrics(rawText)
    setParsedContent(content)
    const key = detectKey(content.sections)
    setDetectedKey(key)
    if (!isEditing) {
      setSelectedKey(key)
    }
  }, [rawText, setParsedContent, setDetectedKey, isEditing])

  const handleChordMove = useCallback(
    (sectionIndex: number, lineIndex: number, tokens: ChordToken[]) => {
      if (!parsedContent) return
      const newSections = parsedContent.sections.map((section, si) => {
        if (si !== sectionIndex) return section
        return {
          ...section,
          lines: section.lines.map((line, li) => {
            if (li !== lineIndex) return line
            return { ...line, chords: reconstructLine(tokens) }
          }),
        }
      })
      setParsedContent({ sections: newSections })
    },
    [parsedContent, setParsedContent]
  )

  const handleSave = async () => {
    if (!title.trim()) {
      setSaveError('กรุณาใส่ชื่อเพลง')
      return
    }
    if (!rawText.trim()) {
      setSaveError('กรุณาใส่เนื้อเพลง')
      return
    }

    const contentToSave = parsedContent ?? parseChordLyrics(rawText)
    setSaving(true)
    setSaveError(null)

    try {
      if (isEditing && id) {
        await updateSong(id, {
          title: title.trim(),
          artist: artist.trim() || null,
          original_key: selectedKey,
          raw_content: rawText,
          sections: contentToSave.sections,
        })
        navigate(`/songs/${id}`)
      } else {
        const newSong = await addSong({
          title: title.trim(),
          artist: artist.trim() || null,
          original_key: selectedKey,
          raw_content: rawText,
          sections: contentToSave.sections,
        })
        navigate(`/songs/${newSong.id}`)
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  if (isEditing && songLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Header — title + cancel/save */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: easeOutExpo }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-md) var(--space-lg)',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-secondary)',
        }}
      >
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--fg-primary)', fontFamily: 'var(--font-display)', margin: 0 }}>
          {isEditing ? 'แก้ไขเพลง' : 'เพิ่มเพลงใหม่'}
        </h1>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button
            onClick={() => navigate(-1)}
            className="btn-secondary"
            style={{ padding: 'var(--space-sm) var(--space-lg)', fontSize: '0.875rem' }}
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
            style={{ padding: 'var(--space-sm) var(--space-lg)', fontSize: '0.875rem', opacity: saving ? 0.5 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </motion.header>

      {/* Error banner */}
      <AnimatePresence>
        {saveError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: easeOutExpo }}
            style={{
              padding: 'var(--space-sm) var(--space-lg)',
              fontSize: '0.875rem',
              background: 'var(--status-error-bg)',
              borderBottom: '1px solid var(--status-error-border)',
              color: 'var(--status-error-text)',
            }}
          >
            {saveError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Body — metadata + editor + preview */}
      <div className="flex-1 flex min-h-0 flex-col md:flex-row">
        {/* Left side — metadata + raw text editor */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, borderBottom: '1px solid var(--border-subtle)' }} className="md:w-1/2 md:border-r">
          {/* Metadata fields */}
          <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 'var(--space-xs)', fontWeight: 500, color: 'var(--fg-secondary)', fontFamily: 'var(--font-display)' }}>
                  ชื่อเพลง
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="ชื่อเพลง"
                  className="input-field"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 'var(--space-xs)', fontWeight: 500, color: 'var(--fg-secondary)', fontFamily: 'var(--font-display)' }}>
                  ศิลปิน
                </label>
                <input
                  type="text"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  placeholder="ชื่อศิลปิน"
                  className="input-field"
                />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-md)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 'var(--space-xs)', fontWeight: 500, color: 'var(--fg-secondary)', fontFamily: 'var(--font-display)' }}>
                  คีย์
                </label>
                <select
                  value={selectedKey}
                  onChange={(e) => setSelectedKey(e.target.value)}
                  className="input-field"
                >
                  {KEY_OPTIONS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              {detectedKey && (
                <span style={{ fontSize: '0.875rem', color: 'var(--fg-tertiary)', paddingBottom: 'var(--space-sm)' }}>
                  ตรวจพบ: <span style={{ color: 'var(--accent)' }}>{detectedKey}</span>
                </span>
              )}
            </div>
          </div>

          {/* Raw text editor + parse button */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-tertiary)', fontFamily: 'var(--font-display)' }}>
                ข้อความคอร์ด + เนื้อเพลง
              </span>
              <button
                onClick={handleParse}
                style={{
                  padding: 'var(--space-xs) var(--space-md)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  border: '1px solid var(--accent)',
                  color: 'var(--accent)',
                  background: 'transparent',
                  cursor: 'pointer',
                  transition: 'all 200ms var(--ease-out)',
                  fontFamily: 'var(--font-display)',
                }}
              >
                แปลง
              </button>
            </div>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`วางคอร์ด+เนื้อเพลงที่นี่...\n\nตัวอย่าง:\nC        G          Am       F\nAmazing grace how sweet the sound\n\nหรือ ChordPro format:\n[C]Amazing [G]grace [Am]how [F]sweet`}
              style={{
                flex: 1,
                width: '100%',
                padding: 'var(--space-lg)',
                background: 'transparent',
                fontSize: '0.875rem',
                fontFamily: 'var(--font-mono)',
                resize: 'none',
                border: 'none',
                outline: 'none',
                color: 'var(--fg-primary)',
              }}
              spellCheck={false}
            />
          </div>
        </div>

        {/* Right side — live preview with draggable chords */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }} className="md:w-1/2">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-tertiary)', fontFamily: 'var(--font-display)' }}>
              ดูตัวอย่าง — ลากคอร์ดเพื่อปรับตำแหน่ง
            </span>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => useSongEditorStore.getState().toggleFlats()}
              style={{
                padding: 'var(--space-xs) var(--space-sm)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                border: `1px solid ${useFlats ? 'var(--accent)' : 'var(--border-subtle)'}`,
                color: useFlats ? 'var(--accent)' : 'var(--fg-secondary)',
                background: useFlats ? 'var(--accent-bg)' : 'transparent',
                transition: 'all 200ms var(--ease-out)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {useFlats ? '♭' : '♯'}
            </motion.button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-lg)' }}>
            {parsedContent && parsedContent.sections.length > 0 ? (
              parsedContent.sections.map((section, si) => (
                <div key={si} style={{ marginBottom: 'var(--space-xl)' }}>
                  {section.marker !== '' && (
                    <div style={{ marginBottom: 'var(--space-sm)', fontSize: '0.75rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-tertiary)', fontFamily: 'var(--font-display)' }}>
                      {section.marker}
                    </div>
                  )}
                  {section.lines.map((line, li) => (
                    <div key={li}>
                      {line.chords && (
                        <DraggableChordLine
                          line={line}
                          lineIndex={li}
                          sectionIndex={si}
                          onChordMove={handleChordMove}
                        />
                      )}
                      {line.lyrics && (
                        <div style={{ fontSize: '1rem', lineHeight: 1.6, whiteSpace: 'pre', color: 'var(--fg-primary)' }}>
                          {line.lyrics}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.9375rem', color: 'var(--fg-tertiary)' }}>
                    วางข้อความคอร์ด+เนื้อเพลง แล้วคลิก <strong style={{ color: 'var(--accent)' }}>แปลง</strong> เพื่อดูตัวอย่าง
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
