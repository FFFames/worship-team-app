import { useId } from 'react'
import type { SlideTransition } from '../types/slideDesign'
import { cutSlideTransition, slideTransitionEffects, transitionFlag } from '../utils/slideTransitions'
import { slideTransitionEasing, slideTransitionRamps } from '../utils/slideTransitionEasing'
import { transitionPercent } from '../utils/slideTransitionGeometry'

type Props = { value?: SlideTransition; onChange: (transition?: SlideTransition) => void; inheritLabel?: string }
const field = 'flex min-w-0 flex-col gap-1 text-sm'
const original = 'original'
const cut = 'cut'

export function SlideTransitionFields({ value, onChange, inheritLabel = 'ตามธีมที่ใช้' }: Props) {
  const id = useId()
  const option = slideTransitionEffects.find(({ uid }) => uid === value?.uid)
  const values = value?.values
  const duration = Number(values?.Duration ?? 500)
  const direction = Number(values?.['Value-Direction'])
  const selectedDirection = direction >= 0 && direction < (option?.directions?.length ?? 0) && Number.isInteger(direction) ? direction : 0
  const ramp = values?.Ramp?.trim() || ''

  function changeValue(key: string, setting?: string) {
    if (!value) return
    const nextValues = { ...value.values }
    if (setting === undefined) delete nextValues[key]
    else nextValues[key] = setting
    onChange({ ...value, values: nextValues })
  }

  return (
    <fieldset className="grid min-w-0 gap-2 sm:grid-cols-2">
      <legend className="sr-only">ตัวเลือกเอฟเฟ็กต์เปลี่ยนสไลด์</legend>
      <div className={field}>
        <label htmlFor={`${id}-effect`}>เอฟเฟ็กต์เปลี่ยนสไลด์</label>
        <select id={`${id}-effect`} className="input-field min-w-0" value={option?.uid ?? (value?.uid === '' ? cut : value ? original : '')}
          onChange={(event) => {
            const uid = event.target.value
            if (uid === original) return
            onChange(uid === cut ? cutSlideTransition
              : uid ? { uid, values: { Duration: String(duration > 0 && Number.isFinite(duration) ? duration : 500) } } : undefined)
          }}>
          <option value="">{inheritLabel}</option>
          <option value={cut}>ตัดทันที</option>
          {value && value.uid !== '' && !option && <option value={original}>ค่าที่นำเข้าจาก EasyWorship</option>}
          {slideTransitionEffects.map(({ uid, label }) => <option key={uid} value={uid}>{label}</option>)}
        </select>
      </div>
      {option && (
        <div className={field}>
          <label htmlFor={`${id}-duration`}>ระยะเวลาเอฟเฟ็กต์ (มิลลิวินาที)</label>
          <input id={`${id}-duration`} type="number" min="0" step="1" className="input-field min-w-0"
            value={values?.Duration === '' || !Number.isFinite(duration) ? '' : duration}
            onChange={(event) => {
              const ms = event.target.valueAsNumber
              changeValue('Duration', Number.isFinite(ms) ? String(Math.min(60_000, Math.max(0, Math.round(ms)))) : '')
            }}
            onBlur={() => { if (values?.Duration === '') changeValue('Duration', '500') }} />
        </div>
      )}
      {option && !option.fixedRamp && (
        <div className={field}>
          <label htmlFor={`${id}-ramp`}>จังหวะเอฟเฟ็กต์</label>
          <select id={`${id}-ramp`} className="input-field min-w-0" value={ramp}
            onChange={(event) => changeValue('Ramp', event.target.value || undefined)}>
            <option value="">ค่าปกติของเอฟเฟ็กต์</option>
            {ramp && !slideTransitionEasing(ramp) && <option value={ramp}>ค่าที่นำเข้าจาก EasyWorship ({ramp})</option>}
            {slideTransitionRamps.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      )}
      {option?.directions && (
        <div className={field}>
          <label htmlFor={`${id}-direction`}>ทิศทางเอฟเฟ็กต์</label>
          <select id={`${id}-direction`} className="input-field min-w-0" value={selectedDirection} onChange={(event) => changeValue('Value-Direction', event.target.value)}>
            {option.directions.map((label, index) => <option key={label} value={index}>{label}</option>)}
          </select>
        </div>
      )}
      {option?.fades && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:col-span-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={transitionFlag(values?.['Value-FadeIn'])}
              onChange={(event) => changeValue('Value-FadeIn', event.target.checked ? '1' : '0')} /> เฟดภาพเข้า
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={transitionFlag(values?.['Value-FadeOut'])}
              onChange={(event) => changeValue('Value-FadeOut', event.target.checked ? '1' : '0')} /> เฟดภาพออก
          </label>
        </div>
      )}
      {option?.percentages?.map(({ key, label, fallback }) => {
        const percent = Math.round(transitionPercent(values?.[key], fallback) * 100)
        return <div className={field} key={key}>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={`${id}-${key}`}>{label}</label>
            <span aria-hidden="true" className="tabular-nums">{percent}%</span>
          </div>
          <input id={`${id}-${key}`} type="range" min="0" max="100" step="1" value={percent} aria-valuetext={`${percent}%`}
            className="w-full min-w-0" onChange={(event) => changeValue(key, event.target.value)} />
        </div>
      })}
    </fieldset>
  )
}
