import { useId, useState } from 'react'
import { useEasyWorshipScheduleSongCatalog, type ReviewedLibrarySong } from '../hooks/useEasyWorshipScheduleSongCatalog'
import { usePlaylistSongReconciliation } from '../hooks/usePlaylistSongReconciliation'
import type { PlaylistSong, Section } from '../types/database'
import { getSectionDisplayLabel } from '../utils/chordParser'
import { lyricsMatch, readCueSongVersion, reviewSongMatches, type SongDecision } from '../utils/playlistSongReconciliation'
import { scheduleSongSourceUid } from '../utils/easyWorshipSongIdentity'
import { songLibrarySections } from '../utils/songLibrarySlides'
import { describeSlidePlayback } from '../utils/slidePlayback'

function SongChart({ title, sections, looping, empty }: { title: string; sections: Section[]; looping?: boolean | null; empty: string }) {
  return (
    <section className="min-w-0 rounded-lg border border-[var(--border-subtle)] p-3">
      <h4 className="mb-2 font-medium">{title}</h4>
      {typeof looping === 'boolean' && <p className="mb-2! text-sm text-[var(--fg-secondary)]">
        {looping ? 'วนกลับสไลด์แรก' : 'จบที่สไลด์สุดท้าย'}
      </p>}
      <div className="max-h-72 overflow-auto text-sm">
        {sections.length === 0 && <p className="text-[var(--fg-secondary)]">{empty}</p>}
        {sections.map((section, index) => (
          <div key={index} className="mb-3 last:mb-0">
            <p className="font-medium">{getSectionDisplayLabel(section)}</p>
            {section.playback && <p className="text-[var(--fg-secondary)]">{describeSlidePlayback(section.playback)}</p>}
            {section.lines.map((line, row) => (
              <div key={row} className="whitespace-pre-wrap wrap-anywhere leading-relaxed">
                {line.chords && <div className="font-mono text-[var(--accent)]">{line.chords}</div>}
                {line.lyrics && <div>{line.lyrics}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

interface Review {
  entry: PlaylistSong
  candidates: ReviewedLibrarySong[]
  sections: Section[]
  newSongId: string
}

export function PlaylistSongReconciliation({ entries, onRefresh }: {
  entries: PlaylistSong[]
  onRefresh: () => Promise<void>
}) {
  const id = useId()
  const lookup = useEasyWorshipScheduleSongCatalog()
  const apply = usePlaylistSongReconciliation()
  const [review, setReview] = useState<Review>()
  const [entryId, setEntryId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [action, setAction] = useState<SongDecision | ''>('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const occurrences = entries.flatMap((entry, index) => entry.cue?.kind === 'song' ? [{ entry, position: index + 1 }] : [])
  const selectedId = occurrences.find(({ entry }) => entry.id === entryId)?.entry.id ?? occurrences[0]?.entry.id ?? ''
  const target = review?.candidates.find((candidate) => candidate.id === targetId)
  const librarySections = target ? songLibrarySections(target) : []
  const needsConfirmation = action === 'replace' || action === 'use_library'

  function resetDecision() {
    setAction('')
    setConfirmed(false)
  }

  async function reviewSong() {
    const entry = occurrences.find((item) => item.entry.id === selectedId)?.entry
    if (!entry?.cue) return
    setBusy(true)
    setError('')
    setNotice('')
    setReview(undefined)
    resetDecision()
    try {
      const songs = await lookup([{ id: entry.song_id, song: { title: entry.cue.label, sourceUid: scheduleSongSourceUid(entry.cue) } }])
      const { sections } = readCueSongVersion(entry.cue)
      const { candidates, suggested } = reviewSongMatches(entry.cue, entry.song_id, songs, sections)
      setTargetId(suggested?.id ?? '')
      setReview({ entry, candidates, sections, newSongId: crypto.randomUUID() })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ตรวจเพลงกับคลังไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function saveDecision() {
    if (busy || !review || !action || (needsConfirmation && !confirmed) || (action !== 'add' && !target)) return
    setBusy(true)
    setError('')
    try {
      const destination = action === 'add' ? undefined : target
      const { warnings } = await apply(review.entry, action, destination?.id ?? review.newSongId, destination)
      setNotice(['บันทึกการตรวจเพลงแล้ว', ...warnings].join(' · '))
      setReview(undefined)
      resetDecision()
      await onRefresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'บันทึกการตรวจเพลงไม่สำเร็จ')
      await onRefresh()
    } finally {
      setBusy(false)
    }
  }

  if (!occurrences.length && !notice) return null

  return (
    <details className="surface mb-4 p-4">
      <summary className="cursor-pointer font-medium">ตรวจเพลงในตารางเทียบกับคลัง</summary>
      <div className="mt-4 grid gap-4">
        {occurrences.length > 0 && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid min-w-0 gap-1">
              <label htmlFor={`${id}-entry`}>เพลงในตาราง</label>
              <select id={`${id}-entry`} className="input-field" value={selectedId} disabled={busy} onChange={(event) => {
                setEntryId(event.target.value)
                setReview(undefined)
                setError('')
                setNotice('')
                resetDecision()
              }}>
                {occurrences.map(({ entry, position }) => (
                  <option key={entry.id} value={entry.id}>{position}. {entry.cue?.label}</option>
                ))}
              </select>
            </div>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void reviewSong()}>ตรวจฉบับเพลง</button>
          </div>
        )}

        {review && review.entry.id === selectedId && (
          <>
            {review.candidates.length > 0 && (
              <div className="grid min-w-0 gap-1">
                <label htmlFor={`${id}-target`}>เพลงในคลังที่ใช้เทียบ</label>
                <select id={`${id}-target`} className="input-field" value={targetId} disabled={busy} onChange={(event) => {
                  setTargetId(event.target.value)
                  resetDecision()
                }}>
                  <option value="">เลือกเพลงในคลัง</option>
                  {review.candidates.map((song) => (
                    <option key={song.id} value={song.id}>
                      {[song.title, song.artist, song.original_key, song.ccli_number && `CCLI ${song.ccli_number}`, song.id === review.entry.song_id && 'ลิงก์อยู่'].filter(Boolean).join(' · ')}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {target && <p className="text-sm text-[var(--fg-secondary)]">
              {target.easyworship_uid && review.entry.cue && target.easyworship_uid === scheduleSongSourceUid(review.entry.cue) && 'รหัส EasyWorship ตรงกัน · '}
              {lyricsMatch(review.sections, librarySections) ? 'เนื้อร้องตรงกัน' : 'เนื้อร้องต่างกัน'}
            </p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <SongChart title="ฉบับในตาราง" sections={review.sections} looping={review.entry.cue?.looping}
                empty="ไม่พบเนื้อร้องหรือคอร์ดในตาราง" />
              <SongChart title="ฉบับในคลัง" sections={librarySections} looping={target?.looping}
                empty={review.candidates.length ? 'เลือกเพลงในคลังเพื่อดูฉบับเทียบ' : 'ไม่พบเพลงที่ตรงกันในคลัง'} />
            </div>
            <div className="grid min-w-0 gap-1">
              <label htmlFor={`${id}-action`}>การดำเนินการ</label>
              <select id={`${id}-action`} className="input-field" value={action} disabled={busy} onChange={(event) => {
                setAction(event.target.value as SongDecision | '')
                setConfirmed(false)
              }}>
                <option value="">คงเพลงเดิม</option>
                <option value="add" disabled={!review.sections.length}>เพิ่มเป็นเพลงใหม่ในคลัง</option>
                <option value="replace" disabled={!target || !review.sections.length}>แทนที่เนื้อเพลงในคลัง</option>
                <option value="link" disabled={!target}>ลิงก์เพลงในคลังและเก็บฉบับตาราง</option>
                <option value="use_library" disabled={!target}>ใช้ฉบับจากคลังในตาราง</option>
              </select>
            </div>
            {needsConfirmation && (
              <label className="flex items-start gap-2 text-sm text-[var(--fg-secondary)]">
                <input type="checkbox" className="mt-1" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />
                {action === 'replace'
                  ? 'ยืนยันการอัปเดตเนื้อร้อง คอร์ด และรูปแบบในคลัง ตารางที่ใช้ฉบับจากคลังจะเห็นการเปลี่ยนแปลงนี้ด้วย'
                  : 'ยืนยันใช้ฉบับคลังแทนสไลด์และโน้ตเฉพาะรายการนี้'}
              </label>
            )}
            <div>
              <button type="button" className="btn-primary" disabled={busy || !action || (needsConfirmation && !confirmed)} onClick={() => void saveDecision()}>
                บันทึกการตรวจเพลง
              </button>
            </div>
          </>
        )}
        {error && <p role="alert" className="text-sm text-[var(--status-error-text)]">{error}</p>}
        {notice && <p role="status" className="text-sm text-[var(--fg-secondary)]">{notice}</p>}
      </div>
    </details>
  )
}
