/** Stores and formats editable paragraph markers independently of the slide's text. */

import type { DesignListStyle, DesignParagraphList } from '../types/slideDesign'

export const numberedListStyles = ['decimal', 'upper-roman', 'lower-roman', 'upper-alpha', 'lower-alpha'] as const
export const listPunctuation = ['period', 'parenthesis', 'parentheses'] as const
export const defaultListBullet = '•'
export const maxListLevel = 31
export const maxListStart = 999999
export const maxListMarkerLength = 64

export function isNumberedListStyle(value: unknown): value is typeof numberedListStyles[number] {
  return numberedListStyles.some((style) => style === value)
}

export function isListPunctuation(value: unknown): value is typeof listPunctuation[number] {
  return listPunctuation.some((punctuation) => punctuation === value)
}

export function normalizeListMarker(text: unknown) {
  if (typeof text !== 'string') return undefined
  const marker = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, maxListMarkerLength)
  return marker.replace(/[\uD800-\uDFFF]/gu, '').trim() || undefined
}

export function easyWorshipParagraphList(type: number | undefined, level: number | undefined, text: string | undefined,
  start: number | undefined, literal: string | undefined): DesignParagraphList | false | undefined {
  if (type === 0) return false
  const depth = level !== undefined && level > 0 ? Math.min(level, maxListLevel) : undefined
  const marker = normalizeListMarker(text)
  if (type === 1) return { style: 'bullet', ...(marker ? { text: marker } : {}), ...(depth ? { level: depth } : {}) }
  if (type !== undefined && type >= 2 && type <= 16) {
    const offset = type - 2
    return { style: numberedListStyles[Math.floor(offset / 3)], punctuation: listPunctuation[offset % 3],
      ...(depth ? { level: depth } : {}), ...(start && start > 0 ? { start: Math.min(start, maxListStart) } : {}) }
  }
  const fallback = normalizeListMarker(literal)
  return fallback ? { style: 'literal', text: fallback, ...(depth ? { level: depth } : {}) } : undefined
}

const romanParts = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'],
  [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
] as const

function romanNumber(value: number) {
  if (value > 3999) return String(value)
  let result = ''
  for (const [amount, digit] of romanParts) {
    result += digit.repeat(Math.floor(value / amount))
    value %= amount
  }
  return result
}

function alphabetNumber(value: number) {
  let result = ''
  for (let index = value - 1; index >= 0; index = Math.floor(index / 26) - 1) {
    result = String.fromCharCode(65 + index % 26) + result
  }
  return result
}

function numberMarker(style: DesignListStyle, value: number) {
  if (style === 'upper-roman') return romanNumber(value)
  if (style === 'lower-roman') return romanNumber(value).toLowerCase()
  if (style === 'upper-alpha') return alphabetNumber(value)
  if (style === 'lower-alpha') return alphabetNumber(value).toLowerCase()
  return String(value)
}

export function paragraphListMarkers(lists: readonly (DesignParagraphList | false | undefined)[]) {
  const counts: number[] = []
  let previous: string | undefined
  return lists.map((list) => {
    if (!list) {
      counts.length = 0
      previous = undefined
      return undefined
    }
    const depth = list.level ?? 0
    const level = Number.isInteger(depth) ? Math.min(maxListLevel, Math.max(0, depth)) : 0
    counts.length = level + 1
    const punctuation = list.punctuation ?? 'period'
    const style = `${list.style}:${punctuation}`
    const continuation = style === previous ? (counts[level] ?? 0) + 1 : 1
    previous = style
    if (list.style === 'bullet' || list.style === 'literal') {
      counts[level] = 0
      return normalizeListMarker(list.text) ?? defaultListBullet
    }
    const start = list.start ?? 0
    const number = Number.isInteger(start) && start > 0 ? Math.min(start, maxListStart) : continuation
    counts[level] = number
    const marker = numberMarker(list.style, number)
    return punctuation === 'parentheses' ? `(${marker})` : punctuation === 'parenthesis' ? `${marker})` : `${marker}.`
  })
}
