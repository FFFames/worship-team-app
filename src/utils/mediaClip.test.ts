import { describe, expect, it, vi } from 'vitest'
import { readEasyWorshipMediaClip } from './easyWorshipMediaClip'
import { attachMediaClip, mediaClipBounds } from './mediaClip'

class TestMedia extends EventTarget {
  duration = 12
  currentTime = 0
  paused = true
  playbackRate = 1
  readyState = 4
  seeking = false
  ended = false
  pause = vi.fn(() => { this.paused = true })
  play = vi.fn(async () => { this.paused = false })
}

describe('media clip marks', () => {
  it('converts EasyWorship positions and ignores unset or reversed marks', () => {
    expect(readEasyWorshipMediaClip(12_345_678, 42_000_000)).toEqual({ startSeconds: 1.2345678, endSeconds: 4.2 })
    expect(readEasyWorshipMediaClip(-1, 20_000_000)).toEqual({ endSeconds: 2 })
    expect(readEasyWorshipMediaClip(-1, -1)).toBeUndefined()
    expect(readEasyWorshipMediaClip(20_000_000, 10_000_000)).toBeUndefined()
    expect(mediaClipBounds({ startSeconds: 3, endSeconds: 20 }, 9)).toEqual({ start: 3, end: 9 })
  })

  it('clips a one-shot play once and starts at the original mark when replayed', () => {
    const media = new TestMedia()
    const ended = vi.fn()
    const detach = attachMediaClip(media as unknown as HTMLMediaElement, { startSeconds: 2, endSeconds: 4 }, false, ended)
    expect(media.currentTime).toBe(2)
    media.paused = false
    media.currentTime = 4.04
    media.dispatchEvent(new Event('timeupdate'))
    expect(media.currentTime).toBe(4)
    expect(media.pause).toHaveBeenCalledOnce()
    media.dispatchEvent(new Event('ended'))
    expect(ended).toHaveBeenCalledOnce()
    media.paused = false
    media.dispatchEvent(new Event('play'))
    expect(media.currentTime).toBe(2)
    detach()
  })

  it('calculates PowerPoint end trims relative to the media duration', () => {
    expect(mediaClipBounds({ startSeconds: 1.5, endTrimSeconds: 3 }, 8)).toEqual({ start: 1.5, end: 5 })
    expect(mediaClipBounds({ endTrimSeconds: 3.25 }, 10)).toEqual({ start: 0, end: 6.75 })
  })

  it('returns a looping clip to the mark-in without reporting completion', () => {
    const media = new TestMedia()
    const ended = vi.fn()
    const detach = attachMediaClip(media as unknown as HTMLMediaElement, { startSeconds: 1.25, endSeconds: 3 }, true, ended)
    media.paused = false
    media.currentTime = 3.03
    media.dispatchEvent(new Event('timeupdate'))
    expect(media.currentTime).toBe(1.25)
    expect(ended).not.toHaveBeenCalled()
    detach()
  })
})
