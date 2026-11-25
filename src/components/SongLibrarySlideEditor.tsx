/** Formats selected lyrics and prepares slide breaks in the reusable library song. */

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { Section } from '../types/database'
import type { DvdClip } from '../types/dvdClip'
import type { SlideTransition, SongAppearance, SongSlideLayout } from '../types/slideDesign'
import type { MediaLibraryItem } from '../types/media'
import type { LiveFeed } from '../types/liveFeed'
import { LayeredSlide } from './LayeredSlide'
import { LyricFormatControls } from './LyricFormatControls'
import { SongSlideLayoutFields } from './SongSlideLayoutFields'
import { SlideTransitionFields } from './SlideTransitionFields'
import { SlideAdvanceFields } from './SlideAdvanceFields'
import { ParagraphTextRuns, safeColor, safeFont, StyledTextRuns } from './StyledTextRuns'
import { getSectionDisplayLabel, getSectionSlideLabel } from '../utils/chordParser'
import { songSectionDesign } from '../utils/playlistCues'
import { reflowSongCueSlide, songCueLyrics, songSlideLyricRuns } from '../utils/songCueLayout'
import { librarySectionCue, preparedLibrarySection, sectionLyricText, songBreakOffset } from '../utils/songLibrarySlides'
import type { LyricSelection } from '../utils/songLyricFormatting'
import { applySongSlideLayout } from '../utils/songSlideLayout'
import { listLibraryDvds, listLibraryFeeds, listLibraryMedia } from '../utils/mediaLibrary'
import type { PlaybackSlide } from '../utils/slidePlayback'

