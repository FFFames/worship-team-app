import { useState } from 'react'
import { Link } from 'react-router-dom'

export function NurseryAlertControl({ codes, enabled, add, remove, clear }: {
  codes: string[]
  enabled: boolean
  add: (code: string) => void
  remove: (code: string) => void
  clear: () => void
}) {
  const [draft, setDraft] = useState('')
  return (
    <details className="mb-4! min-w-0 rounded-lg border border-[var(--border-subtle)] p-3!">
      <summary className="cursor-pointer text-sm font-medium">เรียกผู้ปกครอง{codes.length > 0 && ` · ${codes.length} หมายเลขบนจอ`}</summary>
      <form className="mt-3! grid min-w-0 gap-2" onSubmit={(event) => {
        event.preventDefault()
        const code = draft.trim()
        if (!code || !enabled) return
        add(code)
        setDraft('')
      }}>
        <label className="grid min-w-0 gap-1 text-xs">หมายเลขรับเด็ก
          <input type="text" className="input-field min-w-0" maxLength={128} autoComplete="off" value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn-secondary" disabled={!enabled || !draft.trim()}>แสดงหมายเลข</button>
          {codes.length > 0 && <button type="button" className="btn-ghost" onClick={clear}>ล้างหมายเลขทั้งหมด</button>}
        </div>
      </form>
      {!enabled && <p role="status" className="mt-2! text-xs">เปิดการเรียกผู้ปกครองบนจออย่างน้อยหนึ่งจอ</p>}
      {codes.length > 0 && <ul aria-label="หมายเลขรับเด็กบนจอ" className="mt-2! flex min-w-0 flex-wrap gap-2">
        {codes.map((code) => <li key={code} className="flex min-w-0 items-center gap-1 rounded-md border border-[var(--border-subtle)] px-2! text-sm">
          <span className="wrap-anywhere">{code}</span>
          <button type="button" className="chip-btn" aria-label={`เอาหมายเลข ${code} ออก`} onClick={() => remove(code)}>เอาออก</button>
        </li>)}
      </ul>}
      <Link to="/alerts#nursery-settings" target="_blank" rel="noopener" className="mt-2! inline-block text-xs underline">ตั้งค่าการเรียกผู้ปกครอง</Link>
    </details>
  )
}
