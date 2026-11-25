/** Edits native and imported slides with a preview of the selected slide. */

import { useEffect, useId, useState } from 'react'
import { SlideLayoutPreview } from './SlideLayoutPreview'
import { ScriptureFrameButton } from './ScriptureFrameButton'
import { FeedLayerFields } from './FeedLayerFields'
import { SlideAdvanceFields } from './SlideAdvanceFields'
import { SlideTransitionFields } from './SlideTransitionFields'
import { TextDocumentImport } from './TextDocumentImport'
import { SlideParagraphTextField } from './LyricParagraphControls'
import { newWebLayer, WebLayerEditor } from './WebLayerEditor'
import { libraryMediaCueAsset, libraryMediaVisual, listLibraryFeeds, listLibraryMedia } from '../utils/mediaLibrary'
import { applyThemeText, editDesignText, isCanvasBackground, isScriptureFrame } from '../utils/slideDesign'
import { withDocumentText, type TextDocumentSlide } from '../utils/textDocument'
import { maxSpeakerNotesLength } from '../utils/speakerNotes'
import { editElementEffects, moveLayerFrame } from '../utils/slideElementEffects'
import type { MediaLibraryItem } from '../types/media'
import type { LiveFeed } from '../types/liveFeed'
import type { DesignInput } from '../hooks/useSlideDesigns'
import type { DesignFill, DesignFrame, DesignLayer, DesignSlide, DesignSoundtrack } from '../types/slideDesign'

type Props = { draft: DesignInput; onChange: (draft: DesignInput) => void }
type TextLayer = Extract<DesignLayer, { kind: 'text' }>

const fullFrame: DesignFrame = { x: 0, y: 0, width: 1, height: 1 }
const field = 'flex min-w-0 flex-col gap-1 text-sm'
const frameLabels = { x: 'ซ้าย', y: 'บน', width: 'กว้าง', height: 'สูง' } as const

function textLayer(slot?: 'content'): TextLayer {
  return {
    id: crypto.randomUUID(),
    kind: 'text',
    frame: { x: 0.08, y: 0.18, width: 0.84, height: 0.64 },
    text: '',
    slot,
    style: { fontSize: 0.07, align: 'center' },
  }
}

