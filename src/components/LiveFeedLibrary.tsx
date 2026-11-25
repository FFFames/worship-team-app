/** Manages saved camera and NDI inputs and adds them to presentation playlists. */

import { useId, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAppendPlaylistCue } from '../hooks/useAppendPlaylistCue'
import { useStandalonePresenter } from '../hooks/useStandalonePresenter'
import type { Playlist, PlaylistCue } from '../types/database'
import type { CameraInput, LiveFeed } from '../types/liveFeed'
import { cameraInputKey, liveFeedAsset, savedCameraInput, saveCameraInput } from '../utils/livePresentation'
import { deleteLibraryFeed, renameLibraryFeed, saveLibraryFeed } from '../utils/mediaLibrary'
import { presentationMediaKey, type PresentationMedia } from '../utils/presentationChannel'
import { CameraInputControl } from './CameraInputControl'

const panel = 'surface min-w-0 rounded-xl p-4! sm:p-6!'
const fitLabels = { auto: 'อัตโนมัติ', contain: 'รักษาสัดส่วน', fill: 'ยืดเต็มพื้นที่', cover: 'ซูมเต็มพื้นที่' } as const

export function LiveFeedLibrary({ feeds, playlists, initialPlaylist, loading, filtered, onChanged }: {
  feeds: LiveFeed[]
  playlists: Playlist[]
  initialPlaylist: string
  loading: boolean
  filtered: boolean
  onChanged: (created?: boolean) => Promise<void>
}) {
  const appendCue = useAppendPlaylistCue()
  const [cameraStatus, setCameraStatus] = useState<string | null>(null)
  const send = useStandalonePresenter('media', undefined, setCameraStatus)
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState<{ id?: string; name: string } | null>(null)
  const [playlistId, setPlaylistId] = useState(initialPlaylist)
  const [localCamera, setLocalCamera] = useState<{ key: string; device: CameraInput }>()
  const [live, setLive] = useState<{ id: string; name: string; audioKey?: string; muted: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [savedPlaylistId, setSavedPlaylistId] = useState('')
  const playlistField = useId()
  const pendingCue = useRef<{ key: string; id: string } | null>(null)
  const selected = feeds.find((feed) => feed.id === selectedId) ?? feeds[0]
  const asset = selected ? liveFeedAsset(selected, 'foreground') : undefined
  const inputKey = asset ? cameraInputKey('', asset) : ''
  const device = inputKey ? (localCamera?.key === inputKey ? localCamera.device : savedCameraInput(inputKey)) : undefined
  const target = playlists.find((playlist) => playlist.id === playlistId)
  const video = asset?.feedVideo

  function clearNotice() {
    setError('')
    setNotice('')
    setSavedPlaylistId('')
  }

  async function update(action: () => Promise<void>) {
    if (busy) return
    clearNotice()
    setBusy(true)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'บันทึกสัญญาณสดไม่สำเร็จ')
    } finally { setBusy(false) }
  }

  function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft?.name.trim()) return
    const id = draft.id ?? crypto.randomUUID()
    void update(async () => {
      if (draft.id) await renameLibraryFeed(id, draft.name)
      else await saveLibraryFeed({ id, name: draft.name, deviceHints: [] })
      await onChanged(!draft.id)
      setSelectedId(id)
      setDraft(null)
    })
  }

  function goLive() {
    if (!selected || !device) return
    clearNotice()
    try {
      const media: PresentationMedia = { kind: 'camera', ...device, feedVideo: asset?.feedVideo, role: 'foreground', runId: crypto.randomUUID() }
      send({ type: 'SHOW_LYRICS', lyrics: '', media })
      setLive({ id: selected.id, name: selected.name,
        audioKey: device.audioLevel === undefined ? undefined : presentationMediaKey(media), muted: false })
      setCameraStatus('กำลังรอภาพจากสัญญาณสด')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เปิดจอผู้ชมไม่สำเร็จ')
    }
  }

  function stopLive() {
    send({ type: 'SHOW_BLACK' }, false)
    setLive(null)
    setCameraStatus(null)
  }

  function toggleLiveAudio() {
    if (!live?.audioKey) return
    const muted = !live.muted
    if (send({ type: 'SET_MEDIA_PLAYBACK', key: live.audioKey, muted }, false)) setLive({ ...live, muted })
  }

  function addToPlaylist() {
    if (!selected || !asset || !target) return
    const cue: PlaylistCue = { kind: 'camera', label: selected.name, slides: [{ label: selected.name, lines: [], assets: [asset] }] }
    const key = JSON.stringify([target.id, cue])
    const id = pendingCue.current?.key === key ? pendingCue.current.id : crypto.randomUUID()
    pendingCue.current = { key, id }
    void update(async () => {
      await appendCue(target.id, id, cue)
      pendingCue.current = null
      setNotice('เพิ่มสัญญาณสดในเพลย์ลิสต์แล้ว')
      setSavedPlaylistId(target.id)
    })
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className={panel} aria-labelledby="feed-library">
        <h2 id="feed-library" className="text-lg font-medium text-balance">คลังสัญญาณสด</h2>
        <button type="button" className="btn-secondary mt-3!" disabled={busy} onClick={() => { clearNotice(); setDraft({ name: '' }) }}>
          เพิ่มสัญญาณสด
        </button>
        {draft && (
          <form onSubmit={saveDraft} className="mt-3! flex flex-wrap gap-2">
            <label className="flex w-full min-w-0 flex-col gap-1 text-sm">
              ชื่อสัญญาณสด
              <input className="input-field" value={draft.name} required maxLength={200} disabled={busy}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </label>
            <button type="submit" className="btn-primary" disabled={busy}>บันทึกสัญญาณสด</button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setDraft(null)}>ยกเลิก</button>
          </form>
        )}
        {loading && <p role="status" className="mt-3! text-sm">กำลังโหลดสัญญาณสด</p>}
        {!loading && !feeds.length && <p className="mt-3! text-sm text-pretty text-[var(--fg-secondary)]">
          {filtered ? 'เลือกกลุ่มอื่นเพื่อดูสัญญาณสด' : 'เลือกเพิ่มสัญญาณสดหรือนำเข้า Feed จาก EasyWorship'}
        </p>}
        {feeds.length > 0 && (
          <ul className="mt-3! max-h-96 divide-y divide-[var(--border-subtle)] overflow-y-auto">
            {feeds.map((feed) => (
              <li key={feed.id}>
                <button type="button" aria-pressed={feed.id === selected?.id} disabled={busy}
                  className="w-full rounded px-2! py-3! text-left wrap-anywhere aria-pressed:bg-[var(--accent-bg)]"
                  onClick={() => { setSelectedId(feed.id); setDraft(null); clearNotice() }}>{feed.name}</button>
              </li>
            ))}
          </ul>
        )}
        {draft && error && <p role="alert" className="mt-3! text-sm wrap-anywhere text-[var(--status-error-text)]">{error}</p>}
      </section>

      <section className={panel} aria-labelledby="feed-input">
        <h2 id="feed-input" className="text-lg font-medium text-balance">เลือกแหล่งสัญญาณ</h2>
        {selected && (
          <>
            <div className="mt-2! flex flex-wrap gap-2">
              <button className="btn-ghost" type="button" disabled={busy}
                onClick={() => { clearNotice(); setDraft({ id: selected.id, name: selected.name }) }}>เปลี่ยนชื่อ</button>
              <button className="btn-ghost" type="button" disabled={busy} onClick={() => {
                if (!window.confirm(`ลบ ${selected.name} ออกจากคลังสัญญาณสดหรือไม่?`)) return
                void update(async () => {
                  await deleteLibraryFeed(selected.id)
                  if (live?.id === selected.id) stopLive()
                  await onChanged()
                })
              }}>ลบออกจากคลัง</button>
            </div>
            <CameraInputControl key={inputKey} name={selected.name} hints={selected.deviceHints} assigned={device}
              audioDeviceHint={asset?.audioDeviceHint} feedSound={asset?.feedSound} onApply={(camera) => {
                saveCameraInput(inputKey, camera)
                setLocalCamera({ key: inputKey, device: camera })
              }} />
            {video && <details className="mb-3! text-sm text-[var(--fg-secondary)]">
              <summary className="cursor-pointer">ข้อมูลจาก EasyWorship</summary>
              <dl className="mt-1! grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 tabular-nums">
                {video.width !== undefined && video.height !== undefined && <><dt>ความละเอียด</dt><dd>{video.width} × {video.height}</dd></>}
                {video.frameRate !== undefined && <><dt>อัตราเฟรม</dt><dd>{video.frameRate} fps</dd></>}
                {video.fit && <><dt>สัดส่วนภาพ</dt><dd>{fitLabels[video.fit]}</dd></>}
              </dl>
            </details>}
            <button type="button" className="btn-primary" disabled={!device || busy} onClick={goLive}>ขึ้นจอผู้ชม</button>
            <div className="mt-4! flex flex-col gap-1 text-sm">
              <label htmlFor={playlistField}>เลือกเพลย์ลิสต์</label>
              <select id={playlistField} className="input-field" value={target?.id ?? ''} disabled={busy}
                onChange={(event) => { setPlaylistId(event.target.value); clearNotice() }}>
                <option value="">เลือกเพลย์ลิสต์</option>
                {playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
              </select>
            </div>
            <button type="button" className="btn-secondary mt-2!" disabled={!target || busy} onClick={addToPlaylist}>
              เพิ่มสัญญาณสดในเพลย์ลิสต์
            </button>
          </>
        )}
        {live && <div className="mt-3! border-t border-[var(--border-subtle)] pt-3!">
          <p role="status" className="text-sm wrap-anywhere">{cameraStatus ?? `กำลังแสดง ${live.name}`}</p>
          <div className="mt-2! flex flex-wrap gap-2">
            {live.audioKey && <button type="button" className="btn-secondary" onClick={toggleLiveAudio}>{live.muted ? 'เปิดเสียง' : 'ปิดเสียง'}</button>}
            <button type="button" className="btn-secondary" onClick={stopLive}>ล้างจอผู้ชม</button>
          </div>
        </div>}
        {notice && <p role="status" className="mt-3! text-sm">{notice}</p>}
        {!draft && error && <p role="alert" className="mt-3! text-sm wrap-anywhere text-[var(--status-error-text)]">{error}</p>}
        {savedPlaylistId && <Link className="mt-2! inline-block text-sm underline" to={`/playlists/${savedPlaylistId}`}>เปิดเพลย์ลิสต์</Link>}
      </section>
    </div>
  )
}
