/** Reviews and opens a portable WorshipTeam playlist on this computer. */

import { useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePlaylistPackageImport } from '../hooks/usePlaylistPackageImport'
import { materializePlaylistPackage, playlistPackageExtension, reviewPlaylistPackage, type PlaylistPackageManifest } from '../utils/playlistPackage'

export default function PlaylistPackageImport() {
  const navigate = useNavigate()
  const save = usePlaylistPackageImport()
  const [selected, setSelected] = useState<{ file: File; manifest: PlaylistPackageManifest; id: string }>()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  async function review(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setSelected(undefined)
    setError('')
    setProgress('กำลังตรวจแพ็กเกจ…')
    setBusy(true)
    try {
      setSelected({ file, manifest: await reviewPlaylistPackage(file), id: crypto.randomUUID() })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เปิดไฟล์แพ็กเกจไม่สำเร็จ')
    } finally {
      setProgress('')
      setBusy(false)
    }
  }

  async function importPlaylist() {
    if (!selected || busy) return
    setBusy(true)
    setError('')
    const { file, manifest, id } = selected
    try {
      setProgress('กำลังเตรียมสื่อสำหรับเครื่องนี้…')
      const payload = await materializePlaylistPackage(file, manifest, (done, total) => setProgress(`บันทึกสื่อ ${done} / ${total} ไฟล์`))
      setProgress('กำลังสร้างสำเนาเพลย์ลิสต์…')
      navigate(`/playlists/${await save(id, manifest.playlist, payload)}`)
    } catch (cause) {
      setProgress('')
      setError(cause instanceof Error ? cause.message : 'สร้างเพลย์ลิสต์จากแพ็กเกจไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid max-w-3xl gap-4">
      <Link to="/playlists" className="text-sm text-[var(--fg-secondary)] underline">กลับไปที่เพลย์ลิสต์</Link>
      <h1>เปิดแพ็กเกจเพลย์ลิสต์</h1>
      <label className="surface grid gap-2 p-4!">
        เลือกไฟล์ .wtschedule
        <input type="file" accept={playlistPackageExtension} disabled={busy} aria-label="เลือกไฟล์ .wtschedule"
          onChange={(event) => void review(event)} className="input-field min-w-0" />
      </label>
      {selected && (
        <section className="surface grid min-w-0 gap-3 p-4!" aria-label="ตรวจเพลย์ลิสต์ก่อนนำเข้า">
          <h2 className="wrap-anywhere">{selected.manifest.playlist.name}</h2>
          {selected.manifest.playlist.date && <p>{selected.manifest.playlist.date}</p>}
          {selected.manifest.playlist.notes && <p className="wrap-anywhere">{selected.manifest.playlist.notes}</p>}
          <p>{selected.manifest.entries.length} รายการ · เพลงที่จะเพิ่มในคลัง {selected.manifest.songs.length} เพลง · สื่อ {selected.manifest.media.length} ไฟล์</p>
          {selected.manifest.entries.length > 0 && <ol className="max-h-64 list-decimal overflow-y-auto pl-5 wrap-anywhere">
            {selected.manifest.entries.map((entry, index) => <li key={index}>
              {entry.cue?.label ?? (entry.song === undefined ? '' : selected.manifest.songs[entry.song].title)}
            </li>)}
          </ol>}
          {selected.manifest.missing.length > 0 && <details>
            <summary className="cursor-pointer">สื่อที่ไม่อยู่ในแพ็กเกจ {selected.manifest.missing.length} รายการ</summary>
            <ul className="max-h-32 list-disc overflow-y-auto pl-5 wrap-anywhere">
              {selected.manifest.missing.map((name, index) => <li key={index}>{name}</li>)}
            </ul>
          </details>}
          <button type="button" className="btn-primary justify-self-start" disabled={busy}
            onClick={() => void importPlaylist()}>สร้างสำเนาเพลย์ลิสต์</button>
        </section>
      )}
      {progress && <p role="status">{progress}</p>}
      {error && <p role="alert" className="wrap-anywhere text-[var(--status-error-text)]">{error}</p>}
    </main>
  )
}