export function SlideDesignEditor({ draft, onChange }: Props) {
  const notesId = useId()
  const [selectedId, setSelectedId] = useState(draft.content.slides[0]?.id)
  const [media, setMedia] = useState<MediaLibraryItem[]>([])
  const [feeds, setFeeds] = useState<LiveFeed[]>([])
  const slides = draft.content.slides
  const index = Math.max(0, slides.findIndex((slide) => slide.id === selectedId))
  const selected = slides[index]
  const theme = draft.kind === 'song-theme' || draft.kind === 'scripture-theme' || draft.kind === 'text-theme'

  useEffect(() => { void listLibraryMedia().then(setMedia).catch(() => setMedia([])) }, [])
  useEffect(() => {
    let active = true
    void listLibraryFeeds().then((items) => { if (active) setFeeds(items) }).catch(() => undefined)
    return () => { active = false }
  }, [])

  function updateSlides(next: DesignSlide[]) {
    onChange({ ...draft, content: { ...draft.content, slides: next } })
  }

  function patchSlide(patch: Partial<DesignSlide>) {
    updateSlides(slides.map((slide, i) => i === index ? { ...slide, ...patch } : slide))
  }

  function updateLayers(layers: DesignLayer[]) {
    patchSlide({ design: { ...selected.design, layers } })
  }

  function addSlide(duplicate: boolean) {
    const id = crypto.randomUUID()
    const next = duplicate && selected
      ? { ...selected, id, label: `${selected.label} (สำเนา)`, transitionEdited: undefined }
      : { id, label: `สไลด์ ${slides.length + 1}`, design: { aspectRatio: selected?.design.aspectRatio ?? 16 / 9, layers: [textLayer(theme ? 'content' : undefined)] } }
    updateSlides([...slides, next])
    setSelectedId(next.id)
  }

  function removeSlide() {
    if (slides.length <= 1) return
    const remaining = slides.filter((slide) => slide.id !== selected.id)
    updateSlides(remaining)
    setSelectedId(remaining[Math.min(index, remaining.length - 1)].id)
  }

  function moveSlide(offset: number) {
    const nextIndex = index + offset
    if (nextIndex < 0 || nextIndex >= slides.length) return
    const reordered = [...slides]
    reordered.splice(index, 1)
    reordered.splice(nextIndex, 0, selected)
    updateSlides(reordered)
  }

  if (!selected) return <button type="button" className="btn-secondary" onClick={() => addSlide(false)}>เพิ่มสไลด์แรก</button>

  const layers = selected.design.layers
  const fullFill = layers.find((layer) => layer.kind === 'fill' && isCanvasBackground(layer))
  const fullMedia = layers.some((layer) => layer.kind === 'media' && isCanvasBackground(layer))
  const preview = theme ? applyThemeText(selected.design, 'ข้อความตัวอย่าง', draft.kind === 'song-theme' ? '' : 'สดุดี 136:1') : selected.design
  const gradient = fullFill?.kind === 'fill' && fullFill.fill.type === 'gradient' ? fullFill.fill : undefined
  const soundtracks = selected.design.soundtracks ?? []

  function importTextSlides(fragments: TextDocumentSlide[]) {
    const fillSelected = !layers.some((layer) => layer.kind === 'text' && layer.text.trim())
    const added = fragments.map((fragment, position) => {
      if (fillSelected && position === 0) return { ...selected, design: withDocumentText(selected.design, fragment) }
      return { id: crypto.randomUUID(), label: `สไลด์ ${slides.length + position + (fillSelected ? 0 : 1)}`,
        design: withDocumentText({ aspectRatio: selected.design.aspectRatio, layers: [] }, fragment) }
    })
    const start = fillSelected ? index : index + 1
    updateSlides([...slides.slice(0, start), ...added, ...slides.slice(index + 1)])
    setSelectedId(added[0].id)
  }

  function updateSoundtracks(next: DesignSoundtrack[]) {
    patchSlide({ design: { ...selected.design, soundtracks: next.length ? next : undefined } })
  }

  function chooseSoundtrack(id: string) {
    const item = media.find((candidate) => candidate.id === id && candidate.kind === 'audio')
    if (!item) return
    const track: DesignSoundtrack = { ...libraryMediaCueAsset(item, 'background'), kind: 'audio', role: 'background' }
    updateSoundtracks([track, ...soundtracks.slice(1)])
  }

  function setBackground(fill: DesignFill) {
    const layer: DesignLayer = { ...fullFill, id: fullFill?.id ?? crypto.randomUUID(), kind: 'fill', fill, frame: fullFrame }
    updateLayers(fullFill ? layers.map((item) => item.id === fullFill.id ? layer : item) : [layer, ...layers])
  }

  function setBackgroundMedia(itemId: string) {
    const item = media.find((candidate) => candidate.id === itemId)
    const visual = item && libraryMediaVisual(item, true)
    if (!visual) return
    const background: DesignLayer = { id: crypto.randomUUID(), kind: 'media', frame: fullFrame, ...visual }
    const base = layers.filter((layer) => layer.kind === 'fill' && isCanvasBackground(layer))
    const foreground = layers.filter((layer) => !isCanvasBackground(layer) || layer.kind === 'web')
    updateLayers([...base, background, ...foreground])
  }

  return (
    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4">
        <label className={field}>ชื่อ
          <input className="input-field" value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} />
        </label>
        {draft.kind === 'presentation' && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(draft.content.looping)}
                onChange={(event) => onChange({ ...draft, content: { ...draft.content, looping: event.target.checked } })} /> เล่นวนซ้ำ
            </label>
            <div className={field}>
              <label htmlFor={`${notesId}-presentation`}>โน้ตงานนำเสนอ</label>
              <p id={`${notesId}-presentation-hint`} className="text-xs text-[var(--fg-secondary)]">
                ใช้เป็นบันทึกเมื่อเพิ่มงานนี้ลงเพลย์ลิสต์ สูงสุด {maxSpeakerNotesLength.toLocaleString('th-TH')} อักขระ
              </p>
              <textarea id={`${notesId}-presentation`} aria-describedby={`${notesId}-presentation-hint`}
                className="input-field min-h-20" rows={3} value={draft.content.notes ?? ''}
                onChange={(event) => onChange({ ...draft, content: { ...draft.content, notes: event.currentTarget.value } })} />
            </div>
            <TextDocumentImport onImport={importTextSlides} />
          </>
        )}
        <details className="rounded-lg border border-[var(--border-subtle)] p-3!" open={soundtracks.length > 0 ? true : undefined}>
          <summary className="cursor-pointer text-sm">เสียงประกอบสไลด์</summary>
          <label className={`mt-2! ${field}`}>{soundtracks.length ? 'เปลี่ยนเสียงหลัก' : 'เลือกเสียงประกอบ'}
            <select className="input-field" value="" onChange={(event) => chooseSoundtrack(event.target.value)}>
              <option value="">เลือกเสียงจากคลังสื่อ</option>
              {media.filter((item) => item.kind === 'audio').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          {soundtracks.map((track, position) => (
            <div className="mt-3! grid min-w-0 gap-2 text-sm" key={`${track.filename}:${position}`}>
              <p className="wrap-anywhere">{track.filename}</p>
              <label className={field}>การเล่นเสียง
                <select className="input-field" value={track.role} onChange={(event) => {
                  const role = event.currentTarget.value === 'foreground' ? 'foreground' : 'background'
                  updateSoundtracks(soundtracks.map((item, i) => i === position ? { ...item, role } : item))
                }}>
                  <option value="background">เล่นต่อข้ามสไลด์ที่ใช้เสียงเดียวกัน</option>
                  <option value="foreground">เริ่มใหม่เมื่อขึ้นสไลด์</option>
                </select>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={Boolean(track.repeat)} onChange={(event) => {
                    const repeat = event.currentTarget.checked
                    updateSoundtracks(soundtracks.map((item, i) => i === position ? { ...item, repeat } : item))
                  }} /> เล่นเสียงวนซ้ำ
                </label>
                <button type="button" className="btn-ghost" onClick={() => updateSoundtracks(soundtracks.filter((_, i) => i !== position))}>เอาเสียงนี้ออก</button>
              </div>
            </div>
          ))}
          {slides.length > 1 && soundtracks[0] && <button type="button" className="btn-secondary mt-3!" onClick={() => updateSlides(slides.map((slide) => ({
            ...slide, design: { ...slide.design, soundtracks: [soundtracks[0], ...(slide.design.soundtracks?.slice(1) ?? [])] },
          })))}>ใช้เสียงหลักกับทุกสไลด์</button>}
        </details>
        <label className={field}>สไลด์ที่แก้ไข
          <select className="input-field" value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
            {slides.map((slide, i) => <option key={slide.id} value={slide.id}>{i + 1}. {slide.label}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" type="button" onClick={() => addSlide(false)}>เพิ่มสไลด์</button>
          <button className="btn-secondary" type="button" onClick={() => addSlide(true)}>ทำสำเนา</button>
          <button className="chip-btn" type="button" disabled={index === 0} onClick={() => moveSlide(-1)}>เลื่อนขึ้น</button>
          <button className="chip-btn" type="button" disabled={index === slides.length - 1} onClick={() => moveSlide(1)}>เลื่อนลง</button>
          <button className="btn-ghost" type="button" disabled={slides.length <= 1} onClick={removeSlide}>ลบสไลด์</button>
        </div>
        <label className={field}>ชื่อสไลด์
          <input className="input-field" value={selected.label} onChange={(event) => patchSlide({ label: event.target.value })} />
        </label>
        {draft.kind !== 'presentation' && <TextDocumentImport key={selected.id} singleBlock onImport={([fragment]) =>
          patchSlide({ design: withDocumentText(selected.design, fragment, 'static') })} />}
        {draft.kind === 'presentation' && <div className={field}>
          <label htmlFor={notesId}>โน้ตผู้บรรยาย</label>
          <textarea id={notesId} className="input-field min-h-20" value={selected.speakerNotes ?? ''} maxLength={maxSpeakerNotesLength}
            onChange={(event) => patchSlide({ speakerNotes: event.target.value })} />
        </div>}
        {draft.kind === 'presentation' && <SlideAdvanceFields value={selected} onChange={patchSlide} />}
        <SlideTransitionFields value={selected.transition} onChange={(transition) => patchSlide({ transition,
          ...(draft.content.source ? { transitionEdited: true } : {}),
        })}
          inheritLabel={draft.kind === 'presentation' ? undefined : 'ใช้ค่าปกติ'} />
        {gradient ? (
          <fieldset className="grid min-w-0 grid-cols-2 gap-2">
            <legend className="mb-2! text-sm">พื้นหลังไล่สี</legend>
            {gradient.stops.map((stop, index) => (
              <label key={index} className={field}>
                สีที่ {index + 1}
                <input type="color" className="h-9 w-full" value={/^#[0-9a-f]{6}$/i.test(stop.color) ? stop.color : '#000000'}
                  onChange={(event) => setBackground({
                    ...gradient,
                    stops: gradient.stops.map((item, i) => i === index ? { ...item, color: event.target.value } : item),
                  })} />
              </label>
            ))}
            <label className={field}>มุมไล่สี
              <input className="input-field" type="number" min="-360" max="360" value={gradient.angle}
                onChange={(event) => {
                  const angle = event.target.valueAsNumber
                  if (Number.isFinite(angle) && angle >= -360 && angle <= 360) setBackground({ ...gradient, angle })
                }} />
            </label>
          </fieldset>
        ) : <label className={field}>สีพื้นหลัง
          <input className="h-9 w-full" type="color" value={fullFill?.kind === 'fill' && fullFill.fill.type === 'solid' ? fullFill.fill.color : '#000000'}
            onChange={(event) => setBackground({ type: 'solid', color: event.target.value })} />
        </label>}
        <label className={field}>สื่อพื้นหลัง
          <select className="input-field" value="" onChange={(event) => setBackgroundMedia(event.target.value)}>
            <option value="">เลือกภาพหรือวิดีโอจากคลังสื่อ</option>
            {media.filter((item) => item.kind !== 'audio').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        {fullMedia && <button type="button" className="btn-ghost self-start" onClick={() => updateLayers(layers.filter((layer) => layer.kind !== 'media' || !isCanvasBackground(layer)))}>เอาสื่อพื้นหลังออก</button>}
        {layers.map((layer) => layer.kind === 'text' && (
          <TextLayerEditor key={layer.id} layer={layer} theme={theme}
            scripture={draft.kind === 'presentation' && isScriptureFrame(layer)}
            onChange={(next) => updateLayers(layers.map((item) => item.id === layer.id ? next : item))}
            onRemove={() => updateLayers(layers.filter((item) => item.id !== layer.id))} />
        ))}
        {layers.map((layer) => layer.kind === 'web' && (
          <WebLayerEditor key={layer.id} layer={layer}
            onChange={(next) => updateLayers(layers.map((item) => item.id === layer.id ? next : item))}
            onRemove={() => updateLayers(layers.filter((item) => item.id !== layer.id))} />
        ))}
        <FeedLayerFields layers={layers} feeds={feeds} onChange={updateLayers} />
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" type="button" onClick={() => updateLayers([...layers, textLayer()])}>เพิ่มข้อความ</button>
          {draft.kind === 'presentation' && <ScriptureFrameButton onChange={(frame) => updateLayers([...layers, frame])} />}
          <button className="btn-secondary" type="button" onClick={() => updateLayers([...layers, newWebLayer()])}>เพิ่มกรอบเว็บ</button>
        </div>
      </div>
      <div className="min-w-0">
        <h2 className="mb-2! text-sm font-medium">ตัวอย่างสไลด์ที่เลือก</h2>
        <SlideLayoutPreview key={selected.id} design={preview} shapeEditor={{ layers, media, onChange: updateLayers }} onFrameChange={(id, frame) =>
          updateLayers(moveLayerFrame(layers, id, frame))}
          onElementEffectsChange={(id, effects) => updateLayers(editElementEffects(layers, id, effects))} />
      </div>
    </div>
  )
}

function TextLayerEditor({ layer, theme, scripture, onChange, onRemove }: {
  layer: TextLayer
  theme: boolean
  scripture: boolean
  onChange: (layer: TextLayer) => void
  onRemove: () => void
}) {
  const style = layer.style ?? {}
  return (
    <details open className="flex min-w-0 flex-col gap-2 rounded-lg border border-[var(--border-subtle)] p-3!">
      <summary className="mb-2! cursor-pointer text-sm">{layer.scriptureSource?.label ?? (scripture ? 'ข้อพระคัมภีร์' : 'ชั้นข้อความ')}</summary>
      {theme && (
        <label className={field}>บทบาทข้อความ
          <select className="input-field" value={layer.slot ?? ''} onChange={(event) => onChange({ ...layer, slot: event.target.value as TextLayer['slot'] || undefined })}>
            <option value="">ข้อความคงที่</option><option value="content">เนื้อหาจากเพลย์ลิสต์</option><option value="reference">ชื่อข้อพระคัมภีร์</option>
          </select>
        </label>
      )}
      {(!theme || !layer.slot) && <SlideParagraphTextField label="ข้อความ" text={layer.text} runs={layer.runs}
        onChange={(text) => onChange(editDesignText(layer, text))} onApply={(runs) => onChange({ ...layer, runs })} />}
      <div className="mt-2! grid grid-cols-2 gap-2">
        {(Object.keys(frameLabels) as (keyof DesignFrame)[]).map((key) => (
          <label className={field} key={key}>{frameLabels[key]} (%)
            <input className="input-field" type="number" step="0.1" value={Number((layer.frame[key] * 100).toFixed(2))}
              onChange={(event) => {
                const amount = event.target.valueAsNumber
                if (Number.isFinite(amount)) onChange({ ...layer, frame: { ...layer.frame, [key]: amount / 100 } })
              }} />
          </label>
        ))}
        <label className={field}>ขนาด (%)
          <input className="input-field" type="number" min="1" max="30" step="0.1" value={Number(((style.fontSize ?? 0.05) * 100).toFixed(2))}
            onChange={(event) => {
              const amount = event.target.valueAsNumber
              if (Number.isFinite(amount)) onChange({ ...layer, style: { ...style, fontSize: amount / 100 } })
            }} />
        </label>
        <label className={field}>จัดแนว
          <select className="input-field" value={style.align ?? 'center'} onChange={(event) => onChange({ ...layer, style: { ...style, align: event.target.value as 'left' | 'center' | 'right' } })}>
            <option value="left">ซ้าย</option><option value="center">กลาง</option><option value="right">ขวา</option>
          </select>
        </label>
        <label className={field}>สีข้อความ
          <input type="color" className="h-9 w-full" value={style.color ?? '#ffffff'} onChange={(event) => onChange({ ...layer, style: { ...style, color: event.target.value } })} />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {scripture && <ScriptureFrameButton frame={layer} onChange={onChange} className="chip-btn" />}
        <button type="button" className="btn-ghost" onClick={onRemove}>ลบชั้นข้อความ</button>
      </div>
    </details>
  )
}
