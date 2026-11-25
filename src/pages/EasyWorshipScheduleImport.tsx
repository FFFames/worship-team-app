/** Previews and imports an ordered EasyWorship schedule and its local media. */

import { useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EasyWorshipScheduleSongs } from '../components/EasyWorshipScheduleSongs'
import { EasyWorshipLegacyEncoding } from '../components/EasyWorshipLegacyEncoding'
import { EasyWorshipExternalMediaFolder } from '../components/EasyWorshipExternalMediaFolder'
import { restoreAppendedScheduleDetails, useEasyWorshipScheduleImport, type SavedEasyWorshipSchedule } from '../hooks/useEasyWorshipScheduleImport'
import { appendEasyWorshipSchedule, defaultEasyWorshipAppendOperation, findAppendedScheduleRepairBatches, useEasyWorshipAppendDestination,
  type AppendedScheduleRepairBatch } from '../hooks/useEasyWorshipScheduleAppend'
import type { PlaylistCue } from '../types/database'
import { readEasyWorshipSchedule } from '../utils/easyWorshipSchedule'
import type { RejectedPackedMedia } from '../utils/easyWorshipPackedMedia'
import { convertEasyWorshipCues, mapScheduleImportIds, recoveredScheduleSongLabels,
  type RecoveredScheduleSongLabels, type ScheduleImportIds } from '../utils/easyWorshipScheduleCues'
import { recoveredScheduleScripture, type RecoveredScheduleScripture } from '../utils/easyWorshipScheduleScripture'
import { recoverableSchedulePlayback } from '../utils/easyWorshipSchedulePlayback'
import type { EasyWorshipScheduleBibleReview } from '../utils/easyWorshipScheduleBibles'
import { createEasyWorshipScheduleLibraryFinder, recoverableScheduleMedia, relinkEasyWorshipScheduleMedia, reviewEasyWorshipScheduleMedia } from '../utils/easyWorshipScheduleMedia'
import { CUE_LABELS } from '../utils/playlistCues'
import { packedLegacyVideoExtension, saveScheduleMedia, scheduleMediaAssets, stageRecoveredScheduleMedia } from '../utils/scheduleMedia'
import { canConvertLegacyVideo } from '../utils/legacyVideo'
import type { reviewSchedulePowerPoint } from '../utils/easyWorshipSchedulePowerPoint'
import type { SchedulePowerPointRecovery } from '../utils/easyWorshipPowerPointRecovery'
import type { LegacySongEncoding } from '../utils/easyWorshipEncoding'
import { easyWorshipAppendNamespace, namespaceAppendedCues,
  scopeAppendedPowerPointRecovery } from '../utils/easyWorshipAppendedSchedule'

type ImportResult = SavedEasyWorshipSchedule & {
  saved: number; missing: number; mediaError?: boolean; restoredDecks?: number; appendedEntries?: number; appendNamespace?: string
  repairNamespace?: string
  videoErrors?: string[]
}

const resultLabel: Record<SavedEasyWorshipSchedule['status'], string> = {
  saved: 'บันทึกเพลย์ลิสต์ใหม่แล้ว',
  duplicate: 'ใช้เพลย์ลิสต์ที่เคยนำเข้า',
  verified: 'ยืนยันว่ามีเพลย์ลิสต์ในปลายทาง',
}

const panel = 'surface min-w-0 rounded-xl p-4 sm:p-6'

export default function EasyWorshipScheduleImport() {
  const [params] = useSearchParams()
  const into = params.get('into')
  return <ScheduleImport key={into ?? 'new'} into={into} />
}

