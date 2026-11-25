import type { AlertPlayback, AlertTemplate, OutputAlert } from '../types/alertTemplate'
import { canEndAlertOnToken } from './alertTokens'

export const defaultAlertPlayback: AlertPlayback = { mode: 'static', alignment: 'center', passes: null }

export function templateAlertPlayback(template: AlertTemplate): AlertPlayback {
  if (template.playback) return template.playback
  const { source } = template
  const count = source?.repeatCount
  return {
    mode: source?.displayType === 1 ? 'scroll' : source?.displayType === 2 ? 'when-needed' : 'static',
    alignment: source?.alignment === 0 ? 'left' : source?.alignment === 2 ? 'right' : 'center',
    passes: source?.endType === 1 && typeof count === 'number' && Number.isInteger(count) && count >= 1 && count <= 9 ? count : null,
    ...(canEndAlertOnToken(template) ? { endOnToken: true } : {}),
  }
}

export function updateAlertProgress(alert: OutputAlert | null, id: string, remaining: number, revision = 0): OutputAlert | null {
  if (!alert || alert.id !== id || (alert.revision ?? 0) !== revision) return alert
  if (remaining === 0 && alert.clock?.endToken) return null
  const passes = alert?.playback.passes
  if (passes == null || !Number.isInteger(remaining) || remaining < 0 || remaining >= passes) return alert
  if (remaining === 0) return null
  return { ...alert, playback: { ...alert.playback, passes: remaining } }
}

export function shouldScrollAlert(mode: AlertPlayback['mode'], reducedMotion: boolean, labelWidth: number, frameWidth: number) {
  return !reducedMotion && frameWidth > 0 && (mode === 'scroll' || (mode === 'when-needed' && labelWidth > frameWidth))
}
