/** Presents or schedules migrated DVD definitions. */

import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { DvdClip } from '../types/dvdClip'
import type { Playlist, PlaylistCue } from '../types/database'
import { useAppendPlaylistCue } from '../hooks/useAppendPlaylistCue'
import { useStandalonePresenter } from '../hooks/useStandalonePresenter'
import { resolveDvdAsset } from '../utils/dvdReplacement'
import { readLibraryMedia } from '../utils/mediaLibrary'
import { DvdClipEditor } from './DvdClipEditor'
import { DvdReplacementControl } from './DvdReplacementControl'

export function DvdClipLibrary({ clips, playlists, initialPlaylist, filtered, onChanged }: {
  clips: DvdClip[]; playlists: Playlist[]; initialPlaylist: string; filtered: boolean; onChanged: (created?: boolean) => Promise<void>
}) {
  const append = useAppendPlaylistCue()
  const send = useStandalonePresenter('media')
  const clipField = useId()
  const playlistField = useId()
  const [selected, setSelected] = useState('')
  const [playlist, setPlaylist] = useState(initialPlaylist)
  const [live, setLive] = useState('')
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editor, setEditor] = useState<'new' | DvdClip>()
  const [notice, setNotice] = useState('')
  const addButton = useRef<HTMLButtonElement>(null)
  const editButton = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<'new' | 'edit' | undefined>(undefined)
  const pending = useRef<{ key: string; id: string } | undefined>(undefined)
  const liveRun = useRef<string | undefined>(undefined)
  const dvd = clips.find((clip) => clip.id === selected) ?? clips[0]
  const target = playlists.find((item) => item.id === playlist)

  useEffect(() => {
    if (editor || !returnFocus.current) return
    const button = returnFocus.current === 'edit' ? editButton.current : addButton.current
    button?.focus()
    returnFocus.current = undefined
  }, [editor])

  function goLive() {
    if (!dvd) return
    setError('')
    const video = resolveDvdAsset({ dvd })
    if (!video.libraryId) {
      setError('เลือกวิดีโอแทนคลิป DVD ก่อนขึ้นจอ')
      return
    }
    try {
      const runId = crypto.randomUUID()
      send({ type: 'SHOW_LYRICS', lyrics: '', media: { kind: 'video', libraryId: video.libraryId, clip: video.clip, alphaMode: video.alphaMode,
        runId, repeat: dvd.repeat, dvdPlayback: dvd.playback } })
      liveRun.current = runId
      setLive(dvd.name)
      void readLibraryMedia(video.libraryId).catch(() => null).then((blob) => {
        if (blob || liveRun.current !== runId) return
        setError('ไม่พบไฟล์วิดีโอที่จับคู่ไว้ในคลังสื่อ')
        send({ type: 'SHOW_BLACK' }, false)
        setLive('')
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เปิดคลิปบนจอผู้ชมไม่สำเร็จ')
    }
  }

  async function schedule() {
    if (!target || !dvd || busy) return
    setError('')
    setSaved('')
    const cue: PlaylistCue = { kind: 'video', label: dvd.name, slides: [{ label: dvd.name, lines: [], assets: [
      { kind: 'video', filename: dvd.name, role: 'foreground', dvd, repeat: dvd.repeat },
    ] }] }
    const key = JSON.stringify([target.id, cue])
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() }
    setBusy(true)
    try {
      await append(target.id, pending.current.id, cue)
      pending.current = undefined
      setSaved(target.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เพิ่มคลิป DVD ไม่สำเร็จ')
    } finally { setBusy(false) }
  }

  const change = (created?: boolean) => { void onChanged(created).catch(() => setError('โหลดรายการในคลังสื่อใหม่ไม่สำเร็จ')) }

  return (
    <section className="surface max-w-4xl p-4!">
      <div className="mb-3! flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium">คลิป DVD</h2>
        {!editor && <div className="flex gap-2">
          {dvd && <button ref={editButton} type="button" className="btn-secondary" onClick={() => {
            returnFocus.current = 'edit'
            setNotice(''); setError(''); setEditor(dvd)
          }}>แก้ไขคลิป</button>}
          <button ref={addButton} type="button" className="btn-secondary" onClick={() => {
            returnFocus.current = 'new'
            setNotice(''); setError(''); setEditor('new')
          }}>สร้างคลิป DVD</button>
        </div>}
      </div>
      {editor ? <DvdClipEditor dvd={editor === 'new' ? undefined : editor} onCancel={() => setEditor(undefined)} onSaved={(id) => {
        setSelected(id)
        setEditor(undefined)
        setNotice('บันทึกคลิป DVD แล้ว')
        change(editor === 'new')
      }} /> : dvd ? <div className="grid gap-3">
        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor={clipField}>เลือกคลิป DVD</label>
          <select id={clipField} className="input-field" value={dvd.id} onChange={(event) => { setSelected(event.target.value); setError('') }}>
            {clips.map((clip) => <option key={clip.id} value={clip.id}>{clip.name}</option>)}
          </select>
        </div>
        <DvdReplacementControl key={dvd.id} dvd={dvd} onApply={() => {
          setError('')
          change()
        }} />
        <div className="flex flex-wrap items-end gap-2">
          <button type="button" className="btn-primary" onClick={goLive}>ขึ้นจอผู้ชม</button>
          {live && <button type="button" className="btn-secondary" onClick={() => {
            liveRun.current = undefined
            send({ type: 'SHOW_BLACK' }, false)
            setLive('')
          }}>ล้างจอผู้ชม</button>}
          <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            <label htmlFor={playlistField}>เลือกเพลย์ลิสต์</label>
            <select id={playlistField} className="input-field min-w-0" value={target?.id ?? ''} onChange={(event) => setPlaylist(event.target.value)}>
              <option value="">เลือกเพลย์ลิสต์</option>
              {playlists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <button type="button" className="btn-secondary" disabled={!target || busy} onClick={() => void schedule()}>เพิ่มคลิป DVD ในเพลย์ลิสต์</button>
        </div>
        {live && <p role="status" className="text-sm wrap-anywhere">กำลังแสดง {live}</p>}
        {saved && <p role="status" className="text-sm">เพิ่มคลิป DVD แล้ว <Link className="btn-secondary" to={`/playlists/${saved}`}>เปิดเพลย์ลิสต์</Link></p>}
      </div> : <p className="text-sm text-[var(--fg-secondary)]">{filtered
        ? 'ไม่พบคลิป DVD ในกลุ่มที่เลือก' : 'นำเข้า Media.db หรือโปรไฟล์ EasyWorship เพื่อเพิ่มคลิป DVD'}</p>}
      {notice && <p role="status" className="mt-2! text-sm">{notice}</p>}
      {error && <p role="alert" className="mt-2! text-sm wrap-anywhere text-[var(--status-error-text)]">{error}</p>}
    </section>
  )
}
