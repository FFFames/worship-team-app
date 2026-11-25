/** Edits selected alert text with a preview rendered using the live output's text styles. */

import { useMemo, useState, type RefObject } from 'react'
import { useMessageAlertSettings } from '../hooks/useMessageAlertSettings'
import type { AlertTemplate } from '../types/alertTemplate'
import { alertFormatRange, alertTemplateTextRuns, type AlertRunStyle, type AlertTextSelection } from '../utils/alertTextEditing'
import { defaultMessageAlertStyle } from '../utils/messageAlertSettings'
import { validNurseryFont } from '../utils/nurseryAlerts'
import { sliceTextRuns } from '../utils/slideDesign'
import { safeFont, StyledTextRuns } from './StyledTextRuns'

const toggleFields = [
  ['bold', 'ตัวหนา'], ['italic', 'ตัวเอียง'], ['underline', 'ขีดเส้นใต้'],
  ['textShadow', 'เงา'], ['outline', 'เส้นขอบ'],
] as const
const defaultSelection = { start: 0, end: 0 }
const fontSuggestions = ['Arial', 'Tahoma', 'Sarabun', 'Noto Sans Thai', 'Georgia', 'Courier New']

export function AlertRichTextEditor({ draft, input, disabled, onTextChange, onFormat }: {
  draft: Omit<AlertTemplate, 'id'>
  input: RefObject<HTMLTextAreaElement | null>
  disabled?: boolean
  onTextChange: (text: string) => void
  onFormat: (selection: AlertTextSelection, style: AlertRunStyle | null) => void
}) {
  const settings = useMessageAlertSettings()
  const [selection, setSelection] = useState(defaultSelection)
  const [color, setColor] = useState('')
  const [font, setFont] = useState('')
  const [size, setSize] = useState('')
  const appearance = settings[draft.output] ?? defaultMessageAlertStyle[draft.output]
  const formattedRuns = useMemo(() => alertTemplateTextRuns(draft), [draft])
  const runs = formattedRuns ?? [{ text: draft.text }]
  const range = alertFormatRange(draft.text, selection)
  const selected = sliceTextRuns(runs, range.start, range.end)
  const firstStyle = selected[0]?.style
  const shownColor = color || (firstStyle?.color?.match(/^#[\da-f]{6}/i)?.[0] ?? appearance.textColor)
  const validSize = /^\d{2,3}$/.test(size) && Number(size) >= 10 && Number(size) <= 800
  const alignment = draft.playback?.alignment ?? 'left'
  const previewBackground = appearance.backgroundColor + Math.round(appearance.opacity * 255 / 100).toString(16).padStart(2, '0')
  const defaults = { bold: appearance.bold, italic: appearance.italic, underline: appearance.effects?.underline,
    textShadow: appearance.effects?.shadow?.enabled, outline: appearance.effects?.outline?.enabled }

  function apply(style: AlertRunStyle | null) {
    const element = input.current
    if (!element) return
    const actual = { start: element.selectionStart, end: element.selectionEnd }
    setSelection(actual)
    onFormat(actual, style)
  }

  return <div className="grid min-w-0 gap-2 text-sm">
    <label htmlFor="alert-template-text">ข้อความบนจอ</label>
    <textarea ref={input} id="alert-template-text" className="input-field min-w-0" required rows={4} value={draft.text} disabled={disabled}
      onChange={(event) => {
        const element = event.currentTarget
        setSelection({ start: element.selectionStart, end: element.selectionEnd })
        onTextChange(element.value)
      }}
      onSelect={(event) => setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })} />
    <details className="min-w-0 rounded-lg border border-[var(--border-subtle)] p-3!">
      <summary className="cursor-pointer">จัดรูปแบบข้อความ</summary>
      <fieldset disabled={disabled || !draft.text} className="mt-2! grid min-w-0 gap-3">
        <legend className="sr-only">รูปแบบข้อความที่เลือก</legend>
        <p className="text-xs! text-[var(--fg-secondary)]">ลากเลือกข้อความเพื่อจัดรูปแบบเฉพาะช่วง ถ้าไม่ได้เลือกจะใช้กับข้อความทั้งหมด</p>
        <div className="flex flex-wrap gap-1">
          {toggleFields.map(([field, label]) => {
            const isOn = ({ style }: (typeof selected)[number]) => Boolean(style?.[field] ?? defaults[field])
            const pressed = selected.length > 0 && selected.every(isOn)
            const mixed = !pressed && selected.some(isOn)
            return <button key={field} type="button" className="chip-btn aria-pressed:border-[var(--accent)]"
              aria-pressed={mixed ? 'mixed' : pressed} onClick={() => apply({
                [field]: field === 'outline' || field === 'textShadow' ? pressed ? false : {} : !pressed,
              })}>{label}</button>
          })}
          <button type="button" className="btn-ghost" onClick={() => apply(null)}>ล้างรูปแบบ</button>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1">แบบอักษร
            <input className="input-field min-w-0" value={font} maxLength={80} list="alert-template-fonts"
              placeholder={firstStyle?.fontFamily ?? appearance.fontFamily ?? 'Arial'}
              onChange={(event) => setFont(event.currentTarget.value)} />
          </label>
          <datalist id="alert-template-fonts">{fontSuggestions.map((name) => <option key={name} value={name} />)}</datalist>
          <button type="button" className="btn-secondary self-end justify-self-start" disabled={!validNurseryFont(font.trim())}
            onClick={() => apply({ fontFamily: font.trim() })}>ใช้แบบอักษร</button>
          <label className="grid min-w-0 gap-1">ขนาดสัมพัทธ์ (10–800%)
            <input inputMode="numeric" maxLength={3} className="input-field min-w-0" value={size}
              placeholder={String(Math.round((firstStyle?.sizeScale ?? 1) * 100))} onChange={(event) => setSize(event.currentTarget.value)} />
          </label>
          <button type="button" className="btn-secondary self-end justify-self-start" disabled={!validSize}
            onClick={() => apply({ sizeScale: Number(size) / 100 })}>ใช้ขนาด</button>
          <label className="grid min-w-0 gap-1">สีข้อความที่เลือก
            <input type="color" value={shownColor} onChange={(event) => setColor(event.currentTarget.value)} />
          </label>
          <button type="button" className="btn-secondary self-end justify-self-start" onClick={() => apply({ color: shownColor })}>ใช้สีข้อความ</button>
        </div>
      </fieldset>
      {draft.text && <figure className="mt-3! grid min-w-0 gap-1">
        <figcaption className="text-xs text-[var(--fg-secondary)]">ตัวอย่างข้อความ</figcaption>
        <div className="min-w-0 whitespace-pre-wrap wrap-anywhere rounded-md bg-black p-1!">
          <div className="px-2! py-1!" style={{ background: previewBackground, color: appearance.textColor,
            fontFamily: appearance.fontFamily ? `${safeFont(appearance.fontFamily)}, sans-serif` : undefined,
            fontWeight: appearance.bold ? 700 : 400, fontStyle: appearance.italic ? 'italic' : undefined, textAlign: alignment }}>
            <StyledTextRuns runs={runs} base={{ color: appearance.textColor }} effects={appearance.effects} />
          </div>
        </div>
      </figure>}
    </details>
  </div>
}
