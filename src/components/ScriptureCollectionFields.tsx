/** Selects installed editions for a collection's rules and browses individual verse overrides. */

import { useEffect, useId, useMemo, useState } from 'react'
import type { LocatedVerse, ScriptureEdition, ScriptureEditionInfo } from '../types/scripture'
import type { CollectionRule } from '../utils/easyWorshipCollections'
import { readScriptureCollectionVerse, scriptureCollectionVerseKey, scriptureEditionRuleField,
  scriptureRuleEditionLabel, sourceScriptureTranslationId } from '../utils/easyWorshipScriptureCollections'
import { findScripturePassage, searchScriptureText, verseReference } from '../utils/scripture'
import { readScriptureEdition } from '../utils/scriptureLibrary'

type Decision = 'include' | 'exclude'
const pageSize = 12

export function ScriptureCollectionScope({ editions, rules, onChange }: {
  editions: ScriptureEditionInfo[]; rules: CollectionRule[]; onChange: (rules: CollectionRule[]) => void
}) {
  const local = rules.filter((rule) => rule.field === scriptureEditionRuleField)
  const native = rules.filter((rule) => rule.field.toLowerCase() === 'translation')
  const missing = local.filter((rule) => !editions.some((edition) => edition.id === rule.value))
  return <fieldset className="grid min-w-0 gap-2">
    <legend className="font-medium">ฉบับที่ใช้กับกฎ</legend>
    {!local.length && !native.length && <p className="text-sm text-[var(--fg-secondary)]">ใช้กฎกับทุกฉบับที่ติดตั้ง</p>}
    {editions.map((edition) => <label key={edition.id} className="flex min-w-0 items-center gap-2 wrap-anywhere">
      <input type="checkbox" checked={local.some((rule) => rule.value === edition.id)} onChange={(event) => {
        const retained = rules.filter((rule) => rule.field !== scriptureEditionRuleField || rule.value !== edition.id)
        onChange(event.currentTarget.checked ? [...retained, { id: crypto.randomUUID(), field: scriptureEditionRuleField,
          operator: 0, value: edition.id, secondValue: null }] : retained)
      }} />{edition.name} ({edition.abbreviation})
    </label>)}
    {native.length + missing.length > 0 && <ul className="grid min-w-0 gap-2">
      {[...native, ...missing].map((rule) => <li key={rule.id} className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 wrap-anywhere">{rule.field === scriptureEditionRuleField ? `ยังไม่ได้ติดตั้ง ${rule.value}`
          : `จาก EasyWorship · ${scriptureRuleEditionLabel(rule) ?? rule.value}`}</span>
        <button type="button" className="btn-ghost" onClick={() => onChange(rules.filter(({ id }) => id !== rule.id))}>เอาฉบับนี้ออกจากกฎ</button>
      </li>)}
    </ul>}
  </fieldset>
}

