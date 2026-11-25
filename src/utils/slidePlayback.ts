import type { SlidePlaybackSettings, SlideTransition } from '../types/slideDesign'

export type PlaybackSlide = { advanceMs?: number; playback?: SlidePlaybackSettings }
export type SlidePlaybackFields = PlaybackSlide & { transition?: SlideTransition; transitionEdited?: true }
export type MediaOutcome = 'ended' | 'empty' | 'failed'

export function describeSlidePlayback(playback: SlidePlaybackSettings) {
  const seconds = (playback.delayMs ?? 0) / 1000
  const advance = playback.mode === 'timer' ? `เลื่อนหลัง ${seconds} วินาที`
    : playback.mode === 'media' ? `เลื่อนเมื่อสื่อจบ${seconds ? ` + ${seconds} วินาที` : ''}` : 'เลื่อนเอง'
  return [advance, playback.loop && 'วนสื่อบนสไลด์', playback.restart && 'เริ่มสื่อใหม่'].filter(Boolean).join(' · ')
}

/** The older importer saved the timer separately. Keep it and any explicit newer settings. */
export function fillMissingSlidePlayback<T extends SlidePlaybackFields>(slide: T, source: SlidePlaybackFields): T {
  const transition = slide.transition === undefined && !slide.transitionEdited ? source.transition : undefined
  const canRestoreTiming = slide.playback === undefined
    && (slide.advanceMs === undefined || slide.advanceMs === source.advanceMs)
  const playback = canRestoreTiming ? source.playback : undefined
  const advanceMs = canRestoreTiming && slide.advanceMs === undefined ? source.advanceMs : undefined
  if (!transition && !playback && advanceMs === undefined) return slide
  return { ...slide, ...(transition ? { transition } : {}), ...(playback ? { playback } : {}),
    ...(advanceMs !== undefined ? { advanceMs } : {}) }
}

export function getSlideAdvance(slides: ReadonlyArray<PlaybackSlide>, index: number, looping?: boolean) {
  const slide = slides[index]
  if (!slide || slide.playback?.loop) return null
  const mode = slide.playback?.mode ?? (slide.advanceMs !== undefined ? 'timer' : 'manual')
  if (mode !== 'timer' && mode !== 'media') return null
  const delay = slide.playback?.delayMs ?? slide.advanceMs ?? 0
  if (!Number.isSafeInteger(delay) || delay < 0 || delay > 2_147_483_647 || (mode === 'timer' && delay === 0)) return null
  const next = index + 1 < slides.length ? index + 1 : looping && slides.length > 1 ? 0 : -1
  return next < 0 ? null : { index: next, delay, afterMedia: mode === 'media' }
}

/** Media callbacks and timers both stop when the controller selects another slide. */
export function createSlideAdvanceController() {
  let timer: ReturnType<typeof setTimeout> | undefined
  let waiting: { id: string; complete: (outcome: MediaOutcome) => void } | undefined

  function cancel() {
    clearTimeout(timer)
    waiting = undefined
  }

  return {
    cancel,
    start(advance: ReturnType<typeof getSlideAdvance>, onAdvance: (next: number) => void, onHold: (reason: 'empty' | 'failed') => void) {
      cancel()
      if (!advance) return undefined
      const next = () => { timer = setTimeout(() => onAdvance(advance.index), advance.delay) }
      if (!advance.afterMedia) {
        next()
        return undefined
      }
      const id = crypto.randomUUID()
      waiting = { id, complete: (outcome) => {
        if (outcome === 'ended' || (outcome === 'empty' && advance.delay > 0)) next()
        else onHold(outcome)
      } }
      return id
    },
    report(id: string, outcome: MediaOutcome) {
      if (waiting?.id !== id) return
      const { complete } = waiting
      waiting = undefined
      complete(outcome)
    },
  }
}
