import type { DesignElementShadow, DesignFrame, DesignLayer, ElementEffectChanges, SlideShapeSettings } from '../types/slideDesign'
import { editDesignText, isCanvasBackground } from './slideDesign'
import { slideRotation, visibleSlideFrame } from './slideFrame'
import { authoredShapeGroup, withShapePreset } from './slideShapePresets'

export function elementShadowOffset(shadow: DesignElementShadow) {
  const radians = shadow.angle * Math.PI / 180
  return { x: Math.cos(radians) * shadow.offset, y: -Math.sin(radians) * shadow.offset }
}

export function reflectionBounds(layers: readonly DesignLayer[], aspect: number) {
  let top = Infinity
  let bottom = -Infinity
  for (const layer of layers) {
    const frame = visibleSlideFrame(layer.frame)
    const border = layer.elementBorder
    const edge = border && border.position !== 'inner' ? border.width * (border.position === 'outer' ? 1 : .5) : 0
    const radians = slideRotation(layer.rotation) * Math.PI / 180
    const halfHeight = Math.abs(Math.cos(radians)) * (frame.height / 2 + edge)
      + Math.abs(Math.sin(radians)) * (frame.width * aspect / 2 + edge)
    const center = frame.y + frame.height / 2
    top = Math.min(top, center - halfHeight)
    bottom = Math.max(bottom, center + halfHeight)
  }
  return { top, height: Math.max(.001, bottom - top) }
}

const ellipticBorder = ['M 1 .5 A .5 .5 0 0 1 0 .5 A .5 .5 0 0 1 1 .5 Z']

export function elementBorderPaths(layer: DesignLayer, aspect: number) {
  if (layer.clipPaths || layer.kind !== 'fill') return layer.clipPaths
  if (layer.shape === 'ellipse') return ellipticBorder
  if (layer.shape !== 'roundRect') return undefined
  const { width, height } = visibleSlideFrame(layer.frame)
  if (!(width && height)) return undefined
  const radius = Math.min(.02, width * aspect / 2, height / 2)
  const x = radius / (width * aspect)
  const y = radius / height
  return [`M ${x} 0 H ${1 - x} A ${x} ${y} 0 0 1 1 ${y} V ${1 - y} A ${x} ${y} 0 0 1 ${1 - x} 1
    H ${x} A ${x} ${y} 0 0 1 0 ${1 - y} V ${y} A ${x} ${y} 0 0 1 ${x} 0 Z`]
}

function elementGroup(layer: DesignLayer) {
  const authored = authoredShapeGroup(layer.id)
  if (authored) return authored
  const native = /^((?:default:)*)(?:native-border:(\d+)|(\d+)-(?:foreground|background))$/.exec(layer.id)
  if (native) return native[1] + (native[2] ?? native[3])
  const effect = layer.elementShadow || layer.elementReflection
  return effect ? effect.group : layer.id
}

export function editShapeCaption(layers: DesignLayer[], owner: DesignLayer, text: string) {
  const id = `${owner.id}:text`
  const current = layers.find((layer) => layer.id === id)
  if (!text) return layers.filter((layer) => layer.id !== id)
  if (current?.kind === 'text') return layers.map((layer) => layer.id === id ? editDesignText(current, text) : layer)
  const caption: DesignLayer = {
    id, kind: 'text', frame: owner.frame, text, style: { fontSize: .055, fitText: true, align: 'center' },
    rotation: owner.rotation, opacity: owner.opacity, presetShape: owner.presetShape,
    elementShadow: owner.elementShadow, elementReflection: owner.elementReflection,
  }
  return layers.flatMap((layer) => layer.id === owner.id ? [layer, caption] : [layer])
}

export function replacePositionedLayer(layers: DesignLayer[], changed: DesignLayer) {
  const authored = authoredShapeGroup(changed.id)
  return layers.map((layer) => {
    if (layer.id === changed.id) return changed
    if (!authored || authoredShapeGroup(layer.id) !== authored) return layer
    return { ...layer, rotation: changed.rotation, opacity: changed.opacity }
  })
}

