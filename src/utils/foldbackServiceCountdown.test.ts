/** Verifies the native countdown transitions and weekly rollover on the stage output. */

import { describe, expect, it } from 'vitest'
import type { FoldbackServiceSettings } from './foldbackAppearance'
import { foldbackServiceCountdown } from './foldbackServiceCountdown'

const service: FoldbackServiceSettings = { enabled: true, allowOverrun: true,
  intervals: [{ startDay: 0, startSeconds: 9 * 3600, endDay: 0, endSeconds: 10 * 3600 }] }
const sunday = (hour: number, minute: number, second = 0) => new Date(2026, 10, 22, hour, minute, second)

describe('EasyWorship stage service countdown', () => {
  it('retains the start for the native overrun window, then targets the end', () => {
    expect(foldbackServiceCountdown(service, sunday(8, 48))).toEqual({ phase: 'start', text: '00:12' })
    expect(foldbackServiceCountdown(service, sunday(8, 59, 21))).toEqual({ phase: 'start', text: '00:00:39' })
    expect(foldbackServiceCountdown(service, sunday(9, 0))).toEqual({ phase: 'start', text: '00:00:00' })
    expect(foldbackServiceCountdown(service, sunday(9, 1))).toEqual({ phase: 'start', text: '-00:01' })
    expect(foldbackServiceCountdown({ ...service, allowOverrun: false }, sunday(9, 1))).toBeUndefined()
    expect(foldbackServiceCountdown(service, sunday(9, 16))).toEqual({ phase: 'end', text: '00:44' })
    expect(foldbackServiceCountdown(service, sunday(10, 0, 5))).toEqual({ phase: 'end', text: '-00:00:05' })
    expect(foldbackServiceCountdown(service, sunday(10, 16))?.phase).toBe('start')
  })

  it('uses a shorter window for a short service and keeps the end across midnight', () => {
    const intervals = [{ startDay: 6, startSeconds: 23 * 3600 + 50 * 60, endDay: 0, endSeconds: 5 * 60 }]
    const overnight = { ...service, intervals, format: 'nn:ss' as const }
    expect(foldbackServiceCountdown(overnight, new Date(2026, 10, 21, 23, 54))).toEqual({ phase: 'start', text: '-04:00' })
    expect(foldbackServiceCountdown(overnight, sunday(0, 1))).toEqual({ phase: 'end', text: '04:00' })
    expect(foldbackServiceCountdown(overnight, sunday(0, 6))).toEqual({ phase: 'end', text: '-01:00' })
    expect(foldbackServiceCountdown({ ...overnight, enabled: false }, sunday(0, 6))).toBeUndefined()
  })
})
