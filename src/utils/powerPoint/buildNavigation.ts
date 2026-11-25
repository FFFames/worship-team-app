/** Projects the current build while retaining the source slide's identity and order. */

import type { SlideDesign } from '../../types/slideDesign'

type BuildSlide = { design?: SlideDesign }

export const maxPowerPointBuildSteps = 128
export const maxPowerPointBuildChanges = 2048

export function powerPointBuildLength(design: SlideDesign | undefined) {
  return Array.isArray(design?.powerPointBuild) ? design.powerPointBuild.length : 0
}

export function powerPointDesignAtStep(source: SlideDesign, step: number): SlideDesign {
  const { powerPointBuild: build, ...design } = source
  if (!Array.isArray(build) || !build.length) return source
  const visibility = new Map<string, boolean>()
  for (const changes of build) for (const { layerId, visible } of changes) {
    if (!visibility.has(layerId)) visibility.set(layerId, !visible)
  }
  const activationOrder = new Map<string, number>()
  let priority = 0
  for (const changes of build.slice(0, Math.max(0, step))) for (const { layerId, visible } of changes) {
    visibility.set(layerId, visible)
    if (visible) activationOrder.set(layerId, ++priority)
  }
  const order = (id?: string) => activationOrder.get(id ?? '') ?? 0
  const soundtracks = design.soundtracks?.filter((track) => !track.powerPointMediaId || visibility.get(track.powerPointMediaId) !== false)
    .sort((a, b) => order(a.powerPointMediaId) - order(b.powerPointMediaId))
  return { ...design, layers: design.layers.filter((layer) => visibility.get(layer.id) !== false),
    ...(soundtracks ? { soundtracks } : {}) }
}

export function stepPowerPointSlide(slides: readonly BuildSlide[], index: number, step: number, direction: 1 | -1) {
  const build = powerPointBuildLength(slides[index]?.design)
  const nextStep = Math.min(step, build) + direction
  if (nextStep >= 0 && nextStep <= build) return { index, step: nextStep }
  const nextIndex = index + direction
  if (slides[nextIndex]) return { index: nextIndex, step: direction === 1 ? 0 : powerPointBuildLength(slides[nextIndex].design) }
}
