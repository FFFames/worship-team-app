import type { LibraryMediaPlayback, MediaFit, MediaKind, MediaPlayback, MediaUsage } from '../types/media'

export function isMediaFit(value: unknown): value is MediaFit {
  return value === 'auto' || value === 'contain' || value === 'fill' || value === 'cover'
}

export function isMediaUsage(value: unknown): value is MediaUsage {
  return value === 'auto' || value === 'foreground' || value === 'background'
}

export function mediaObjectFit(playback: MediaPlayback | undefined, background = false) {
  const fit = playback?.fit
  return fit === 'auto' ? background ? 'fill' : 'contain' : isMediaFit(fit) ? fit : undefined
}

export function resolveLibraryMediaPlayback(kind: MediaKind, settings: LibraryMediaPlayback | undefined) {
  const { repeat, usage, ...playback } = settings ?? {}
  const defaultBackground = usage === 'background' ? true : usage === 'foreground' ? false : undefined
  if (defaultBackground !== undefined && (!playback.fit || playback.fit === 'auto')) {
    playback.fit = defaultBackground ? 'fill' : 'contain'
  }
  return { playback: Object.keys(playback).length ? playback : undefined,
    repeat: repeat ?? (kind === 'video' ? defaultBackground : undefined) }
}

export function mediaVolume(playback: MediaPlayback | undefined): number {
  const value = playback?.volume
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1
}

export function isMediaPlayback(value: unknown): value is LibraryMediaPlayback {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const { volume, muted, fit, repeat, usage } = value as LibraryMediaPlayback
  return (volume === undefined || typeof volume === 'number' && Number.isFinite(volume) && volume >= 0 && volume <= 1)
    && (muted === undefined || typeof muted === 'boolean')
    && (fit === undefined || isMediaFit(fit))
    && (repeat === undefined || typeof repeat === 'boolean')
    && (usage === undefined || isMediaUsage(usage))
}

export function isMediaPlaybackForKind(value: unknown, kind: string): value is LibraryMediaPlayback {
  if (!isMediaPlayback(value)) return false
  if (kind === 'image') return value.volume === undefined && value.muted === undefined && value.repeat === undefined
  if (kind === 'audio') return value.fit === undefined && value.usage === undefined
  return kind === 'video'
}

export function sameMediaPlayback(left?: LibraryMediaPlayback, right?: LibraryMediaPlayback) {
  return left?.volume === right?.volume && left?.muted === right?.muted && left?.fit === right?.fit
    && left?.repeat === right?.repeat && left?.usage === right?.usage
}
