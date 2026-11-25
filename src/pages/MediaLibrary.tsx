/** A local media library for profile migration, preview, and playlist cues. */

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LibraryCollectionControls } from '../components/LibraryCollectionControls'
import { useCollectionFilter } from '../hooks/useCollectionFilter'
import { prepareMediaCollectionFilter } from '../utils/mediaCollectionRules'
import { dvdCollectionKey, feedCollectionKey, localMediaCollectionKey, mediaCollectionKey } from '../utils/collectionLibrary'
import { PresentationVideo } from '../components/PresentationVideo'
import { VideoPoster } from '../components/VideoPoster'
import { EasyWorshipMediaImport } from '../components/EasyWorshipMediaImport'
import { MediaLibraryTransfer } from '../components/MediaLibraryTransfer'
import { LiveFeedLibrary } from '../components/LiveFeedLibrary'
import { WebPresentationPanel } from '../components/WebPresentationPanel'
import { DvdClipLibrary } from '../components/DvdClipLibrary'
import { LibraryMediaPlaybackForm } from '../components/LibraryMediaPlaybackForm'
import { LibraryMediaInfo } from '../components/LibraryMediaInfo'
import { LibraryScheduleUpdate } from '../components/LibraryScheduleUpdate'
import type { DvdClip } from '../types/dvdClip'
import { useAppendPlaylistCue } from '../hooks/useAppendPlaylistCue'
import { usePlaylistBackground } from '../hooks/usePlaylistBackground'
import { usePlaylist, usePlaylists } from '../hooks/usePlaylists'
import { useStandalonePresenter } from '../hooks/useStandalonePresenter'
import { useMediaClip } from '../hooks/useMediaClip'
import type { PlaylistCue } from '../types/database'
import { mediaInfoFields, type LibraryMediaPlayback, type MediaInfo, type MediaKind, type MediaLibraryItem, type VideoAlphaMode } from '../types/media'
import type { LiveFeed } from '../types/liveFeed'
import { deleteLibraryMedia, libraryMediaCueAsset, listLibraryDvds, listLibraryFeeds, listLibraryMedia, readLibraryMedia, renameLibraryMedia,
  saveLibraryMedia, setLibraryMediaAlpha, setLibraryMediaClip, setLibraryMediaInfo, setLibraryMediaPlayback, setLibraryMediaPoster } from '../utils/mediaLibrary'
import { mediaClipKey } from '../utils/mediaClip'
import { mediaObjectFit } from '../utils/mediaPlayback'
import { splitVideoAlpha } from '../utils/videoAlpha'
import { CUE_LABELS } from '../utils/playlistCues'
import { defaultMediaMuted, presentationMediaKey, type PresentationMedia } from '../utils/presentationChannel'

const panel = 'surface min-w-0 rounded-xl p-4! sm:p-6!'
const errorText = 'text-sm wrap-anywhere text-[var(--status-error-text)]'

const clipSeconds = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 3 })
type PreviewRequest = { assetId: string }

