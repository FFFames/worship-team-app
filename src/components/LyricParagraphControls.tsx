/** Edits paragraphs under the caret or inside the lyric selection. */

import { useId, useState } from 'react'
import type { DesignParagraphList, DesignTextRun } from '../types/slideDesign'
import type { LyricSelection } from '../utils/songLyricFormatting'
import { formatLyricParagraphs, lyricParagraphs, selectedLyricParagraphs, type LyricParagraphChange } from '../utils/songParagraphFormatting'
import { defaultListBullet, isListPunctuation, isNumberedListStyle, maxListLevel, maxListMarkerLength,
  maxListStart, normalizeListMarker } from '../utils/slideParagraphLists'

const distances = [
  ['leftIndent', 'เยื้องซ้าย (%)', -100],
  ['rightIndent', 'เยื้องขวา (%)', -100],
  ['firstLineIndent', 'เยื้องบรรทัดแรก (%)', -100],
  ['spaceBefore', 'ช่องไฟก่อนย่อหน้า (%)', 0],
  ['spaceAfter', 'ช่องไฟหลังย่อหน้า (%)', 0],
] as const

function common<T>(values: T[]) {
  const mixed = values.some((value) => value !== values[0])
  return { value: mixed ? undefined : values[0], mixed }
}

function ParagraphPercent({ label, value, mixed, minimum = 0, placeholder, onApply }: {
  label: string
  value?: number
  mixed?: boolean
  minimum?: number
  placeholder?: string
  onApply: (value: number | undefined) => void
}) {
  const initial = value === undefined ? '' : String(Math.round(value * 1000) / 10)
  const [draft, setDraft] = useState<string>()
  return <label className="grid min-w-0 gap-1 text-sm">
    {label}
    <input className="input-field min-w-0 tabular-nums" type="text" inputMode="decimal"
      placeholder={mixed ? 'หลายค่า' : placeholder}
      value={draft ?? initial}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      onBlur={() => {
        if (draft === undefined) return
        setDraft(undefined)
        const value = draft.trim()
        if (value === initial) return
        if (!value) { onApply(undefined); return }
        const number = Number(value)
        if (Number.isFinite(number)) onApply(Math.max(minimum, Math.min(1000, number)) / 100)
      }} />
  </label>
}

