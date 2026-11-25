/** Maps DrawingML table cells to editable text and fill layers in slide order. */

import type { DesignFill, DesignFrame, DesignLayer } from '../../types/slideDesign'
import { attr, child, numeric, parseXml, rgb } from './xml'

type ColorTheme = { colors: ReadonlyMap<string, string>; formats?: Element; majorFont?: string; minorFont?: string }
export type TableTextDefaults = { color?: string; fontFamily?: string; bold?: boolean; italic?: boolean }
export type PowerPointTableStyles = { defaultId?: string; definitions: Map<string, Element> }
type CellEdge = 'left' | 'right' | 'top' | 'bottom'
type Border = { color: string; width: number }
type CellFill = DesignFill | null
type TableCell = {
  id: string
  element: Element
  frame: DesignFrame
  fill?: CellFill
  border: Partial<Record<CellEdge, Border | null>>
  text: TableTextDefaults
}
type TableResult = { cells: TableCell[]; incomplete: boolean }

const sides = ['left', 'right', 'top', 'bottom'] as const
const sideElements = { left: 'lnL', right: 'lnR', top: 'lnT', bottom: 'lnB' }
const medium2 = new Map([
  ['{073A0DAA-6AF3-43AB-8588-CEC1D06C72B9}', 'dk1'],
  ['{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}', 'accent1'],
  ['{21E4AEA4-8DFA-4A89-87EB-49C32662AFE0}', 'accent2'],
  ['{F5AB1C69-6EDB-4FF4-983F-18BD219EF322}', 'accent3'],
  ['{00A15C55-8517-42AA-B614-E9B94910E393}', 'accent4'],
  ['{7DF18680-E054-41AD-8BC1-D1AEF772440D}', 'accent5'],
  ['{93296810-A885-4BE3-A3E7-6D5BEEA58F35}', 'accent6'],
])
const noGridStyle = '{2D5ABB26-0587-4C30-8999-92F81FD0307C}'
const maxTableCells = 1024

export function isPowerPointTableLayer(layer: DesignLayer) {
  return /:table:\d+:\d+:(?:fill|text|left|right|top|bottom|image)$/.test(layer.id)
}

function children(element: Element | undefined, name: string) {
  return Array.from(element?.children ?? []).filter((item) => item.localName === name)
}

export function readPowerPointTableStyles(xml: string | undefined): PowerPointTableStyles {
  const root = parseXml(xml)
  return {
    defaultId: attr(root, 'def')?.toUpperCase(),
    definitions: new Map(children(root, 'tblStyle').flatMap((style) => {
      const id = attr(style, 'styleId')?.toUpperCase()
      return id ? [[id, style]] : []
    })),
  }
}

function flag(element: Element | undefined, name: string) {
  return ['1', 'true', 'on'].includes(attr(element, name) ?? '')
}

function unit(value: number) {
  return Math.max(0, Math.min(1, value))
}

function percent(element: Element | undefined, name: string, fallback: number) {
  const value = attr(element, name)
  const parsed = value?.endsWith('%') ? Number(value.slice(0, -1)) / 100 : (numeric(element, name) ?? fallback * 100_000) / 100_000
  return Number.isFinite(parsed) ? parsed : fallback
}

function hexColor(channels: number[]) {
  return '#' + channels.map((channel) => Math.round(unit(channel) * 255).toString(16).padStart(2, '0')).join('')
}

function linearChannel(channel: number) {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055
}

function blend(hex: string, retained: number, background: 0 | 1) {
  return hexColor([1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255
    const linear = channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
    return linearChannel(linear * retained + background * (1 - retained))
  }))
}

function changeLightness(hex: string, scale: number, offset: number) {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
  const lightness = (Math.max(...channels) + Math.min(...channels)) / 2
  const next = unit(lightness * scale + offset)
  const availableChroma = 1 - Math.abs(2 * lightness - 1)
  const ratio = availableChroma ? (1 - Math.abs(2 * next - 1)) / availableChroma : 0
  return hexColor(channels.map((channel) => next + (channel - lightness) * ratio))
}

