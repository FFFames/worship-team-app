/** Keeps the source inventory and confirmed database outcomes distinguishable in exported reports. */

import { describe, expect, it } from 'vitest'
import type { ProfileChoice } from '../components/EasyWorshipProfileSelection'
import type { ProfileCategory, ProfileStageResult } from './easyWorshipProfileImport'
import { easyWorshipProfileReportCsv } from './easyWorshipProfileReport'

describe('EasyWorship profile audit CSV', () => {
  it('exports selected and unavailable rows before import, then pairs outcomes by ID', () => {
    const groups = [{ key: 'songs', title: 'เพลง' }, { key: 'schedules', title: 'ตาราง' }] as const
    const choices = {
      songs: [
        { id: 'a', title: 'เพลงเดียวกัน', warning: 'มีข้อสังเกต' },
        { id: 'b', title: 'เพลงเดียวกัน' },
        { id: 'c', title: 'เพลงถัดไป' },
        { id: 'd', title: 'เพลงเสีย', disabled: true, warning: 'อ่านเนื้อเพลงไม่ได้' },
        { id: 'e', title: 'ไม่ได้เลือกเพลงนี้' },
      ],
      schedules: [{ id: 's', title: '=@example, "Thai".ewsx', detail: 'ไฟล์ที่แนบแยก' }],
    } as Record<ProfileCategory, ProfileChoice[]>
    const selection = { songs: new Set(['a', 'b', 'c']), schedules: new Set(['s']) } as Record<ProfileCategory, Set<string>>
    const info = { profile: 'โปรไฟล์ไทย', version: 'EasyWorship 8', groups, choices, selection, warnings: ['ไฟล์สื่อขาดหาย'] }
    const preview = easyWorshipProfileReportCsv({ ...info, result: null })
    expect(preview).toContain('"a","เพลงเดียวกัน","รอนำเข้า"')
    expect(preview).toContain('"d","เพลงเสีย","นำเข้าไม่ได้","","อ่านเนื้อเพลงไม่ได้"')
    expect(preview).toContain('"e","ไม่ได้เลือกเพลงนี้","ไม่ได้เลือก"')
    expect(preview).toContain(`"s","'=@example, ""Thai"".ewsx","รอนำเข้า","","ไฟล์ที่แนบแยก"`)

    const songs: ProfileStageResult = {
      key: 'songs', total: 3, processed: 2, saved: 1, duplicates: 1, verified: 0,
      failures: [{ name: 'เพลงเดียวกัน', message: 'บันทึกแท็กไม่ได้' }], links: [],
      items: [
        { sourceId: 'b', status: 'duplicate', destinationId: 'song-b' },
        { sourceId: 'a', status: 'saved', destinationId: 'song-a', error: 'บันทึกแท็กไม่ได้' },
      ],
    }
    const schedules: ProfileStageResult = {
      key: 'schedules', total: 1, processed: 1, saved: 0, duplicates: 1, verified: 0, failures: [], links: [],
      items: [{ sourceId: 's', status: 'duplicate', destinationId: 'schedule-id', restoredSongLabels: 3, restoredMasterSoundtracks: 2 }],
    }
    const report = easyWorshipProfileReportCsv({ ...info, result: { stages: { songs, schedules } } })
    expect(report.charCodeAt(0)).toBe(0xfeff)
    expect(report).toContain('"a","เพลงเดียวกัน","บันทึกแล้ว · ต้องตรวจเพิ่มเติม","song-a","มีข้อสังเกต","บันทึกแท็กไม่ได้"')
    expect(report).toContain('"b","เพลงเดียวกัน","มีอยู่แล้ว","song-b"')
    expect(report).toContain('"c","เพลงถัดไป","ยังไม่เริ่มนำเข้า"')
    expect(report).toContain(`"s","'=@example, ""Thai"".ewsx","มีอยู่แล้ว","schedule-id","ไฟล์ที่แนบแยก\nคืนป้ายชื่อท่อนเพลง 3 สไลด์\nคืนเสียงประกอบจากแม่แบบ 2 สไลด์"`)
    expect(report).toContain('"ผลตรวจโปรไฟล์","","","","","ไฟล์สื่อขาดหาย"')
  })
})
