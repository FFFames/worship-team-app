import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { LEGACY_ENCODING_OPTIONS, type LegacySongEncoding } from '../utils/easyWorshipEncoding'
import { readTextDocument, textDocumentSlides, type TextDocumentSlide } from '../utils/textDocument'
import { StyledTextRuns } from './StyledTextRuns'

type ReadResult = { file: File; encoding: LegacySongEncoding; document?: TextDocumentSlide; error?: string }

export function TextDocumentImport({ onImport, singleBlock = false, groupLabel = singleBlock ? 'กล่องข้อความ' : 'สไลด์' }: {
  onImport: (slides: TextDocumentSlide[]) => void; groupLabel?: string; singleBlock?: boolean
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [encoding, setEncoding] = useState<LegacySongEncoding>('auto')
  const [split, setSplit] = useState(true)
  const [read, setRead] = useState<ReadResult>()
  const [added, setAdded] = useState(0)
  const current = file && read?.file === file && read.encoding === encoding ? read : undefined
  const document = current?.document
  const slides = useMemo(() => document ? textDocumentSlides(document, !singleBlock && split) : [], [document, singleBlock, split])

  useEffect(() => {
    if (!file) return
    let active = true
    void readTextDocument(file, encoding).then((document) => { if (active) setRead({ file, encoding, document }) }).catch((cause) => {
      if (active) setRead({ file, encoding, error: cause instanceof Error ? cause.message : 'อ่านไฟล์ข้อความไม่สำเร็จ' })
    })
    return () => { active = false }
  }, [file, encoding])

  function apply() {
    onImport(slides)
    setAdded(slides.length)
    setFile(null)
    setRead(undefined)
    if (input.current) input.current.value = ''
  }

  return <details className="min-w-0 rounded-md border border-[var(--border-subtle)] p-3 text-sm">
    <summary className="cursor-pointer font-medium">นำเข้าข้อความจากไฟล์</summary>
    <div className="mt-3! grid min-w-0 gap-3">
      {singleBlock && <p>เพิ่มเป็นกล่องข้อความคงที่ในสไลด์ที่กำลังแก้ไข</p>}
      <label className="grid min-w-0 gap-1">ไฟล์ข้อความ .txt หรือ .rtf
        <input ref={input} type="file" accept=".txt,.rtf" className="input-field min-w-0" aria-invalid={current?.error ? true : undefined}
          aria-describedby={current?.error ? `${id}-error` : undefined}
          onChange={(event) => { setFile(event.target.files?.[0] ?? null); setAdded(0) }} />
      </label>
      {file && <>
        <div className="grid min-w-0 gap-1">
          <label htmlFor={`${id}-encoding`}>รหัสอักษรของไฟล์ข้อความ</label>
          <select id={`${id}-encoding`} className="input-field min-w-0" value={encoding} onChange={(event) => setEncoding(event.target.value as LegacySongEncoding)}>
            {LEGACY_ENCODING_OPTIONS.map(([value, label]) => <option key={value} value={value}>{value === 'auto' ? 'อัตโนมัติ' : label}</option>)}
          </select>
        </div>
        {!singleBlock && <label className="flex items-center gap-2">
          <input type="checkbox" checked={split} onChange={(event) => setSplit(event.target.checked)} />
          แบ่งตามบรรทัดว่างหรือตัวแบ่งหน้า
        </label>}
      </>}
      {file && !current && <p role="status">กำลังอ่านไฟล์ข้อความ…</p>}
      {current?.error && <p role="alert" id={`${id}-error`} className="text-[var(--status-error-text)]">{current.error}</p>}
      {slides.length > 0 && <>
        <p role="status">อ่านได้ {slides.length} {groupLabel}</p>
        <ol aria-label="ตัวอย่างข้อความจากไฟล์" className="grid max-h-56 gap-2 overflow-y-auto">
          {slides.map(({ text, runs }, index) => <li key={index} className="min-w-0 rounded-md bg-[var(--bg-tertiary)] p-2 wrap-anywhere">
            <span className="mr-2 text-[var(--fg-secondary)]">{index + 1}.</span>
            <span className="whitespace-pre-wrap">{runs ? <StyledTextRuns runs={runs} /> : text}</span>
          </li>)}
        </ol>
        <button className="btn-secondary justify-self-start" type="button" onClick={apply}>เพิ่มข้อความที่ตรวจแล้ว</button>
      </>}
      {added > 0 && <p role="status">เพิ่มข้อความ {added} {groupLabel} ในฉบับร่างแล้ว</p>}
    </div>
  </details>
}
