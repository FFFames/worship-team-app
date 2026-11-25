import type { AlertProgress, AlertTemplate, OutputAlert } from '../types/alertTemplate'
import { updateAlertProgress } from './alertPlayback'
import { createAlertClock } from './alertTokens'

type PendingAlert = Pick<OutputAlert, 'id' | 'text' | 'runs' | 'playback' | 'clock'> & { template?: AlertTemplate }
export type OutputAlertQueue = { active: { entryId: string; alert: OutputAlert } | null; waiting: PendingAlert[] }

export type AlertQueueAction =
  | { type: 'enqueue'; item: PendingAlert }
  | { type: 'next' | 'hide' | 'clear' }
  | { type: 'prioritize' | 'remove'; entryId: string }
  | { type: 'progress'; progress: AlertProgress }
  | { type: 'adjust'; change: -1 | 1 }

export const emptyAlertQueue: OutputAlertQueue = { active: null, waiting: [] }

export function changeAlertQueue(queue: OutputAlertQueue, action: AlertQueueAction): OutputAlertQueue {
  const { active, waiting } = queue

  function activate(next: PendingAlert[], paused?: { entryId: string; alert: OutputAlert }, resumeFirst = false): OutputAlertQueue {
    const [item, ...rest] = next
    if (!item) return emptyAlertQueue
    if (paused) {
      const { text, runs, playback, clock } = paused.alert
      const interrupted = { id: paused.entryId, text, runs, playback, clock }
      if (resumeFirst) rest.unshift(interrupted)
      else rest.push(interrupted)
    }
    const { id: entryId, text, runs, playback, template } = item
    const clock = item.clock ?? createAlertClock(template, text, Date.now(), Boolean(playback.endOnToken))
    const alert: OutputAlert = { id: crypto.randomUUID(), text, runs, playback, clock }
    return { active: { entryId, alert }, waiting: rest }
  }

  switch (action.type) {
    case 'enqueue':
      return active ? { active, waiting: [...waiting, action.item] } : activate([action.item])
    case 'next':
      return waiting.length ? activate(waiting, active ?? undefined) : queue
    case 'hide':
      return active ? activate(waiting) : queue
    case 'clear':
      return emptyAlertQueue
    case 'prioritize': {
      const selected = waiting.find(({ id }) => id === action.entryId)
      return selected ? activate([selected, ...waiting.filter((item) => item !== selected)], active ?? undefined, true) : queue
    }
    case 'remove': {
      const next = waiting.filter(({ id }) => id !== action.entryId)
      return next.length !== waiting.length ? { active, waiting: next } : queue
    }
    case 'progress': {
      if (!active) return queue
      const { id, remaining, revision } = action.progress
      const updated = updateAlertProgress(active.alert, id, remaining, revision)
      if (updated === active.alert) return queue
      return updated ? { active: { ...active, alert: updated }, waiting } : activate(waiting)
    }
    case 'adjust': {
      if (!active || active.alert.playback.passes === null) return queue
      const passes = active.alert.playback.passes + action.change
      if (passes < 1 || passes > 9) return queue
      const alert = { ...active.alert, revision: (active.alert.revision ?? 0) + 1, playback: { ...active.alert.playback, passes } }
      return { active: { ...active, alert }, waiting }
    }
  }
}
