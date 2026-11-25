/** Reviews songs from an EasyWorship profile before adding them to the library. */

import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useEasyWorshipImport, type ImportProgress } from '../hooks/useEasyWorshipImport'
import { easyWorshipLyricsRecoveryNotice, type EasyWorshipImport, type EasyWorshipSong } from '../utils/easyWorship'
import { reviewEasyWorshipArchive } from '../utils/easyWorshipArchive'
import { readEasyWorshipSongLibrary, reviewEasyWorshipSqliteFiles, type EasyWorshipSongFormat } from '../utils/easyWorshipSongLibrary'
import type { LegacySongEncoding } from '../utils/easyWorshipEncoding'
import { EasyWorshipLegacyEncoding } from '../components/EasyWorshipLegacyEncoding'

const emptyProgress: ImportProgress = { added: 0, duplicates: 0 }
const panel = 'surface min-w-0 rounded-xl p-4 sm:p-6'

export default function EasyWorshipImport() {
  const saveSongs = useEasyWorshipImport()
  const [source, setSource] = useState<'databases' | 'legacy' | 'archive'>('databases')
  const [songsFile, setSongsFile] = useState<File | null>(null)
  const [wordsFile, setWordsFile] = useState<File | null>(null)
  const [layoutsFile, setLayoutsFile] = useState<File | null>(null)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [attachedMedia, setAttachedMedia] = useState<File[]>([])
  const [walFiles, setWalFiles] = useState<File[]>([])
  const walInput = useRef<HTMLInputElement>(null)
  const [archiveFile, setArchiveFile] = useState<File | null>(null)
  const [profiles, setProfiles] = useState<string[]>([])
  const [profile, setProfile] = useState<string>()
  const [format, setFormat] = useState<EasyWorshipSongFormat>()
  const [encoding, setEncoding] = useState<LegacySongEncoding>('auto')
  const [preview, setPreview] = useState<EasyWorshipImport | null>(null)
  const [activeSong, setActiveSong] = useState<EasyWorshipSong | null>(null)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStarted, setSaveStarted] = useState(false)
  const [readError, setReadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [progress, setProgress] = useState(emptyProgress)

  const selectedCount = (preview?.songs.length ?? 0) - excluded.size
  const processed = progress.added + progress.duplicates
  const finished = selectedCount > 0 && processed === selectedCount
  const filter = query.trim().toLocaleLowerCase()
  const visibleSongs = preview?.songs.filter((song) =>
    !filter || song.title.toLocaleLowerCase().includes(filter) || song.author?.toLocaleLowerCase().includes(filter),
  ) ?? []

  function clearPreview() {
    setPreview(null)
    setActiveSong(null)
    setExcluded(new Set())
    setQuery('')
    setReadError('')
    setSaveError('')
    setSaveStarted(false)
    setProgress(emptyProgress)
  }

  function clearWalFiles() {
    if (walInput.current) walInput.current.value = ''
    setWalFiles([])
  }

  function clearArtworkFiles() {
    setMediaFile(null)
    setAttachedMedia([])
  }

  async function reviewFiles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (reading || saving) return

    clearPreview()
    setReading(true)
    try {
      let result: EasyWorshipImport | undefined
      if (source === 'legacy' && songsFile && wordsFile) {
        const review = await readEasyWorshipSongLibrary(songsFile, { memo: async () => wordsFile }, encoding)
        setFormat(review.format)
        result = review.preview
      } else if (source === 'databases' && wordsFile) {
        result = await reviewEasyWorshipSqliteFiles({
          songs: songsFile, words: wordsFile, layouts: layoutsFile, media: mediaFile, attachedMedia, walFiles,
        })
        setFormat('sqlite')
      } else if (source === 'archive' && archiveFile) {
        const review = await reviewEasyWorshipArchive(archiveFile, profile, encoding)
        setProfiles(review.profiles)
        setFormat(review.format)
        result = review.preview
      }
      if (!result) return
      setPreview(result)
      setActiveSong(result.songs[0] ?? null)
    } catch (error) {
      setReadError(error instanceof Error ? error.message : 'อ่านฐานข้อมูล EasyWorship ไม่สำเร็จ')
    } finally {
      setReading(false)
    }
  }

  function changeSource(value: 'databases' | 'legacy' | 'archive') {
    setSource(value)
    setSongsFile(null)
    setWordsFile(null)
    setLayoutsFile(null)
    clearArtworkFiles()
    clearWalFiles()
    setArchiveFile(null)
    setProfiles([])
    setProfile(undefined)
    setFormat(undefined)
    setEncoding('auto')
    clearPreview()
  }

  async function importSelected() {
    if (!preview || saving || !selectedCount || finished) return

    const remaining = preview.songs.filter((song) => !excluded.has(song.sourceId)).slice(processed)
    setSaving(true)
    setSaveStarted(true)
    setSaveError('')
    try {
      await saveSongs(remaining, (batch) => setProgress((current) => ({
        added: current.added + batch.added,
        duplicates: current.duplicates + batch.duplicates,
        filled: (current.filled ?? 0) + (batch.filled ?? 0),
        warnings: [...new Set([...(current.warnings ?? []), ...(batch.warnings ?? [])])],
      })), preview.readAppearanceAsset, preview.withAppearanceAsset)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'บันทึกเพลงไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="page-header mb-0">
        <div className="page-title">
          <h1>นำเข้าเพลงจาก EasyWorship</h1>
          <p>ตรวจเนื้อร้อง ข้อมูลลิขสิทธิ์ และรูปแบบจากต้นทางก่อนเพิ่มเพลงลงในคลัง</p>
        </div>
        <div className="page-actions flex-wrap">
          <Link className="btn-secondary" to="/import/easyworship">ย้ายโปรไฟล์ EasyWorship</Link>
          <Link className="btn-secondary" to="/playlists/import">นำเข้าตาราง EasyWorship</Link>
          <Link className="btn-secondary" to="/">กลับคลังเพลง</Link>
        </div>
      </header>

      <form className={panel} onSubmit={reviewFiles} aria-describedby="easyworship-files-help">
        <h2 className="mb-2 text-lg font-medium">ไฟล์ฐานข้อมูลเพลง</h2>
        <p id="easyworship-files-help" className="mb-4 text-sm text-[var(--fg-secondary)]">
          เลือกไฟล์จากโฟลเดอร์เดียวกัน หาก Songs.db หาย ให้เลือกเฉพาะ SongWords.db หรือ SongWords.dat เพื่อกู้เนื้อร้อง
        </p>
        <fieldset className="mb-4 flex flex-wrap gap-4" disabled={reading || saving}>
          <legend className="sr-only">ประเภทไฟล์นำเข้า</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="source" checked={source === 'databases'} onChange={() => changeSource('databases')} /> ฐานข้อมูล SQLite
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="source" checked={source === 'legacy'} onChange={() => changeSource('legacy')} /> ฐานข้อมูลรุ่นเก่า
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="source" checked={source === 'archive'} onChange={() => changeSource('archive')} /> ไฟล์บีบอัด
          </label>
        </fieldset>
        {source !== 'archive' ? (
          <fieldset key={source} className="grid gap-4 sm:grid-cols-2" disabled={reading || saving}>
          <label className="flex min-w-0 flex-col gap-2">
            <span className="font-medium">{source === 'legacy' ? 'Songs.DB' : 'Songs.db (ถ้ามี)'}</span>
            <input className="input-field min-w-0" name="songs" type="file" accept=".db,.sqlite,.sqlite3" required={source === 'legacy'}
              aria-invalid={readError ? true : undefined} aria-describedby={readError ? 'easyworship-read-error' : undefined}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null
                setSongsFile(file)
                if (!file) { setLayoutsFile(null); clearArtworkFiles() }
                clearWalFiles()
                clearPreview()
              }} />
          </label>
          <label className="flex min-w-0 flex-col gap-2">
            <span className="font-medium">{source === 'legacy' ? 'Songs.MB' : 'SongWords.db หรือ SongWords.dat'}</span>
            <input className="input-field min-w-0" name={source === 'legacy' ? 'memo' : 'words'} type="file"
              accept={source === 'legacy' ? '.mb' : '.db,.dat,.sqlite,.sqlite3'} required
              aria-invalid={readError ? true : undefined} aria-describedby={readError ? 'easyworship-read-error' : undefined}
              onChange={(event) => { setWordsFile(event.target.files?.[0] ?? null); clearWalFiles(); clearPreview() }} />
          </label>
          </fieldset>
        ) : (
          <fieldset className="grid gap-4 sm:grid-cols-2" disabled={reading || saving}>
            <label className="flex min-w-0 flex-col gap-2">
              <span className="font-medium">ไฟล์ ZIP หรือแพ็กเกจ EasyWorship</span>
              <input className="input-field min-w-0" name="archive" type="file" accept=".zip,.ewprofile,.ewpck" required
                aria-invalid={readError ? true : undefined} aria-describedby={readError ? 'easyworship-read-error' : undefined}
                onChange={(event) => {
                  setArchiveFile(event.target.files?.[0] ?? null)
                  setProfiles([])
                  setProfile(undefined)
                  setFormat(undefined)
                  setEncoding('auto')
                  clearPreview()
                }} />
            </label>
            {profiles.length > 1 && (
              <label className="flex min-w-0 flex-col gap-2">
                <span className="font-medium">โฟลเดอร์ฐานข้อมูลเพลง</span>
                <select className="input-field min-w-0" value={profile === undefined ? '' : String(profiles.indexOf(profile))} required
                  onChange={(event) => { setProfile(profiles[Number(event.target.value)]); setFormat(undefined); clearPreview() }}>
                  <option value="" disabled>เลือกโฟลเดอร์เพื่อตรวจเพลง</option>
                  {profiles.map((name, index) => <option key={name} value={index}>{name || '/'}</option>)}
                </select>
              </label>
            )}
          </fieldset>
        )}
        {(source === 'legacy' || format === 'paradox') && (
          <div className="mt-3!">
            <EasyWorshipLegacyEncoding value={encoding} disabled={reading || saving} onChange={(next) => {
              setEncoding(next)
              clearPreview()
            }} />
          </div>
        )}
        {source === 'databases' && songsFile && (
          <label className="mt-3! flex min-w-0 flex-col gap-2 text-sm">
            PresentationLayouts.db สำหรับรูปแบบเพลง (ถ้ามี)
            <input type="file" name="layouts" className="input-field min-w-0" accept=".db,.dat,.sqlite" disabled={reading || saving}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null
                setLayoutsFile(file)
                if (!file) clearArtworkFiles()
                clearWalFiles()
                clearPreview()
              }} />
          </label>
        )}
        {source === 'databases' && songsFile && layoutsFile && (
          <fieldset className="mt-3! grid gap-3 sm:grid-cols-2" disabled={reading || saving}>
            <legend className="sr-only">สื่อของเลย์เอาต์เพลง</legend>
            <label className="flex min-w-0 flex-col gap-2 text-sm">
              Media.db สำหรับเทียบไฟล์สื่อ (ถ้ามี)
              <input type="file" name="media-catalog" className="input-field min-w-0" accept=".db,.sqlite,.sqlite3"
                onChange={(event) => { setMediaFile(event.target.files?.[0] ?? null); clearWalFiles(); clearPreview() }} />
            </label>
            <label className="flex min-w-0 flex-col gap-2 text-sm">
              แนบไฟล์สื่อต้นฉบับของเลย์เอาต์ (ถ้ามี)
              <input type="file" name="layout-media" className="input-field min-w-0" accept="image/*,video/*,audio/*,.wmv,.avi,.mpg,.mpeg"
                multiple aria-describedby="easyworship-layout-media-help"
                onChange={(event) => { setAttachedMedia(Array.from(event.target.files ?? [])); clearPreview() }} />
              <span id="easyworship-layout-media-help" className="text-[var(--fg-secondary)]">
                ระบบใช้ SHA-256 เพื่อค้นหาไฟล์ต้นฉบับจากไฟล์ที่แนบหรือคลังสื่อในเบราว์เซอร์นี้
              </span>
            </label>
          </fieldset>
        )}
        {source === 'databases' && (
          <fieldset className="mt-3!" disabled={reading || saving}>
            <label className="flex min-w-0 flex-col gap-2 text-sm">
              ไฟล์บันทึก -wal (ถ้ามี)
              <input ref={walInput} type="file" name="wal" multiple className="input-field min-w-0"
                aria-describedby="easyworship-wal-help"
                onChange={(event) => { setWalFiles(Array.from(event.target.files ?? [])); clearPreview() }} />
            </label>
            <p id="easyworship-wal-help" className="mt-2! text-sm text-[var(--fg-secondary)]">
              หลังเลือกฐานข้อมูล ให้เลือกไฟล์ที่ลงท้ายด้วย -wal จากโฟลเดอร์สำรองชุดเดียวกัน
            </p>
            {walFiles.length > 0 && (
              <button type="button" className="btn-secondary mt-2" onClick={() => { clearWalFiles(); clearPreview() }}>
                ล้างไฟล์ -wal
              </button>
            )}
          </fieldset>
        )}
        <p className="mt-3 text-sm text-[var(--fg-secondary)]">แอปอ่านไฟล์ต้นฉบับในเบราว์เซอร์และส่งเฉพาะข้อมูลเพลงที่เลือกเมื่อกดนำเข้า</p>
        <button className="btn-primary mt-4" type="submit" disabled={reading || saving}>ตรวจรายการเพลง</button>
        {reading && <p className="mt-3 text-sm" role="status">กำลังอ่านฐานข้อมูล…</p>}
        {readError && <p id="easyworship-read-error" className="mt-3 text-sm text-[var(--status-error-text)]" role="alert">{readError}</p>}
      </form>

      {preview && (
        <section className="flex flex-col gap-4" aria-labelledby="easyworship-preview-title">
          <div>
            <h2 id="easyworship-preview-title" className="text-lg font-medium">ตรวจรายการเพลง</h2>
            <p className="text-sm text-[var(--fg-secondary)]" role="status">
              อ่านได้ {preview.songs.length} เพลง · เลือก {selectedCount} เพลง · อ่านไม่ได้ {preview.skipped.length} เพลง
            </p>
          </div>
          {preview.recoveredLyricsOnly && <p className="text-sm text-[var(--fg-secondary)]">{easyWorshipLyricsRecoveryNotice}</p>}
          {Boolean(preview.warnings?.length) && (
            <details className={panel}>
              <summary className="cursor-pointer">ข้อสังเกตจากไฟล์ต้นฉบับ</summary>
              <ul className="mt-2! space-y-1 text-sm">{preview.warnings?.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </details>
          )}

          {preview.songs.length > 0 && (
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <div className={panel}>
                <label className="mb-3 flex flex-col gap-2">
                  <span className="text-sm">ค้นหาในรายการนำเข้า</span>
                  <input className="input-field" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
                </label>
                {visibleSongs.length === 0 && <p className="text-sm text-[var(--fg-secondary)]">ไม่พบเพลงที่ตรงกับคำค้น</p>}
                <ul className="max-h-80 divide-y divide-[var(--border-subtle)] overflow-y-auto">
                  {visibleSongs.map((song) => (
                    <li key={song.sourceId} className="flex min-w-0 items-start gap-3 py-2">
                      <input className="mt-1 size-4 shrink-0 accent-[var(--accent)]" type="checkbox" aria-label={`เลือก ${song.title}`}
                        disabled={saveStarted} checked={!excluded.has(song.sourceId)} onChange={(event) => {
                          const checked = event.target.checked
                          setExcluded((current) => {
                            const next = new Set(current)
                            if (checked) next.delete(song.sourceId)
                            else next.add(song.sourceId)
                            return next
                          })
                        }} />
                      <button type="button" className="min-w-0 flex-1 cursor-pointer text-left wrap-break-word hover:underline"
                        aria-pressed={activeSong?.sourceId === song.sourceId} onClick={() => setActiveSong(song)}>
                        <span className={activeSong?.sourceId === song.sourceId ? 'font-medium text-[var(--accent)]' : ''}>{song.title}</span>
                        {song.author && <span className="block text-sm text-[var(--fg-secondary)]">{song.author}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {activeSong && (
                <div className={panel}>
                  <h3 className="text-base font-medium wrap-break-word">{activeSong.title}</h3>
                  <p className="mt-1 text-sm wrap-break-word text-[var(--fg-secondary)]">
                    {[activeSong.author, activeSong.copyright, activeSong.administrator && `ดูแลลิขสิทธิ์โดย ${activeSong.administrator}`,
                      activeSong.ccli && `CCLI #${activeSong.ccli}`].filter(Boolean).join(' · ')}
                  </p>
                  {activeSong.description && <p className="mt-2 text-sm whitespace-pre-wrap wrap-anywhere">{activeSong.description}</p>}
                  {activeSong.tags?.length ? <p className="mt-2 text-sm wrap-anywhere">แท็กเพลง · {activeSong.tags.join(' · ')}</p> : null}
                  {activeSong.appearance?.sections?.length ? (
                    <p className="mt-2! text-sm">พบรูปแบบต้นทาง {activeSong.appearance.sections.length} ท่อน</p>
                  ) : activeSong.appearance?.defaultDesign ? (
                    <p className="mt-2! text-sm">พบรูปแบบที่ตั้งไว้กับเพลงนี้</p>
                  ) : null}
                  {Boolean(activeSong.appearance?.warnings?.length) && (
                    <ul className="mt-2! space-y-1 text-sm text-[var(--fg-secondary)]">
                      {activeSong.appearance?.warnings?.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                  )}
                  <ol className="mt-3 max-h-80 space-y-3 overflow-y-auto" aria-label="ท่อนเพลงตามลำดับ">
                    {activeSong.sections.map((section, index) => (
                      <li className="rounded-md bg-[var(--bg-tertiary)] p-3" key={index}>
                        {section.label && <p className="text-sm text-[var(--accent)]">{section.label}</p>}
                        <p className="whitespace-pre-wrap wrap-break-word text-sm">{section.lines.join('\n')}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}

          {preview.skipped.length > 0 && (
            <details className={panel}>
              <summary className="cursor-pointer">เพลงที่อ่านไม่ได้ ({preview.skipped.length})</summary>
              <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm text-[var(--fg-secondary)]">
                {preview.skipped.map((song, index) => (
                  <li key={index}><strong>{song.title || song.sourceId}</strong> — {song.reason}</li>
                ))}
              </ul>
            </details>
          )}

          {preview.songs.length > 0 && (
            <div className={`${panel} flex flex-col items-start gap-3`}>
              <p className="text-sm text-[var(--fg-secondary)]">{preview.recoveredLyricsOnly
                ? 'การนำเข้า SongWords เดิมอีกครั้งจะคงเพลงที่บันทึกไว้'
                : 'นำเข้าซ้ำเพื่อเติมข้อมูล เลย์เอาต์ หรือไฟล์ที่ขาดในเพลงเดิมจากต้นทางที่ตรงกัน'}</p>
              {!finished && (
                <button className="btn-primary" type="button" onClick={importSelected} disabled={!selectedCount || saving}>
                  {saving ? 'กำลังนำเข้า…' : saveError ? `นำเข้าต่ออีก ${selectedCount - processed} เพลง` : `นำเข้า ${selectedCount} เพลง`}
                </button>
              )}
              {(saving || finished || processed > 0) && (
                <p role="status" className="text-sm">{finished ? 'นำเข้าเสร็จแล้ว · ' : ''}เพิ่มแล้ว {progress.added} เพลง · มีอยู่แล้ว {progress.duplicates} เพลง
                  {Boolean(progress.filled) && ` · เติมข้อมูลหรือรูปแบบในเพลงเดิม ${progress.filled} เพลง`}</p>
              )}
              {Boolean(progress.warnings?.length) && <details className="max-w-full text-sm">
                <summary className="cursor-pointer">รายละเอียดการนำเข้าและไฟล์ที่ยังขาด</summary>
                <ul className="mt-2 max-h-56 list-disc space-y-1 overflow-auto pl-4">
                  {progress.warnings?.map((warning) => <li key={warning} className="wrap-anywhere">{warning}</li>)}
                </ul>
              </details>}
              {saveError && <p className="text-sm text-[var(--status-error-text)]" role="alert">{saveError}</p>}
              {finished && <Link className="btn-primary" to="/">เปิดคลังเพลง</Link>}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
