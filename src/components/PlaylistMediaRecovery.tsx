/** Adds file attachments from saved schedules to the browser's media catalog. */

import { useMemo, useState } from 'react'
import type { PlaylistSong } from '../types/database'
import { playlistMediaReferences, reviewPlaylistMedia, saveReviewedPlaylistMedia, type ReviewedPlaylistMedia } from '../utils/playlistMediaRecovery'

export function PlaylistMediaRecovery({ entries }: { entries: PlaylistSong[] }) {
  const references = useMemo(() => playlistMediaReferences(entries), [entries])
  const [files, setFiles] = useState<ReviewedPlaylistMedia[]>()
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<'review' | 'save'>()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function review() {
    setPending('review')
    setNotice('')
    setError('')
    try {
      const items = await reviewPlaylistMedia(references)
      setFiles(items)
      setChecked(new Set(items.filter((file) => file.blob).map((file) => file.id)))
    } catch (cause) {
      setFiles(undefined)
      setError(cause instanceof Error ? cause.message : 'ตรวจไฟล์จากตารางไม่สำเร็จ')
    } finally {
      setPending(undefined)
    }
  }

  async function save() {
    if (!files || pending || !checked.size) return
    setPending('save')
    setNotice('')
    setError('')
    const results: ReviewedPlaylistMedia[] = []
    const failed = new Set<string>()
    let added = 0
    for (const item of files) {
      if (!checked.has(item.id)) { results.push(item); continue }
      try {
        const library = await saveReviewedPlaylistMedia(item)
        results.push({ ...item, blob: undefined, problem: undefined, library })
        added++
      } catch (cause) {
        failed.add(item.id)
        results.push({ ...item, problem: cause instanceof Error ? cause.message : 'เพิ่มไฟล์ไม่สำเร็จ' })
      }
    }
    setFiles(results)
    setChecked(failed)
    if (added) setNotice(`เพิ่มสื่อเข้าคลังแล้ว ${added} ไฟล์`)
    if (failed.size) setError(`บันทึกสื่อไม่สำเร็จ ${failed.size} ไฟล์`)
    setPending(undefined)
  }

  if (!references.length) return null

  return (
    <details className="surface mb-4 p-4">
      <summary className="cursor-pointer font-medium">เพิ่มสื่อจากตารางเข้าคลัง</summary>
      <div className="mt-4 grid gap-3" aria-busy={Boolean(pending)}>
        <div><button type="button" className="btn-secondary" disabled={Boolean(pending)} onClick={() => void review()}>
          {pending === 'review' ? 'กำลังตรวจไฟล์ในตาราง…' : 'ตรวจไฟล์สื่อในตาราง'}
        </button></div>
        {files?.length ? (
          <ul className="max-h-80 divide-y divide-[var(--border-subtle)] overflow-auto rounded-lg border border-[var(--border-subtle)]">
            {files.map((file) => (
              <li key={file.id} className="flex min-w-0 items-start gap-3 p-3">
                {file.blob && <input type="checkbox" className="mt-1" checked={checked.has(file.id)} aria-label={`เลือก ${file.filename}`}
                  disabled={Boolean(pending)} onChange={(event) => {
                    const next = new Set(checked)
                    if (event.target.checked) next.add(file.id)
                    else next.delete(file.id)
                    setChecked(next)
                  }} />}
                <div className="min-w-0 wrap-anywhere">
                  <p>{file.filename}</p>
                  <p className="text-sm text-[var(--fg-secondary)]">
                    รายการ {file.positions.join(', ')}{file.library && ` · มีในคลัง ${file.library.name}`}
                  </p>
                  {file.problem && <p className="text-sm text-[var(--status-error-text)]">{file.problem}</p>}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {files?.some((file) => file.blob) && <div><button type="button" className="btn-primary" disabled={Boolean(pending) || !checked.size} onClick={() => void save()}>
          {pending === 'save' ? 'กำลังเพิ่มสื่อ…' : `เพิ่มสื่อที่เลือกเข้าคลัง (${checked.size})`}
        </button></div>}
        {error && <p role="alert" className="text-sm text-[var(--status-error-text)]">{error}</p>}
        {notice && <p role="status" className="text-sm text-[var(--fg-secondary)]">{notice}</p>}
      </div>
    </details>
  )
}
