import { alertOutputLabels, type AlertOutput } from '../types/alertTemplate'
import { validNurseryFont } from './nurseryAlerts'
import { validAlertTextEffects, type AlertTextEffects } from './alertTextEffects'

export const messageAlertOutputs = Object.keys(alertOutputLabels) as AlertOutput[]
export type MessageAlertStyle = {
  enabled: boolean
  position: 'top' | 'bottom'
  backgroundColor: string
  textColor: string
  opacity: number
  scrollSpeed?: number
  fontFamily?: string
  fontRatio?: number
  bold?: boolean
  italic?: boolean
  effects?: AlertTextEffects
}
export type MessageAlertSettings = Partial<Record<AlertOutput, MessageAlertStyle>>

export const messageAlertSettingsKey = 'worshipteam.message-alerts.v1'
export const messageAlertSettingsChanged = 'worshipteam:message-alerts'
export const defaultMessageAlertStyle: Record<AlertOutput, MessageAlertStyle> = {
  live: { enabled: true, position: 'bottom', backgroundColor: '#b41e1e', textColor: '#ffffff', opacity: 92 },
  alternate: { enabled: true, position: 'bottom', backgroundColor: '#b41e1e', textColor: '#ffffff', opacity: 92 },
  stage: { enabled: true, position: 'top', backgroundColor: '#fcd34d', textColor: '#09090b', opacity: 100 },
}

export function validMessageAlertStyle(value: unknown): value is MessageAlertStyle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const { enabled, position, backgroundColor, textColor, opacity, scrollSpeed, fontFamily, fontRatio, bold, italic, effects } = value as Partial<MessageAlertStyle>
  const percentage = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 100
  return typeof enabled === 'boolean' && (position === 'top' || position === 'bottom')
    && [backgroundColor, textColor].every((color) => typeof color === 'string' && /^#[a-f\d]{6}$/i.test(color))
    && percentage(opacity) && (scrollSpeed === undefined || percentage(scrollSpeed))
    && (fontFamily === undefined || validNurseryFont(fontFamily))
    && (fontRatio === undefined || (typeof fontRatio === 'number' && fontRatio > 0 && fontRatio <= 0.25))
    && (bold === undefined || typeof bold === 'boolean') && (italic === undefined || typeof italic === 'boolean')
    && validAlertTextEffects(effects)
}

export function storedMessageAlertSettings() {
  try { return localStorage.getItem(messageAlertSettingsKey) }
  catch { return null }
}

export function decodeMessageAlertSettings(stored: string | null): MessageAlertSettings {
  try {
    const source = JSON.parse(stored ?? 'null')
    const settings: MessageAlertSettings = {}
    for (const output of messageAlertOutputs) {
      if (validMessageAlertStyle(source?.[output])) settings[output] = source[output]
    }
    return settings
  } catch { return {} }
}

export function saveMessageAlertSettings(settings: MessageAlertSettings, preserveExisting = false) {
  const current = decodeMessageAlertSettings(storedMessageAlertSettings())
  let saved = 0
  for (const output of messageAlertOutputs) {
    const style = settings[output]
    if (!style || (preserveExisting && current[output])) continue
    current[output] = style
    saved++
  }
  if (saved) {
    localStorage.setItem(messageAlertSettingsKey, JSON.stringify(current))
    window.dispatchEvent(new Event(messageAlertSettingsChanged))
  }
  return saved
}

export function alertMarqueeDuration(frame: number, label: number, speed: number | undefined) {
  const distance = frame + label
  // The native slider sets the time to travel one output width, from 15 to 1 second.
  return speed === undefined ? distance * 10 : (distance / frame) * (15_000 - 140 * speed)
}
