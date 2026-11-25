/** Edits the stage display's next item and clock settings. */

import { useState } from 'react'
import { foldbackClockPositions, foldbackContentLabels, foldbackContentRoles, foldbackDefaultClockFormat, foldbackHorizontalAlignments,
  foldbackServiceFormats, foldbackVerticalAlignments, type FoldbackAppearance, type FoldbackClockPosition, type FoldbackContentRole,
  type FoldbackContentSettings, type FoldbackContentStyle, type FoldbackLineCount, type FoldbackServiceSettings, type FoldbackTextAppearance } from '../utils/foldbackAppearance'
import { clockFormats } from '../utils/alertTokenEditing'
import { nurseryPositionLabels } from '../utils/nurseryAlerts'
import { useAlertResourceCatalogs } from '../hooks/useAlertTemplates'
import { ServiceIntervalFields } from './ServiceIntervalFields'
import { AlertTextEffectsFields } from './AlertTextEffectsFields'

const nextLineOptions = { 0: 'ซ่อน', 1: 'หนึ่งบรรทัด', 2: 'สองบรรทัด' }

function PositionField({ id, label, value, onChange }: {
  id: string; label: string; value: FoldbackClockPosition; onChange: (position: FoldbackClockPosition) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="input-field min-w-0" value={value} onChange={(event) => {
        const position = foldbackClockPositions.find((item) => item === event.currentTarget.value)
        if (position) onChange(position)
      }}>
        {foldbackClockPositions.map((position) => <option key={position} value={position}>{nurseryPositionLabels[position]}</option>)}
      </select>
    </div>
  )
}

function TextAppearanceFields({ value, onChange, textColor, backgroundColor }: {
  value: FoldbackTextAppearance; onChange: (patch: FoldbackTextAppearance) => void; textColor: string; backgroundColor: string
}) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-3">
      <label className="col-span-2 flex min-w-0 flex-col gap-1 text-sm">แบบอักษร
        <input className="input-field min-w-0" placeholder="ตามค่าเริ่มต้น" maxLength={80} value={value.fontFamily ?? ''}
          onChange={(event) => onChange({ fontFamily: event.currentTarget.value || undefined })} />
      </label>
      <label className="col-span-2 flex min-w-0 flex-col gap-1 text-sm">ขนาดอักษร (% ของความสูงจอ)
        <input className="input-field min-w-0" type="number" min={0.1} max={25} step="any"
          placeholder="อัตโนมัติ" value={value.fontRatio === undefined ? '' : Number((value.fontRatio * 100).toFixed(5))}
          onChange={(event) => onChange({ fontRatio: event.currentTarget.value ? event.currentTarget.valueAsNumber / 100 : undefined })} />
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm">สีตัวอักษร
        <input type="color" className="h-10 w-full cursor-pointer rounded border border-[var(--border-subtle)]"
          value={value.textColor ?? textColor} onChange={(event) => onChange({ textColor: event.currentTarget.value })} />
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm">สีพื้นหลัง
        <input type="color" className="h-10 w-full cursor-pointer rounded border border-[var(--border-subtle)]"
          value={value.backgroundColor ?? backgroundColor}
          onChange={(event) => onChange({ backgroundColor: event.currentTarget.value, opacity: value.opacity ?? 100 })} />
      </label>
      <label className="col-span-2 flex min-w-0 flex-col gap-1 text-sm">ความทึบพื้นหลัง (%)
        <input className="input-field min-w-0" type="number" min={0} max={100}
          value={value.opacity ?? (backgroundColor === '#000000' ? 0 : 100)}
          onChange={(event) => onChange({ backgroundColor: value.backgroundColor ?? backgroundColor,
            opacity: event.currentTarget.value ? event.currentTarget.valueAsNumber : undefined })} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value.bold ?? false} onChange={(event) => onChange({ bold: event.currentTarget.checked })} />
        ตัวหนา
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value.italic ?? false} onChange={(event) => onChange({ italic: event.currentTarget.checked })} />
        ตัวเอียง
      </label>
    </div>
  )
}