export function LyricParagraphControls({ text, runs, selection, onApply, selectionLabel = 'เนื้อร้อง' }: {
  text: string; runs?: DesignTextRun[]; selection?: LyricSelection; onApply: (runs: DesignTextRun[]) => void; selectionLabel?: string
}) {
  const id = useId()
  const paragraphs = lyricParagraphs(text, runs)
  const selected = selectedLyricParagraphs(paragraphs, selection)
  const alignment = common(selected.map(({ format }) => format.align))
  const spacingMode = common(selected.map(({ format }) => format.lineSpacing?.mode))
  const spacingValue = common(selected.map(({ format }) => format.lineSpacing?.value))
  const lists = selected.map(({ format }) => format.list || undefined)
  const targetKey = `${selection?.start}-${selection?.end}`
  const apply = (change: LyricParagraphChange) => {
    if (selected.length) onApply(formatLyricParagraphs(paragraphs, selected, change))
  }
  const indent = (step: number) => apply((format) => ({
    leftIndent: Math.max(0, Math.min(10, Math.round(((format.leftIndent ?? 0) + step) * 100) / 100)) || undefined,
  }))

  return <details className="min-w-0 rounded-md border border-[var(--border-subtle)] p-3">
    <summary className="cursor-pointer font-medium">รูปแบบย่อหน้า</summary>
    {selected.length === 0 && <p className="mt-2 text-sm text-[var(--fg-secondary)]">วางเคอร์เซอร์หรือเลือก{selectionLabel}ในย่อหน้าที่จะแก้ไข</p>}
    <fieldset aria-label="รูปแบบย่อหน้าที่เลือก" disabled={!selected.length} className="mt-3 grid min-w-0 gap-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="chip-btn" onClick={() => indent(.5)}>เพิ่มระยะเยื้อง</button>
        <button type="button" className="chip-btn" onClick={() => indent(-.5)}
          disabled={!selected.some(({ format }) => (format.leftIndent ?? 0) > 0)}>ลดระยะเยื้อง</button>
        <button type="button" className="btn-ghost" onClick={() => apply(() => null)}>คืนค่าย่อหน้า</button>
      </div>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <div className="grid min-w-0 gap-1 text-sm">
          <label htmlFor={`${id}-alignment`}>การจัดแนวย่อหน้า</label>
          <select id={`${id}-alignment`} className="input-field min-w-0" value={alignment.mixed ? 'mixed' : alignment.value ?? ''}
            onChange={(event) => {
              const value = event.currentTarget.value
              apply(() => ({ align: value === 'left' || value === 'right' || value === 'center' ? value : undefined }))
            }}>
            {alignment.mixed && <option value="mixed" disabled>หลายค่า</option>}
            <option value="">ใช้ค่ากล่องข้อความ</option>
            <option value="left">ชิดซ้าย</option>
            <option value="center">กึ่งกลาง</option>
            <option value="right">ชิดขวา</option>
          </select>
        </div>
        {distances.map(([field, label, minimum]) => {
          const current = common(selected.map(({ format }) => format[field]))
          return <ParagraphPercent key={`${targetKey}-${field}`} label={label} minimum={minimum}
            value={current.value} mixed={current.mixed} placeholder="0"
            onApply={(value) => apply(() => ({ [field]: value }))} />
        })}
        <div className="grid min-w-0 gap-1 text-sm">
          <label htmlFor={`${id}-spacing`}>วิธีกำหนดช่องไฟบรรทัด</label>
          <select id={`${id}-spacing`} className="input-field min-w-0" value={spacingMode.mixed ? 'mixed' : spacingMode.value ?? ''}
            onChange={(event) => {
              const mode = event.currentTarget.value
              apply(() => ({ lineSpacing: mode === 'multiple' || mode === 'minimum' || mode === 'exact'
                ? { mode, value: mode === 'multiple' ? 1 : 1.25 } : undefined }))
            }}>
            {spacingMode.mixed && <option value="mixed" disabled>หลายค่า</option>}
            <option value="">อัตโนมัติ</option>
            <option value="multiple">เทียบกับบรรทัดปกติ</option>
            <option value="minimum">อย่างน้อย</option>
            <option value="exact">ค่าคงที่</option>
          </select>
        </div>
        {spacingMode.value && <ParagraphPercent key={`${targetKey}-${spacingMode.value}`} label="ช่องไฟบรรทัด (%)"
          minimum={10} value={spacingValue.value} mixed={spacingValue.mixed}
          onApply={(value) => apply(({ lineSpacing }) => ({ lineSpacing: value && lineSpacing ? { ...lineSpacing, value } : undefined }))} />}
      </div>
      <ParagraphListControls key={targetKey} lists={lists} firstParagraphStart={selected[0]?.start} onApply={apply} />
      <p className="text-xs text-[var(--fg-secondary)]">ระยะใช้เปอร์เซ็นต์ของขนาดตัวอักษร ช่องไฟแบบเทียบใช้เปอร์เซ็นต์ของบรรทัดปกติ</p>
    </fieldset>
  </details>
}

