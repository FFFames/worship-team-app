export const nurseryOutputs = ['live', 'alternate'] as const
export const nurseryPositions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
export const nurseryPositionLabels = { 'top-left': 'ซ้ายบน', 'top-right': 'ขวาบน', 'bottom-left': 'ซ้ายล่าง', 'bottom-right': 'ขวาล่าง' }
export type NurseryOutput = typeof nurseryOutputs[number]
export type NurseryPosition = typeof nurseryPositions[number]
export type NurseryStyle = {
  enabled: boolean
  position: NurseryPosition
  backgroundColor: string
  textColor: string
  opacity: number
  fontSize: number
  seconds: number | null
  fontFamily?: string
  fontRatio?: number
  bold?: boolean
  italic?: boolean
  effects?: AlertTextEffects
}
export type NurserySettings = Partial<Record<NurseryOutput, NurseryStyle>>
export type NurseryNotice = { code: string; expiresAt: number | null }
export type NurseryDisplay = { style: NurseryStyle; notices: NurseryNotice[] }

export const nurserySettingsStorageKey = 'worshipteam.nursery-alerts.v1'
export const nurserySettingsChanged = 'worshipteam:nursery-alerts'
export const defaultNurserySettings: Record<NurseryOutput, NurseryStyle> = {
  live: { enabled: true, position: 'top-right', backgroundColor: '#111827', textColor: '#ffffff', opacity: 95, fontSize: 42, seconds: 30 },
  alternate: { enabled: false, position: 'top-right', backgroundColor: '#111827', textColor: '#ffffff', opacity: 95, fontSize: 42, seconds: 30 },
}

const within = (value: unknown, lower: number, upper: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= lower && value <= upper

const nurseryStyleFields = new Set(['enabled', 'position', 'backgroundColor', 'textColor', 'opacity', 'fontSize', 'seconds', 'fontFamily', 'fontRatio', 'bold', 'italic', 'effects'])

export function validNurseryFont(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 80 && value.trim() !== '' && /^[\p{L}\p{M}\p{N} .,'-]+$/u.test(value)
}

export function validNurseryStyle(value: unknown): value is NurseryStyle {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !nurseryStyleFields.has(key))) return false
  const { enabled, position, backgroundColor, textColor, opacity, fontSize, seconds, fontFamily, fontRatio, bold, italic, effects } = value as Partial<NurseryStyle>
  return typeof enabled === 'boolean' && position !== undefined && nurseryPositions.includes(position)
    && [backgroundColor, textColor].every((color) => typeof color === 'string' && /^#[a-f\d]{6}$/i.test(color))
    && within(opacity, 0, 100) && within(fontSize, 12, 160) && (seconds === null || within(seconds, 1, 5999))
    && (fontFamily === undefined || validNurseryFont(fontFamily))
    && (fontRatio === undefined || (typeof fontRatio === 'number' && fontRatio > 0 && fontRatio <= 0.25))
    && (bold === undefined || typeof bold === 'boolean') && (italic === undefined || typeof italic === 'boolean')
    && validAlertTextEffects(effects)
}

export function storedNurserySettings(): string | null {
  try { return localStorage.getItem(nurserySettingsStorageKey) }
  catch { return null }
}

export function decodeNurserySettings(stored: string | null): NurserySettings {
  try {
    const saved = JSON.parse(stored ?? 'null')
    const settings: NurserySettings = {}
    for (const output of nurseryOutputs) {
      const style: unknown = saved?.[output]
      if (validNurseryStyle(style)) settings[output] = style
    }
    return settings
  } catch { return {} }
}

export function saveNurserySettings(settings: NurserySettings, preserveExisting = false): number {
  const current = decodeNurserySettings(storedNurserySettings())
  let updated = 0
  for (const output of nurseryOutputs) {
    const style = settings[output]
    if (!style || (preserveExisting && current[output])) continue
    current[output] = style
    updated++
  }
  if (updated) {
    localStorage.setItem(nurserySettingsStorageKey, JSON.stringify(current))
    window.dispatchEvent(new Event(nurserySettingsChanged))
  }
  return updated
}

export function nurseryNoticeVisible(notice: NurseryNotice, now: number): boolean {
  return notice.expiresAt === null || notice.expiresAt > now
}
import { validAlertTextEffects, type AlertTextEffects } from './alertTextEffects'
