import type { SlideDesign } from '../types/slideDesign'
import type { AlertProgress, OutputAlert } from '../types/alertTemplate'
import type { PresentationMedia } from './presentationChannel'
import { updateAlertProgress } from './alertPlayback'
import type { FoldbackContentRole } from './foldbackAppearance'

export type FoldbackSlide = {
  title: string
  lines: string[]
  subtitle?: string
  speakerNotes?: string
  cueNotes?: string
  textRole?: FoldbackContentRole
  textSamples?: string[][]
  design?: SlideDesign
  media?: PresentationMedia & { kind: 'image' | 'video' | 'camera' | 'web' }
  videoPlayback?: { loop?: boolean; runId?: string }
}

export type FoldbackNext = { label: string; lines?: string[] }

export type FoldbackState = {
  slide: FoldbackSlide | null
  next: FoldbackNext | null
  nextLines: 0 | 1 | 2
  alert: OutputAlert | null
  audience: 'live' | 'black' | 'clear' | 'welcome'
  playing: boolean
}

type FoldbackMessage =
  | { type: 'ready' }
  | { type: 'state'; state: FoldbackState | null }
  | (AlertProgress & { type: 'alert-progress' })

function openChannel(session: string) {
  return new BroadcastChannel(`worshipteam-foldback:${session}`)
}

export function createFoldbackControl(session: string, onAlertProgress?: (progress: AlertProgress) => void) {
  const channel = openChannel(session)
  let state: FoldbackState = { slide: null, next: null, nextLines: 2, alert: null, audience: 'live', playing: true }
  const broadcast = (value: FoldbackState | null) => channel.postMessage({ type: 'state', state: value } satisfies FoldbackMessage)
  channel.onmessage = (event: MessageEvent<FoldbackMessage>) => {
    if (event.data?.type === 'ready') broadcast(state)
    if (event.data?.type === 'alert-progress' && state.alert) {
      const previous = state.alert
      const { id, remaining, revision } = event.data
      const alert = updateAlertProgress(previous, id, remaining, revision)
      if (alert === previous) return
      state = { ...state, alert }
      if (onAlertProgress) onAlertProgress({ id, remaining, revision })
      else if (!alert) broadcast(state)
    }
  }
  const disconnect = () => broadcast(null)
  const reconnect = () => broadcast(state)
  window.addEventListener('pagehide', disconnect)
  window.addEventListener('pageshow', reconnect)

  return {
    publish(patch: Partial<FoldbackState>) {
      state = { ...state, ...patch }
      broadcast(state)
    },
    close() {
      window.removeEventListener('pagehide', disconnect)
      window.removeEventListener('pageshow', reconnect)
      disconnect()
      channel.close()
    },
  }
}

export function listenToFoldback(session: string, onState: (value: FoldbackState | null) => void) {
  const channel = openChannel(session)
  channel.onmessage = (event: MessageEvent<FoldbackMessage>) => {
    if (event.data?.type === 'state') onState(event.data.state)
  }
  channel.postMessage({ type: 'ready' } satisfies FoldbackMessage)
  return {
    reportAlertProgress(id: string, remaining: number, revision?: number) {
      channel.postMessage({ type: 'alert-progress', id, remaining, revision } satisfies FoldbackMessage)
    },
    close: () => channel.close(),
  }
}
