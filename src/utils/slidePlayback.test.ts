import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSlideAdvanceController, getSlideAdvance } from './slidePlayback'

afterEach(() => vi.useRealTimers())

describe('slide playback', () => {
  it('uses inherited timing, respects manual overrides and holds a looping slide', () => {
    expect(getSlideAdvance([{ playback: { mode: 'timer', delayMs: 650 } }, {}], 0))
      .toEqual({ index: 1, delay: 650, afterMedia: false })
    expect(getSlideAdvance([{ advanceMs: 1000, playback: { mode: 'manual' } }, {}], 0)).toBeNull()
    expect(getSlideAdvance([{ playback: { mode: 'timer', delayMs: 1000, loop: true } }, {}], 0)).toBeNull()
    expect(getSlideAdvance([{}, { playback: { mode: 'media' } }], 1, true))
      .toEqual({ index: 0, delay: 0, afterMedia: true })
  })

  it('uses only the active completion and starts the delay after the media ends', () => {
    vi.useFakeTimers()
    const advance = createSlideAdvanceController()
    const onAdvance = vi.fn()
    const onHold = vi.fn()
    const plan = { index: 1, delay: 300, afterMedia: true }
    const stale = advance.start(plan, onAdvance, onHold)!
    const current = advance.start(plan, onAdvance, onHold)!
    advance.report(stale, 'ended')
    vi.advanceTimersByTime(1000)
    expect(onAdvance).not.toHaveBeenCalled()
    advance.report(current, 'ended')
    vi.advanceTimersByTime(299)
    expect(onAdvance).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onAdvance).toHaveBeenCalledExactlyOnceWith(1)
    advance.cancel()
  })

  it('holds on media failure and avoids an immediate loop when a slide has no media', () => {
    vi.useFakeTimers()
    const advance = createSlideAdvanceController()
    const onAdvance = vi.fn()
    const onHold = vi.fn()
    for (const outcome of ['failed', 'empty'] as const) {
      const id = advance.start({ index: 1, delay: 0, afterMedia: true }, onAdvance, onHold)!
      advance.report(id, outcome)
    }
    vi.runAllTimers()
    expect(onHold.mock.calls).toEqual([['failed'], ['empty']])
    expect(onAdvance).not.toHaveBeenCalled()
  })
})
