/** Brings a selected DVD chapter into the local media library through Desktop. */

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { DvdClip } from '../types/dvdClip'
import type { MediaLibraryItem } from '../types/media'
import { saveLibraryMedia } from '../utils/mediaLibrary'
import { DvdImportPreview } from './DvdImportPreview'

export type DvdSelection = { title: number; chapter: number; lastChapter?: number; angle: number; audio?: number; subtitle?: number }
type PreparedDvd = { state: 'ready'; id: string; size: number; filename: string }
type DvdImportError = 'settings' | 'busy' | 'folder' | 'catalog' | 'disc' | 'ffmpeg' | 'demuxer' | 'encoder' | 'track' | 'subtitleTrack' | 'subtitleSupport' | 'convert' | 'size'
type DvdResult<T> = T | { state: 'cancelled' } | { state: 'error'; error: DvdImportError }
type Title = { number: number; chapters: number; angles: number }
type Disc = { id: string; name: string; titles: Title[] }
type Track = { number: number; language?: string }
type Tracks = { state: 'ready'; audio: Track[]; subtitles: Track[] }
type PreparedVideo = { blob: Blob; filename: string; selection: DvdSelection }

declare global {
  interface Window {
    worshipDvd?: {
      choose?: () => Promise<DvdResult<{ state: 'ready'; disc: Disc }>>
      tracks?: (discId: string, selection: DvdSelection) => Promise<DvdResult<Tracks>>
      forget?: (discId: string) => Promise<void>
      prepare: (selection: DvdSelection, discId?: string) => Promise<DvdResult<PreparedDvd>>
      read: (id: string, offset: number) => Promise<ArrayBuffer | null>
      release: (id: string) => Promise<void>
      cancel: () => Promise<void>
      progress: (callback: (seconds: number) => void) => () => void
    }
  }
}

const errors: Record<DvdImportError, string> = {
  settings: 'ตรวจหมายเลขไตเติล บท มุมกล้อง แทร็กเสียง และคำบรรยาย',
  busy: 'มีคลิป DVD กำลังนำเข้าอยู่',
  folder: 'เลือกแผ่น DVD-Video หรือโฟลเดอร์ที่มี VIDEO_TS',
  catalog: 'อ่านรายการไตเติลจากแผ่นไม่ได้ ลองใช้หมายเลขไตเติลและบทโดยตรง',
  disc: 'แผ่นถูกถอดหรือเปลี่ยนแล้ว กรุณาสำรวจแผ่นอีกครั้ง',
  ffmpeg: 'ไม่พบ FFmpeg ที่แอปเดสก์ท็อปเรียกใช้ได้',
  demuxer: 'FFmpeg ชุดนี้อ่าน DVD-Video ไม่ได้ ต้องใช้ชุดที่รองรับ libdvdnav และ libdvdread',
  encoder: 'FFmpeg ชุดนี้ไม่มีตัวเข้ารหัสวิดีโอ H.264 ที่รองรับ',
  track: 'ไม่พบแทร็กเสียงที่เลือกในไตเติลนี้',
  subtitleTrack: 'ไม่พบแทร็กคำบรรยายที่เลือกในไตเติลนี้',
  subtitleSupport: 'FFmpeg ชุดนี้ต้องรองรับตัวถอดรหัส dvdsub และตัวกรอง overlay เพื่ออ่านคำบรรยาย',
  convert: 'อ่านไตเติลหรือบทจาก DVD ไม่สำเร็จ กรุณาตรวจแผ่นและหมายเลขบท',
  size: 'วิดีโอที่ได้ว่างหรือเกิน 1 GB ลองเลือกช่วงบทที่สั้นลง',
}
const positive = (value: number | undefined, limit: number) => value && value >= 1 && value <= limit ? String(value) : '1'
const within = (value: string, limit: number) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= limit
const languages = new Intl.DisplayNames(['th'], { type: 'language' })
const trackLabel = (track: Track) => `แทร็ก ${track.number}${track.language ? ` · ${languages.of(track.language) ?? track.language}` : ''}`

function numberOptions(limit: number, start = 1) {
  return Array.from({ length: limit - start + 1 }, (_, index) => {
    const number = start + index
    return <option key={number} value={number}>{number}</option>
  })
}