function paint(element: Element | undefined, theme: ColorTheme, placeholder?: string): string | undefined {
  if (!element) return undefined
  const value = attr(element, 'val') ?? ''
  let hex: string | undefined
  switch (element.localName) {
    case 'schemeClr': hex = value === 'phClr' ? placeholder : theme.colors.get(value); break
    case 'prstClr': hex = value === 'black' ? '#000000' : value === 'white' ? '#ffffff' : undefined; break
    case 'scrgbClr': hex = hexColor(['r', 'g', 'b'].map((name) => linearChannel(percent(element, name, 0)))); break
    default: hex = rgb(element)
  }
  if (!hex) return undefined
  let alpha = 1
  for (const transform of element.children) {
    if (transform.localName === 'tint') hex = blend(hex, unit(percent(transform, 'val', 1)), 1)
    else if (transform.localName === 'shade') hex = blend(hex, unit(percent(transform, 'val', 1)), 0)
    else if (transform.localName === 'lumMod') hex = changeLightness(hex, percent(transform, 'val', 1), 0)
    else if (transform.localName === 'lumOff') hex = changeLightness(hex, 1, percent(transform, 'val', 0))
    else if (transform.localName === 'alpha') alpha = unit(percent(transform, 'val', 1))
  }
  return alpha === 1 ? hex : hex + Math.round(alpha * 255).toString(16).padStart(2, '0')
}

function fill(container: Element | undefined, theme: ColorTheme, placeholder?: string): CellFill | undefined {
  if (child(container, 'noFill')) return null
  const color = paint(child(container, 'solidFill')?.firstElementChild ?? undefined, theme, placeholder)
  if (color) return { type: 'solid', color }
  const gradient = child(container, 'gradFill')
  const linear = child(gradient, 'lin')
  const stops = children(child(gradient, 'gsLst'), 'gs').flatMap((stop) => {
    const color = paint(stop.firstElementChild ?? undefined, theme, placeholder)
    return color ? [{ color, position: unit(percent(stop, 'pos', 0)) }] : []
  })
  return linear && stops.length > 1 ? { type: 'gradient', angle: (numeric(linear, 'ang') ?? 0) / 60_000 + 90, stops } : undefined
}

function styleFill(cellStyle: Element | undefined, theme: ColorTheme): CellFill | undefined {
  const ref = child(cellStyle, 'fillRef')
  if (!ref) return fill(child(cellStyle, 'fill'), theme)
  const index = numeric(ref, 'idx')
  if (index === 0 || index === 1000) return null
  if (!index || !Number.isSafeInteger(index)) return undefined
  const inBackground = index > 1000
  const list = child(theme.formats, inBackground ? 'bgFillStyleLst' : 'fillStyleLst')
  const preset = list?.children[index - (inBackground ? 1001 : 1)]
  if (!preset) return undefined
  // A style-matrix entry is the fill itself rather than a container such as tcPr.
  const container = ref.ownerDocument.createElement('fill')
  container.append(preset.cloneNode(true))
  return fill(container, theme, paint(ref.firstElementChild ?? undefined, theme))
}

function borderLine(line: Element | undefined, theme: ColorTheme, placeholder?: string): Border | null | undefined {
  if (!line) return undefined
  if (child(line, 'noFill')) return null
  const color = paint(child(line, 'solidFill')?.firstElementChild ?? undefined, theme, placeholder)
  const width = numeric(line, 'w') ?? 12_700
  return color && width > 0 ? { color, width } : undefined
}

function styleBorder(edge: Element | undefined, theme: ColorTheme): Border | null | undefined {
  const ref = child(edge, 'lnRef')
  if (!ref) return borderLine(child(edge, 'ln'), theme)
  const index = numeric(ref, 'idx')
  if (index === 0) return null
  const entry = index && child(theme.formats, 'lnStyleLst')?.children[index - 1]
  return borderLine(entry || undefined, theme, paint(ref.firstElementChild ?? undefined, theme))
}

function regionKeys(properties: Element | undefined, row: number, col: number, rows: number, cols: number) {
  const firstRow = flag(properties, 'firstRow')
  const firstCol = flag(properties, 'firstCol')
  const hasBottom = flag(properties, 'lastRow')
  const hasRight = flag(properties, 'lastCol')
  const top = row === 0 && firstRow, bottom = row === rows - 1 && hasBottom
  const left = col === 0 && firstCol, right = col === cols - 1 && hasRight
  const keys = ['wholeTbl']
  if (flag(properties, 'bandCol') && !left && !right) keys.push((col - Number(firstCol)) % 2 ? 'band2V' : 'band1V')
  if (flag(properties, 'bandRow') && !top && !bottom) keys.push((row - Number(firstRow)) % 2 ? 'band2H' : 'band1H')
  if (right) keys.push('lastCol')
  if (left) keys.push('firstCol')
  if (bottom) keys.push('lastRow')
  if (top) keys.push('firstRow')
  if (bottom && right) keys.push('seCell')
  if (bottom && left) keys.push('swCell')
  if (top && right) keys.push('neCell')
  if (top && left) keys.push('nwCell')
  return keys
}