function ScheduleImport({ into }: { into: string | null }) {
  const saveSchedule = useEasyWorshipScheduleImport()
  const destination = useEasyWorshipAppendDestination(into || undefined)
  const appendMode = into !== null
  const appendAttempt = useRef<{ reviewedSourceId: string; sourceId: string; operationId: string } | undefined>(undefined)
  const [file, setFile] = useState<File | null>(null)
  const [cues, setCues] = useState<PlaylistCue[] | null>(null)
  const [rawCues, setRawCues] = useState<PlaylistCue[]>([])
  const [powerPoint, setPowerPoint] = useState<Awaited<ReturnType<typeof reviewSchedulePowerPoint>> | null>(null)
  const [showAttachmentField, setShowAttachmentField] = useState(false)
  const [supplemental, setSupplemental] = useState<File[]>([])
  const [showMediaField, setShowMediaField] = useState(false)
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const [externalFolder, setExternalFolder] = useState<File[]>([])
  const [media, setMedia] = useState<Awaited<ReturnType<typeof reviewEasyWorshipScheduleMedia>>>()
  const [bibleFiles, setBibleFiles] = useState<File[]>([])
  const bibleInput = useRef<HTMLInputElement>(null)
  const [bibles, setBibles] = useState<EasyWorshipScheduleBibleReview>()
  const [source, setSource] = useState<{
    ids: ScheduleImportIds; packedMedia?: ReadonlyMap<string, Blob>; songLabels: RecoveredScheduleSongLabels; scripture: RecoveredScheduleScripture
    rejectedPackedMedia?: RejectedPackedMedia
  }>()
  const [encoding, setEncoding] = useState<LegacySongEncoding>('auto')
  const [name, setName] = useState('')
  const [libraryBusy, setLibraryBusy] = useState(false)
  const [busy, setBusy] = useState<'reading' | 'saving' | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [repairBatches, setRepairBatches] = useState<AppendedScheduleRepairBatch[]>([])
  const [repairSelection, setRepairSelection] = useState('')

  function changeBibleFiles(files: File[]) {
    if (!files.length && bibleInput.current) bibleInput.current.value = ''
    setBibleFiles(files)
    setBibles(undefined)
    setCues(null)
    setResult(null)
    setError('')
  }

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || busy || libraryBusy) return

    setBusy('reading')
    setError('')
    setResult(null)
    setCues(null)
    setBibles(undefined)
    setRepairBatches([])
    setRepairSelection('')
    try {
      const attachedBibles = bibleFiles.length
        ? await (await import('../utils/easyWorshipScheduleBibles')).reviewEasyWorshipScheduleBibles(bibleFiles) : undefined
      const schedule = await readEasyWorshipSchedule(file, encoding, attachedBibles?.lookup)
      setBibles(attachedBibles?.results())
      const ids = { sourceId: schedule.source.importId, previousSourceId: schedule.source.previousScriptureImportId }
      const originals = convertEasyWorshipCues(schedule)
      const scripture = recoveredScheduleScripture(schedule)
      const attachedMedia = [...mediaFiles, ...externalFolder]
      const reviewedMedia = await reviewEasyWorshipScheduleMedia(originals, attachedMedia, Boolean(schedule.packedMedia),
        createEasyWorshipScheduleLibraryFinder(), schedule.rejectedPackedMedia, schedule.externalMediaLocations)
      setMedia(reviewedMedia)
      setShowMediaField((shown) => shown || Boolean(reviewedMedia.unresolved.length))
      const hasPowerPoint = originals.some((cue) => cue.slides.some((slide) => slide.assets?.some((asset) => asset.kind === 'powerpoint')))
      let appendedPowerPoint: SchedulePowerPointRecovery | undefined
      let reviewedCues = reviewedMedia.cues
      if (hasPowerPoint) {
        const { reviewSchedulePowerPoint, previewAppendedPowerPointRecovery } = await import('../utils/easyWorshipSchedulePowerPoint')
        const review = await reviewSchedulePowerPoint(file, originals, [...supplemental, ...externalFolder], {
          packedMedia: schedule.packedMedia, linkedFiles: attachedMedia, externalMediaLocations: schedule.externalMediaLocations,
        })
        setPowerPoint(review)
        reviewedCues = relinkEasyWorshipScheduleMedia(review.cues, reviewedMedia.links)
        setShowAttachmentField((shown) => shown || Boolean(review.unresolved.size))
        if ([...review.decks.values()].some((deck) => deck.unresolvedMedia?.length)) setShowMediaField(true)
        if (into && review.repairableDecks.size) appendedPowerPoint = previewAppendedPowerPointRecovery(originals, review, ids)
      } else setPowerPoint(null)
      if (into) {
        const batches = await findAppendedScheduleRepairBatches(into, ids, originals, reviewedMedia,
          { powerPoint: appendedPowerPoint, rejected: schedule.rejectedPackedMedia, scripture, playback: recoverableSchedulePlayback(originals) })
        setRepairBatches(batches)
        setRepairSelection(batches.length === 1 ? batches[0].namespace : '')
      }
      setCues(reviewedCues)
      setRawCues(originals)
      setSource({
        ids, packedMedia: schedule.packedMedia, rejectedPackedMedia: schedule.rejectedPackedMedia,
        songLabels: recoveredScheduleSongLabels(schedule), scripture,
      })
      setName((current) => current || file.name.replace(/\.ewsx?$/i, ''))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'อ่านไฟล์ตาราง EasyWorship ไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  async function importSchedule(appendAgain = false) {
    if (!file || !cues?.length || !source || !media || busy || libraryBusy
      || (appendMode ? !destination.playlist : !name.trim())) return

    setBusy('saving')
    setError('')
    setResult(null)
    try {
      const restored = powerPoint?.decks.size
        ? await (await import('../utils/easyWorshipSchedulePowerPoint')).storeSchedulePowerPoint(rawCues, powerPoint, source.ids)
        : { cues: powerPoint?.cues ?? rawCues, ids: source.ids, recovery: undefined }
      const ids = await mapScheduleImportIds(restored.ids, media.sourceId)
      const prepared = relinkEasyWorshipScheduleMedia(restored.cues, media.links)
      const mediaRecovery = recoverableScheduleMedia(restored.ids, restored.cues, media.links, source.rejectedPackedMedia)
      let saved: SavedEasyWorshipSchedule & Pick<ImportResult, 'appendedEntries' | 'appendNamespace'>
      if (result && !appendAgain) saved = result
      else if (destination.playlist) {
        const playlistId = destination.playlist.id
        if (appendAgain || appendAttempt.current?.reviewedSourceId !== ids.sourceId) {
          const operation = appendAgain ? { sourceId: ids.sourceId, operationId: crypto.randomUUID() }
            : await defaultEasyWorshipAppendOperation(playlistId, ids.sourceId,
              mediaRecovery?.verifiedAttachments ? restored.ids.sourceId : undefined)
          appendAttempt.current = { ...operation, reviewedSourceId: ids.sourceId }
        }
        const { sourceId, operationId } = appendAttempt.current
        const appendNamespace = easyWorshipAppendNamespace(operationId)
        const appended = await appendEasyWorshipSchedule(playlistId, operationId, sourceId,
          namespaceAppendedCues(prepared, appendNamespace, source.ids.sourceId))
        saved = { ...appended, appendNamespace }
      } else {
        const powerPointMediaIds = restored.recovery && media.links.size ? await mapScheduleImportIds(restored.recovery.ids, media.sourceId) : undefined
        saved = await saveSchedule(ids.sourceId, name.trim(), prepared, {
          labels: source.songLabels, scripture: source.scripture, previousSourceId: ids.previousSourceId,
          powerPoint: restored.recovery, powerPointMediaIds,
          media: mediaRecovery,
          stageMasterSoundtracks: stageRecoveredScheduleMedia(file, source.packedMedia, media.attachments),
        })
      }
      const { playlistId } = saved
      const assets = scheduleMediaAssets(prepared).concat((saved.keptPowerPointMedia ?? [])
        .filter(({ archivePath }) => archivePath && source.packedMedia?.has(archivePath)))
      const restoredDecks = saved.usedPowerPointFallback ? undefined : powerPoint?.decks.size
      try {
        const savedMedia = await saveScheduleMedia(file, playlistId, assets, source.packedMedia, media.attachments, saved.appendNamespace)
        setResult({ ...saved, ...savedMedia, mediaError: false, restoredDecks })
      } catch {
        setResult({ ...saved, saved: 0, missing: 0, mediaError: true, restoredDecks })
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'บันทึกเพลย์ลิสต์ไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  async function repairAppendedSchedule(namespace: string) {
    const batch = repairBatches.find((item) => item.namespace === namespace)
    const playlistId = destination.playlist?.id
    if (!batch || !playlistId || !file || !media || !source || busy || libraryBusy) return
    const saved = { playlistId, status: 'duplicate' as const, repairNamespace: namespace }
    setBusy('saving')
    setError('')
    setResult(null)
    try {
      let stored: Awaited<ReturnType<typeof saveScheduleMedia>> = { saved: 0, missing: 0 }
      let recoveredPowerPoint: SchedulePowerPointRecovery | undefined
      try {
        if (batch.assets.length) stored = await saveScheduleMedia(file, playlistId, batch.assets, source.packedMedia, media.attachments, namespace)
        if (stored.missing) {
          setResult({ ...saved, ...stored })
          return
        }
        if (batch.powerPointUids.size && powerPoint) {
          const { storeSchedulePowerPoint } = await import('../utils/easyWorshipSchedulePowerPoint')
          const { recovery } = await storeSchedulePowerPoint(rawCues, powerPoint, source.ids, batch.powerPointUids)
          recoveredPowerPoint = scopeAppendedPowerPointRecovery(recovery, namespace)
        }
      } catch {
        setResult({ ...saved, ...stored, mediaError: true })
        return
      }
      const details = await restoreAppendedScheduleDetails(playlistId, {
        media: batch.media, powerPoint: recoveredPowerPoint, scripture: batch.scripture, playback: batch.playback, slideDetails: batch.slideDetails,
      }, batch.powerPoint)
      setResult({ ...saved, ...stored, ...details })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'กู้ข้อมูลในชุดเดิมไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  const hasReadError = Boolean(error && !cues)
  const choosingRepair = repairBatches.length > 0 && !result
  const selectedRepair = repairBatches.find(({ namespace }) => namespace === repairSelection)
  const legacyVideos = new Set(scheduleMediaAssets(cues ?? [])
    .flatMap((asset) => packedLegacyVideoExtension(asset.archivePath, asset) ? [asset.archivePath] : []))
  let repairLabel = selectedRepair ? 'กู้สื่อในชุดเดิม' : 'กู้ข้อมูลในชุดเดิม'
  if (selectedRepair?.slideDetails) {
    const otherRepairs = selectedRepair.powerPoint || selectedRepair.scripture || selectedRepair.playback || selectedRepair.media
    if (otherRepairs || (selectedRepair.restoresLayout && selectedRepair.restoresMasterSoundtrack)) repairLabel = 'กู้ข้อมูลในชุดเดิม'
    else repairLabel = selectedRepair.restoresMasterSoundtrack ? 'คืนเสียงประกอบในชุดเดิม' : 'คืนพื้นหลังและเลย์เอาต์ในชุดเดิม'
  } else if (selectedRepair?.restoresMediaPlayback) {
    repairLabel = selectedRepair.powerPoint || selectedRepair.scripture || selectedRepair.assets.length || selectedRepair.restoresSlidePlayback
      ? 'กู้ข้อมูลในชุดเดิม' : 'คืนค่าการเล่นสื่อในชุดเดิม'
  } else if (selectedRepair?.playback) {
    repairLabel = selectedRepair.powerPoint || selectedRepair.scripture || selectedRepair.assets.length
      ? 'กู้ข้อมูลในชุดเดิม' : 'คืนเอฟเฟ็กต์และเวลาเลื่อนในชุดเดิม'
  } else if (selectedRepair?.scripture) {
    repairLabel = selectedRepair.powerPoint || selectedRepair.assets.length ? 'กู้ข้อมูลในชุดเดิม' : 'กู้ข้อพระคัมภีร์ในชุดเดิม'
  } else if (selectedRepair?.powerPoint) {
    repairLabel = selectedRepair.assets.length ? 'กู้สื่อและ PowerPoint ในชุดเดิม' : 'กู้ PowerPoint ในชุดเดิม'
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="page-header mb-0">
        <div className="page-title">
          <h1>{appendMode ? 'เพิ่มตาราง EasyWorship' : 'นำเข้าตาราง EasyWorship'}</h1>
          <p>{appendMode ? 'เพิ่มรายการจากไฟล์ .ews หรือ .ewsx ต่อท้ายเพลย์ลิสต์ที่เลือก'
            : 'ตรวจลำดับและเนื้อหาจากไฟล์ .ews หรือ .ewsx ก่อนบันทึกเพลย์ลิสต์หรือเพิ่มเพลงลงคลัง'}</p>
        </div>
        <Link to={destination.playlist ? `/playlists/${destination.playlist.id}` : '/playlists'} className="btn-secondary">กลับเพลย์ลิสต์</Link>
      </header>

      {appendMode && destination.loading && <p role="status">กำลังเปิดเพลย์ลิสต์ปลายทาง…</p>}
      {appendMode && !destination.loading && !destination.playlist && <p role="alert">เปิดเพลย์ลิสต์ปลายทางไม่ได้</p>}

      <form className={panel} onSubmit={review}>
        <label className="flex flex-col gap-2">
          <span className="font-medium">ไฟล์ตารางนมัสการ .ews หรือ .ewsx</span>
          <input type="file" accept=".ews,.ewsx" disabled={Boolean(busy || libraryBusy)} required className="input-field min-w-0"
            aria-describedby={hasReadError ? 'schedule-file-error' : 'schedule-file-help'} aria-invalid={hasReadError || undefined}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null)
              setName('')
              setRawCues([])
              setSource(undefined)
              setEncoding('auto')
              setPowerPoint(null)
              setSupplemental([])
              setShowAttachmentField(false)
              setMediaFiles([])
              setExternalFolder([])
              setMedia(undefined)
              setShowMediaField(false)
              changeBibleFiles([])
            }} />
        </label>
        <p id="schedule-file-help" className="mt-3 text-sm text-[var(--fg-secondary)]">
          เลือก Pack files in schedule ตอนบันทึกจาก EasyWorship เพื่อรวมภาพ วิดีโอ และ PowerPoint สื่อที่นำเข้าจะเก็บในเบราว์เซอร์นี้
        </p>
        {file && /\.ews$/i.test(file.name) && (
          <div className="mt-3!">
            <EasyWorshipLegacyEncoding label="รหัสอักษรของตารางรุ่นเก่า" value={encoding} disabled={Boolean(busy || libraryBusy)}
              onChange={(next) => {
                setEncoding(next)
                setCues(null)
                setSource(undefined)
                setResult(null)
                setError('')
              }} />
          </div>
        )}
        {showAttachmentField && (
          <div className="mt-3! flex min-w-0 flex-col gap-2 text-sm">
            <label htmlFor="schedule-powerpoint">ไฟล์ PowerPoint (.pptx หรือ .ppt) ที่ตารางอ้างอิง</label>
            <span id="schedule-powerpoint-help" className="text-[var(--fg-secondary)]">แนบไฟล์ต้นฉบับแล้วตรวจอีกครั้ง ไฟล์ .ppt ต้องใช้ Desktop ที่ติดตั้ง LibreOffice Impress</span>
            <input id="schedule-powerpoint" type="file" className="input-field min-w-0" accept=".pptx,.ppt" multiple disabled={Boolean(busy || libraryBusy)} aria-describedby="schedule-powerpoint-help"
              onChange={(event) => {
                setSupplemental(Array.from(event.target.files ?? []))
                setCues(null)
                setResult(null)
                setError('')
              }} />
          </div>
        )}
        {showMediaField && (
          <div className="mt-3! flex min-w-0 flex-col gap-2 text-sm">
            <label htmlFor="schedule-media-attachments">ไฟล์ภาพ วิดีโอ หรือเสียงที่ขาด</label>
            <span id="schedule-media-help" className="text-[var(--fg-secondary)]">แนบสื่อของตารางหรือไฟล์เสียงและวิดีโอที่ PowerPoint ลิงก์ไว้ แล้วตรวจอีกครั้ง</span>
            <input type="file" id="schedule-media-attachments" className="input-field min-w-0" aria-describedby="schedule-media-help" multiple
              accept={`image/*,video/*,audio/*,.m4v,.mov,.opus${canConvertLegacyVideo() ? ',.wmv,.avi,.mpg,.mpeg' : ''}`}
              disabled={Boolean(busy || libraryBusy)}
              onChange={(event) => {
                setMediaFiles(Array.from(event.target.files ?? []))
                setCues(null)
                setResult(null)
                setError('')
              }} />
          </div>
        )}
        {file && <div className="mt-3!">
          <EasyWorshipExternalMediaFolder files={externalFolder} disabled={Boolean(busy || libraryBusy)} onChange={(files) => {
            setExternalFolder(files)
            setCues(null)
            setResult(null)
            setError('')
          }} />
        </div>}
        {file && /\.ewsx$/i.test(file.name) && (
          <div className="mt-3! flex min-w-0 flex-col gap-2 text-sm">
            <label htmlFor="schedule-bibles">แนบฉบับพระคัมภีร์ .ewb</label>
            <span id="schedule-bibles-help" className="text-[var(--fg-secondary)]">ใช้เติมข้อที่ขาดในตารางนี้</span>
            <input ref={bibleInput} id="schedule-bibles" type="file" className="input-field min-w-0" accept=".ewb"
              multiple disabled={Boolean(busy || libraryBusy)} aria-describedby="schedule-bibles-help"
              onChange={(event) => changeBibleFiles(Array.from(event.target.files ?? []))} />
            {bibleFiles.length > 0 && (
              <button type="button" className="btn-ghost self-start" disabled={Boolean(busy || libraryBusy)}
                onClick={() => changeBibleFiles([])}>นำไฟล์ .ewb ที่แนบออก</button>
            )}
          </div>
        )}
        <button type="submit" className="btn-primary mt-4" disabled={Boolean(busy || libraryBusy)}>ตรวจรายการนำเข้า</button>
        {busy === 'reading' && <p role="status" className="mt-3 text-sm">กำลังอ่านไฟล์…</p>}
        {hasReadError && <p id="schedule-file-error" role="alert" className="mt-3 text-sm text-[var(--status-error-text)]">{error}</p>}
      </form>

      {cues && (
        <section className={panel} aria-labelledby="schedule-preview">
          <h2 id="schedule-preview" className="text-lg font-medium">รายการตามลำดับเดิม</h2>
          <p role="status" className="mt-1 text-sm text-[var(--fg-secondary)]">อ่านได้ {cues.length} รายการ</p>
          {bibles?.matched.length ? (
            <p role="status" className="mt-1 text-sm wrap-anywhere">จับคู่ฉบับที่แนบ {bibles.matched.join(', ')}</p>
          ) : null}
          {bibles?.warnings.length ? (
            <ul className="mt-2! list-disc space-y-1 pl-5 text-sm wrap-anywhere">
              {bibles.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          ) : null}
          {media && media.attachments.size > media.libraryMatches && (
            <p role="status" className="mt-1 text-sm">จับคู่ไฟล์สื่อที่แนบได้ {media.attachments.size - media.libraryMatches} ไฟล์</p>
          )}
          {media && media.libraryMatches > 0 && (
            <p role="status" className="mt-1 text-sm">พบไฟล์ตรงกับต้นฉบับในคลังสื่อ {media.libraryMatches} ไฟล์</p>
          )}
          {media?.unresolved.length ? (
            <details className="mt-3! text-sm">
              <summary className="cursor-pointer">สื่อที่ยังขาด {media.unresolved.length} ไฟล์</summary>
              <ul className="mt-2! list-disc space-y-1 pl-5 wrap-anywhere">
                {media.unresolved.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </details>
          ) : null}
          {cues.length === 0 && <p className="mt-3">ไฟล์นี้ไม่มีรายการนำเสนอ</p>}
          <ol className="mt-3 max-h-96 divide-y divide-[var(--border-subtle)] overflow-y-auto">
            {cues.map((cue, index) => (
              <li key={cue.sourceId} className="py-2">
                <details>
                  <summary className="cursor-pointer wrap-break-word"><span className="font-medium">{index + 1}. {cue.label}</span>
                    <span className="ml-2 text-xs text-[var(--fg-secondary)]">{CUE_LABELS[cue.kind]} · {cue.slides.length} สไลด์</span>
                  </summary>
                  <div className="ml-5 py-2 text-sm text-[var(--fg-secondary)]">
                    {cue.warnings?.map((warning) => <p className="wrap-break-word" key={warning}>{warning}</p>)}
                    <ol className="mt-2 space-y-2">
                      {cue.slides.map((slide) => (
                        <li key={slide.sourceId} className="rounded-md bg-[var(--bg-tertiary)] p-3">
                          <p className="font-medium text-[var(--fg-primary)]">{slide.label}</p>
                          {slide.lines.length > 0 && <p className="whitespace-pre-wrap wrap-break-word">{slide.lines.join('\n')}</p>}
                          {slide.assets?.map((asset, position) => <p key={position} className="wrap-break-word">
                            {asset.filename}{asset.deviceHints?.length ? ` · ${asset.deviceHints.join(', ')}` : ''}
                          </p>)}
                        </li>
                      ))}
                    </ol>
                  </div>
                </details>
              </li>
            ))}
          </ol>
        </section>
      )}

      {file && source && cues?.some((cue) => cue.kind === 'song') && (
        <EasyWorshipScheduleSongs key={source.ids.sourceId} cues={media?.cues ?? rawCues} source={{ file, packedMedia: source.packedMedia, attachments: media?.attachments }}
          disabled={Boolean(busy)} onBusyChange={setLibraryBusy} />
      )}

      {Boolean(cues?.length) && (
        <form className={panel} onSubmit={(event) => {
          event.preventDefault()
          if (result?.repairNamespace) void repairAppendedSchedule(result.repairNamespace)
          else if (!choosingRepair) void importSchedule()
        }}>
          {appendMode ? <p>เพิ่มต่อท้าย <strong>{destination.playlist?.name ?? 'เพลย์ลิสต์ปลายทาง'}</strong></p> : <label className="flex flex-col gap-2">
            <span className="font-medium">ชื่อเพลย์ลิสต์</span>
            <input type="text" value={name} disabled={Boolean(busy || libraryBusy || result)} required className="input-field"
              onChange={(event) => setName(event.target.value)} />
          </label>}
          {!appendMode && <p className="mt-3 text-sm text-[var(--fg-secondary)]">หากใช้ไฟล์ตารางและไฟล์แนบชุดเดิม ระบบจะเติมข้อมูลที่ขาดในเพลย์ลิสต์ที่เคยนำเข้า รวมถึงค่าการเล่นสื่อ เอฟเฟ็กต์ และเวลาเลื่อนสไลด์</p>}
          {repairBatches.length > 0 && (!result || (result.repairNamespace && !result.missing && !result.mediaError)) && (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="flex min-w-0 flex-col gap-2 text-sm">
                <label htmlFor="easyworship-repair-batch">ชุดที่เพิ่มไว้แล้ว</label>
                <select id="easyworship-repair-batch" value={repairSelection} className="input-field" disabled={Boolean(busy || libraryBusy)}
                  onChange={(event) => setRepairSelection(event.target.value)}>
                  <option value="">เลือกชุดที่จะกู้</option>
                  {repairBatches.map(({ namespace, firstOrder, entries }) => (
                    <option value={namespace} key={namespace}>เริ่มที่ลำดับ {firstOrder + 1} · {entries} รายการ</option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn-primary" disabled={Boolean(busy || libraryBusy) || !repairSelection || !destination.playlist}
                onClick={() => void repairAppendedSchedule(repairSelection)}>{repairLabel}</button>
            </div>
          )}
          {(!result || result.missing > 0 || result.mediaError) && (
            <button type={choosingRepair ? 'button' : 'submit'} onClick={choosingRepair ? () => void importSchedule() : undefined}
              disabled={Boolean(busy || libraryBusy) || (appendMode ? !destination.playlist : !name.trim())}
              className={`${choosingRepair ? 'btn-secondary' : 'btn-primary'} mt-4`}>
              {result ? 'ลองบันทึกสื่ออีกครั้ง' : appendMode ? 'เพิ่มต่อท้ายเพลย์ลิสต์' : 'บันทึกเพลย์ลิสต์'}
            </button>
          )}
          {legacyVideos.size > 0 && <p className="mt-3 text-sm text-[var(--fg-secondary)]">{canConvertLegacyVideo()
            ? `Desktop จะแปลงวิดีโอรุ่นเก่า ${legacyVideos.size} ไฟล์เป็น MP4 เมื่อบันทึก`
            : `เปิดไฟล์ตารางนี้ใน WorshipTeam Desktop เพื่อแปลงวิดีโอรุ่นเก่า ${legacyVideos.size} ไฟล์`}</p>}
          {busy === 'saving' && <p role="status" className="mt-3 text-sm">กำลังบันทึกตารางและสื่อ…</p>}
          {error && <p role="alert" className="mt-3 text-sm text-[var(--status-error-text)]">{error}</p>}
          {result && (
            <div className="mt-4 flex flex-col items-start gap-3">
              <p role="status">{result.repairNamespace ? 'ใช้ตารางชุดเดิม' : result.appendedEntries !== undefined
                ? result.status === 'saved' ? `เพิ่มต่อท้ายแล้ว ${result.appendedEntries} รายการ` : 'เพลย์ลิสต์นี้เคยเพิ่มตารางชุดนี้แล้ว'
                : resultLabel[result.status]}{result.saved > 0 && ` · เก็บสื่อในเบราว์เซอร์นี้ ${result.saved} ไฟล์`}</p>
              {result.restoredSongLabels ? <p role="status" className="text-sm">คืนป้ายชื่อท่อนเพลง {result.restoredSongLabels} สไลด์</p> : null}
              {result.restoredFormatting ? <p role="status" className="text-sm">คืนรูปแบบข้อความ {result.restoredFormatting} สไลด์</p> : null}
              {result.restoredSlidePlayback ? <p role="status" className="text-sm">คืนเอฟเฟ็กต์หรือเวลาเลื่อน {result.restoredSlidePlayback} สไลด์</p> : null}
              {result.restoredMediaPlayback ? <p role="status" className="text-sm">คืนค่าการเล่นสื่อ {result.restoredMediaPlayback} สไลด์</p> : null}
              {result.restoredScripture ? <p role="status" className="text-sm">เติมข้อพระคัมภีร์ {result.restoredScripture} สไลด์</p> : null}
              {result.restoredFeedVideo ? <p role="status" className="text-sm">คืนการตั้งค่าภาพ {result.restoredFeedVideo} สัญญาณสด</p> : null}
              {result.restoredMasterBackgrounds ? <p role="status" className="text-sm">คืนพื้นหลังจากแม่แบบ {result.restoredMasterBackgrounds} เลเยอร์</p> : null}
              {result.restoredMasterSoundtracks ? <p role="status" className="text-sm">คืนเสียงประกอบจากแม่แบบ {result.restoredMasterSoundtracks} สไลด์</p> : null}
              {result.restoredElementBorders ? <p role="status" className="text-sm">คืนค่าเส้นขอบ {result.restoredElementBorders} เลเยอร์</p> : null}
              {result.restoredElementShadows ? <p role="status" className="text-sm">คืนค่าเงา {result.restoredElementShadows} เลเยอร์</p> : null}
              {result.restoredElementReflections ? <p role="status" className="text-sm">คืนค่าเงาสะท้อน {result.restoredElementReflections} เลเยอร์</p> : null}
              {result.restoredShapeMasks ? <p role="status" className="text-sm">คืนรูปทรง {result.restoredShapeMasks} เลเยอร์</p> : null}
              {result.restoredLayerRotations ? <p role="status" className="text-sm">คืนมุมหมุน {result.restoredLayerRotations} เลเยอร์</p> : null}
              {result.linkedSongs ? <p role="status" className="text-sm">เชื่อมเพลงกับคลัง {result.linkedSongs} รายการ</p> : null}
              {result.ambiguousSongs ? <p role="status" className="text-sm">พบเพลงรหัสเดียวกันหลายฉบับ {result.ambiguousSongs} รายการ ตรวจฉบับเพลงจากเพลย์ลิสต์ได้</p> : null}
              {result.linkedPresentations ? <p role="status" className="text-sm">เชื่อมงานนำเสนอกับคลัง {result.linkedPresentations} รายการ</p> : null}
              {result.ambiguousPresentations ? <p role="status" className="text-sm">พบงานนำเสนอหลายฉบับที่ตรงกัน {result.ambiguousPresentations} รายการ ตรวจฉบับงานนำเสนอจากเพลย์ลิสต์ได้</p> : null}
              {result.restoredDecks ? <p role="status" className="text-sm">คืนสไลด์ PowerPoint {result.restoredDecks} ไฟล์</p> : null}
              {result.restoredPowerPoints ? <p role="status" className="text-sm">กู้ PowerPoint ในเพลย์ลิสต์เดิม {result.restoredPowerPoints} รายการ</p> : null}
              {result.keptPowerPoints ? <p role="status" className="text-sm">{result.repairNamespace ? 'คง PowerPoint เดิมไว้' : 'เก็บ PowerPoint ที่แก้ไว้'} {result.keptPowerPoints} รายการ</p> : null}
              {result.restoredMedia ? <p role="status" className="text-sm">กู้สื่อในเพลย์ลิสต์เดิม {result.restoredMedia} รายการ</p> : null}
              {result.mediaError && <p role="alert" className="text-sm text-[var(--status-error-text)]">เก็บสื่อในเบราว์เซอร์นี้ไม่สำเร็จ ลองบันทึกสื่ออีกครั้ง</p>}
              {result.missing > 0 && <p role="alert" className="text-sm text-[var(--status-error-text)]">เก็บสื่อไม่สำเร็จ {result.missing} ไฟล์</p>}
              {!!result.videoErrors?.length && <ul className="text-sm text-[var(--status-error-text)]">
                {result.videoErrors.map((message) => <li className="wrap-anywhere" key={message}>{message}</li>)}
              </ul>}
              <div className="flex flex-wrap gap-2">
                <Link to={`/playlists/${result.playlistId}`} className="btn-secondary">เปิดเพลย์ลิสต์</Link>
                {appendMode && !result.missing && !result.mediaError && (
                  <button type="button" disabled={Boolean(busy || libraryBusy)} className="btn-secondary" onClick={() => void importSchedule(true)}>เพิ่มชุดนี้อีกครั้ง</button>
                )}
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  )
}
