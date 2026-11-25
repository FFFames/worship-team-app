/** Filters, summarizes, and exports a selected song activity history. */

import { SONG_ACTION_LABELS, songHistoryDate, type SongHistory } from './easyWorshipSongHistory'
import { formatCsv } from './csv'

export const songActivityDateTime = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' })

export function songHistoryFilters(params: URLSearchParams) {
  const start = params.get('start') ?? ''
  const end = params.get('end') ?? ''
  const action = params.get('action') ?? ''
  const view = params.get('view') === 'events' ? 'events' : 'summary'
  const invalidRange = [start, end].some((day) => day && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !songHistoryDate(day)))
    || Boolean(start && end && start > end)
  return { start, end, action, view, invalidRange }
}

export function localSongHistoryDay(date: Date): string {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => String(part).padStart(index ? 2 : 4, '0')).join('-')
}

export function songHistoryActionLabel(type: string | null): string {
  if (type === null) return 'ไม่ระบุ'
  return Object.prototype.hasOwnProperty.call(SONG_ACTION_LABELS, type) ? SONG_ACTION_LABELS[type] : `รหัส ${type}`
}

export function songHistoryReport(history: SongHistory, start: string, end: string, type: string) {
  const songs = new Map(history.songs.map((song) => [song.id, song]))
  return history.actions.flatMap((action) => {
    if (type && type !== action.type) return []
    const date = songHistoryDate(action.originalDate)
    const day = date && localSongHistoryDay(date)
    if ((start && (!day || day < start)) || (end && (!day || day > end))) return []
    const song = action.songSnapshot ?? (action.songId === null ? undefined : songs.get(action.songId))
    return [{ action, date, song }]
  }).sort((a, b) => (b.date?.getTime() ?? -Infinity) - (a.date?.getTime() ?? -Infinity))
}

type ReportRows = ReturnType<typeof songHistoryReport>

export function summarizeSongHistory(rows: ReportRows) {
  const songs = new Map<string | null, { song: ReportRows[number]['song']; id: string | null; added: number; printed: number; projected: number; other: number }>()
  for (const { song, action } of rows) {
    const id = action.songId
    const summary = songs.get(id) ?? { song, id, added: 0, printed: 0, projected: 0, other: 0 }
    switch (action.type) {
      case '0': summary.added++; break
      case '1': summary.printed++; break
      case '2': summary.projected++; break
      default: summary.other++
    }
    songs.set(id, summary)
  }
  return [...songs.values()].sort((a, b) => (a.song?.title ?? '').localeCompare(b.song?.title ?? '', 'th'))
}

export function exportSongHistoryCsv(rows: ReportRows, origin?: SongHistory['origin']): string {
  const header = ['วันเวลา', 'กิจกรรม', 'ชื่อเพลง', 'ผู้แต่ง', 'ลิขสิทธิ์', 'ผู้ดูแลลิขสิทธิ์', 'เลขอ้างอิง', 'รหัสเพลง EasyWorship',
    'รหัสเหตุการณ์', 'รหัสกิจกรรม', 'เวลาต้นฉบับ', 'เวลาส่งรายงานต้นฉบับ', 'รหัสผู้ให้บริการ', 'ข้อผิดพลาดจากผู้ให้บริการ']
  if (origin === 'worshipteam') header.push('รหัสเพลงใน WorshipTeam')
  const values = rows.map(({ action, date, song }) => [date?.toISOString(), songHistoryActionLabel(action.type), song?.title,
    song?.author, song?.copyright, song?.administrator, song?.reference, song?.uid,
    action.id, action.type, action.originalDate, action.originalTransmitDate, song?.providerId, song?.providerError,
    ...(origin === 'worshipteam' ? [song?.id] : [])])
  return formatCsv([header, ...values])
}
