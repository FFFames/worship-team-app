/** Restores native effects, timing, and media playback on previously imported slides. */

import type { PlaylistCue } from '../types/database'
import { fillMissingSlidePlayback } from './slidePlayback'
import { fillImportedCueMediaPlayback, fillImportedDesignMediaPlayback, hasImportedMediaPlayback } from './easyWorshipMediaPlaybackRecovery'

type CueSlide = PlaylistCue['slides'][number]
type SlidePlayback = Pick<CueSlide, 'transition' | 'advanceMs' | 'playback' | 'assets' | 'design'>
export type RecoveredSchedulePlayback = ReadonlyMap<string, {
  kind: PlaylistCue['kind']; slides: ReadonlyMap<string, SlidePlayback>
}>

function uniqueSourceRows<T extends { sourceId?: string }>(rows: readonly T[]) {
  const byId = new Map<string, T | undefined>()
  for (const row of rows) {
    if (row.sourceId) byId.set(row.sourceId, byId.has(row.sourceId) ? undefined : row)
  }
  return byId
}

export function recoverableSchedulePlayback(cues: readonly PlaylistCue[]): RecoveredSchedulePlayback {
  const recovered = new Map<string, { kind: PlaylistCue['kind']; slides: Map<string, SlidePlayback> }>()
  for (const [sourceId, cue] of uniqueSourceRows(cues)) {
    if (!cue) continue
    const slides = new Map<string, SlidePlayback>()
    for (const [slideId, slide] of uniqueSourceRows(cue.slides)) {
      if (!slide) continue
      const { transition, playback, advanceMs, assets, design } = slide
      const needsAssets = assets?.some((asset) => !asset.dvd && (asset.kind === 'audio' || asset.kind === 'video' || asset.kind === 'image')
        && (asset.playback || asset.repeat !== undefined || asset.posterSeconds !== undefined))
      const needsDesign = hasImportedMediaPlayback(design)
      if (transition || playback || advanceMs !== undefined || needsAssets || needsDesign) {
        slides.set(slideId, { transition, playback, advanceMs, ...(needsAssets ? { assets } : {}), ...(needsDesign ? { design } : {}) })
      }
    }
    if (slides.size) recovered.set(sourceId, { kind: cue.kind, slides })
  }
  return recovered
}

export function fillSchedulePlayback(cue: PlaylistCue, recovered: RecoveredSchedulePlayback) {
  const source = cue.sourceId ? recovered.get(cue.sourceId) : undefined
  if (!source || source.kind !== cue.kind) return undefined
  const unique = uniqueSourceRows(cue.slides)
  let count = 0
  let mediaCount = 0
  const slides = cue.slides.map((slide) => {
    const native = slide.sourceId && unique.get(slide.sourceId) ? source.slides.get(slide.sourceId) : undefined
    if (!native) return slide
    const updated = fillMissingSlidePlayback(slide, native)
    if (updated !== slide) count++
    const assets = fillImportedCueMediaPlayback(slide.assets, native.assets)
    const design = fillImportedDesignMediaPlayback(slide.design, native.design)
    if (assets === slide.assets && design === slide.design) return updated
    mediaCount++
    return { ...updated, ...(assets ? { assets } : {}), ...(design ? { design } : {}) }
  })
  return count || mediaCount ? { cue: { ...cue, slides }, count, mediaCount } : undefined
}
