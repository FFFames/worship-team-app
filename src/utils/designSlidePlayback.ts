/** Matches optional playback settings to saved slides without replacing their content. */

import type { DesignSlide } from '../types/slideDesign'
import { fillMissingSlidePlayback } from './slidePlayback'
import { fillImportedDesignMediaPlayback, hasImportedMediaPlayback } from './easyWorshipMediaPlaybackRecovery'

export function hasDesignSlidePlayback(slides: readonly DesignSlide[]) {
  return slides.some(({ transition, playback, advanceMs }) => transition || playback || advanceMs !== undefined)
}

export function hasDesignMediaPlayback(slides: readonly DesignSlide[]) {
  return slides.some(({ design }) => hasImportedMediaPlayback(design))
}

function uniqueSlides(slides: readonly DesignSlide[]) {
  const byId = new Map<string, DesignSlide | undefined>()
  for (const slide of slides) byId.set(slide.id, byId.has(slide.id) ? undefined : slide)
  return byId
}

export function backfillDesignSlidePlayback(saved: DesignSlide[], source: readonly DesignSlide[]) {
  const incoming = uniqueSlides(source)
  const current = uniqueSlides(saved)
  let count = 0
  let matchedTransition = false
  const slides = saved.map((slide) => {
    const original = current.get(slide.id) && incoming.get(slide.id)
    if (!original) return slide
    matchedTransition ||= Boolean(original.transition)
    const updated = fillMissingSlidePlayback(slide, original)
    if (updated !== slide) count++
    return updated
  })
  return { slides: count ? slides : saved, count, matchedTransition }
}

export function backfillDesignMediaPlayback(saved: DesignSlide[], source: readonly DesignSlide[]) {
  const incoming = uniqueSlides(source)
  const current = uniqueSlides(saved)
  let count = 0
  const slides = saved.map((slide) => {
    const original = current.get(slide.id) && incoming.get(slide.id)
    const design = fillImportedDesignMediaPlayback(slide.design, original?.design)
    if (!design || design === slide.design) return slide
    count++
    return { ...slide, design }
  })
  return { slides: count ? slides : saved, count }
}

export function countRestoredDesignSlidePlayback(saved: readonly DesignSlide[], updated: readonly DesignSlide[]) {
  const before = uniqueSlides(saved)
  return updated.filter((slide) => {
    const previous = before.get(slide.id)
    return previous && ((previous.transition === undefined && slide.transition !== undefined)
      || (previous.playback === undefined && slide.playback !== undefined) || (previous.advanceMs === undefined && slide.advanceMs !== undefined))
  }).length
}
