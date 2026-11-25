/** Validates and compares presentation output settings. */

import { foldbackContentRoles, validFoldbackAppearance, validFoldbackContentSettings, validFoldbackServiceSettings,
  type FoldbackAppearance, type FoldbackContentSettings, type FoldbackServiceSettings } from './foldbackAppearance'
import { validAlertTextEffects, type TextEffects } from './alertTextEffects'
import type { DesignTextLayout } from '../types/slideDesign'

export const outputSides = ['top', 'right', 'bottom', 'left'] as const
export const outputNames = ['live', 'stage', 'alternate'] as const
export const outputWindows = [...outputNames, 'key'] as const
export const outputAppearanceKeys = [...outputNames, 'alternateLayers', 'songLabels', 'scripture', 'foldback', 'foldbackService', 'foldbackContent'] as const
export const outputLabels = { live: 'จอผู้ชม', stage: 'จอเวที', alternate: 'จอถ่ายทอดสด', key: 'จอ Alpha Key' }
export const maxOutputMargin = 16384

type OutputSide = typeof outputSides[number]
export type OutputName = typeof outputNames[number]
export type OutputWindow = typeof outputWindows[number]
export type AlphaSource = 'live' | 'alternate'
export const scriptureReferenceModes = ['after-slide', 'before-slide', 'after-passage', 'reference-only', 'hidden'] as const
export const scriptureReferenceLabels: Record<typeof scriptureReferenceModes[number], string> = {
  'after-slide': 'หลังข้อความทุกสไลด์', 'before-slide': 'ก่อนข้อความทุกสไลด์', 'after-passage': 'ท้ายตอนในสไลด์สุดท้าย',
  'reference-only': 'แสดงเฉพาะอ้างอิง', hidden: 'ซ่อนอ้างอิง',
}
export const scriptureFontRoles = ['text', 'number', 'reference'] as const
export type ScriptureFontRole = typeof scriptureFontRoles[number]
export type ScriptureFont = {
  fontFamily?: string; color?: string; sizeScale?: number; fontRatio?: number; bold?: boolean; italic?: boolean; effects?: TextEffects
}
export const scriptureFontSize = { min: 25, max: 200 }
export const scriptureFontHeight = { min: 0.1, max: 100 }
export const defaultScriptureReferenceInset = .06
export const defaultScriptureMinFontRatio = .035
export type ScripturePagination = { flow?: boolean; breakOnVerse?: boolean; minFontRatio?: number }
export const scriptureReferenceInsetOptions = [
  { label: 'เยื้องชื่ออ้างอิง', sides: ['left', 'right'] },
  { label: 'เพิ่มช่องว่างระหว่างข้อความกับชื่ออ้างอิง', sides: ['top', 'bottom'] },
] as const
export type ScriptureOutputSettings = {
  reference: typeof scriptureReferenceModes[number]
  completePassage: boolean
  verseNumbers?: boolean
  abbreviateBooks?: boolean
  fonts?: Partial<Record<ScriptureFontRole, ScriptureFont>>
  referenceInsets?: DesignTextLayout['insets']
  pagination?: ScripturePagination
}
export const defaultScriptureOutputSettings: ScriptureOutputSettings = { reference: 'after-slide', completePassage: false }
export type OutputMargins = Record<OutputSide, number>
export type AlternateLayers = { background: boolean; foreground: boolean }
export type OutputDisplay = { label: string; left: number; top: number; width: number; height: number }
export type OutputSettings = Record<OutputName, OutputMargins> & {
  alternateLayers: AlternateLayers
  songLabels: Record<AlphaSource, boolean>
  scripture: Record<AlphaSource, ScriptureOutputSettings>
  foldback: FoldbackAppearance
  foldbackService: FoldbackServiceSettings
  foldbackContent: FoldbackContentSettings
  alphaSource: AlphaSource | null
  displays: Partial<Record<OutputWindow, OutputDisplay>>
}
export type OutputAppearanceKey = typeof outputAppearanceKeys[number]
export type OutputAppearance = Partial<Pick<OutputSettings, OutputAppearanceKey>>
type ImportedOutputSettings = {
  margins: Record<OutputName, Partial<OutputMargins>>
  alternateLayers: Partial<AlternateLayers>
}

const zeroMargins: OutputMargins = { top: 0, right: 0, bottom: 0, left: 0 }
const defaultAlternateLayers: AlternateLayers = { background: true, foreground: true }
export const defaultOutputSettings: OutputSettings = {
  live: zeroMargins, stage: zeroMargins, alternate: zeroMargins, alternateLayers: defaultAlternateLayers,
  songLabels: { live: false, alternate: false },
  scripture: { live: defaultScriptureOutputSettings, alternate: defaultScriptureOutputSettings },
  alphaSource: null, displays: {}, foldback: {}, foldbackService: {}, foldbackContent: {},
}
const nativeSections = new Map<string, OutputName>([
  ['live_screen_margins', 'live'],
  ['foldback_screen_margins', 'stage'],
  ['alt_screen_margins', 'alternate'],
])

