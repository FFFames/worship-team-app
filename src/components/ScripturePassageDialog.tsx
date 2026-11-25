/** Chooses verses from an installed edition for an editable slide frame. */

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import type { LocatedVerse, ScriptureEdition, ScriptureEditionInfo, ScriptureFrameSource } from '../types/scripture'
import { findScripturePassage, matchScriptureVerses, searchScriptureText, verseKey, verseReference } from '../utils/scripture'
import { listScriptureEditions, readScriptureEdition } from '../utils/scriptureLibrary'

const field = 'grid min-w-0 gap-1 text-sm'
const pageSize = 30

type SearchResult = { verses: LocatedVerse[]; selected: Set<string>; fromSavedFrame?: true }

function selectVerses(verses: LocatedVerse[], all: boolean): SearchResult {
  const available = verses.filter(({ text }) => text.trim())
  return { verses: available, selected: new Set(all ? available.map(verseKey) : []) }
}

export function ScripturePassageDialog({ initial, onSelect, onClose }: {
  initial?: ScriptureFrameSource
  onSelect: (edition: ScriptureEditionInfo, verses: LocatedVerse[]) => void
  onClose: () => void
}) {
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const [editions, setEditions] = useState<ScriptureEditionInfo[]>()
  const [selectedId, setSelectedId] = useState('')
  const [edition, setEdition] = useState<ScriptureEdition | null>(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'reference' | 'text'>('reference')
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<SearchResult>()
  const [visible, setVisible] = useState(pageSize)
  const initialId = editions?.find(({ id }) => id === initial?.editionId)?.id
  const editionId = selectedId || initialId || editions?.[0]?.id
  const current = edition?.id === editionId ? edition : null
  const chosen = current && result ? result.verses.filter((verse) => result.selected.has(verseKey(verse))) : []

  useEffect(() => {
    const modal = dialog.current
    modal?.showModal()
    return () => { if (modal?.open) modal.close() }
  }, [])

  useEffect(() => {
    let active = true
    void listScriptureEditions().then((available) => { if (active) setEditions(available) })
      .catch(() => { if (active) setError('เปิดรายการฉบับพระคัมภีร์ไม่ได้') })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!editionId) return
    let active = true
    void readScriptureEdition(editionId).then((loaded) => {
      if (!active) return
      if (!loaded) { setError('ไม่พบฉบับพระคัมภีร์ที่เลือก'); return }
      setEdition(loaded)
      setResult(initial ? { ...selectVerses(matchScriptureVerses(loaded, initial.verses), true), fromSavedFrame: true } : undefined)
    }).catch(() => { if (active) setError('อ่านฉบับที่เลือกไม่ได้') })
    return () => { active = false }
  }, [editionId, initial])

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (!current || !query.trim()) return
    const verses = mode === 'reference' ? findScripturePassage(current, query) : searchScriptureText(current, query)
    setResult(selectVerses(verses, mode === 'reference'))
    setVisible(pageSize)
  }

  function toggle(verse: LocatedVerse) {
    setResult((previous) => {
      if (!previous) return previous
      const selected = new Set(previous.selected)
      const key = verseKey(verse)
      if (selected.has(key)) selected.delete(key)
      else selected.add(key)
      return { ...previous, selected }
    })
  }

  function close() {
    dialog.current?.close()
    onClose()
  }

  return createPortal(<dialog ref={dialog} aria-labelledby={id + '-title'}
    onCancel={(event) => { event.preventDefault(); event.stopPropagation(); close() }}
    className="surface m-auto! max-h-[88dvh] w-[min(34rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-[var(--border-subtle)] p-4! text-[var(--fg-primary)] backdrop:bg-black/60 sm:p-6!">
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id + '-title'} className="text-lg font-semibold">เลือกข้อพระคัมภีร์</h2>
        <button type="button" className="btn-ghost" onClick={close}>ปิด</button>
      </div>
      {error && <p role="alert" className="text-sm text-[var(--status-error-text)]">{error}</p>}
      {!editions && !error && <p role="status" className="text-sm">กำลังเปิดคลังพระคัมภีร์…</p>}
      {editions?.length === 0 && <div className="grid gap-2 text-sm">
        <p>นำเข้าฉบับพระคัมภีร์ก่อนเลือกข้อ</p>
        <Link className="btn-secondary justify-self-start" to="/scripture" target="_blank" rel="noopener">เปิดคลังพระคัมภีร์</Link>
      </div>}
      {editions && editions.length > 0 && <>
        <div className={field}>
          <label htmlFor={id + '-edition'}>ฉบับพระคัมภีร์</label>
          <select id={id + '-edition'} className="input-field min-w-0" value={editionId ?? ''} onChange={(event) => {
            setSelectedId(event.currentTarget.value)
            setResult(undefined)
            setVisible(pageSize)
            setError('')
          }}>
            {editions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </div>
        {!current && !error && <p role="status" className="text-sm">กำลังอ่านฉบับที่เลือก…</p>}
        <form className="grid min-w-0 gap-2" onSubmit={search}>
          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="sr-only">วิธีค้นข้อพระคัมภีร์</legend>
            <label className="flex items-center gap-2"><input type="radio" name={id + '-mode'} checked={mode === 'reference'}
              onChange={() => setMode('reference')} />เลขข้อ</label>
            <label className="flex items-center gap-2"><input type="radio" name={id + '-mode'} checked={mode === 'text'}
              onChange={() => setMode('text')} />คำในข้อ</label>
          </fieldset>
          <div className={field}>
            <label htmlFor={id + '-query'}>{mode === 'reference' ? 'ชื่อหนังสือ บท และข้อ' : 'ข้อความที่ต้องการค้น'}</label>
            <input id={id + '-query'} className="input-field min-w-0 text-base sm:text-sm" type="search" enterKeyHint="search"
              value={query} onChange={(event) => setQuery(event.currentTarget.value)} autoComplete="off" />
          </div>
          <button className="btn-secondary justify-self-start" type="submit" disabled={!current || !query.trim()}>ค้นหาข้อพระคัมภีร์</button>
        </form>
        {current && result?.fromSavedFrame && initial && result.verses.length < initial.verses.length && <p role="status" className="text-sm">
          พบ {result.verses.length} จาก {initial.verses.length} ข้อเดิมในฉบับที่เลือก
        </p>}
        {current && result?.verses.length === 0 && !result.fromSavedFrame && <p role="status" className="text-sm">ไม่พบข้อในฉบับที่เลือก</p>}
        {current && result && result.verses.length > 0 && <>
          <fieldset className="grid max-h-60 min-w-0 gap-2 overflow-y-auto rounded-md border border-[var(--border-subtle)] p-2!">
            <legend className="px-1 text-sm">เลือกข้อที่จะใส่ในกรอบ</legend>
            {result.verses.slice(0, visible).map((verse) => <label key={verseKey(verse)} className="flex min-w-0 items-start gap-2 text-sm">
              <input className="mt-1! shrink-0" type="checkbox" checked={result.selected.has(verseKey(verse))} onChange={() => toggle(verse)} />
              <span className="min-w-0 wrap-anywhere"><strong className="block">{verseReference(verse)}</strong>{verse.text}</span>
            </label>)}
            {visible < result.verses.length && <button type="button" className="btn-secondary justify-self-start"
              onClick={() => setVisible((count) => count + pageSize)}>แสดงข้อเพิ่มเติม</button>}
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary" disabled={!chosen.length} onClick={() => {
              dialog.current?.close()
              onSelect(current, chosen)
            }}>
              {initial ? 'ใช้ข้อที่เลือกแทน' : 'ใส่ข้อที่เลือกในกรอบ'}
            </button>
            <span role="status" className="text-sm text-[var(--fg-secondary)]">เลือก {chosen.length} ข้อ</span>
          </div>
        </>}
      </>}
    </div>
  </dialog>, document.body)
}
