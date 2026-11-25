/** Presents a URL immediately or saves it for the service. */

import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAppendPlaylistCue } from '../hooks/useAppendPlaylistCue'
import { useStandalonePresenter } from '../hooks/useStandalonePresenter'
import type { Playlist } from '../types/database'
import { presentationWebUrl, webPlaylistCue } from '../utils/livePresentation'

export function WebPresentationPanel({ playlists, initialPlaylist }: { playlists: Playlist[]; initialPlaylist: string }) {
  const append = useAppendPlaylistCue()
  const send = useStandalonePresenter('web')
  const [address, setAddress] = useState('')
  const [title, setTitle] = useState('')
  const [playlistId, setPlaylistId] = useState(initialPlaylist)
  const [hideScrollbars, setHideScrollbars] = useState(false)
  const [live, setLive] = useState('')
  const [savedPlaylist, setSavedPlaylist] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef<{ key: string; id: string } | null>(null)
  const url = presentationWebUrl(address)
  const target = playlists.find((playlist) => playlist.id === playlistId)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError('')
    setSavedPlaylist('')
    if (!url) {
      setError('ใส่ที่อยู่เว็บแบบ HTTPS หรือ HTTP')
      return
    }

    const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value')
    const label = title.trim() || new URL(url).hostname
    try {
      if (action !== 'add') {
        send({ type: 'SHOW_LYRICS', lyrics: '', media: { kind: 'web', url, hideScrollbars, runId: crypto.randomUUID() } })
        setLive(label)
        return
      }
      if (!target) return
      const cue = webPlaylistCue(label, url, hideScrollbars)
      const key = JSON.stringify([target.id, cue])
      if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() }
      setBusy(true)
      await append(target.id, pending.current.id, cue)
      pending.current = null
      setSavedPlaylist(target.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เปิดเว็บหรือเพิ่มลงเพลย์ลิสต์ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="surface max-w-3xl p-4! sm:p-5!">
      <h2 className="mb-3! text-lg font-medium">เว็บขึ้นจอ</h2>
      <form onSubmit={submit} className="grid gap-3">
        <label className="flex flex-col gap-1 text-sm">
          ที่อยู่เว็บ
          <input type="url" inputMode="url" className="input-field" value={address} maxLength={4096}
            placeholder="https://" required disabled={busy} onChange={(event) => setAddress(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          ชื่อรายการเว็บ
          <input className="input-field" value={title} maxLength={200} disabled={busy} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={hideScrollbars} disabled={busy} onChange={(event) => setHideScrollbars(event.target.checked)} />
          ซ่อนแถบเลื่อน
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" value="present" className="btn-primary" disabled={busy}>ขึ้นจอผู้ชม</button>
          {live && <button type="button" className="btn-secondary" onClick={() => {
            send({ type: 'SHOW_BLACK' }, false)
            setLive('')
          }}>ล้างจอผู้ชม</button>}
          {url && <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary">เปิดเว็บโดยตรง</a>}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            เลือกเพลย์ลิสต์
            <select className="input-field" value={target?.id ?? ''} disabled={busy} onChange={(event) => setPlaylistId(event.target.value)}>
              <option value="">เลือกเพลย์ลิสต์</option>
              {playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
            </select>
          </label>
          <button type="submit" value="add" className="btn-secondary" disabled={busy || !target}>เพิ่มเว็บในเพลย์ลิสต์</button>
        </div>
      </form>
      {live && <p role="status" className="mt-3! wrap-anywhere text-sm">กำลังแสดง {live}</p>}
      {savedPlaylist && <p role="status" className="mt-3! flex flex-wrap items-center gap-2 text-sm">
        เพิ่มเว็บในเพลย์ลิสต์แล้ว <Link className="btn-secondary" to={`/playlists/${savedPlaylist}`}>เปิดเพลย์ลิสต์</Link>
      </p>}
      {error && <p role="alert" className="mt-3! wrap-anywhere text-sm text-[var(--status-error-text)]">{error}</p>}
    </section>
  )
}
