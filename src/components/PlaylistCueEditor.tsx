/** Edits one playlist occurrence, including its source slide order and attachments. */

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type SyntheticEvent } from 'react'
import { LayeredSlide } from './LayeredSlide'
import { SlideLayoutPreview } from './SlideLayoutPreview'
import { InsertSlideShape } from './ShapeFrameFields'
import { ScriptureFrameButton } from './ScriptureFrameButton'
import { FeedLayerFields } from './FeedLayerFields'
import { LyricFormatControls } from './LyricFormatControls'
import { SlideParagraphTextField } from './LyricParagraphControls'
import { SongSlideLayoutFields } from './SongSlideLayoutFields'
import { ParagraphTextRuns, StyledTextRuns } from './StyledTextRuns'
import { alignedLyricRuns, lyricRunsByLine, type LyricSelection } from '../utils/songLyricFormatting'
import { SlideAdvanceFields } from './SlideAdvanceFields'
import { SlideTransitionFields } from './SlideTransitionFields'
import { TextDocumentImport } from './TextDocumentImport'
import { newWebLayer, WebLayerEditor } from './WebLayerEditor'
import { libraryMediaCueAsset, listLibraryDvds, listLibraryFeeds, listLibraryMedia } from '../utils/mediaLibrary'
import { cueForEditing, editCueAsset, editCueDesign, editCueLines, editCueTextLayer, formatCueLyrics, type CueSlide } from '../utils/playlistCueEditing'
import { scriptureReference } from '../utils/scriptureOutput'
import { CUE_LABELS, getPlaylistSlides } from '../utils/playlistCues'
import { liveFeedAsset, presentationWebUrl } from '../utils/livePresentation'
import { isScriptureFrame, normalizeDesignWebLayers, withDesignBackground } from '../utils/slideDesign'
import { isLyricLayout, type LyricLayout } from '../utils/slideBuilder'
import { songCueLyrics, splitSongCueSlide } from '../utils/songCueLayout'
import { editableSongArtwork } from '../utils/songSlideLayout'
import { withDocumentText, type TextDocumentSlide } from '../utils/textDocument'
import { maxSpeakerNotesLength } from '../utils/speakerNotes'
import { editElementEffects, moveLayerFrame } from '../utils/slideElementEffects'
import type { MediaLibraryItem } from '../types/media'
import type { LiveFeed } from '../types/liveFeed'
import type { PlaylistCue, PlaylistCueAsset, PlaylistSong } from '../types/database'
import type { DvdClip } from '../types/dvdClip'
import type { SlideDesign, SongSlideLayout } from '../types/slideDesign'

type DraftSlide = { key: string; slide: CueSlide }
const field = 'flex min-w-0 flex-col gap-1.5 text-sm'

function lines(text: string): string[] {
  return text ? text.replace(/\r\n?/g, '\n').split('\n') : []
}