function ParagraphListControls({ lists, firstParagraphStart, onApply }: {
  lists: (DesignParagraphList | undefined)[]
  firstParagraphStart?: number
  onApply: (change: LyricParagraphChange) => void
}) {
  const id = useId()
  const style = common(lists.map((list) => list?.style))
  const marker = common(lists.map((list) => list?.text))
  const level = common(lists.map((list) => list?.level ?? 0))
  const punctuation = common(lists.map((list) => list?.punctuation ?? 'period'))
  const start = lists[0]?.start
  const changeList = (patch: Partial<DesignParagraphList>) =>
    onApply(({ list }) => list ? { list: { ...list, ...patch } } : {})

  return <div className="grid min-w-0 gap-2 sm:grid-cols-2">
    <div className="grid min-w-0 gap-1 text-sm">
      <label htmlFor={`${id}-list`}>รูปแบบรายการ</label>
      <select id={`${id}-list`} className="input-field min-w-0" value={style.mixed ? 'mixed' : style.value ?? ''}
        onChange={(event) => {
          const style = event.currentTarget.value
          onApply(({ list }) => ({
            list: style === 'bullet' || isNumberedListStyle(style)
              ? { style, ...(list && list.level ? { level: list.level } : {}) } : false,
          }))
        }}>
        {style.mixed && <option value="mixed" disabled>หลายค่า</option>}
        {style.value === 'literal' && <option value="literal" disabled>สัญลักษณ์จากไฟล์</option>}
        <option value="">ไม่มีสัญลักษณ์</option>
        <option value="bullet">หัวข้อย่อย</option>
        <option value="decimal">ตัวเลข 1, 2, 3</option>
        <option value="upper-roman">เลขโรมัน I, II, III</option>
        <option value="lower-roman">เลขโรมัน i, ii, iii</option>
        <option value="upper-alpha">ตัวอักษร A, B, C</option>
        <option value="lower-alpha">ตัวอักษร a, b, c</option>
      </select>
    </div>
    {(style.value === 'bullet' || style.value === 'literal') && <label className="grid min-w-0 gap-1 text-sm">สัญลักษณ์หัวข้อ
      <input key={marker.value} className="input-field min-w-0" maxLength={maxListMarkerLength} defaultValue={marker.value ?? ''}
        placeholder={marker.mixed ? 'หลายค่า' : defaultListBullet}
        onBlur={(event) => {
          if (event.currentTarget.value !== (marker.value ?? '')) {
            changeList({ text: normalizeListMarker(event.currentTarget.value) ?? defaultListBullet })
          }
        }} />
    </label>}
    {style.value && <label className="grid min-w-0 gap-1 text-sm">ระดับรายการ
      <input key={level.value} className="input-field min-w-0" type="number" min={1} max={maxListLevel + 1}
        defaultValue={level.value === undefined ? '' : level.value + 1} placeholder={level.mixed ? 'หลายค่า' : undefined}
        onBlur={(event) => {
          const value = event.currentTarget.valueAsNumber
          if (Number.isInteger(value) && value >= 1 && value <= maxListLevel + 1 && value !== (level.value ?? -1) + 1) {
            changeList({ level: value - 1 })
          }
        }} />
    </label>}
    {isNumberedListStyle(style.value) && <>
      <div className="grid min-w-0 gap-1 text-sm">
        <label htmlFor={`${id}-punctuation`}>เครื่องหมายหลังเลขหรืออักษร</label>
        <select id={`${id}-punctuation`} className="input-field min-w-0" value={punctuation.mixed ? 'mixed' : punctuation.value}
          onChange={(event) => {
            const value = event.currentTarget.value
            if (isListPunctuation(value)) changeList({ punctuation: value })
          }}>
          {punctuation.mixed && <option value="mixed" disabled>หลายค่า</option>}
          <option value="period">1.</option>
          <option value="parenthesis">1)</option>
          <option value="parentheses">(1)</option>
        </select>
      </div>
      <label className="grid min-w-0 gap-1 text-sm">เริ่มลำดับที่
        <input key={start} className="input-field min-w-0" type="number" min={1} max={maxListStart} defaultValue={start ?? ''}
          placeholder="ต่อจากข้อก่อนหน้า"
          onBlur={(event) => {
            if (event.currentTarget.value === String(start ?? '')) return
            const value = event.currentTarget.valueAsNumber
            if (event.currentTarget.value === '') changeList({ start: undefined })
            else if (Number.isInteger(value) && value >= 1 && value <= maxListStart) onApply(({ list }, paragraph) =>
              list ? { list: { ...list, start: paragraph.start === firstParagraphStart ? value : undefined } } : {})
          }} />
      </label>
    </>}
  </div>
}

export function SlideParagraphTextField({ label, text, runs, onChange, onApply }: {
  label: string; text: string; runs?: DesignTextRun[]; onChange: (text: string) => void; onApply: (runs: DesignTextRun[]) => void
}) {
  const [selection, setSelection] = useState<{ text: string; range: LyricSelection }>()
  const select = (input: HTMLTextAreaElement) => setSelection({
    text: input.value,
    range: { start: input.selectionStart, end: input.selectionEnd },
  })
  return <div className="grid min-w-0 gap-2">
    <label className="grid min-w-0 gap-1 text-sm">{label}
      <textarea className="input-field min-h-20" value={text}
        onFocus={(event) => select(event.currentTarget)}
        onSelect={(event) => select(event.currentTarget)}
        onChange={(event) => {
          select(event.currentTarget)
          onChange(event.currentTarget.value)
        }} />
    </label>
    {text.trim() && <LyricParagraphControls text={text} runs={runs} selection={selection?.text === text ? selection.range : undefined}
      onApply={onApply} selectionLabel="ข้อความ" />}
  </div>
}
