import type { DesignElementBorder, ElementEffectChanges } from '../types/slideDesign'

const field = 'grid min-w-0 gap-1 text-sm'
const effectsBox = 'grid min-w-0 gap-2 rounded-md border border-[var(--border-subtle)] p-3!'
const defaultBorder: DesignElementBorder = { color: '#ffffff', opacity: 1, width: 4 / 1080, position: 'outer', join: 'round' }
const defaultShadow = { color: '#000000', opacity: .9, blur: 5 / 1080, offset: 10 / 1080, angle: 315 }
const defaultReflection = { opacity: .5, size: .75, blur: 0, distance: 0 }

export function ElementEffectFields({ value, onChange }: {
  value: ElementEffectChanges
  onChange: (changes: ElementEffectChanges) => void
}) {
  const { elementBorder: border, elementShadow: shadow, elementReflection: reflection } = value
  return <details className="min-w-0 rounded-lg border border-[var(--border-subtle)] p-3!">
    <summary className="cursor-pointer text-sm font-medium">เอฟเฟ็กต์กรอบที่เลือก</summary>
    <div className="mt-3! grid gap-3">
      <fieldset className={effectsBox}>
        <legend className="px-1! text-sm">เส้นขอบ</legend>
        <Toggle label="เปิดเส้นขอบ" checked={Boolean(border)} onChange={(enabled) => onChange({ elementBorder: enabled && defaultBorder })} />
        {border && <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
          <ColorField label="สีเส้นขอบ" value={border.color} onChange={(color) => onChange({ elementBorder: { ...border, color } })} />
          <Measure label="ความทึบเส้นขอบ (%)" value={border.opacity} onChange={(opacity) => onChange({ elementBorder: { ...border, opacity } })} />
          <Measure label="ความหนาเส้นขอบ (% ความสูงสไลด์)" value={border.width} min={.01} max={20}
            onChange={(width) => onChange({ elementBorder: { ...border, width } })} />
          <label className={field}>ตำแหน่งเส้นขอบ
            <select className="input-field min-w-0" aria-label="ตำแหน่งเส้นขอบ" value={border.position} onChange={(event) => onChange({
              elementBorder: { ...border, position: event.currentTarget.value as DesignElementBorder['position'] },
            })}>
              <option value="outer">ด้านนอก</option><option value="center">กึ่งกลาง</option><option value="inner">ด้านใน</option>
            </select>
          </label>
          <label className={field}>มุมเส้นขอบ
            <select className="input-field min-w-0" aria-label="มุมเส้นขอบ" value={border.join} onChange={(event) => onChange({
              elementBorder: { ...border, join: event.currentTarget.value as DesignElementBorder['join'] },
            })}>
              <option value="round">มน</option><option value="miter">เหลี่ยม</option><option value="bevel">ตัดมุม</option>
            </select>
          </label>
        </div>}
      </fieldset>
      <fieldset className={effectsBox}>
        <legend className="px-1! text-sm">เงา</legend>
        <Toggle label="เปิดเงา" checked={Boolean(shadow)} onChange={(enabled) => onChange({ elementShadow: enabled && defaultShadow })} />
        {shadow && <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
          <ColorField label="สีเงา" value={shadow.color} onChange={(color) => onChange({ elementShadow: { ...shadow, color } })} />
          <Measure label="ความทึบเงา (%)" value={shadow.opacity} onChange={(opacity) => onChange({ elementShadow: { ...shadow, opacity } })} />
          <Measure label="ระยะเงา (% ความสูงสไลด์)" value={shadow.offset} max={20}
            onChange={(offset) => onChange({ elementShadow: { ...shadow, offset } })} />
          <Measure label="ความเบลอเงา (% ความสูงสไลด์)" value={shadow.blur} max={20}
            onChange={(blur) => onChange({ elementShadow: { ...shadow, blur } })} />
          <Measure label="มุมเงา (องศา)" value={shadow.angle} scale={1} max={360}
            onChange={(angle) => onChange({ elementShadow: { ...shadow, angle: angle % 360 } })} />
        </div>}
      </fieldset>
      <fieldset className={effectsBox}>
        <legend className="px-1! text-sm">เงาสะท้อน</legend>
        <Toggle label="เปิดเงาสะท้อน" checked={Boolean(reflection)}
          onChange={(enabled) => onChange({ elementReflection: enabled && defaultReflection })} />
        {reflection && <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
          <Measure label="ความทึบเงาสะท้อน (%)" value={reflection.opacity}
            onChange={(opacity) => onChange({ elementReflection: { ...reflection, opacity } })} />
          <Measure label="ความยาวเงาสะท้อน (% ความสูงกรอบ)" value={reflection.size}
            onChange={(size) => onChange({ elementReflection: { ...reflection, size } })} />
          <Measure label="ระยะเงาสะท้อน (% ความสูงสไลด์)" value={reflection.distance} max={20}
            onChange={(distance) => onChange({ elementReflection: { ...reflection, distance } })} />
          <Measure label="ความเบลอเงาสะท้อน (% ความสูงสไลด์)" value={reflection.blur} max={20}
            onChange={(blur) => onChange({ elementReflection: { ...reflection, blur } })} />
        </div>}
      </fieldset>
    </div>
  </details>
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center gap-2 text-sm">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />{label}
  </label>
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className={field}>{label}
    <input type="color" className="h-9 w-full" value={value} onChange={(event) => onChange(event.currentTarget.value)} />
  </label>
}

function Measure({ label, value, scale = 100, min = 0, max = 100, onChange }: {
  label: string; value: number; scale?: number; min?: number; max?: number; onChange: (value: number) => void
}) {
  return <label className={field}>{label}
    <input type="number" step="any" min={min} max={max} className="input-field min-w-0"
      value={Number((value * scale).toFixed(4))}
      onChange={(event) => {
        const amount = event.currentTarget.valueAsNumber
        if (Number.isFinite(amount) && amount >= min && amount <= max) onChange(amount / scale)
      }} />
  </label>
}
