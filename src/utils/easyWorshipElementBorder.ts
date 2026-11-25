/** Reads saved EasyWorship line borders and recognizes unsupported frame styles. */

import type { DesignElementBorder } from '../types/slideDesign'

export const legacyElementDecorationWarning = 'เอฟเฟ็กต์ขอบและเงาสะท้อนยังไม่รองรับ'
export const unsupportedElementBorder = 'เส้นขอบกรอบภาพ EasyWorship บางรูปแบบยังไม่รองรับ'
export const unsupportedElementReflection = 'เอฟเฟ็กต์เงาสะท้อนขององค์ประกอบยังไม่รองรับ'

function integer(value: unknown) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return undefined
  const result = Number(value)
  return Number.isSafeInteger(result) ? result : undefined
}

export function easyWorshipElementBorder(read: (key: string) => unknown): { border?: DesignElementBorder | false; unsupported?: true } {
  const style = integer(read('Style'))
  if (style === undefined) return {}
  if (style === 0) return { border: false }
  if (style !== 1) return { unsupported: true }

  const size = integer(read('Size')) ?? 4
  const opacity = integer(read('Opacity')) ?? 100
  if (size <= 0 || opacity <= 0) return { border: false }
  const color = integer(read('Color')) ?? 0
  if (size > 216 || opacity > 100 || color < 0 || color > 0xffffff) return { unsupported: true }
  const hex = (byte: number) => byte.toString(16).padStart(2, '0')
  return { border: {
    color: `#${hex(color & 255)}${hex((color >>> 8) & 255)}${hex(color >>> 16)}`,
    opacity: opacity / 100,
    width: size / 1080,
    position: (['outer', 'center', 'inner'] as const)[integer(read('Position')) ?? 0] ?? 'outer',
    join: (['round', 'miter', 'bevel'] as const)[integer(read('Join')) ?? 0] ?? 'round',
  } }
}
