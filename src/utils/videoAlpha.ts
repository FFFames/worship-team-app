/** Distinguishes a normal video from a packed color-and-mask video. */

import type { VideoAlphaMode } from '../types/media'

export function splitVideoAlpha(value: unknown): VideoAlphaMode | undefined {
  return value === 'top-bottom' || value === 'side-by-side' ? value : undefined
}

export function readEasyWorshipVideoAlpha(value: unknown): VideoAlphaMode | undefined {
  if (value === 1) return 'top-bottom'
  if (value === 2) return 'side-by-side'
  return undefined
}
