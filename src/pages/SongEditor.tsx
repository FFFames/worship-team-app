/** SongEditor — Create or edit a song with raw text input, parse, live preview, and draggable chord aligner
 *
 * Design system:
 * - Warm-tinted dark neutrals (OKLCH)
 * - Accent emerald used sparingly
 * - Balanced, breathable layouts
 * - Kanit display/body + Source Code Pro mono
 * - Exponential ease-out motion only
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSongEditorStore } from '../store/songEditorStore'
import { useSong, useSongs } from '../hooks/useSongs'
import { parseChordLyrics, detectKey, getSectionDisplayLabel } from '../utils/chordParser'
import type { SongLine } from '../types/database'
import { SongFormatterChatbot, type SongFormatterApplyPayload } from '../components/SongFormatterChatbot'
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
  // Order matters: match longer suffixes (maj, min) before short ones (m).
  // The (?:...)* group repeats so multi-part suffixes like "m7b5", "maj7#11" work.
  const regex = /([A-G][#b]?(?:maj|min|m|M|dim|aug|sus|add|#?b?(?:2|4|5|6|7|9|11|13))*(?:\/[A-G][#b]?)?)/g
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

/** Returns true for measure/bar chord notation such as "| G | Bm |" */
function isBarChordLine(line: string): boolean {
  return line.includes('|')
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

  if (isBarChordLine(line.chords)) {
    return (
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', lineHeight: 1.4, whiteSpace: 'pre', color: 'var(--accent)', fontWeight: 600 }}>
        {line.chords}
      </div>
    )
  }

  if (tokens.length === 0) {
    return (
      <>
        {line.chords && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', lineHeight: 1.4, whiteSpace: 'pre', color: 'var(--accent)', fontWeight: 600 }}>
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
      <div
        ref={containerRef}
        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem', lineHeight: 1.4, whiteSpace: 'pre', position: 'relative', userSelect: 'none', minWidth: `${totalWidth}ch` }}
      >
        {tokens.map((token, ti) => (
          <span
            key={ti}
            style={{ position: 'absolute', left: `${token.pos}ch`, color: 'var(--accent)', fontWeight: 600, cursor: 'grab' }}
            onMouseDown={(e) => handleMouseDown(ti, e)}
            onTouchStart={(e) => handleTouchStart(ti, e)}
            title="ลากเพื่อปรับตำแหน่ง"
          >
            {token.chord}
          </span>
        ))}
        {' '}
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

  const handleFormatterApply = useCallback(
    (payload: SongFormatterApplyPayload) => {
      const content = parseChordLyrics(payload.formattedText)
      const key = detectKey(content.sections)

      setRawText(payload.formattedText)
      setParsedContent(content)
      setDetectedKey(key)
      setSelectedKey(key)

      if (!title.trim() && payload.title.trim()) {
        setTitle(payload.title.trim())
      }
      if (!artist.trim() && payload.artist.trim()) {
        setArtist(payload.artist.trim())
      }
    },
    [artist, setDetectedKey, setParsedContent, setRawText, title],
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
    <div className="flex flex-col" style={{ gap: 'var(--space-xl)' }}>
      {/* Header — title + cancel/save */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: easeOutExpo }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap' }}
      >
        <div>
          <h1 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 600, color: 'var(--fg-primary)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', margin: 0 }}>
            {isEditing ? 'แก้ไขเพลง' : 'เพิ่มเพลงใหม่'}
          </h1>
          <p style={{ fontSize: '0.9375rem', color: 'var(--fg-secondary)', marginTop: 'var(--space-xs)', margin: 0 }}>
            {isEditing ? 'ปรับปรุงรายละเอียดและคอร์ดของเพลง' : 'วางคอร์ด+เนื้อเพลง แล้วปรับตำแหน่งคอร์ดในตัวอย่าง'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button onClick={() => navigate(-1)} className="btn-secondary">
            ยกเลิก
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ opacity: saving ? 0.5 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </motion.div>

      {/* Error banner */}
      <AnimatePresence>
        {saveError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: easeOutExpo }}
            className="surface"
            style={{ padding: 'var(--space-sm) var(--space-lg)', fontSize: '0.875rem', background: 'var(--status-error-bg)', borderColor: 'var(--status-error-border)', color: 'var(--status-error-text)' }}
          >
            {saveError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Metadata fields */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05, ease: easeOutExpo }}
        className="surface"
        style={{ padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}
      >
        <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="field-label">ชื่อเพลง</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ชื่อเพลง" className="input-field" />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="field-label">ศิลปิน</label>
            <input type="text" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="ชื่อศิลปิน" className="input-field" />
          </div>
          <div style={{ minWidth: 120 }}>
            <label className="field-label">คีย์</label>
            <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} className="input-field">
              {KEY_OPTIONS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
        </div>
        {detectedKey && (
          <p style={{ fontSize: '0.8125rem', color: 'var(--fg-tertiary)', margin: 0 }}>
            ตรวจพบคีย์: <span style={{ color: 'var(--accent)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{detectedKey}</span>
          </p>
        )}
      </motion.div>

      {/* Body — editor + preview side by side on desktop */}
      <div className="flex flex-col xl:flex-row" style={{ gap: 'var(--space-lg)' }}>
        {/* Left side — raw text editor */}
        <div className="surface" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-sm) var(--space-md)', borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="section-label">ข้อความคอร์ด + เนื้อเพลง</span>
            <button onClick={handleParse} className="btn-ghost" style={{ border: '1px solid var(--accent-muted)', color: 'var(--accent)' }}>
              แปลง
            </button>
          </div>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={`วางคอร์ด+เนื้อเพลงที่นี่...\n\nตัวอย่าง:\nC        G          Am       F\nAmazing grace how sweet the sound\n\nหรือ ChordPro format:\n[C]Amazing [G]grace [Am]how [F]sweet`}
            spellCheck={false}
            style={{
              width: '100%',
              minHeight: '50vh',
              flex: 1,
              padding: 'var(--space-md)',
              background: 'transparent',
              fontSize: '0.875rem',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.6,
              resize: 'vertical',
              border: 'none',
              outline: 'none',
              color: 'var(--fg-primary)',
            }}
          />
        </div>

        {/* Right side — live preview with draggable chords */}
        <div className="surface" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-sm) var(--space-md)', borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="section-label">ตัวอย่าง — ลากคอร์ดเพื่อปรับตำแหน่ง</span>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => useSongEditorStore.getState().toggleFlats()}
              style={{
                padding: 'var(--space-xs) var(--space-sm)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8125rem',
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                border: useFlats ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                color: useFlats ? 'var(--accent)' : 'var(--fg-secondary)',
                background: useFlats ? 'var(--accent-bg)' : 'transparent',
                transition: 'all var(--duration-fast) var(--ease-out)',
                cursor: 'pointer',
              }}
            >
              {useFlats ? '♭' : '♯'}
            </motion.button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-lg)', minHeight: '50vh' }}>
            {parsedContent && parsedContent.sections.length > 0 ? (
              parsedContent.sections.map((section, si) => (
                <div key={si} style={{ marginBottom: 'var(--space-xl)' }}>
                  {getSectionDisplayLabel(section) !== '' && (
                    <div style={{ marginBottom: 'var(--space-sm)', fontSize: '0.75rem', fontWeight: 500, color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>
                      {getSectionDisplayLabel(section)}
                    </div>
                  )}
                  {section.lines.map((line, li) => (
                    <div key={li}>
                      {line.chords && (
                        <DraggableChordLine line={line} lineIndex={li} sectionIndex={si} onChordMove={handleChordMove} />
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 200 }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.9375rem', color: 'var(--fg-tertiary)', margin: 0 }}>
                    วางข้อความคอร์ด+เนื้อเพลง แล้วคลิก <strong style={{ color: 'var(--accent)' }}>แปลง</strong> เพื่อดูตัวอย่าง
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <SongFormatterChatbot
          rawText={rawText}
          title={title}
          artist={artist}
          onApply={handleFormatterApply}
        />
      </div>
    </div>
  )
}
