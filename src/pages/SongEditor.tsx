/** SongEditor — create or edit a song with raw text input, parse, live preview, and draggable chord aligner */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSongEditorStore } from '../store/songEditorStore'
import { useSong } from '../hooks/useSongs'
import { useSongs } from '../hooks/useSongs'
import { parseChordLyrics, detectKey } from '../utils/chordParser'
import type { SongLine } from '../types/database'

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
  // Match chord patterns at their positions in the string
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
        // Approximate character width (monospace)
        const charWidth = 8.4
        const dx = ev.clientX - dragRef.current.startX
        const charDelta = Math.round(dx / charWidth)
        const newPos = Math.max(0, dragRef.current.startPos + charDelta)

        const updated = tokens.map((t, i) => (i === dragRef.current!.tokenIndex ? { ...t, pos: newPos } : t))
        // Enforce ordering
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

      // Start in "pending" mode — don't steal the touch yet.
      // Only lock into drag mode once finger moves >8px horizontally.
      // If it moves >8px vertically first, cancel (it's a scroll).
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

        // Not yet decided if this is a drag or a scroll
        if (!dragLocked) {
          if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
            // Vertical scroll intent — cancel drag, let scroll happen
            cancelled = true
            dragRef.current = null
            cleanup()
            return
          }
          if (Math.abs(dx) > 8) {
            // Horizontal drag intent — lock in
            dragLocked = true
            ev.preventDefault()
          } else {
            return // Still ambiguous, wait
          }
        } else {
          ev.preventDefault()
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
        window.removeEventListener('touchend', handleTouchEnd)
      }

      const handleTouchEnd = () => {
        cleanup()
      }

      window.addEventListener('touchmove', handleTouchMove, { passive: false })
      window.addEventListener('touchend', handleTouchEnd)
    },
    [tokens, sectionIndex, lineIndex, onChordMove]
  )

  if (tokens.length === 0) {
    // No chords to drag — render static
    return (
      <>
        {line.chords && (
          <div className="font-mono text-sm leading-tight text-[#3ecf8e] whitespace-pre">
            {line.chords}
          </div>
        )}
      </>
    )
  }

  // Build positioned chord spans
  const lastToken = tokens[tokens.length - 1]
  const totalWidth = lastToken.pos + lastToken.chord.length

  return (
    <>
      <div ref={containerRef} className="font-mono text-sm leading-tight whitespace-pre relative select-none" style={{ minWidth: `${totalWidth}ch` }}>
        {tokens.map((token, ti) => (
          <span
            key={ti}
            className="absolute text-[#3ecf8e] cursor-grab active:cursor-grabbing hover:text-[#5eeaa8] transition-colors"
            style={{ left: `${token.pos}ch` }}
            onMouseDown={(e) => handleMouseDown(ti, e)}
            onTouchStart={(e) => handleTouchStart(ti, e)}
            title="Drag to adjust position"
          >
            {token.chord}
          </span>
        ))}
        {/* Invisible spacer to maintain line height */}
        {'\u00A0'}
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

  // Load existing song in edit mode
  useEffect(() => {
    if (isEditing && id) {
      setEditingSongId(id)
    }
    return () => {
      reset()
    }
  }, [id, isEditing, setEditingSongId, reset])

  // Populate form when song loads in edit mode
  useEffect(() => {
    if (song && isEditing && editingSongId === song.id) {
      setTitle(song.title)
      setArtist(song.artist ?? '')
      setSelectedKey(song.original_key)
      setRawText(song.raw_content)
      // Auto-parse on load
      const content = parseChordLyrics(song.raw_content)
      setParsedContent(content)
      const key = detectKey(content.sections)
      setDetectedKey(key)
    }
  }, [song, isEditing, editingSongId, setRawText, setParsedContent, setDetectedKey])

  // Sync detected key to selected key (new song mode only)
  useEffect(() => {
    if (detectedKey && !isEditing) {
      setSelectedKey(detectedKey)
    }
  }, [detectedKey, isEditing])

  // Parse raw text into structured content
  const handleParse = useCallback(() => {
    const content = parseChordLyrics(rawText)
    setParsedContent(content)
    const key = detectKey(content.sections)
    setDetectedKey(key)
    if (!isEditing) {
      setSelectedKey(key)
    }
  }, [rawText, setParsedContent, setDetectedKey, isEditing])

  // Handle chord drag — update the chord string in parsed content
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

  // Save song (create or update)
  const handleSave = async () => {
    if (!title.trim()) {
      setSaveError('Title is required')
      return
    }
    if (!rawText.trim()) {
      setSaveError('Song content is required')
      return
    }

    // Parse content if not already parsed, to ensure sections are saved
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
      setSaveError(err instanceof Error ? err.message : 'Failed to save song')
    } finally {
      setSaving(false)
    }
  }

  if (isEditing && songLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-[#898989] text-sm">Loading song...</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header — title + cancel/save */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[#2e2e2e] shrink-0">
        <h1 className="text-lg text-[#fafafa]">
          {isEditing ? 'Edit Song' : 'New Song'}
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-1.5 rounded border border-[#2e2e2e] text-sm text-[#b4b4b4] hover:text-[#fafafa] hover:border-[#363636] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded-full bg-[#3ecf8e] text-[#0f0f0f] text-sm font-medium hover:bg-[#2db87a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </header>

      {/* Error banner */}
      {saveError && (
        <div className="px-6 py-2 bg-red-900/30 border-b border-red-800 text-red-300 text-sm">
          {saveError}
        </div>
      )}

      {/* Body — metadata + editor + preview */}
      <div className="flex-1 flex min-h-0 flex-col md:flex-row">
        {/* Left side — metadata + raw text editor */}
        <div className="w-full md:w-1/2 flex flex-col min-h-0 border-b md:border-b-0 md:border-r border-[#2e2e2e]">
          {/* Metadata fields */}
          <div className="px-6 py-4 space-y-3 border-b border-[#2e2e2e] shrink-0">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-[#898989] mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Song title"
                  className="w-full px-3 py-2 rounded bg-[#171717] border border-[#2e2e2e] text-sm text-[#fafafa] placeholder-[#898989] focus:outline-none focus:border-[#3ecf8e] transition-colors"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-[#898989] mb-1">Artist</label>
                <input
                  type="text"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  placeholder="Artist name"
                  className="w-full px-3 py-2 rounded bg-[#171717] border border-[#2e2e2e] text-sm text-[#fafafa] placeholder-[#898989] focus:outline-none focus:border-[#3ecf8e] transition-colors"
                />
              </div>
            </div>
            <div className="flex items-end gap-3">
              <div>
                <label className="block text-xs text-[#898989] mb-1">Key</label>
                <select
                  value={selectedKey}
                  onChange={(e) => setSelectedKey(e.target.value)}
                  className="px-3 py-2 rounded bg-[#171717] border border-[#2e2e2e] text-sm text-[#fafafa] focus:outline-none focus:border-[#3ecf8e] transition-colors"
                >
                  {KEY_OPTIONS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              {detectedKey && (
                <span className="text-xs text-[#898989] pb-2">
                  Auto-detected: <span className="text-[#3ecf8e]">{detectedKey}</span>
                </span>
              )}
            </div>
          </div>

          {/* Raw text editor + parse button */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between px-6 py-2 border-b border-[#2e2e2e] shrink-0">
              <span className="text-xs text-[#898989] uppercase tracking-wider">
                Raw Chord + Lyrics
              </span>
              <button
                onClick={handleParse}
                className="px-3 py-1 rounded border border-[#3ecf8e] text-xs text-[#3ecf8e] hover:bg-[#3ecf8e] hover:text-[#0f0f0f] transition-colors"
              >
                Parse
              </button>
            </div>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`Paste chord+lyrics here...\n\nExample:\nC        G          Am       F\nAmazing grace how sweet the sound\n\nOr ChordPro format:\n[C]Amazing [G]grace [Am]how [F]sweet`}
              className="flex-1 w-full px-6 py-4 bg-[#171717] text-sm text-[#fafafa] font-mono placeholder-[#898989] resize-none focus:outline-none"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Right side — live preview with draggable chords */}
        <div className="w-full md:w-1/2 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-6 py-2 border-b border-[#2e2e2e] shrink-0">
            <span className="text-xs text-[#898989] uppercase tracking-wider">
              Preview — drag chords to align
            </span>
            <button
              onClick={() => useSongEditorStore.getState().toggleFlats()}
              className={`px-2 py-1 rounded text-xs border transition-colors ${
                useFlats
                  ? 'border-[rgba(62,207,142,0.3)] text-[#3ecf8e]'
                  : 'border-[#2e2e2e] text-[#b4b4b4] hover:text-[#fafafa]'
              }`}
            >
              {useFlats ? '♭' : '♯'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {parsedContent && parsedContent.sections.length > 0 ? (
              parsedContent.sections.map((section, si) => (
                <div key={si} className="mb-6">
                  {/* Section marker */}
                  {section.marker !== '' && (
                    <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-[#898989]">
                      {section.marker}
                    </div>
                  )}
                  {/* Lines with draggable chords */}
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
                        <div className="text-base leading-relaxed text-[#fafafa] whitespace-pre">
                          {line.lyrics}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-[#898989] text-sm">
                    Paste chord+lyrics text and click{' '}
                    <strong className="text-[#3ecf8e]">Parse</strong> to see a preview
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
