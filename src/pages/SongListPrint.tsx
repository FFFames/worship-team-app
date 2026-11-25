/** Prints the songs matching the current library search and collection. */

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useCollectionFilter } from '../hooks/useCollectionFilter'
import { useSongs } from '../hooks/useSongs'
import { prepareSongCollectionFilter, type CollectionSong } from '../utils/songCollectionRules'
import { orderedSongList, songSort } from '../utils/songList'
import './schedulePrint.css'

function SongCredits({ song }: { song: CollectionSong }) {
  if (!song.copyright && !song.copyright_administrator && !song.ccli_number) return <span aria-label="ไม่มีข้อมูล">—</span>
  return (
    <>
      {song.copyright && <div>{song.copyright}</div>}
      {song.copyright_administrator && <div className="schedule-paper-note">ดูแลโดย {song.copyright_administrator}</div>}
      {song.ccli_number && <div>CCLI {song.ccli_number}</div>}
    </>
  )
}

export default function SongListPrint() {
  const [params] = useSearchParams()
  const [showCredits, setShowCredits] = useState(false)
  const { ready, selected } = useCollectionFilter('songs')
  const groupId = params.get('collection')
  const missingGroup = ready && Boolean(groupId) && !selected
  const canLoad = !groupId || Boolean(selected)
  const query = params.get('q')?.trim() ?? ''
  const scope = params.get('scope') === 'lyrics' ? 'lyrics' : 'metadata'
  const sort = songSort(params.get('sort'), 'title')
  const collection = useMemo(() => selected && prepareSongCollectionFilter(selected.leaves), [selected])
  const { songs, loading, error } = useSongs(canLoad, scope, { collectionDetails: collection?.needsDetails, credits: true, query })
  const rows = useMemo(() => orderedSongList(songs, sort, collection?.includesSong), [songs, sort, collection])
  const groupName = selected ? `${selected.profile} · ${selected.collection.path.join(' › ')}` : ''
  const heading = 'รายชื่อเพลง'

  useEffect(() => {
    const previous = document.title
    document.title = groupName ? `${heading} - ${groupName}` : heading
    return () => { document.title = previous }
  }, [groupName])

  return (
    <main className="schedule-print">
      <div className="schedule-print-toolbar">
        <Link to={{ pathname: '/', search: params.toString() }} className="btn-secondary">กลับคลังเพลง</Link>
        {canLoad && !loading && !error && rows.length > 0 && (
          <div className="schedule-print-actions">
            <label className="flex min-h-10 items-center gap-2">
              <input type="checkbox" checked={showCredits} onChange={(event) => setShowCredits(event.target.checked)} />
              รวมข้อมูลลิขสิทธิ์และ CCLI
            </label>
            <button type="button" className="btn-primary" onClick={() => void document.fonts.ready.then(() => window.print())}>
              พิมพ์รายชื่อเพลง
            </button>
          </div>
        )}
      </div>
      {!missingGroup && (!canLoad || loading) && <p role="status">กำลังเปิดรายชื่อเพลง…</p>}
      {missingGroup && <p role="alert">เปิดกลุ่มเพลงที่เลือกในเบราว์เซอร์นี้ไม่ได้</p>}
      {error && canLoad && <p role="alert">เปิดรายชื่อเพลงไม่สำเร็จ</p>}
      {canLoad && !loading && !error && (
        <div className="schedule-paper">
          <header className="schedule-paper-header">
            <h1>{heading}</h1>
            <p className="schedule-paper-note">{groupName ? `${groupName} · ` : ''}{rows.length} เพลง</p>
            {query && <p className="schedule-paper-note">ค้นหาจาก {scope === 'lyrics' ? 'เนื้อเพลง' : 'ชื่อเพลงหรือศิลปิน'} · {query}</p>}
          </header>
          {rows.length === 0 ? <p>ไม่พบเพลงตามตัวกรองนี้</p> : (
            <table className="schedule-paper-summary song-report-table" aria-label={heading}>
              <thead><tr>
                <th scope="col">ชื่อเพลง</th>
                <th scope="col">ศิลปินหรือผู้แต่ง</th>
                {showCredits && <th scope="col">ลิขสิทธิ์และ CCLI</th>}
              </tr></thead>
              <tbody>
                {rows.map((song) => (
                  <tr key={song.id}>
                    <th scope="row">{song.title}</th>
                    <td>{song.artist || '—'}</td>
                    {showCredits && <td><SongCredits song={song} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </main>
  )
}