function textStyle(element: Element | undefined, theme: ColorTheme): TableTextDefaults {
  const style: TableTextDefaults = {}
  const color = paint(Array.from(element?.children ?? []).find((item) => item.localName.endsWith('Clr')), theme)
  if (color) style.color = color
  const font = attr(child(element, 'fontRef'), 'idx')
  const family = font === 'major' ? theme.majorFont : font === 'minor' ? theme.minorFont : undefined
  if (family) style.fontFamily = family
  if (attr(element, 'b')) style.bold = flag(element, 'b')
  if (attr(element, 'i')) style.italic = flag(element, 'i')
  return style
}

function gridOffsets(elements: Element[], axis: 'w' | 'h') {
  if (!elements.length) return undefined
  const offsets = [0]
  for (const element of elements) {
    const size = numeric(element, axis)
    if (!size || !Number.isSafeInteger(size) || size <= 0) return undefined
    offsets.push(offsets[offsets.length - 1] + size)
  }
  const total = offsets[offsets.length - 1]
  return offsets.map((offset) => offset / total)
}

export function readPowerPointTable(table: Element, frame: DesignFrame, id: string,
  styles: PowerPointTableStyles, theme: ColorTheme): TableResult | undefined {
  const rows = children(table, 'tr')
  const cols = children(child(table, 'tblGrid'), 'gridCol')
  if (rows.length * cols.length > maxTableCells || frame.width <= 0 || frame.height <= 0) return undefined
  const x = gridOffsets(cols, 'w')
  const y = gridOffsets(rows, 'h')
  if (!x || !y) return undefined

  const properties = child(table, 'tblPr')
  const styleId = child(properties, 'tableStyleId')?.textContent?.trim().toUpperCase() || styles.defaultId
  const definition = child(properties, 'tableStyle') ?? (styleId ? styles.definitions.get(styleId) : undefined)
  const accent = !definition && styleId ? medium2.get(styleId) : undefined
  const accentColor = accent && (theme.colors.get(accent) ?? '#4472c4')
  const ink = theme.colors.get('dk1') ?? '#000000'
  const paper = theme.colors.get('lt1') ?? '#ffffff'
  let incomplete = Boolean(styleId && !definition && !accent && styleId !== noGridStyle)
  const rtl = flag(properties, 'rtl')
  const occupied = rows.map(() => new Uint8Array(cols.length))
  const cells: TableCell[] = []
  for (const [row, rowElement] of rows.entries()) {
    const entries = children(rowElement, 'tc')
    if (entries.length !== cols.length) return undefined
    for (const [col, element] of entries.entries()) {
      if (flag(element, 'hMerge') || flag(element, 'vMerge')) {
        if (!occupied[row][col]) return undefined
        continue
      }
      const height = numeric(element, 'rowSpan') ?? 1
      const width = numeric(element, 'gridSpan') ?? 1
      if (![height, width].every((span) => Number.isSafeInteger(span) && span >= 1)
        || row + height > rows.length || col + width > cols.length) return undefined
      for (let r = row; r < row + height; r++) {
        for (let c = col; c < col + width; c++) {
          if (occupied[r][c]) return undefined
          occupied[r][c] = 1
        }
      }

      const keys = regionKeys(properties, row, col, rows.length, cols.length)
      const regions = keys.map((key) => child(definition, key)).filter((region): region is Element => Boolean(region))
      const cellProperties = child(element, 'tcPr')
      const directFill = fill(cellProperties, theme)
      const emphasized = keys.some((key) => ['firstRow', 'lastRow', 'firstCol', 'lastCol'].includes(key))
      let colorFill: CellFill | undefined = accentColor ? { type: 'solid', color: emphasized ? accentColor
        : blend(accentColor, keys.some((key) => key === 'band1H' || key === 'band1V') ? .4 : .2, 1) } : undefined
      const text: TableTextDefaults = accentColor ? { color: emphasized ? paper : ink, bold: emphasized } : {}
      const border: TableCell['border'] = {}
      const outer = { left: col === 0, right: col + width === cols.length, top: row === 0, bottom: row + height === rows.length }
      for (const region of regions) {
        Object.assign(text, textStyle(child(region, 'tcTxStyle'), theme))
        const cellStyle = child(region, 'tcStyle')
        const regionFill = styleFill(cellStyle, theme)
        if (regionFill !== undefined) colorFill = regionFill
        else if (child(cellStyle, 'fillRef') || child(cellStyle, 'fill')?.children.length) incomplete = true
        const borders = child(cellStyle, 'tcBdr')
        for (const side of sides) {
          const internal = region.localName === 'wholeTbl' && !outer[side]
          const sideName = internal ? side === 'top' || side === 'bottom' ? 'insideH' : 'insideV' : side
          const line = styleBorder(child(borders, sideName), theme)
          if (line !== undefined) border[side] = line
        }
      }
      for (const side of sides) {
        const line = borderLine(child(cellProperties, sideElements[side]), theme)
        if (line !== undefined) border[side] = line
        else if (accentColor) {
          const headerRule = side === 'bottom' && row === 0 && flag(properties, 'firstRow')
            || side === 'top' && row === rows.length - 1 && flag(properties, 'lastRow')
          border[side] = { color: paper, width: headerRule ? 38_100 : 12_700 }
        }
      }
      if (['pattFill', 'grpFill'].some((part) => child(cellProperties, part))
        || (['solidFill', 'gradFill'].some((part) => child(cellProperties, part)) && directFill === undefined)
        || ![undefined, 'horz', 'vert', 'vert270'].includes(attr(cellProperties, 'vert'))) incomplete = true
      cells.push({
        id: `${id}:table:${row}:${col}`, element,
        frame: {
          x: frame.x + (rtl ? 1 - x[col + width] : x[col]) * frame.width, y: frame.y + y[row] * frame.height,
          width: (x[col + width] - x[col]) * frame.width, height: (y[row + height] - y[row]) * frame.height,
        },
        fill: directFill === undefined ? colorFill : directFill, border, text,
      })
    }
  }
  return { cells, incomplete }
}

