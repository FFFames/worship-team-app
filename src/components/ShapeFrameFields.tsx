import type { DesignLayer, SlideShapeSettings } from '../types/slideDesign'
import type { MediaLibraryItem } from '../types/media'
import { libraryMediaVisual } from '../utils/mediaLibrary'
import { isSlideShapePreset, newShapeColor, newSlideShape, shapeAdjustments, shapePresets } from '../utils/slideShapePresets'

const field = 'grid min-w-0 gap-1 text-sm'
const presetOptions = Object.entries(shapePresets).map(([preset, label]) => <option key={preset} value={preset}>{label}</option>)

export function InsertSlideShape({ onAdd }: { onAdd: (layer: ReturnType<typeof newSlideShape>) => void }) {
  return <label className={field}>เพิ่มรูปทรง
    <select className="input-field min-w-0" aria-label="เพิ่มรูปทรง" value="" onChange={(event) => {
      const preset = event.currentTarget.value
      if (isSlideShapePreset(preset)) onAdd(newSlideShape(preset))
    }}>
      <option value="">เลือกรูปทรง</option>
      {presetOptions}
    </select>
  </label>
}

type ShapePaintLayer = Extract<DesignLayer, { kind: 'fill' | 'media' }>
type Paint = Pick<Extract<DesignLayer, { kind: 'fill' }>, 'kind' | 'fill'> | { kind: 'media' } & NonNullable<ReturnType<typeof libraryMediaVisual>>

function replacePaint(layer: ShapePaintLayer, paint: Paint): ShapePaintLayer {
  if (layer.kind === 'fill') {
    const { fill: _fill, shape: _shape, outline: _outline, ...base } = layer
    return { ...base, ...paint, ...(_shape && base.presetShape === undefined ? { presetShape: { preset: _shape } } : {}) }
  }
  const { asset: _asset, fit: _fit, loop: _loop, crop: _crop, easyWorshipLegacyPlayback: _native, powerPointMedia: _powerPoint, ...base } = layer
  return { ...base, ...paint }
}

export function ShapeFrameFields({ layer, media, onChange, onShapeChange, showTransform = true }: {
  layer: DesignLayer
  media: MediaLibraryItem[]
  onChange: (layer: DesignLayer) => void
  onShapeChange: (settings: SlideShapeSettings | false | undefined) => void
  showTransform?: boolean
}) {
  const preset = layer.presetShape || undefined
  const adjustment = preset && shapeAdjustments[preset.preset]
  const hasSource = Boolean(layer.clipPaths || layer.shapePaths || (layer.kind === 'fill' && layer.shape))
  const canPaint = (layer.kind === 'fill' || layer.kind === 'media') && preset?.preset !== 'line'
  const selected = preset?.preset ?? (layer.presetShape === false || !hasSource ? 'rectangle' : 'source')

  return <details className="min-w-0 rounded-lg border border-[var(--border-subtle)] p-3!">
    <summary className="cursor-pointer text-sm font-medium">รูปทรงกรอบที่เลือก</summary>
    <div className="mt-3! grid min-w-0 gap-3">
      <label className={field}>รูปทรงของกรอบ
        <select className="input-field min-w-0" aria-label="รูปทรงของกรอบ" value={selected} onChange={(event) => {
          const value = event.currentTarget.value
          if (value === 'source') onShapeChange(undefined)
          else if (isSlideShapePreset(value)) onShapeChange({ preset: value })
        }}>
          {hasSource && <option value="source">รูปทรงเดิม</option>}
          {presetOptions}
        </select>
      </label>
      {preset && adjustment && <Measure label={`${adjustment.label} (%)`} value={(preset.adjustment ?? adjustment.value) * 100}
        onChange={(value) => onShapeChange({ ...preset, adjustment: value / 100 })} />}
      {showTransform && <div className="grid min-w-0 grid-cols-2 gap-2">
        <Measure label="มุมหมุนกรอบ (องศา)" value={layer.rotation ?? 0} min={-360} max={360}
          onChange={(rotation) => onChange({ ...layer, rotation })} />
        <Measure label="ความทึบกรอบ (%)" value={(layer.opacity ?? 1) * 100}
          onChange={(value) => onChange({ ...layer, opacity: value / 100 })} />
      </div>}
      {canPaint && <ShapePaintFields layer={layer} media={media} onChange={onChange} />}
    </div>
  </details>
}

