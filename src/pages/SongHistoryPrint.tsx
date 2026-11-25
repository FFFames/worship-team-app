/** Prints a complete report for exactly one saved activity source and its filters. */

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SongHistoryTable } from '../components/SongHistoryTable'
import type { SongHistory } from '../utils/easyWorshipSongHistory'
import { getSongHistory } from '../utils/songHistoryLibrary'
import { songHistoryActionLabel, songHistoryFilters, songHistoryReport, summarizeSongHistory } from '../utils/songHistoryReport'
import './schedulePrint.css'

const dateFormat = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'UTC' })
const heading = 'รายงานการใช้เพลง'

function showDay(day: string) {
  return dateFormat.format(new Date(`${day}T00:00:00Z`))
}

function reportPeriod(start: string, end: string) {
  if (start && start === end) return showDay(start)
  return [start && `ตั้งแต่ ${showDay(start)}`, end && `ถึง ${showDay(end)}`].filter(Boolean).join(' ') || 'ทุกช่วงวันที่'
}

type LoadedHistory = { id: string; history?: SongHistory; error?: string }

export default function SongHistoryPrint() {
  const [params, setParams] = useSearchParams()
  const id = params.get('history')
  const { start, end, action, view, invalidRange } = songHistoryFilters(params)
  const [loaded, setLoaded] = useState<LoadedHistory>()

  useEffect(() => {
    if (!id) return
    let active = true
    void getSongHistory(id).then((history) => {
      if (active) setLoaded({ id, history, error: history ? undefined : 'ไม่พบประวัติชุดนี้ในเบราว์เซอร์' })
    }).catch(() => {
      if (active) setLoaded({ id, error: 'อ่านประวัติการใช้เพลงไม่สำเร็จ' })
    })
    return () => { active = false }
  }, [id])

  const source = loaded?.id === id ? loaded : undefined
  const history = source?.history
  const events = useMemo(() => history && !invalidRange ? songHistoryReport(history, start, end, action) : [],
    [history, invalidRange, start, end, action])
  const summary = useMemo(() => view === 'summary' ? summarizeSongHistory(events) : [], [events, view])
  const error = !id ? 'กรุณาเลือกชุดประวัติจากหน้าประวัติการใช้เพลง' : source?.error
  const loading = Boolean(id && !source)

  useEffect(() => {
    const previous = document.title
    document.title = history ? `${heading} - ${history.name}` : heading
    return () => { document.title = previous }
  }, [history])

  return (
    <main className="schedule-print">
      <div className="schedule-print-toolbar">
        <Link className="btn-secondary" to={{ pathname: '/songs/history', search: params.toString() }}>กลับประวัติการใช้เพลง</Link>
        {!loading && !error && !invalidRange && events.length > 0 && (
          <div className="schedule-print-actions">
            <label htmlFor="activity-print-view">มุมมอง</label>
            <select id="activity-print-view" className="input-field" value={view}
              onChange={(event) => setParams((current) => {
                const next = new URLSearchParams(current)
                next.set('view', event.target.value)
                return next
              }, { replace: true })}>
              <option value="summary">สรุปตามเพลง</option>
              <option value="events">รายการตามเวลา</option>
            </select>
            <button className="btn-primary" type="button" onClick={() => void document.fonts.ready.then(() => window.print())}>
              พิมพ์รายงานการใช้เพลง
            </button>
          </div>
        )}
      </div>
      {loading && <p role="status">กำลังเปิดรายงานการใช้เพลง…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && invalidRange && <p role="alert">ช่วงวันที่ที่เลือกไม่ถูกต้อง</p>}
      {history && !error && !invalidRange && (
        <div className="schedule-paper">
          <header className="schedule-paper-header">
            <h1>{heading}</h1>
            <p className="schedule-paper-note">ชุดประวัติ · {history.name}
              {history.filename && history.filename !== history.name && ` · ${history.filename}`}
            </p>
            <p className="schedule-paper-note">{reportPeriod(start, end)} · {action ? songHistoryActionLabel(action) : 'ทุกกิจกรรม'} · {events.length} เหตุการณ์</p>
            {events.length > 0 && <p className="schedule-paper-note">
              {view === 'summary' ? 'สรุปตามเพลง' : 'รายการตามเวลา'}
            </p>}
          </header>
          {events.length === 0 ? <p>ไม่พบกิจกรรมในช่วงที่เลือก</p> : view === 'summary'
            ? <SongHistoryTable paper view="summary" rows={summary} />
            : <SongHistoryTable paper view="events" rows={events} />}
        </div>
      )}
    </main>
  )
}
