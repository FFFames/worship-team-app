/** Formats only the lyric range selected in the active editor. */

import { useId, useState } from 'react'
import type { DesignTextRun, DesignTextStyle } from '../types/slideDesign'
import { LyricEffectFields } from './LyricEffectFields'
import { LyricParagraphControls } from './LyricParagraphControls'
import { sliceTextRuns } from '../utils/slideDesign'
import { alignedLyricRuns, formatLyricRuns, lyricSelection, type LyricSelection } from '../utils/songLyricFormatting'

const characterFormats = [['bold', 'ตัวหนา'], ['italic', 'ตัวเอียง'], ['underline', 'ขีดเส้นใต้']] as const
const effects = [['strike', 'ขีดฆ่า'], ['textShadow', 'เงาข้อความ'], ['outline', 'เส้นขอบข้อความ']] as const
const fonts = ['Kanit', 'Sarabun', 'Tahoma', 'Arial', 'Noto Sans Thai', 'Georgia', 'Courier New']
const sizes = [75, 90, 100, 110, 125, 150, 200]

export function LyricFormatControls({ text, runs, base, selection, onApply }: {
  text: string
  runs?: DesignTextRun[]
  base?: DesignTextStyle
  selection?: LyricSelection
  onApply: (runs: DesignTextRun[]) => void
}) {
  const id = useId()
  const [colorDraft, setColorDraft] = useState<{ selection: LyricSelection; color: string }>()
  const range = selection && lyricSelection(text, selection)
  const selected = range ? sliceTextRuns(alignedLyricRuns(text, runs) ?? [{ text }], range.start, range.end) : []
  const existingColor = selected[0]?.style?.color ?? base?.color
  const shownColor = colorDraft && colorDraft.selection === selection ? colorDraft.color
    : existingColor?.match(/^#[\da-f]{6}$/i)?.[0] ?? '#ffffff'
  const currentEffects = effects.map(([field, label]) => {
    const fallback = field === 'textShadow' ? base?.shadow : field === 'outline' && Boolean(base?.outlineColor)
    const enabled = selected.filter(({ style }) => Boolean(style?.[field] ?? fallback)).length
    return { field, label, enabled, pressed: enabled > 0 && enabled === selected.length }
  })

  function apply(style: Parameters<typeof formatLyricRuns>[3]) {
    if (!range) return
    const next = formatLyricRuns(text, runs, range, style)
    if (next) onApply(next)
  }

  return <div className="grid min-w-0 gap-2">
    <fieldset className="grid min-w-0 gap-2 rounded-md border border-[var(--border-subtle)] p-3" disabled={!range}>
      <legend className="px-1 font-medium">รูปแบบเนื้อร้อง</legend>
      {!range && <p className="text-xs text-[var(--fg-secondary)]">เลือกข้อความในช่องเนื้อร้องเพื่อจัดรูปแบบเฉพาะช่วง</p>}
      <div className="flex flex-wrap gap-1">
        {characterFormats.map(([field, label]) => {
          const enabled = selected.filter(({ style }) => style?.[field] ?? base?.[field]).length
          const pressed = enabled > 0 && enabled === selected.length
          return <button key={field} type="button" className="chip-btn aria-pressed:border-[var(--accent)]"
            aria-pressed={!pressed && enabled > 0 ? 'mixed' : pressed} onClick={() => apply({ [field]: !pressed })}>{label}</button>
        })}
        <button type="button" className="btn-ghost" onClick={() => apply(null)}>คืนรูปแบบพื้นฐาน</button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-0 gap-1">
          <label htmlFor={`${id}-font`}>แบบอักษร</label>
          <select id={`${id}-font`} className="input-field" value="" onChange={(event) => apply({ fontFamily: event.currentTarget.value })}>
            <option value="" disabled>เลือกแบบอักษร</option>
            {fonts.map((font) => <option key={font}>{font}</option>)}
          </select>
        </div>
        <div className="grid min-w-0 gap-1">
          <label htmlFor={`${id}-size`}>ขนาดสัมพัทธ์</label>
          <select id={`${id}-size`} className="input-field" value="" onChange={(event) => apply({ sizeScale: Number(event.currentTarget.value) / 100 })}>
            <option value="" disabled>เลือกขนาด</option>
            {sizes.map((size) => <option key={size} value={size}>{size}%</option>)}
          </select>
        </div>
        <div className="grid min-w-0 gap-1">
          <label htmlFor={`${id}-color`}>สีข้อความ</label>
          <input id={`${id}-color`} type="color" className="h-10 w-14" value={shownColor} onChange={(event) => {
            if (selection) setColorDraft({ selection, color: event.currentTarget.value })
          }} />
        </div>
        <button type="button" className="btn-secondary" onClick={() => apply({ color: shownColor })}>ใช้สีข้อความ</button>
      </div>
      <details>
        <summary className="cursor-pointer text-sm">เอฟเฟ็กต์ข้อความ</summary>
        <div className="mt-2 flex flex-wrap gap-1">
          {currentEffects.map(({ field, label, enabled, pressed }) => (
            <button key={field} type="button" className="chip-btn aria-pressed:border-[var(--accent)]"
              aria-pressed={!pressed && enabled > 0 ? 'mixed' : pressed}
              onClick={() => apply({ [field]: pressed ? false : field === 'strike' ? true : {} })}>{label}</button>
          ))}
        </div>
        <div className="mt-2 grid min-w-0 gap-2">
          {currentEffects.map(({ field, label, enabled }) => enabled > 0 && field !== 'strike' && (
            <LyricEffectFields key={field} effect={field} label={label} selected={selected} base={base} onApply={apply} />
          ))}
        </div>
      </details>
    </fieldset>
    <LyricParagraphControls text={text} runs={runs} selection={selection} onApply={onApply} />
  </div>
}
