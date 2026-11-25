import { useState } from 'react'
import { alertOutputLabels, type AlertOutput, type AlertTemplate } from '../types/alertTemplate'
import { defaultAlertPlayback, templateAlertPlayback } from '../utils/alertPlayback'
import type { AlertQueueAction, OutputAlertQueue } from '../utils/alertQueue'
import { canEndAlertOnToken } from '../utils/alertTokens'
import { liveAlertTextRuns } from '../utils/alertTextEditing'
import { AlertPlaybackFields } from './AlertPlaybackFields'
import { AlertTemplatePicker } from './AlertTemplatePicker'

const labels = {
  live: { draft: 'ข้อความแจ้งเตือนผู้ชม', send: 'แสดง', clear: 'ล้าง' },
  stage: { draft: 'ข้อความถึงทีมบนเวที', send: 'ส่งขึ้นจอเวที', clear: 'ล้างข้อความเวที' },
  alternate: { draft: 'ข้อความแจ้งเตือนจอถ่ายทอดสด', send: 'ส่งขึ้นจอถ่ายทอดสด', clear: 'ล้างข้อความถ่ายทอดสด' },
}

export function AlertControl({ output, templates, queue, paused, enabled = true, dispatch }: {
  output: AlertOutput
  templates: AlertTemplate[]
  queue: OutputAlertQueue
  paused?: boolean
  enabled?: boolean
  dispatch: (action: AlertQueueAction) => void
}) {
  const [draft, setDraft] = useState('')
  const [template, setTemplate] = useState<AlertTemplate>()
  const [playback, setPlayback] = useState(defaultAlertPlayback)
  const label = labels[output]
  const active = queue.active?.alert
  const passes = active?.playback.passes
  const hasWaiting = queue.waiting.length > 0
  return (
    <fieldset className="mb-4! grid min-w-0 gap-2 rounded-lg border border-[var(--border-subtle)] p-3!">
      <legend className="px-1! text-sm font-medium">ข้อความ{alertOutputLabels[output]}</legend>
      {!enabled && <p className="text-xs text-[var(--fg-secondary)]">จอนี้ปิดการแสดงข้อความแจ้งเตือน</p>}
      <AlertTemplatePicker output={output} templates={templates} onPick={(template) => {
        setTemplate(template)
        setDraft(template.text)
        setPlayback(templateAlertPlayback(template))
      }} />
      <div className="grid gap-1 text-xs">
        <label htmlFor={`${output}-alert`}>{label.draft}</label>
        <textarea id={`${output}-alert`} className="input-field min-w-0" rows={2} value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)} />
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer">รูปแบบและจำนวนรอบ</summary>
        <div className="mt-2!"><AlertPlaybackFields prefix={output + '-alert'} value={playback} onChange={setPlayback}
          allowTokenEnd={canEndAlertOnToken(template)} /></div>
      </details>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" disabled={!enabled || !draft.trim()}
          onClick={() => {
            const text = draft.trim()
            dispatch({ type: 'enqueue', item: { id: crypto.randomUUID(), text, runs: liveAlertTextRuns(template, text), playback, template } })
          }}>
          {active ? 'เพิ่มเข้าคิว' : label.send}
        </button>
        <button type="button" className="btn-secondary" disabled={!active} onClick={() => dispatch({ type: 'hide' })}>{label.clear}</button>
        {hasWaiting && <>
          <button type="button" className="btn-secondary" title="เลื่อนข้อความที่กำลังแสดงไปท้ายคิว"
            onClick={() => dispatch({ type: 'next' })}>แสดงข้อความถัดไป</button>
          <button type="button" className="btn-ghost" onClick={() => dispatch({ type: 'clear' })}>ล้างคิวทั้งหมด</button>
        </>}
      </div>
      {active && <p role="status" className="text-xs! wrap-break-word">
        {paused ? 'ข้อความที่พักไว้ขณะจอดำ' : 'ข้อความบนจอ'} · {active.text}{passes != null ? ` · เหลือ ${passes} รอบ` : ''}
      </p>}
      {passes != null && <div role="group" aria-label="จำนวนรอบของข้อความบนจอ" className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="chip-btn" disabled={passes <= 1} onClick={() => dispatch({ type: 'adjust', change: -1 })}>ลดหนึ่งรอบ</button>
        <button type="button" className="chip-btn" disabled={passes >= 9} onClick={() => dispatch({ type: 'adjust', change: 1 })}>เพิ่มหนึ่งรอบ</button>
      </div>}
      {hasWaiting && <div className="grid min-w-0 gap-1 text-xs">
        <p role="status">รอแสดง {queue.waiting.length} ข้อความ</p>
        <ol aria-label="ข้อความที่รอแสดง" className="grid min-w-0 gap-2">
          {queue.waiting.map(({ id, text }) => <li key={id} className="grid min-w-0 gap-1 rounded-md border border-[var(--border-subtle)] p-2!">
            <span id={`waiting-alert-${id}`} className="wrap-anywhere">{text}</span>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="chip-btn" aria-describedby={`waiting-alert-${id}`}
                onClick={() => dispatch({ type: 'prioritize', entryId: id })}>แสดงก่อน</button>
              <button type="button" className="chip-btn" aria-describedby={`waiting-alert-${id}`}
                onClick={() => dispatch({ type: 'remove', entryId: id })}>เอาออกจากคิว</button>
            </div>
          </li>)}
        </ol>
      </div>}
    </fieldset>
  )
}
