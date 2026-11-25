/** Edits local weekly service times used in messages and stage countdowns. */

import { useState } from 'react'
import type { AlertServiceInterval } from '../types/alertTemplate'
import { alertTimeField } from '../utils/alertTokenEditing'
import { fixedTokenSeconds } from '../utils/alertTokens'

const weekdays = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const newInterval = { startDay: 0, start: '09:00:00', endDay: 0, end: '10:00:00' }

export function ServiceIntervalFields({ intervals, onChange }: {
  intervals: AlertServiceInterval[]
  onChange: (intervals: AlertServiceInterval[]) => void
}) {
  const [draft, setDraft] = useState<typeof newInterval>()
  const [editing, setEditing] = useState<number>()
  const [error, setError] = useState(false)
  function edit(index?: number) {
    setError(false)
    setEditing(index)
    const interval = index === undefined ? undefined : intervals[index]
    setDraft(interval ? { ...interval, start: alertTimeField(interval.startSeconds), end: alertTimeField(interval.endSeconds) } : newInterval)
  }
  function change(patch: Partial<typeof newInterval>) {
    setDraft((current) => current ? { ...current, ...patch } : current)
    setError(false)
  }
  function save() {
    if (!draft) return
    const startSeconds = fixedTokenSeconds(draft.start)
    const endSeconds = fixedTokenSeconds(draft.end)
    if (startSeconds === undefined || endSeconds === undefined
      || (draft.startDay === draft.endDay && endSeconds === startSeconds)) {
      setError(true)
      return
    }
    const interval = { startDay: draft.startDay, endDay: draft.endDay, startSeconds, endSeconds }
    onChange(editing === undefined ? [...intervals, interval] : intervals.map((item, index) => index === editing ? interval : item))
    setDraft(undefined)
  }
  return (
    <fieldset className="grid min-w-0 gap-2 border-t border-[var(--border-subtle)] pt-2!">
      <legend className="font-medium">ช่วงเวลานมัสการรายสัปดาห์</legend>
      {intervals.length > 0 && <ul className="grid min-w-0 gap-2">
        {intervals.map(({ startDay, startSeconds, endDay, endSeconds }, index) => (
          <li className="grid min-w-0 gap-1" key={index}>
            <span>วัน{weekdays[startDay]} {alertTimeField(startSeconds)} – วัน{weekdays[endDay]} {alertTimeField(endSeconds)}</span>
            <div className="flex flex-wrap gap-1">
              <button type="button" className="btn-ghost" onClick={() => edit(index)}>แก้ช่วงเวลา</button>
              <button type="button" className="btn-ghost" onClick={() => {
                setDraft(undefined)
                onChange(intervals.filter((_, item) => item !== index))
              }}>เอาช่วงเวลาออก</button>
            </div>
          </li>
        ))}
      </ul>}
      <button type="button" className="btn-secondary justify-self-start" onClick={() => edit()}>เพิ่มช่วงเวลานมัสการ</button>
      {draft && <>
        <label className="grid gap-1">วันเริ่มนมัสการ
          <select aria-label="วันเริ่มนมัสการ" className="input-field" value={draft.startDay}
            onChange={(event) => change({ startDay: Number(event.currentTarget.value) })}>
            {weekdays.map((day, i) => <option key={day} value={i}>วัน{day}</option>)}
          </select>
        </label>
        <label className="grid gap-1">เวลาเริ่มนมัสการ
          <input type="time" step={1} className="input-field" value={draft.start}
            onChange={(event) => change({ start: event.currentTarget.value })} />
        </label>
        <label className="grid gap-1">วันจบนมัสการ
          <select aria-label="วันจบนมัสการ" className="input-field" value={draft.endDay}
            onChange={(event) => change({ endDay: Number(event.currentTarget.value) })}>
            {weekdays.map((day, i) => <option key={day} value={i}>วัน{day}</option>)}
          </select>
        </label>
        <label className="grid gap-1">เวลาจบนมัสการ
          <input type="time" step={1} className="input-field" value={draft.end}
            onChange={(event) => change({ end: event.currentTarget.value })} />
        </label>
        {error && <p role="alert" className="text-xs text-[var(--status-error-text)]">เลือกเวลาเริ่มและเวลาจบที่ต่างกัน</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={save}>ใช้ช่วงเวลานี้</button>
          <button type="button" className="btn-ghost" onClick={() => setDraft(undefined)}>ยกเลิกแก้ช่วงเวลา</button>
        </div>
      </>}
    </fieldset>
  )
}