function ShapePaintFields({ layer, media, onChange }: {
  layer: ShapePaintLayer; media: MediaLibraryItem[]; onChange: (layer: ShapePaintLayer) => void
}) {
  const existing = layer.kind === 'fill' ? layer.fill : undefined
  const type = existing?.type === 'gradient' ? 'gradient' : existing?.color === 'transparent' ? 'transparent' : existing ? 'solid' : 'media'
  const colors = media.filter((item) => item.kind === 'image' || item.kind === 'video')
  const gradient = existing?.type === 'gradient' ? existing : undefined
  return <>
    <label className={field}>การเติมรูปทรง
      <select className="input-field min-w-0" aria-label="การเติมรูปทรง" value={type} onChange={(event) => {
        const value = event.currentTarget.value
        if (value === 'gradient') onChange(replacePaint(layer, { kind: 'fill', fill: { type: 'gradient', angle: 135,
          stops: [{ color: newShapeColor, position: 0 }, { color: '#1c4268', position: 1 }] } }))
        else if (value === 'solid' || value === 'transparent') onChange(replacePaint(layer, {
          kind: 'fill', fill: { type: 'solid', color: value === 'transparent' ? 'transparent' : newShapeColor },
        }))
      }}>
        <option value="solid">สีทึบ</option><option value="gradient">ไล่สี</option><option value="transparent">โปร่งใส</option>
        {type === 'media' && <option value="media">ภาพหรือวิดีโอ</option>}
      </select>
    </label>
    {layer.kind === 'fill' && existing?.type === 'solid' && type === 'solid' && <Color label="สีรูปทรง" value={existing.color}
      onChange={(color) => onChange({ ...layer, fill: { type: 'solid', color } })} />}
    {layer.kind === 'fill' && gradient && <div className="grid min-w-0 grid-cols-2 gap-2">
      {gradient.stops.map((stop, index) => <Color key={index} label={`สีไล่ระดับที่ ${index + 1}`} value={stop.color}
        onChange={(color) => onChange({ ...layer, fill: { ...gradient, stops: gradient.stops.map((item, position) =>
          index === position ? { ...item, color } : item) } })} />)}
      <Measure label="มุมไล่สีรูปทรง (องศา)" value={gradient.angle} min={-360} max={360}
        onChange={(angle) => onChange({ ...layer, fill: { ...gradient, angle } })} />
    </div>}
    {(colors.length > 0 || layer.kind === 'media') && <label className={field}>ภาพหรือวิดีโอในรูปทรง
      <select className="input-field min-w-0" aria-label="ภาพหรือวิดีโอในรูปทรง" value="" onChange={(event) => {
        const selected = colors.find((item) => item.id === event.currentTarget.value)
        const visual = selected && libraryMediaVisual(selected)
        if (visual) onChange(replacePaint(layer, { kind: 'media', ...visual }))
      }}>
        <option value="">{layer.kind === 'media' ? layer.asset.filename : 'เลือกจากคลังสื่อ'}</option>
        {colors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>}
    {layer.kind === 'media' && <label className={field}>การจัดขนาดสื่อในรูปทรง
      <select className="input-field min-w-0" aria-label="การจัดขนาดสื่อในรูปทรง" value={layer.fit ?? 'contain'} onChange={(event) => {
        const fit = event.currentTarget.value
        if (fit === 'cover' || fit === 'contain' || fit === 'fill') onChange({ ...layer, fit })
      }}>
        <option value="cover">เต็มรูปทรงแบบตัดขอบ</option><option value="contain">เห็นทั้งภาพ</option><option value="fill">ยืดเต็มรูปทรง</option>
      </select>
    </label>}
  </>
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  return <label className={field}>{label}
    <input type="color" className="h-9 w-full" value={/^#[0-9a-f]{6}$/i.test(value) ? value : newShapeColor}
      onChange={(event) => onChange(event.currentTarget.value)} />
  </label>
}

function Measure({ label, value, min = 0, max = 100, onChange }: {
  label: string; value: number; min?: number; max?: number; onChange: (value: number) => void
}) {
  return <label className={field}>{label}
    <input className="input-field min-w-0 tabular-nums" type="number" min={min} max={max} step="any" value={Number(value.toFixed(3))}
      onChange={(event) => {
        const amount = event.currentTarget.valueAsNumber
        if (amount >= min && amount <= max) onChange(amount)
      }} />
  </label>
}