export function isOutputMargin(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= maxOutputMargin
}

export function isScriptureFontFamily(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 80 && /[\p{L}\p{N}]/u.test(value) && /^[\p{L}\p{M}\p{N} .,'-]+$/u.test(value)
}

export function isScriptureFontRatio(value: unknown): value is number {
  return typeof value === 'number' && value >= scriptureFontHeight.min / 100 && value <= scriptureFontHeight.max / 100
}

export function isScriptureReferenceInset(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= 1
}

function isScriptureReferenceInsets(value: unknown) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).every(([side, length]) => outputSides.some((name) => name === side) && isScriptureReferenceInset(length)))
}

function isScripturePagination(value: unknown) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).every(([key, field]) => key === 'minFontRatio' ? isScriptureFontRatio(field)
      : (key === 'flow' || key === 'breakOnVerse') && typeof field === 'boolean'))
}

function isScriptureFonts(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(([role, font]) => scriptureFontRoles.some((item) => item === role)
    && font && typeof font === 'object' && !Array.isArray(font)
    && !('fontRatio' in font && 'sizeScale' in font)
    && Object.entries(font).every(([key, field]) => {
      if (key === 'fontFamily') return isScriptureFontFamily(field)
      if (key === 'color') return typeof field === 'string' && /^#[\da-f]{6}$/i.test(field)
      if (key === 'fontRatio') return isScriptureFontRatio(field)
      if (key === 'bold' || key === 'italic') return typeof field === 'boolean'
      if (key === 'effects') return validAlertTextEffects(field)
      return key === 'sizeScale' && typeof field === 'number'
        && field >= scriptureFontSize.min / 100 && field <= scriptureFontSize.max / 100
    }))
}

export function isScriptureOutputSettings(value: unknown): value is ScriptureOutputSettings {
  if (!value || typeof value !== 'object' || !('reference' in value) || !('completePassage' in value)) return false
  return typeof value.completePassage === 'boolean' && scriptureReferenceModes.some((mode) => mode === value.reference)
    && Object.keys(value).every((key) => ['reference', 'completePassage', 'verseNumbers', 'abbreviateBooks', 'fonts', 'referenceInsets', 'pagination'].includes(key))
    && (!('verseNumbers' in value) || typeof value.verseNumbers === 'boolean')
    && (!('abbreviateBooks' in value) || typeof value.abbreviateBooks === 'boolean')
    && (!('fonts' in value) || isScriptureFonts(value.fonts))
    && (!('referenceInsets' in value) || isScriptureReferenceInsets(value.referenceInsets))
    && (!('pagination' in value) || isScripturePagination(value.pagination))
}

export function sameScriptureOutput(a: ScriptureOutputSettings, b: ScriptureOutputSettings) {
  return a.reference === b.reference && a.completePassage === b.completePassage && Boolean(a.verseNumbers) === Boolean(b.verseNumbers)
    && Boolean(a.abbreviateBooks) === Boolean(b.abbreviateBooks)
    && a.pagination?.flow === b.pagination?.flow && a.pagination?.breakOnVerse === b.pagination?.breakOnVerse
    && a.pagination?.minFontRatio === b.pagination?.minFontRatio
    && outputSides.every((side) => (a.referenceInsets?.[side] ?? 0) === (b.referenceInsets?.[side] ?? 0))
    && scriptureFontRoles.every((role) => {
      const first = a.fonts?.[role]
      const second = b.fonts?.[role]
      return first?.fontFamily === second?.fontFamily && first?.color === second?.color && first?.sizeScale === second?.sizeScale
        && first?.fontRatio === second?.fontRatio && first?.bold === second?.bold && first?.italic === second?.italic
        && JSON.stringify(first?.effects) === JSON.stringify(second?.effects)
    })
}

export function changedOutputAppearance(before: OutputSettings, after: OutputSettings) {
  return outputAppearanceKeys.filter((key) => key === 'alternateLayers'
    ? before.alternateLayers.background !== after.alternateLayers.background || before.alternateLayers.foreground !== after.alternateLayers.foreground
    : key === 'scripture' ? !sameScriptureOutput(before.scripture.live, after.scripture.live)
      || !sameScriptureOutput(before.scripture.alternate, after.scripture.alternate)
    : key === 'songLabels' ? before.songLabels.live !== after.songLabels.live || before.songLabels.alternate !== after.songLabels.alternate
      : key === 'foldback' ? !sameFoldbackAppearance(before.foldback, after.foldback)
      : key === 'foldbackService' ? !sameFoldbackService(before.foldbackService, after.foldbackService)
      : key === 'foldbackContent' ? !sameFoldbackContent(before.foldbackContent, after.foldbackContent)
      : outputSides.some((side) => before[key][side] !== after[key][side]))
}

