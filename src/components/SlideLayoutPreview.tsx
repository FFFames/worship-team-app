/** Moves and resizes saved slide frames directly on the rendered preview. */

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { DesignFrame, DesignLayer, ElementEffectChanges, SlideDesign } from '../types/slideDesign'
import type { MediaLibraryItem } from '../types/media'
import { isCanvasBackground } from '../utils/slideDesign'
import { adjustSlideFrame, slideAspectRatio, slideFrameCorner, slideRotation, visibleSlideFrame } from '../utils/slideFrame'
import { LayeredSlide } from './LayeredSlide'
import { ElementEffectFields } from './ElementEffectFields'
import { changeElementShape, editShapeCaption, moveLayerFrame, moveSlideElement, readElementEffects, replacePositionedLayer } from '../utils/slideElementEffects'
import { InsertSlideShape, ShapeFrameFields } from './ShapeFrameFields'
import { authoredShapeGroup, shapePresets } from '../utils/slideShapePresets'

type Props = {
  design: SlideDesign
  playlistId?: string
  editableIds?: ReadonlySet<string>
  normalizeFrame?: (id: string, frame: DesignFrame) => DesignFrame
  onFrameChange: (id: string, frame: DesignFrame) => void
  onElementEffectsChange?: (id: string, changes: ElementEffectChanges) => void
  shapeEditor?: { layers: DesignLayer[]; media: MediaLibraryItem[]; onChange: (layers: DesignLayer[]) => void }
}

type Gesture = {
  pointerId: number
  layer: DesignLayer
  mode: 'move' | 'resize'
  start: { x: number; y: number }
  size: { width: number; height: number }
}

const arrows: Partial<Record<string, [number, number]>> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
}

function layerName(layer: DesignLayer) {
  if (layer.kind === 'media' || layer.kind === 'camera') return layer.asset.filename
  if (layer.kind === 'web') return 'กรอบเว็บ'
  if (layer.kind === 'fill') return layer.presetShape ? shapePresets[layer.presetShape.preset] : 'รูปทรง'
  if (layer.scriptureSource) return layer.scriptureSource.label
  if (layer.slot === 'content') return 'ข้อความหลัก'
  if (layer.slot === 'reference') return 'ชื่อข้อพระคัมภีร์'
  return layer.text.trim().split('\n')[0].slice(0, 48) || 'กล่องข้อความ'
}

