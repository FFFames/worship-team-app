/** Maps classic EasyWorship background and text settings into slide layers. */

import type { DesignFill, DesignFrame, DesignLayer, DesignTextStyle, SlideDesign } from '../types/slideDesign'
import type { EasyWorshipDesignEntry } from './easyWorshipDesigns'
import type { EasyWorshipParadoxRow } from './easyWorshipParadox'
import { decodeEasyWorshipText } from './easyWorshipEncoding'

const fullFrame = { x: 0, y: 0, width: 1, height: 1 }
const defaultFrame = { x: 0.07, y: 0.08, width: 0.86, height: 0.84 }
const DEFAULT_FONT_SIZE = 0.085
const ALIGNMENTS = ['left', 'center', 'right'] as const
const VERTICAL_ALIGNMENTS = ['top', 'center', 'bottom'] as const

function colorRef(value: number | undefined): string | undefined {
  if (value === undefined || value < 0 || value > 0xffffff) return undefined
  // Win32 COLORREF stores red in the low byte, followed by green and blue.
  return '#' + [value & 255, (value >> 8) & 255, value >> 16].map((channel) => channel.toString(16).padStart(2, '0')).join('')
}

export function legacyGradientFill(first: string, second: string, direction = 0, variant = 0): DesignFill {
  const [start, end] = variant === 1 || variant === 3 ? [second, first] : [first, second]
  return {
    type: 'gradient',
    angle: [90, 180, 45, 135][direction] ?? 90,
    stops: variant === 2 || variant === 3
      ? [{ color: start, position: 0 }, { color: end, position: 0.5 }, { color: start, position: 1 }]
      : [{ color: start, position: 0 }, { color: end, position: 1 }],
  }
}

export function legacyBackgroundFill(row: EasyWorshipParadoxRow, type: number): DesignFill | undefined {
  if (type === 0) {
    const color = colorRef(row.number('bk color'))
    return color ? { type: 'solid', color } : undefined
  }
  const first = colorRef(row.number('bk gradient color1'))
  const second = colorRef(row.number('bk gradient color2'))
  return first && second ? legacyGradientFill(first, second, row.number('bk gradient shading'), row.number('bk gradient variant')) : undefined
}

function textFrame(row: EasyWorshipParadoxRow): DesignFrame {
  if (row.logical('override enabled') !== true || row.logical('text percent rect default') !== false) return defaultFrame
  const margin = (side: string) => Math.max(0, Math.min(100, row.number('text percentage ' + side) ?? 0)) / 100
  const left = margin('left'), top = margin('top')
  const width = 1 - left - margin('right'), height = 1 - top - margin('bottom')
  return width >= 0.05 && height >= 0.05 ? { x: left, y: top, width, height } : defaultFrame
}

function textStyle(row: EasyWorshipParadoxRow, encoding: string): DesignTextStyle {
  const style: DesignTextStyle = { color: '#ffffff', align: 'center', verticalAlign: 'center', fontSize: DEFAULT_FONT_SIZE, shadow: true, fitText: true }
  if (row.logical('override enabled') !== true) return style
  const limit = row.number('font size limit')
  if (row.logical('font size limit default') === false && limit !== undefined && limit > 0) {
    style.fontSize = Math.max(0.01, Math.min(0.3, DEFAULT_FONT_SIZE * limit / 100))
  }
  const font = row.alpha('font name')
  if (row.logical('font name default') === false && font) style.fontFamily = decodeEasyWorshipText(font, encoding).trim()
  if (row.logical('text color default') === false) style.color = colorRef(row.number('text color')) ?? style.color
  if (row.logical('shadow color default') === false) style.shadowColor = colorRef(row.number('shadow color'))
  const shadow = row.number('shadow text')
  if (shadow === 0 || shadow === 1) style.shadow = shadow === 1
  if (row.number('outline text') === 1) {
    style.outlineColor = row.logical('outline color default') === false ? colorRef(row.number('outline color')) ?? '#000000' : '#000000'
  }
  style.align = ALIGNMENTS[row.number('text alignment') ?? 3] ?? style.align
  style.verticalAlign = VERTICAL_ALIGNMENTS[row.number('vert alignment') ?? 3] ?? style.verticalAlign
  style.bold = row.number('bold text') === 1
  style.italic = row.number('italic text') === 1
  return style
}

export function legacyBackgroundTheme(
  row: EasyWorshipParadoxRow, encoding: string, sourceId: string, title: string,
  background: { fill: DesignFill } | { asset: Extract<DesignLayer, { kind: 'media' }>['asset'] },
  warning?: string,
): EasyWorshipDesignEntry {
  return {
    title, layoutId: sourceId, kind: 'text-theme',
    content: {
      slides: [{
        id: sourceId, label: title,
        design: legacyBackgroundDesign(row, encoding, background),
      }],
      source: { format: 'easyworship', uid: sourceId },
      ...(warning ? { warnings: [warning] } : {}),
    },
  }
}

export function legacyBackgroundDesign(
  row: EasyWorshipParadoxRow, encoding: string,
  background?: { fill: DesignFill } | { asset: Extract<DesignLayer, { kind: 'media' }>['asset'] },
): SlideDesign {
  const layers: DesignLayer[] = []
  if (background) {
    layers.push('fill' in background
      ? { id: 'background', kind: 'fill', frame: fullFrame, fill: background.fill }
      : { id: 'background', kind: 'media', frame: fullFrame, asset: background.asset, fit: 'cover', loop: true })
  }
  layers.push({ id: 'lyrics', kind: 'text', frame: textFrame(row), text: '', slot: 'content', style: textStyle(row, encoding) })
  return { aspectRatio: 16 / 9, layers, ...(background ? {} : { inheritBackground: true }) }
}
