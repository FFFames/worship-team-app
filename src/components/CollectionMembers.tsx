/** Adds manual inclusions and exclusions to a resource collection. */

import { useMemo, useState } from 'react'
import { useSongs } from '../hooks/useSongs'

export type CollectionMember = { id: string; aliases?: string[]; title: string; detail?: string | null }
type Decision = 'include' | 'exclude'
type Props = { decisions: Record<string, Decision>; onChange: (id: string, decision: Decision | '') => void }

export function SongCollectionMembers(props: Props) {
  const { songs, loading, error } = useSongs()
  const items = useMemo(() => songs.map((song) => ({ id: song.id, title: song.title, detail: song.artist })), [songs])
  return <CollectionMembers {...props} items={items} label="เพลง" loading={loading} error={Boolean(error)} />
}

export function CollectionMembers({ decisions, onChange, items, label, loading, error }: Props & {
  items: CollectionMember[]; label: string; loading?: boolean; error?: boolean
}) {
  const [query, setQuery] = useState('')
  const [manualOnly, setManualOnly] = useState(false)
  const [limit, setLimit] = useState(12)
  const entries = useMemo(() => {
    const names = new Map<string, CollectionMember>()
    for (const item of items) for (const id of [item.id, ...(item.aliases ?? [])]) {
      if (!names.has(id)) names.set(id, { ...item, id })
    }
    if (manualOnly) return Object.keys(decisions).map((id) => names.get(id) ?? { id, title: `${label}ที่ไม่มีในคลัง` })
    const rows = new Map<string, CollectionMember>()
    for (const item of items) {
      const id = decisions[item.id] ? item.id : item.aliases?.find((alias) => decisions[alias]) ?? item.id
      if (!rows.has(id)) rows.set(id, { ...item, id })
    }
    return [...rows.values()]
  }, [items, decisions, label, manualOnly])
  const term = query.trim().toLowerCase()
  const filter = (item: CollectionMember) =>
    item.title.toLowerCase().includes(term) || (item.detail ?? '').toLowerCase().includes(term)
  const matches = entries.filter(filter)

  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="font-medium">เลือก{label}เอง</legend>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-0 flex-1 gap-1">
          ค้นหา{label}ในคลัง
          <input type="search" className="input-field" value={query}
            onChange={(event) => { setQuery(event.target.value); setLimit(12) }} />
        </label>
        <label className="flex min-h-10 items-center gap-2">
          <input type="checkbox" checked={manualOnly}
            onChange={(event) => { setManualOnly(event.target.checked); setLimit(12) }} />
          {label}ที่กำหนดไว้ ({Object.keys(decisions).length})
        </label>
      </div>
      {error && <p role="alert">เปิดคลัง{label}ไม่ได้</p>}
      {!manualOnly && loading ? <p role="status">กำลังโหลด{label}…</p>
        : !matches.length ? <p role="status">ไม่พบ{label}ในรายการนี้</p>
        : <ul className="grid min-w-0 gap-2" aria-label={`${label}ในรายการเลือก`}>
          {matches.slice(0, limit).map((song) => (
            <li key={song.id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <label className="min-w-0 flex-1 wrap-anywhere" htmlFor={`collection-member-${song.id}`}>
                {song.title}{song.detail && <span className="ml-1 text-sm text-[var(--fg-secondary)]">· {song.detail}</span>}
              </label>
              <select id={`collection-member-${song.id}`} className="input-field w-auto! max-w-full min-w-0!"
                value={decisions[song.id] ?? ''}
                onChange={(event) => onChange(song.id, event.target.value as Decision | '')}>
                <option value="">ตามกฎของกลุ่ม</option>
                <option value="include">เพิ่มเข้ากลุ่ม</option>
                <option value="exclude">ตัดจากกลุ่ม</option>
              </select>
            </li>
          ))}
        </ul>}
      {matches.length > limit && <button className="btn-secondary justify-self-start" type="button"
        onClick={() => setLimit((count) => count + 12)}>แสดงอีก</button>}
    </fieldset>
  )
}