export function SlideLayoutPreview({ design, playlistId, editableIds, normalizeFrame, onFrameChange, onElementEffectsChange, shapeEditor }: Props) {
  const id = useId()
  const canvas = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | undefined>(undefined)
  const [selectedId, setSelectedId] = useState<string>()
  const [draft, setDraft] = useState<{ id: string; frame: DesignFrame }>()
  const aspect = slideAspectRatio(design.aspectRatio)
  const editable = design.layers.filter((layer) => (editableIds?.has(layer.id) ?? true) && !isCanvasBackground(layer))
  const selected = editable.find((layer) => layer.id === selectedId) ?? editable[editable.length - 1]
  const sourceLayer = selected && shapeEditor?.layers.find((layer) => layer.id === selected.id)
  const shapeOwner = sourceLayer && (sourceLayer.kind === 'fill' || sourceLayer.kind === 'media')
    && authoredShapeGroup(sourceLayer.id) === sourceLayer.id ? sourceLayer : undefined
  const caption = shapeOwner && shapeEditor?.layers.find((layer) => layer.id === `${shapeOwner.id}:text`)
  const shown = draft ? { ...design, layers: moveLayerFrame(design.layers, draft.id, draft.frame) } : design
  const frameFor = (layer: DesignLayer) => visibleSlideFrame(draft && (draft.id === layer.id
    || (authoredShapeGroup(draft.id) && authoredShapeGroup(draft.id) === authoredShapeGroup(layer.id))) ? draft.frame : layer.frame)
  const corner = selected && slideFrameCorner(frameFor(selected), aspect, slideRotation(selected.rotation))
  const normalized = (id: string, frame: DesignFrame) => normalizeFrame?.(id, frame) ?? frame

  function begin(event: PointerEvent, layer: DesignLayer, mode: Gesture['mode']) {
    const surface = canvas.current
    if (!surface || !event.isPrimary || event.button !== 0 || gesture.current) return
    event.preventDefault()
    const size = surface.getBoundingClientRect()
    surface.focus({ preventScroll: true })
    surface.setPointerCapture(event.pointerId)
    setSelectedId(layer.id)
    gesture.current = { pointerId: event.pointerId, layer, mode, size, start: { x: event.clientX, y: event.clientY } }
  }

  function frameFromPointer(event: PointerEvent) {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return undefined
    const { layer, mode, start, size } = active
    const delta = { x: event.clientX - start.x, y: event.clientY - start.y }
    if (Math.hypot(delta.x, delta.y) < 3) return undefined
    return { id: layer.id, frame: normalized(layer.id, adjustSlideFrame(layer.frame, mode, delta, size, layer.rotation)) }
  }

  function cancel() {
    gesture.current = undefined
    setDraft(undefined)
  }

  function commit(event: PointerEvent) {
    if (gesture.current?.pointerId !== event.pointerId) return
    const next = frameFromPointer(event)
    cancel()
    if (next) onFrameChange(next.id, next.frame)
  }

  function cancelPointer(event: PointerEvent) {
    if (gesture.current?.pointerId === event.pointerId) cancel()
  }

  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && gesture.current) {
      event.preventDefault()
      const pointerId = gesture.current.pointerId
      cancel()
      if (event.currentTarget.hasPointerCapture(pointerId)) event.currentTarget.releasePointerCapture(pointerId)
      return
    }
    const direction = arrows[event.key]
    if (!direction || !selected || gesture.current || event.altKey || event.metaKey || event.ctrlKey) return
    event.preventDefault()
    const size = event.currentTarget.getBoundingClientRect()
    const delta = { x: direction[0] * size.width * .01, y: direction[1] * size.height * .01 }
    onFrameChange(selected.id, normalized(selected.id, adjustSlideFrame(selected.frame, event.shiftKey ? 'resize' : 'move', delta, size, selected.rotation)))
  }

  return <div className="grid min-w-0 gap-2">
    {shapeEditor && <InsertSlideShape onAdd={(layer) => {
      shapeEditor.onChange([...shapeEditor.layers, layer])
      setSelectedId(layer.id)
    }} />}
    {selected && <div className="grid min-w-0 gap-1 text-sm">
      <label htmlFor={id}>กรอบที่จะแก้ไข</label>
      <select className="input-field min-w-0" id={id} value={selected.id} onChange={(event) => setSelectedId(event.currentTarget.value)}>
        {editable.map((layer, index) => <option key={layer.id} value={layer.id}>{index + 1}. {layerName(layer)}</option>)}
      </select>
      <p id={`${id}-keys`} className="text-xs text-[var(--fg-secondary)]">
        ลากกรอบหรือใช้ลูกศรเพื่อย้าย ลากมุมหรือใช้ Shift + ลูกศรเพื่อปรับขนาด
      </p>
    </div>}
    <div ref={canvas} role={selected ? 'group' : undefined} aria-label={selected ? `จัดวางกรอบ ${layerName(selected)}` : undefined}
      aria-describedby={selected ? `${id}-keys` : undefined} tabIndex={selected ? 0 : undefined}
      className="relative isolate min-w-0 justify-self-center overflow-hidden rounded-md bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      style={{ aspectRatio: aspect, width: `min(100%, ${aspect * 65}dvh)` }} onKeyDown={keyboard}
      onPointerMove={(event) => { if (gesture.current?.pointerId === event.pointerId) setDraft(frameFromPointer(event)) }}
      onPointerUp={commit} onPointerCancel={cancelPointer} onLostPointerCapture={cancelPointer}>
      <div className="pointer-events-none absolute inset-0"><LayeredSlide design={shown} playlistId={playlistId} preview /></div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
        {editable.map((layer) => {
          const frame = frameFor(layer)
          const active = layer.id === selected?.id
          return <div key={layer.id} data-layer-id={layer.id} onPointerDown={(event) => begin(event, layer, 'move')}
            className={`pointer-events-auto absolute touch-none cursor-move ${active ? 'z-10 outline-2 outline-offset-[-2px] outline-[var(--accent)]' : 'hover:outline hover:outline-1 hover:outline-white/80'}`}
            style={{ left: `${frame.x * 100}%`, top: `${frame.y * 100}%`, width: `${frame.width * 100}%`,
              height: `${frame.height * 100}%`, transform: `rotate(${slideRotation(layer.rotation)}deg)` }} />
        })}
        {selected && corner && <div data-resize-handle onPointerDown={(event) => begin(event, selected, 'resize')}
          style={{ left: `clamp(1rem, ${corner.x * 100}%, calc(100% - 1rem))`, top: `clamp(1rem, ${corner.y * 100}%, calc(100% - 1rem))` }}
          className="pointer-events-auto absolute z-20 grid size-8 -translate-x-1/2 -translate-y-1/2 touch-none cursor-nwse-resize place-items-center">
          <span className="size-3 rounded-xs border border-black bg-[var(--accent)] shadow-sm" />
        </div>}
      </div>
    </div>
    {sourceLayer && shapeEditor && <>
      <ShapeFrameFields layer={sourceLayer} media={shapeEditor.media}
        onShapeChange={(shape) => shapeEditor.onChange(changeElementShape(shapeEditor.layers, sourceLayer.id, shape))}
        onChange={(changed) => shapeEditor.onChange(replacePositionedLayer(shapeEditor.layers, changed))} />
      {shapeOwner && shapeOwner.presetShape && shapeOwner.presetShape.preset !== 'line' && <label className="grid min-w-0 gap-1 text-sm">
        ข้อความในรูปทรง
        <textarea rows={2} className="input-field min-w-0" value={caption?.kind === 'text' ? caption.text : ''}
          onChange={(event) => shapeEditor.onChange(editShapeCaption(shapeEditor.layers, shapeOwner, event.currentTarget.value))} />
      </label>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="chip-btn" disabled={moveSlideElement(shapeEditor.layers, sourceLayer.id, -1) === shapeEditor.layers}
          onClick={() => shapeEditor.onChange(moveSlideElement(shapeEditor.layers, sourceLayer.id, -1))}>เลื่อนกรอบไปด้านหลัง</button>
        <button type="button" className="chip-btn" disabled={moveSlideElement(shapeEditor.layers, sourceLayer.id, 1) === shapeEditor.layers}
          onClick={() => shapeEditor.onChange(moveSlideElement(shapeEditor.layers, sourceLayer.id, 1))}>เลื่อนกรอบไปด้านหน้า</button>
        {shapeOwner && <button type="button" className="btn-ghost"
          onClick={() => shapeEditor.onChange(shapeEditor.layers.filter(({ id }) => authoredShapeGroup(id) !== shapeOwner.id))}>ลบรูปทรง</button>}
      </div>
    </>}
    {selected && onElementEffectsChange && <ElementEffectFields value={readElementEffects(design.layers, selected.id)}
      onChange={(changes) => onElementEffectsChange(selected.id, changes)} />}
  </div>
}
