/** Shows imported and local song activity with date filters and CSV export. */

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SongHistoryTable } from '../components/SongHistoryTable'
import { readEasyWorshipSongHistory, SONG_ACTION_LABELS, type SongHistory as History } from '../utils/easyWorshipSongHistory'
import { getSongHistory, listSongHistories, saveSongHistory, songHistoryChannel } from '../utils/songHistoryLibrary'
import { exportSongHistoryCsv, songActivityDateTime, songHistoryFilters, songHistoryReport, summarizeSongHistory } from '../utils/songHistoryReport'

const PAGE_SIZE = 50
const textSecondary = 'text-[var(--fg-secondary)]'

export default function SongHistory() {
  const upload = useRef<HTMLInputElement>(null)
  const [histories, setHistories] = useState<Awaited<ReturnType<typeof listSongHistories>>>()
  const [params, setParams] = useSearchParams()
  const [initialHistoryId, setInitialHistoryId] = useState('')
  const [history, setHistory] = useState<History>()
  const { start, end, action, view, invalidRange } = songHistoryFilters(params)
  const [page, setPage] = useState(0)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const channel = new BroadcastChannel(songHistoryChannel)
    channel.onmessage = () => setRevision((current) => current + 1)
    return () => channel.close()
  }, [])

  useEffect(() => {
    let active = true
    void listSongHistories().then((items) => {
      if (active) {
        setHistories(items)
        setInitialHistoryId((id) => id || items[0]?.id || '')
      }
    }).catch(() => {
      if (active) {
        setHistories([])
        setError('เปิดประวัติการใช้เพลงในเบราว์เซอร์ไม่สำเร็จ')
      }
    })
    return () => { active = false }
  }, [revision])

  const historyId = params.get('history') || initialHistoryId
  useEffect(() => {
    if (!historyId) return
    let active = true
    void getSongHistory(historyId).then((item) => {
      if (!active) return
      if (item) setHistory(item)
      else setError('ไม่พบประวัติการใช้เพลงที่เลือก')
    }).catch(() => { if (active) setError('อ่านประวัติการใช้เพลงที่เลือกไม่สำเร็จ') })
    return () => { active = false }
  }, [historyId, revision])

  const current = history?.id === historyId ? history : undefined
  const events = useMemo(() => current && !invalidRange ? songHistoryReport(current, start, end, action) : [],
    [current, invalidRange, start, end, action])
  const summary = useMemo(() => view === 'summary' ? summarizeSongHistory(events) : [], [view, events])
  const rowCount = view === 'summary' ? summary.length : events.length
  const lastPage = Math.max(0, Math.ceil(rowCount / PAGE_SIZE) - 1)
  const pageIndex = Math.min(page, lastPage)
  const offset = pageIndex * PAGE_SIZE
  const printParams = new URLSearchParams(params)
  if (current) printParams.set('history', current.id)

  function changeFilter(key: 'history' | 'start' | 'end' | 'action' | 'view', value: string) {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
    setPage(0)
    if (key === 'history') setError('')
  }

  async function importHistory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const file = upload.current?.files?.[0]
    if (!file || importing) return
    setImporting(true)
    setError('')
    setMessage('')
    try {
      const item = await readEasyWorshipSongHistory(file)
      if (!item.actions.length && !item.songs.length) {
        setMessage('ไฟล์นี้ไม่มีเพลงหรือกิจกรรมที่บันทึกไว้')
        return
      }
      const result = await saveSongHistory(item)
      setHistories(await listSongHistories())
      changeFilter('history', item.id)
      setMessage(result === 'duplicate' ? 'ประวัติชุดนี้อยู่ในเบราว์เซอร์แล้ว' : `นำเข้า ${item.actions.length} เหตุการณ์แล้ว`)
      if (upload.current) upload.current.value = ''
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'นำเข้าประวัติไม่สำเร็จ')
    } finally {
      setImporting(false)
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([exportSongHistoryCsv(events, current?.origin)], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'song-activity.csv'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <header className="page-header mb-0!">
        <div className="page-title"><h1>ประวัติการใช้เพลง</h1><p>ดูเพลงที่สร้างหรือขึ้นจอผู้ชมใน WorshipTeam และรายงาน EasyWorship ที่นำเข้าในเบราว์เซอร์นี้</p></div>
        <Link to="/" className="btn-secondary">กลับคลังเพลง</Link>
      </header>

      <form onSubmit={importHistory} className="surface flex flex-wrap items-end gap-3 p-4! sm:p-6!" aria-busy={importing}>
        <label className="grid min-w-0 flex-1 gap-1 text-sm">
          ไฟล์ประวัติ SongHistory.db
          <input ref={upload} type="file" accept=".db" className="input-field min-w-0" required disabled={importing} />
        </label>
        <button className="btn-secondary" disabled={importing}>{importing ? 'กำลังอ่านไฟล์…' : 'นำเข้าประวัติ'}</button>
        <p className={`w-full text-sm ${textSecondary}`}>นำเข้าจากไฟล์ประวัติหรือ <Link to="/import/easyworship" className="text-[var(--accent)] underline">ย้ายพร้อมโปรไฟล์ EasyWorship</Link></p>
        {message && <p role="status" className="w-full text-sm">{message}</p>}
      </form>
      {error && <p role="alert" className="text-sm text-[var(--status-error-text)]">{error}</p>}
      {!histories && <p role="status" className="text-sm">กำลังเปิดประวัติ…</p>}
      {histories?.length === 0 && <p className={textSecondary}>ประวัติจะปรากฏเมื่อขึ้นเพลงบนจอผู้ชมหรือนำเข้าจาก EasyWorship</p>}
      {histories && histories.length > 0 && (
        <section className="surface grid gap-4 p-4! sm:p-6!" aria-labelledby="song-activity-report">
          <h2 id="song-activity-report" className="text-lg font-medium">รายงานการใช้เพลง</h2>
          <div className="grid min-w-0 gap-1 text-sm">
            <label htmlFor="history-source">ชุดประวัติ</label>
            <select id="history-source" className="input-field min-w-0" value={historyId} onChange={(event) => changeFilter('history', event.target.value)}>
              {histories.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.size} เหตุการณ์ · {songActivityDateTime.format(item.savedAt)}</option>)}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="grid min-w-0 gap-1 text-sm">ตั้งแต่วันที่
              <input className="input-field min-w-0" type="date" max={end || undefined} value={start}
                aria-invalid={invalidRange || undefined} aria-describedby={invalidRange ? 'history-range-error' : undefined}
                onChange={(event) => changeFilter('start', event.target.value)} />
            </label>
            <label className="grid min-w-0 gap-1 text-sm">ถึงวันที่
              <input className="input-field min-w-0" type="date" min={start || undefined} value={end}
                aria-invalid={invalidRange || undefined} aria-describedby={invalidRange ? 'history-range-error' : undefined}
                onChange={(event) => changeFilter('end', event.target.value)} />
            </label>
            <div className="grid min-w-0 gap-1 text-sm">
              <label htmlFor="history-action">กิจกรรม</label>
              <select id="history-action" className="input-field min-w-0" value={action} onChange={(event) => changeFilter('action', event.target.value)}>
                <option value="">ทั้งหมด</option>
                {Object.entries(SONG_ACTION_LABELS).map(([id, title]) => <option key={id} value={id}>{title}</option>)}
              </select>
            </div>
            <div className="grid min-w-0 gap-1 text-sm">
              <label htmlFor="history-view">มุมมอง</label>
              <select id="history-view" className="input-field min-w-0" value={view} onChange={(event) => changeFilter('view', event.target.value)}>
                <option value="summary">สรุปตามเพลง</option>
                <option value="events">รายการตามเวลา</option>
              </select>
            </div>
          </div>
          {invalidRange && <p id="history-range-error" role="alert" className="text-sm text-[var(--status-error-text)]">วันที่เริ่มต้นต้องมาก่อนหรือเท่ากับวันที่สิ้นสุด</p>}
          {!invalidRange && current && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p role="status" className={`text-sm ${textSecondary}`}>{events.length ? `${events.length} เหตุการณ์` : 'ไม่พบกิจกรรมในช่วงที่เลือก'}</p>
                {events.length > 0 && <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={download} className="btn-secondary">ดาวน์โหลดรายการ CSV</button>
                  <Link className="btn-secondary" to={{ pathname: '/songs/history/print', search: printParams.toString() }}>พิมพ์รายงานการใช้เพลง</Link>
                </div>}
              </div>
              {rowCount > 0 && (
                <div role="region" aria-label="ตารางการใช้เพลง" tabIndex={0} className="overflow-x-auto rounded-lg border border-[var(--border-subtle)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
                  {view === 'summary' ? (
                    <SongHistoryTable view="summary" rows={summary.slice(offset, offset + PAGE_SIZE)} />
                  ) : (
                    <SongHistoryTable view="events" rows={events.slice(offset, offset + PAGE_SIZE)} />
                  )}
                </div>
              )}
              {lastPage > 0 && <nav className="flex flex-wrap items-center gap-3" aria-label="หน้ารายงาน">
                <button type="button" className="btn-secondary" disabled={pageIndex === 0} onClick={() => setPage(pageIndex - 1)}>ก่อนหน้า</button>
                <span role="status" className={`text-sm ${textSecondary}`}>หน้า {pageIndex + 1} จาก {lastPage + 1}</span>
                <button type="button" className="btn-secondary" disabled={pageIndex === lastPage} onClick={() => setPage(pageIndex + 1)}>ถัดไป</button>
              </nav>}
            </>
          )}
          {!current && !error && <p role="status" className="text-sm">กำลังอ่านประวัติชุดที่เลือก…</p>}
        </section>
      )}
    </div>
  )
}
