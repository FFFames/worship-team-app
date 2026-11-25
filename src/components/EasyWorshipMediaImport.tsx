/** Reviews an EasyWorship media catalog and copies chosen assets into the local library. */

import { useRef, useState, type FormEvent } from 'react'
import { withReviewedMedia, type reviewEasyWorshipMedia } from '../utils/easyWorshipMedia'
import { CUE_LABELS } from '../utils/playlistCues'
import { saveLibraryDvd, saveLibraryFeed, saveMigratedLibraryMedia } from '../utils/mediaLibrary'
import { canConvertLegacyVideo } from '../utils/legacyVideo'
import { EasyWorshipExternalMediaFolder } from './EasyWorshipExternalMediaFolder'

type Review = Awaited<ReturnType<typeof reviewEasyWorshipMedia>>
type Source = File | File[]

export function EasyWorshipMediaImport({ onImported }: { onImported: () => Promise<void> }) {
  const [mode, setMode] = useState<'archive' | 'folder'>('archive')
  const [source, setSource] = useState<Source | null>(null)
  const [attachedMedia, setAttachedMedia] = useState<File[]>([])
  const [externalFolder, setExternalFolder] = useState<File[]>([])
  const attachments = useRef<HTMLInputElement>(null)
  const [databasePath, setDatabasePath] = useState('')
  const [review, setReview] = useState<Review | null>(null)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<'reading' | 'saving' | null>(null)
  const [error, setError] = useState('')
  const [failed, setFailed] = useState<string[]>([])
  const [saved, setSaved] = useState<number | null>(null)
  const [savedFeeds, setSavedFeeds] = useState(0)
  const [savedDvds, setSavedDvds] = useState(0)
  const [progress, setProgress] = useState(0)

  const entries = review?.entries ?? []
  const ready = entries.filter((entry) => entry.readFile && !excluded.has(entry.sourceId))
  const feeds = review?.feeds ?? []
  const readyFeeds = feeds.filter((feed) => !excluded.has(feed.sourceId))
  const dvds = review?.dvds ?? []
  const readyDvds = dvds.filter((clip) => !excluded.has(clip.id))
  const total = ready.length + readyFeeds.length + readyDvds.length

  function chooseSource(file: Source | null) {
    setSource(file)
    setAttachedMedia([])
    setExternalFolder([])
    if (attachments.current) attachments.current.value = ''
    setReview(null)
    setDatabasePath('')
    setExcluded(new Set())
    setSaved(null)
    setSavedFeeds(0)
    setSavedDvds(0)
    setFailed([])
    setError('')
  }

  async function checkSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!source || busy) return

    setBusy('reading')
    setError('')
    setSaved(null)
    setSavedFeeds(0)
    setSavedDvds(0)
    setFailed([])
    try {
      const { reviewEasyWorshipMedia } = await import('../utils/easyWorshipMedia')
      const result = await reviewEasyWorshipMedia(source, databasePath || undefined, [...attachedMedia, ...externalFolder])
      setReview(result)
      setExcluded(new Set())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'อ่านคลังสื่อ EasyWorship ไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  function resetAttachmentReview() {
    setReview((current) => current ? { profiles: current.profiles, unsupported: [] } : null)
    setSaved(null)
    setSavedFeeds(0)
    setSavedDvds(0)
    setFailed([])
    setError('')
  }

  function toggle(sourceId: string, checked: boolean) {
    setExcluded((current) => {
      const next = new Set(current)
      if (checked) next.delete(sourceId)
      else next.add(sourceId)
      return next
    })
  }

  async function importSelected() {
    if (!total || busy) return

    setBusy('saving')
    setSaved(null)
    setSavedFeeds(0)
    setSavedDvds(0)
    setProgress(0)
    setError('')
    let completed = 0
    let completedFeeds = 0
    let completedDvds = 0
    const failures: string[] = []

    try {
      for (const entry of ready) {
        try {
          if (!entry.readFile) continue
          const uid = entry.metadata?.mediaUid
          const sourceId = entry.importSourceId ?? (typeof uid === 'string' ? uid : `${databasePath || review?.profiles[0].databasePath}:${entry.sourceId}`)
          await withReviewedMedia(entry, (blob) => saveMigratedLibraryMedia(blob, { ...entry, sourceId }))
          completed++
        } catch (cause) {
          failures.push(`${entry.name} · ${cause instanceof Error ? cause.message : 'บันทึกไม่ได้'}`)
        } finally {
          setProgress((value) => value + 1)
        }
      }
      for (const { sourceId: _row, ...feed } of readyFeeds) {
        try {
          await saveLibraryFeed(feed)
          completedFeeds++
        } catch (cause) {
          failures.push(`${feed.name} · ${cause instanceof Error ? cause.message : 'บันทึกไม่ได้'}`)
        } finally {
          setProgress((value) => value + 1)
        }
      }
      for (const clip of readyDvds) {
        try {
          await saveLibraryDvd(clip)
          completedDvds++
        } catch (cause) {
          failures.push(`${clip.name} · ${cause instanceof Error ? cause.message : 'บันทึกไม่ได้'}`)
        } finally {
          setProgress((value) => value + 1)
        }
      }
      setSaved(completed)
      setSavedFeeds(completedFeeds)
      setSavedDvds(completedDvds)
      setFailed(failures)
      await onImported()
    } catch {
      setError('บันทึกรายการแล้ว แต่อ่านคลังสื่อใหม่ไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  return (
    <details className="surface min-w-0 p-4! sm:p-5!">
      <summary className="cursor-pointer text-base font-medium">ย้ายคลังสื่อ EasyWorship</summary>
      <p className="mt-3! text-sm text-[var(--fg-secondary)]">
        เลือก Media.db หรือโปรไฟล์ที่มีฐานสื่อเดิม สำหรับฐานรุ่นเก่าให้เก็บ BackGrounds.DB กับ BackGrounds.MB ไว้คู่กัน
        ระบบกู้ไฟล์ที่มี SHA-256 ตรงกันจากคลังสื่อในเบราว์เซอร์นี้ได้
      </p>

      <form className="mt-3! flex flex-col items-start gap-3" onSubmit={checkSource}>
        <fieldset className="flex min-w-0 flex-wrap gap-x-4 gap-y-2" disabled={Boolean(busy)}>
          <legend className="sr-only">ประเภทโปรไฟล์ EasyWorship</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="media-profile-source" checked={mode === 'archive'}
              onChange={() => { setMode('archive'); chooseSource(null) }} /> ไฟล์
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="media-profile-source" checked={mode === 'folder'}
              onChange={() => { setMode('folder'); chooseSource(null) }} /> โฟลเดอร์โปรไฟล์
          </label>
        </fieldset>
        {mode === 'archive' ? (
          <label className="flex w-full min-w-0 flex-col gap-2 text-sm">
            ไฟล์ Media.db, .ewprofile, .ewpck หรือ .zip
            <input type="file" className="input-field min-w-0" accept=".ewprofile,.ewpck,.zip,.db"
              required disabled={Boolean(busy)} onChange={(event) => chooseSource(event.target.files?.[0] ?? null)} />
          </label>
        ) : (
          <label className="flex w-full min-w-0 flex-col gap-2 text-sm">
            โฟลเดอร์ที่มีฐานข้อมูลสื่อและ Resources
            <input type="file" className="input-field min-w-0" multiple {...{ webkitdirectory: '' }}
              required disabled={Boolean(busy)} onChange={(event) => chooseSource(Array.from(event.target.files ?? []))} />
          </label>
        )}

        {review && review.profiles.length > 1 && (
          <label className="flex w-full min-w-0 flex-col gap-2 text-sm">
            โฟลเดอร์ฐานข้อมูลสื่อ
            <select className="input-field" value={databasePath} required disabled={Boolean(busy)}
              onChange={(event) => {
                setDatabasePath(event.target.value)
                setAttachedMedia([])
                setExternalFolder([])
                if (attachments.current) attachments.current.value = ''
                setReview({ profiles: review.profiles, unsupported: [] })
                setSaved(null)
              }}>
              <option value="" disabled>เลือกโปรไฟล์</option>
              {review.profiles.map((profile) => <option value={profile.databasePath} key={profile.databasePath}>{profile.name} · {profile.databasePath}</option>)}
            </select>
          </label>
        )}

        {source && <label className="flex w-full min-w-0 flex-col gap-2 text-sm">
          แนบไฟล์สื่อต้นฉบับที่อยู่นอกโปรไฟล์
          <input ref={attachments} type="file" className="input-field min-w-0" multiple
            accept={`image/*,video/*,audio/*${canConvertLegacyVideo() ? ',.wmv,.avi,.mpg,.mpeg' : ''}`}
            disabled={Boolean(busy)} onChange={(event) => {
              setAttachedMedia(Array.from(event.target.files ?? []))
              resetAttachmentReview()
            }} />
        </label>}
        {source && <EasyWorshipExternalMediaFolder files={externalFolder} disabled={Boolean(busy)} onChange={(files) => {
          setExternalFolder(files)
          resetAttachmentReview()
        }} />}

        <button type="submit" className="btn-secondary" disabled={Boolean(busy)}>ตรวจคลังสื่อ</button>
      </form>

      {busy === 'reading' && <p role="status" className="mt-3! text-sm">กำลังอ่านฐานข้อมูลสื่อ…</p>}
      {error && <p role="alert" className="mt-3! text-sm wrap-anywhere text-[var(--status-error-text)]">{error}</p>}

      {review?.entries && (
        <div className="mt-4! flex flex-col gap-3">
          {(entries.length > 0 || review.unsupported.length > 0 || (!feeds.length && !dvds.length)) && <p role="status" className="text-sm text-[var(--fg-secondary)]">
            พบ {entries.length} รายการ · เลือก {ready.length} รายการ · ข้ามชนิดที่ยังไม่รองรับ {review.unsupported.length} รายการ
          </p>}
          {entries.length > 0 && (
            <ul className="max-h-72 divide-y divide-[var(--border-subtle)] overflow-y-auto">
              {entries.map((entry) => (
                <li key={entry.sourceId} className="py-2! text-sm">
                  <label className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1! shrink-0" disabled={Boolean(busy) || !entry.readFile}
                      checked={Boolean(entry.readFile && !excluded.has(entry.sourceId))}
                      onChange={(event) => toggle(entry.sourceId, event.target.checked)} />
                    <span className="min-w-0 wrap-anywhere">
                      <span className="font-medium">{entry.name}</span> · {CUE_LABELS[entry.kind]}
                      <span className="block text-xs text-[var(--fg-secondary)]">{[entry.warning || entry.filename, entry.originalLocation].filter(Boolean).join(' · ')}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {feeds.length > 0 && (
            <fieldset className="min-w-0" disabled={Boolean(busy)}>
              <legend className="font-medium">สัญญาณสด {readyFeeds.length}/{feeds.length} รายการ</legend>
              <ul className="max-h-64 divide-y divide-[var(--border-subtle)] overflow-y-auto">
                {feeds.map((feed) => (
                  <li key={feed.id} className="py-2! text-sm">
                    <label className="flex items-start gap-3">
                      <input type="checkbox" className="mt-1! shrink-0" checked={!excluded.has(feed.sourceId)}
                        onChange={(event) => toggle(feed.sourceId, event.target.checked)} />
                      <span className="min-w-0 wrap-anywhere">
                        {feed.name}
                        {feed.deviceHints.length > 0 && <span className="block text-xs text-[var(--fg-secondary)]">
                          {feed.deviceHints.join(', ')}
                        </span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          {dvds.length > 0 && <fieldset className="min-w-0" disabled={Boolean(busy)}>
            <legend className="font-medium">คลิป DVD {readyDvds.length}/{dvds.length} รายการ</legend>
            <ul className="max-h-64 divide-y divide-[var(--border-subtle)] overflow-y-auto">
              {dvds.map((clip) => <li key={clip.id} className="py-2! text-sm">
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1! shrink-0" checked={!excluded.has(clip.id)}
                    onChange={(event) => toggle(clip.id, event.target.checked)} />
                  <span className="min-w-0 wrap-anywhere">{clip.name}
                    {clip.discName && <span className="block text-xs text-[var(--fg-secondary)]">{clip.discName}</span>}
                  </span>
                </label>
              </li>)}
            </ul>
          </fieldset>}

          {review.unsupported.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer">รายละเอียดรายการที่ข้าม</summary>
              <ul className="mt-2! space-y-1 text-[var(--fg-secondary)]">
                {review.unsupported.map((row, index) => <li key={index}>{row.message}</li>)}
              </ul>
            </details>
          )}

          <button type="button" className="btn-primary self-start" disabled={Boolean(busy) || !total} onClick={() => void importSelected()}>
            {feeds.length && !entries.length && !dvds.length ? 'นำเข้าสัญญาณสดที่เลือก' : 'นำเข้าสื่อที่เลือก'}
          </button>
          {busy === 'saving' && <p role="status" className="text-sm">กำลังเก็บรายการ {progress}/{total}</p>}
          {saved !== null && entries.length > 0 && <p role="status" className="text-sm">บันทึกสื่อในเบราว์เซอร์นี้ {saved} รายการ</p>}
          {saved !== null && feeds.length > 0 && <p role="status" className="text-sm">บันทึกสัญญาณสดในเบราว์เซอร์นี้ {savedFeeds} รายการ</p>}
          {saved !== null && dvds.length > 0 && <p role="status" className="text-sm">บันทึกคลิป DVD ในเบราว์เซอร์นี้ {savedDvds} รายการ</p>}
          {failed.length > 0 && <ul role="alert" className="space-y-1 text-sm text-[var(--status-error-text)]">
            {failed.map((message, index) => <li className="wrap-anywhere" key={index}>{message}</li>)}
          </ul>}
        </div>
      )}
    </details>
  )
}
