/** Reviews two presentation versions before changing either the playlist or the library. */

import { useId, useRef, useState } from 'react'
import { LayeredSlide } from './LayeredSlide'
import { comparePlaylistPresentation, reconcilePlaylistPresentation } from '../hooks/usePlaylistPresentationReconciliation'
import type { PlaylistSong } from '../types/database'
import type { DesignContent, LibraryDesign } from '../types/slideDesign'
import { isPresentationCue, presentationContentFromCue, type PresentationCue, type PresentationDecision } from '../utils/playlistPresentationReconciliation'

function PresentationVersion({ label, content, playlistId }: { label: string; content?: DesignContent; playlistId?: string }) {
  const id = useId()
  const [position, setPosition] = useState(0)
  const slide = content?.slides[position] ?? content?.slides[0]
  return (
    <section className="grid min-w-0 content-start gap-2 rounded-lg border border-[var(--border-subtle)] p-3">
      <h4 className="font-medium">{label}</h4>
      {slide && content ? (
        <>
          <div className="aspect-video overflow-hidden rounded-lg bg-black"><LayeredSlide design={slide.design} playlistId={playlistId} preview /></div>
          <label className="text-sm" htmlFor={id}>สไลด์{label}</label>
          <select id={id} className="input-field min-w-0" value={content.slides.indexOf(slide)} onChange={(event) => setPosition(Number(event.target.value))}>
            {content.slides.map((item, index) => <option key={index} value={index}>{index + 1}/{content.slides.length} · {item.label}</option>)}
          </select>
          {slide.design.soundtracks?.length ? <p className="wrap-anywhere text-xs text-[var(--fg-secondary)]">
            เสียงประกอบ {slide.design.soundtracks.map((track) => track.filename).join(' · ')}
          </p> : null}
        </>
      ) : <p className="text-sm text-[var(--fg-secondary)]">เลือกฉบับในคลังเพื่อดูตัวอย่าง</p>}
    </section>
  )
}

interface Review {
  entry: PlaylistSong
  cue: PresentationCue
  content: DesignContent
  candidates: LibraryDesign[]
  newId: string
}

