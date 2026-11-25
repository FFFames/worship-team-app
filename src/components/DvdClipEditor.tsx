import { useEffect, useRef, useState, type FormEvent } from 'react'
import { usePresentationMedia } from '../hooks/usePresentationMedia'
import { dvdTextFields, type DvdClip, type DvdFit, type DvdMetadata } from '../types/dvdClip'
import type { MediaLibraryItem } from '../types/media'
import { readDvdReplacement, saveDvdReplacement } from '../utils/dvdReplacement'
import { captureDvdThumbnail, dvdThumbnailUrl } from '../utils/dvdThumbnail'
import { dvdObjectFit, dvdVolume, isDvdFit } from '../utils/dvdPlayback'
import { listLibraryMedia, saveLibraryDvd, updateLibraryDvd } from '../utils/mediaLibrary'
import { DvdDiscImport, type DvdSelection } from './DvdDiscImport'

const metadataLabels = { author: 'ผู้สร้าง', copyright: 'ลิขสิทธิ์', description: 'คำอธิบาย', tags: 'แท็ก' }

export function DvdClipEditor({ dvd, onSaved, onCancel }: {
  dvd?: DvdClip; onSaved: (id: string) => void; onCancel: () => void
}) {
  const [id] = useState(() => dvd?.id ?? crypto.randomUUID())
  const [originalReplacement] = useState(() => readDvdReplacement(id))
  const [name, setName] = useState(dvd?.name ?? '')
  const [discName, setDiscName] = useState(dvd?.discName ?? '')
  const [metadata, setMetadata] = useState<DvdMetadata>(dvd?.metadata ?? {})
  const [start, setStart] = useState(dvd?.clip?.startSeconds?.toString() ?? '')
  const [end, setEnd] = useState(dvd?.clip?.endSeconds?.toString() ?? '')
  const [useMarks, setUseMarks] = useState(originalReplacement?.useMarks ?? Boolean(dvd?.clip))
  const [thumbnail, setThumbnail] = useState(dvd?.thumbnail)
  const [repeat, setRepeat] = useState(Boolean(dvd?.repeat))
  const [volume, setVolume] = useState(() => Math.round(100 * dvdVolume(dvd?.playback)))
  const [muted, setMuted] = useState(Boolean(dvd?.playback?.muted))
  const [fit, setFit] = useState<DvdFit>(dvd?.playback?.fit ?? 'auto')
  const [assetId, setAssetId] = useState(originalReplacement?.assetId ?? '')
  const [source, setSource] = useState<DvdSelection>()
  const [videos, setVideos] = useState<MediaLibraryItem[]>([])
  const [readyAsset, setReadyAsset] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const preview = useRef<HTMLVideoElement>(null)
  const savingNow = useRef(false)
  const { url } = usePresentationMedia(assetId ? { kind: 'video', libraryId: assetId } : null, null, {
    onUnavailable: () => setPreviewError('ไม่พบวิดีโอที่เลือกในคลังสื่อ'),
  })
  const ready = Boolean(url && readyAsset === assetId)

  useEffect(() => { heading.current?.focus() }, [])
  useEffect(() => { if (preview.current) preview.current.volume = volume / 100 }, [url, volume])

  useEffect(() => {
    let active = true
    void listLibraryMedia().then((items) => {
      if (!active) return
      setVideos((current) => [...new Map([...items.filter((item) => item.kind === 'video'), ...current]
        .map((item) => [item.assetId, item])).values()])
    }).catch(() => { if (active) setError('อ่านรายการวิดีโอในคลังสื่อไม่ได้') })
    return () => { active = false }
  }, [])

  function selectAsset(value: string) {
    setAssetId(value)
    setReadyAsset('')
    setPreviewError('')
    setError('')
  }

  function mark(setValue: (value: string) => void) {
    const time = preview.current?.currentTime
    if (ready && time !== undefined) {
      setValue(String(Math.round(time * 1000) / 1000))
      setUseMarks(true)
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savingNow.current) return
    const title = name.trim()
    const startSeconds = start.trim() === '' ? undefined : Number(start)
    const endSeconds = end.trim() === '' ? undefined : Number(end)
    const duration = preview.current?.duration
    if (!title || title.length > 240 || discName.trim().length > 240) {
      setError('ใส่ชื่อคลิป และใช้ชื่อคลิปกับชื่อแผ่นไม่เกิน 240 ตัวอักษร')
      return
    }
    if ((startSeconds !== undefined && (!Number.isFinite(startSeconds) || startSeconds < 0))
      || (endSeconds !== undefined && (!Number.isFinite(endSeconds) || endSeconds <= (startSeconds ?? 0)))) {
      setError('จุดเริ่มต้องตั้งแต่ 0 วินาที และจุดจบต้องอยู่หลังจุดเริ่ม')
      return
    }
    if (useMarks && ready && duration !== undefined && Number.isFinite(duration)
      && ((startSeconds ?? 0) >= duration || (endSeconds ?? 0) > duration + 0.001)) {
      setError('จุดเริ่มและจุดจบต้องอยู่ในความยาวของวิดีโอ')
      return
    }
    const video = videos.find((item) => item.assetId === assetId)
    if ((!dvd || (assetId && assetId !== originalReplacement?.assetId)) && (!ready || !video)) {
      setError('เลือกวิดีโอที่เปิดดูตัวอย่างได้ หรืออ่านจาก DVD ก่อนบันทึก')
      return
    }
    if (Object.values(metadata).some((value) => value.trim().length > 4_000)) {
      setError('ข้อมูลคลิปแต่ละช่องต้องไม่เกิน 4,000 ตัวอักษร')
      return
    }
    const clip = startSeconds || endSeconds !== undefined ? { startSeconds: startSeconds || undefined, endSeconds } : undefined
    const changed: DvdClip = {
      ...dvd, id, name: title, discName: discName.trim() || undefined, repeat: repeat || undefined, clip,
      ...(!dvd && source ? { title: source.title, chapter: source.chapter, lastChapter: source.lastChapter ?? null,
        angle: source.angle, audioTrack: source.audio, subtitleTrack: source.subtitle === undefined ? undefined : source.subtitle - 1 } : {}),
      thumbnail, metadata: Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, value.trim()])),
      playback: { volume: volume / 100, muted, fit },
    }
    const previous = readDvdReplacement(id)
    const subtitle = source ? source.subtitle ?? null : originalReplacement?.assetId === assetId ? originalReplacement?.subtitle : undefined
    const replacement = video ? { assetId, useMarks: Boolean(clip) && useMarks, alphaMode: video.alphaMode, subtitle } : undefined
    const updateReplacement = Boolean(replacement || (!assetId && previous))
    savingNow.current = true
    setSaving(true)
    setError('')
    try {
      if (updateReplacement) saveDvdReplacement(id, replacement)
      try {
        if (dvd) await updateLibraryDvd(changed)
        else await saveLibraryDvd(changed)
      } catch (cause) {
        if (updateReplacement && JSON.stringify(readDvdReplacement(id)) === JSON.stringify(replacement)) {
          saveDvdReplacement(id, previous)
        }
        throw cause
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'บันทึกคลิป DVD ไม่สำเร็จ')
      return
    } finally {
      savingNow.current = false
      setSaving(false)
    }
    onSaved(id)
  }

  const thumbnailUrl = dvdThumbnailUrl(thumbnail)
  return (
    <section aria-label={dvd ? 'แก้ไขคลิป DVD' : 'คลิป DVD ใหม่'} className="grid gap-3">
      <h3 ref={heading} tabIndex={-1} className="text-base font-semibold">{dvd ? 'แก้ไขคลิป DVD' : 'คลิป DVD ใหม่'}</h3>
      <form className="grid gap-3" onSubmit={save}>
        <fieldset className="grid gap-3" disabled={saving}>
          <label className="grid gap-1 text-sm">ชื่อคลิป *
            <input className="input-field" type="text" required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">ชื่อแผ่น
            <input className="input-field" type="text" value={discName} onChange={(event) => setDiscName(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">วิดีโอสำหรับคลิป
            <select className="input-field" value={assetId} onChange={(event) => {
              setSource(undefined)
              selectAsset(event.target.value)
            }}>
              <option value="">เลือกวิดีโอจากคลัง</option>
              {assetId && !videos.some((video) => video.assetId === assetId) && <option value={assetId}>วิดีโอที่จับคู่ไว้</option>}
              {videos.map((video) => <option key={video.assetId} value={video.assetId}>{video.name}</option>)}
            </select>
          </label>
          {url && <video key={assetId} ref={preview} src={url} aria-label="ตัวอย่างคลิป DVD" preload="auto" controls playsInline
            className="aspect-video w-full rounded-lg bg-black object-contain" muted={muted} style={{ objectFit: dvdObjectFit({ fit }) }}
            onLoadedData={() => setReadyAsset(assetId)} onError={() => {
              setReadyAsset('')
              setPreviewError('วิดีโอนี้เปิดดูตัวอย่างไม่ได้')
            }} />}
          {previewError && <p role="alert" className="text-sm text-[var(--status-error-text)]">{previewError}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">เริ่มที่ (วินาที)
              <input className="input-field" type="text" inputMode="decimal" value={start} onChange={(event) => { setStart(event.target.value); setUseMarks(true) }} />
            </label>
            <label className="grid gap-1 text-sm">จบที่ (วินาที)
              <input className="input-field" type="text" inputMode="decimal" value={end} onChange={(event) => { setEnd(event.target.value); setUseMarks(true) }} />
            </label>
          </div>
          {assetId && (start || end) && <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useMarks} onChange={(event) => setUseMarks(event.target.checked)} />ใช้ช่วงนี้เมื่อเล่นวิดีโอที่เลือก
          </label>}
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" type="button" disabled={!ready} onClick={() => mark(setStart)}>ใช้เวลาปัจจุบันเป็นจุดเริ่ม</button>
            <button className="btn-secondary" type="button" disabled={!ready} onClick={() => mark(setEnd)}>ใช้เวลาปัจจุบันเป็นจุดจบ</button>
            <button className="btn-ghost" type="button" onClick={() => { setStart(''); setEnd('') }}>เล่นทั้งวิดีโอ</button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={repeat} onChange={(event) => setRepeat(event.target.checked)} />เล่นวนซ้ำ
          </label>
          <label className="grid gap-1 text-sm">สัดส่วนภาพ DVD
            <select className="input-field" value={fit} onChange={(event) => {
              if (isDvdFit(event.target.value)) setFit(event.target.value)
            }}>
              <option value="auto">อัตโนมัติ</option>
              <option value="contain">คงสัดส่วนเดิม</option>
              <option value="fill">ยืดเต็มพื้นที่</option>
              <option value="cover">ซูมให้เต็มพื้นที่</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">ระดับเสียง DVD
            <input className="w-full max-w-sm" type="range" min="0" max="100" value={volume}
              aria-valuetext={`${volume}%`} onChange={(event) => setVolume(Number(event.target.value))} />
            <span aria-hidden="true">{volume}%</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={muted} onChange={(event) => setMuted(event.target.checked)} />ปิดเสียงคลิป DVD
          </label>
          {thumbnailUrl && <img src={thumbnailUrl} alt="ภาพย่อคลิป DVD" className="max-h-40 max-w-full rounded-md object-contain" />}
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" type="button" disabled={!ready} onClick={() => {
              const frame = preview.current && captureDvdThumbnail(preview.current)
              if (frame) { setThumbnail(frame); setError('') }
              else setError('รอให้วิดีโอแสดงเฟรมก่อนตั้งภาพย่อ')
            }}>ใช้เฟรมปัจจุบันเป็นภาพย่อ</button>
            {thumbnailUrl && <button className="btn-ghost" type="button" onClick={() => setThumbnail(null)}>ล้างภาพย่อ</button>}
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer">ข้อมูลคลิป</summary>
            <div className="mt-2! grid gap-2">
              {dvdTextFields.map((field) => <label className="grid gap-1" key={field}>{metadataLabels[field]}
                <input className="input-field" type="text" value={metadata[field] ?? ''}
                  onChange={(event) => setMetadata({ ...metadata, [field]: event.target.value })} />
              </label>)}
            </div>
          </details>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" type="submit">{saving ? 'กำลังบันทึก…' : 'บันทึกคลิป DVD'}</button>
            <button className="btn-ghost" type="button" onClick={onCancel}>ยกเลิก</button>
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm text-[var(--status-error-text)]">{error}</p>}
      </form>
      <DvdDiscImport dvd={dvd ?? { id, name: name.trim() || 'คลิป DVD' }} preferredSubtitle={originalReplacement?.subtitle} onImported={(video, selection) => {
        setVideos((items) => items.some((item) => item.assetId === video.assetId) ? items : [...items, video])
        setSource(selection)
        if (video.assetId !== assetId) selectAsset(video.assetId)
      }} />
    </section>
  )
}
