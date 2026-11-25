import type { DesignElementBorder, DesignLayer, SlideShapePreset, SlideShapeSettings } from '../types/slideDesign'
import { visibleSlideFrame } from './slideFrame'

export const shapePresets: Record<SlideShapePreset, string> = {
  rectangle: 'สี่เหลี่ยม', roundRect: 'สี่เหลี่ยมมุมมน', ellipse: 'วงรี', triangle: 'สามเหลี่ยม', diamond: 'สี่เหลี่ยมข้าวหลามตัด',
  pentagon: 'ห้าเหลี่ยม', hexagon: 'หกเหลี่ยม', star: 'ดาว', arrow: 'ลูกศร', chevron: 'หัวลูกศร', cross: 'กากบาท', line: 'เส้นตรง',
}

export const shapeAdjustments: Partial<Record<SlideShapePreset, { label: string; value: number }>> = {
  roundRect: { label: 'ความมนของมุม', value: .35 },
  triangle: { label: 'ตำแหน่งยอด', value: .5 },
  star: { label: 'ขนาดแกนดาว', value: .45 },
  arrow: { label: 'ขนาดหัวลูกศร', value: .35 },
  chevron: { label: 'ความกว้างหัวลูกศร', value: .35 },
  cross: { label: 'ความกว้างของแขน', value: .4 },
}

export function isSlideShapePreset(value: unknown): value is SlideShapePreset {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(shapePresets, value)
}

const lineBorder: DesignElementBorder = { color: '#ffffff', opacity: 1, width: 4 / 1080, position: 'center', join: 'round' }
export const newShapeColor = '#32a882'

export function authoredShapeGroup(id: string) {
  return /^shape:[^:]+(?=:text$|$)/.exec(id)?.[0]
}

export function withShapePreset<T extends DesignLayer>(layer: T, settings: SlideShapeSettings | false | undefined): T {
  return { ...layer, presetShape: settings,
    ...(settings && settings.preset === 'line' && !layer.elementBorder ? { elementBorder: lineBorder } : {}) }
}

export function newSlideShape(preset: SlideShapePreset): Extract<DesignLayer, { kind: 'fill' }> {
  return withShapePreset({
    id: `shape:${crypto.randomUUID()}`, kind: 'fill', role: 'foreground', frame: { x: .31, y: .28, width: .38, height: .34 },
    fill: { type: 'solid', color: newShapeColor },
  }, { preset })
}

type Point = [number, number]
const digits = (value: number) => Number(value.toFixed(6))
function polygon(points: Point[]) {
  return points.map(([x, y], index) => `${index ? 'L' : 'M'} ${digits(x)} ${digits(y)}`).join(' ') + ' Z'
}

function regularPolygon(sides: number, innerRadius?: number) {
  const points: Point[] = Array.from({ length: innerRadius ? sides * 2 : sides }, (_, index) => {
    const angle = index * Math.PI * 2 / (innerRadius ? sides * 2 : sides) - Math.PI / 2
    const radius = innerRadius && index % 2 ? innerRadius : 1
    return [Math.cos(angle) * radius, Math.sin(angle) * radius]
  })
  const x = points.map(([x]) => x)
  const y = points.map(([, y]) => y)
  const left = Math.min(...x), top = Math.min(...y)
  const width = Math.max(...x) - left, height = Math.max(...y) - top
  return polygon(points.map(([x, y]) => [(x - left) / width, (y - top) / height]))
}

function outline(settings: SlideShapeSettings, width: number, height: number) {
  const { preset } = settings
  const raw = settings.adjustment ?? shapeAdjustments[preset]?.value ?? .5
  const amount = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : .5
  const head = .12 + .65 * amount
  const arm = .1 + .75 * amount
  const low = (1 - arm) / 2, high = 1 - low
  switch (preset) {
    case 'rectangle': return undefined
    case 'roundRect': {
      if (!amount || !width || !height) return undefined
      const radius = Math.min(width, height) * amount / 2
      const x = digits(radius / width), y = digits(radius / height)
      const right = digits(1 - x), bottom = digits(1 - y)
      return `M ${x} 0 L ${right} 0 A ${x} ${y} 0 0 1 1 ${y} L 1 ${bottom} A ${x} ${y} 0 0 1 ${right} 1 L ${x} 1 A ${x} ${y} 0 0 1 0 ${bottom} L 0 ${y} A ${x} ${y} 0 0 1 ${x} 0 Z`
    }
    case 'ellipse': return 'M 1 0.5 A 0.5 0.5 0 0 1 0 0.5 A 0.5 0.5 0 0 1 1 0.5 Z'
    case 'triangle': return polygon([[amount, 0], [1, 1], [0, 1]])
    case 'diamond': return polygon([[.5, 0], [1, .5], [.5, 1], [0, .5]])
    case 'pentagon': return regularPolygon(5)
    case 'hexagon': return polygon([[.25, 0], [.75, 0], [1, .5], [.75, 1], [.25, 1], [0, .5]])
    case 'star': return regularPolygon(5, .12 + .76 * amount)
    case 'arrow': return polygon([[0, .28], [1 - head, .28], [1 - head, 0], [1, .5], [1 - head, 1], [1 - head, .72], [0, .72]])
    case 'chevron': return polygon([[0, 0], [1 - head, 0], [1, .5], [1 - head, 1], [0, 1], [head, .5]])
    case 'cross': return polygon([[low, 0], [high, 0], [high, low], [1, low], [1, high], [high, high],
      [high, 1], [low, 1], [low, high], [0, high], [0, low], [low, low]])
    case 'line': return 'M 0 0.5 L 1 0.5'
  }
}

export function revealSlideShape(layer: DesignLayer, aspect: number): DesignLayer {
  const settings = layer.presetShape
  if (settings === undefined) return layer
  const { width, height } = visibleSlideFrame(layer.frame)
  const d = settings && outline(settings, width * aspect, height)
  const shape = layer.kind === 'fill' ? { ...layer, shape: undefined } : layer
  return {
    ...shape,
    clipPaths: d && settings && settings.preset !== 'line' ? [d] : undefined,
    shapePaths: d && settings && settings.preset === 'line' ? [{ d, fill: 'none', stroke: true }] : undefined,
  }
}