export function powerPointTableLayers(table: Element, frame: DesignFrame, id: string,
  styles: PowerPointTableStyles, theme: ColorTheme, units: { width: number; height: number },
  read: {
    text: (cell: Element, geometry: DesignFrame, id: string, style: TableTextDefaults) => DesignLayer | undefined
    picture: (properties: Element, geometry: DesignFrame, id: string) => DesignLayer | undefined
  }) {
  const result = readPowerPointTable(table, frame, id, styles, theme)
  if (!result) return undefined
  const fills: DesignLayer[] = [], borders: DesignLayer[] = [], texts: DesignLayer[] = []
  let incomplete = result.incomplete
  for (const cell of result.cells) {
    const { x, y, width, height } = cell.frame
    if (cell.fill) fills.push({ kind: 'fill', id: cell.id + ':fill', frame: cell.frame, fill: cell.fill })
    const properties = child(cell.element, 'tcPr')
    const image = child(properties, 'blipFill')
    if (properties && image) {
      const picture = read.picture(properties, cell.frame, cell.id + ':image')
      if (picture) fills.push(picture)
      incomplete ||= !picture || Boolean(child(image, 'tile') || child(child(image, 'stretch'), 'fillRect')?.attributes.length)
    }
    for (const side of sides) {
      const line = cell.border[side]
      if (!line) continue
      const horizontal = side === 'top' || side === 'bottom'
      const length = line.width / (horizontal ? units.height : units.width)
      borders.push({
        kind: 'fill', id: cell.id + ':' + side, fill: { type: 'solid', color: line.color },
        frame: horizontal ? { x, y: y + (side === 'bottom' ? height : 0) - length / 2, width, height: length }
          : { x: x + (side === 'right' ? width : 0) - length / 2, y, width: length, height },
      })
    }
    const text = read.text(cell.element, cell.frame, cell.id + ':text', cell.text)
    if (text) texts.push(text)
  }
  return { layers: [...fills, ...borders, ...texts], incomplete }
}
