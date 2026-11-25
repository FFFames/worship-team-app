import { useRef, useState, type FormEvent } from 'react'
import { useNurserySettings } from '../hooks/useNurseryAlerts'
import { alertOutputLabels } from '../types/alertTemplate'
import { nurseryOutputs, nurseryPositionLabels, nurseryPositions, saveNurserySettings, validNurseryFont, validNurseryStyle, type NurseryOutput, type NurseryStyle } from '../utils/nurseryAlerts'
import { AlertTextEffectsFields } from './AlertTextEffectsFields'

export function NurserySettingsForm() {
  const settings = useNurserySettings()
  return (
    <section id="nursery-settings" aria-labelledby="nursery-settings-title" className="surface grid min-w-0 gap-4 rounded-xl p-4!">
      <h2 id="nursery-settings-title" className="text-base! font-medium">ตั้งค่าการเรียกผู้ปกครอง</h2>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        {nurseryOutputs.map((output) => <NurseryOutputForm key={output} output={output} style={settings[output]} />)}
      </div>
    </section>
  )
}

function NurseryOutputForm({ output, style }: { output: NurseryOutput; style: NurseryStyle }) {
  const [patch, setPatch] = useState<Partial<NurseryStyle>>({})
  const [status, setStatus] = useState('')
  const [error, setError] = useState(false)
  const [invalidFont, setInvalidFont] = useState(false)
  const fontField = useRef<HTMLInputElement>(null)
  const draft = { ...style, ...patch }

  function change(update: Partial<NurseryStyle>) {
    setPatch((current) => ({ ...current, ...update }))
    setStatus('')
    setError(false)
    setInvalidFont(false)
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = { ...draft, fontFamily: draft.fontFamily?.trim() || undefined }
    if (normalized.fontFamily && !validNurseryFont(normalized.fontFamily)) {
      setInvalidFont(true)
      fontField.current?.focus()
      return
    }
    if (!validNurseryStyle(normalized)) return
    try {
      saveNurserySettings({ [output]: normalized })
      setPatch({})
      setStatus('บันทึกการเรียกผู้ปกครองแล้ว')
    } catch { setError(true) }
  }

  return (
    <form onSubmit={save} className="min-w-0">
      <fieldset className="grid min-w-0 gap-2 rounded-lg border border-[var(--border-subtle)] p-3! text-sm">
        <legend className="px-1! font-medium">{alertOutputLabels[output]}</legend>
        <label className="flex gap-2"><input type="checkbox" checked={draft.enabled}
          onChange={(event) => change({ enabled: event.currentTarget.checked })} />เปิดการเรียกผู้ปกครอง</label>
        <div className="grid min-w-0 gap-1">
          <label htmlFor={`${output}-nursery-position`}>ตำแหน่งบนจอ</label>
          <select id={`${output}-nursery-position`} className="input-field" value={draft.position}
            onChange={(event) => change({ position: event.currentTarget.value as NurseryStyle['position'] })}>
            {nurseryPositions.map((position) => <option key={position} value={position}>{nurseryPositionLabels[position]}</option>)}
          </select>
        </div>
        <label className="grid min-w-0 gap-1">ชื่อแบบอักษร
          <input ref={fontField} className="input-field min-w-0" type="text" autoComplete="off" spellCheck={false}
            value={draft.fontFamily ?? ''} aria-invalid={invalidFont || undefined} aria-describedby={invalidFont ? `${output}-nursery-font-error` : undefined}
            onChange={(event) => change({ fontFamily: event.currentTarget.value })} />
        </label>
        {invalidFont && <p id={`${output}-nursery-font-error`} role="alert">กรอกชื่อแบบอักษรไม่เกิน 80 ตัวอักษร หรือเว้นว่างเพื่อใช้ค่าเริ่มต้น</p>}
        <fieldset className="grid gap-1">
          <legend>รูปแบบตัวอักษร</legend>
          <label className="flex gap-2"><input type="checkbox" checked={draft.bold ?? true}
            onChange={(event) => change({ bold: event.currentTarget.checked })} />ตัวหนา</label>
          <label className="flex gap-2"><input type="checkbox" checked={draft.italic ?? false}
            onChange={(event) => change({ italic: event.currentTarget.checked })} />ตัวเอียง</label>
        </fieldset>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">สีข้อความ
            <input type="color" value={draft.textColor} onChange={(event) => change({ textColor: event.currentTarget.value })} />
          </label>
          <label className="grid gap-1">สีพื้นหลัง
            <input type="color" value={draft.backgroundColor} onChange={(event) => change({ backgroundColor: event.currentTarget.value })} />
          </label>
          <label className="grid min-w-0 gap-1">ความทึบพื้นหลัง (%)
            <input className="input-field min-w-0" type="number" required min={0} max={100} value={Number.isNaN(draft.opacity) ? '' : draft.opacity}
              onChange={(event) => change({ opacity: event.currentTarget.valueAsNumber })} />
          </label>
          <label className="grid min-w-0 gap-1">{draft.fontRatio === undefined ? 'ขนาดข้อความ (px)' : 'ขนาดข้อความอ้างอิงที่ 1080p (px)'}
            <input className="input-field min-w-0" type="number" required min={12} max={160} value={Number.isNaN(draft.fontSize) ? '' : draft.fontSize}
              onChange={(event) => change({ fontSize: event.currentTarget.valueAsNumber, fontRatio: undefined })} />
          </label>
        </div>
        <label className="flex gap-2"><input type="checkbox" checked={draft.seconds !== null}
          onChange={(event) => change({ seconds: event.currentTarget.checked ? style.seconds ?? 30 : null })} />ซ่อนหมายเลขอัตโนมัติ</label>
        {draft.seconds !== null && <label className="grid min-w-0 gap-1">แสดงนาน (วินาที)
          <input className="input-field min-w-0" type="number" required min={1} max={5999} value={Number.isNaN(draft.seconds) ? '' : draft.seconds}
            onChange={(event) => change({ seconds: event.currentTarget.valueAsNumber })} />
        </label>}
        <AlertTextEffectsFields value={draft.effects} onChange={(effects) => change({ effects })} />
        <button type="submit" className="btn-secondary justify-self-start">บันทึกค่าการเรียกผู้ปกครอง</button>
        {status && <p role="status">{status}</p>}
        {error && <p role="alert">บันทึกค่าการเรียกผู้ปกครองไม่สำเร็จ</p>}
      </fieldset>
    </form>
  )
}
