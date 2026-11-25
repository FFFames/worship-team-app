import type { MediaClip } from '../types/media'

export function mediaClipKey(clip: MediaClip | undefined): string {
  if (clip?.endTrimSeconds !== undefined) return JSON.stringify([clip.startSeconds ?? null, clip.endSeconds ?? null, clip.endTrimSeconds])
  return clip && (clip.startSeconds !== undefined || clip.endSeconds !== undefined)
    ? JSON.stringify([clip.startSeconds ?? null, clip.endSeconds ?? null]) : ''
}

export function mediaClipBounds(clip: MediaClip, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return undefined
  const { startSeconds, endSeconds, endTrimSeconds } = clip
  const start = typeof startSeconds === 'number' && startSeconds > 0 && startSeconds < duration ? startSeconds : 0
  const mark = endSeconds ?? (typeof endTrimSeconds === 'number' && endTrimSeconds > 0 ? duration - endTrimSeconds : undefined)
  const end = typeof mark === 'number' && Number.isFinite(mark) && mark > start ? Math.min(mark, duration) : duration
  return { start, end }
}

export function videoPosterPosition(seconds: number, duration: number): number | undefined {
  if (!Number.isFinite(duration) || !Number.isFinite(seconds) || seconds < 0 || seconds > duration) return undefined
  return Math.min(seconds, Math.max(0, duration - 0.001))
}

/** Enforces a cue's marks on the element while leaving the original media file intact. */
export function attachMediaClip(media: HTMLMediaElement, clip: MediaClip, repeat: boolean, onEnded: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let finished = false

  function endClip() {
    if (finished) return
    clearTimeout(timer)
    const bounds = mediaClipBounds(clip, media.duration)
    if (bounds && repeat) {
      media.currentTime = bounds.start
      if (media.paused) void media.play().catch(() => {})
      return
    }
    finished = true
    media.pause()
    if (bounds && media.currentTime > bounds.end) media.currentTime = bounds.end
    onEnded()
  }

  function checkTime() {
    clearTimeout(timer)
    const bounds = mediaClipBounds(clip, media.duration)
    if (!bounds || finished || media.seeking) return
    if (media.currentTime < bounds.start) {
      media.currentTime = bounds.start
      return
    }
    if (media.currentTime >= bounds.end) {
      if (!media.paused || media.ended) endClip()
      else if (media.currentTime > bounds.end) media.currentTime = bounds.end
      return
    }
    if (media.paused || media.playbackRate <= 0 || media.readyState < 3) return
    const remaining = 1000 * (bounds.end - media.currentTime) / media.playbackRate
    timer = setTimeout(checkTime, Math.min(1000, Math.max(12, remaining)))
  }

  function resume() {
    const bounds = mediaClipBounds(clip, media.duration)
    if (bounds && (finished || media.currentTime >= bounds.end)) media.currentTime = bounds.start
    finished = false
    checkTime()
  }

  const clockEvents = ['loadedmetadata', 'durationchange', 'playing', 'timeupdate', 'seeking', 'seeked', 'ratechange', 'pause']
  for (const name of clockEvents) media.addEventListener(name, checkTime)
  media.addEventListener('play', resume)
  media.addEventListener('ended', endClip)
  checkTime()

  return () => {
    clearTimeout(timer)
    for (const name of clockEvents) media.removeEventListener(name, checkTime)
    media.removeEventListener('play', resume)
    media.removeEventListener('ended', endClip)
  }
}