function sizeLabel(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`
}

export default function MediaLibrary() {
  const [params, setParams] = useSearchParams()
  const collectionFilter = useCollectionFilter('media')
  const requestedPlaylist = params.get('playlist') ?? ''
  const profileBackup = params.get('backup') === 'profile'
  const showFeeds = params.get('type') === 'feeds'
  const showWeb = params.get('type') === 'web'
  const showDvds = params.get('type') === 'dvd'
  const { playlists, loading: loadingPlaylists, error: playlistError } = usePlaylists()
  const saveCue = useAppendPlaylistCue()
  const saveBackground = usePlaylistBackground()
  const sendToPresenter = useStandalonePresenter('media')
  const [items, setItems] = useState<MediaLibraryItem[]>([])
  const [feeds, setFeeds] = useState<LiveFeed[]>([])
  const [dvds, setDvds] = useState<DvdClip[]>([])
  const [loading, setLoading] = useState(true)
  const [libraryError, setLibraryError] = useState('')
  const [fileFailures, setFileFailures] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | MediaKind>('all')
  const [selectedId, setSelectedId] = useState('')
  const [editName, setEditName] = useState(false)
  const [clipDraft, setClipDraft] = useState<{ id: string; start: string; end: string } | null>(null)
  const [name, setName] = useState('')
  const [preview, setPreview] = useState<{ request: PreviewRequest; url: string } | null>(null)
  const [playlistId, setPlaylistId] = useState(requestedPlaylist)
  const [entryId, setEntryId] = useState('')
  const [action, setAction] = useState<'add' | 'background' | 'edit' | null>(null)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [savedPlaylist, setSavedPlaylist] = useState('')
  const [live, setLive] = useState<{ item: MediaLibraryItem; key: string; muted: boolean; playing: boolean } | null>(null)
  const pendingCue = useRef<{ key: string; id: string } | null>(null)

  const target = playlists.find((playlist) => playlist.id === playlistId)
  const playlist = usePlaylist(target?.id)
  const backgroundTargets = playlist.songs.filter((entry) => entry.song || entry.cue?.kind === 'song' || entry.cue?.kind === 'scripture')
  const activeCollection = collectionFilter.selected
  const members = useMemo(() => ({ media: [
    ...items.map((item) => {
      const catalogId = mediaCollectionKey(item.metadata?.mediaUid)
      const localId = localMediaCollectionKey(item.id)
      return { id: catalogId ?? localId, aliases: catalogId ? [localId] : undefined, title: item.name, detail: CUE_LABELS[item.kind] }
    }),
    ...feeds.map((feed) => ({ id: feedCollectionKey(feed.id), title: feed.name, detail: 'สัญญาณสด' })),
    ...dvds.map((dvd) => ({ id: dvdCollectionKey(dvd.id), title: dvd.name, detail: 'คลิป DVD' })),
  ] }), [items, feeds, dvds])
  const mediaFilter = useMemo(() => activeCollection && prepareMediaCollectionFilter(activeCollection.leaves), [activeCollection])
  const visibleFeeds = useMemo(() => mediaFilter ? feeds.filter(mediaFilter.includesFeed) : feeds, [mediaFilter, feeds])
  const visibleDvds = useMemo(() => mediaFilter ? dvds.filter(mediaFilter.includesDvd) : dvds, [mediaFilter, dvds])
  const scopedItems = useMemo(() => mediaFilter ? items.filter(mediaFilter.includesMedia) : items, [mediaFilter, items])
  const selected = scopedItems.find((item) => item.id === selectedId) ?? scopedItems[0]
  const previewFit = selected && mediaObjectFit(libraryMediaCueAsset(selected, 'foreground').playback)
  const previewAssetId = selected?.assetId
  const previewRequest = useMemo<PreviewRequest | undefined>(() => previewAssetId ? { assetId: previewAssetId } : undefined, [previewAssetId])
  const previewUrl = preview?.request === previewRequest ? preview?.url : undefined
  const editingClip = clipDraft && clipDraft.id === selected?.id ? clipDraft : null
  const bindPreviewClip = useMediaClip(editingClip ? undefined : selected?.clip)
  const previewElement = useRef<HTMLMediaElement | null>(null)
  const bindPreview = useCallback((element: HTMLMediaElement | null) => {
    previewElement.current = element
    bindPreviewClip(element)
  }, [bindPreviewClip])

  async function refreshLibrary() {
    const [loaded, savedFeeds, savedDvds] = await Promise.all([listLibraryMedia(), listLibraryFeeds(), listLibraryDvds()])
    setItems(loaded)
    setFeeds(savedFeeds)
    setDvds(savedDvds)
    setSelectedId((id) => loaded.some((item) => item.id === id) ? id : loaded[0]?.id ?? '')
  }

  async function refreshAfterLibraryEdit(created?: boolean) {
    if (created && activeCollection) collectionFilter.select('')
    await refreshLibrary()
  }

  function openLibraryTab(tab?: 'feeds' | 'web' | 'dvd') {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (tab) next.set('type', tab)
      else next.delete('type')
      return next
    })
  }

  useEffect(() => {
    void refreshLibrary().catch(() => setLibraryError('อ่านคลังสื่อในเบราว์เซอร์ไม่ได้')).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!previewRequest) return
    let cancelled = false
    let url: string | undefined
    void readLibraryMedia(previewRequest.assetId).then((blob) => {
      if (!blob || cancelled) return
      url = URL.createObjectURL(blob)
      setPreview({ request: previewRequest, url })
    }).catch(() => { if (!cancelled) setActionError('เปิดไฟล์สื่อไม่ได้') })

    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [previewRequest])

  const visible = useMemo(() => {
    const filter = query.trim().normalize('NFC').toLocaleLowerCase()
    return scopedItems.filter((item) => (kind === 'all' || item.kind === kind)
      && (!filter || [item.name, item.filename, item.metadata?.catalogFilename, ...mediaInfoFields.map((field) => item.metadata?.[field])]
        .some((value) => typeof value === 'string' && value.normalize('NFC').toLocaleLowerCase().includes(filter))))
  }, [scopedItems, kind, query])

  function clearNotice() {
    setNotice('')
    setActionError('')
    setSavedPlaylist('')
  }

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const files = Array.from(input.files ?? [])
    if (!files.length || uploading) return

    setUploading(true)
    setLibraryError('')
    setFileFailures([])
    clearNotice()
    const failures: string[] = []
    let added = 0
    try {
      for (const file of files) {
        try {
          await saveLibraryMedia(file, { filename: file.name, name: file.name.replace(/\.[^.]+$/, '') })
          added++
        } catch (cause) {
          failures.push(cause instanceof Error ? cause.message : `อ่านไฟล์ ${file.name} ไม่สำเร็จ`)
        }
      }
      if (added) setNotice(`บันทึกสื่อ ${added} รายการ`)
      setFileFailures(failures)
      await refreshLibrary()
    } catch {
      setLibraryError('อ่านรายการสื่อหลังบันทึกไม่สำเร็จ')
    } finally {
      setUploading(false)
      input.value = ''
    }
  }

  async function saveEditedName() {
    if (!selected || !name.trim() || action) return
    setAction('edit')
    clearNotice()
    try {
      await renameLibraryMedia(selected.id, name)
      await refreshLibrary()
      setEditName(false)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'เปลี่ยนชื่อสื่อไม่สำเร็จ')
    } finally {
      setAction(null)
    }
  }

  async function saveMediaInfo(id: string, changes: Partial<MediaInfo>) {
    clearNotice()
    setAction('edit')
    try {
      await setLibraryMediaInfo(id, changes)
      await refreshLibrary()
      setNotice('บันทึกข้อมูลสื่อแล้ว')
    } finally { setAction(null) }
  }

  function startClipEdit() {
    if (!selected || selected.kind === 'image') return
    clearNotice()
    setEditName(false)
    setClipDraft({ id: selected.id, start: selected.clip?.startSeconds?.toString() ?? '', end: selected.clip?.endSeconds?.toString() ?? '' })
  }

  function markPreview(field: 'start' | 'end') {
    const time = previewElement.current?.currentTime
    if (!editingClip || time === undefined || !Number.isFinite(time)) return
    setClipDraft({ ...editingClip, [field]: String(Math.round(time * 1000) / 1000) })
  }

  async function saveClip() {
    if (!editingClip || action) return
    clearNotice()
    const start = editingClip.start === '' ? undefined : Number(editingClip.start)
    const end = editingClip.end === '' ? undefined : Number(editingClip.end)
    if ((start !== undefined && (!Number.isFinite(start) || start < 0))
      || (end !== undefined && (!Number.isFinite(end) || end <= (start ?? 0)))) {
      setActionError('จุดเริ่มต้องตั้งแต่ 0 วินาที และจุดจบต้องอยู่หลังจุดเริ่ม')
      return
    }
    const duration = previewElement.current?.duration
    if (duration !== undefined && Number.isFinite(duration) && duration > 0 && ((start ?? 0) >= duration || (end ?? 0) > duration + 0.001)) {
      setActionError('จุดเริ่มและจุดจบต้องอยู่ในความยาวของไฟล์')
      return
    }
    const clip = start || end !== undefined
      ? { ...(start ? { startSeconds: start } : {}), ...(end === undefined ? {} : { endSeconds: end }) }
      : undefined
    setAction('edit')
    try {
      await setLibraryMediaClip(editingClip.id, clip)
      await refreshLibrary()
      setClipDraft(null)
      setNotice('บันทึกช่วงเล่นแล้ว')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'บันทึกช่วงเล่นไม่สำเร็จ')
    } finally { setAction(null) }
  }

  async function saveAlphaMode(mode: VideoAlphaMode | undefined) {
    if (selected?.kind !== 'video' || action) return
    clearNotice()
    setAction('edit')
    try {
      await setLibraryMediaAlpha(selected.id, mode)
      await refreshLibrary()
      setNotice('บันทึกรูปแบบ Alpha แล้ว')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'บันทึกรูปแบบ Alpha ไม่สำเร็จ')
    } finally { setAction(null) }
  }

  async function savePoster(clear = false) {
    if (selected?.kind !== 'video' || action) return
    clearNotice()
    const video = previewElement.current
    const time = video?.currentTime
    if (!clear && (!video || video.readyState < HTMLMediaElement.HAVE_METADATA || video.seeking || time === undefined || !Number.isFinite(time))) {
      setActionError('รอให้วิดีโอพร้อมแล้วเลือกภาพตัวอย่างอีกครั้ง')
      return
    }
    setAction('edit')
    try {
      await setLibraryMediaPoster(selected.id, clear ? undefined : time)
      await refreshLibrary()
      setNotice(clear ? 'ล้างภาพตัวอย่างที่เลือกไว้แล้ว' : 'บันทึกภาพตัวอย่างแล้ว')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'บันทึกภาพตัวอย่างไม่สำเร็จ')
    } finally { setAction(null) }
  }

  async function savePlayback(playback: LibraryMediaPlayback) {
    if (!selected || action) return
    clearNotice()
    setAction('edit')
    try {
      await setLibraryMediaPlayback(selected.id, playback)
      await refreshLibrary()
      setNotice('บันทึกการเล่นแล้ว')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'บันทึกการเล่นไม่สำเร็จ')
    } finally { setAction(null) }
  }

  async function removeMedia() {
    if (!selected || action || !window.confirm(`ลบ ${selected.name} ออกจากคลังในเบราว์เซอร์นี้หรือไม่? เพลย์ลิสต์ที่ใช้ไฟล์นี้อาจต้องนำเข้าไฟล์เดิมอีกครั้ง`)) return
    setAction('edit')
    clearNotice()
    try {
      await deleteLibraryMedia(selected.id)
      await refreshLibrary()
      setEditName(false)
    } catch {
      setActionError('ลบสื่อออกจากคลังไม่สำเร็จ')
    } finally {
      setAction(null)
    }
  }

  async function addToPlaylist() {
    if (!target || !selected || action) return

    const asset = libraryMediaCueAsset(selected, 'foreground')
    const cue: PlaylistCue = { kind: selected.kind, label: selected.name, slides: [{ label: selected.name, lines: [], assets: [asset] }] }
    const key = JSON.stringify([target.id, cue])
    if (pendingCue.current?.key !== key) pendingCue.current = { id: crypto.randomUUID(), key }

    setAction('add')
    clearNotice()
    try {
      await saveCue(target.id, pendingCue.current.id, cue)
      pendingCue.current = null
      setNotice('เพิ่มสื่อในเพลย์ลิสต์แล้ว')
      setSavedPlaylist(target.id)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'เพิ่มสื่อไม่สำเร็จ')
    } finally {
      setAction(null)
    }
  }

  async function assignBackground() {
    if (!target || !selected || selected.kind === 'audio' || !backgroundTargets.some((entry) => entry.id === entryId) || action) return

    setAction('background')
    clearNotice()
    try {
      await saveBackground(target.id, entryId, libraryMediaCueAsset(selected, 'background'))
      setNotice('ตั้งพื้นหลังของรายการแล้ว')
      setSavedPlaylist(target.id)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'ตั้งพื้นหลังไม่สำเร็จ')
    } finally {
      setAction(null)
    }
  }

  function showMedia() {
    if (!selected || !previewUrl) return
    clearNotice()
    try {
      const { repeat, clip, alphaMode, playback } = libraryMediaCueAsset(selected, 'foreground')
      const media: PresentationMedia = { libraryId: selected.assetId, kind: selected.kind, role: 'foreground',
        runId: crypto.randomUUID(), repeat, clip, alphaMode, playback }
      sendToPresenter({ type: 'SHOW_LYRICS', lyrics: '', media })
      setLive({ item: selected, key: presentationMediaKey(media), muted: defaultMediaMuted(media), playing: true })
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'เปิดจอผู้ชมไม่สำเร็จ')
    }
  }

  function controlPlayback(next: { playing?: boolean; muted?: boolean }) {
    if (!live) return
    const state = { ...live, ...next }
    sendToPresenter({ type: 'SET_MEDIA_PLAYBACK', key: state.key, playing: state.playing, muted: state.muted }, false)
    setLive(state)
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="page-header mb-0!">
        <div className="page-title">
          <h1>คลังสื่อ</h1>
          <p>นำเข้าภาพ วิดีโอ และเสียงเพื่อขึ้นจอ เพิ่มลงเพลย์ลิสต์ หรือตั้งเป็นพื้นหลัง</p>
        </div>
        {requestedPlaylist && <Link className="btn-secondary" to={`/playlists/${requestedPlaylist}`}>กลับเพลย์ลิสต์</Link>}
      </header>

      <EasyWorshipMediaImport onImported={refreshLibrary} />
      <MediaLibraryTransfer key={profileBackup ? 'profile' : 'media'} startWithCatalog={profileBackup} onImported={async () => {
        collectionFilter.refresh()
        await refreshLibrary()
      }} />

      <nav aria-label="ประเภทคลังสื่อ" className="flex flex-wrap gap-2">
        <button className="btn-secondary aria-pressed:bg-[var(--accent-bg)]" type="button"
          aria-pressed={!showFeeds && !showWeb && !showDvds} onClick={() => openLibraryTab()}>ไฟล์สื่อ</button>
        <button className="btn-secondary aria-pressed:bg-[var(--accent-bg)]" type="button"
          aria-pressed={showFeeds} onClick={() => openLibraryTab('feeds')}>สัญญาณสด</button>
        <button className="btn-secondary aria-pressed:bg-[var(--accent-bg)]" type="button"
          aria-pressed={showWeb} onClick={() => openLibraryTab('web')}>เว็บ</button>
        <button className="btn-secondary aria-pressed:bg-[var(--accent-bg)]" type="button"
          aria-pressed={showDvds} onClick={() => openLibraryTab('dvd')}>คลิป DVD</button>
      </nav>
      {showFeeds && <>
        {libraryError && <p role="alert" className={errorText}>{libraryError}</p>}
        <LibraryCollectionControls filter={collectionFilter} resources={['media']} label="กลุ่มสื่อ" createLabel="สร้างกลุ่มสื่อ" editLabel="แก้ไขกลุ่มสื่อ" members={members} loading={loading} />
        <LiveFeedLibrary feeds={visibleFeeds} playlists={playlists} initialPlaylist={requestedPlaylist} loading={loading}
          filtered={Boolean(activeCollection)} onChanged={refreshAfterLibraryEdit} />
      </>}

      {showWeb && <WebPresentationPanel playlists={playlists} initialPlaylist={requestedPlaylist} />}
      {showDvds && <>
        {libraryError && <p role="alert" className={errorText}>{libraryError}</p>}
        <LibraryCollectionControls filter={collectionFilter} resources={['media']} label="กลุ่มสื่อ" createLabel="สร้างกลุ่มสื่อ" editLabel="แก้ไขกลุ่มสื่อ" members={members} loading={loading} />
        <DvdClipLibrary clips={visibleDvds} playlists={playlists} initialPlaylist={requestedPlaylist}
          filtered={Boolean(activeCollection)} onChanged={refreshAfterLibraryEdit} />
      </>}

      {!showFeeds && !showWeb && !showDvds && <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <section className={panel} aria-labelledby="media-results">
          <h2 id="media-results" className="text-lg font-medium">สื่อในเบราว์เซอร์นี้</h2>
          <label className="mt-3! flex min-w-0 flex-col gap-2 text-sm">
            เพิ่มไฟล์สื่อ
            <input type="file" className="input-field min-w-0" multiple accept="image/*,video/*,audio/*"
              disabled={uploading} onChange={addFiles} />
          </label>
          {uploading && <p role="status" className="mt-2! text-sm">กำลังบันทึกไฟล์…</p>}
          {libraryError && <p role="alert" className={`mt-2! ${errorText}`}>{libraryError}</p>}
          {fileFailures.length > 0 && <ul role="alert" className={`mt-2! space-y-1 ${errorText}`}>
            {fileFailures.map((message, index) => <li key={index}>{message}</li>)}
          </ul>}

          <div className="mt-4! grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <label className="flex min-w-0 flex-col gap-2 text-sm">
              ค้นหาสื่อ
              <input className="input-field" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <label className="flex min-w-0 flex-col gap-2 text-sm">
              ประเภทสื่อ
              <select className="input-field" value={kind} onChange={(event) => setKind(event.target.value as 'all' | MediaKind)}>
                <option value="all">ทั้งหมด</option>
                <option value="image">ภาพ</option>
                <option value="video">วิดีโอ</option>
                <option value="audio">เสียง</option>
              </select>
            </label>
          </div>
          <div id="media-collections" className="mt-3!">
            <LibraryCollectionControls filter={collectionFilter} resources={['media']} label="กลุ่มสื่อ" createLabel="สร้างกลุ่มสื่อ" editLabel="แก้ไขกลุ่มสื่อ"
              members={members} loading={loading} onChange={() => {
              setSelectedId(''); setEditName(false); setClipDraft(null); setAction(null); clearNotice()
            }} />
          </div>
          {loading && <p role="status" className="mt-3! text-sm">กำลังโหลดคลังสื่อ…</p>}
          {!loading && visible.length === 0 && <p className="mt-3! text-sm text-[var(--fg-secondary)]">
            {!items.length ? 'ยังไม่มีสื่อในเบราว์เซอร์นี้' : activeCollection && !scopedItems.length
              ? 'ไม่พบสื่อในกลุ่มที่เลือก' : 'ไม่พบสื่อที่ตรงกับคำค้น'}
          </p>}
          {visible.length > 0 && (
            <ul className="mt-3! max-h-96 divide-y divide-[var(--border-subtle)] overflow-y-auto">
              {visible.map((item) => (
                <li key={item.id}>
                  <button type="button" aria-pressed={item.id === selected?.id}
                    className="flex w-full min-w-0 cursor-pointer flex-col gap-1 rounded px-2! py-3! text-left aria-pressed:bg-[var(--accent-bg)]"
                    onClick={() => { setSelectedId(item.id); setEditName(false); setClipDraft(null); clearNotice() }}>
                    <span className="font-medium wrap-anywhere">{item.name}</span>
                    <span className="text-xs text-[var(--fg-secondary)]">{CUE_LABELS[item.kind]} · {sizeLabel(item.size)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={panel} aria-labelledby="media-preview">
          <h2 id="media-preview" className="text-lg font-medium">ตัวอย่างสื่อ</h2>
          {selected ? (
            <>
              {editName ? (
                <form className="mt-3! flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void saveEditedName() }}>
                  <label className="flex w-full flex-col gap-2 text-sm">ชื่อสื่อ
                    <input type="text" className="input-field" value={name} onChange={(event) => setName(event.target.value)} required />
                  </label>
                  <button type="submit" className="btn-secondary" disabled={Boolean(action)}>บันทึกชื่อ</button>
                  <button type="button" className="btn-ghost" onClick={() => setEditName(false)}>ยกเลิก</button>
                </form>
              ) : (
                <div className="mt-3! flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium wrap-anywhere">{selected.name}</h3>
                    <p className="text-xs wrap-anywhere text-[var(--fg-secondary)]">{selected.filename}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-ghost" disabled={Boolean(action)} onClick={() => { setName(selected.name); setClipDraft(null); setEditName(true) }}>เปลี่ยนชื่อ</button>
                    <button type="button" className="btn-ghost" disabled={Boolean(action)} onClick={() => void removeMedia()}>ลบออกจากคลัง</button>
                  </div>
                </div>
              )}
              {previewUrl && (
                <div className="mt-3! overflow-hidden rounded-lg bg-black">
                  {selected.kind === 'image' && <img className="aspect-video w-full object-contain" style={{ objectFit: previewFit }}
                    src={previewUrl} alt={selected.name} />}
                  {selected.kind === 'video' && <PresentationVideo key={`${selected.id}:${mediaClipKey(selected.clip)}`} ref={bindPreview}
                    alphaMode={selected.alphaMode} className="aspect-video w-full object-contain"
                    style={{ objectFit: previewFit }} src={previewUrl} controls playsInline preload="metadata" />}
                  {selected.kind === 'audio' && <audio key={`${selected.id}:${mediaClipKey(selected.clip)}`} ref={bindPreview} className="w-full" src={previewUrl} controls preload="metadata" />}
                </div>
              )}
              {selected.kind === 'video' && (
                <fieldset className="mt-3! grid min-w-0 gap-2" disabled={Boolean(action)}>
                  <legend className="text-sm font-medium">ภาพตัวอย่างวิดีโอ</legend>
                  {selected.posterSeconds !== undefined && <div className="flex flex-wrap items-center gap-3">
                    {previewUrl && <VideoPoster key={JSON.stringify([previewUrl, selected.posterSeconds, selected.alphaMode])}
                      src={previewUrl} seconds={selected.posterSeconds} name={selected.name} alphaMode={selected.alphaMode} />}
                    <span className="text-sm text-[var(--fg-secondary)]">{clipSeconds.format(selected.posterSeconds)} วินาที</span>
                  </div>}
                  <div className="flex flex-wrap gap-2">
                    <button className="chip-btn" type="button" disabled={!previewUrl} onClick={() => void savePoster()}>ใช้เฟรมปัจจุบัน</button>
                    {selected.posterSeconds !== undefined && (
                      <button className="chip-btn" type="button" onClick={() => void savePoster(true)}>ล้างภาพตัวอย่าง</button>
                    )}
                  </div>
                </fieldset>
              )}
              {selected.kind === 'video' && (
                <label className="mt-3! grid max-w-sm gap-1 text-sm">รูปแบบ Alpha ของวิดีโอ
                  <select className="input-field" aria-label="รูปแบบ Alpha ของวิดีโอ" disabled={Boolean(action)}
                    value={selected.alphaMode ?? ''} onChange={(event) => void saveAlphaMode(splitVideoAlpha(event.currentTarget.value))}>
                    <option value="">อัตโนมัติ</option>
                    <option value="top-bottom">ภาพบน · มาสก์ล่าง</option>
                    <option value="side-by-side">ภาพซ้าย · มาสก์ขวา</option>
                  </select>
                </label>
              )}
              <LibraryMediaPlaybackForm
                key={selected.id + JSON.stringify(selected.playback)} value={selected.playback}
                kind={selected.kind} busy={Boolean(action)} onSave={(value) => void savePlayback(value)} />
              {selected.clip && !editingClip && (
                <p className="mt-2! text-sm text-[var(--fg-secondary)]">
                  ช่วงเล่น {clipSeconds.format(selected.clip.startSeconds ?? 0)} วินาที ถึง {selected.clip.endSeconds === undefined
                    ? 'ท้ายไฟล์' : `${clipSeconds.format(selected.clip.endSeconds)} วินาที`}
                </p>
              )}
              {editingClip && (
                <fieldset className="mt-3! grid min-w-0 gap-3" disabled={Boolean(action)}>
                  <legend className="font-medium">ช่วงเล่น</legend>
                  <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                    {(['start', 'end'] as const).map((field) => (
                      <div key={field} className="flex min-w-0 flex-col gap-1.5">
                        <label className="flex min-w-0 flex-col gap-1 text-sm">{field === 'start' ? 'จุดเริ่ม (วินาที)' : 'จุดจบ (วินาที)'}
                          <input type="number" min="0" step="any" className="input-field min-w-0" value={editingClip[field]}
                            placeholder={field === 'start' ? 'ต้นไฟล์' : 'ท้ายไฟล์'}
                            onChange={(event) => setClipDraft({ ...editingClip, [field]: event.target.value })} />
                        </label>
                        <button className="chip-btn self-start" type="button" disabled={!previewUrl} onClick={() => markPreview(field)}>
                          {field === 'start' ? 'ตั้งจุดเริ่มจากตัวอย่าง' : 'ตั้งจุดจบจากตัวอย่าง'}
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-primary" type="button" onClick={() => void saveClip()}>บันทึกช่วงเล่น</button>
                    <button className="btn-ghost" type="button" onClick={() => { setClipDraft(null); clearNotice() }}>ยกเลิก</button>
                  </div>
                </fieldset>
              )}
              <LibraryMediaInfo key={selected.id} metadata={selected.metadata} busy={Boolean(action)}
                onSave={(changes) => saveMediaInfo(selected.id, changes)} />
              <div className="mt-3! flex flex-wrap gap-2">
                <button type="button" className="btn-primary" disabled={!previewUrl || Boolean(editingClip)} onClick={showMedia}>ขึ้นจอผู้ชม</button>
                {selected.kind !== 'image' && !editingClip && (
                  <button type="button" className="btn-secondary" disabled={Boolean(action)} onClick={startClipEdit}>แก้ช่วงเล่น</button>
                )}
              </div>
            </>
          ) : <p className="mt-3! text-sm text-[var(--fg-secondary)]">เลือกสื่อจากคลังเพื่อดูตัวอย่าง</p>}

          {live && (
            <div className="mt-4! border-t border-[var(--border-subtle)] pt-3!">
              <p role="status" className="text-sm wrap-anywhere">กำลังแสดง {live.item.name}</p>
              <div className="mt-2! flex flex-wrap gap-2">
                {live.item.kind !== 'image' && (
                  <>
                    <button type="button" className="btn-secondary" onClick={() => controlPlayback({ playing: !live.playing })}>{live.playing ? 'หยุดสื่อ' : 'เล่นสื่อ'}</button>
                    <button type="button" className="btn-secondary" onClick={() => controlPlayback({ muted: !live.muted })}>{live.muted ? 'เปิดเสียง' : 'ปิดเสียง'}</button>
                  </>
                )}
                <button type="button" className="btn-secondary" onClick={() => { sendToPresenter({ type: 'SHOW_BLACK' }, false); setLive(null) }}>ล้างจอผู้ชม</button>
              </div>
            </div>
          )}

          {selected && (
            <div className="mt-4! flex flex-col items-start gap-3 border-t border-[var(--border-subtle)] pt-4!">
              <label className="flex w-full min-w-0 flex-col gap-2 text-sm">
                เลือกเพลย์ลิสต์
                <select className="input-field" value={target?.id ?? ''} disabled={loadingPlaylists || Boolean(action)} onChange={(event) => {
                  setPlaylistId(event.target.value)
                  setEntryId('')
                  clearNotice()
                }}>
                  <option value="">เลือกเพลย์ลิสต์</option>
                  {playlists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <button type="button" className="btn-primary" disabled={!target || Boolean(action || editingClip)} onClick={() => void addToPlaylist()}>เพิ่มสื่อในเพลย์ลิสต์</button>
              {target && selected.kind !== 'audio' && (
                <>
                  <label className="flex w-full min-w-0 flex-col gap-2 text-sm">
                    รายการที่จะตั้งพื้นหลัง
                    <select className="input-field" value={entryId} disabled={playlist.loading || Boolean(action)}
                      onChange={(event) => { setEntryId(event.target.value); clearNotice() }}>
                      <option value="">เลือกเพลงหรือข้อพระคัมภีร์</option>
                      {backgroundTargets.map((entry) => <option value={entry.id} key={entry.id}>{entry.order + 1}. {entry.song?.title ?? entry.cue?.label}</option>)}
                    </select>
                  </label>
                  <button type="button" className="btn-secondary" disabled={!entryId || Boolean(action || editingClip)} onClick={() => void assignBackground()}>ใช้สื่อนี้เป็นพื้นหลัง</button>
                </>
              )}
              {target && <LibraryScheduleUpdate key={`${target.id}:${selected.id}`} playlistId={target.id} item={selected}
                records={items} disabled={Boolean(action || editingClip)} />}
              <p className="text-sm text-[var(--fg-secondary)]">เพลย์ลิสต์บันทึกการอ้างอิงไฟล์ เปิดบนเครื่องอื่นได้หลังนำเข้าไฟล์เดียวกันในเบราว์เซอร์นั้น</p>
              {playlistError && <p role="alert" className={errorText}>เปิดรายการเพลย์ลิสต์ไม่สำเร็จ</p>}
            </div>
          )}

          {actionError && <p role="alert" className={`mt-3! ${errorText}`}>{actionError}</p>}
          {notice && <p role="status" className="mt-3! text-sm">{notice}{savedPlaylist && <> · <Link className="text-[var(--accent)] underline" to={`/playlists/${savedPlaylist}`}>เปิดเพลย์ลิสต์</Link></>}</p>}
        </section>
      </div>}
    </div>
  )
}
