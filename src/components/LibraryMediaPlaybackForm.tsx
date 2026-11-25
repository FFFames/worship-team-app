import { useId, useState } from 'react'
import type { LibraryMediaPlayback, MediaKind } from '../types/media'
import { isMediaFit, isMediaUsage, mediaVolume, sameMediaPlayback } from '../utils/mediaPlayback'

const field = 'grid min-w-0 gap-1 text-sm'
const choice = (value?: boolean) => value === undefined ? '' : value ? 'on' : 'off'
const flag = (value: string) => value === '' ? undefined : value === 'on'

export function LibraryMediaPlaybackForm({ value, kind, busy, onSave }: {
  value?: LibraryMediaPlayback; kind: MediaKind; busy: boolean; onSave: (value: LibraryMediaPlayback) => void
}) {
  const [draft, setDraft] = useState<LibraryMediaPlayback>(value ?? {})
  const id = useId()
  const volume = Math.round(mediaVolume(draft) * 100)

  return <form className="mt-3!" onSubmit={(event) => { event.preventDefault(); onSave(draft) }}>
    <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2" disabled={busy}>
      <legend className="mb-2! font-medium">การเล่นบนจอ</legend>
      {kind !== 'audio' && <div className={field}>
        <label htmlFor={`${id}-usage`}>ลักษณะการใช้สื่อ</label>
        <select id={`${id}-usage`} className="input-field min-w-0" value={draft.usage ?? 'auto'} onChange={(event) => {
          const usage = event.currentTarget.value
          if (isMediaUsage(usage)) setDraft({ ...draft, usage })
        }}>
          <option value="auto">อัตโนมัติ</option>
          <option value="foreground">พื้นหน้า</option>
          <option value="background">พื้นหลัง</option>
        </select>
      </div>}
      {kind !== 'audio' && <div className={field}>
        <label htmlFor={`${id}-fit`}>{kind === 'image' ? 'สัดส่วนภาพ' : 'สัดส่วนวิดีโอ'}</label>
        <select id={`${id}-fit`} className="input-field min-w-0" value={draft.fit ?? ''} onChange={(event) => {
          const fit = event.currentTarget.value
          setDraft({ ...draft, fit: isMediaFit(fit) ? fit : undefined })
        }}>
          <option value="">ค่าเริ่มต้น</option>
          <option value="auto">อัตโนมัติตามการใช้งาน</option>
          <option value="contain">คงสัดส่วน</option>
          <option value="fill">ยืดเต็มกรอบ</option>
          <option value="cover">ซูมเต็มกรอบ</option>
        </select>
      </div>}
      {kind !== 'image' && <>
        <div className={field}>
          <label htmlFor={`${id}-repeat`}>เล่นซ้ำ</label>
          <select id={`${id}-repeat`} className="input-field min-w-0" value={choice(draft.repeat)}
            onChange={(event) => setDraft({ ...draft, repeat: flag(event.currentTarget.value) })}>
            <option value="">ค่าเริ่มต้น</option>
            <option value="on">เล่นวน</option>
            <option value="off">เล่นครั้งเดียว</option>
          </select>
        </div>
        <div className={field}>
          <label htmlFor={`${id}-muted`}>เสียงเมื่อขึ้นจอ</label>
          <select id={`${id}-muted`} className="input-field min-w-0" value={choice(draft.muted)}
            onChange={(event) => setDraft({ ...draft, muted: flag(event.currentTarget.value) })}>
            <option value="">ค่าเริ่มต้น</option>
            <option value="off">เปิดเสียง</option>
            <option value="on">ปิดเสียง</option>
          </select>
        </div>
        <div className={field}>
          <label htmlFor={`${id}-volume`}>ระดับเสียง <span aria-hidden="true">{volume}%</span></label>
          <input id={`${id}-volume`} className="w-full min-w-0 self-center" type="range" min="0" max="100" step="1" value={volume}
            aria-valuetext={`${volume}%`} onChange={(event) => setDraft({ ...draft, volume: event.currentTarget.valueAsNumber / 100 })} />
        </div>
      </>}
      <button type="submit" className="btn-secondary justify-self-start" disabled={sameMediaPlayback(value, draft)}>บันทึกการเล่น</button>
    </fieldset>
  </form>
}