export function moveLayerFrame(layers: DesignLayer[], id: string, frame: DesignFrame) {
  const authored = authoredShapeGroup(id)
  return layers.map((layer) => layer.id === id || (authored && authoredShapeGroup(layer.id) === authored) ? { ...layer, frame } : layer)
}

function elementRange(layers: readonly DesignLayer[], selected: number) {
  const group = elementGroup(layers[selected])
  let start = selected
  let end = selected
  while (start > 0 && elementGroup(layers[start - 1]) === group) start--
  while (end + 1 < layers.length && elementGroup(layers[end + 1]) === group) end++
  return { group, start, end }
}

export function changeElementShape(layers: DesignLayer[], layerId: string, settings: SlideShapeSettings | false | undefined) {
  const index = layers.findIndex((layer) => layer.id === layerId)
  if (index < 0) return layers
  const { start, end } = elementRange(layers, index)
  return layers.map((layer, index) => {
    if (index < start || index > end) return layer
    return index === end ? withShapePreset(layer, settings) : { ...layer, presetShape: settings }
  })
}

export function moveSlideElement(layers: DesignLayer[], layerId: string, direction: -1 | 1) {
  const index = layers.findIndex((layer) => layer.id === layerId)
  if (index < 0) return layers
  const { start, end } = elementRange(layers, index)
  const neighbor = direction < 0 ? start - 1 : end + 1
  if (!layers[neighbor] || isCanvasBackground(layers[neighbor])) return layers
  const target = elementRange(layers, neighbor)
  const selected = layers.slice(start, end + 1)
  if (direction < 0) return [...layers.slice(0, target.start), ...selected, ...layers.slice(target.start, start), ...layers.slice(end + 1)]
  return [...layers.slice(0, start), ...layers.slice(end + 1, target.end + 1), ...selected, ...layers.slice(target.end + 1)]
}

export function readElementEffects(layers: readonly DesignLayer[], layerId: string): ElementEffectChanges {
  const index = layers.findIndex((layer) => layer.id === layerId)
  if (index < 0) return {}
  const { start, end } = elementRange(layers, index)
  const element = layers.slice(start, end + 1).reverse()
  const border = element.find((layer) => layer.elementBorder !== undefined)?.elementBorder
  const shadow = element.find((layer) => layer.elementShadow !== undefined)?.elementShadow
  const reflection = element.find((layer) => layer.elementReflection !== undefined)?.elementReflection
  const legacyText = shadow === undefined ? element.find((layer) => layer.kind === 'text' && layer.style?.shadow) : undefined
  const legacyColor = legacyText?.kind === 'text' ? legacyText.style?.shadowColor : undefined
  const legacyShadow = legacyText ? {
    color: legacyColor && /^#[0-9a-f]{6}$/i.test(legacyColor) ? legacyColor : '#000000',
    opacity: .8, blur: 4 / 1080, offset: 2 / 1080, angle: 270,
  } : undefined
  return { elementBorder: border, elementShadow: shadow === undefined ? legacyShadow : withoutGroup(shadow),
    elementReflection: withoutGroup(reflection) }
}

function withoutGroup<T extends { group: string }>(value: T | false | undefined): Omit<T, 'group'> | false | undefined {
  if (!value) return value
  const { group: _group, ...effect } = value
  return effect
}

export function editElementEffects(layers: DesignLayer[], layerId: string, effects: ElementEffectChanges): DesignLayer[] {
  const index = layers.findIndex((layer) => layer.id === layerId)
  if (index < 0) return layers
  const { group, start, end } = elementRange(layers, index)
  const { elementBorder, elementShadow, elementReflection } = effects
  return layers.map((layer, index) => {
    if (index < start || index > end) return layer
    return {
      ...layer,
      ...(elementBorder !== undefined && (index === end || layer.elementBorder !== undefined)
        ? { elementBorder: index === end ? elementBorder : false } : {}),
      ...(elementShadow !== undefined ? { elementShadow: elementShadow && { ...elementShadow, group } } : {}),
      ...(elementReflection !== undefined ? { elementReflection: elementReflection && { ...elementReflection, group } } : {}),
    }
  })
}