export function FoldbackAppearanceFields({ value, disabled, onChange }: {
  value: FoldbackAppearance; disabled: boolean; onChange: (patch: FoldbackAppearance) => void
}) {
  const { next = {}, clock = {} } = value
  return (
    <fieldset id="foldback-appearance" disabled={disabled} className="grid min-w-0 gap-4 sm:grid-cols-2">
      <legend className="mb-2! text-base font-medium">รายการถัดไปและนาฬิกาบนจอเวที</legend>
      <fieldset className="grid min-w-0 content-start gap-3 rounded-lg border border-[var(--border-subtle)] p-3!">
        <legend className="px-1! text-sm font-medium">รายการถัดไป</legend>
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          <label htmlFor="foldback-next-lines">จำนวนบรรทัดเริ่มต้น</label>
          <select id="foldback-next-lines" className="input-field min-w-0" value={value.nextLines ?? 2}
            onChange={(event) => onChange({ nextLines: Number(event.currentTarget.value) as FoldbackLineCount })}>
            {([2, 1, 0] as const).map((lines) => <option key={lines} value={lines}>{nextLineOptions[lines]}</option>)}
          </select>
        </div>
        <TextAppearanceFields value={next} textColor="#ffffff" backgroundColor="#18181b"
          onChange={(patch) => onChange({ next: { ...next, ...patch } })} />
      </fieldset>
      <fieldset className="grid min-w-0 content-start gap-3 rounded-lg border border-[var(--border-subtle)] p-3!">
        <legend className="px-1! text-sm font-medium">นาฬิกา</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={clock.enabled ?? true}
            onChange={(event) => onChange({ clock: { ...clock, enabled: event.currentTarget.checked } })} />
          แสดงนาฬิกา
        </label>
        <PositionField id="foldback-clock-position" label="ตำแหน่งนาฬิกา" value={clock.position ?? 'top-right'}
          onChange={(position) => onChange({ clock: { ...clock, position } })} />
        <label className="flex min-w-0 flex-col gap-1 text-sm">รูปแบบเวลา
          <input className="input-field min-w-0" list="foldback-clock-formats" maxLength={80}
            placeholder={foldbackDefaultClockFormat} value={clock.format ?? ''}
            onChange={(event) => onChange({ clock: { ...clock, format: event.currentTarget.value || undefined } })} />
          <datalist id="foldback-clock-formats">
            {clockFormats.map((format) => <option key={format} value={format} />)}
          </datalist>
        </label>
        <TextAppearanceFields value={clock} textColor="#ffffff" backgroundColor="#000000"
          onChange={(patch) => onChange({ clock: { ...clock, ...patch } })} />
      </fieldset>
    </fieldset>
  )
}

