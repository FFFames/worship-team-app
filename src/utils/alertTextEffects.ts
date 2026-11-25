export type TextEffects = {
  underline?: boolean
  strike?: boolean
  baseline?: 'super' | 'sub' | 'normal'
  fontOpacity?: number
  outline?: {
    enabled: boolean
    color?: string
    opacity?: number
    width?: number
    position?: 'outer' | 'center' | 'inner'
    join?: 'round' | 'square' | 'bevel'
  }
  shadow?: {
    enabled: boolean
    color?: string
    opacity?: number
    blur?: number
    offset?: number
    angle?: number
  }
}

export type AlertTextEffects = TextEffects

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const within = (value: unknown, min: number, max: number) =>
  value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max)
const flag = (value: unknown) => value === undefined || typeof value === 'boolean'
const color = (value: unknown) => value === undefined || (typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value))

export function validAlertTextEffects(value: unknown): value is AlertTextEffects | undefined {
  if (value === undefined) return true
  if (!record(value)) return false
  const { underline, strike, baseline, fontOpacity, outline, shadow } = value
  return flag(underline) && flag(strike) && within(fontOpacity, 0, 100)
    && (baseline === undefined || baseline === 'super' || baseline === 'sub' || baseline === 'normal')
    && (outline === undefined || (record(outline) && typeof outline.enabled === 'boolean'
      && color(outline.color) && within(outline.opacity, 0, 100) && within(outline.width, 0, 1)
      && (outline.position === undefined || outline.position === 'outer' || outline.position === 'center' || outline.position === 'inner')
      && (outline.join === undefined || outline.join === 'round' || outline.join === 'square' || outline.join === 'bevel')))
    && (shadow === undefined || (record(shadow) && typeof shadow.enabled === 'boolean'
      && color(shadow.color) && within(shadow.opacity, 0, 100)
      && within(shadow.blur, 0, 1) && within(shadow.offset, 0, 1) && within(shadow.angle, -360, 360)))
}
