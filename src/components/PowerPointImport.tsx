/** Reviews a PowerPoint deck and imports its slides into the design library. */

import { useState, type FormEvent } from 'react'
import type { DesignInput } from '../hooks/useSlideDesigns'
import type { PowerPointDeck } from '../utils/powerPoint'
import { savePowerPointSlideImages, sortPowerPointSlideImages } from '../utils/powerPointSlideImages'
import { createPowerPointMediaResolver, suppliedPowerPointMedia } from '../utils/powerPoint/linkedMedia'

type Props = {
  store: (designs: DesignInput[]) => Promise<number>
  onImported: (id: string) => Promise<void>
}

export function PowerPointImport({ store, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const [showMedia, setShowMedia] = useState(false)
  const [deck, setDeck] = useState<PowerPointDeck | null>(null)
  const [busy, setBusy] = useState<'review' | 'save' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || busy) return
    setBusy('review')
    setError('')
    setNotice('')
    setDeck(null)
    try {
      const { reviewPowerPoint } = await import('../utils/powerPoint')
      const result = await reviewPowerPoint(file, undefined, createPowerPointMediaResolver(suppliedPowerPointMedia(mediaFiles)))
      setDeck(result)
      if (result.unresolvedMedia?.length) setShowMedia(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'อ่านไฟล์ PowerPoint ไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    if (!deck || busy) return
    setBusy('save')
    setNotice('')
    setError('')
    try {
      const { savePowerPointDesign } = await import('../utils/powerPoint')
      const row = await savePowerPointDesign(deck)
      const added = await store([row])
      await onImported(row.id)
      setNotice(added ? 'เพิ่มงานนำเสนอ PowerPoint เข้าคลังแล้ว' : 'บันทึกงานนำเสนอ PowerPoint ในคลังแล้ว')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'นำเข้า PowerPoint ไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  return (
    <details className="surface min-w-0 p-4! sm:p-5!">
      <summary className="cursor-pointer font-medium">นำเข้า PowerPoint</summary>
      <form className="mt-3! flex flex-col items-start gap-3" onSubmit={inspect}>
        <div className="flex w-full min-w-0 flex-col gap-2 text-sm">
          <label htmlFor="powerpoint-file">ไฟล์ PowerPoint (.pptx หรือ .ppt)</label>
          <span id="powerpoint-file-help" className="text-[var(--fg-secondary)]">WorshipTeam Desktop ใช้ LibreOffice Impress เปิดไฟล์ .ppt และสร้างภาพนิ่งสำหรับสไลด์ที่มีตาราง แผนภูมิ หรือรูปทรงซับซ้อน</span>
          <input id="powerpoint-file" type="file" className="input-field min-w-0" accept=".pptx,.ppt" required disabled={Boolean(busy)} aria-describedby="powerpoint-file-help"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null)
              setMediaFiles([])
              setShowMedia(false)
              setDeck(null)
              setNotice('')
              setError('')
            }} />
        </div>
        {showMedia && <div className="flex w-full min-w-0 flex-col gap-2 text-sm">
          <label htmlFor="powerpoint-linked-media">ไฟล์เสียงหรือวิดีโอที่ PowerPoint ลิงก์ไว้</label>
          <input id="powerpoint-linked-media" type="file" accept="audio/*,video/*,.m4v,.mov,.opus" multiple className="input-field min-w-0"
            disabled={Boolean(busy)} onChange={(event) => {
              setMediaFiles(Array.from(event.target.files ?? []))
              setDeck(null)
              setNotice('')
              setError('')
            }} />
        </div>}
        <button type="submit" className="btn-secondary" disabled={Boolean(busy)}>ตรวจไฟล์ PowerPoint</button>
      </form>
      {busy === 'review' && <p className="mt-3! text-sm" role="status">กำลังอ่านสไลด์ PowerPoint…</p>}
      {error && <p className="mt-3! text-sm wrap-anywhere text-[var(--status-error-text)]" role="alert">{error}</p>}
      {deck && (
        <div className="mt-4! flex min-w-0 flex-col items-start gap-3">
          <p className="text-sm wrap-anywhere" role="status">
            {deck.title} · {deck.content.slides.length} สไลด์
            {deck.renderedImages?.size ? ` · มีภาพนิ่ง ${deck.renderedImages.size} สไลด์` : ''}
          </p>
          {deck.unresolvedMedia?.length ? <ul className="text-sm text-[var(--fg-secondary)]" aria-label="สื่อ PowerPoint ที่ยังขาด">
            {deck.unresolvedMedia.map((warning) => <li key={warning} className="wrap-anywhere">{warning}</li>)}
          </ul> : null}
          {deck.content.warnings?.length ? (
            <details className="text-sm text-[var(--fg-secondary)]">
              <summary className="cursor-pointer">รายละเอียดการแปลงสไลด์</summary>
              <ul className="mt-2! space-y-1">{deck.content.warnings.filter((warning) => !deck.unresolvedMedia?.includes(warning))
                .map((warning) => <li key={warning} className="wrap-anywhere">{warning}</li>)}</ul>
            </details>
          ) : null}
          <button type="button" className="btn-primary" disabled={Boolean(busy)} onClick={() => void save()}>นำเข้าสไลด์ PowerPoint</button>
        </div>
      )}
      {busy === 'save' && <p className="mt-3! text-sm" role="status">กำลังเก็บสไลด์และภาพ…</p>}
      {notice && <p className="mt-3! text-sm" role="status">{notice}</p>}
      <PowerPointImageImport store={store} onImported={onImported} disabled={Boolean(busy)} />
    </details>
  )
}

