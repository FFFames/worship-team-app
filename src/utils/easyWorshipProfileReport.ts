/** Turns the reviewed source inventory and confirmed import outcomes into a CSV audit. */

import type { ProfileChoice } from '../components/EasyWorshipProfileSelection'
import { formatCsv } from './csv'
import type { ProfileCategory, ProfileImportResult, ProfileImportSelection, ProfileItemOutcome } from './easyWorshipProfileImport'

const statusLabels: Record<ProfileItemOutcome['status'], string> = {
  saved: 'บันทึกแล้ว',
  duplicate: 'มีอยู่แล้ว',
  verified: 'ยืนยันว่ามีในปลายทาง',
  failed: 'ยืนยันการบันทึกไม่ได้',
}

export function easyWorshipProfileReportCsv({
  profile, version, optionSet, groups, choices, selection, result, warnings,
}: {
  profile: string
  version?: string
  optionSet?: string
  groups: readonly { key: ProfileCategory; title: string }[]
  choices: Record<ProfileCategory, ProfileChoice[]>
  selection: ProfileImportSelection
  result: ProfileImportResult | null
  warnings: readonly string[]
}) {
  const header = ['โปรไฟล์', 'รุ่น EasyWorship', 'ชุดตัวเลือก', 'ประเภท', 'รหัสอ้างอิงต้นทาง',
    'รายการ', 'ผลการนำเข้า', 'รหัสปลายทาง', 'ข้อสังเกต', 'ข้อผิดพลาด']
  const prefix = [profile, version, optionSet]
  const rows = groups.flatMap(({ key, title }) => {
    const outcomes = new Map(result?.stages[key]?.items.map((item) => [item.sourceId, item]))
    return choices[key].map((choice) => {
      const outcome = outcomes.get(choice.id)
      const status = outcome ? statusLabels[outcome.status]
        : choice.disabled ? 'นำเข้าไม่ได้'
        : !selection[key].has(choice.id) ? 'ไม่ได้เลือก'
        : result ? 'ยังไม่เริ่มนำเข้า' : 'รอนำเข้า'
      const restored = outcome?.restoredSongLabels ? `คืนป้ายชื่อท่อนเพลง ${outcome.restoredSongLabels} สไลด์` : undefined
      const formatting = outcome?.restoredFormatting ? `คืนรูปแบบข้อความ ${outcome.restoredFormatting} สไลด์` : undefined
      const playback = outcome?.restoredSlidePlayback ? `คืนเอฟเฟ็กต์หรือเวลาเลื่อน ${outcome.restoredSlidePlayback} สไลด์` : undefined
      const mediaPlayback = outcome?.restoredMediaPlayback ? `คืนค่าการเล่นสื่อ ${outcome.restoredMediaPlayback} สไลด์` : undefined
      const scripture = outcome?.restoredScripture ? `เติมข้อพระคัมภีร์ ${outcome.restoredScripture} สไลด์` : undefined
      const feedVideo = outcome?.restoredFeedVideo ? `คืนการตั้งค่าภาพ ${outcome.restoredFeedVideo} สัญญาณสด` : undefined
      const masterBackgrounds = outcome?.restoredMasterBackgrounds ? `คืนพื้นหลังจากแม่แบบ ${outcome.restoredMasterBackgrounds} เลเยอร์` : undefined
      const masterSoundtracks = outcome?.restoredMasterSoundtracks ? `คืนเสียงประกอบจากแม่แบบ ${outcome.restoredMasterSoundtracks} สไลด์` : undefined
      const borders = outcome?.restoredElementBorders ? `คืนค่าเส้นขอบ ${outcome.restoredElementBorders} เลเยอร์` : undefined
      const shadows = outcome?.restoredElementShadows ? `คืนค่าเงา ${outcome.restoredElementShadows} เลเยอร์` : undefined
      const reflections = outcome?.restoredElementReflections ? `คืนค่าเงาสะท้อน ${outcome.restoredElementReflections} เลเยอร์` : undefined
      const masks = outcome?.restoredShapeMasks ? `คืนรูปทรง ${outcome.restoredShapeMasks} เลเยอร์` : undefined
      const rotations = outcome?.restoredLayerRotations ? `คืนมุมหมุน ${outcome.restoredLayerRotations} เลเยอร์` : undefined
      const links = outcome?.linkedSongs ? `เชื่อมเพลงกับคลัง ${outcome.linkedSongs} รายการ` : undefined
      const ambiguous = outcome?.ambiguousSongs ? `พบเพลงรหัสเดียวกันหลายฉบับ ${outcome.ambiguousSongs} รายการ` : undefined
      const presentations = outcome?.linkedPresentations ? `เชื่อมงานนำเสนอกับคลัง ${outcome.linkedPresentations} รายการ` : undefined
      const presentationVersions = outcome?.ambiguousPresentations ? `พบงานนำเสนอหลายฉบับที่ตรงกัน ${outcome.ambiguousPresentations} รายการ` : undefined
      const powerPoint = outcome?.restoredPowerPoints ? `กู้ PowerPoint ในเพลย์ลิสต์เดิม ${outcome.restoredPowerPoints} รายการ` : undefined
      const keptPowerPoint = outcome?.keptPowerPoints ? `เก็บ PowerPoint ที่แก้ไว้ ${outcome.keptPowerPoints} รายการ` : undefined
      const media = outcome?.restoredMedia ? `กู้สื่อในเพลย์ลิสต์เดิม ${outcome.restoredMedia} รายการ` : undefined
      const notes = [...new Set([key === 'schedules' || key === 'designs' ? choice.detail : undefined, choice.warning, ...(outcome?.notes ?? []),
        restored, formatting, playback, mediaPlayback, scripture, feedVideo, masterBackgrounds, masterSoundtracks, rotations, masks, borders, shadows, reflections,
        links, ambiguous, presentations, presentationVersions, powerPoint, keptPowerPoint, media].filter(Boolean))]
      return [...prefix, title, choice.id, choice.title,
        outcome?.error && outcome.status !== 'failed' ? `${status} · ต้องตรวจเพิ่มเติม` : status,
        outcome?.destinationId, notes.join('\n'), outcome?.error]
    })
  })
  for (const warning of warnings) rows.push([...prefix, 'ผลตรวจโปรไฟล์', '', '', '', '', warning, ''])
  return formatCsv([header, ...rows])
}
