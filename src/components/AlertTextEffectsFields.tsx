import type { AlertTextEffects } from '../utils/alertTextEffects'

export function AlertTextEffectsFields({ value, onChange }: {
  value?: AlertTextEffects
  onChange: (value: AlertTextEffects) => void
}) {
  const outline = value?.outline ?? { enabled: false }
  const shadow = value?.shadow ?? { enabled: false }
  return (
    <details className="min-w-0">
      <summary className="cursor-pointer">เอฟเฟกต์ตัวอักษร</summary>
      <div className="mt-2! grid gap-2">
        <label className="flex gap-2"><input type="checkbox" checked={value?.underline ?? false}
          onChange={(event) => onChange({ ...value, underline: event.currentTarget.checked })} />ขีดเส้นใต้</label>
        <label className="flex gap-2"><input type="checkbox" checked={value?.strike ?? false}
          onChange={(event) => onChange({ ...value, strike: event.currentTarget.checked })} />ขีดทับ</label>
        <label className="grid gap-1"><span>ระดับตัวอักษร</span>
          <select aria-label="ระดับตัวอักษร" className="input-field" value={value?.baseline ?? 'normal'}
            onChange={(event) => onChange({ ...value, baseline: event.currentTarget.value as AlertTextEffects['baseline'] })}>
            <option value="normal">ปกติ</option>
            <option value="super">ตัวยก</option>
            <option value="sub">ตัวห้อย</option>
          </select>
        </label>
        <Measure label="ความทึบตัวอักษร (%)" value={value?.fontOpacity} onChange={(fontOpacity) => onChange({ ...value, fontOpacity })} />
        <fieldset className="grid min-w-0 gap-2 rounded-md border border-[var(--border-subtle)] p-2!">
          <legend>เส้นขอบ</legend>
          <label className="flex gap-2"><input type="checkbox" checked={outline.enabled}
            onChange={(event) => onChange({ ...value, outline: { ...outline, enabled: event.currentTarget.checked } })} />เปิดเส้นขอบ</label>
          {outline.enabled && <>
            <label className="grid gap-1">สีเส้นขอบ <input type="color" value={outline.color ?? '#000000'}
              onChange={(event) => onChange({ ...value, outline: { ...outline, color: event.currentTarget.value } })} /></label>
            <Measure label="ความทึบเส้นขอบ (%)" value={outline.opacity}
              onChange={(opacity) => onChange({ ...value, outline: { ...outline, opacity } })} />
            <Measure label="ความหนาเส้นขอบ (% ของความสูงจอ)" value={outline.width} multiplier={100}
              onChange={(width) => onChange({ ...value, outline: { ...outline, width } })} />
            <label className="grid gap-1"><span>ตำแหน่งเส้นขอบ</span>
              <select aria-label="ตำแหน่งเส้นขอบ" className="input-field" value={outline.position ?? 'outer'}
                onChange={(event) => onChange({ ...value, outline: { ...outline,
                  position: event.currentTarget.value as typeof outline.position } })}>
                <option value="outer">ด้านนอก</option>
                <option value="center">กึ่งกลาง</option>
                <option value="inner">ด้านใน (แสดงกึ่งกลางบนเว็บ)</option>
              </select>
            </label>
          </>}
        </fieldset>
        <fieldset className="grid min-w-0 gap-2 rounded-md border border-[var(--border-subtle)] p-2!">
          <legend>เงาตัวอักษร</legend>
          <label className="flex gap-2"><input type="checkbox" checked={shadow.enabled}
            onChange={(event) => onChange({ ...value, shadow: { ...shadow, enabled: event.currentTarget.checked } })} />เปิดเงาตัวอักษร</label>
          {shadow.enabled && <>
            <label className="grid gap-1">สีเงา <input type="color" value={shadow.color ?? '#000000'}
              onChange={(event) => onChange({ ...value, shadow: { ...shadow, color: event.currentTarget.value } })} /></label>
            <Measure label="ความทึบเงา (%)" value={shadow.opacity}
              onChange={(opacity) => onChange({ ...value, shadow: { ...shadow, opacity } })} />
            <Measure label="ความเบลอเงา (% ของความสูงจอ)" value={shadow.blur} multiplier={100}
              onChange={(blur) => onChange({ ...value, shadow: { ...shadow, blur } })} />
            <Measure label="ระยะเงา (% ของความสูงจอ)" value={shadow.offset} multiplier={100}
              onChange={(offset) => onChange({ ...value, shadow: { ...shadow, offset } })} />
            <Measure label="มุมเงา (องศา)" value={shadow.angle} min={-360} max={360}
              onChange={(angle) => onChange({ ...value, shadow: { ...shadow, angle } })} />
          </>}
        </fieldset>
      </div>
    </details>
  )
}

function Measure({ label, value, multiplier = 1, min = 0, max = 100, onChange }: {
  label: string
  value?: number
  multiplier?: number
  min?: number
  max?: number
  onChange: (value: number | undefined) => void
}) {
  return (
    <label className="grid min-w-0 gap-1">{label}
      <input type="number" min={min} max={max} step="any" className="input-field min-w-0"
        value={value === undefined || Number.isNaN(value) ? '' : Number((value * multiplier).toFixed(5))}
        onChange={(event) => onChange(event.currentTarget.value === '' ? undefined : event.currentTarget.valueAsNumber / multiplier)} />
    </label>
  )
}