export function SongLibrarySlideEditor({ sections: initial, appearance, onApply, onClose }: {
  sections: Section[]; appearance?: SongAppearance | null
  onApply: (sections: Section[], master?: SongSlideLayout, looping?: boolean) => void; onClose: () => void
}) {
  const [sections, setSections] = useState(initial)
  const [index, setIndex] = useState(0)
  const [notice, setNotice] = useState('')
  const [selection, setSelection] = useState<LyricSelection>()
  const [master, setMaster] = useState(appearance?.slideLayout)
  const [looping, setLooping] = useState(appearance?.looping)
  const [layoutIndex, setLayoutIndex] = useState(0)
  const [media, setMedia] = useState<MediaLibraryItem[]>([])
  const [feeds, setFeeds] = useState<LiveFeed[]>([])
  const [dvds, setDvds] = useState<DvdClip[]>([])
  const dialog = useRef<HTMLDialogElement>(null)
  const lyricInput = useRef<HTMLTextAreaElement>(null)
  const id = useId()
  const section = sections[index]
  const text = sectionLyricText(section)
  const breaks = Array.isArray(section.slideBreaks) ? section.slideBreaks : undefined
  const design = songSectionDesign({ appearance }, sections, index)
  const source = librarySectionCue(section, design)
  const runs = songSlideLyricRuns(source)
  const base = songCueLyrics(source)?.layer?.style
  const slides = breaks ? preparedLibrarySection(section, design, master)
    : text.trim() ? reflowSongCueSlide(source, 4).map((slide) => applySongSlideLayout(slide, master)) : []
  const activeLayoutIndex = Math.max(0, Math.min(layoutIndex, slides.length - 1))
  const starts = [0, ...(breaks ?? [])]
  const start = starts[activeLayoutIndex]
  const slideLayout = section.slideLayouts?.find((layout) => layout.start === start)?.layout

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => { if (element?.open) element.close() }
  }, [])

  useEffect(() => {
    let active = true
    void listLibraryMedia().then((items) => { if (active) setMedia(items) }).catch(() => undefined)
    void listLibraryFeeds().then((items) => { if (active) setFeeds(items) }).catch(() => undefined)
    void listLibraryDvds().then((items) => { if (active) setDvds(items) }).catch(() => undefined)
    return () => { active = false }
  }, [])

  function changeBreaks(next: number[] | null, inserted?: number) {
    setSections((current) => current.map((item, position) => {
      if (position !== index) return item
      const layouts = item.slideLayouts?.filter(({ start }) => !next || start === 0 || next.includes(start)) ?? []
      if (inserted !== undefined && !starts.includes(inserted)) {
        const earlier = starts.filter((offset) => offset < inserted)
        const inherited = layouts.find(({ start }) => start === earlier[earlier.length - 1])
        if (inherited) layouts.push({ start: inserted, layout: inherited.layout })
      }
      return { ...item, slideBreaks: next, slideLayouts: layouts.length ? layouts : undefined }
    }))
  }

  function changeSlideLayout(layout?: SongSlideLayout) {
    setSections((current) => current.map((item, position) => {
      if (position !== index) return item
      const layouts = item.slideLayouts?.filter((entry) => entry.start !== start) ?? []
      if (layout) layouts.push({ start, layout })
      return { ...item, slideLayouts: layouts.length ? layouts.sort((left, right) => left.start - right.start) : undefined }
    }))
  }

  function format(lyricRuns: NonNullable<Section['lyricRuns']>) {
    setSections((current) => current.map((item, position) => position === index ? { ...item, lyricRuns } : item))
    setNotice('ปรับรูปแบบในฉบับร่างแล้ว')
  }

  function changeTransition(transition?: SlideTransition, applyToSong = false) {
    setSections((current) => current.map((item, position) => applyToSong || position === index
      ? { ...item, transition: transition ?? null } : item))
    if (applyToSong) setNotice('ใช้เอฟเฟ็กต์นี้กับทุกท่อนในฉบับร่างแล้ว')
  }

  function changePlayback({ advanceMs, playback }: PlaybackSlide) {
    const delay = advanceMs ?? playback?.delayMs
    if (delay !== undefined && (!Number.isSafeInteger(delay) || delay < 0 || delay > 2_147_483_647)) {
      setNotice('เวลาเลื่อนสไลด์อยู่นอกช่วงที่รองรับ')
      return
    }
    setNotice('')
    const timing = delay === undefined ? playback : { ...playback, delayMs: delay }
    setSections((current) => current.map((item, position) => position === index ? { ...item, playback: timing } : item))
  }

  function insertBreak() {
    const offset = songBreakOffset(text, lyricInput.current?.selectionStart ?? 0)
    if (offset === undefined) {
      setNotice('วางเคอร์เซอร์ระหว่างเนื้อร้องที่จะอยู่คนละสไลด์')
      return
    }
    const proposed = [...new Set([...(breaks ?? []), offset])].sort((a, b) => a - b)
    if (preparedLibrarySection({ ...section, slideBreaks: proposed }).length !== proposed.length + 1) {
      setNotice('เลือกจุดแบ่งที่มีเนื้อร้องทั้งสองด้าน')
      return
    }
    changeBreaks(proposed, offset)
    setNotice(breaks?.includes(offset) ? 'มีจุดแบ่งตรงนี้แล้ว' : 'เพิ่มจุดแบ่งแล้ว')
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return
    event.preventDefault()
    insertBreak()
  }

  return <dialog ref={dialog} aria-labelledby={`${id}-title`}
    className="surface m-auto! max-h-[90dvh] w-[min(44rem,calc(100vw-1rem))] overflow-y-auto rounded-lg border border-[var(--border-subtle)] p-4! text-[var(--fg-primary)] backdrop:bg-black/60 sm:p-6!"
    onCancel={(event) => { event.preventDefault(); onClose() }}>
    <div className="grid min-w-0 gap-4">
      <h2 id={`${id}-title`} className="text-lg font-medium">จัดสไลด์ในคลังเพลง</h2>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <div className="grid min-w-0 gap-1.5">
          <label htmlFor={`${id}-section`}>ท่อนเพลง</label>
          <select id={`${id}-section`} className="input-field min-w-0" value={index} onChange={(event) => {
            setIndex(Number(event.currentTarget.value))
            setLayoutIndex(0)
            setSelection(undefined)
            setNotice('')
          }}>
            {sections.map((item, position) => <option key={position} value={position}>{position + 1}. {getSectionSlideLabel(item) || 'เนื้อร้อง'}</option>)}
          </select>
        </div>
        <div className="grid min-w-0 gap-1.5">
          <label htmlFor={`${id}-mode`}>วิธีแบ่งท่อนนี้</label>
          <select id={`${id}-mode`} className="input-field min-w-0" value={breaks ? 'prepared' : 'auto'} onChange={(event) => {
            const previousStarts = (section.slideLayouts ?? []).map(({ start }) => start).filter((start) => start > 0).sort((a, b) => a - b)
            changeBreaks(event.currentTarget.value === 'auto' ? null : previousStarts)
            setNotice('')
          }}>
            <option value="auto">แบ่งอัตโนมัติเมื่อฉาย</option>
            <option value="prepared">ใช้จุดแบ่งที่กำหนด</option>
          </select>
        </div>
      </div>
      <label className="grid min-w-0 gap-1.5 text-sm">
        ป้ายชื่อท่อนบนสไลด์
        <input className="input-field min-w-0" value={section.slideLabel ?? ''} placeholder={getSectionDisplayLabel(section) || 'ชื่อท่อน'}
          onChange={(event) => {
            const slideLabel = event.currentTarget.value
            setSections((current) => current.map((item, position) => position === index ? { ...item, slideLabel } : item))
          }} />
      </label>
      <div className="grid min-w-0 gap-1.5">
        <label htmlFor={`${id}-lyrics`}>เนื้อร้องสำหรับวางเคอร์เซอร์</label>
        <textarea key={index} ref={lyricInput} id={`${id}-lyrics`} value={text} readOnly rows={4} onKeyDown={keyDown}
          onSelect={(event) => {
            const element = event.currentTarget
            setSelection({ start: element.selectionStart, end: element.selectionEnd })
          }} className="input-field min-w-0" />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary" disabled={!text.trim()} onClick={insertBreak}>แบ่งสไลด์ตรงเคอร์เซอร์</button>
          <span className="text-xs text-[var(--fg-secondary)]">Ctrl+Enter หรือ ⌘+Enter</span>
        </div>
      </div>
      <LyricFormatControls key={index} text={text} runs={runs} base={base} selection={selection} onApply={format} />
      <details className="grid min-w-0 rounded-md border border-[var(--border-subtle)] p-3">
        <summary className="cursor-pointer font-medium">เอฟเฟ็กต์ของท่อนเพลง</summary>
        <div className="mt-3 grid min-w-0 gap-3">
          <SlideTransitionFields value={section.transition ?? undefined} onChange={changeTransition} />
          {sections.length > 1 && <button type="button" className="btn-secondary justify-self-start"
            onClick={() => changeTransition(section.transition ?? undefined, true)}>ใช้เอฟเฟ็กต์นี้กับทุกท่อน</button>}
        </div>
      </details>
      <details className="grid min-w-0 rounded-md border border-[var(--border-subtle)] p-3">
        <summary className="cursor-pointer font-medium">เวลาเลื่อนสไลด์ของท่อนเพลง</summary>
        <div className="mt-3 grid min-w-0 gap-3">
          <SlideAdvanceFields value={section} onChange={changePlayback} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={Boolean(looping)} onChange={(event) => setLooping(event.currentTarget.checked)} />
            วนกลับสไลด์แรกเมื่อสไลด์สุดท้ายเลื่อนอัตโนมัติ
          </label>
        </div>
      </details>
      <details className="grid min-w-0 rounded-md border border-[var(--border-subtle)] p-3">
        <summary className="cursor-pointer font-medium">เค้าโครงหลักของเพลง</summary>
        <div className="mt-3">
          <SongSlideLayoutFields layout={master} effective={applySongSlideLayout(source, master)} media={media} feeds={feeds} dvds={dvds} onChange={setMaster} />
        </div>
      </details>
      {breaks && slides.length > 0 && <details className="grid min-w-0 rounded-md border border-[var(--border-subtle)] p-3">
        <summary className="cursor-pointer font-medium">เค้าโครงเฉพาะสไลด์</summary>
        <div className="mt-3 grid min-w-0 gap-3">
          <label htmlFor={`${id}-layout-slide`}>สไลด์ที่จะจัดเค้าโครง</label>
          <select id={`${id}-layout-slide`} className="input-field min-w-0" value={activeLayoutIndex}
            onChange={(event) => setLayoutIndex(Number(event.currentTarget.value))}>
            {slides.map((slide, position) => <option value={position} key={position}>{position + 1}. {slide.lines.find((line) => line.trim()) ?? slide.label}</option>)}
          </select>
          <SongSlideLayoutFields layout={slideLayout} effective={slides[activeLayoutIndex]} media={media} feeds={feeds} dvds={dvds} onChange={changeSlideLayout} />
        </div>
      </details>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      <div className="grid min-w-0 gap-2">
        <h3 className="font-medium">{breaks ? 'ตัวอย่างสไลด์' : 'ตัวอย่างเมื่อแบ่งอัตโนมัติ 4 บรรทัด'}</h3>
        <ol aria-label="ตัวอย่างสไลด์" className="grid min-w-0 gap-2">
          {slides.map((slide, position) => {
            const previewRuns = songSlideLyricRuns(slide) ?? [{ text: slide.lines.join('\n') }]
            const paragraphs = previewRuns.some((run) => run.paragraph)
            return <li key={position} className="grid min-w-0 gap-1 rounded-md border border-[var(--border-subtle)] p-2!">
              <span className="text-xs text-[var(--fg-secondary)]">สไลด์ {position + 1}</span>
              {slide.design && (master || (breaks && section.slideLayouts?.some(({ start }) => start === starts[position])))
                ? <div className="aspect-video overflow-hidden rounded-md"><LayeredSlide design={slide.design} preview /></div>
                : <div className="min-w-0 whitespace-pre-wrap wrap-anywhere rounded-md bg-black p-2!" style={{ color: safeColor(base?.color, '#ffffff'),
                fontFamily: base?.fontFamily ? safeFont(base.fontFamily) : undefined, fontWeight: base?.bold ? 700 : undefined,
                fontStyle: base?.italic ? 'italic' : undefined, textAlign: paragraphs ? base?.align ?? 'center' : undefined }}>
                {paragraphs ? <ParagraphTextRuns runs={previewRuns} base={base} /> : <StyledTextRuns runs={previewRuns} base={base} />}
              </div>}
              {breaks?.[position] !== undefined && <button type="button" className="btn-ghost justify-self-start" onClick={() => {
                changeBreaks(breaks.filter((_, at) => at !== position))
                setNotice('ลบจุดแบ่งแล้ว')
              }}>รวมกับสไลด์ถัดไป</button>}
            </li>
          })}
        </ol>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>ยกเลิก</button>
        <button type="button" className="btn-primary" onClick={() => onApply(sections, master, looping)}>ใช้การจัดสไลด์</button>
      </div>
    </div>
  </dialog>
}
