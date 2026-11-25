/** Imports EasyWorship's Windows virtual-key bindings and matches browser key events. */

import type { SectionType } from '../types/database'

export const keyboardActions = {
  nextSlide: 'สไลด์ถัดไป', previousSlide: 'สไลด์ก่อนหน้า', firstSlide: 'สไลด์แรก', lastSlide: 'สไลด์สุดท้าย',
  nextCue: 'เตรียมรายการถัดไป', previousCue: 'เตรียมรายการก่อนหน้า', goLive: 'ขึ้นจอ',
  black: 'สลับจอดำ', clear: 'สลับการล้างจอ', welcome: 'สลับจอต้อนรับ',
  slideNumber: 'ไปยังหมายเลขสไลด์', verse: 'ไปยังท่อน Verse', chorus: 'ไปยังท่อน Chorus',
  preChorus: 'ไปยังท่อน Pre-Chorus', bridge: 'ไปยังท่อน Bridge', intro: 'ไปยังท่อน Intro',
  ending: 'ไปยังท่อน Ending', tag: 'ไปยังท่อน Tag',
} as const

export type KeyboardAction = keyof typeof keyboardActions
export type KeyboardProfile = { name: string; bindings: Record<string, KeyboardAction> }
export type KeyboardImport = { profile: KeyboardProfile; ignored: string[] }

const sourceActions = new Map<string, KeyboardAction>([
  ['slidenextkeys', 'nextSlide'], ['slideprevkeys', 'previousSlide'], ['slidefirstkeys', 'firstSlide'], ['slidelastkeys', 'lastSlide'],
  ['schedulenextkeys', 'nextCue'], ['scheduleprevkeys', 'previousCue'], ['golivenextkeys', 'goLive'],
  ['blackscreenkeys', 'black'], ['clearscreenkeys', 'clear'], ['logoscreenkeys', 'welcome'],
  ['jumpslidekeys', 'slideNumber'], ['jumpversekeys', 'verse'], ['jumpchoruskeys', 'chorus'],
  ['jumpprechoruskeys', 'preChorus'], ['jumpbridgekeys', 'bridge'], ['jumpintrokeys', 'intro'],
  ['jumpendingkeys', 'ending'], ['jumptagkeys', 'tag'],
])
const sectionActions: Partial<Record<KeyboardAction, SectionType>> = {
  verse: 'verse', chorus: 'hook', preChorus: 'prehook', bridge: 'bridge', intro: 'intro', ending: 'end', tag: 'tag',
}
const numberedSections = /^(verse|chorus|hook|pre[\s-]?(?:chorus|hook)|bridge|intro|ending|end|outro|tag)[\s:.-]*(\d+)?\b/i
const labelActions: Record<string, SectionType> = {
  verse: 'verse', chorus: 'hook', hook: 'hook', prechorus: 'prehook', prehook: 'prehook',
  bridge: 'bridge', intro: 'intro', ending: 'end', end: 'end', outro: 'outro', tag: 'tag',
}

export const keyboardProfileStorageKey = 'worshipteam.presentation-keyboard.v1'
const modifiers = ['C', 'A', 'S', 'M'] as const
const modifierLabels = { C: 'Ctrl', A: 'Alt', S: 'Shift', M: 'Cmd' }
const virtualKeys = new Map<number, string>([
  [8, 'Backspace'], [13, 'Enter'], [27, 'Escape'], [32, 'Space'], [33, 'PageUp'], [34, 'PageDown'],
  [35, 'End'], [36, 'Home'], [37, 'ArrowLeft'], [38, 'ArrowUp'], [39, 'ArrowRight'], [40, 'ArrowDown'],
  [45, 'Insert'], [46, 'Delete'], [106, 'NumpadMultiply'], [107, 'NumpadAdd'], [109, 'NumpadSubtract'],
  [110, 'NumpadDecimal'], [111, 'NumpadDivide'], [186, 'Semicolon'], [187, 'Equal'], [188, 'Comma'],
  [189, 'Minus'], [190, 'Period'], [191, 'Slash'], [192, 'Backquote'], [219, 'BracketLeft'],
  [220, 'Backslash'], [221, 'BracketRight'], [222, 'Quote'],
])

function baseCode(key: number) {
  if (key >= 48 && key <= 57) return 'Digit' + (key - 48)
  if (key >= 65 && key <= 90) return 'Key' + String.fromCharCode(key)
  if (key >= 96 && key <= 105) return 'Numpad' + (key - 96)
  if (key >= 112 && key <= 135) return 'F' + (key - 111)
  return virtualKeys.get(key)
}

