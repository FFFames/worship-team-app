/** Resolves the closest weekly start or end for the stage countdown. */

import type { FoldbackServiceSettings } from './foldbackAppearance'
import { dateAtDay, daySeconds, serviceEndDayOffset } from './serviceIntervals'

export function foldbackServiceCountdown(settings: FoldbackServiceSettings, now: Date) {
  if (!settings.enabled || !settings.intervals?.length) return undefined
  const current = now.getTime()
  let closest: { target: number; phase: 'start' | 'end' } | undefined

  for (const interval of settings.intervals) {
    const endDayOffset = serviceEndDayOffset(interval)
    const duration = endDayOffset * daySeconds + interval.endSeconds - interval.startSeconds
    if (duration <= 0) continue
    // Keep a just-passed boundary for one third of the service, capped at fifteen minutes.
    const oldest = current - Math.min(Math.floor(duration / 3), 900) * 1000
    const fromToday = interval.startDay - now.getDay()
    for (const phase of ['start', 'end'] as const) {
      const day = (fromToday + (phase === 'end' ? endDayOffset : 0) + 7) % 7
      const seconds = phase === 'start' ? interval.startSeconds : interval.endSeconds
      const previous = dateAtDay(now, day - 7, seconds)
      const upcoming = dateAtDay(now, day, seconds)
      const target = previous >= oldest ? previous : upcoming >= oldest ? upcoming : dateAtDay(now, day + 7, seconds)
      // Native automatic mode prefers the end when both boundaries are equally close.
      if (!closest || Math.abs(target - current) < Math.abs(closest.target - current)
        || (Math.abs(target - current) === Math.abs(closest.target - current) && closest.phase === 'start' && phase === 'end')) {
        closest = { target, phase }
      }
    }
  }
  if (!closest || (closest.target < current && !settings.allowOverrun)) return undefined

  const remaining = Math.ceil((closest.target - current) / 1000)
  const absolute = Math.abs(remaining)
  const format = settings.format ?? 'hh:nn{ss}'
  const days = Math.floor(absolute / daySeconds)
  const seconds = absolute % daySeconds
  const pad = (value: number) => String(value).padStart(2, '0')
  const hours = pad(Math.floor(seconds / 3600))
  const minutes = pad(Math.floor(seconds / 60) % 60)
  const showSeconds = format === 'hh:nn:ss' || (format === 'hh:nn{ss}' && absolute < 60)
  const value = format === 'nn:ss' ? `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`
    : `${hours}:${minutes}${showSeconds ? ':' + pad(seconds % 60) : ''}`
  return {
    phase: closest.phase,
    text: `${remaining < 0 ? '-' : ''}${days ? days + ' วัน ' : ''}${value}`,
  }
}
