/** Assigns a local video to a saved DVD clip. */

import { useEffect, useId, useState } from 'react'
import type { DvdClip } from '../types/dvdClip'
import type { MediaLibraryItem } from '../types/media'
import { readDvdReplacement, saveDvdReplacement } from '../utils/dvdReplacement'
import { dvdThumbnailUrl } from '../utils/dvdThumbnail'
import { listLibraryMedia } from '../utils/mediaLibrary'
import { DvdDiscImport } from './DvdDiscImport'

const time = (value: number) => `${Math.floor(value / 60)}:${(value % 60).toFixed(1).padStart(4, '0')}`

export function DvdReplacementControl({ dvd, onApply }: { dvd: DvdClip; onApply: () => void }) {
  const videoField = useId()
  const [videos, setVideos] = useState<MediaLibraryItem[]>([])
  const [draft, setDraft] = useState(() => readDvdReplacement(dvd.id))
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const current = videos.find((item) => item.assetId === draft?.assetId)
  const thumbnail = dvdThumbnailUrl(dvd.thumbnail)
  const chapter = dvd.chapter === undefined ? undefined : dvd.lastChapter === null ? `บทที่ ${dvd.chapter} ถึงจบไตเติล`
    : dvd.lastChapter && dvd.lastChapter > dvd.chapter ? `บทที่ ${dvd.chapter}–${dvd.lastChapter}` : `บทที่ ${dvd.chapter}`
  const details = [dvd.discName, dvd.title === undefined ? undefined : `ไตเติล ${dvd.title}`, chapter].filter(Boolean)

  useEffect(() => {
    let active = true
    void listLibraryMedia().then((items) => {
      if (active) setVideos((current) => [...new Map([...items.filter((item) => item.kind === 'video'), ...current]
        .map((item) => [item.assetId, item])).values()])
    }).catch(() => { if (active) setError('อ่านรายการวิดีโอในเบราว์เซอร์ไม่ได้') })
    return () => { active = false }
  }, [])

  function apply() {
    if (draft?.assetId && !current) return
    setStatus('')
    setError('')
    try {
      saveDvdReplacement(dvd.id, current && draft ? { ...draft, alphaMode: current.alphaMode } : undefined)
      setStatus(current ? `ใช้ ${current.name} แทนคลิป DVD แล้ว` : 'ล้างการจับคู่วิดีโอแล้ว')
      onApply()
    } catch {
      setError('เบราว์เซอร์บันทึกการจับคู่วิดีโอไม่ได้')
    }
  }

  return (
    <section className="rounded-lg border border-[var(--border-subtle)] p-3!">
      <h3 className="wrap-anywhere text-sm font-semibold">{dvd.name}</h3>
      {thumbnail && <img src={thumbnail} alt="ภาพย่อคลิป DVD" className="mt-2! max-h-40 max-w-full rounded-md object-contain" />}
      {details.length > 0 && <p className="mt-1! wrap-anywhere text-sm text-[var(--fg-secondary)]">{details.join(' · ')}</p>}
      {dvd.clip && <p className="mt-1! text-sm text-[var(--fg-secondary)]">
        ช่วงเล่น {time(dvd.clip.startSeconds ?? 0)} ถึง {dvd.clip.endSeconds === undefined ? 'จบไฟล์' : time(dvd.clip.endSeconds)}
      </p>}
      <div className="mt-2! flex min-w-0 flex-col gap-1 text-sm">
        <label htmlFor={videoField}>วิดีโอแทนคลิป DVD</label>
        <select id={videoField} className="input-field min-w-0" value={draft?.assetId ?? ''} onChange={(event) => {
          const assetId = event.target.value
          setDraft(assetId ? { assetId, useMarks: Boolean(draft?.useMarks) } : undefined)
        }}>
          <option value="">เลือกวิดีโอจากคลัง</option>
          {draft?.assetId && !current && <option value={draft.assetId}>วิดีโอที่จับคู่ไว้</option>}
          {videos.map((item) => <option key={item.id} value={item.assetId}>{item.name}</option>)}
        </select>
      </div>
      {current && draft && dvd.clip && <label className="mt-2! flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.useMarks} onChange={(event) => setDraft({ ...draft, useMarks: event.target.checked })} />
        ใช้ช่วงที่บันทึกไว้
      </label>}
      <button type="button" className="btn-secondary mt-2!" disabled={Boolean(draft?.assetId && !current)}
        onClick={apply}>บันทึกการจับคู่วิดีโอ</button>
      <DvdDiscImport dvd={dvd} preferredSubtitle={draft?.subtitle} onImported={(video, selection) => {
        const replacement = { assetId: video.assetId, useMarks: Boolean(dvd.clip), subtitle: selection.subtitle ?? null }
        setVideos((items) => items.some((item) => item.assetId === video.assetId) ? items : [...items, video])
        setDraft(replacement)
        setError('')
        setStatus('')
        try {
          saveDvdReplacement(dvd.id, replacement)
        } catch {
          throw new Error('เก็บวิดีโอในคลังสื่อแล้ว แต่บันทึกการจับคู่คลิป DVD ไม่สำเร็จ')
        }
        setStatus(`บันทึกวิดีโอจาก DVD และจับคู่กับ ${dvd.name} แล้ว`)
        onApply()
      }} />
      {error && <p role="alert" className="mt-2! text-sm text-[var(--status-error-text)]">{error}</p>}
      {status && <p role="status" className="mt-2! wrap-anywhere text-sm">{status}</p>}
    </section>
  )
}
