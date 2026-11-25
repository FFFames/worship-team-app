/** Finds library songs and previews their lyrics before adding them to a playlist. */

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useLibraryCollections } from '../hooks/useCollectionFilter'
import { useSong, useSongs } from '../hooks/useSongs'
import { getSectionDisplayLabel, parseChordLyrics } from '../utils/chordParser'
import { prepareSongCollectionFilter, type CollectionSong } from '../utils/songCollectionRules'
import { LibraryCollectionFilter } from './LibraryCollectionFilter'

interface SongSearchModalProps {
  open: boolean
  onClose: () => void
  onAdd: (songId: string) => Promise<void>
  existingSongIds: Set<string>
}

function SongLyricsPreview({ songId }: { songId: string }) {
  const { song, loading, error } = useSong(songId)
  if (loading) return <p role="status">กำลังโหลดเนื้อเพลง…</p>
  if (error || !song) return <p role="alert">เปิดเนื้อเพลงไม่สำเร็จ</p>

  const sections = (song.sections ?? parseChordLyrics(song.raw_content).sections).flatMap((section) => {
    const lyrics = section.lines.map((line) => line.lyrics).join('\n').trim()
    return lyrics ? [{ label: getSectionDisplayLabel(section), lyrics }] : []
  })
  if (!sections.length) return <p>เพลงนี้ยังไม่มีเนื้อเพลง</p>
  return (
    <div className="grid gap-3">
      {sections.map(({ label, lyrics }, index) => (
        <div key={index} className="min-w-0">
          {label && <p className="text-sm font-medium text-[var(--fg-secondary)]">{label}</p>}
          <p className="whitespace-pre-wrap wrap-anywhere">{lyrics}</p>
        </div>
      ))}
    </div>
  )
}

export function SongSearchModal({ open, onClose, onAdd, existingSongIds }: SongSearchModalProps) {
  const { options } = useLibraryCollections('songs', open)
  const [collectionId, setCollectionId] = useState('')
  const [searchScope, setSearchScope] = useState<'metadata' | 'lyrics'>('metadata')
  const selected = options.find((option) => option.id === collectionId)
  const collection = useMemo(() => selected && prepareSongCollectionFilter(selected.leaves), [selected])
  const { songs, loading, error, searchQuery, setSearchQuery } = useSongs(open, searchScope, {
    collectionDetails: collection?.needsDetails,
  })
  const results = useMemo(() => collection ? songs.filter(collection.includesSong) : songs, [collection, songs])

  const [previewId, setPreviewId] = useState<string>()
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const element = dialog.current
    element?.showModal()
    searchInput.current?.focus()
    return () => { element?.close() }
  }, [open])

  function close() {
    if (adding) return
    dialog.current?.close()
    setPreviewId(undefined)
    setAddError('')
    setAnnouncement('')
    onClose()
  }

  async function handleAdd(song: CollectionSong) {
    if (adding) return
    setAddError('')
    setAnnouncement('')
    setAdding(true)
    try {
      await onAdd(song.id)
      setAnnouncement(`เพิ่ม ${song.title} ลงในเพลย์ลิสต์แล้ว`)
    } catch {
      setAddError('เพิ่มเพลงไม่ได้ กรุณาลองอีกครั้ง')
    } finally {
      setAdding(false)
    }
  }

  if (!open) return null

  return (
    <dialog ref={dialog} aria-labelledby={`${id}-title`}
      className="surface fixed inset-0 m-auto! w-[min(38rem,calc(100%-1rem))] max-w-none overflow-hidden text-[var(--fg-primary)] backdrop:bg-black/70"
      onCancel={(event) => { event.preventDefault(); close() }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect()
        if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) close()
      }}>
      <div className="flex max-h-[min(44rem,calc(100dvh-1rem))] min-h-0 flex-col">
        <header className="grid shrink-0 gap-3 border-b border-[var(--border-subtle)] p-4!">
          <div className="flex items-center justify-between gap-2">
            <h2 id={`${id}-title`}>เพิ่มเพลงในเพลย์ลิสต์</h2>
            <button type="button" className="btn-secondary shrink-0" disabled={adding} onClick={close}>ปิด</button>
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="grid min-w-0 gap-1">
              ค้นหาเพลง
              <input ref={searchInput} type="search" value={searchQuery} onChange={(event) => {
                setSearchQuery(event.target.value)
                setPreviewId(undefined)
              }} className="input-field" />
            </label>
            <div className="grid min-w-0 gap-1">
              <label htmlFor={`${id}-scope`}>ค้นหาจาก</label>
              <select id={`${id}-scope`} value={searchScope} className="input-field"
                onChange={(event) => {
                  setSearchScope(event.target.value === 'lyrics' ? 'lyrics' : 'metadata')
                  setPreviewId(undefined)
                }}>
                <option value="metadata">ชื่อเพลงหรือศิลปิน</option>
                <option value="lyrics">เนื้อเพลง</option>
              </select>
            </div>
          </div>
          <LibraryCollectionFilter label="กลุ่มเพลง" filter={{ options, selected, select: (value) => {
            setCollectionId(value)
            setPreviewId(undefined)
          } }} />
        </header>

        {addError && <p role="alert" className="px-4! pt-2! text-sm text-[var(--status-error-text)]">{addError}</p>}
        <p role="status" className={announcement ? 'px-4! pt-2! text-sm text-[var(--accent)]' : 'sr-only'}>{announcement}</p>
        <div className="min-h-0 overflow-y-auto">
          {loading && <p role="status" className="p-4! text-[var(--fg-secondary)]">กำลังค้นหาเพลง…</p>}
          {!loading && error && <p role="alert" className="p-4! text-[var(--status-error-text)]">โหลดรายการเพลงไม่ได้</p>}
          {!loading && !error && !results.length && (
            <p className="p-4! text-[var(--fg-secondary)]" role="status">
              {searchQuery.trim() ? 'ไม่พบเพลงที่ตรงกับคำค้น' : selected ? 'ยังไม่มีเพลงจากกลุ่มนี้ในคลัง' : 'ยังไม่มีเพลงในคลัง'}
            </p>
          )}
          {!loading && !error && results.length > 0 && (
            <ul className="divide-y divide-[var(--border-subtle)]" aria-label="ผลการค้นหาเพลง">
              {results.map((song) => {
                const isPreview = previewId === song.id
                const addLabel = existingSongIds.has(song.id) ? 'เพิ่มอีกครั้ง' : 'เพิ่ม'
                const previewLabel = isPreview ? 'ซ่อนเนื้อเพลง' : 'ดูเนื้อเพลง'
                return (
                  <li key={song.id} className="grid min-w-0 gap-2 px-4! py-3!">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-[1_0_12rem]">
                        <p className="font-medium wrap-anywhere">{song.title}</p>
                        <p className="text-sm text-[var(--fg-secondary)] wrap-anywhere">
                          {song.artist && `${song.artist} · `}คีย์ {song.original_key}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-secondary min-h-10" aria-expanded={isPreview}
                          aria-label={`${previewLabel} ${song.title}`}
                          onClick={() => setPreviewId(isPreview ? undefined : song.id)}>{previewLabel}</button>
                        <button type="button" className="btn-secondary min-h-10 aria-disabled:cursor-wait aria-disabled:opacity-60"
                          aria-disabled={adding}
                          aria-label={`${addLabel} ${song.title}`} onClick={() => void handleAdd(song)}>{addLabel}</button>
                      </div>
                    </div>
                    {isPreview && <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] p-3!">
                      <SongLyricsPreview songId={song.id} />
                    </div>}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </dialog>
  )
}
