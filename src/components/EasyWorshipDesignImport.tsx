/** Reviews a profile's slide designs and saves the chosen layouts and their media. */

import { useState, type FormEvent } from 'react'
import type { DesignInput, ImportSlideDesigns } from '../hooks/useSlideDesigns'
import type { EasyWorshipDesignReview } from '../utils/easyWorshipDesigns'
import type { LegacySongEncoding } from '../utils/easyWorshipEncoding'
import { EasyWorshipLegacyEncoding } from './EasyWorshipLegacyEncoding'
import { importIdentity } from '../utils/importIdentity'
import { DESIGN_KIND_LABELS } from '../utils/slideDesign'
import { easyWorshipDesignIdentityContent, storeSlideDesignAssets } from '../utils/slideDesignAssets'

type Props = {
  store: ImportSlideDesigns
  onImported: () => Promise<void>
}

export function EasyWorshipDesignImport({ store, onImported }: Props) {
  const [sourceKind, setSourceKind] = useState<'profile' | 'folder' | 'export'>('profile')
  const [source, setSource] = useState<File | File[] | null>(null)
  const [profile, setProfile] = useState('')
  const [encoding, setEncoding] = useState<LegacySongEncoding>('auto')
  const [review, setReview] = useState<EasyWorshipDesignReview | null>(null)
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [excludedPowerPoints, setExcludedPowerPoints] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<'check' | 'save' | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [failed, setFailed] = useState<string[]>([])
  const entries = review?.entries ?? []
  const powerPoints = review?.powerPoints ?? []
  const selected = entries.filter((entry, index) => entry.content.slides.length && !excluded.has(index))
  const selectedPowerPoints = powerPoints.filter((entry) => entry.sourcePath && !excludedPowerPoints.has(entry.id))
  const selectedCount = selected.length + selectedPowerPoints.length
  const selectedProfile = review?.profiles.length === 1 ? review.profiles[0] : review?.profiles.find((item) => item.databasePath === profile)

  function reset(next: File | File[] | null) {
    setSource(next)
    setProfile('')
    setEncoding('auto')
    setReview(null)
    setExcluded(new Set())
    setExcludedPowerPoints(new Set())
    setMessage('')
    setError('')
    setFailed([])
  }

  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!source || busy) return
    setBusy('check')
    setMessage('')
    setError('')
    try {
      const { reviewEasyWorshipDesigns, reviewEasyWorshipDesignExports } = await import('../utils/easyWorshipDesigns')
      setReview(sourceKind === 'export' ? await reviewEasyWorshipDesignExports(Array.isArray(source) ? source : [source])
        : await reviewEasyWorshipDesigns(source, profile || undefined, encoding))
      setExcluded(new Set())
      setExcludedPowerPoints(new Set())
      setFailed([])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'อ่านฐานข้อมูลสไลด์ไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    if (!selectedCount || busy) return
    setBusy('save')
    setError('')
    setFailed([])
    const assets = new Map<string, string | null>()
    const rows: DesignInput[] = []
    try {
      for (const entry of selected) {
        const content = review?.readAsset
          ? await storeSlideDesignAssets(entry.content, review.readAsset, { cache: assets, allowMissing: true, withAsset: review.withAsset })
          : entry.content
        const id = entry.exportId ?? await importIdentity(['easyworship-design-v1', entry.kind, entry.title, easyWorshipDesignIdentityContent(content, entry.legacyTransitionWarningAt)])
        rows.push({ id, title: entry.title, kind: entry.kind, content })
        setMessage(`เตรียมสไลด์ ${rows.length}/${selectedCount} รายการ`)
      }

      if (selectedPowerPoints.length && review?.readAsset) {
        const { reviewCatalogedPowerPoint, savePowerPointDesign } = await import('../utils/powerPoint')
        const failures: string[] = []
        for (const entry of selectedPowerPoints) {
          if (!entry.sourcePath) continue
          try {
            const blob = await review.readAsset(entry.sourcePath)
            const deck = await reviewCatalogedPowerPoint(blob, entry, review.powerPointMedia)
            rows.push(await savePowerPointDesign(deck))
          } catch (cause) {
            failures.push(`${entry.title} · ${cause instanceof Error ? cause.message : 'นำเข้าไม่สำเร็จ'}`)
          }
          setMessage(`เตรียมสไลด์ ${rows.length + failures.length}/${selectedCount} รายการ`)
        }
        setFailed(failures)
      }

      let restoredPlayback = 0
      const added = await store(rows, undefined, (_sourceId, _destinationId, count) => { restoredPlayback += count })
      const missing = [...assets.values()].filter((id) => id === null).length
      setMessage(`เพิ่มเข้าคลัง ${added} รายการ · มีอยู่แล้ว ${rows.length - added} รายการ${restoredPlayback ? ` · คืนเอฟเฟ็กต์หรือเวลาเลื่อน ${restoredPlayback} สไลด์` : ''}${missing ? ` · เก็บสื่อไม่สำเร็จ ${missing} ไฟล์` : ''}`)
    } catch (cause) {
      setMessage('')
      setError(cause instanceof Error ? cause.message : 'บันทึกสไลด์ไม่สำเร็จ')
    } finally {
      await onImported()
      setBusy(null)
    }
  }

  return (
    <details className="surface min-w-0 p-4! sm:p-5!">
      <summary className="cursor-pointer font-medium">ย้ายงานนำเสนอและธีม EasyWorship</summary>
      <p className="mt-3! text-sm text-[var(--fg-secondary)]">
        เลือกไฟล์งานนำเสนอ .ewpx หรือธีม .ewtx ที่ส่งออกจาก EasyWorship หรือเลือกโปรไฟล์ที่มีฐานข้อมูลสไลด์และโฟลเดอร์ Resources
        ระบบกู้สื่อที่มี SHA-256 ตรงกับเลย์เอาต์จากคลังสื่อในเบราว์เซอร์นี้ได้
      </p>
      <form className="mt-3! flex flex-col items-start gap-3" onSubmit={inspect}>
        <fieldset className="flex flex-wrap gap-4 text-sm" disabled={Boolean(busy)}>
          <legend className="sr-only">ประเภทไฟล์นำเข้า</legend>
          {([['profile', 'โปรไฟล์หรือฐานข้อมูล'], ['folder', 'โฟลเดอร์โปรไฟล์'], ['export', 'งานนำเสนอหรือธีม']] as const).map(([kind, title]) =>
            <label className="flex items-center gap-2" key={kind}>
              <input type="radio" name="design-source" checked={sourceKind === kind} onChange={() => { setSourceKind(kind); reset(null) }} /> {title}
            </label>)}
        </fieldset>
        <label className="flex w-full min-w-0 flex-col gap-2 text-sm">
          {sourceKind === 'folder' ? 'โฟลเดอร์โปรไฟล์ EasyWorship' : sourceKind === 'export' ? 'ไฟล์ .ewpx หรือ .ewtx' : 'ไฟล์ .ewprofile, .ewpck, .zip หรือฐานข้อมูลสไลด์ .db'}
          {sourceKind === 'folder'
            ? <input key="folder" type="file" className="input-field min-w-0" {...{ webkitdirectory: '' }} multiple required disabled={Boolean(busy)} onChange={(event) => reset(Array.from(event.target.files ?? []))} />
            : sourceKind === 'export'
              ? <input key="export" type="file" className="input-field min-w-0" accept=".ewpx,.ewtx" multiple required disabled={Boolean(busy)} onChange={(event) => reset(Array.from(event.target.files ?? []))} />
              : <input key="archive" type="file" className="input-field min-w-0" accept=".ewprofile,.ewpck,.zip,.db" required disabled={Boolean(busy)} onChange={(event) => reset(event.target.files?.[0] ?? null)} />}
        </label>
        {review && review.profiles.length > 1 && (
          <label className="flex w-full min-w-0 flex-col gap-2 text-sm">โปรไฟล์ที่ต้องการย้าย
            <select className="input-field" required value={profile} disabled={Boolean(busy)} onChange={(event) => {
              setProfile(event.target.value)
              setEncoding('auto')
              setReview({ profiles: review.profiles, warnings: [] })
            }}>
              <option value="">เลือกโปรไฟล์</option>
              {review.profiles.map((item) => <option key={item.databasePath} value={item.databasePath}>{item.name} · {item.databasePath}</option>)}
            </select>
          </label>
        )}
        {review && /(?:^|\/)backgrounds\.db$/i.test(selectedProfile?.databasePath ?? '') && (
          <EasyWorshipLegacyEncoding label="รหัสอักษรของธีมรุ่นเก่า" value={encoding} disabled={Boolean(busy)}
            onChange={(next) => {
              setEncoding(next)
              setReview({ profiles: review.profiles, warnings: [] })
              setMessage('')
              setError('')
            }} />
        )}
        <button type="submit" disabled={Boolean(busy)} className="btn-secondary">ตรวจงานนำเสนอและธีม</button>
      </form>
      {busy === 'check' && <p role="status" className="mt-3! text-sm">กำลังอ่านงานนำเสนอและธีม…</p>}
      {error && <p role="alert" className="mt-3! text-sm wrap-anywhere text-[var(--status-error-text)]">{error}</p>}
      {review?.warnings.length ? <ul className="mt-3! space-y-1 text-sm text-[var(--fg-secondary)]">
        {review.warnings.map((warning, index) => <li key={index} className="wrap-anywhere">{warning}</li>)}
      </ul> : null}
      {review?.entries && (
        <div className="mt-4! flex flex-col items-start gap-3">
          <p role="status" className="text-sm">พบ {entries.length + powerPoints.length} รายการ · เลือก {selectedCount} รายการ</p>
          <ul className="max-h-72 w-full divide-y divide-[var(--border-subtle)] overflow-y-auto">
            {entries.map((entry, index) => (
              <li key={index} className="py-2! text-sm">
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1! shrink-0" disabled={Boolean(busy) || !entry.content.slides.length}
                    checked={Boolean(entry.content.slides.length && !excluded.has(index))} onChange={(event) => {
                      const checked = event.target.checked
                      setExcluded((current) => {
                        const next = new Set(current)
                        if (checked) next.delete(index)
                        else next.add(index)
                        return next
                      })
                    }} />
                  <span className="min-w-0 wrap-anywhere">
                    <span className="font-medium">{entry.title}</span> · {DESIGN_KIND_LABELS[entry.kind]} · {entry.content.slides.length} สไลด์
                  </span>
                </label>
                {entry.content.warnings?.length ? <details className="ml-5 mt-1 text-xs text-[var(--fg-secondary)]">
                  <summary className="cursor-pointer">{entry.content.warnings.length} ข้อสังเกต</summary>
                  <ul className="mt-1 space-y-1">
                    {entry.content.warnings.map((warning) => <li key={warning} className="wrap-anywhere">{warning}</li>)}
                  </ul>
                </details> : null}
              </li>
            ))}
            {powerPoints.map((entry) => (
              <li key={`pptx-${entry.id}`} className="py-2! text-sm">
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1! shrink-0" disabled={Boolean(busy) || !entry.sourcePath}
                    checked={Boolean(entry.sourcePath && !excludedPowerPoints.has(entry.id))} onChange={(event) => {
                      const checked = event.target.checked
                      setExcludedPowerPoints((current) => {
                        const next = new Set(current)
                        if (checked) next.delete(entry.id)
                        else next.add(entry.id)
                        return next
                      })
                    }} />
                  <span className="min-w-0 wrap-anywhere">
                    <span className="font-medium">{entry.title}</span> · PowerPoint · {entry.filename}
                    {entry.warning && <span className="block text-xs text-[var(--fg-secondary)]">{entry.warning}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button type="button" disabled={Boolean(busy) || !selectedCount} className="btn-primary" onClick={() => void save()}>นำเข้าสไลด์ที่เลือก</button>
          {message && <p role="status" className="text-sm">{message}</p>}
          {failed.length > 0 && <ul role="alert" className="space-y-1 text-sm text-[var(--status-error-text)]">
            {failed.map((failure, index) => <li key={index} className="wrap-anywhere">{failure}</li>)}
          </ul>}
        </div>
      )}
    </details>
  )
}
