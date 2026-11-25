import { useEffect, useId, useRef } from 'react'

export function EasyWorshipExternalMediaFolder({ files, onChange, disabled }: {
  files: readonly File[]
  onChange: (files: File[]) => void
  disabled?: boolean
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!files.length && input.current) input.current.value = ''
  }, [files.length])
  return <div className="flex w-full min-w-0 flex-col gap-2 text-sm">
    <label htmlFor={id}>แนบโฟลเดอร์สื่อต้นฉบับภายนอก</label>
    <input id={id} ref={input} type="file" className="input-field min-w-0" multiple {...{ webkitdirectory: '' }}
      disabled={disabled} aria-describedby={`${id}-help`} onChange={(event) => onChange(Array.from(event.target.files ?? []))} />
    <span id={`${id}-help`} className="text-[var(--fg-secondary)]">เลือกโฟลเดอร์ที่เก็บสื่อและยังมีโฟลเดอร์ย่อยตามเครื่องเดิม เพื่อแยกไฟล์ที่ชื่อซ้ำกัน</span>
    {files.length > 0 && <button type="button" className="btn-ghost self-start" disabled={disabled} onClick={() => {
      if (input.current) { input.current.value = ''; input.current.focus() }
      onChange([])
    }}>นำโฟลเดอร์สื่อที่แนบออก ({files.length} ไฟล์)</button>}
  </div>
}
