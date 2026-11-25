import { useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { usePlaylist } from '../hooks/usePlaylists'
import { schedulePrintEntries } from '../utils/schedulePrint'
import './schedulePrint.css'

const dateFormat = new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeZone: 'UTC' })

type PrintEntry = ReturnType<typeof schedulePrintEntries>[number]

function PrintSummary({ entries }: { entries: PrintEntry[] }) {
  return (
    <table className="schedule-paper-summary" aria-label="ลำดับรายการนมัสการ">
      <thead><tr><th scope="col">ลำดับ</th><th scope="col">รายการ</th><th scope="col">ประเภท</th></tr></thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.id}>
            <td>{entry.position}</td>
            <th scope="row">
              {entry.title}
              {entry.author && <div className="schedule-paper-note">{entry.author}</div>}
            </th>
            <td>{entry.kind}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PrintEntryDetails({ entry }: { entry: PrintEntry }) {
  const credits = [
    ['ผู้แต่ง', entry.author], ['ลิขสิทธิ์', entry.copyright], ['ผู้ดูแลลิขสิทธิ์', entry.administrator],
    ['CCLI', entry.ccli], ['เลขอ้างอิง', entry.reference],
  ].filter(([, value]) => value)

  return (
    <article className="schedule-paper-entry">
      <header>
        <p className="schedule-paper-note">รายการ {entry.position} · {entry.kind}</p>
        <h2>{entry.title}</h2>
        {credits.length > 0 && (
          <dl>
            {credits.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        )}
        {entry.assets.length > 0 && <p className="schedule-paper-note">สื่อของคิว · {entry.assets.join(' · ')}</p>}
      </header>
      {entry.slides.map((slide, index) => (
        <section key={index} className="schedule-paper-slide">
          <h3>{index + 1}. {slide.label || 'สไลด์'}</h3>
          {slide.lines.some((line) => line.trim()) && <p className="schedule-paper-lyrics">{slide.lines.join('\n')}</p>}
          {slide.assets.length > 0 && <p className="schedule-paper-note">สื่อ · {slide.assets.join(' · ')}</p>}
        </section>
      ))}
    </article>
  )
}

export default function SchedulePrint() {
  const { id } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const { playlist, songs, loading, error } = usePlaylist(id)
  const detailed = params.get('view') === 'details'
  const entries = schedulePrintEntries(songs)
  const heading = playlist?.name
  const serviceDate = playlist?.date ? new Date(`${playlist.date}T00:00:00Z`) : undefined
  const dateLabel = serviceDate && Number.isFinite(serviceDate.getTime()) ? dateFormat.format(serviceDate) : undefined

  useEffect(() => {
    if (!heading) return
    const title = document.title
    document.title = `${heading} - ตารางนมัสการ`
    return () => { document.title = title }
  }, [heading])

  return (
    <main className="schedule-print">
      <div className="schedule-print-toolbar">
        <Link to={`/playlists/${id}`} className="btn-secondary">กลับเพลย์ลิสต์</Link>
        {playlist && !loading && !error && entries.length > 0 && (
          <div className="schedule-print-actions">
            <label htmlFor="schedule-print-view">รูปแบบตาราง</label>
            <select id="schedule-print-view" className="input-field" value={detailed ? 'details' : 'summary'}
              onChange={(event) => setParams(event.target.value === 'details' ? { view: 'details' } : {}, { replace: true })}>
              <option value="summary">แบบสรุป</option>
              <option value="details">แบบละเอียด</option>
            </select>
            <button type="button" className="btn-primary" onClick={() => void document.fonts.ready.then(() => window.print())}>พิมพ์ตาราง</button>
          </div>
        )}
      </div>
      {loading && <p role="status">กำลังเปิดตารางนมัสการ…</p>}
      {!loading && (!playlist || error) && <p role="alert">เปิดตารางนมัสการไม่สำเร็จ</p>}
      {!loading && !error && playlist && (
        <div className="schedule-paper">
          <header className="schedule-paper-header">
            <p className="schedule-paper-note">{detailed ? 'ตารางนมัสการแบบละเอียด' : 'ตารางนมัสการแบบสรุป'}</p>
            <h1>{playlist.name}</h1>
            <p className="schedule-paper-note">
              {dateLabel && <><time dateTime={playlist.date ?? undefined}>{dateLabel}</time> · </>}
              {entries.length} รายการ
            </p>
            {playlist.notes?.trim() && <p className="schedule-paper-lyrics">{playlist.notes}</p>}
          </header>
          {entries.length === 0 ? <p>เพลย์ลิสต์นี้ยังไม่มีรายการให้พิมพ์</p> : detailed
            ? <div>{entries.map((entry) => <PrintEntryDetails key={entry.id} entry={entry} />)}</div>
            : <PrintSummary entries={entries} />}
        </div>
      )}
    </main>
  )
}