export function PlaylistPresentationReconciliation({ entries, onRefresh }: {
  entries: PlaylistSong[]
  onRefresh: () => Promise<void>
}) {
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const [entryId, setEntryId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [review, setReview] = useState<Review>()
  const [action, setAction] = useState<PresentationDecision | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const options = entries.flatMap((entry, index) => isPresentationCue(entry.cue) ? [{ entry, cue: entry.cue, position: index + 1 }] : [])
  const item = options.find(({ entry }) => entry.id === entryId) ?? options[0]
  const target = review?.candidates.find((candidate) => candidate.id === targetId)
  const canSave = Boolean(action && (action === 'add' || target) && !busy)

  async function compare() {
    if (!item || busy) return
    setBusy(true)
    setReview(undefined)
    setAction('')
    setError('')
    setNotice('')
    const { entry, cue } = item
    try {
      const { candidates, preferred } = await comparePlaylistPresentation(cue)
      setTargetId(preferred?.id ?? '')
      setReview({ entry, cue, candidates, content: presentationContentFromCue(cue), newId: crypto.randomUUID() })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เปิดฉบับในคลังไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!canSave || !action || !review) return
    setBusy(true)
    setError('')
    dialog.current?.close()
    try {
      const destination = action === 'add' ? undefined : target
      const warnings = await reconcilePlaylistPresentation(review.entry, review.cue, action, destination?.id ?? review.newId, destination)
      setNotice(['บันทึกการตรวจงานนำเสนอแล้ว', ...warnings].join(' · '))
      setReview(undefined)
      setAction('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'บันทึกงานนำเสนอไม่สำเร็จ')
    } finally {
      await onRefresh()
      setBusy(false)
    }
  }

  if (!item) return null

  return (
    <details className="surface mb-4 p-4">
      <summary className="cursor-pointer font-medium">ตรวจงานนำเสนอในตารางเทียบกับคลัง</summary>
      <div className="mt-4 grid gap-4" aria-busy={busy}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid min-w-0 gap-1">
            <label htmlFor={`${id}-entry`}>งานนำเสนอในตาราง</label>
            <select id={`${id}-entry`} className="input-field min-w-0" value={item.entry.id} disabled={busy} onChange={(event) => {
              setEntryId(event.target.value)
              setReview(undefined)
              setError('')
              setNotice('')
            }}>
              {options.map(({ entry, cue, position }) => <option key={entry.id} value={entry.id}>{position}. {cue.label}</option>)}
            </select>
          </div>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void compare()}>ตรวจฉบับงานนำเสนอ</button>
        </div>
        {review?.entry.id === item.entry.id && (
          <>
            {review.candidates.length ? <div className="grid min-w-0 gap-1">
              <label htmlFor={`${id}-target`}>งานนำเสนอในคลังที่ใช้เทียบ</label>
              <select id={`${id}-target`} className="input-field min-w-0" value={targetId} disabled={busy} onChange={(event) => {
                setTargetId(event.target.value)
                setAction('')
              }}>
                <option value="">เลือกงานนำเสนอในคลัง</option>
                {review.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>
                  {[candidate.title, candidate.content.source?.author, `${candidate.content.slides.length} สไลด์`, candidate.id === review.cue.libraryDesignId && 'ลิงก์อยู่'].filter(Boolean).join(' · ')}
                </option>)}
              </select>
            </div> : <p className="text-sm text-[var(--fg-secondary)]">ไม่พบฉบับที่ตรงกันในคลัง</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <PresentationVersion key={review.newId} label="ฉบับในตาราง" content={review.content} playlistId={review.entry.playlist_id} />
              <PresentationVersion key={targetId} label="ฉบับในคลัง" content={target?.content} />
            </div>
            {review.content.warnings?.map((warning) => <p key={warning} className="text-sm text-[var(--fg-secondary)]">{warning}</p>)}
            <div className="grid min-w-0 gap-1">
              <label htmlFor={`${id}-action`}>การดำเนินการกับงานนำเสนอ</label>
              <select id={`${id}-action`} className="input-field min-w-0" value={action} disabled={busy}
                onChange={(event) => setAction(event.target.value as PresentationDecision | '')}>
                <option value="">คงฉบับเดิม</option>
                <option value="add">เพิ่มเป็นงานนำเสนอใหม่ในคลัง</option>
                <option value="replace" disabled={!target}>แทนที่สไลด์ในคลัง</option>
                <option value="use_library" disabled={!target}>ใช้ฉบับจากคลังในตาราง</option>
              </select>
            </div>
            <div><button type="button" className="btn-primary" disabled={!canSave} onClick={() => {
              if (action === 'add') void save()
              else dialog.current?.showModal()
            }}>บันทึกการตรวจงานนำเสนอ</button></div>
          </>
        )}
        {error && <p role="alert" className="text-sm text-[var(--status-error-text)]">{error}</p>}
        {notice && <p role="status" className="text-sm text-[var(--fg-secondary)]">{notice}</p>}
      </div>
      <dialog ref={dialog} role="alertdialog" aria-labelledby={`${id}-confirm`} aria-describedby={`${id}-effects`}
        className="surface fixed inset-0 m-auto w-[min(26rem,calc(100%-2rem))] p-5 text-[var(--fg-primary)] backdrop:bg-black/70">
        <h4 id={`${id}-confirm`} className="font-medium">{action === 'replace' ? 'แทนที่สไลด์ในคลัง' : 'ใช้ฉบับจากคลังในตาราง'}</h4>
        <p id={`${id}-effects`} className="my-3 text-sm text-[var(--fg-secondary)]">{action === 'replace'
          ? `คลังจะใช้สไลด์จากตารางแทนสไลด์เดิมของ ${target?.title ?? ''}`
          : `สไลด์และสื่อของรายการนี้จะเปลี่ยนเป็นฉบับ ${target?.title ?? ''} จากคลัง`}</p>
        <form method="dialog" className="flex flex-wrap justify-end gap-2">
          <button type="submit" className="btn-secondary" autoFocus>ยกเลิก</button>
          <button type="button" className="btn-primary" onClick={() => void save()}>ยืนยัน</button>
        </form>
      </dialog>
    </details>
  )
}