export function FoldbackServiceFields({ value, disabled, onChange }: {
  value: FoldbackServiceSettings; disabled: boolean; onChange: (patch: FoldbackServiceSettings) => void
}) {
  const { items } = useAlertResourceCatalogs()
  const [catalogId, setCatalogId] = useState('')
  const catalogs = items.filter((catalog) => catalog.serviceIntervals.length)
  const selected = catalogs.find((catalog) => catalog.id === catalogId)
  return (
    <fieldset id="foldback-service" disabled={disabled} className="grid min-w-0 gap-4 sm:grid-cols-2">
      <legend className="mb-2! text-base font-medium">เวลานับถอยหลังบนจอเวที</legend>
      <div className="grid min-w-0 content-start gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={value.enabled ?? false} onChange={(event) => onChange({ enabled: event.currentTarget.checked })} />
          แสดงเวลานับถอยหลังนมัสการ
        </label>
        <PositionField id="foldback-service-position" label="ตำแหน่งเวลานับถอยหลัง" value={value.position ?? 'top-left'}
          onChange={(position) => onChange({ position })} />
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="foldback-service-format">รูปแบบเวลานับถอยหลัง</label>
          <select id="foldback-service-format" className="input-field min-w-0" value={value.format ?? 'hh:nn{ss}'}
            onChange={(event) => {
              const format = foldbackServiceFormats.find((item) => item === event.currentTarget.value)
              if (format) onChange({ format })
            }}>
            <option value="hh:nn{ss}">ชั่วโมง:นาที · แสดงวินาทีในนาทีสุดท้าย</option>
            <option value="hh:nn:ss">ชั่วโมง:นาที:วินาที</option>
            <option value="hh:nn">ชั่วโมง:นาที</option>
            <option value="nn:ss">นาที:วินาที</option>
          </select>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={value.allowOverrun ?? false} onChange={(event) => onChange({ allowOverrun: event.currentTarget.checked })} />
          แสดงเวลาติดลบเมื่อเกินกำหนด
        </label>
        <details>
          <summary className="mb-2 cursor-pointer">รูปแบบตัวอักษรและพื้นหลัง</summary>
          <TextAppearanceFields value={value} textColor="#ffffff" backgroundColor="#000000" onChange={onChange} />
        </details>
      </div>
      <div className="grid min-w-0 content-start gap-3 text-sm">
        {catalogs.length > 0 && <div className="grid min-w-0 gap-2">
          <label htmlFor="foldback-service-catalog">คัดลอกช่วงเวลาจากคลัง EasyWorship</label>
          <select id="foldback-service-catalog" className="input-field min-w-0" value={selected?.id ?? ''}
            onChange={(event) => setCatalogId(event.currentTarget.value)}>
            <option value="">เลือกชุดเวลานมัสการ</option>
            {catalogs.map((catalog) => <option key={catalog.id} value={catalog.id}>{catalog.sourceName}</option>)}
          </select>
          <button type="button" className="btn-secondary justify-self-start" disabled={!selected} onClick={() => {
            if (selected) onChange({ intervals: selected.serviceIntervals })
          }}>ใช้ช่วงเวลาจากคลังนี้</button>
        </div>}
        <ServiceIntervalFields intervals={value.intervals ?? []} onChange={(intervals) => onChange({ intervals })} />
      </div>
    </fieldset>
  )
}

