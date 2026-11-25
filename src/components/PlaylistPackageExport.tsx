/** Downloads a portable playlist, with a review step if media is missing. */

import { useState } from 'react'
import type { Playlist, PlaylistSong } from '../types/database'
import type { PreparedPlaylistPackage } from '../utils/playlistPackage'

export function PlaylistPackageExport({ playlist, entries }: { playlist: Playlist; entries: PlaylistSong[] }) {
  const [pending, setPending] = useState<PreparedPlaylistPackage>()
  const [progress, setProgress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function exportPlaylist(partial?: PreparedPlaylistPackage) {
    setBusy(true)
    setError('')
    setProgress('กำลังรวบรวมไฟล์สื่อ…')
    try {
      const { playlistPackageFilename, preparePlaylistPackage, writePlaylistPackage } = await import('../utils/playlistPackage')
      const prepared = partial ?? await preparePlaylistPackage(playlist, entries)
      if (!partial && prepared.manifest.missing.length > 0) {
        setPending(prepared)
        setProgress('')
        return
      }
      const blob = await writePlaylistPackage(prepared, (done, total) => setProgress(`กำลังแพ็กสื่อ ${done} / ${total} ไฟล์`))
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.href = url
      link.download = playlistPackageFilename(prepared.manifest.playlist.name)
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setPending(undefined)
      setProgress('เริ่มดาวน์โหลดแพ็กเกจแล้ว')
    } catch (cause) {
      setProgress('')
      setError(cause instanceof Error ? cause.message : 'ส่งออกแพ็กเกจไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="btn-secondary" disabled={busy || Boolean(pending)} onClick={() => void exportPlaylist()}>
        ส่งออกเพลย์ลิสต์พร้อมสื่อ
      </button>
      {(pending || progress || error) && <div className="w-full min-w-0 text-sm">
        {progress && <p role="status">{progress}</p>}
        {error && <p role="alert" className="text-[var(--status-error-text)]">{error}</p>}
        {pending && (
          <div className="surface mt-2! grid gap-2 p-3!">
            <p role="status">ไม่พบสื่อในเครื่องนี้ {pending.manifest.missing.length} รายการ</p>
            <ul className="max-h-32 list-disc overflow-y-auto pl-5 wrap-anywhere">
              {pending.manifest.missing.map((name) => <li key={name}>{name}</li>)}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => void exportPlaylist(pending)}>
                ดาวน์โหลดเท่าที่มี
              </button>
              <button type="button" className="btn-secondary" disabled={busy}
                onClick={() => { setPending(undefined); setError('') }}>ยกเลิก</button>
            </div>
          </div>
        )}
      </div>}
    </>
  )
}
