/** Previews and presents a library song, including its migrated slide appearance. */

import { useCallback, useEffect, useState } from 'react'
import type { Song } from '../types/database'
import type { LyricLayout } from '../utils/slideBuilder'
import { LayeredSlide } from './LayeredSlide'
import { LayeredFeedAssignments } from './LayeredFeedAssignments'
import { DvdReplacementControl } from './DvdReplacementControl'
import { ParagraphTextRuns, StyledTextRuns } from './StyledTextRuns'
import { lyricRunsByLine } from '../utils/songLyricFormatting'
import { getSongPresentationSlides, songOutputLabel } from '../utils/playlistCues'
import { useStandalonePresenter } from '../hooks/useStandalonePresenter'
import { useDefaultThemes } from '../hooks/useDefaultThemes'
import { librarySoundtrack } from '../utils/presentationChannel'
import { createSongProjectionTracker, librarySongProjection } from '../utils/songProjection'
import { songUsesAutomaticLayout } from '../utils/songLibrarySlides'
import { assignableDvdClips } from '../utils/dvdReplacement'
import { createSlideAdvanceController, getSlideAdvance } from '../utils/slidePlayback'

export function SongPresentation({ song }: { song: Song }) {
  const [historyError, setHistoryError] = useState(false)
  const projectionFailed = useCallback(() => setHistoryError(true), [])
  const [slideAdvance] = useState(createSlideAdvanceController)
  const send = useStandalonePresenter('song', slideAdvance.report, undefined, projectionFailed)
  const [trackProjection] = useState(createSongProjectionTracker)
  const defaults = useDefaultThemes()
  const hasImportedAppearance = Boolean(song.appearance?.defaultDesign || song.appearance?.sections?.length || song.appearance?.warnings?.length)
  const [layout, setLayout] = useState<LyricLayout>(hasImportedAppearance ? 'stanza' : 4)
  const [index, setIndex] = useState(0)
  const [liveIndex, setLiveIndex] = useState<number>()
  const [error, setError] = useState('')
  useEffect(() => {
    window.addEventListener('pagehide', slideAdvance.cancel)
    return () => {
      window.removeEventListener('pagehide', slideAdvance.cancel)
      slideAdvance.cancel()
    }
  }, [slideAdvance, song.id])
  const automatic = songUsesAutomaticLayout(song)
  const slides = getSongPresentationSlides(song, layout, undefined, defaults)
  const slide = slides[index]
  if (!slide) return null
  const styledLyrics = lyricRunsByLine(slide.lines.join('\n'), slide.lyricRuns)
  const paragraphLyrics = styledLyrics && slide.lyricRuns?.some((run) => run.paragraph) ? slide.lyricRuns : undefined

  function show(position: number, begin = false, openWindow = true) {
    const selected = slides[position]
    if (!selected) return
    setError('')
    try {
      const playback = selected.playback
      const plan = getSlideAdvance(slides, position, song.appearance?.looping)
      const completionId = slideAdvance.start(plan, (next) => show(next, false, false), (reason) => setError(reason === 'failed'
        ? 'สื่อเล่นไม่จบ กรุณาเลือกสไลด์ถัดไปเอง' : 'สไลด์นี้ไม่มีเสียงหรือวิดีโอให้รอจบ'))
      const runId = playback?.restart || playback?.mode === 'media' ? crypto.randomUUID() : undefined
      const soundtrack = librarySoundtrack(selected.assets, song.id, runId)
      if (begin) {
        setHistoryError(false)
        trackProjection()
      }
      const songProjection = trackProjection(song.id, librarySongProjection(song))
      const songLabel = songOutputLabel(selected.sectionLabel)
      const details = { transition: selected.transition, soundtrack, songProjection, songLabel,
        cuePlayback: playback && { completionId, runId, once: playback.mode === 'media', loop: playback.loop } }
      const sent = send(selected.design ? { type: 'SHOW_DESIGN', design: selected.design, ...details }
        : { type: 'SHOW_LYRICS', lyrics: selected.lines.join('\n'), lyricRuns: selected.lyricRuns, ...details }, openWindow)
      if (!sent) {
        slideAdvance.cancel()
        setLiveIndex(undefined)
        return
      }
      if (!soundtrack && selected.assets?.some((asset) => asset.kind === 'audio')) setError('ไม่พบไฟล์เสียงประกอบในคลังสื่อของเบราว์เซอร์นี้')
      setIndex(position)
      setLiveIndex(position)
    } catch (cause) {
      slideAdvance.cancel()
      setError(cause instanceof Error ? cause.message : 'เปิดจอผู้ชมไม่สำเร็จ')
    }
  }

  return (
    <details className="surface mb-4! rounded-xl p-4! sm:p-5!">
      <summary className="cursor-pointer font-medium">นำเสนอเพลงจากคลัง</summary>
      <div className="mt-4! grid min-w-0 gap-4 md:grid-cols-2">
        <div className="min-w-0 space-y-3">
          <label className="flex min-w-0 flex-col gap-2 text-sm">แบ่งเนื้อร้อง
            <select className="input-field min-w-0" value={automatic ? layout : 'saved'} disabled={!automatic} onChange={(event) => {
              const value = event.target.value
              setLayout(value === 'stanza' ? value : Number(value) as LyricLayout)
              slideAdvance.cancel()
              setIndex(0)
              if (liveIndex !== undefined) send({ type: 'SHOW_BLACK' }, false)
              setLiveIndex(undefined)
            }}>
              {!automatic && <option value="saved">ตามสไลด์ในคลังเพลง</option>}
              <option value="1">1 บรรทัด</option><option value="2">2 บรรทัด</option><option value="4">4 บรรทัด</option>
              <option value="stanza">ทั้งท่อน</option>
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-2 text-sm">สไลด์เพลง
            <select className="input-field min-w-0" value={index} onChange={(event) => setIndex(Number(event.target.value))}>
              {slides.map((item, position) => <option key={position} value={position}>{position + 1}. {item.sectionLabel}</option>)}
            </select>
          </label>
          <LayeredFeedAssignments design={slide.design} onAssigned={() => { if (liveIndex === index) show(index) }} />
          {assignableDvdClips(slide.design, slide.assets).map((dvd) => <DvdReplacementControl key={dvd.id} dvd={dvd}
            onApply={() => { if (liveIndex === index) show(index) }} />)}
          <div className="flex min-w-0 flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => show(index, true)}>ขึ้นสไลด์ที่เลือก</button>
            {liveIndex !== undefined && (
              <>
                <button type="button" className="chip-btn" disabled={liveIndex === 0} onClick={() => show(liveIndex - 1)}>ก่อนหน้า</button>
                <button type="button" className="chip-btn" disabled={liveIndex >= slides.length - 1} onClick={() => show(liveIndex + 1)}>ถัดไป</button>
                <button type="button" className="btn-secondary" onClick={() => {
                  slideAdvance.cancel()
                  send({ type: 'SHOW_BLACK' }, false)
                  setLiveIndex(undefined)
                }}>ล้างจอผู้ชม</button>
              </>
            )}
          </div>
          {liveIndex !== undefined && <p role="status" className="text-sm">กำลังแสดงสไลด์ {liveIndex + 1}</p>}
          {error && <p role="alert" className="text-sm wrap-anywhere text-[var(--status-error-text)]">{error}</p>}
          {historyError && <p role="alert" className="text-sm text-[var(--status-error-text)]">ขึ้นจอแล้ว · บันทึกประวัติการฉายเพลงในเบราว์เซอร์ไม่สำเร็จ</p>}
        </div>
        <div className="aspect-video min-w-0 overflow-hidden rounded-lg bg-black" aria-label="ตัวอย่างสไลด์เพลง">
          {slide.design ? <LayeredSlide design={slide.design} preview />
            : <div className="flex h-full flex-col items-center justify-center gap-1 p-3! text-center text-sm text-white">
              {paragraphLyrics ? <div className="w-full min-w-0 wrap-anywhere"><ParagraphTextRuns runs={paragraphLyrics} /></div>
                : slide.lines.map((line, position) => <p key={position} className="wrap-anywhere">{styledLyrics ? <StyledTextRuns runs={styledLyrics[position]} /> : line}</p>)}
            </div>}
        </div>
      </div>
      {Boolean(song.appearance?.warnings?.length) && (
        <details className="mt-3! text-sm text-[var(--fg-secondary)]">
          <summary className="cursor-pointer">รายละเอียดรูปแบบจาก EasyWorship</summary>
          <ul className="mt-2! space-y-1">{song.appearance?.warnings?.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </details>
      )}
    </details>
  )
}
