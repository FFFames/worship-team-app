/** Reviews and migrates the catalogs of one EasyWorship profile. */

import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { EasyWorshipProfileSelection, type ProfileChoice } from '../components/EasyWorshipProfileSelection'
import { EasyWorshipLegacyEncoding } from '../components/EasyWorshipLegacyEncoding'
import { EasyWorshipExternalMediaFolder } from '../components/EasyWorshipExternalMediaFolder'
import { PresentationKeyboardControl } from '../components/PresentationKeyboardControl'
import { useEasyWorshipProfileImport } from '../hooks/useEasyWorshipProfileImport'
import type { reviewEasyWorshipProfile } from '../utils/easyWorshipProfile'
import type { EasyWorshipProfileFiles } from '../utils/easyWorshipProfileFiles'
import type { LegacySongEncoding } from '../utils/easyWorshipEncoding'
import type { ProfileImportProgress, ProfileImportResult, ProfileImportSelection } from '../utils/easyWorshipProfileImport'
import { easyWorshipProfileReportCsv } from '../utils/easyWorshipProfileReport'
import { easyWorshipLyricsRecoveryNotice } from '../utils/easyWorship'
import { canConvertLegacyVideo } from '../utils/legacyVideo'
import { CUE_LABELS } from '../utils/playlistCues'
import { DESIGN_KIND_LABELS } from '../utils/slideDesign'
import { readKeyboardProfile } from '../utils/presentationKeyboard'
import { alertOutputLabels } from '../types/alertTemplate'
import { nurseryPositionLabels } from '../utils/nurseryAlerts'
import { foldbackContentLabels, foldbackContentRoles, foldbackContentSourceId } from '../utils/foldbackAppearance'
import { outputLabels, scriptureReferenceInsetOptions, scriptureReferenceLabels } from '../utils/outputSettings'
import { themeOutputLabels, themeSubjectLabels, type ThemeOutput, type DefaultThemeSubject } from '../utils/defaultThemes'

type Inspection = Awaited<ReturnType<typeof reviewEasyWorshipProfile>>
type Review = NonNullable<Inspection['review']>
type Category = keyof ProfileImportSelection

const groups: { key: Category; title: string; href: string }[] = [
  { key: 'songs', title: 'เพลง', href: '/' },
  { key: 'collections', title: 'กลุ่มจาก EasyWorship', href: '/#song-collections' },
  { key: 'songHistory', title: 'ประวัติการใช้เพลง', href: '/songs/history' },
  { key: 'alerts', title: 'ข้อความแจ้งเตือน', href: '/alerts' },
  { key: 'alertCatalog', title: 'คลังโทเค็นและเวลานมัสการ', href: '/alerts' },
  { key: 'messageStyles', title: 'ค่าเริ่มต้นข้อความแจ้งเตือน', href: '/alerts#message-alert-settings' },
  { key: 'foldbackAppearance', title: 'ตัวอย่างถัดไปและนาฬิกาบนจอเวที', href: '/settings/output#foldback-appearance' },
  { key: 'foldbackService', title: 'เวลานับถอยหลังบนจอเวที', href: '/settings/output#foldback-service' },
  { key: 'foldbackContent', title: 'รูปแบบข้อความหลักบนจอเวที', href: '/settings/output#foldback-content' },
  { key: 'scriptureOutputs', title: 'การแสดงข้อพระคัมภีร์', href: '/settings/output#scripture-output' },
  { key: 'nursery', title: 'การเรียกผู้ปกครอง', href: '/alerts#nursery-settings' },
  { key: 'defaultThemes', title: 'ธีมเริ่มต้นของจอ', href: '/settings/themes' },
  { key: 'media', title: 'สื่อ', href: '/media' },
  { key: 'feeds', title: 'สัญญาณสด', href: '/media?type=feeds' },
  { key: 'dvds', title: 'คลิป DVD', href: '/media?type=dvd' },
  { key: 'designs', title: 'งานนำเสนอและธีม', href: '/designs' },
  { key: 'powerPoints', title: 'PowerPoint', href: '/designs' },
  { key: 'bibles', title: 'ฉบับพระคัมภีร์', href: '/scripture' },
  { key: 'schedules', title: 'ตารางนมัสการ', href: '/playlists' },
]

const panel = 'surface min-w-0 rounded-xl p-4! sm:p-6!'
const errorStyle = 'text-sm wrap-anywhere text-[var(--status-error-text)]'

function emptySelection(): ProfileImportSelection {
  return {
    songs: new Set(), collections: new Set(), songHistory: new Set(), alerts: new Set(), alertCatalog: new Set(),
    nursery: new Set(), messageStyles: new Set(), defaultThemes: new Set(), foldbackAppearance: new Set(), foldbackService: new Set(), foldbackContent: new Set(),
    scriptureOutputs: new Set(),
    media: new Set(), feeds: new Set(), dvds: new Set(), designs: new Set(), powerPoints: new Set(), bibles: new Set(), schedules: new Set(),
  }
}

