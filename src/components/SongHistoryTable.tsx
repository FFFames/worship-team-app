/** Presents the same activity rows on screen and on paper. */

import { songActivityDateTime, songHistoryActionLabel, type songHistoryReport, type summarizeSongHistory } from '../utils/songHistoryReport'

type Props = { paper?: boolean } & (
  { view: 'summary'; rows: ReturnType<typeof summarizeSongHistory> }
  | { view: 'events'; rows: ReturnType<typeof songHistoryReport> }
)

export function SongHistoryTable(props: Props) {
  const { paper, view, rows } = props
  const cell = paper ? '' : 'px-3! py-2! align-top'
  const secondaryText = paper ? 'schedule-paper-note' : 'text-[var(--fg-secondary)]'
  const tableClass = paper ? `schedule-paper-summary activity-report-${view}` : 'w-full border-collapse text-left text-sm'
  const columns = view === 'summary'
    ? ['เพลง', 'เลขอ้างอิง', 'เพิ่ม', 'พิมพ์', 'ฉาย', 'อื่น ๆ']
    : ['วันเวลา', 'เพลง', 'กิจกรรม', 'เลขอ้างอิง']
  return (
    <table className={tableClass}>
      <caption className="sr-only">{view === 'summary' ? 'สรุปกิจกรรมตามเพลง' : 'รายการกิจกรรมตามเวลา'}</caption>
      <thead className={paper ? undefined : secondaryText}><tr>
        {columns.map((label) => <th key={label} scope="col" className={paper ? '' : `${cell} whitespace-nowrap`}>{label}</th>)}
      </tr></thead>
      <tbody className={paper ? undefined : 'divide-y divide-[var(--border-subtle)]'}>
        {view === 'summary' ? rows.map(({ song, id, added, printed, projected, other }) => (
          <tr key={id ?? 'unknown'}>
            <th scope="row" className={paper ? '' : `${cell} min-w-40 font-medium wrap-anywhere`}>{song?.title || 'ไม่พบชื่อเพลง'}
              {song?.author && <span className={`block font-normal ${secondaryText}`}>{song.author}</span>}
            </th>
            {[song?.reference || '–', added, printed, projected, other].map((value, index) => (
              <td key={index} className={`${cell} tabular-nums`}>{value}</td>
            ))}
          </tr>
        )) : rows.map(({ action, date, song }) => (
          <tr key={action.id}>
            <td className={paper ? '' : `${cell} min-w-32`}>
              {date ? <time dateTime={date.toISOString()}>{songActivityDateTime.format(date)}</time> : 'ไม่ทราบเวลา'}
            </td>
            <th scope="row" className={paper ? '' : `${cell} min-w-32 font-medium wrap-anywhere`}>{song?.title || 'ไม่พบชื่อเพลง'}</th>
            <td className={paper ? '' : `${cell} whitespace-nowrap`}>{songHistoryActionLabel(action.type)}</td>
            <td className={cell}>{song?.reference || '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