function PowerPointImageImport({ store, onImported, disabled }: Props & { disabled: boolean }) {
  const [files, setFiles] = useState<File[]>([])
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || disabled || !files.length || !title.trim()) return
    setSaving(true)
    setNotice('')
    setError('')
    try {
      const deck = await savePowerPointSlideImages(files, title)
      const added = await store([deck])
      await onImported(deck.id)
      setNotice(added ? 'เพิ่มชุดภาพสไลด์เข้าคลังแล้ว' : 'ชุดภาพสไลด์นี้อยู่ในคลังแล้ว')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'นำเข้าชุดภาพไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <details className="mt-4! border-t border-[var(--border-subtle)] pt-3! text-sm">
      <summary className="cursor-pointer">นำเข้าชุดภาพที่ส่งออกจาก PowerPoint</summary>
      <form onSubmit={save} className="mt-3! flex min-w-0 flex-col items-start gap-3">
        <label className="flex w-full min-w-0 flex-col gap-2">ชื่อชุดภาพสไลด์
          <input className="input-field" value={title} required disabled={saving || disabled}
            onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="flex w-full min-w-0 flex-col gap-2">ไฟล์ภาพสไลด์
          <input className="input-field min-w-0" type="file" accept="image/*" multiple required disabled={saving || disabled}
            onChange={(event) => {
              setFiles(sortPowerPointSlideImages(Array.from(event.target.files ?? [])))
              setNotice('')
              setError('')
            }} />
        </label>
        {files.length > 0 && (
          <ol className="max-h-40 w-full list-inside list-decimal overflow-y-auto text-[var(--fg-secondary)]" aria-label="ลำดับภาพสไลด์">
            {files.map((file, index) => <li key={index} className="wrap-anywhere">{file.name}</li>)}
          </ol>
        )}
        <button type="submit" className="btn-secondary" disabled={saving || disabled || !title.trim() || !files.length}>นำเข้าชุดภาพสไลด์</button>
      </form>
      {saving && <p className="mt-3!" role="status">กำลังเก็บภาพสไลด์…</p>}
      {error && <p className="mt-3! wrap-anywhere text-[var(--status-error-text)]" role="alert">{error}</p>}
      {notice && <p className="mt-3!" role="status">{notice}</p>}
    </details>
  )
}