function trackOptions(tracks: Track[], value: string) {
  return <>
    {value && !tracks.some((track) => String(track.number) === value) && <option value={value}>ไม่พบแทร็ก {value}</option>}
    {tracks.map((track) => <option key={track.number} value={track.number}>{trackLabel(track)}</option>)}
  </>
}

export function DvdDiscImport({ dvd, preferredSubtitle, onImported }: {
  dvd: DvdClip; preferredSubtitle?: number | null; onImported: (video: MediaLibraryItem, selection: DvdSelection) => void
}) {
  const desktop = window.worshipDvd
  const [title, setTitle] = useState(() => positive(dvd.title, 99))
  const [chapter, setChapter] = useState(() => positive(dvd.chapter, 99))
  const [lastChapter, setLastChapter] = useState(() => dvd.lastChapter === null ? '' : String(dvd.lastChapter ?? chapter))
  const [angle, setAngle] = useState(() => positive(dvd.angle, 9))
  const [audio, setAudio] = useState(() => dvd.lastChapter !== undefined && dvd.audioTrack ? String(dvd.audioTrack) : '')
  const savedSubtitle = preferredSubtitle === undefined ? dvd.subtitleSelection : preferredSubtitle
  const [subtitle, setSubtitle] = useState(() => {
    if (savedSubtitle !== undefined) return savedSubtitle === null ? '' : String(savedSubtitle)
    const original = dvd.subtitleTrack
    return original !== undefined && original >= 0 && original < 32 && (original > 0 || dvd.lastChapter !== undefined)
      ? String(original + 1) : ''
  })
  const fields = useId()
  const subtitleHint = `${fields}-subtitle-hint`
  const [disc, setDisc] = useState<Disc>()
  const discHandle = useRef<string | undefined>(undefined)
  const [inventory, setInventory] = useState<{ key: string; result: DvdResult<Tracks> }>()
  const [notice, setNotice] = useState('')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [candidate, setCandidate] = useState<PreparedVideo>()
  const [saving, setSaving] = useState(false)
  const previewButton = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const running = useRef<AbortController | undefined>(undefined)
  const pickedTitle = disc?.titles.find((item) => String(item.number) === title)
  const chapterLimit = pickedTitle && Math.min(99, pickedTitle.chapters)
  const probeKey = disc ? `${disc.id}:${title}:${chapter}:${angle}` : ''
  const probe = inventory?.key === probeKey ? inventory?.result : undefined
  const tracks = probe?.state === 'ready' ? probe : undefined
  const missingAudio = Boolean(audio && tracks && !tracks.audio.some((track) => String(track.number) === audio))
  const missingSubtitle = Boolean(subtitle && tracks && !tracks.subtitles.some((track) => String(track.number) === subtitle))

  useEffect(() => () => {
    const id = discHandle.current
    if (id) void desktop?.forget?.(id).catch(() => {})
    discHandle.current = undefined
    const current = running.current
    running.current = undefined
    if (!current || current.signal.aborted) return
    current.abort()
    void desktop?.cancel().catch(() => {})
  }, [desktop])

  useEffect(() => {
    if (!disc || !desktop?.tracks) return
    let current = true
    void desktop.tracks(disc.id, { title: Number(title), chapter: Number(chapter), angle: Number(angle) }).then((result) => {
      if (current) setInventory({ key: probeKey, result })
    }).catch(() => { if (current) setInventory({ key: probeKey, result: { state: 'error', error: 'convert' } }) })
    return () => { current = false }
  }, [desktop, disc, probeKey, title, chapter, angle])

  useEffect(() => {
    if (!candidate && restoreFocus.current) {
      restoreFocus.current = false
      previewButton.current?.focus()
    }
  }, [candidate])

  function closeDisc() {
    const id = discHandle.current
    discHandle.current = undefined
    setDisc(undefined)
    setNotice('')
    setError('')
    if (id) void desktop?.forget?.(id).catch(() => {})
  }

  async function browse() {
    if (!desktop?.choose || running.current) return
    const current = new AbortController()
    running.current = current
    setError('')
    setProgress('กำลังสำรวจแผ่น DVD')
    try {
      const result = await desktop.choose()
      if (current.signal.aborted) {
        if (result.state === 'ready') await desktop.forget?.(result.disc.id)
        return
      }
      if (result.state === 'error') throw new Error(errors[result.error] ?? errors.catalog)
      if (result.state !== 'ready') return
      const choice = result.disc.titles.find((item) => String(item.number) === title) ?? result.disc.titles[0]
      const sameTitle = String(choice.number) === title
      const limit = Math.min(99, choice.chapters)
      const nextChapter = sameTitle && within(chapter, limit) ? chapter : '1'
      const nextLast = sameTitle && (!lastChapter || within(lastChapter, limit)) ? lastChapter : nextChapter
      const nextAngle = sameTitle && within(angle, choice.angles) ? angle : '1'
      setNotice(!sameTitle || nextChapter !== chapter || nextLast !== lastChapter || nextAngle !== angle
        ? `ไตเติล ${title} บท ${chapter}${lastChapter && lastChapter !== chapter ? `–${lastChapter}` : ''} มุม ${angle} ใช้กับแผ่นนี้ไม่ได้ กรุณาตรวจค่าที่เลือกก่อนนำเข้า` : '')
      discHandle.current = result.disc.id
      setTitle(String(choice.number))
      setChapter(nextChapter)
      setLastChapter(nextLast && Number(nextLast) < Number(nextChapter) ? nextChapter : nextLast)
      setAngle(nextAngle)
      setDisc(result.disc)
    } catch (cause) {
      if (!current.signal.aborted) setError(cause instanceof Error ? cause.message : errors.catalog)
    } finally {
      if (running.current === current) {
        running.current = undefined
        setProgress('')
      }
    }
  }

  async function load(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!desktop || candidate || running.current || missingAudio || missingSubtitle || (disc && !probe)) return
    const previewOnly = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'preview'
    const current = new AbortController()
    running.current = current
    const { signal } = current
    setError('')
    setProgress(disc ? 'กำลังอ่านแผ่น DVD' : 'เลือกแผ่นหรือโฟลเดอร์ DVD-Video')
    const stopProgress = desktop.progress((seconds) => {
      if (!signal.aborted) setProgress(`กำลังอ่าน DVD · เตรียมวิดีโอได้ ${seconds} วินาที`)
    })
    let prepared: PreparedDvd | undefined
    try {
      const selection = {
        title: Number(title), chapter: Number(chapter),
        ...(lastChapter ? { lastChapter: Number(lastChapter) } : {}),
        angle: Number(angle), ...(audio ? { audio: Number(audio) } : {}),
        ...(subtitle ? { subtitle: Number(subtitle) } : {}),
      }
      const result = await desktop.prepare(selection, disc?.id)
      if (result.state === 'ready') prepared = result
      if (signal.aborted || result.state === 'cancelled') return
      if (result.state === 'error') throw new Error(errors[result.error] ?? errors.convert)
      setProgress(previewOnly ? 'กำลังเตรียมตัวอย่าง DVD' : 'กำลังเก็บวิดีโอในคลังสื่อ')
      const chunks: ArrayBuffer[] = []
      let offset = 0
      while (offset < result.size) {
        if (signal.aborted) return
        const chunk = await desktop.read(result.id, offset)
        if (!chunk?.byteLength) throw new Error('อ่านวิดีโอที่สร้างจาก DVD ไม่ครบ')
        chunks.push(chunk)
        offset += chunk.byteLength
      }
      if (offset !== result.size) throw new Error('ขนาดวิดีโอที่สร้างจาก DVD ไม่ตรง')
      if (signal.aborted) return
      const file = { blob: new Blob(chunks, { type: 'video/mp4' }), filename: result.filename, selection }
      if (previewOnly) setCandidate(file)
      else await saveVideo(file, signal)
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : errors.convert)
    } finally {
      stopProgress()
      if (prepared) await desktop.release(prepared.id).catch(() => {})
      if (running.current === current) {
        running.current = undefined
        setProgress('')
      }
    }
  }

  async function saveVideo({ blob, filename, selection }: PreparedVideo, signal: AbortSignal) {
    const video = await saveLibraryMedia(blob, {
      filename, name: selection.subtitle === undefined ? dvd.name : `${dvd.name} · คำบรรยาย ${selection.subtitle}`, kind: 'video',
    })
    if (!signal.aborted) onImported(video, selection)
  }

  async function confirmPreview() {
    if (!candidate || running.current) return
    const current = new AbortController()
    running.current = current
    setSaving(true)
    setError('')
    setProgress('กำลังเก็บวิดีโอในคลังสื่อ')
    try {
      await saveVideo(candidate, current.signal)
      if (!current.signal.aborted) {
        restoreFocus.current = true
        setCandidate(undefined)
      }
    } catch (cause) {
      if (!current.signal.aborted) setError(cause instanceof Error ? cause.message : errors.convert)
    } finally {
      if (running.current === current) {
        running.current = undefined
        setSaving(false)
        setProgress('')
      }
    }
  }

  if (!desktop) return null
  const readingDisabled = Boolean(progress || candidate || missingAudio || missingSubtitle
    || (disc && (!probe || (probe.state === 'error' && probe.error === 'disc'))))
  return (
    <details className="mt-3! border-t border-[var(--border-subtle)] pt-2! text-sm" onToggle={(event) => {
      if (event.currentTarget.open) return
      event.currentTarget.querySelector('video')?.pause()
      if (!saving) setCandidate(undefined)
    }}>
      <summary className="cursor-pointer font-medium">อ่านคลิปจากแผ่นหรือโฟลเดอร์ DVD</summary>
      {desktop.choose && desktop.tracks && desktop.forget && <div className="mt-2! flex flex-wrap items-center gap-2">
        <button className="btn-secondary" type="button" disabled={Boolean(progress || candidate)} onClick={() => void browse()}>
          {disc ? 'สำรวจแผ่นอื่น' : 'สำรวจแผ่น DVD'}
        </button>
        {disc && <button className="btn-ghost" type="button" disabled={Boolean(progress || candidate)} onClick={closeDisc}>ใช้หมายเลขเอง</button>}
      </div>}
      {disc && <p className="mt-2! wrap-anywhere">{disc.name} · {disc.titles.length} ไตเติล</p>}
      {notice && <p className="mt-2! text-[var(--fg-secondary)]" role="status">{notice}</p>}
      {pickedTitle && pickedTitle.chapters > 99 && <p className="mt-2!">FFmpeg เลือกหมายเลขบทได้ถึง 99 หรือเลือกถึงจบไตเติล</p>}
      <form className="mt-2! grid min-w-0 gap-2" onSubmit={load}>
        <fieldset className="grid min-w-0 grid-cols-2 gap-2" disabled={Boolean(progress || candidate)}>
          <label className="grid gap-1"><span id={`${fields}-title`}>ไตเติล DVD</span>
            {disc ? <select className="input-field min-w-0" value={title} aria-labelledby={`${fields}-title`} onChange={(event) => {
              setTitle(event.target.value)
              setChapter('1')
              setLastChapter('1')
              setAngle('1')
              setNotice('')
            }}>
              {disc.titles.map((item) => <option key={item.number} value={item.number}>{item.number} · {item.chapters} บท</option>)}
            </select> : <input className="input-field min-w-0" type="number" min="1" max="99" required value={title} onChange={(event) => setTitle(event.target.value)} />}
          </label>
          <label className="grid gap-1"><span id={`${fields}-chapter`}>บทเริ่มต้น</span>
            {chapterLimit ? <select className="input-field min-w-0" value={chapter} aria-labelledby={`${fields}-chapter`} onChange={(event) => {
              if (lastChapter && (chapter === lastChapter || Number(event.target.value) > Number(lastChapter))) setLastChapter(event.target.value)
              setChapter(event.target.value)
            }}>{numberOptions(chapterLimit)}</select>
              : <input className="input-field min-w-0" type="number" min="1" max="99" required value={chapter} onChange={(event) => {
                if (chapter === lastChapter) setLastChapter(event.target.value)
                setChapter(event.target.value)
              }} />}
          </label>
          <label className="grid gap-1"><span id={`${fields}-end`}>บทสุดท้าย</span>
            {chapterLimit ? <select className="input-field min-w-0" value={lastChapter} aria-labelledby={`${fields}-end`} onChange={(event) => setLastChapter(event.target.value)}>
              <option value="">ถึงจบไตเติล</option>
              {numberOptions(chapterLimit, Number(chapter))}
            </select> : <input className="input-field min-w-0" type="number" min={chapter || 1} max="99" value={lastChapter}
              placeholder="ถึงจบไตเติล" onChange={(event) => setLastChapter(event.target.value)} />}
          </label>
          <label className="grid gap-1"><span id={`${fields}-angle`}>มุมกล้อง</span>
            {pickedTitle ? <select className="input-field min-w-0" value={angle} aria-labelledby={`${fields}-angle`} onChange={(event) => setAngle(event.target.value)}>
              {numberOptions(pickedTitle.angles)}
            </select> : <input className="input-field min-w-0" type="number" min="1" max="9" required value={angle} onChange={(event) => setAngle(event.target.value)} />}
          </label>
          <label className="grid gap-1"><span id={`${fields}-audio`}>แทร็กเสียงในวิดีโอ</span>
            {tracks ? <select className="input-field min-w-0" value={audio} aria-labelledby={`${fields}-audio`} aria-invalid={missingAudio} onChange={(event) => setAudio(event.target.value)}>
              <option value="">{tracks.audio.length ? 'แทร็กแรก (อัตโนมัติ)' : 'ไตเติลนี้ไม่มีเสียง'}</option>
              {trackOptions(tracks.audio, audio)}
            </select> : <input className="input-field min-w-0" type="number" min="1" max="8" value={audio} placeholder="แทร็กแรก"
              onChange={(event) => setAudio(event.target.value)} />}
          </label>
          <label className="grid gap-1"><span id={`${fields}-subtitle`}>แทร็กคำบรรยาย DVD</span>
            {tracks ? <select className="input-field min-w-0" value={subtitle} aria-invalid={missingSubtitle}
              aria-labelledby={`${fields}-subtitle`} aria-describedby={subtitleHint} onChange={(event) => setSubtitle(event.target.value)}>
              <option value="">{tracks.subtitles.length ? 'ปิดคำบรรยาย' : 'ไตเติลนี้ไม่มีคำบรรยาย'}</option>
              {trackOptions(tracks.subtitles, subtitle)}
            </select> : <input className="input-field min-w-0" type="number" min="1" max="32" value={subtitle}
              aria-describedby={subtitleHint} onChange={(event) => setSubtitle(event.target.value)} />}
          </label>
          <p className="col-span-2 text-[var(--fg-secondary)]" id={subtitleHint}>
            {tracks ? 'แทร็กที่เลือกจะฝังลงในวิดีโอ' : 'เลือกแทร็ก 1–32 เพื่อฝังคำบรรยายในวิดีโอ เว้นว่างเพื่อปิด'}
            {savedSubtitle === undefined && dvd.subtitleTrack === 0 && dvd.lastChapter === undefined
              && ' หากคลิปเดิมเปิดคำบรรยายแทร็กแรก ให้เลือก 1'}
          </p>
        </fieldset>
        {disc && !probe && <p role="status">กำลังอ่านแทร็กของบทที่เลือก</p>}
        {probe?.state === 'error' && <p role="alert" className="text-[var(--status-error-text)]">{errors[probe.error] ?? errors.convert}</p>}
        <div className="flex flex-wrap gap-2">
          <button ref={previewButton} className="btn-secondary" type="submit" value="preview" disabled={readingDisabled}>ดูตัวอย่างก่อนนำเข้า</button>
          <button className="btn-secondary" type="submit" disabled={readingDisabled}>
            {disc ? 'นำเข้าจากแผ่นที่เลือก' : 'เลือกแผ่นหรือโฟลเดอร์'}
          </button>
          {progress && !saving && <button className="btn-ghost" type="button" disabled={running.current?.signal.aborted} onClick={() => {
            running.current?.abort()
            void desktop.cancel().catch(() => {})
            setProgress('กำลังยกเลิกการอ่าน DVD')
          }}>ยกเลิกการอ่าน DVD</button>}
        </div>
      </form>
      {candidate && <DvdImportPreview file={candidate.blob} dvd={dvd} saving={saving || Boolean(progress)} onSave={() => void confirmPreview()}
        onDiscard={() => { restoreFocus.current = true; setCandidate(undefined); setError('') }} />}
      {progress && <p className="mt-2!" role="status">{progress}</p>}
      {error && <p className="mt-2! text-[var(--status-error-text)]" role="alert">{error}</p>}
    </details>
  )
}
