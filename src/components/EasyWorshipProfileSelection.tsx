/** Displays a selectable profile catalog with source warnings and bounded previews. */

import { useState } from 'react'

export type ProfileChoice = {
  id: string
  title: string
  detail?: string
  warning?: string
  disabled?: boolean
}

type Props = {
  title: string
  choices: ProfileChoice[]
  selected: ReadonlySet<string>
  disabled: boolean
  onChange: (ids: Set<string>) => void
}

const PAGE_SIZE = 80

export function EasyWorshipProfileSelection({ title, choices, selected, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const available = choices.filter((choice) => !choice.disabled)
  const selectedCount = available.filter((choice) => selected.has(choice.id)).length
  const complete = available.length > 0 && selectedCount === available.length
  const filter = query.trim().toLocaleLowerCase()
  const visible = filter ? choices.filter((choice) => choice.title.toLocaleLowerCase().includes(filter)
    || choice.detail?.toLocaleLowerCase().includes(filter)) : choices

  return (
    <fieldset className="min-w-0 rounded-lg border border-[var(--border-subtle)] p-3! sm:p-4!" disabled={disabled}>
      <legend className="sr-only">{title}</legend>
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1! shrink-0" checked={complete} disabled={!available.length}
          ref={(input) => { if (input) input.indeterminate = selectedCount > 0 && !complete }}
          onChange={(event) => onChange(event.target.checked ? new Set(available.map((choice) => choice.id)) : new Set())} />
        <span className="min-w-0">
          <span className="font-medium">{title}</span>
          <span className="block text-sm text-[var(--fg-secondary)]">{selectedCount} จาก {choices.length} รายการ</span>
        </span>
      </label>
      {choices.length > 0 && (
        <details className="mt-3! text-sm" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
          <summary className="cursor-pointer text-[var(--fg-secondary)]">ตรวจรายการ{title}</summary>
          {open && (
            <div className="mt-3! flex min-w-0 flex-col gap-2">
              {choices.length > 12 && (
                <label className="flex min-w-0 flex-col gap-1">
                  ค้นหา{title}
                  <input type="search" className="input-field min-w-0" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE) }} />
                </label>
              )}
              {visible.length > 0 ? (
                <ul className="max-h-72 divide-y divide-[var(--border-subtle)] overflow-y-auto">
                  {visible.slice(0, limit).map((choice) => (
                    <li key={choice.id}>
                      <label className="flex items-start gap-3 py-2!">
                        <input type="checkbox" className="mt-1! shrink-0" disabled={choice.disabled}
                          checked={selected.has(choice.id)} onChange={(event) => {
                            const next = new Set(selected)
                            if (event.target.checked) next.add(choice.id)
                            else next.delete(choice.id)
                            onChange(next)
                          }} />
                        <span className="min-w-0 wrap-anywhere">
                          <span className="font-medium">{choice.title}</span>
                          {choice.detail && <span className="block text-xs whitespace-pre-line text-[var(--fg-secondary)]">{choice.detail}</span>}
                          {choice.warning && <span className="block text-xs text-[var(--status-error-text)]">{choice.warning}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[var(--fg-secondary)]">ไม่พบรายการที่ตรงกับคำค้น</p>}
              {visible.length > limit && <button type="button" className="btn-ghost self-start" onClick={() => setLimit((value) => value + PAGE_SIZE)}>แสดงรายการเพิ่ม</button>}
            </div>
          )}
        </details>
      )}
    </fieldset>
  )
}
