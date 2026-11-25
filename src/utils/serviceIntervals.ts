/** Converts weekly service times to local occurrences and validates their stored representation. */

import type { AlertServiceInterval } from '../types/alertTemplate'

export const daySeconds = 86_400

export function validServiceInterval(value: unknown): value is AlertServiceInterval {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const { startDay, endDay, startSeconds, endSeconds } = value as Partial<AlertServiceInterval>
  const within = (part: unknown, maximum: number) => typeof part === 'number' && Number.isInteger(part) && part >= 0 && part < maximum
  return within(startDay, 7) && within(endDay, 7) && within(startSeconds, daySeconds) && within(endSeconds, daySeconds)
}

export function dateAtDay(date: Date, delta: number, seconds: number) {
  const target = new Date(date)
  target.setDate(target.getDate() + delta)
  target.setHours(0, 0, seconds, 0)
  return target.getTime()
}

export function serviceEndDayOffset(interval: AlertServiceInterval) {
  const days = (interval.endDay - interval.startDay + 7) % 7
  return days === 0 && interval.endSeconds < interval.startSeconds ? 1 : days
}
