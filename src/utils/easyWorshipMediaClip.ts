import type { MediaClip } from '../types/media'

const ticksPerSecond = 10_000_000

/** A zero position selects the first frame, and -1 leaves the thumbnail automatic. */
export function readEasyWorshipPosterSeconds(ticks: unknown): number | undefined {
  return typeof ticks === 'number' && Number.isSafeInteger(ticks) && ticks >= 0
    ? ticks / ticksPerSecond : undefined
}

/** Modern EasyWorship uses 100-nanosecond positions and -1 for an unset mark. */
export function readEasyWorshipMediaClip(start: unknown, end: unknown): MediaClip | undefined {
  const seconds = (ticks: unknown) => typeof ticks === 'number' && Number.isSafeInteger(ticks) && ticks > 0
    ? ticks / ticksPerSecond : undefined
  const startSeconds = seconds(start)
  const endSeconds = seconds(end)
  if (startSeconds !== undefined && endSeconds !== undefined && endSeconds <= startSeconds) return undefined
  if (startSeconds === undefined && endSeconds === undefined) return undefined
  return { ...(startSeconds === undefined ? {} : { startSeconds }), ...(endSeconds === undefined ? {} : { endSeconds }) }
}