export function ScriptureCollectionMembers({ editions, initialEdition, decisions, onChange }: {
  editions: ScriptureEditionInfo[]
  initialEdition?: string
  decisions: Record<string, Decision>
  onChange: (key: string, decision: Decision | '', aliases?: string[]) => void
}) {
  const controlId = useId()
  const [selectedEdition, setSelectedEdition] = useState(initialEdition ?? '')
  const [edition, setEdition] = useState<ScriptureEdition | null>(null)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'reference' | 'text'>('reference')
  const [results, setResults] = useState<LocatedVerse[] | null>(null)
  const [limit, setLimit] = useState(pageSize)
  const editionId = editions.find(({ id }) => id === selectedEdition)?.id ?? editions[0]?.id ?? ''
  const loaded = edition?.id === editionId ? edition : null

  useEffect(() => {
    if (!editionId) return
    let active = true
    void readScriptureEdition(editionId).then((edition) => {
      if (!active) return
      setEdition(edition)
      setLoadError(edition ? '' : editionId)
    }).catch(() => { if (active) setLoadError(editionId) })
    return () => { active = false }
  }, [editionId])

  const overrides = useMemo(() => Object.entries(decisions).map(([key, decision]) => ({ key, decision, addr: readScriptureCollectionVerse(key) })), [decisions])
  const nativeEditionId = loaded ? sourceScriptureTranslationId(loaded) : undefined
  const byVerse = useMemo(() => {
    const entries = new Map<string, typeof overrides>()
    for (const item of overrides) {
      const ref = item.addr
      if (!ref || (ref.editionId !== editionId && ref.editionId !== nativeEditionId)) continue
      const key = JSON.stringify([ref.bookId, ref.chapter, ref.verse])
      const previous = entries.get(key) ?? []
      previous.push(item)
      entries.set(key, previous)
    }
    return entries
  }, [editionId, nativeEditionId, overrides])

  function search() {
    if (!loaded || !query.trim()) return
    setResults(mode === 'reference' ? findScripturePassage(loaded, query) : searchScriptureText(loaded, query))
    setLimit(pageSize)
  }

  return <fieldset className="grid min-w-0 gap-2">
    <legend className="font-medium">เลือกข้อพระคัมภีร์เอง</legend>
    {editions.length > 0 ? <>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <label htmlFor={`${controlId}-edition`} className="grid min-w-0 gap-1">ฉบับสำหรับเลือกข้อ</label>
        <select id={`${controlId}-edition`} className="input-field min-w-0" value={editionId}
          onChange={(event) => { setSelectedEdition(event.currentTarget.value); setResults(null) }}>
          {editions.map(({ id, name, abbreviation }) => <option key={id} value={id}>{name} ({abbreviation})</option>)}
        </select>
        <label htmlFor={`${controlId}-mode`}>วิธีค้นหาข้อ</label>
        <select id={`${controlId}-mode`} className="input-field" value={mode} onChange={(event) => {
          setMode(event.currentTarget.value === 'text' ? 'text' : 'reference'); setResults(null)
        }}><option value="reference">อ้างอิงข้อ</option><option value="text">คำหรือวลี</option></select>
      </div>
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <label className="grid min-w-0 flex-1 gap-1">{mode === 'reference' ? 'ชื่อหนังสือ บท และข้อ' : 'คำหรือวลีในพระคัมภีร์'}
          <input type="search" className="input-field min-w-0" value={query} onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); search() } }} />
        </label>
        <button type="button" className="btn-secondary" disabled={!loaded || !query.trim()} onClick={search}>ค้นหาข้อ</button>
      </div>
      {loadError === editionId && <p role="alert">อ่านฉบับที่เลือกไม่ได้</p>}
      {loaded && results && (results.length === 0 ? <p role="status">ไม่พบข้อที่ตรงกับคำค้น</p> : <>
        <ul className="grid min-w-0 gap-2" aria-label="ข้อที่ค้นพบ">
          {results.slice(0, limit).map((verse) => {
            const existing = byVerse.get(JSON.stringify([verse.bookId, verse.chapter, verse.verse])) ?? []
            const native = existing.find((item) => typeof item.addr?.editionId === 'number')
            const key = native?.key ?? existing[0]?.key ?? scriptureCollectionVerseKey(loaded, verse)
            const decision = existing.find((item) => item.decision === 'exclude')?.decision ?? existing[0]?.decision ?? ''
            return <li key={key} className="grid min-w-0 gap-1 rounded-md border border-[var(--border-subtle)] p-2!">
              <label className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 wrap-anywhere">{verseReference(verse)}</span>
                <select className="input-field max-w-full" value={decision}
                  onChange={(event) => onChange(key, event.currentTarget.value as Decision | '', existing.map((item) => item.key))}>
                  <option value="">ตามกฎของกลุ่ม</option><option value="include">เพิ่มเข้ากลุ่ม</option><option value="exclude">ตัดจากกลุ่ม</option>
                </select>
              </label>
              <span className="line-clamp-2 text-sm text-[var(--fg-secondary)]">{verse.text}</span>
            </li>
          })}
        </ul>
        {limit < results.length && <button className="btn-secondary justify-self-start" type="button"
          onClick={() => setLimit((value) => value + pageSize)}>แสดงข้อเพิ่มเติม</button>}
      </>)}
    </> : <p className="text-sm text-[var(--fg-secondary)]">นำเข้าฉบับพระคัมภีร์ก่อนค้นหาและเลือกข้อ</p>}
    {overrides.length > 0 && <details>
      <summary className="cursor-pointer">ข้อที่กำหนดเอง ({overrides.length})</summary>
      <ul className="mt-2! grid min-w-0 gap-2">
        {overrides.map(({ key, addr, decision }) => {
          const info = addr && editions.find((edition) => typeof addr.editionId === 'number'
            ? sourceScriptureTranslationId(edition) === addr.editionId : edition.id === addr.editionId)
          const bookName = info?.id === loaded?.id && addr ? loaded?.books.find((book) => book.id === addr.bookId)?.name : undefined
          return <li key={key} className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 wrap-anywhere">{addr ? `${bookName ?? `หนังสือ ${addr.bookId}`} ${addr.chapter}:${addr.verse} · ${info?.abbreviation ?? `รหัสฉบับ ${addr.editionId}`}` : key}
              {' · '}{decision === 'include' ? 'เพิ่มเข้ากลุ่ม' : 'ตัดจากกลุ่ม'}</span>
            <button type="button" className="btn-ghost" onClick={() => onChange(key, '')}>คืนให้ใช้กฎ</button>
          </li>
        })}
      </ul>
    </details>}
  </fieldset>
}
