import type { PlaylistSlide } from './playlistCues'
import { powerPointBuildLength, stepPowerPointSlide } from './powerPoint/buildNavigation'

type SlidePosition = { cue: number; index: number; step: number }

export function stepScheduleSlide(
  slidesFor: (cue: number) => PlaylistSlide[], cueCount: number, { cue, index, step }: SlidePosition, direction: 1 | -1,
  acrossCues: boolean,
) {
  const blocks = slidesFor(cue)
  const next = stepPowerPointSlide(blocks, index, step, direction)
  if (next) return { cue, blocks, ...next }
  if (!acrossCues) return undefined
  for (let position = cue + direction; position >= 0 && position < cueCount; position += direction) {
    const slides = slidesFor(position)
    if (!slides.length) continue
    const slide = direction === 1 ? 0 : slides.length - 1
    return { cue: position, blocks: slides, index: slide, step: direction === 1 ? 0 : powerPointBuildLength(slides[slide].design) }
  }
}
