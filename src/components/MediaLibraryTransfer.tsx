/** Lets operators export and review a package of browser-local presentation resources. */

import { useState, type ChangeEvent } from 'react'
import { themeOutputs, themeSubjects, themeOutputLabels, themeSubjectLabels } from '../utils/defaultThemes'
import { outputLabels, outputNames } from '../utils/outputSettings'
import { nurseryOutputs } from '../utils/nurseryAlerts'
import { visibleLibraryMedia } from '../utils/mediaLibrary'
import type { MediaLibraryPackage } from '../utils/mediaLibraryPackageManifest'

const extension = '.wtlibrary'

type Review = { file: File; manifest: MediaLibraryPackage; unavailableThemeMedia: string[] }
type SavePicker = (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle>

export function MediaLibraryTransfer({ onImported, startWithCatalog = false }: { onImported: () => Promise<void>; startWithCatalog?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState<Review>()
  const [includeCatalog, setIncludeCatalog] = useState(startWithCatalog)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [unavailable, setUnavailable] = useState<string[]>([])
  const [unavailableThemeMedia, setUnavailableThemeMedia] = useState<string[]>([])
  const [unavailableCatalogMedia, setUnavailableCatalogMedia] = useState<string[]>([])
  const savePicker = (window as Window & { showSaveFilePicker?: SavePicker }).showSaveFilePicker

  function start(message: string) {
    setBusy(true)
    setStatus(message)
    setError('')
    setUnavailable([])
    setUnavailableThemeMedia([])
    setUnavailableCatalogMedia([])
  }

  async function exportBackup(direct: boolean) {
    if (busy || (direct && !savePicker)) return
    const filename = `WorshipTeam-${includeCatalog ? 'profile' : 'library'}-${new Date().toISOString().slice(0, 10)}${extension}`
    start(direct ? 'เลือกตำแหน่งบันทึกแพ็กเกจคลังสื่อ…' : 'กำลังเตรียมคลังสื่อ…')
    try {
      // The picker must open during the click, before loading or reading the library.
      const handle = direct ? await savePicker?.call(window, {
        suggestedName: filename,
        types: [{ description: 'WorshipTeam media library', accept: { 'application/zip': [extension] } }],
      }).catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return undefined
        throw cause
      }) : undefined
      if (direct && !handle) {
        setStatus('')
        return
      }
      setStatus(includeCatalog ? 'กำลังอ่านเพลง สไลด์ และเพลย์ลิสต์…' : 'กำลังเตรียมคลังสื่อ…')
      const { exportMediaLibraryPackage, saveMediaLibraryPackageTo } = await import('../utils/mediaLibraryPackage')
      const catalog = includeCatalog ? await (await import('../hooks/useLibraryCatalogBackup')).readLibraryCatalog() : undefined
      const showProgress = (done: number, total: number) => setStatus(`กำลังแพ็กไฟล์ ${done}/${total}`)
      if (handle) {
        const backup = await saveMediaLibraryPackageTo(handle, showProgress, catalog)
        setUnavailable(backup.unavailableVideos)
        setUnavailableThemeMedia(backup.unavailableThemeMedia)
        setUnavailableCatalogMedia(backup.unavailableCatalogMedia)
        setStatus('บันทึกแพ็กเกจคลังสื่อลงดิสก์แล้ว')
        return
      }
      const backup = await exportMediaLibraryPackage(showProgress, catalog)
      const link = document.createElement('a')
      const url = URL.createObjectURL(backup.file)
      link.href = url
      link.download = filename
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setUnavailable(backup.unavailableVideos)
      setUnavailableThemeMedia(backup.unavailableThemeMedia)
      setUnavailableCatalogMedia(backup.unavailableCatalogMedia)
      setStatus('เริ่มดาวน์โหลดแพ็กเกจคลังสื่อแล้ว')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ส่งออกคลังสื่อไม่สำเร็จ')
      setStatus('')
    } finally { setBusy(false) }
  }

  async function read(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file || busy) return
    setReview(undefined)
    start('กำลังตรวจแพ็กเกจคลังสื่อ…')
    try {
      const { reviewMediaLibraryPackage } = await import('../utils/mediaLibraryPackage')
      const { missingDefaultThemeMedia } = await import('../utils/mediaLibraryPackageManifest')
      const manifest = await reviewMediaLibraryPackage(file)
      setReview({ file, manifest, unavailableThemeMedia: missingDefaultThemeMedia(manifest) })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เปิดแพ็กเกจคลังสื่อไม่สำเร็จ')
    } finally { setBusy(false); setStatus('') }
  }

  async function restore() {
    if (!review || busy) return
    start('กำลังเรียกคืนคลังสื่อ…')
    let progress = ''
    try {
      const { importMediaLibraryPackage } = await import('../utils/mediaLibraryPackage')
      const result = await importMediaLibraryPackage(review.file, (done, total) => {
        progress = `ตรวจและเรียกคืนไฟล์ ${done}/${total}`
        setStatus(progress)
      })
      let catalogResult: Awaited<ReturnType<typeof import('../hooks/useLibraryCatalogBackup').restoreLibraryCatalog>> | undefined
      if (result.catalog) {
        progress = 'เรียกคืนสื่อและการตั้งค่าจากแพ็กเกจแล้ว'
        setStatus('กำลังเรียกคืนเพลง สไลด์ และเพลย์ลิสต์…')
        const { restoreLibraryCatalog } = await import('../hooks/useLibraryCatalogBackup')
        catalogResult = await restoreLibraryCatalog(result.catalog)
      }
      setReview(undefined)
      setUnavailableCatalogMedia(review.manifest.catalog?.missingMedia ?? [])
      setStatus([catalogResult ? 'เรียกคืนฐานข้อมูลและคลังสื่อแล้ว' : 'เรียกคืนคลังสื่อแล้ว',
        ...(catalogResult ? [`เพลงใหม่ ${catalogResult.songs}`, `งานนำเสนอและธีมใหม่ ${catalogResult.designs}`,
          `เพลย์ลิสต์ใหม่ ${catalogResult.playlists}`, `รายการในเพลย์ลิสต์ใหม่ ${catalogResult.entries}`, `พื้นหลังจาก URL ใหม่ ${catalogResult.backgrounds}`] : []),
        `สื่อใหม่ ${result.visibleItems}`, `ไฟล์ในตารางใหม่ ${result.attachments}`,
        `สัญญาณสดใหม่ ${result.feeds}`, `คลิป DVD ใหม่ ${result.dvds}`,
        ...(review.manifest.scriptureEditions?.length ? [`พระคัมภีร์ใหม่ ${result.scriptureEditions} ฉบับ`] : []),
        ...(review.manifest.alertTemplates?.length ? [`ข้อความแจ้งเตือนใหม่ ${result.alertTemplates}`] : []),
        ...(review.manifest.alertResourceCatalogs?.length ? [`คลังโทเค็นและเวลานมัสการใหม่ ${result.alertResourceCatalogs} ชุด`] : []),
        ...(review.manifest.songHistories?.length ? [`ประวัติ EasyWorship ใหม่ ${result.songHistories} ชุด`, `กิจกรรมเพลงใหม่ ${result.songHistoryEvents}`] : []),
        ...(review.manifest.defaultThemes && Object.keys(review.manifest.defaultThemes).length ? [`ตั้งธีมเริ่มต้นเพิ่ม ${result.defaultThemes} ตำแหน่ง`] : []),
        ...(review.manifest.presentationControls && Object.keys(review.manifest.presentationControls).length
          ? [`ชุดปุ่มลัดและ MIDI ที่เรียกคืน ${result.presentationControls}`] : []),
        ...(review.manifest.outputAppearance && Object.keys(review.manifest.outputAppearance).length ? [`ค่าจอที่เรียกคืน ${result.outputAppearance} ชุด`] : []),
        ...(review.manifest.nurserySettings ? [`ค่าการเรียกผู้ปกครองที่เรียกคืน ${result.nurserySettings} จอ`] : []),
        ...(review.manifest.messageAlertSettings ? [`ค่าเริ่มต้นข้อความแจ้งเตือนที่เรียกคืน ${result.messageAlertSettings} จอ`] : []),
        `ชุดกลุ่มที่อัปเดต ${result.collectionSets}`].join(' · '))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เรียกคืนคลังสื่อไม่สำเร็จ')
      setStatus(progress)
    } finally {
      await onImported().catch(() => setError((previous) => previous || 'อ่านคลังหลังเรียกคืนไม่ได้ กรุณาเปิดคลังใหม่'))
      setBusy(false)
    }
  }

  const themeRows = themeOutputs.flatMap((output) => themeSubjects.flatMap((subject) => {
    const slot = `${output}:${subject}` as const
    const theme = review?.manifest.defaultThemes?.[slot]
    return theme === undefined ? [] : [{ slot, output, subject, title: theme?.title ?? 'ใช้ค่าปกติ' }]
  }))
  const missingThemeMedia = review?.unavailableThemeMedia ?? unavailableThemeMedia
  const catalog = review?.manifest.catalog
  const missingCatalogMedia = catalog?.missingMedia ?? unavailableCatalogMedia
  const controls = review?.manifest.presentationControls
  const appearance = review?.manifest.outputAppearance
  const nursery = review?.manifest.nurserySettings
  return (
    <details className="surface min-w-0 p-4!" open={startWithCatalog || undefined}>
      <summary className="cursor-pointer font-medium">ย้ายคลังสื่อไปอีกเครื่อง</summary>
      <div className="mt-3! grid gap-3 text-sm">
        <p>แพ็กเกจเก็บคลังสื่อ ไฟล์แนบในตาราง สัญญาณสด คลิป DVD พระคัมภีร์ ข้อความแจ้งเตือน ประวัติการใช้เพลง กลุ่ม ค่าจอ ธีมเริ่มต้น และชุดปุ่มลัดกับ MIDI จากเบราว์เซอร์นี้</p>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={includeCatalog} disabled={busy} onChange={(event) => setIncludeCatalog(event.target.checked)} />
          รวมฐานข้อมูลเพลง งานนำเสนอ ธีม และเพลย์ลิสต์จากโปรเจกต์นี้
        </label>
        <div className="flex flex-wrap items-start gap-3">
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void exportBackup(false)}>
            {includeCatalog ? 'ดาวน์โหลดแพ็กเกจฐานข้อมูลและคลังสื่อ' : 'ดาวน์โหลดแพ็กเกจคลังสื่อ'}
          </button>
          {savePicker && <button type="button" className="btn-secondary" disabled={busy} onClick={() => void exportBackup(true)}>บันทึกแพ็กเกจลงดิสก์</button>}
          <label className="flex min-w-0 flex-col gap-1">เปิดแพ็กเกจ .wtlibrary
            <input type="file" className="input-field w-full min-w-0" accept={extension} disabled={busy} onChange={(event) => void read(event)} />
          </label>
        </div>
        {review && <div className="grid min-w-0 gap-2 rounded-lg border border-[var(--border-subtle)] p-3!">
          <p className="font-medium wrap-anywhere">{review.file.name}</p>
          {catalog && <p>เพลง {catalog.songs} · งานนำเสนอและธีม {catalog.designs} · เพลย์ลิสต์ {catalog.playlists} · รายการในเพลย์ลิสต์ {catalog.entries} · พื้นหลังจาก URL {catalog.backgrounds}</p>}
          <p>ไฟล์สื่อ {review.manifest.assets.length} · รายการคลังสื่อ {visibleLibraryMedia(review.manifest.items).length} · ไฟล์แนบ {review.manifest.scheduleAssets.length} · สัญญาณสด {review.manifest.feeds.length} · คลิป DVD {review.manifest.dvds.length} · ชุดกลุ่ม {review.manifest.collectionSets.length}</p>
          {Boolean(review.manifest.scriptureEditions?.length) && <details>
            <summary>พระคัมภีร์ {review.manifest.scriptureEditions?.length} ฉบับ</summary>
            <ul className="list-disc pl-5 wrap-anywhere">{review.manifest.scriptureEditions?.map(({ id, name, abbreviation }) => (
              <li key={id}>{name} ({abbreviation})</li>
            ))}</ul>
          </details>}
          {Boolean(review.manifest.alertTemplates?.length) && <details>
            <summary>ข้อความแจ้งเตือน {review.manifest.alertTemplates?.length} รายการ</summary>
            <ul className="list-disc pl-5 wrap-anywhere">{review.manifest.alertTemplates?.map(({ id, title }) => <li key={id}>{title}</li>)}</ul>
          </details>}
          {Boolean(review.manifest.alertResourceCatalogs?.length) && <details>
            <summary>คลังโทเค็นและเวลานมัสการ {review.manifest.alertResourceCatalogs?.length} ชุด</summary>
            <ul className="list-disc wrap-anywhere pl-5">{review.manifest.alertResourceCatalogs?.map(({ id, sourceName }) => <li key={id}>{sourceName}</li>)}</ul>
          </details>}
          {Boolean(review.manifest.songHistories?.length) && <details>
            <summary>ประวัติการใช้เพลง {review.manifest.songHistories?.length} ชุด</summary>
            <ul className="list-disc pl-5 wrap-anywhere">{review.manifest.songHistories?.map(({ id, name, actions }) => (
              <li key={id}>{name} · {actions} เหตุการณ์</li>
            ))}</ul>
          </details>}
          {themeRows.length > 0 && <details>
            <summary>ธีมเริ่มต้นของจอ {themeRows.length} ตำแหน่ง</summary>
            <ul className="list-disc pl-5 wrap-anywhere">{themeRows.map(({ slot, output, subject, title }) => (
              <li key={slot}>{themeOutputLabels[output]} · {themeSubjectLabels[subject]} · {title}</li>
            ))}</ul>
          </details>}
          {controls && Object.keys(controls).length > 0 && <details>
            <summary>ปุ่มลัดและ MIDI {Object.keys(controls).length} ชุด</summary>
            <ul className="list-disc pl-5 wrap-anywhere">
              {controls.keyboard !== undefined && <li>ปุ่มลัด · {controls.keyboard?.name ?? 'ใช้ปุ่มลัดปกติ'}</li>}
              {controls.midiInput && <li>MIDI ขาเข้า · {Object.keys(controls.midiInput.bindings).length} คำสั่ง · ช่อง {controls.midiInput.channel ?? 'ทั้งหมด'}</li>}
              {controls.midiOutput && <li>MIDI ขาออก · {Object.keys(controls.midiOutput.notes).length} คำสั่ง · ช่อง {controls.midiOutput.channel}</li>}
            </ul>
          </details>}
          {appearance && Object.keys(appearance).length > 0 && <details>
            <summary>ค่าจอ {Object.keys(appearance).length} ชุด</summary>
            <ul className="list-disc pl-5 wrap-anywhere">
              {outputNames.map((output) => {
                const margin = appearance[output]
                return margin && <li key={output}>{outputLabels[output]} · บน {margin.top} ขวา {margin.right} ล่าง {margin.bottom} ซ้าย {margin.left} พิกเซล</li>
              })}
              {appearance.alternateLayers && <li>จอถ่ายทอดสด · พื้นหลัง {appearance.alternateLayers.background ? 'เปิด' : 'ปิด'} · สื่อด้านหน้า {appearance.alternateLayers.foreground ? 'เปิด' : 'ปิด'}</li>}
              {appearance.foldback && <li>จอเวที · รายการถัดไปและนาฬิกา</li>}
              {appearance.foldbackService && <li>จอเวที · เวลานับถอยหลัง {appearance.foldbackService.intervals?.length ?? 0} ช่วง</li>}
              {appearance.foldbackContent && <li>จอเวที · รูปแบบข้อความหลัก</li>}
            </ul>
          </details>}
          {review.manifest.messageAlertSettings && <p>ค่าเริ่มต้นข้อความแจ้งเตือน {Object.keys(review.manifest.messageAlertSettings).length} จอ</p>}
          {nursery && <details>
            <summary>ค่าการเรียกผู้ปกครอง {Object.keys(nursery).length} จอ</summary>
            <ul className="list-disc pl-5">{nurseryOutputs.map((output) => {
              const style = nursery[output]
              return style && <li key={output}>{outputLabels[output]} · {style.enabled ? 'เปิด' : 'ปิด'}</li>
            })}</ul>
          </details>}
          <p className="text-[var(--fg-secondary)]">เก็บรายการที่แก้ไว้ในเครื่องปลายทางเมื่อมีรหัสซ้ำ ตั้งค่ากล้องและอุปกรณ์สัญญาณสดในเครื่องปลายทางได้จากคลังสื่อ</p>
          <button type="button" className="btn-primary justify-self-start" disabled={busy} onClick={() => void restore()}>
            {catalog ? 'เรียกคืนฐานข้อมูลและคลังสื่อ' : 'เรียกคืนคลังสื่อ'}
          </button>
        </div>}
        {status && <p role="status" className="wrap-anywhere">{status}</p>}
        {error && <p role="alert" className="wrap-anywhere text-[var(--status-error-text)]">{error}</p>}
        {unavailable.length > 0 && <details className="min-w-0">
          <summary>ไม่พบวิดีโอที่จับคู่กับคลิป DVD {unavailable.length} รายการ</summary>
          <ul className="mt-1! list-disc pl-5 wrap-anywhere">{unavailable.map((name, index) => <li key={index}>{name}</li>)}</ul>
        </details>}
        {missingThemeMedia.length > 0 && <details className="min-w-0">
          <summary>ไฟล์สื่อของธีมที่ไม่อยู่ในแพ็กเกจ {missingThemeMedia.length} ไฟล์</summary>
          <ul className="mt-1! list-disc pl-5 wrap-anywhere">{missingThemeMedia.map((name) => <li key={name}>{name}</li>)}</ul>
        </details>}
        {missingCatalogMedia.length > 0 && <details className="min-w-0">
          <summary>ไฟล์ที่ฐานข้อมูลอ้างถึงแต่ไม่มีในแพ็กเกจ {missingCatalogMedia.length} ไฟล์</summary>
          <ul className="mt-1! list-disc pl-5 wrap-anywhere">{missingCatalogMedia.map((name) => <li key={name}>{name}</li>)}</ul>
        </details>}
      </div>
    </details>
  )
}
