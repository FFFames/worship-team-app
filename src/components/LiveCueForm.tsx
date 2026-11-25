/** Adds a webpage or a portable camera reference to a service playlist. */

import { useRef, useState, type FormEvent } from 'react'
import { useAppendPlaylistCue } from '../hooks/useAppendPlaylistCue'
import type { PlaylistCue } from '../types/database'
import { presentationWebUrl, webPlaylistCue } from '../utils/livePresentation'

export function LiveCueForm({ playlistId, onSaved }: { playlistId: string; onSaved: () => Promise<unknown> }) {
  const appendCue = useAppendPlaylistCue()
  const [kind, setKind] = useState<'web' | 'camera'>('web')
  const [title, setTitle] = useState('')
  const [address, setAddress] = useState('')
  const [hideScrollbars, setHideScrollbars] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const pending = useRef<{ key: string; id: string } | null>(null)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const url = kind === 'web' ? presentationWebUrl(address) : undefined
    if (kind === 'web' && !url) {
      setError('ใส่ที่อยู่เว็บแบบ HTTPS หรือ HTTP')
      return
    }
    const label = title.trim() || (url ? new URL(url).hostname : 'กล้อง')
    const cue: PlaylistCue = url ? webPlaylistCue(label, url, hideScrollbars)
      : { kind: 'camera', label, slides: [{ label, lines: [], assets: [{ kind: 'camera', filename: label, role: 'foreground' }] }] }
    const key = JSON.stringify([playlistId, cue])
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() }

    setBusy(true)
    setError('')
    setNotice('')
    try {
      await appendCue(playlistId, pending.current.id, cue)
      pending.current = null
      setTitle('')
      setAddress('')
      setHideScrollbars(false)
      setNotice(`เพิ่ม “${label}” ในเพลย์ลิสต์แล้ว`)
      await onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เพิ่มรายการไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="surface mx-4! mb-3! p-3!">
      <summary className="cursor-pointer font-medium">เพิ่มเว็บหรือกล้อง</summary>
      <form onSubmit={save} className="mt-3! flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          ประเภทรายการสด
          <select className="input-field" value={kind} disabled={busy} onChange={(event) => {
            setKind(event.target.value === 'camera' ? 'camera' : 'web')
            setError('')
            setNotice('')
          }}>
            <option value="web">เว็บ</option>
            <option value="camera">กล้อง</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-1 basis-40 flex-col gap-1 text-sm">
          ชื่อรายการสด
          <input className="input-field min-w-0" value={title} maxLength={200} disabled={busy}
            onChange={(event) => setTitle(event.target.value)} />
        </label>
        {kind === 'web' && (
          <label className="flex min-w-0 flex-1 basis-52 flex-col gap-1 text-sm">
            ที่อยู่เว็บ
            <input type="url" className="input-field min-w-0" value={address} required maxLength={4096} disabled={busy}
              onChange={(event) => setAddress(event.target.value)} />
          </label>
        )}
        {kind === 'web' && <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={hideScrollbars} disabled={busy} onChange={(event) => setHideScrollbars(event.target.checked)} />
          ซ่อนแถบเลื่อน
        </label>}
        <button type="submit" disabled={busy} className="btn-primary">เพิ่มรายการสด</button>
        {kind === 'camera' && <p className="w-full text-sm text-[var(--fg-secondary)]">
          {window.worshipNdiInput ? 'เลือกรับภาพจากกล้องหรือแหล่ง NDI ในหน้าควบคุมการนำเสนอ' : 'เลือกอุปกรณ์กล้องจากเครื่องที่ใช้ขึ้นจอ'}
        </p>}
      </form>
      {notice && <p role="status" className="mt-2! text-sm">{notice}</p>}
      {error && <p role="alert" className="mt-2! text-sm wrap-anywhere text-[var(--status-error-text)]">{error}</p>}
    </details>
  )
}
