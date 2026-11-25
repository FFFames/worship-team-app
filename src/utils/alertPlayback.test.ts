import { describe, expect, it, vi } from 'vitest'
import type { AlertTemplate, OutputAlert } from '../types/alertTemplate'
import { defaultAlertPlayback, shouldScrollAlert, templateAlertPlayback, updateAlertProgress } from './alertPlayback'
import { changeAlertQueue, emptyAlertQueue } from './alertQueue'

const template: AlertTemplate = {
  id: 'template', title: 'ประกาศ', text: 'ข้อความ', output: 'live',
  source: {
    profileName: 'Example', rowId: '12', rtf: '', displayType: 2, alignment: 2, endType: 1,
    repeatCount: 3, endToken: null, tokens: [],
  },
}

describe('Alert playback', () => {
  it('uses the native display, alignment and finite-repeat values until edited', () => {
    expect(templateAlertPlayback(template)).toEqual({ mode: 'when-needed', alignment: 'right', passes: 3 })
    expect(templateAlertPlayback({ ...template, playback: defaultAlertPlayback })).toEqual(defaultAlertPlayback)
    expect(templateAlertPlayback({ ...template, source: { ...template.source!, endType: 2 } }).passes).toBeNull()
    expect(templateAlertPlayback({ ...template, source: { ...template.source!, repeatCount: 10 } }).passes).toBeNull()
  })

  it('only changes playback progress for the active presentation and accepts a decreasing count', () => {
    const alert: OutputAlert = { id: 'play', text: 'ทดสอบ', playback: templateAlertPlayback(template) }
    const next = updateAlertProgress(alert, 'play', 2)
    expect(next?.playback.passes).toBe(2)
    expect(updateAlertProgress(next, 'old-play', 0)).toBe(next)
    expect(updateAlertProgress(next, 'play', 3)).toBe(next)
    expect(updateAlertProgress(next, 'play', 0)).toBeNull()
    expect(updateAlertProgress(null, 'play', 1)).toBeNull()
  })

  it('scrolls conditional messages only when they overflow and respects reduced motion', () => {
    expect(shouldScrollAlert('when-needed', false, 140, 180)).toBe(false)
    expect(shouldScrollAlert('when-needed', false, 181, 180)).toBe(true)
    expect(shouldScrollAlert('scroll', false, 140, 180)).toBe(true)
    expect(shouldScrollAlert('scroll', true, 181, 180)).toBe(false)
  })
})

describe('Live alert queues', () => {
  it('resumes a prioritized interruption with the remaining rounds and rejects reports from its older run', () => {
    let queue = changeAlertQueue(emptyAlertQueue, { type: 'enqueue', item: { id: 'regular', text: 'Regular', playback: { ...defaultAlertPlayback, passes: 3 } } })
    const oldRun = queue.active!.alert.id
    queue = changeAlertQueue(queue, { type: 'progress', progress: { id: oldRun, remaining: 2 } })
    queue = changeAlertQueue(queue, { type: 'enqueue', item: { id: 'next', text: 'Next', playback: defaultAlertPlayback } })
    queue = changeAlertQueue(queue, { type: 'enqueue', item: { id: 'urgent', text: 'Urgent', playback: { ...defaultAlertPlayback, passes: 1 } } })
    queue = changeAlertQueue(queue, { type: 'prioritize', entryId: 'urgent' })
    expect(queue.active?.entryId).toBe('urgent')
    expect(queue.waiting.map(({ id }) => id)).toEqual(['regular', 'next'])
    queue = changeAlertQueue(queue, { type: 'progress', progress: { id: queue.active!.alert.id, remaining: 0 } })
    expect(queue.active?.entryId).toBe('regular')
    expect(queue.active?.alert.playback.passes).toBe(2)
    expect(queue.active?.alert.id).not.toBe(oldRun)
    expect(changeAlertQueue(queue, { type: 'progress', progress: { id: oldRun, remaining: 0 } })).toBe(queue)
    queue = changeAlertQueue(queue, { type: 'next' })
    expect(queue.active?.entryId).toBe('next')
    expect(queue.waiting.map(({ id }) => id)).toEqual(['regular'])
    expect(changeAlertQueue(queue, { type: 'clear' })).toBe(emptyAlertQueue)
  })

  it('starts a queued clock when shown and applies round adjustments without replacing the activation', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(2000)
    try {
      const queuedTemplate: AlertTemplate = { ...template, source: { ...template.source!, tokens: [
        { id: '1', name: 'Timer', uid: null, type: 2, format: 'mm:ss', interval: 0, fixedTime: null, timeValue: null, allowOverrun: null },
      ] } }
      const playback = { ...defaultAlertPlayback, passes: 1 }
      let queue = changeAlertQueue(emptyAlertQueue, { type: 'enqueue', item: { id: 'first', text: 'First', playback } })
      queue = changeAlertQueue(queue, { type: 'enqueue', item: { id: 'clock', text: '{{Timer}}', playback, template: queuedTemplate } })
      expect(queue.waiting[0].clock).toBeUndefined()
      now.mockReturnValue(9000)
      queue = changeAlertQueue(queue, { type: 'hide' })
      expect(queue.active?.alert.clock?.startedAt).toBe(9000)
      const display = queue.active!.alert.id
      queue = changeAlertQueue(queue, { type: 'adjust', change: 1 })
      expect(queue.active?.alert.id).toBe(display)
      expect(queue.active?.alert.playback.passes).toBe(2)
      expect(changeAlertQueue(queue, { type: 'progress', progress: { id: display, remaining: 0 } })).toBe(queue)
      expect(changeAlertQueue(queue, { type: 'progress', progress: { id: display, remaining: 0, revision: 1 } })).toBe(emptyAlertQueue)
    } finally { now.mockRestore() }
  })
})
