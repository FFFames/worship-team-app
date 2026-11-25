/** Displays and edits information attached to a catalog record. */

import { useId, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { mediaInfoFields, type MediaInfo, type MediaMetadata } from '../types/media'

const labels: MediaInfo = { author: 'ผู้สร้าง', copyright: 'ลิขสิทธิ์', description: 'คำอธิบาย', tags: 'แท็ก' }

function mediaInfo(metadata: MediaMetadata | undefined): MediaInfo {
  return Object.fromEntries(mediaInfoFields.map((field) => {
    const value = metadata?.[field]
    return [field, typeof value === 'string' ? value : '']
  })) as MediaInfo
}

export function LibraryMediaInfo({ metadata, busy, onSave }: {
  metadata?: MediaMetadata
  busy: boolean
  onSave: (changes: Partial<MediaInfo>) => Promise<void>
}) {
  const id = useId()
  const editButton = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const [draft, setDraft] = useState<{ original: MediaInfo; values: MediaInfo }>()
  const [error, setError] = useState('')
  const info = mediaInfo(metadata)
  const visible = mediaInfoFields.filter((field) => info[field].trim())
  const changed = draft ? mediaInfoFields.filter((field) => draft.values[field].trim() !== draft.original[field].trim()) : []

  useLayoutEffect(() => {
    if (!busy && !draft && restoreFocus.current) {
      restoreFocus.current = false
      editButton.current?.focus()
    }
  }, [busy, draft])

  function closeEditor() {
    restoreFocus.current = true
    setDraft(undefined)
    setError('')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !draft || !changed.length) return
    setError('')
    try {
      await onSave(Object.fromEntries(changed.map((field) => [field, draft.values[field]])))
      closeEditor()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'บันทึกข้อมูลสื่อไม่สำเร็จ')
    }
  }

  return (
    <details className="mt-3! min-w-0 text-sm">
      <summary className="cursor-pointer font-medium">ข้อมูลสื่อ</summary>
      <div className="mt-2! grid min-w-0 gap-3">
        {!draft && visible.length > 0 && (
          <dl className="grid min-w-0 gap-2">
            {visible.map((field) => <div key={field} className="min-w-0">
              <dt className="font-medium">{labels[field]}</dt>
              <dd className="whitespace-pre-wrap wrap-anywhere text-[var(--fg-secondary)]">{info[field]}</dd>
            </div>)}
          </dl>
        )}
        <button type="button" ref={editButton} className="btn-ghost justify-self-start" disabled={busy}
          aria-expanded={Boolean(draft)} aria-controls={draft ? id : undefined}
          onClick={() => draft ? closeEditor() : setDraft({ original: info, values: info })}>
          แก้ข้อมูลสื่อ
        </button>
        {draft && <form id={id} className="min-w-0" onSubmit={(event) => void save(event)}>
          <fieldset className="grid min-w-0 gap-3" disabled={busy} aria-label="แก้ข้อมูลสื่อ">
            {mediaInfoFields.map((field) => {
              const input = {
                id: `${id}-${field}`,
                className: 'input-field min-w-0',
                value: draft.values[field],
                autoComplete: 'off',
                onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                  setDraft({ ...draft, values: { ...draft.values, [field]: event.target.value } }),
              }
              return <div key={field} className="grid min-w-0 gap-1">
                <label htmlFor={input.id}>{labels[field]}</label>
                {field === 'description' || field === 'tags' ? <textarea {...input} rows={field === 'description' ? 3 : 2} />
                  : <input {...input} type="text" autoFocus={field === 'author'} />}
              </div>
            })}
            {error && <p role="alert" className="wrap-anywhere text-[var(--status-error-text)]">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn-secondary" disabled={!changed.length}>บันทึกข้อมูลสื่อ</button>
              <button type="button" className="btn-ghost" onClick={closeEditor}>ยกเลิกแก้ข้อมูลสื่อ</button>
            </div>
          </fieldset>
        </form>}
      </div>
    </details>
  )
}