export function FoldbackContentFields({ value, disabled, onChange }: {
  value: FoldbackContentSettings; disabled: boolean; onChange: (role: FoldbackContentRole, settings: FoldbackContentStyle) => void
}) {
  const horizontalLabels = { left: 'ซ้าย', center: 'กึ่งกลาง', right: 'ขวา' }
  const verticalLabels = { top: 'บน', center: 'กึ่งกลาง', bottom: 'ล่าง' }
  const sides = { top: 'บน', right: 'ขวา', bottom: 'ล่าง', left: 'ซ้าย' } as const
  return (
    <fieldset id="foldback-content" disabled={disabled} className="grid min-w-0 content-start gap-3 sm:grid-cols-2">
      <legend className="mb-2! text-base font-medium">รูปแบบข้อความหลักบนจอเวที</legend>
      {foldbackContentRoles.map((role) => {
        const style = value[role] ?? {}
        const layout = style.layout ?? {}
        const patch = (change: FoldbackContentStyle) => onChange(role, { ...style, ...change })
        const id = `foldback-${role}`
        return (
          <details key={role} className="min-w-0 rounded-lg border border-[var(--border-subtle)] p-3!">
            <summary className="cursor-pointer font-medium">{foldbackContentLabels[role]}</summary>
            <div className="mt-3 grid gap-3 text-sm">
              <TextAppearanceFields value={style} textColor="#ffffff" backgroundColor="#000000" onChange={patch} />
              <div className="grid grid-cols-2 gap-2">
                <div className="grid min-w-0 gap-1">
                  <label htmlFor={id + '-horizontal'}>จัดแนวนอน</label>
                  <select id={id + '-horizontal'} className="input-field min-w-0" value={style.align ?? 'center'} onChange={(event) => {
                    const align = foldbackHorizontalAlignments.find((item) => item === event.currentTarget.value)
                    if (align) patch({ align })
                  }}>
                    {foldbackHorizontalAlignments.map((item) => <option key={item} value={item}>{horizontalLabels[item]}</option>)}
                  </select>
                </div>
                <div className="grid min-w-0 gap-1">
                  <label htmlFor={id + '-vertical'}>จัดแนวตั้ง</label>
                  <select id={id + '-vertical'} className="input-field min-w-0" value={style.verticalAlign ?? 'center'} onChange={(event) => {
                    const verticalAlign = foldbackVerticalAlignments.find((item) => item === event.currentTarget.value)
                    if (verticalAlign) patch({ verticalAlign })
                  }}>
                    {foldbackVerticalAlignments.map((item) => <option key={item} value={item}>{verticalLabels[item]}</option>)}
                  </select>
                </div>
              </div>
              <fieldset className="grid min-w-0 grid-cols-2 gap-2">
                <legend className="mb-1">ระยะขอบข้อความ (%)</legend>
                {(Object.keys(sides) as (keyof typeof sides)[]).map((side) => (
                  <label key={side} className="grid min-w-0 gap-1">{sides[side]}
                    <input type="number" min={0} max={100} step="any" className="input-field min-w-0"
                      value={layout.insets?.[side] === undefined ? '' : Number((layout.insets[side] * 100).toFixed(5))}
                      onChange={(event) => patch({ layout: { ...layout, insets: { ...layout.insets,
                        [side]: event.currentTarget.value ? event.currentTarget.valueAsNumber / 100 : undefined,
                      } } })} />
                  </label>
                ))}
              </fieldset>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={layout.sizing === 'fit'}
                  onChange={(event) => patch({ layout: { ...layout, sizing: event.currentTarget.checked ? 'fit' : 'fixed' } })} />
                ย่อข้อความให้พอดีกับกรอบ
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={style.normalize ?? false} disabled={layout.sizing !== 'fit'}
                  onChange={(event) => patch({ normalize: event.currentTarget.checked })} />
                ใช้ขนาดอักษรเดียวกันทุกสไลด์ในรายการ
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={style.wrap ?? true} onChange={(event) => patch({ wrap: event.currentTarget.checked })} />
                ตัดบรรทัดอัตโนมัติ
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={style.uppercase ?? false} onChange={(event) => patch({ uppercase: event.currentTarget.checked })} />
                แสดงเป็นตัวพิมพ์ใหญ่ทั้งหมด
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={style.capitalizeFirst ?? false} disabled={style.uppercase}
                  onChange={(event) => patch({ capitalizeFirst: event.currentTarget.checked })} />
                ใช้ตัวพิมพ์ใหญ่ที่ต้นบรรทัด
              </label>
              <label className="grid min-w-0 gap-1">คำที่ขึ้นต้นด้วยตัวพิมพ์ใหญ่ (หนึ่งคำหรือวลีต่อบรรทัด)
                <textarea rows={3} className="input-field min-w-0" disabled={style.uppercase} value={style.properWords?.join('\n') ?? ''}
                  onChange={(event) => patch({ properWords: event.currentTarget.value.split('\n') })}
                  onBlur={(event) => {
                    const text = event.currentTarget.value
                    const words = text.split('\n').map((word) => word.trim()).filter(Boolean)
                    if (words.join('\n') !== text) patch({ properWords: words })
                  }} />
              </label>
              <AlertTextEffectsFields value={style.effects} onChange={(effects) => patch({ effects })} />
              <button type="button" className="btn-ghost justify-self-start" onClick={() => onChange(role, {})}>คืนรูปแบบเริ่มต้น</button>
            </div>
          </details>
        )
      })}
    </fieldset>
  )
}