function profileChoices(review?: Review): Record<Category, ProfileChoice[]> {
  return {
    songs: [
      ...(review?.songs?.songs.map((song) => ({
        id: song.sourceId,
        title: song.title,
        detail: [
          review?.songs?.recoveredLyricsOnly && 'ชื่อชั่วคราวจากเนื้อร้อง', song.author, `${song.sections.length} ท่อน`, song.ccli && `CCLI ${song.ccli}`,
          song.administrator && `ดูแลลิขสิทธิ์โดย ${song.administrator}`,
          song.tags?.length ? `แท็กเพลง · ${song.tags.join(' · ')}` : undefined,
          song.description,
          song.appearance?.sections?.length ? `รูปแบบต้นทาง ${song.appearance.sections.length} ท่อน`
            : song.appearance?.defaultDesign && 'รูปแบบเฉพาะเพลง',
        ].filter(Boolean).join(' · '),
        warning: song.appearance?.warnings?.join(' · '),
      })) ?? []),
      ...(review?.songs?.skipped.map((song) => ({
        id: `skipped:${song.sourceId}`, title: song.title, warning: song.reason, disabled: true,
      })) ?? []),
    ],
    collections: review?.collections ? [{
      id: review.collections.id,
      title: review.collections.filename,
      detail: `${review.collections.collections.length} โฟลเดอร์และกลุ่ม · ${review.collections.collections.filter((node) => node.nativeType === 1 && node.resource === 'songs').length} กลุ่มเพลง`,
      disabled: review.collections.collections.length === 0,
    }] : [],
    songHistory: review?.songHistory ? [{
      id: review.songHistory.id,
      title: review.songHistory.filename,
      detail: `${review.songHistory.actions.length} เหตุการณ์ · ${review.songHistory.songs.length} เพลง`,
      disabled: review.songHistory.actions.length === 0 && review.songHistory.songs.length === 0,
    }] : [],
    alerts: review?.alerts.map((template) => ({
      id: template.id, title: template.title,
      detail: [alertOutputLabels[template.output], template.source?.profileName, template.text.slice(0, 120)].filter(Boolean).join(' · '),
      warning: template.source?.tokens.length ? `โทเค็น EasyWorship ${template.source.tokens.length} รายการ` : undefined,
    })) ?? [],
    alertCatalog: review?.alertCatalog ? [{
      id: review.alertCatalog.id, title: review.alertCatalog.sourceName,
      detail: `โทเค็น ${review.alertCatalog.tokens.length} รายการ · ช่วงเวลานมัสการ ${review.alertCatalog.serviceIntervals.length} ช่วง`,
    }] : [],
    nursery: review?.nursery.map(({ id, output, style }) => ({
      id, title: alertOutputLabels[output],
      detail: [style.enabled ? 'เปิดใช้' : 'ปิดใช้', nurseryPositionLabels[style.position], style.fontFamily,
        style.seconds === null ? 'ซ่อนด้วยตนเอง' : `ซ่อนหลัง ${style.seconds} วินาที`].filter(Boolean).join(' · '),
    })) ?? [],
    messageStyles: review?.messageStyles.map(({ id, output, style }) => ({
      id, title: alertOutputLabels[output],
      detail: [style.enabled ? 'เปิดใช้' : 'ปิดใช้', style.position === 'top' ? 'บน' : 'ล่าง', style.fontFamily,
        style.scrollSpeed === undefined ? undefined : `ความเร็วเลื่อน ${style.scrollSpeed}`].filter(Boolean).join(' · '),
    })) ?? [],
    foldbackAppearance: review?.foldbackAppearance ? [review.foldbackAppearance].map(({ id, appearance }) => ({
      id, title: 'จอเวที',
      detail: [
        appearance.nextLines === 0 ? 'ซ่อนรายการถัดไป'
          : appearance.nextLines !== undefined ? `รายการถัดไป ${appearance.nextLines} บรรทัด` : undefined,
        appearance.clock?.enabled === false ? 'ซ่อนนาฬิกา' : appearance.clock?.format,
      ].filter(Boolean).join(' · '),
    })) : [],
    foldbackService: review?.foldbackService ? [review.foldbackService].map(({ id, settings }) => ({
      id, title: 'เวลานับถอยหลังนมัสการ',
      detail: `${settings.enabled ? 'เปิดใช้' : 'ปิดใช้'} · ${settings.intervals?.length ?? 0} ช่วงเวลารายสัปดาห์`,
    })) : [],
    foldbackContent: foldbackContentRoles.flatMap((role) => {
      const content = review?.foldbackContent
      const style = content?.styles[role]
      return content && style ? [{ id: foldbackContentSourceId(content.path, role), title: foldbackContentLabels[role],
        detail: [style.fontFamily, style.fontRatio === undefined ? undefined : `${Number((style.fontRatio * 100).toFixed(3))}% ของความสูงจอ`]
          .filter(Boolean).join(' · '),
      }] : []
    }),
    scriptureOutputs: review?.scriptureOutputs.map(({ id, output, settings }) => ({
      id, title: outputLabels[output],
      detail: [scriptureReferenceLabels[settings.reference],
        settings.verseNumbers === undefined ? undefined : settings.verseNumbers ? 'แสดงเลขข้อ' : 'ซ่อนเลขข้อ',
        settings.abbreviateBooks ? 'ใช้ชื่อย่อหนังสือพระคัมภีร์' : undefined,
        settings.pagination ? settings.pagination.flow === false ? 'รวมในสไลด์เดียว' : 'แบ่งอัตโนมัติตามพื้นที่จอ' : undefined,
        settings.pagination?.flow !== false && settings.pagination?.breakOnVerse ? 'เริ่มข้อใหม่บนสไลด์ใหม่' : undefined,
        ...scriptureReferenceInsetOptions.flatMap(({ label, sides }) => sides.some((side) => (settings.referenceInsets?.[side] ?? 0) > 0) ? [label] : []),
        ...new Set(Object.values(settings.fonts ?? {}).flatMap(({ fontFamily }) => fontFamily ? [fontFamily] : [])),
      ].filter(Boolean).join(' · '),
    })) ?? [],
    defaultThemes: review?.defaultThemes.map((theme) => {
      const [output, subject] = theme.slot.split(':') as [ThemeOutput, DefaultThemeSubject]
      return {
        id: theme.id, title: theme.title,
        detail: [themeOutputLabels[output], themeSubjectLabels[subject], theme.optionsName].filter(Boolean).join(' · '),
        warning: theme.content.warnings?.join(' · '),
      }
    }) ?? [],
    media: [
      ...(review?.media?.entries?.map((entry) => ({
        id: entry.sourceId, title: entry.name,
        detail: entry.unregistered ? `${CUE_LABELS[entry.kind]} · ไฟล์ใน Resources` : `${CUE_LABELS[entry.kind]} · ${entry.filename}`,
        warning: [entry.warning, entry.originalLocation].filter(Boolean).join(' · ') || undefined, disabled: !entry.readFile,
      })) ?? []),
      ...(review?.media?.unsupported.map((item, index) => ({
        id: `unsupported:${index}`, title: item.message, disabled: true,
      })) ?? []),
    ],
    feeds: review?.media?.feeds?.map((feed) => ({
      id: feed.id, title: feed.name, detail: feed.deviceHints.join(', '),
    })) ?? [],
    dvds: review?.media?.dvds?.map((clip) => ({
      id: clip.id, title: clip.name, detail: clip.discName,
    })) ?? [],
    designs: review?.designs?.entries?.map((entry) => ({
      id: entry.exportId ?? entry.layoutId, title: entry.title,
      detail: `${DESIGN_KIND_LABELS[entry.kind]} · ${entry.content.slides.length} สไลด์${entry.exportFilename ? ` · ${entry.exportFilename}` : ''}`,
      disabled: !entry.content.slides.length,
      ...(entry.content.warnings?.length ? { warning: entry.content.warnings.join(' · ') } : {}),
    })) ?? [],
    powerPoints: review?.designs?.powerPoints?.map((entry) => ({
      id: entry.id, title: entry.title, detail: entry.filename, disabled: !entry.sourcePath, warning: entry.warning,
    })) ?? [],
    bibles: review?.bibles.map(({ path, filename, info, warning }) => ({
      id: path, title: info?.edition.name ?? filename,
      detail: info ? `${info.edition.abbreviation} · รหัส EasyWorship ${info.translationId} · ${filename}` : undefined,
      warning, disabled: Boolean(warning),
    })) ?? [],
    schedules: review?.schedules.map(({ path, filename, attached }) => ({
      id: path, title: filename, ...(attached ? { detail: 'ไฟล์ที่แนบแยก' } : {}),
    })) ?? [],
  }
}