function importedBinding(value: string): string | undefined {
  const parts = value.trim().toUpperCase().split(/\s*-\s*/)
  const key = parts.pop()
  if (!key || !/^\d{1,3}$/.test(key) || parts.some((part) => !/^[CASM]$/.test(part))) return
  const code = baseCode(Number(key))
  if (code) return [...modifiers.filter((part) => parts.includes(part)).map((part) => modifierLabels[part]), code].join('+')
}

export function parseEasyWorshipHotkeys(bytes: Uint8Array, name: string): KeyboardImport {
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
    : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8'
  const bindings: KeyboardProfile['bindings'] = {}
  const ignored: string[] = []
  let inHotkeys = false
  let sawHotkeys = false
  for (const line of new TextDecoder(encoding).decode(bytes).split(/\r\n|[\r\n]/)) {
    const section = /^\s*\[([^\]]+)\]\s*$/.exec(line)
    if (section) {
      inHotkeys = section[1].trim().toLowerCase() === 'hotkeys'
      sawHotkeys ||= inHotkeys
      continue
    }
    if (!inHotkeys) continue
    const entry = /^\s*([a-z][a-z0-9_]*)\s*=\s*([^;#]*)/i.exec(line)
    if (!entry) continue
    const [, field, entries] = entry
    const action = sourceActions.get(field.toLowerCase())
    for (const value of entries.split(',').map((part) => part.trim()).filter(Boolean)) {
      if (value === '0') continue
      const binding = importedBinding(value)
      if (!action || !binding || (bindings[binding] && bindings[binding] !== action)) {
        ignored.push(`${field} · ${value}`)
      } else {
        bindings[binding] = action
      }
    }
  }
  if (!sawHotkeys) throw new Error('ไม่พบกลุ่ม HotKeys ในไฟล์ตั้งค่า EasyWorship')
  return { profile: { name, bindings }, ignored }
}

export function keyboardBinding(event: KeyboardEvent): string | undefined {
  if (!event.code || event.isComposing || event.getModifierState('AltGraph')) return
  return [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Cmd', event.code]
    .filter(Boolean).join('+')
}

export function keyboardBindingLabel(binding: string): string {
  return binding.replace(/\b(?:Key|Digit)([A-Z0-9])\b/g, '$1')
}

export function isKeyboardBinding(value: string): boolean {
  return /^(?:(?:Ctrl|Alt|Shift|Cmd)\+)*[A-Za-z0-9]+$/.test(value)
}

export function hasSavedKeyboardProfile(): boolean {
  return localStorage.getItem(keyboardProfileStorageKey) !== null
}

export function readKeyboardProfile(): KeyboardProfile | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(keyboardProfileStorageKey) ?? 'null')
    if (typeof saved?.name !== 'string' || !saved.bindings || typeof saved.bindings !== 'object') return
    const bindings: KeyboardProfile['bindings'] = {}
    for (const [key, action] of Object.entries(saved.bindings)) {
      if (isKeyboardBinding(key)
        && typeof action === 'string' && Object.prototype.hasOwnProperty.call(keyboardActions, action)) bindings[key] = action as KeyboardAction
    }
    return { name: saved.name, bindings }
  } catch { return undefined }
}

export function saveKeyboardProfile(profile: KeyboardProfile | undefined): void {
  localStorage.setItem(keyboardProfileStorageKey, JSON.stringify(profile ?? null))
}

export function isKeyboardJump(action: KeyboardAction): boolean {
  return action === 'slideNumber' || Object.prototype.hasOwnProperty.call(sectionActions, action)
}

/** Resolves explicitly numbered native labels before considering unnumbered sections. */
export function keyboardJumpIndex(
  slides: readonly { sectionType: SectionType; sectionLabel: string }[],
  action: KeyboardAction,
  number: number,
): number {
  if (action === 'slideNumber') return number >= 1 && number <= slides.length ? number - 1 : -1
  const section = sectionActions[action]
  if (!section || number < 1) return -1
  const matches = slides.flatMap(({ sectionLabel, sectionType }, index) => {
    const name = sectionLabel.trim()
    const label = numberedSections.exec(name)
    const type = label ? labelActions[label[1].toLowerCase().replace(/[\s-]/g, '')] : sectionType
    const nativeNumber = type === 'verse' && /^\d+$/.test(name) ? name : undefined
    return type === section || (section === 'end' && type === 'outro') ? [{ index, number: Number(label?.[2] ?? nativeNumber ?? 0) }] : []
  })
  const exact = matches.find((match) => match.number === number)
  return exact?.index ?? (number === 1 ? matches.find((match) => match.number === 0)?.index ?? -1 : -1)
}
