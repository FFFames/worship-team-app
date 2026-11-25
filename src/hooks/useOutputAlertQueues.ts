import { useCallback, useRef, useState } from 'react'
import type { AlertOutput, OutputAlert } from '../types/alertTemplate'
import { changeAlertQueue, emptyAlertQueue, type AlertQueueAction, type OutputAlertQueue } from '../utils/alertQueue'

export function useOutputAlertQueues(publish: (output: AlertOutput, alert: OutputAlert | null) => void) {
  const current = useRef<Record<AlertOutput, OutputAlertQueue>>({ live: emptyAlertQueue, stage: emptyAlertQueue, alternate: emptyAlertQueue })
  const [queues, setQueues] = useState(current.current)
  const dispatch = useCallback((output: AlertOutput, action: AlertQueueAction) => {
    const previous = current.current[output]
    const next = changeAlertQueue(previous, action)
    if (next === previous) return
    current.current = { ...current.current, [output]: next }
    setQueues(current.current)
    const before = previous.active?.alert
    const after = next.active?.alert
    if (before?.id !== after?.id || before?.revision !== after?.revision) publish(output, after ?? null)
  }, [publish])

  return { queues, dispatch }
}