function suggestedSelection(review?: Review): ProfileImportSelection {
  const choices = profileChoices(review)
  const selection = emptySelection()
  for (const { key } of groups) selection[key] = new Set(choices[key].filter((choice) => !choice.disabled).map((choice) => choice.id))
  const slots = new Map<string, number>()
  for (const theme of review?.defaultThemes ?? []) slots.set(theme.slot, (slots.get(theme.slot) ?? 0) + 1)
  for (const theme of review?.defaultThemes ?? []) if ((slots.get(theme.slot) ?? 0) > 1) selection.defaultThemes.delete(theme.id)
  return selection
}

export default function EasyWorshipProfileImport() {
  const [keyboardProfile, setKeyboardProfile] = useState(readKeyboardProfile)
  const importer = useEasyWorshipProfileImport()
  const [mode, setMode] = useState<'archive' | 'folder'>('archive')
  const [source, setSource] = useState<File | File[] | null>(null)
  const [supplemental, setSupplemental] = useState<File[]>([])
  const [attachedMedia, setAttachedMedia] = useState<File[]>([])
  const [externalFolder, setExternalFolder] = useState<File[]>([])
  const [attachedBibles, setAttachedBibles] = useState<File[]>([])
  const [attachedSchedules, setAttachedSchedules] = useState<File[]>([])
  const [attachedDesigns, setAttachedDesigns] = useState<File[]>([])
  const bibleInput = useRef<HTMLInputElement>(null)
  const resourceInput = useRef<HTMLInputElement>(null)
  const scheduleInput = useRef<HTMLInputElement>(null)
  const designInput = useRef<HTMLInputElement>(null)
  const [inventory, setInventory] = useState<EasyWorshipProfileFiles | null>(null)
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [profileId, setProfileId] = useState('')
  const [optionsId, setOptionsId] = useState<string | null>()
  const [encoding, setEncoding] = useState<LegacySongEncoding>('auto')
  const [selection, setSelection] = useState<ProfileImportSelection>(emptySelection)
  const [reading, setReading] = useState(false)
  const [report, setReport] = useState<ProfileImportResult | null>(null)
  const [progress, setProgress] = useState<ProfileImportProgress | null>(null)
  const [error, setError] = useState('')
  const busy = reading || importer.running
  const review = inspection?.review
  const choices = useMemo(() => profileChoices(review), [review])
  const total = groups.reduce((count, { key }) => count + selection[key].size, 0)
  const availableProfiles = inventory?.profiles ?? []
  const activeProfile = review?.profile ?? availableProfiles.find((profile) => profile.id === profileId)
  const scheduleProfileNeeded = availableProfiles.length > 1 && !activeProfile
  const collectionResources = new Set(review?.collections?.collections.map((group) => group.resource))
  const failed = report ? Object.values(report.stages).some((stage) => stage.failures.length > 0) : false

  function downloadReport() {
    if (!review) return
    const csv = easyWorshipProfileReportCsv({
      profile: review.profile.name, version: review.profile.transfer?.version, optionSet: review.options?.name,
      groups, choices, selection, result: report, warnings: review.warnings,
    })
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `worshipteam-easyworship-${report ? 'results' : 'review'}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  function clearReview() {
    setInspection(null)
    setSelection(emptySelection())
    setReport(null)
    setError('')
  }

  function changeSource(file: File | File[] | null) {
    setSource(file)
    setSupplemental([])
    setAttachedMedia([])
    setExternalFolder([])
    setAttachedBibles([])
    setAttachedSchedules([])
    setAttachedDesigns([])
    if (scheduleInput.current) scheduleInput.current.value = ''
    if (designInput.current) designInput.current.value = ''
    setInventory(null)
    setProfileId('')
    setOptionsId(undefined)
    setEncoding('auto')
    clearReview()
    setProgress(null)
  }

  function changeResources(files: File[]) {
    if (!files.length && resourceInput.current) resourceInput.current.value = ''
    setSupplemental(files)
    clearReview()
  }

  function changeBibles(files: File[]) {
    if (!files.length && bibleInput.current) bibleInput.current.value = ''
    setAttachedBibles(files)
    clearReview()
  }

  function changeSchedules(files: File[]) {
    if (!files.length && scheduleInput.current) scheduleInput.current.value = ''
    setAttachedSchedules(files)
    clearReview()
  }

  function changeDesigns(files: File[]) {
    if (!files.length && designInput.current) designInput.current.value = ''
    setAttachedDesigns(files)
    clearReview()
  }

  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!source || busy) return
    setReading(true)
    setReport(null)
    setError('')
    setInspection(null)
    setSelection(emptySelection())
    try {
      const { attachEasyWorshipProfileBibles, attachEasyWorshipProfileResources, attachEasyWorshipProfileSchedules,
        createEasyWorshipProfileFiles } = await import('../utils/easyWorshipProfileFiles')
      const { reviewEasyWorshipProfile } = await import('../utils/easyWorshipProfile')
      const files = inventory ?? await createEasyWorshipProfileFiles(source)
      setInventory(files)
      const selectedId = profileId || (files.profiles.length === 1 ? files.profiles[0].id : undefined)
      const withResources = supplemental.length && selectedId ? attachEasyWorshipProfileResources(files, selectedId, supplemental) : files
      const withBibles = attachedBibles.length && selectedId ? attachEasyWorshipProfileBibles(withResources, selectedId, attachedBibles) : withResources
      const withSchedules = attachedSchedules.length && selectedId
        ? attachEasyWorshipProfileSchedules(withBibles, selectedId, attachedSchedules) : withBibles
      const result = await reviewEasyWorshipProfile(withSchedules, selectedId, encoding, optionsId, [...attachedMedia, ...externalFolder], attachedDesigns)
      if (!result.profiles.length) throw new Error('ไม่พบฐานข้อมูล EasyWorship ในไฟล์หรือโฟลเดอร์นี้')
      if (result.profiles.length === 1 && !profileId) setProfileId(result.profiles[0].id)
      setInspection(result)
      setSelection(suggestedSelection(result.review))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เปิดโปรไฟล์ EasyWorship ไม่สำเร็จ')
    } finally {
      setReading(false)
    }
  }

  async function save() {
    if (!review || !total || busy) return
    setError('')
    setReport(null)
    setProgress(null)
    try {
      setReport(await importer.run(review, selection, setProgress))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'นำเข้าโปรไฟล์ไม่สำเร็จ')
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <header className="page-header mb-0!">
        <div className="page-title">
          <h1>ย้ายโปรไฟล์ EasyWorship</h1>
          <p>ตรวจเพลง ประวัติการใช้เพลง สื่อ สไลด์ พระคัมภีร์ และตารางนมัสการก่อนเลือกนำเข้า</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/settings/output" className="btn-secondary">ย้ายค่าจอ</Link>
          <Link to="/" className="btn-secondary">กลับคลังเพลง</Link>
        </div>
      </header>

      <form className={panel} onSubmit={inspect}>
        <fieldset className="flex min-w-0 flex-col gap-3" disabled={busy}>
          <legend className="text-lg font-medium">โปรไฟล์ต้นทาง</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="profile-source" checked={mode === 'archive'} onChange={() => { setMode('archive'); changeSource(null) }} /> ไฟล์สำรอง
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="profile-source" checked={mode === 'folder'} onChange={() => { setMode('folder'); changeSource(null) }} /> โฟลเดอร์โปรไฟล์
            </label>
          </div>
          {mode === 'archive' ? (
            <label className="flex min-w-0 flex-col gap-2 text-sm">
              ไฟล์ .ewprofile, .ewpck หรือ .zip
              <input key="archive" type="file" accept=".ewprofile,.ewpck,.zip" className="input-field min-w-0" required
                onChange={(event) => changeSource(event.target.files?.[0] ?? null)} />
            </label>
          ) : (
            <label className="flex min-w-0 flex-col gap-2 text-sm">
              โฟลเดอร์ที่มี Data หรือ Databases/Data และ Resources
              <input key="folder" type="file" className="input-field min-w-0" multiple {...{ webkitdirectory: '' }} required
                onChange={(event) => changeSource(Array.from(event.target.files ?? []))} />
            </label>
          )}
          {availableProfiles.length > 1 && (
            <label className="flex min-w-0 flex-col gap-2 text-sm">
              โปรไฟล์ที่จะย้าย
              <select className="input-field min-w-0" required value={profileId} onChange={(event) => {
                setProfileId(event.target.value)
                setOptionsId(undefined)
                setEncoding('auto')
                setAttachedMedia([])
                setExternalFolder([])
                changeBibles([])
                changeResources([])
                if (profileId) {
                  changeSchedules([])
                  changeDesigns([])
                }
              }}>
                <option value="" disabled>เลือกโปรไฟล์</option>
                {availableProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name}{profile.transfer ? ` · ${profile.transfer.version}` : ''}</option>
                ))}
              </select>
            </label>
          )}
          {activeProfile && (activeProfile.files.media || activeProfile.files.layouts || activeProfile.files.presentations
            || activeProfile.schedules.length || attachedSchedules.length > 0) ? (
            <label className="flex min-w-0 flex-col gap-2 text-sm">
              {activeProfile.archiveName ? 'แนบไฟล์สื่อหรือ PowerPoint ต้นฉบับของฐานข้อมูลย้อนหลัง' : 'แนบไฟล์สื่อหรือ PowerPoint ต้นฉบับ'}
              <input key={activeProfile.id} type="file" className="input-field min-w-0" multiple
                accept={`image/*,video/*,audio/*,.pptx,.ppt${canConvertLegacyVideo() ? ',.wmv,.avi,.mpg,.mpeg' : ''}`}
                onChange={(event) => { setAttachedMedia(Array.from(event.target.files ?? [])); clearReview() }} />
            </label>
          ) : null}
          {source && <EasyWorshipExternalMediaFolder files={externalFolder} disabled={scheduleProfileNeeded} onChange={(files) => {
            setExternalFolder(files)
            clearReview()
          }} />}
          {source && (
            <div className="flex min-w-0 flex-col gap-2 text-sm">
              <label htmlFor="easyworship-profile-designs">แนบงานนำเสนอ .ewpx หรือธีม .ewtx</label>
              <input id="easyworship-profile-designs" ref={designInput} type="file" className="input-field min-w-0"
                accept=".ewpx,.ewtx" multiple disabled={scheduleProfileNeeded} aria-describedby="easyworship-profile-designs-help"
                onChange={(event) => changeDesigns(Array.from(event.target.files ?? []))} />
              <span id="easyworship-profile-designs-help" className="text-[var(--fg-secondary)]">
                {scheduleProfileNeeded ? 'เลือกโปรไฟล์ที่จะใช้กับงานนำเสนอและธีมที่แนบ' : 'แนบไฟล์จากเครื่องเดิมเพื่อกู้สื่อและนำเข้ารายการที่เก็บแยก'}
              </span>
              {attachedDesigns.length > 0 && (
                <button type="button" className="btn-ghost self-start" onClick={() => changeDesigns([])}>นำงานนำเสนอและธีมที่แนบออก ({attachedDesigns.length} ไฟล์)</button>
              )}
            </div>
          )}
          {source && (
            <div className="flex min-w-0 flex-col gap-2 text-sm">
              <label htmlFor="easyworship-profile-schedules">แนบตารางนมัสการ .ews หรือ .ewsx</label>
              <input id="easyworship-profile-schedules" ref={scheduleInput} type="file" className="input-field min-w-0"
                accept=".ews,.ewsx" multiple disabled={scheduleProfileNeeded} aria-describedby="easyworship-profile-schedules-help"
                onChange={(event) => changeSchedules(Array.from(event.target.files ?? []))} />
              <span id="easyworship-profile-schedules-help" className="text-[var(--fg-secondary)]">
                {scheduleProfileNeeded ? 'เลือกโปรไฟล์ที่จะใช้กับตารางที่แนบ' : 'เลือกตารางที่เก็บแยกจากโปรไฟล์ แล้วกดตรวจโปรไฟล์'}
              </span>
              {attachedSchedules.length > 0 && (
                <button type="button" className="btn-ghost self-start" onClick={() => changeSchedules([])}>นำตารางที่แนบออก ({attachedSchedules.length} ไฟล์)</button>
              )}
            </div>
          )}
          {activeProfile && (
            <div className="flex min-w-0 flex-col gap-2 text-sm">
              <label htmlFor="easyworship-profile-bibles">แนบฉบับพระคัมภีร์ .ewb</label>
              <input key={activeProfile.id} id="easyworship-profile-bibles" ref={bibleInput} type="file" className="input-field min-w-0" accept=".ewb"
                multiple aria-describedby="easyworship-profile-bibles-help"
                onChange={(event) => changeBibles(Array.from(event.target.files ?? []))} />
              <span id="easyworship-profile-bibles-help" className="text-[var(--fg-secondary)]">
                เลือกไฟล์จากเครื่องเดิม แล้วกดตรวจโปรไฟล์อีกครั้ง
              </span>
              {attachedBibles.length > 0 && (
                <button type="button" className="btn-ghost self-start" onClick={() => changeBibles([])}>นำไฟล์ .ewb ที่แนบออก</button>
              )}
            </div>
          )}
          {activeProfile?.optionSets.length ? (
            <div className="flex min-w-0 flex-col gap-2 text-sm">
              <label htmlFor="easyworship-profile-options">ชุดตัวเลือก EasyWorship</label>
              <span id="easyworship-profile-options-help" className="text-[var(--fg-secondary)]">ใช้ชุดนี้สำหรับธีมจอ การแสดงพระคัมภีร์ จอเวที ข้อความแจ้งเตือน โทเค็น และเวลานมัสการ</span>
              <select id="easyworship-profile-options" className="input-field min-w-0" aria-describedby="easyworship-profile-options-help"
                value={(optionsId === undefined ? activeProfile.defaultOptionsId : optionsId) ?? ''}
                onChange={(event) => {
                  setOptionsId(event.target.value || null)
                  clearReview()
                }}>
                <option value="">เฉพาะคลังและตาราง</option>
                {activeProfile.optionSets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}
              </select>
            </div>
          ) : null}
          {mode === 'archive' && activeProfile && (
            <div className="flex min-w-0 flex-col gap-2 text-sm">
              {activeProfile.transfer?.includesResources === false && (
                <p className="text-[var(--fg-secondary)]">ไฟล์สำรองเฉพาะฐานข้อมูล แนบโฟลเดอร์ Resources จากเครื่องเดิมเพื่อกู้สื่อและตาราง</p>
              )}
              <label className="flex min-w-0 flex-col gap-2">
                แนบโฟลเดอร์ Resources จากโปรไฟล์นี้
                <input key={activeProfile.id} ref={resourceInput} type="file" name="resources"
                  className="input-field min-w-0" multiple {...{ webkitdirectory: '' }}
                  onChange={(event) => changeResources(Array.from(event.target.files ?? []))} />
              </label>
              {supplemental.length > 0 && (
                <button type="button" className="btn-ghost self-start" onClick={() => changeResources([])}>นำโฟลเดอร์ที่แนบออก</button>
              )}
            </div>
          )}
          {(activeProfile?.files.songMemo || activeProfile?.files.backgrounds
            || attachedSchedules.some((schedule) => /\.ews$/i.test(schedule.name))
            || activeProfile?.schedules.some((schedule) => /\.ews$/i.test(schedule.filename))) && (
            <EasyWorshipLegacyEncoding label="รหัสอักษรของโปรไฟล์รุ่นเก่า" value={encoding} onChange={(next) => {
              setEncoding(next)
              if (inspection) setInspection({ files: inspection.files, profiles: inspection.profiles })
              setSelection(emptySelection())
              setReport(null)
              setError('')
            }} />
          )}
          <button type="submit" className="btn-primary self-start" disabled={!source || busy}>ตรวจโปรไฟล์</button>
        </fieldset>
        {reading && <p role="status" className="mt-3! text-sm">กำลังตรวจฐานข้อมูลและไฟล์ในโปรไฟล์…</p>}
        {!review && error && <p role="alert" className={`mt-3! ${errorStyle}`}>{error}</p>}
      </form>

      <PresentationKeyboardControl active={keyboardProfile} onApply={setKeyboardProfile} />

      {review && (
        <section className={panel} aria-labelledby="profile-choice-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="profile-choice-heading" className="text-lg font-medium wrap-anywhere">{activeProfile?.name || 'รายการในโปรไฟล์'}</h2>
            <p className="text-sm text-[var(--fg-secondary)]" role="status">เลือก {total} รายการ</p>
          </div>
          {activeProfile?.transfer && <p className="text-sm wrap-anywhere text-[var(--fg-secondary)]">{activeProfile.transfer.version}</p>}
          {review.songs?.recoveredLyricsOnly && <p className="text-sm text-[var(--fg-secondary)]">{easyWorshipLyricsRecoveryNotice}</p>}
          {review.options && <p className="text-sm wrap-anywhere text-[var(--fg-secondary)]">ชุดตัวเลือก {review.options.name}</p>}
          {review.warnings.length > 0 && (
            <details className="mt-3! text-sm">
              <summary className="cursor-pointer text-[var(--fg-secondary)]">ผลตรวจโปรไฟล์ · {review.warnings.length} ข้อสังเกต</summary>
              <ul className="mt-2! space-y-1">{review.warnings.map((warning, index) => <li className="wrap-anywhere" key={index}>{warning}</li>)}</ul>
            </details>
          )}
          <div className="mt-4! grid gap-3 sm:grid-cols-2">
            {groups.filter(({ key }) => choices[key].length > 0).map(({ key, title }) => (
              <EasyWorshipProfileSelection key={`${profileId}:${key}`} title={title} choices={choices[key]}
                selected={selection[key]} disabled={importer.running}
                onChange={(ids) => {
                  setSelection((current) => ({ ...current, [key]: ids }))
                  setReport(null)
                  setError('')
                }} />
            ))}
          </div>
          <p className="mt-3! text-sm text-[var(--fg-secondary)]">เพลง สไลด์ และเพลย์ลิสต์บันทึกในคลังของแอป ไฟล์สื่อ สัญญาณสด ฉบับพระคัมภีร์ ประวัติการใช้เพลง ข้อความแจ้งเตือน โทเค็น เวลานมัสการ ค่าจอ การตั้งค่าการเรียกผู้ปกครอง และกลุ่มที่นำเข้าเก็บในเบราว์เซอร์นี้</p>
          {review.schedules.length + review.bibles.length > 0 && <p className="mt-1! text-sm text-[var(--fg-secondary)]">ระบบตรวจเนื้อหาในไฟล์ตารางและฉบับพระคัมภีร์ระหว่างนำเข้า</p>}
          <div className="mt-4! flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={!total || busy || Boolean(report && !failed)} onClick={() => void save()}>
              {failed ? 'ลองนำเข้ารายการที่เลือกอีกครั้ง' : 'นำเข้ารายการที่เลือก'}
            </button>
            {!report && <button type="button" className="btn-secondary" disabled={busy} onClick={downloadReport}>
              ดาวน์โหลดรายการตรวจโปรไฟล์ CSV
            </button>}
          </div>
          {importer.running && <p role="status" className="mt-3! text-sm">{progress
            ? `กำลังนำเข้า${groups.find((group) => group.key === progress.key)?.title ?? ''} ${progress.processed}/${progress.total}`
            : 'กำลังเตรียมการนำเข้า…'}</p>}
          {error && <p role="alert" className={`mt-3! ${errorStyle}`}>{error}</p>}
        </section>
      )}
      {report && (
        <section className={panel} aria-labelledby="profile-results">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="profile-results" className="text-lg font-medium">ผลการนำเข้า</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" disabled={busy} onClick={downloadReport}>
                ดาวน์โหลดผลการนำเข้า CSV
              </button>
              {!busy && !failed && <Link className="btn-secondary" to="/media?backup=profile">สำรองฐานข้อมูลโปรเจกต์พร้อมสื่อ</Link>}
            </div>
          </div>
          <p className="mt-2! text-sm" role="status">{failed ? 'บางรายการต้องตรวจและลองอีกครั้ง' : 'นำเข้ารายการที่เลือกเรียบร้อย'}</p>
          <ul className="mt-3! divide-y divide-[var(--border-subtle)]">
            {groups.map(({ key, title, href }) => {
              const stage = report.stages[key]
              if (!stage) return null
              return (
                <li key={key} className="py-3!">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{title}</span>
                    <span className="text-sm text-[var(--fg-secondary)]">
                      บันทึก {stage.saved} · มีอยู่แล้ว {stage.duplicates} · ข้อผิดพลาด {stage.failures.length}
                      {stage.verified > 0 && ` · ยืนยันว่ามีในปลายทาง ${stage.verified}`}
                      {Boolean(stage.filled) && ` · เติมข้อมูลหรือรูปแบบในเพลงเดิม ${stage.filled} เพลง`}
                      {Boolean(stage.restoredSongLabels) && ` · คืนป้ายชื่อท่อนเพลง ${stage.restoredSongLabels} สไลด์`}
                      {Boolean(stage.restoredFormatting) && ` · คืนรูปแบบข้อความ ${stage.restoredFormatting} สไลด์`}
                      {Boolean(stage.restoredSlidePlayback) && ` · คืนเอฟเฟ็กต์หรือเวลาเลื่อน ${stage.restoredSlidePlayback} สไลด์`}
                      {Boolean(stage.restoredMediaPlayback) && ` · คืนค่าการเล่นสื่อ ${stage.restoredMediaPlayback} สไลด์`}
                      {Boolean(stage.restoredScripture) && ` · เติมข้อพระคัมภีร์ ${stage.restoredScripture} สไลด์`}
                      {Boolean(stage.restoredFeedVideo) && ` · คืนการตั้งค่าภาพ ${stage.restoredFeedVideo} สัญญาณสด`}
                      {Boolean(stage.restoredMasterBackgrounds) && ` · คืนพื้นหลังจากแม่แบบ ${stage.restoredMasterBackgrounds} เลเยอร์`}
                      {Boolean(stage.restoredElementBorders) && ` · คืนค่าเส้นขอบ ${stage.restoredElementBorders} เลเยอร์`}
                      {Boolean(stage.restoredElementShadows) && ` · คืนค่าเงา ${stage.restoredElementShadows} เลเยอร์`}
                      {Boolean(stage.restoredElementReflections) && ` · คืนค่าเงาสะท้อน ${stage.restoredElementReflections} เลเยอร์`}
                      {Boolean(stage.restoredShapeMasks) && ` · คืนรูปทรง ${stage.restoredShapeMasks} เลเยอร์`}
                      {Boolean(stage.restoredLayerRotations) && ` · คืนมุมหมุน ${stage.restoredLayerRotations} เลเยอร์`}
                      {Boolean(stage.restoredMasterSoundtracks) && ` · คืนเสียงประกอบจากแม่แบบ ${stage.restoredMasterSoundtracks} สไลด์`}
                      {Boolean(stage.linkedSongs) && ` · เชื่อมเพลงกับคลัง ${stage.linkedSongs} รายการ`}
                      {Boolean(stage.ambiguousSongs) && ` · พบเพลงรหัสเดียวกันหลายฉบับ ${stage.ambiguousSongs} รายการ`}
                      {Boolean(stage.linkedPresentations) && ` · เชื่อมงานนำเสนอกับคลัง ${stage.linkedPresentations} รายการ`}
                      {Boolean(stage.ambiguousPresentations) && ` · พบงานนำเสนอหลายฉบับที่ตรงกัน ${stage.ambiguousPresentations} รายการ`}
                      {Boolean(stage.restoredPowerPoints) && ` · กู้ PowerPoint ในเพลย์ลิสต์เดิม ${stage.restoredPowerPoints} รายการ`}
                      {Boolean(stage.keptPowerPoints) && ` · เก็บ PowerPoint ที่แก้ไว้ ${stage.keptPowerPoints} รายการ`}
                      {Boolean(stage.restoredMedia) && ` · กู้สื่อในเพลย์ลิสต์เดิม ${stage.restoredMedia} รายการ`}
                    </span>
                    {key === 'collections' ? (
                      <>
                        {collectionResources.has('songs') && <Link className="text-sm text-[var(--accent)] underline" to={href}>เปิดกลุ่มเพลง</Link>}
                        {collectionResources.has('media') && <Link className="text-sm text-[var(--accent)] underline" to="/media#media-collections">เปิดกลุ่มสื่อ</Link>}
                        {collectionResources.has('scripture') && <Link className="text-sm text-[var(--accent)] underline" to="/scripture#scripture-collections">เปิดกลุ่มพระคัมภีร์</Link>}
                        {(collectionResources.has('presentations') || collectionResources.has('themes'))
                          && <Link className="text-sm text-[var(--accent)] underline" to="/designs#design-collections">เปิดกลุ่มสไลด์และธีม</Link>}
                      </>
                    ) : <Link className="text-sm text-[var(--accent)] underline" to={href}>เปิด{title}</Link>}
                  </div>
                  {stage.links.length > 0 && <ul className="mt-2! flex flex-wrap gap-2">
                    {stage.links.map((link) => <li key={link.id}><Link to={`/playlists/${link.id}`} className="chip-btn">{link.name}</Link></li>)}
                  </ul>}
                  {stage.failures.length > 0 && <ul className="mt-2! space-y-1">
                    {stage.failures.slice(0, 10).map((failure, index) => <li key={index} className={errorStyle}>{failure.name} · {failure.message}</li>)}
                    {stage.failures.length > 10 && <li className="text-sm text-[var(--fg-secondary)]">
                      ดูอีก {stage.failures.length - 10} รายการในรายงาน CSV
                    </li>}
                  </ul>}
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
