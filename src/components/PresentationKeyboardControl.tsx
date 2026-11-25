/** Reviews EasyWorship hotkeys before applying them on the presentation computer. */

import { useRef, useState, type ChangeEvent } from 'react'
import { keyboardActions, keyboardBindingLabel, parseEasyWorshipHotkeys, saveKeyboardProfile,
  type KeyboardImport, type KeyboardProfile } from '../utils/presentationKeyboard'

export function PresentationKeyboardControl({ active, onApply }: {
  active: KeyboardProfile | undefined
  onApply: (profile: KeyboardProfile | undefined) => void
}) {
  const [review, setReview] = useState<KeyboardImport>()
  const [error, setError] = useState('')
  const version = useRef(0)
  const displayed = review?.profile ?? active

  async function read(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    const request = ++version.current
    setReview(undefined)
    setError('')
    try {
      if (file.size > 65536) throw new Error('ไฟล์ปุ่มลัดมีขนาดเกิน 64 KB')
      const imported = parseEasyWorshipHotkeys(new Uint8Array(await file.arrayBuffer()), file.name)
      if (request === version.current) setReview(imported)
    } catch (cause) {
      if (request === version.current) setError(cause instanceof Error ? cause.message : 'อ่านไฟล์ปุ่มลัดไม่สำเร็จ')
    }
  }

  function apply(profile: KeyboardProfile | undefined) {
    setError('')
    try {
      saveKeyboardProfile(profile)
      onApply(profile)
      setReview(undefined)
    } catch {
      setError('เบราว์เซอร์บันทึกชุดปุ่มลัดไม่ได้')
    }
  }

  return (
    <details className="mb-4! rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3!">
      <summary className="cursor-pointer font-medium">ปุ่มลัดนำเสนอ</summary>
      <div className="mt-3! grid min-w-0 gap-2 text-sm">
        <p role="status" className="wrap-anywhere">{active ? `กำลังใช้ ${active.name}` : 'กำลังใช้ปุ่มลัด WorshipTeam'}</p>
        <label className="flex min-w-0 flex-col gap-1">
          ไฟล์ปุ่มลัด EasyWorship
          <input type="file" className="input-field min-w-0" accept=".ini" onChange={(event) => void read(event)} />
        </label>
        <p className="text-[var(--fg-secondary)]">เลือก HotKeys.2.ini หรือ HotKeys.ini จากโฟลเดอร์ Settings ของเครื่องเดิม</p>
        {displayed && <dl className="grid max-h-52 grid-cols-[1fr_auto] gap-x-3 gap-y-1 overflow-y-auto rounded border border-[var(--border-subtle)] p-2!">
          {Object.entries(keyboardActions).flatMap(([action, label]) => {
            const keys = Object.keys(displayed.bindings).filter((key) => displayed.bindings[key] === action)
            return keys.length ? [
              <dt key={action}>{label}</dt>,
              <dd key={action + '-keys'} className="text-right wrap-anywhere">{keys.map(keyboardBindingLabel).join(', ')}</dd>,
            ] : []
          })}
        </dl>}
        {review && <p role="status">อ่านได้ {Object.keys(review.profile.bindings).length} ปุ่ม</p>}
        {Boolean(review?.ignored.length) && <details>
          <summary className="cursor-pointer">ปุ่มที่ข้าม {review?.ignored.length} รายการ</summary>
          <ul className="list-disc pl-5">{review?.ignored.map((item, index) => <li key={index} className="wrap-anywhere">{item}</li>)}</ul>
        </details>}
        <div className="flex flex-wrap gap-2">
          {review && <button type="button" className="btn-primary" disabled={!Object.keys(review.profile.bindings).length}
            onClick={() => apply(review.profile)}>ใช้ปุ่มลัดชุดนี้</button>}
          {active && <button type="button" className="btn-secondary" onClick={() => apply(undefined)}>คืนปุ่มลัด WorshipTeam</button>}
        </div>
        {error && <p role="alert" className="wrap-anywhere text-[var(--status-error-text)]">{error}</p>}
      </div>
    </details>
  )
}