export function PlaylistCueEditor({ entry, creating = false, onSave, onClose }: {
  entry: PlaylistSong
  creating?: boolean
  onSave: (cue: PlaylistCue | null) => Promise<void>
  onClose: () => void
}) {
  const initial = cueForEditing(entry)
  const fieldId = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const lyricInput = useRef<HTMLTextAreaElement>(null)
  const saving = useRef(false)
  const [label, setLabel] = useState(initial?.label ?? '')
  const [looping, setLooping] = useState(initial?.looping)
  const [lyricLayout, setLyricLayout] = useState<LyricLayout | undefined>(initial?.lyricLayout)
  const [slideLayout, setSlideLayout] = useState(initial?.slideLayout)
  const [layoutScope, setLayoutScope] = useState<'slide' | 'cue'>('slide')
  const [note, setNote] = useState(initial?.metadata?.notes?.toString() ?? '')
  const [slides, setSlides] = useState<DraftSlide[]>(() => (initial?.slides ?? []).map((slide) => ({ key: crypto.randomUUID(), slide })))
  const [selectedKey, setSelectedKey] = useState('')
  const [lyricSelection, setLyricSelection] = useState<{ key: string; text: string; range: LyricSelection }>()
  const [previewIndex, setPreviewIndex] = useState(0)
  const [media, setMedia] = useState<MediaLibraryItem[]>([])
  const [feeds, setFeeds] = useState<LiveFeed[]>([])
  const [dvds, setDvds] = useState<DvdClip[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const index = Math.max(0, slides.findIndex((item) => item.key === selectedKey))
  const selected = slides[index]
  const slide = selected?.slide
  const songCue = initial?.kind === 'song'
  const songLyrics = songCue && slide ? songCueLyrics(slide) : undefined
  const activeSelection = songLyrics && lyricSelection?.key === selected?.key && lyricSelection?.text === songLyrics.text
    ? lyricSelection.range : undefined
  const projectedSlides = initial && slide ? getPlaylistSlides({ ...entry, cue: { ...initial, lyricLayout, slideLayout, slides: [slide] } }, 'stanza') : []
  const activePreview = Math.max(0, Math.min(previewIndex, projectedSlides.length - 1))
  const projected = projectedSlides[activePreview]
  const layoutPreview = layoutScope === 'cue' && initial && slide?.slideLayout ? getPlaylistSlides({ ...entry, cue: {
    ...initial, slideLayout, slides: [{ ...slide, slideLayout: undefined }],
  } }, 'stanza')[0] : projected
  const themedLyrics = projected?.design?.layers.find((layer) => layer.kind === 'text' && layer.slot === 'content')
  const previewRuns = projected && lyricRunsByLine(projected.lines.join('\n'), projected.lyricRuns)
  const previewParagraphs = previewRuns && projected?.lyricRuns?.some((run) => run.paragraph) ? projected.lyricRuns : undefined
  const preview: SlideDesign | undefined = projected?.design
    ? entry.background_asset ? withDesignBackground(projected.design, entry.background_asset) : projected.design
    : undefined

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

  function changeSlide(update: (current: CueSlide) => CueSlide, scriptureText = false) {
    setSlides((current) => current.map((item, position) => position === index
      ? { ...item, slide: { ...update(item.slide),
        ...(scriptureText && initial?.kind === 'scripture' ? { textEdited: true, scriptureVerseStarts: undefined } : {}),
      } } : item))
    setError('')
  }

  function useSoundtrackOnAllSlides(asset: PlaylistCueAsset) {
    setSlides((current) => current.map((item) => ({
      ...item,
      slide: {
        ...item.slide,
        assets: [...(item.slide.assets ?? []).filter((media) => media.kind !== 'audio'), { ...asset, role: 'background' }],
      },
    })))
  }

  function selectSlide(key: string) {
    setSelectedKey(key)
    setLyricSelection(undefined)
    setPreviewIndex(0)
    setError('')
  }

  function selectLyrics(event: SyntheticEvent<HTMLTextAreaElement>) {
    if (!selected) return
    const { value, selectionStart, selectionEnd } = event.currentTarget
    setLyricSelection({ key: selected.key, text: value, range: { start: selectionStart, end: selectionEnd } })
  }

  function splitAtCursor() {
    const caret = lyricInput.current?.selectionStart
    if (!selected || !songCue || caret === undefined) return
    const result = splitSongCueSlide(selected.slide, caret)
    if (!result) {
      setError('วางเคอร์เซอร์ระหว่างข้อความที่จะอยู่คนละสไลด์')
      lyricInput.current?.focus()
      return
    }
    const [first, next] = result
    const key = crypto.randomUUID()
    setSlides((current) => current.flatMap((item) => item.key === selected.key
      ? [{ key: item.key, slide: first }, { key, slide: next }] : [item]))
    selectSlide(key)
    requestAnimationFrame(() => {
      lyricInput.current?.focus()
      lyricInput.current?.setSelectionRange(0, 0)
    })
  }

  function splitFromShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return
    event.preventDefault()
    splitAtCursor()
  }

  function insertSlide(copy: boolean) {
    const key = crypto.randomUUID()
    const position = copy ? index + 1 : slides.length
    const next = copy && slide
      ? { ...slide, sourceId: undefined, sourceOrder: undefined, transitionEdited: undefined }
      : { label: `สไลด์ ${position + 1}`, lines: [] }
    setSlides((current) => [...current.slice(0, position), { key, slide: next }, ...current.slice(position)])
    selectSlide(key)
  }

  function importTextSlides(fragments: TextDocumentSlide[]) {
    if (!selected || !slide) return
    const fillSelected = !slide.lines.some((line) => line.trim()) && !slide.chords?.some((line) => line.trim())
      && !slide.design?.layers.some((layer) => layer.kind === 'text' && layer.text.trim())
    const added = fragments.map((fragment, position): DraftSlide => {
      const replacing = fillSelected && position === 0
      const base: CueSlide = replacing ? slide : {
        label: `สไลด์ ${slides.length + position + (fillSelected ? 0 : 1)}`, lines: [],
        ...(songCue ? { sectionType: slide.sectionType ?? 'verse' } : {}),
      }
      const design = base.design ?? (!songCue && fragment.runs ? { aspectRatio: slide.design?.aspectRatio ?? 16 / 9, layers: [] } : undefined)
      return {
        key: replacing ? selected.key : crypto.randomUUID(),
        slide: { ...base, lines: fragment.text.split('\n'),
          ...(design ? { design: withDocumentText(design, fragment) } : songCue ? { lyricRuns: fragment.runs } : {}) },
      }
    })
    const start = fillSelected ? index : index + 1
    setSlides((current) => [...current.slice(0, start), ...added, ...current.slice(index + 1)])
    selectSlide(added[0].key)
  }

  function moveSlide(delta: number) {
    const nextIndex = index + delta
    if (!selected || nextIndex < 0 || nextIndex >= slides.length) return
    setSlides((current) => {
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)
      return next
    })
    setSelectedKey(selected.key)
  }

  function removeSlide() {
    if (slides.length <= 1) return
    selectSlide(slides[index + 1]?.key ?? slides[index - 1]?.key ?? '')
    setSlides((current) => current.filter((_, position) => position !== index))
  }

  async function finish(cue: PlaylistCue | null) {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError('')
    try {
      await onSave(cue)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'บันทึกรายการไม่สำเร็จ')
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!initial || !label.trim() || !slides.length) return
    const normalized: CueSlide[] = []
    for (const [position, item] of slides.entries()) {
      const candidate = item.slide
      const design = candidate.design && normalizeDesignWebLayers(candidate.design)
      if (candidate.design && !design) {
        setSelectedKey(item.key)
        setError(`ตรวจที่อยู่ในกรอบเว็บของสไลด์ ${position + 1} ให้เป็น HTTPS หรือ HTTP`)
        return
      }
      const assets: PlaylistCueAsset[] = []
      for (const asset of candidate.assets ?? []) {
        if (asset.kind === 'web') {
          const original = asset.url ?? asset.filename
          const url = presentationWebUrl(original)
          if (!url) {
            setSelectedKey(item.key)
            setError(`ตรวจที่อยู่เว็บในสไลด์ ${position + 1} ให้เป็น HTTPS หรือ HTTP`)
            return
          }
          assets.push({ ...asset, url, filename: asset.filename === original ? url : asset.filename })
        } else if (!asset.filename.trim()) {
          setSelectedKey(item.key)
          setError(`ใส่ชื่อแหล่งสื่อในสไลด์ ${position + 1}`)
          return
        } else {
          assets.push({ ...asset, filename: asset.filename.trim() })
        }
      }
      const advanceMs = candidate.playback?.delayMs ?? candidate.advanceMs
      const minimum = candidate.playback?.mode === 'media' ? 0 : 1
      if (advanceMs !== undefined && candidate.playback?.mode !== 'manual'
        && (!Number.isSafeInteger(advanceMs) || advanceMs < minimum || advanceMs > 2147483647)) {
        setSelectedKey(item.key)
        setError(`เวลาเลื่อนในสไลด์ ${position + 1} ต้องอยู่ระหว่าง ${minimum / 1000} ถึง 2147483.647 วินาที`)
        return
      }
      normalized.push({
        ...candidate, label: candidate.label.trim() || `สไลด์ ${position + 1}`,
        ...(design ? { design } : {}),
        ...(candidate.assets ? { assets } : {}),
      })
    }
    const title = label.trim()
    const originalReference = initial.kind === 'scripture' && title !== initial.label
      ? { scripturePassage: scriptureReference(initial, initial.label, 0)?.passage ?? initial.label } : undefined
    const hasMetadata = Boolean(initial.metadata || note.trim() || originalReference)
    void finish({
      ...initial, label: title, slides: normalized, looping, lyricLayout, slideLayout,
      ...(hasMetadata ? { metadata: { ...initial.metadata, ...originalReference, notes: note.trim() || null } } : {}),
    })
  }

  return (
    <dialog ref={dialog} aria-labelledby="playlist-cue-editor-title"
      className="surface m-auto! max-h-[90dvh] w-[min(46rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-[var(--border-subtle)] p-4! text-[var(--fg-primary)] backdrop:bg-black/60 sm:p-6!"
      onCancel={(event) => { event.preventDefault(); if (!saving.current) onClose() }}>
      <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id="playlist-cue-editor-title" className="text-lg font-semibold">
              {creating ? 'สร้างงานนำเสนอในเพลย์ลิสต์' : 'แก้ไขรายการในเพลย์ลิสต์'}
            </h2>
            {entry.song && <p className="mt-1! text-sm text-[var(--fg-secondary)]">บันทึกฉบับสำหรับรายการนี้ในเพลย์ลิสต์</p>}
          </div>
          <button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>ปิด</button>
        </header>
        <fieldset className="flex min-w-0 flex-col gap-4" disabled={busy}>
          <label className={field}>ชื่อรายการ
            <input className="input-field min-w-0" value={label} onChange={(event) => setLabel(event.target.value)} required autoFocus />
          </label>
          {songCue && <div className={field}>
            <label htmlFor={`${fieldId}-layout`}>การแบ่งบรรทัดสำหรับรายการนี้</label>
            <select id={`${fieldId}-layout`} className="input-field min-w-0" value={lyricLayout ?? ''} onChange={(event) => {
              const value = event.currentTarget.value
              const layout = value === 'stanza' ? value : Number(value)
              setLyricLayout(isLyricLayout(layout) ? layout : undefined)
              setPreviewIndex(0)
            }}>
              <option value="">ตามสไลด์ที่จัดไว้</option>
              <option value={1}>1 บรรทัดต่อสไลด์</option>
              <option value={2}>2 บรรทัดต่อสไลด์</option>
              <option value={4}>4 บรรทัดต่อสไลด์</option>
              <option value="stanza">ตัดบรรทัดในสไลด์เดิม</option>
            </select>
          </div>}
          <div className={field}>
            <label htmlFor={`${fieldId}-slides`}>เลือกสไลด์ที่จะแก้ไข</label>
            <select id={`${fieldId}-slides`} className="input-field min-w-0" value={selected?.key ?? ''} onChange={(event) => selectSlide(event.target.value)}>
              {slides.map((item, position) => <option key={item.key} value={item.key}>{position + 1}. {item.slide.label}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="จัดลำดับสไลด์">
            <button type="button" className="chip-btn" onClick={() => insertSlide(false)}>เพิ่มสไลด์</button>
            <button type="button" className="chip-btn" disabled={!slide} onClick={() => insertSlide(true)}>ทำสำเนาสไลด์</button>
            <button type="button" className="chip-btn" disabled={index === 0} onClick={() => moveSlide(-1)}>เลื่อนสไลด์ขึ้น</button>
            <button type="button" className="chip-btn" disabled={index >= slides.length - 1} onClick={() => moveSlide(1)}>เลื่อนสไลด์ลง</button>
            <button type="button" className="btn-ghost" disabled={slides.length <= 1} onClick={removeSlide}>ลบสไลด์</button>
          </div>
          {(songCue || initial?.kind === 'presentation') && <TextDocumentImport onImport={importTextSlides} />}
          {slide && (
            <div className="grid min-w-0 gap-4 rounded-lg border border-[var(--border-subtle)] p-3!">
              <label className={field}>ชื่อสไลด์
                <input className="input-field" value={slide.label} onChange={(event) => changeSlide((current) => ({
                  ...current, label: event.target.value,
                  ...(initial?.kind === 'scripture' || (songCue && current.sourceId) ? { labelEdited: true } : {}),
                }))} />
              </label>
              <div className={field}>
                <label htmlFor={`${fieldId}-speaker-notes`}>โน้ตผู้บรรยาย</label>
                <textarea id={`${fieldId}-speaker-notes`} className="input-field min-h-20" value={slide.speakerNotes ?? ''} maxLength={maxSpeakerNotesLength}
                  onChange={(event) => changeSlide((current) => ({ ...current, speakerNotes: event.target.value }))} />
              </div>
              {slide.design ? (
                <>
                  <FeedLayerFields layers={slide.design.layers} feeds={songCue ? [] : feeds} onChange={(layers) =>
                    changeSlide((current) => current.design ? editCueDesign(current, { ...current.design, layers }) : current)} />
                  {slide.design.layers.filter((layer) => layer.kind === 'web').map((layer) => (
                    <WebLayerEditor key={layer.id} layer={layer}
                      onChange={(next) => changeSlide((current) => current.design ? editCueDesign(current, {
                        ...current.design, layers: current.design.layers.map((item) => item.id === layer.id ? next : item),
                      }) : current)}
                      onRemove={() => changeSlide((current) => current.design ? editCueDesign(current, {
                        ...current.design, layers: current.design.layers.filter((item) => item.id !== layer.id),
                      }) : current)} />
                  ))}
                  <button type="button" className="chip-btn justify-self-start"
                    onClick={() => changeSlide((current) => current.design ? editCueDesign(current, {
                      ...current.design, layers: [...current.design.layers, newWebLayer()],
                    }) : current)}>เพิ่มกรอบเว็บ</button>
                  {slide.design.layers.filter((layer) => layer.kind === 'text').map((layer, position) => (
                    (!songCue || !songLyrics?.layer || !editableSongArtwork(layer, songLyrics.layer.id)) && (
                    <div key={layer.id} className="grid gap-1">
                      {initial?.kind === 'presentation' ? <SlideParagraphTextField key={selected.key}
                        label={`ข้อความชั้นที่ ${position + 1}`} text={layer.text} runs={layer.runs}
                        onChange={(text) => changeSlide((current) => editCueTextLayer(current, layer.id, text), layer.slot === 'content')}
                        onApply={(runs) => changeSlide((current) => current.design ? editCueDesign(current, {
                          ...current.design, layers: current.design.layers.map((item) => item.id === layer.id ? { ...layer, runs } : item),
                        }) : current, layer.slot === 'content')} /> : <label className={field}>ข้อความชั้นที่ {position + 1}
                        <textarea ref={songLyrics?.layer?.id === layer.id ? lyricInput : undefined}
                          onKeyDown={songLyrics?.layer?.id === layer.id ? splitFromShortcut : undefined}
                          onSelect={songLyrics?.layer?.id === layer.id ? selectLyrics : undefined}
                          className="input-field min-h-20" aria-label={`ข้อความชั้นที่ ${position + 1}`} value={layer.text}
                          onChange={(event) => changeSlide((current) => editCueTextLayer(current, layer.id, event.target.value), layer.slot === 'content')} />
                      </label>}
                      <div className="flex flex-wrap gap-2">
                        {initial?.kind === 'presentation' && isScriptureFrame(layer) && <ScriptureFrameButton frame={layer} className="chip-btn"
                          onChange={(next) => changeSlide((current) => current.design ? editCueDesign(current, {
                            ...current.design, layers: current.design.layers.map((item) => item.id === layer.id ? next : item),
                          }) : current)} />}
                        <button type="button" className="chip-btn"
                          onClick={() => changeSlide((current) => current.design ? editCueDesign(current, {
                            ...current.design, layers: current.design.layers.filter((item) => item.id !== layer.id),
                          }) : current, layer.slot === 'content')}>ลบข้อความชั้นที่ {position + 1}</button>
                      </div>
                    </div>
                  )))}
                  {!songCue && <button type="button" className="chip-btn justify-self-start"
                    onClick={() => changeSlide((current) => current.design ? editCueDesign(current, {
                      ...current.design,
                      layers: [...current.design.layers, {
                        id: crypto.randomUUID(), kind: 'text', text: '', frame: { x: 0.1, y: 0.25, width: 0.8, height: 0.5 },
                      }],
                    }) : current)}>เพิ่มชั้นข้อความ</button>}
                </>
              ) : initial?.kind === 'presentation' ? (
                <SlideParagraphTextField key={selected.key} label="ข้อความบนสไลด์" text={slide.lines.join('\n')} runs={slide.lyricRuns}
                  onChange={(text) => changeSlide((current) => editCueLines(current, lines(text)), true)}
                  onApply={(runs) => changeSlide((current) => editCueDesign(current, withDocumentText({
                    aspectRatio: 16 / 9, layers: [],
                  }, { text: current.lines.join('\n'), runs })), true)} />
              ) : (
                <label className={field}>ข้อความบนสไลด์
                  <textarea ref={songCue ? lyricInput : undefined} className="input-field min-h-24" aria-label="ข้อความบนสไลด์" value={slide.lines.join('\n')}
                    onKeyDown={songCue ? splitFromShortcut : undefined}
                    onSelect={songCue ? selectLyrics : undefined}
                    onChange={(event) => changeSlide((current) => editCueLines(current, lines(event.target.value)), true)} />
                </label>
              )}
              {initial?.kind === 'presentation' && <ScriptureFrameButton className="chip-btn justify-self-start"
                onChange={(frame) => changeSlide((current) => {
                  const design = current.design ?? withDocumentText({ aspectRatio: 16 / 9, layers: [] }, {
                    text: current.lines.join('\n'), runs: current.lyricRuns,
                  })
                  return editCueDesign(current, { ...design, layers: [...design.layers, frame] })
                })} />}
              {!slide.design && initial?.kind === 'presentation' && <FeedLayerFields layers={[]} feeds={feeds} onChange={(layers) =>
                changeSlide((current) => {
                  const design = { aspectRatio: 16 / 9, layers: [] }
                  const text = current.lines.join('\n')
                  const base = text ? withDocumentText(design, { text, runs: current.lyricRuns }) : design
                  return editCueDesign(current, { ...base, layers: [...base.layers, ...layers] })
                })} />}
              {!slide.design && initial?.kind === 'presentation' && <InsertSlideShape onAdd={(layer) => changeSlide((current) => {
                const blank: SlideDesign = { aspectRatio: 16 / 9, layers: [] }
                const text = current.lines.join('\n')
                const design = current.design ?? (text ? withDocumentText(blank, { text, runs: current.lyricRuns }) : blank)
                return { ...current, design: { ...design, layers: [...design.layers, layer] } }
              })} />}
              {songLyrics?.text.trim() && (!slide.design || songLyrics.layer) && <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="chip-btn" onClick={splitAtCursor}>แบ่งสไลด์ตรงเคอร์เซอร์</button>
                <span className="text-xs text-[var(--fg-secondary)]">Ctrl+Enter หรือ ⌘+Enter</span>
              </div>}
              {songLyrics?.text.trim() && (!slide.design || songLyrics.layer) && (
                <LyricFormatControls key={`${selected.key}-${songLyrics.layer?.id ?? 'lyrics'}`} text={songLyrics.text}
                  runs={alignedLyricRuns(songLyrics.text, songLyrics.layer?.runs) ?? slide.lyricRuns}
                  base={themedLyrics?.kind === 'text' ? themedLyrics.style : songLyrics.layer?.style} selection={activeSelection}
                  onApply={(runs) => changeSlide((current) => formatCueLyrics(current, runs))} />
              )}
              {songCue && <details className="grid min-w-0 rounded-md border border-[var(--border-subtle)] p-3">
                <summary className="cursor-pointer font-medium">เค้าโครงสไลด์เพลง</summary>
                <div className="mt-3 grid min-w-0 gap-3">
                  <div className={field}>
                    <label htmlFor={`${fieldId}-layout-scope`}>แก้เค้าโครง</label>
                    <select id={`${fieldId}-layout-scope`} className="input-field min-w-0" value={layoutScope}
                      onChange={(event) => setLayoutScope(event.currentTarget.value === 'cue' ? 'cue' : 'slide')}>
                      <option value="slide">เฉพาะสไลด์นี้</option>
                      <option value="cue">เค้าโครงหลักของรายการนี้</option>
                    </select>
                  </div>
                  {layoutScope === 'cue' && slide.slideLayout && <p className="text-sm text-[var(--fg-secondary)]">สไลด์นี้มีเค้าโครงเฉพาะของตัวเอง</p>}
                  <SongSlideLayoutFields key={`${selected.key}:${layoutScope}`} layout={layoutScope === 'cue' ? slideLayout : slide.slideLayout}
                    effective={layoutPreview && { label: slide.label, lines: layoutPreview.lines, design: layoutPreview.design }}
                    media={media} feeds={feeds} dvds={dvds} playlistId={entry.playlist_id}
                    onChange={(layout: SongSlideLayout | undefined) => {
                      if (layoutScope === 'cue') setSlideLayout(layout)
                      else changeSlide((current) => ({ ...current, slideLayout: layout }))
                    }} />
                </div>
              </details>}
              {projectedSlides.length > 1 && <div className={field}>
                <label htmlFor={`${fieldId}-preview`}>ตัวอย่างหลังแบ่งบรรทัด</label>
                <select id={`${fieldId}-preview`} className="input-field" value={activePreview} onChange={(event) => setPreviewIndex(Number(event.currentTarget.value))}>
                  {projectedSlides.map((_, position) => <option key={position} value={position}>{position + 1} / {projectedSlides.length}</option>)}
                </select>
              </div>}
              {preview && !songCue && slide.design ? (
                <SlideLayoutPreview key={`layout:${selected.key}`} design={preview} playlistId={entry.playlist_id}
                  editableIds={new Set(slide.design.layers.map(({ id }) => id))}
                  shapeEditor={{ layers: slide.design.layers, media, onChange: (layers) => changeSlide((current) => current.design ? {
                    ...current, design: { ...current.design, layers },
                  } : current) }}
                  onFrameChange={(id, frame) => changeSlide((current) => current.design ? {
                    ...current, design: { ...current.design, layers: moveLayerFrame(current.design.layers, id, frame) },
                  } : current)}
                  onElementEffectsChange={(id, effects) => changeSlide((current) => current.design ? {
                    ...current, design: { ...current.design, layers: editElementEffects(current.design.layers, id, effects) },
                  } : current)} />
              ) : preview ? (
                <div className="aspect-video overflow-hidden rounded-md">
                  <LayeredSlide design={preview} playlistId={entry.playlist_id} preview />
                </div>
              ) : (songCue || initial?.kind === 'presentation') && projected?.lines.length ? <div
                aria-label={songCue ? 'ตัวอย่างเนื้อเพลง' : 'ตัวอย่างข้อความบนสไลด์'} className="grid min-w-0 gap-1 rounded-md bg-black p-3! text-center text-white wrap-anywhere">
                {previewParagraphs ? <div className="min-w-0"><ParagraphTextRuns runs={previewParagraphs} /></div>
                  : projected.lines.map((line, position) => <span key={position}>{previewRuns ? <StyledTextRuns runs={previewRuns[position]} /> : line}</span>)}
              </div> : null}
              {entry.song && (
                <label className={field}>คอร์ดตามบรรทัด
                  <textarea className="input-field min-h-16 font-mono" aria-label="คอร์ดตามบรรทัด" value={slide.chords?.join('\n') ?? ''}
                    onChange={(event) => changeSlide((current) => ({ ...current, chords: lines(event.target.value) }))} />
                  <span className="text-[var(--fg-secondary)]">เว้นบรรทัดสำหรับเนื้อร้องที่ไม่มีคอร์ด</span>
                </label>
              )}
              <SlideAdvanceFields value={slide} onChange={(patch) => changeSlide((current) => ({ ...current, ...patch }))} />
              <SlideTransitionFields value={slide.transition} onChange={(transition) => changeSlide((current) => ({
                ...current, transition, ...(current.sourceId ? { transitionEdited: true } : {}),
              }))} />
              <CueAssetList key={selected.key} slide={slide} media={media} feeds={feeds} onChange={changeSlide}
                onUseSoundtrackOnAllSlides={slides.length > 1 ? useSoundtrackOnAllSlides : undefined} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={Boolean(looping)} onChange={(event) => setLooping(event.target.checked)} />
            เล่นสไลด์วนซ้ำเมื่อมีเวลาเลื่อน
          </label>
          <label className={field}>บันทึกสำหรับรายการนี้
            <textarea className="input-field min-h-14" aria-label="บันทึกสำหรับรายการนี้" value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </fieldset>
        {error && <p role="alert" className="text-sm wrap-anywhere text-[var(--status-error-text)]">{error}</p>}
        <footer className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary" disabled={busy || !label.trim()}>{creating ? 'เพิ่มลงเพลย์ลิสต์' : 'บันทึกรายการ'}</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>ยกเลิก</button>
          {entry.song && entry.cue && <button type="button" className="btn-ghost" disabled={busy}
            onClick={() => void finish(null)}>คืนเนื้อหาจากคลังเพลง</button>}
        </footer>
      </form>
    </dialog>
  )
}

function CueAssetList({ slide, media, feeds, onChange, onUseSoundtrackOnAllSlides }: {
  slide: CueSlide
  media: MediaLibraryItem[]
  feeds: LiveFeed[]
  onChange: (update: (slide: CueSlide) => CueSlide) => void
  onUseSoundtrackOnAllSlides?: (asset: PlaylistCueAsset) => void
}) {
  const [source, setSource] = useState('')
  const [role, setRole] = useState<'foreground' | 'background'>('foreground')
  const sourceField = useId()
  const roleField = useId()
  const assets = slide.assets ?? []
  const hasSoundtrack = assets.some(({ kind }) => kind === 'audio')
  const addableMedia = hasSoundtrack ? media.filter(({ kind }) => kind !== 'audio') : media
  const selectedMedia = addableMedia.find(({ id }) => id === source)
  const selectedFeed = feeds.find(({ id }) => source === 'feed:' + id)
  function add() {
    const item = selectedMedia
    const mediaAsset: PlaylistCueAsset | undefined = item ? libraryMediaCueAsset(item, role)
      : selectedFeed ? liveFeedAsset(selectedFeed, role)
        : source === 'camera' ? { kind: 'camera', filename: 'กล้อง', role }
        : source === 'web' ? { kind: 'web', filename: 'เว็บ', url: '', role } : undefined
    if (!mediaAsset) return
    onChange((current) => editCueAsset(current, assets.length, mediaAsset, crypto.randomUUID()))
    setSource('')
  }
  return (
    <div className="grid min-w-0 gap-2">
      <h3 className="font-medium">สื่อบนสไลด์</h3>
      {assets.map((asset, index) => (
        <div key={index} className="flex min-w-0 flex-wrap items-end gap-2 rounded-md bg-[var(--bg-tertiary)] p-2!">
          {asset.kind === 'web' ? (
            <label className={`${field} grow basis-56`}>ที่อยู่เว็บ {index + 1}
              <input type="url" className="input-field min-w-0" value={asset.url ?? asset.filename}
                onChange={(event) => {
                  const url = event.target.value
                  onChange((current) => editCueAsset(current, index, {
                    ...asset, url, filename: asset.filename === asset.url ? url : asset.filename,
                  }))
                }} />
            </label>
          ) : asset.kind === 'camera' ? (
            <label className={`${field} grow basis-52`}>ชื่อแหล่งกล้อง {index + 1}
              <input className="input-field min-w-0" value={asset.filename}
                onChange={(event) => onChange((current) => editCueAsset(current, index, { ...asset, filename: event.target.value }))} />
            </label>
          ) : (
            <div className="grid min-w-0 grow gap-1 text-sm wrap-anywhere">
              <span>{CUE_LABELS[asset.kind]} · {asset.filename}</span>
              {asset.kind !== 'powerpoint' && media.some((item) => item.kind === asset.kind) && (
                <label className={field}>เปลี่ยนไฟล์สื่อ {index + 1}
                  <select className="input-field min-w-0" value="" onChange={(event) => {
                    const item = media.find((file) => file.id === event.target.value)
                    if (!item || item.kind !== asset.kind) return
                    const sameFile = item.assetId === asset.libraryId || item.filename.toLowerCase() === asset.filename.toLowerCase()
                    const replacement = libraryMediaCueAsset(item, asset.role)
                    onChange((current) => editCueAsset(current, index, {
                      ...replacement, repeat: asset.repeat ?? replacement.repeat,
                      clip: sameFile ? asset.clip ?? item.clip : item.clip,
                      alphaMode: sameFile ? asset.alphaMode ?? item.alphaMode : item.alphaMode,
                      playback: sameFile ? asset.playback ?? replacement.playback : replacement.playback,
                    }, crypto.randomUUID()))
                  }}>
                    <option value="">เลือกจากคลังสื่อ</option>
                    {media.filter((item) => item.kind === asset.kind).map((item) =>
                      <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
              )}
              {asset.kind === 'audio' && (
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={asset.repeat ?? false}
                      onChange={(event) => onChange((current) => editCueAsset(current, index, { ...asset, repeat: event.target.checked }))} />
                    เล่นเสียงวนซ้ำ
                  </label>
                  {onUseSoundtrackOnAllSlides && <button className="chip-btn" type="button"
                    onClick={() => onUseSoundtrackOnAllSlides(asset)}>ใช้เสียงนี้ทุกสไลด์</button>}
                </div>
              )}
            </div>
          )}
          {asset.kind === 'web' && <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={Boolean(asset.hideScrollbars)}
              onChange={(event) => onChange((current) => editCueAsset(current, index, { ...asset, hideScrollbars: event.target.checked }))} />
            ซ่อนแถบเลื่อน
          </label>}
          <button type="button" className="chip-btn" aria-label={`นำสื่อ ${index + 1} ออกจากสไลด์`}
            onClick={() => onChange((current) => editCueAsset(current, index))}>นำออก</button>
        </div>
      ))}
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <div className={`${field} grow basis-48`}>
          <label htmlFor={sourceField}>เพิ่มสื่อบนสไลด์</label>
          <select id={sourceField} className="input-field min-w-0" value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="">เลือกสื่อ</option>
            <option value="web">เว็บ</option>
            <option value="camera">กล้อง</option>
            {feeds.length > 0 && <optgroup label="สัญญาณสด">
              {feeds.map((feed) => <option key={feed.id} value={'feed:' + feed.id}>{feed.name}</option>)}
            </optgroup>}
            {addableMedia.map((item) => <option key={item.id} value={item.id}>{CUE_LABELS[item.kind]} · {item.name}</option>)}
          </select>
        </div>
        <div className={field}>
          <label htmlFor={roleField}>{selectedMedia?.kind === 'audio' ? 'การเล่นเสียง' : 'ตำแหน่งสื่อ'}</label>
          <select id={roleField} className="input-field" value={role} onChange={(event) => setRole(event.target.value === 'background' ? 'background' : 'foreground')}>
            <option value="foreground">{selectedMedia?.kind === 'audio' ? 'เริ่มใหม่เมื่อขึ้นสไลด์นี้' : 'ด้านหน้า'}</option>
            <option value="background">{selectedMedia?.kind === 'audio' ? 'เล่นต่อถ้าสไลด์ถัดไปใช้ไฟล์เดียวกัน' : 'พื้นหลัง'}</option>
          </select>
        </div>
        <button type="button" className="chip-btn" disabled={!source} onClick={add}>เพิ่มสื่อ</button>
      </div>
    </div>
  )
}
