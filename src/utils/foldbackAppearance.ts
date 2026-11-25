/** Stage preview and clock appearance shared by the settings, importer, and output. */

import { validAlertTextEffects, type AlertTextEffects } from './alertTextEffects'
import { validNurseryFont } from './nurseryAlerts'
import type { AlertServiceInterval } from '../types/alertTemplate'
import type { DesignTextLayout, DesignTextStyle } from '../types/slideDesign'
import { validServiceInterval } from './serviceIntervals'

export const foldbackClockPositions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
export const foldbackDefaultClockFormat = 'HH:nn'
export const foldbackServiceFormats = ['hh:nn{ss}', 'hh:nn:ss', 'hh:nn', 'nn:ss'] as const
export type FoldbackLineCount = 0 | 1 | 2
export type FoldbackClockPosition = typeof foldbackClockPositions[number]

export type FoldbackTextAppearance = {
  textColor?: string
  backgroundColor?: string
  opacity?: number
  fontFamily?: string
  fontRatio?: number
  bold?: boolean
  italic?: boolean
  effects?: AlertTextEffects
}

export type FoldbackClock = FoldbackTextAppearance & {
  enabled?: boolean
  format?: string
  position?: FoldbackClockPosition
}

export type FoldbackServiceSettings = Omit<FoldbackClock, 'format'> & {
  format?: typeof foldbackServiceFormats[number]
  allowOverrun?: boolean
  intervals?: AlertServiceInterval[]
}

export type FoldbackAppearance = {
  nextLines?: FoldbackLineCount
  next?: FoldbackTextAppearance
  clock?: FoldbackClock
}

export const foldbackContentRoles = ['song', 'scripture'] as const
export type FoldbackContentRole = typeof foldbackContentRoles[number]
export const foldbackContentLabels = { song: 'เนื้อเพลง', scripture: 'ข้อพระคัมภีร์' }
export const foldbackHorizontalAlignments = ['left', 'center', 'right'] as const
export const foldbackVerticalAlignments = ['top', 'center', 'bottom'] as const

export type FoldbackContentStyle = FoldbackTextAppearance & Pick<DesignTextStyle, 'align' | 'verticalAlign'> & {
  layout?: DesignTextLayout
  wrap?: boolean
  normalize?: boolean
  uppercase?: boolean
  capitalizeFirst?: boolean
  properWords?: string[]
}

export type FoldbackContentSettings = Partial<Record<FoldbackContentRole, FoldbackContentStyle>>

export function foldbackContentSourceId(path: string, role: FoldbackContentRole) {
  return `${path}#${role}`
}

export function formatFoldbackContent(lines: string[], style: FoldbackContentStyle) {
  const text = lines.join('\n')
  if (style.uppercase) return text.toUpperCase()
  const words = new Map(style.properWords?.map((word) => [word.toLowerCase(), word]))
  const terms = [...words.keys()].sort((a, b) => b.length - a.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const capitalized = style.capitalizeFirst
    ? text.replace(/^(\P{L}*?)(\p{L})/gmu, (_, prefix, letter: string) => prefix + letter.toUpperCase()) : text
  if (!terms.length) return capitalized
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}\\p{M}])(?:${terms.join('|')})(?![\\p{L}\\p{N}\\p{M}])`, 'giu')
  return capitalized.replace(pattern, (word) => {
    const preferred = words.get(word.toLowerCase()) ?? word
    return preferred.replace(/\p{L}/u, (letter) => letter.toUpperCase())
  })
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const color = (value: unknown) => value === undefined || (typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value))
const flag = (value: unknown) => value === undefined || typeof value === 'boolean'
const bounded = (value: unknown, min: number, max: number) =>
  value === undefined || (typeof value === 'number' && value >= min && value <= max)
const styleKeys = ['backgroundColor', 'opacity', 'textColor', 'fontFamily', 'fontRatio', 'bold', 'italic', 'effects']
const clockKeys = [...styleKeys, 'enabled', 'format', 'position']
const serviceKeys = [...clockKeys, 'allowOverrun', 'intervals']
const contentKeys = [...styleKeys, 'align', 'verticalAlign', 'layout', 'wrap', 'normalize', 'uppercase', 'capitalizeFirst', 'properWords']

export function validFoldbackClockFormat(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 80 && value.trim().length > 0 && !/[\x00-\x1f]/.test(value)
}

function validTextAppearance(value: unknown): value is FoldbackTextAppearance {
  return object(value) && color(value.backgroundColor) && color(value.textColor) && flag(value.bold) && flag(value.italic)
    && bounded(value.opacity, 0, 100) && bounded(value.fontRatio, 0.001, 0.25)
    && (value.fontFamily === undefined || validNurseryFont(value.fontFamily)) && validAlertTextEffects(value.effects)
}

function validContentLayout(value: unknown) {
  if (!object(value) || !Object.keys(value).every((key) => key === 'sizing' || key === 'insets')) return false
  const { sizing, insets } = value
  return (sizing === undefined || sizing === 'fit' || sizing === 'fixed')
    && (insets === undefined || (object(insets) && Object.entries(insets).every(([side, distance]) =>
      ['top', 'right', 'bottom', 'left'].includes(side) && bounded(distance, 0, 1))))
}

export function validFoldbackContentSettings(value: unknown): value is FoldbackContentSettings {
  return object(value) && Object.entries(value).every(([role, style]) =>
    foldbackContentRoles.some((kind) => kind === role) && object(style)
    && Object.keys(style).every((key) => contentKeys.includes(key))
    && (style.align === undefined || foldbackHorizontalAlignments.some((alignment) => alignment === style.align))
    && (style.verticalAlign === undefined || foldbackVerticalAlignments.some((alignment) => alignment === style.verticalAlign))
    && (style.layout === undefined || validContentLayout(style.layout))
    && flag(style.wrap) && flag(style.normalize) && flag(style.uppercase) && flag(style.capitalizeFirst)
    && (style.properWords === undefined || (Array.isArray(style.properWords) && style.properWords.length <= 500
      && style.properWords.every((word) => typeof word === 'string' && word.length <= 160 && word.trim() !== '' && !/[\r\n\0]/.test(word))))
    && validTextAppearance(style))
}

function validTimer(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).every((key) => keys.includes(key)) && flag(value.enabled)
    && (value.position === undefined || foldbackClockPositions.some((position) => position === value.position))
    && validTextAppearance(value)
}

export function validFoldbackServiceSettings(value: unknown): value is FoldbackServiceSettings {
  return object(value) && (value.format === undefined || foldbackServiceFormats.some((format) => format === value.format))
    && flag(value.allowOverrun)
    && (value.intervals === undefined || (Array.isArray(value.intervals) && value.intervals.every(validServiceInterval)))
    && validTimer(value, serviceKeys)
}

export function validFoldbackAppearance(value: unknown): value is FoldbackAppearance {
  if (!object(value) || !Object.keys(value).every((key) => key === 'nextLines' || key === 'next' || key === 'clock')) return false
  const { next, nextLines, clock } = value
  return (nextLines === undefined || nextLines === 0 || nextLines === 1 || nextLines === 2)
    && (next === undefined || (validTextAppearance(next) && Object.keys(next).every((key) => styleKeys.includes(key))))
    && (clock === undefined || (object(clock)
      && (clock.format === undefined || validFoldbackClockFormat(clock.format))
      && validTimer(clock, clockKeys)))
}