export function sameFoldbackContent(a: FoldbackContentSettings, b: FoldbackContentSettings): boolean {
  return foldbackContentRoles.every((role) => JSON.stringify(a[role]) === JSON.stringify(b[role]))
}

export function sameFoldbackService(a: FoldbackServiceSettings, b: FoldbackServiceSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function sameFoldbackAppearance(a: FoldbackAppearance, b: FoldbackAppearance): boolean {
  return a.nextLines === b.nextLines && JSON.stringify(a.next) === JSON.stringify(b.next) && JSON.stringify(a.clock) === JSON.stringify(b.clock)
}

function decodeDisplay(value: Partial<OutputDisplay> | undefined): OutputDisplay | undefined {
  if (!value || typeof value.label !== 'string' || value.label.length > 240) return undefined
  const { label, left, top, width, height } = value
  if (typeof left !== 'number' || typeof top !== 'number' || typeof width !== 'number' || typeof height !== 'number'
    || ![left, top, width, height].every(Number.isSafeInteger) || width <= 0 || height <= 0) return undefined
  return { label, left, top, width, height }
}

export function parseEasyWorshipOutputSettings(bytes: Uint8Array): ImportedOutputSettings {
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
    : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8'
  const source = new TextDecoder(encoding).decode(bytes)
  const margins: ImportedOutputSettings['margins'] = { live: {}, stage: {}, alternate: {} }
  const alternateLayers: ImportedOutputSettings['alternateLayers'] = {}
  let sectionName = ''
  for (const line of source.split(/\r\n|[\n\r]/)) {
    const section = line.match(/^\s*\[([^\]]+)\]\s*(?:[;#].*)?$/)
    if (section) {
      sectionName = section[1].trim().toLowerCase()
      continue
    }
    if (sectionName === 'alt_output_monitor') {
      const pair = line.match(/^\s*Show_(background|foreground)\s*=\s*([01])\s*(?:[;#].*)?$/i)
      if (pair) alternateLayers[pair[1].toLowerCase() as keyof AlternateLayers] = pair[2] === '1'
      continue
    }
    const output = nativeSections.get(sectionName)
    if (!output) continue
    const pair = line.match(/^\s*(top|right|bottom|left)\s*=\s*(\d+)\s*(?:[;#].*)?$/i)
    if (!pair) continue
    const value = Number(pair[2])
    if (isOutputMargin(value)) margins[output][pair[1].toLowerCase() as OutputSide] = value
  }
  return { margins, alternateLayers }
}

export function decodeSavedOutputSettings(value: string | null): OutputSettings {
  if (!value) return defaultOutputSettings
  try {
    const saved = JSON.parse(value)
    const settings: OutputSettings = {
      live: { ...zeroMargins }, stage: { ...zeroMargins }, alternate: { ...zeroMargins },
      alternateLayers: { ...defaultAlternateLayers },
      songLabels: { live: saved?.songLabels?.live === true, alternate: saved?.songLabels?.alternate === true },
      scripture: {
        live: isScriptureOutputSettings(saved?.scripture?.live) ? saved.scripture.live : defaultScriptureOutputSettings,
        alternate: isScriptureOutputSettings(saved?.scripture?.alternate) ? saved.scripture.alternate : defaultScriptureOutputSettings,
      },
      foldback: validFoldbackAppearance(saved?.foldback) ? saved.foldback : defaultOutputSettings.foldback,
      foldbackService: validFoldbackServiceSettings(saved?.foldbackService) ? saved.foldbackService : defaultOutputSettings.foldbackService,
      foldbackContent: validFoldbackContentSettings(saved?.foldbackContent) ? saved.foldbackContent : defaultOutputSettings.foldbackContent,
      alphaSource: saved?.alphaSource === 'live' || saved?.alphaSource === 'alternate' ? saved.alphaSource : null,
      displays: {},
    }
    for (const output of outputWindows) {
      const display = decodeDisplay(saved?.displays?.[output])
      if (display) settings.displays[output] = display
    }
    for (const output of outputNames) {
      for (const side of outputSides) {
        const margin: unknown = saved?.[output]?.[side]
        if (isOutputMargin(margin)) settings[output][side] = margin
      }
    }
    for (const layer of ['background', 'foreground'] as const) {
      const enabled: unknown = saved?.alternateLayers?.[layer]
      if (typeof enabled === 'boolean') settings.alternateLayers[layer] = enabled
    }
    return settings
  } catch {
    return defaultOutputSettings
  }
}

export function outputInsets(margins: OutputMargins) {
  return {
    top: `min(${margins.top}px, 40dvh)`,
    right: `min(${margins.right}px, 40dvw)`,
    bottom: `min(${margins.bottom}px, 40dvh)`,
    left: `min(${margins.left}px, 40dvw)`,
  }
}
