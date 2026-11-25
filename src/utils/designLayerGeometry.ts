/** Restores visual details on matching native frames while retaining saved edits. */

import type { DesignLayer, DesignSlide, SlideDesign } from '../types/slideDesign'

export function hasDesignGeometry(design?: SlideDesign) {
  return design?.layers.some((layer) => layer.rotation !== undefined || layer.clipPaths !== undefined
    || layer.shapePaths !== undefined
    || layer.elementBorder !== undefined || layer.elementShadow !== undefined || layer.elementReflection !== undefined) ?? false
}

export function isNativeBorderOnlyLayer(layer: DesignLayer) {
  return layer.kind === 'fill' && layer.id.startsWith('native-border:') && layer.fill.type === 'solid' && layer.fill.color === 'transparent'
}

export function restoreDesignGeometry(saved: SlideDesign | undefined, source: SlideDesign | undefined) {
  if (!saved || !source || !hasDesignGeometry(source)) return undefined
  const byId = new Map<string, DesignLayer | undefined>()
  for (const layer of source.layers) byId.set(layer.id, byId.has(layer.id) ? undefined : layer)
  let rotations = 0
  let masks = 0
  let borders = 0
  let shadows = 0
  let reflections = 0
  const layers = saved.layers.map((layer) => {
    const next = byId.get(layer.id)
    if (layer.songArtwork || !next || layer.kind !== next.kind
      || layer.frame.x !== next.frame.x || layer.frame.y !== next.frame.y
      || layer.frame.width !== next.frame.width || layer.frame.height !== next.frame.height) return layer
    const rotation = layer.rotation === undefined ? next.rotation : undefined
    const clipPaths = layer.clipPaths === undefined ? next.clipPaths : undefined
    const unchangedMask = layer.clipPaths === undefined || (layer.clipPaths.length === next.clipPaths?.length
      && layer.clipPaths.every((path, index) => next.clipPaths?.[index] === path))
    const shapePaths = unchangedMask && layer.shapePaths === undefined ? next.shapePaths : undefined
    const elementBorder = layer.elementBorder === undefined ? next.elementBorder : undefined
    const elementShadow = layer.elementShadow === undefined ? next.elementShadow : undefined
    const elementReflection = layer.elementReflection === undefined ? next.elementReflection : undefined
    if (rotation === undefined && !clipPaths && !shapePaths && elementBorder === undefined && elementShadow === undefined && elementReflection === undefined) return layer
    if (layer.kind === 'media' && next.kind === 'media' && layer.asset.filename !== next.asset.filename
      && !(layer.asset.easyWorshipFileHash && layer.asset.easyWorshipFileHash === next.asset.easyWorshipFileHash)) return layer
    if (layer.kind === 'web' && next.kind === 'web' && layer.url !== next.url) return layer
    if (layer.kind === 'camera' && next.kind === 'camera' && layer.asset.filename !== next.asset.filename) return layer
    if (rotation !== undefined) rotations++
    if (clipPaths || shapePaths) masks++
    if (elementBorder !== undefined) borders++
    if (elementShadow !== undefined) shadows++
    if (elementReflection !== undefined) reflections++
    return { ...layer, ...(rotation !== undefined ? { rotation } : {}), ...(clipPaths ? { clipPaths } : {}), ...(shapePaths ? { shapePaths } : {}),
      ...(elementBorder !== undefined ? { elementBorder } : {}), ...(elementShadow !== undefined ? { elementShadow } : {}),
      ...(elementReflection !== undefined ? { elementReflection } : {}) }
  })
  if (source.layers.some(isNativeBorderOnlyLayer) && !saved.layers.some(isNativeBorderOnlyLayer)) {
    const before = source.layers.filter((layer) => !isNativeBorderOnlyLayer(layer))
    if (before.length === layers.length && before.every((layer, index) => layer.id === layers[index].id && layer.kind === layers[index].kind)) {
      let layerIndex = 0
      const expanded = source.layers.map((layer) => {
        if (!isNativeBorderOnlyLayer(layer)) return layers[layerIndex++]
        borders++
        if (layer.clipPaths || layer.shapePaths) masks++
        if (layer.elementShadow !== undefined) shadows++
        if (layer.elementReflection !== undefined) reflections++
        return layer
      })
      return { design: { ...saved, layers: expanded }, rotations, masks, borders, shadows, reflections }
    }
  }
  return rotations || masks || borders || shadows || reflections
    ? { design: { ...saved, layers }, rotations, masks, borders, shadows, reflections } : undefined
}

export function restoreSlideGeometry(saved: DesignSlide[], source: readonly DesignSlide[]) {
  const byId = new Map<string, DesignSlide | undefined>()
  for (const slide of source) byId.set(slide.id, byId.has(slide.id) ? undefined : slide)
  let rotations = 0
  let masks = 0
  let borders = 0
  let shadows = 0
  let reflections = 0
  const slides = saved.map((slide) => {
    const restored = restoreDesignGeometry(slide.design, byId.get(slide.id)?.design)
    if (!restored) return slide
    rotations += restored.rotations
    masks += restored.masks
    borders += restored.borders
    shadows += restored.shadows
    reflections += restored.reflections
    return { ...slide, design: restored.design }
  })
  return { slides: rotations || masks || borders || shadows || reflections ? slides : saved, rotations, masks, borders, shadows, reflections }
}
