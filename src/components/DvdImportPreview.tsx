import { useEffect, useId, useRef, useState } from 'react'
import { useMediaClip } from '../hooks/useMediaClip'
import type { DvdClip } from '../types/dvdClip'
import { dvdObjectFit } from '../utils/dvdPlayback'
import { mediaClipKey } from '../utils/mediaClip'

export function DvdImportPreview({ file, dvd, saving, onSave, onDiscard }: {
  file: Blob; dvd: DvdClip; saving: boolean; onSave: () => void; onDiscard: () => void
}) {
  const headingId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const [url, setUrl] = useState('')
  const [duration, setDuration] = useState<number>()
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [useMarks, setUseMarks] = useState(true)
  const hasMarks = Boolean(mediaClipKey(dvd.clip))
  const marksOutsideVideo = duration !== undefined && ((dvd.clip?.startSeconds ?? 0) >= duration
    || (dvd.clip?.endSeconds ?? 0) > duration + 0.05)
  const bindVideo = useMediaClip(useMarks && !marksOutsideVideo ? dvd.clip : undefined)

  useEffect(() => {
    const source = URL.createObjectURL(file)
    setUrl(source)
    heading.current?.focus()
    return () => URL.revokeObjectURL(source)
  }, [file])

  return (
    <section className="mt-3! grid gap-2 rounded-lg border border-[var(--border-subtle)] p-3!" aria-labelledby={headingId}>
      <h4 id={headingId} ref={heading} tabIndex={-1} className="font-medium">ตัวอย่าง DVD ก่อนบันทึก</h4>
      {url && <video ref={bindVideo} src={url} controls playsInline preload="auto" aria-label="ตัวอย่างช่วงที่เลือกจาก DVD"
        className="aspect-video w-full rounded-md bg-black" style={{ objectFit: dvdObjectFit(dvd.playback) ?? 'contain' }}
        onLoadedMetadata={(event) => {
          const seconds = event.currentTarget.duration
          if (Number.isFinite(seconds) && seconds > 0) setDuration(seconds)
        }} onLoadedData={() => setReady(true)} onError={() => setFailed(true)} />}
      {hasMarks && !marksOutsideVideo && <label className="flex items-center gap-2">
        <input type="checkbox" checked={useMarks} onChange={(event) => setUseMarks(event.target.checked)} />
        ดูเฉพาะช่วงที่บันทึกไว้
      </label>}
      {hasMarks && marksOutsideVideo && <p role="status" className="text-[var(--status-error-text)]">
        ช่วงที่บันทึกใน EasyWorship อยู่นอกวิดีโอนี้ กรุณาตรวจบทที่เลือกหรือแก้เวลาในตัวแก้คลิป
      </p>}
      {failed && <p role="alert" className="text-[var(--status-error-text)]">เปิดตัวอย่างวิดีโอจาก DVD ไม่สำเร็จ</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" type="button" disabled={!ready || failed || saving} onClick={onSave}>บันทึกวิดีโอนี้</button>
        <button className="btn-secondary" type="button" disabled={saving} onClick={onDiscard}>กลับไปเลือกช่วง</button>
      </div>
    </section>
  )
}
