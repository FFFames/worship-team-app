/** Reviews and copies song versions from an EasyWorship schedule to the song library. */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useEasyWorshipImport, type ImportProgress } from '../hooks/useEasyWorshipImport'
import { useEasyWorshipScheduleSongCatalog } from '../hooks/useEasyWorshipScheduleSongCatalog'
import type { PlaylistCue } from '../types/database'
import { recoverEasyWorshipScheduleSongs, scheduleSongMatchesChart, type ScheduleSong, type ScheduleSongCatalogEntry } from '../utils/easyWorshipScheduleSongs'
import { readScheduleMedia, withScheduleMediaReader } from '../utils/scheduleMedia'
import { describeSlidePlayback } from '../utils/slidePlayback'

type Source = { file: File; packedMedia?: ReadonlyMap<string, Blob>; attachments?: ReadonlyMap<string, Blob> } | { playlistId: string }
type ReviewedSong = ScheduleSong & {
  state: 'new' | 'same' | 'saved' | 'version'
  existing?: ScheduleSongCatalogEntry
}
const initialProgress: ImportProgress = { added: 0, duplicates: 0 }

export function EasyWorshipScheduleSongs({ cues, source, disabled, onBusyChange }: {
  cues: readonly (PlaylistCue | null | undefined)[]
  source: Source
  disabled?: boolean
  onBusyChange?: (busy: boolean) => void
}) {
  const lookup = useEasyWorshipScheduleSongCatalog()
  const saveSongs = useEasyWorshipImport()
  const [reviewed, setReviewed] = useState<ReviewedSong[] | null>(null)
  const [skipped, setSkipped] = useState<Awaited<ReturnType<typeof recoverEasyWorshipScheduleSongs>>['skipped']>([])
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [selectedVersions, setSelectedVersions] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState<'reading' | 'saving' | null>(null)
  const [progress, setProgress] = useState(initialProgress)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])

  function selectedVersion(item: ReviewedSong) {
    return item.playbackVersions ? item.playbackVersions[selectedVersions[item.id]] : item
  }

  function chooseVersion(id: string, version: number) {
    setSelectedVersions((current) => ({ ...current, [id]: version }))
    setChosen((current) => {
      const next = new Set(current)
      if (version < 0) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function reviewSongs() {
    if (busy || disabled) return
    setReviewed(null)
    setError('')
    setSaved(false)
    setProgress(initialProgress)
    setWarnings([])
    setSelectedVersions({})
    setBusy('reading')
    onBusyChange?.(true)
    try {
      const recovery = await recoverEasyWorshipScheduleSongs(cues)
      const library = await lookup(recovery.songs)
      const canonicalTitle = (title: string) => title.normalize('NFC').trim()
      const byId = new Map(library.map((entry) => [entry.id, entry]))
      const byTitle = new Map<string, ScheduleSongCatalogEntry[]>()
      const bySource = new Map<string, ScheduleSongCatalogEntry[]>()
      for (const entry of library) {
        const title = canonicalTitle(entry.title)
        const list = byTitle.get(title) ?? []
        list.push(entry)
        byTitle.set(title, list)
        if (entry.easyworship_uid) {
          const sameSource = bySource.get(entry.easyworship_uid) ?? []
          sameSource.push(entry)
          bySource.set(entry.easyworship_uid, sameSource)
        }
      }
      const counts = new Map<string, number>()
      for (const { song } of recovery.songs) {
        const title = canonicalTitle(song.title)
        counts.set(title, (counts.get(title) ?? 0) + 1)
      }
      const matches = recovery.songs.map((item): ReviewedSong => {
        const title = canonicalTitle(item.song.title)
        const previous = byId.get(item.id)
        if (previous) return { ...item, state: 'saved', existing: previous }
        const sameTitle = byTitle.get(title) ?? []
        const original = item.song.sourceUid ? bySource.get(item.song.sourceUid) : undefined
        const candidates = original ?? sameTitle
        const same = candidates.find((entry) => scheduleSongMatchesChart(item.song, entry))
        if (same && !item.playbackVersions) return { ...item, state: 'same', existing: same }
        if (candidates.length || (counts.get(title) ?? 0) > 1) return { ...item, state: 'version', existing: candidates[0] }
        return { ...item, state: 'new' }
      })
      setSkipped(recovery.skipped)
      setReviewed(matches)
      setChosen(new Set(matches.filter((option) => option.state === 'new' && !option.playbackVersions).map((option) => option.id)))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ตรวจเพลงกับคลังไม่สำเร็จ')
    } finally {
      setBusy(null)
      onBusyChange?.(false)
    }
  }

  async function addSongs() {
    if (!reviewed || !chosen.size || busy || disabled) return
    setBusy('saving')
    onBusyChange?.(true)
    setError('')
    setProgress(initialProgress)
    setWarnings([])
    const selection = reviewed.flatMap((item) => {
      const version = selectedVersion(item)
      return chosen.has(item.id) && version ? [version] : []
    })
    const songs = selection.map(({ song }) => song)
    const update = (batch: ImportProgress) => {
      setProgress((previous) => ({ added: previous.added + batch.added, duplicates: previous.duplicates + batch.duplicates,
        filled: (previous.filled ?? 0) + (batch.filled ?? 0) }))
      const reported = batch.warnings
      if (reported?.length) setWarnings((current) => [...new Set([...current, ...reported])])
    }

    try {
      if ('file' in source) {
        await withScheduleMediaReader(source.file, selection.flatMap(({ files }) => files), source.packedMedia,
          (read, _paths, withAsset) => saveSongs(songs, update, read, withAsset), source.attachments)
      } else {
        await saveSongs(songs, update, async (path) => {
          const blob = await readScheduleMedia(source.playlistId, path)
          if (!blob) throw new Error('ไม่พบแฟ้มสื่อในเบราว์เซอร์นี้')
          return blob
        })
      }
      setSaved(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เพิ่มเพลงเข้าคลังไม่สำเร็จ')
    } finally {
      setBusy(null)
      onBusyChange?.(false)
    }
  }

  return (
    <section className="surface min-w-0 rounded-xl p-4 sm:p-6" aria-label="เพลงจากตาราง EasyWorship">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">เพิ่มเพลงจากตารางเข้าคลัง</h2>
        <button type="button" className="btn-secondary" onClick={() => void reviewSongs()} disabled={Boolean(disabled || busy)}>
          {reviewed ? 'ตรวจเพลงอีกครั้ง' : 'ตรวจเพลงกับคลัง'}
        </button>
      </div>
      {busy === 'reading' && <p className="mt-3!" role="status">กำลังเทียบเพลงกับคลัง…</p>}
      {reviewed && (
        <div className="mt-3! grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto">พบเพลง {reviewed.length} เพลง · เลือก {chosen.size} เพลง</p>
            {reviewed.some((item) => item.state === 'new' && selectedVersion(item)) && !saved && (
              <button type="button" className="btn-secondary" disabled={Boolean(disabled || busy)}
                onClick={() => setChosen((current) => new Set([...current, ...reviewed
                  .filter((item) => item.state === 'new' && selectedVersion(item)).map(({ id }) => id)]))}>เลือกเพลงใหม่ทั้งหมด</button>
            )}
            {chosen.size > 0 && !saved && <button type="button" className="btn-secondary"
              disabled={Boolean(disabled || busy)} onClick={() => setChosen(new Set())}>ล้างการเลือก</button>}
          </div>
          {!reviewed.length && <p>ตารางนี้ไม่มีเพลงที่อ่านเนื้อร้องได้</p>}
          {skipped.length > 0 && <details>
            <summary className="cursor-pointer">อ่านเนื้อร้องไม่ได้ {skipped.length} รายการ</summary>
            <ul className="mt-2! grid gap-1 wrap-anywhere">
              {skipped.map((entry) => <li key={entry.position}>{entry.position}. {entry.title}</li>)}
            </ul>
          </details>}
          <ul className="max-h-96 divide-y divide-[var(--border-subtle)] overflow-auto">
            {reviewed.map((item) => {
              const version = selectedVersion(item)
              const song = version?.song ?? item.song
              return (
                <li className="grid gap-1 py-2!" key={item.id}>
                  <label className="flex items-start gap-2 wrap-anywhere">
                    <input type="checkbox" className="mt-1!" checked={chosen.has(item.id)}
                      disabled={Boolean(disabled || busy || saved || item.state === 'same' || !version)}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked
                        setChosen((previous) => {
                          const next = new Set(previous)
                          if (checked) next.add(item.id)
                          else next.delete(item.id)
                          return next
                        })
                      }} />
                    <span className="font-medium">{item.song.title}</span>
                  </label>
                  <div className="ml-6! grid gap-1 text-sm text-[var(--fg-secondary)] wrap-anywhere">
                    <p>รายการ {item.positions.join(', ')} · {item.song.sections.length} ท่อน</p>
                    {item.song.author && <p>{item.song.author}</p>}
                    {item.song.copyright && <p>{item.song.copyright}</p>}
                    {item.song.ccli && <p>CCLI {item.song.ccli}</p>}
                    {item.state === 'saved' && <p>นำเข้าแล้ว · เลือกเพื่อเติมค่าเลื่อนสไลด์หรือสื่อที่ขาด</p>}
                    {item.state === 'same' && <p>มีเนื้อร้องนี้ในคลังแล้ว</p>}
                    {item.state === 'version' && <p>พบเพลงชื่อเดียวกัน · เลือกเพื่อนำเข้าเป็นอีกฉบับ</p>}
                    {item.playbackVersions && <label className="grid max-w-md gap-1">
                      {item.song.title} · ฉบับตามรายการในตาราง
                      <select className="input-field min-w-0" disabled={Boolean(disabled || busy || saved)}
                        value={selectedVersions[item.id] ?? -1} onChange={(event) => chooseVersion(item.id, Number(event.currentTarget.value))}>
                        <option value={-1}>เลือกฉบับที่ต้องการใช้กับเพลงในคลัง</option>
                        {item.playbackVersions.map((choice, index) => <option key={index} value={index}>
                          รายการ {choice.positions.join(', ')} · {choice.song.appearance?.looping ? 'วนเพลง' : 'จบที่สไลด์สุดท้าย'}
                        </option>)}
                      </select>
                    </label>}
                    {item.existing && <Link to={`/songs/${item.existing.id}`} target="_blank" rel="noopener" className="underline">
                      เปิดเพลงในคลัง
                    </Link>}
                    <details>
                      <summary className="cursor-pointer">ดูเนื้อร้องและสไลด์</summary>
                      <ul className="mt-2! grid gap-2">
                        {song.sections.map((section, index) => <li key={index} className="rounded-md bg-[var(--bg-tertiary)] p-2!">
                          <span>{section.label}</span>
                          <p className="whitespace-pre-wrap">{section.lines.join('\n')}</p>
                          {version && section.playback && <p>{describeSlidePlayback(section.playback)}</p>}
                        </li>)}
                      </ul>
                      {version && song.appearance?.looping !== undefined && <p className="mt-2!">{song.appearance.looping ? 'วนกลับสไลด์แรก' : 'จบที่สไลด์สุดท้าย'}</p>}
                      {version && version.files.length > 0 && <p className="mt-2!">สื่อในตาราง {new Set(version.files.map((asset) => asset.archivePath)).size} ไฟล์</p>}
                      {version && song.appearance?.warnings?.map((warning) => <p key={warning}>{warning}</p>)}
                    </details>
                  </div>
                </li>
              )
            })}
          </ul>
          {!saved && <button type="button" className="btn-primary justify-self-start" onClick={() => void addSongs()}
            disabled={Boolean(disabled || busy || !chosen.size)}>เพิ่มเพลงที่เลือกเข้าคลัง</button>}
          {busy === 'saving' && <p role="status">กำลังเพิ่มเพลง {progress.added + progress.duplicates} / {chosen.size}</p>}
          {saved && <div>
            <p role="status">เพิ่ม {progress.added} เพลง · มีอยู่แล้ว {progress.duplicates} เพลง
              {Boolean(progress.filled) && ` · เติมข้อมูลในเพลงเดิม ${progress.filled} เพลง`}</p>
            <Link to="/" className="mt-2! inline-block underline">เปิดคลังเพลง</Link>
          </div>}
          {warnings.length > 0 && <ul className="list-disc space-y-1 pl-5 wrap-anywhere">
            {warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>}
        </div>
      )}
      {error && <p role="alert" className="mt-2! text-sm text-[var(--status-error-text)] wrap-anywhere">{error}</p>}
    </section>
  )
}
