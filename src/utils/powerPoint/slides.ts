/** Converts editable DrawingML layout, text and media into WorshipTeam slide layers. */

import type { DesignFill, DesignFrame, DesignLayer, DesignSlide, DesignTextStyle, SlideDesign } from '../../types/slideDesign'
import { powerPointVisualWarnings, unsupportedPowerPointBuild } from './layoutReplacement'
import { readPowerPointVisibilityBuild } from './visibilityBuild'
import { applyEmbeddedPowerPointMedia, type PowerPointPicture } from './embeddedMedia'
import { powerPointAssetMime } from './assets'
import { readPowerPointTransition } from './transitions'
import { attr, child, numeric, paragraphText, parseXml, rgb } from './xml'
import { isPowerPointTableLayer, powerPointTableLayers, readPowerPointTableStyles, type TableTextDefaults, type PowerPointTableStyles } from './tables'

type Relationships = Record<string, string>
export type PowerPointSlideInput = {
  path: string
  xml: string
  relationships?: Relationships
  linkedMediaProblems?: ReadonlyMap<string, string>
  onlineVideos?: ReadonlyMap<string, string>
  layoutXml?: string
  layoutRelationships?: Relationships
  masterXml?: string
  masterRelationships?: Relationships
  themeXml?: string
  speakerNotes?: string
}
export type PowerPointParseResult = { slides: DesignSlide[]; warnings: string[]; visualWarnings: Map<number, Set<string>>;
  layoutsBeforeMedia: Map<number, SlideDesign>; unresolvedMedia: Set<string> }

type Transform = { x: number; y: number; scaleX: number; scaleY: number }
type SlideContext = {
  width: number
  height: number
  theme: Map<string, string>
  themeFont: string | undefined
  tableTheme: { colors: ReadonlyMap<string, string>; formats?: Element; majorFont?: string; minorFont?: string }
  tableStyles: PowerPointTableStyles
  tableMasterText?: Element
  layout: Element | undefined
  master: Element | undefined
  warnings: Set<string>
  visualWarnings: Set<string>
  buildTargets?: Map<string, string[]>
  pictures: PowerPointPicture[]
  linkedMediaProblems?: ReadonlyMap<string, string>
  onlineVideos?: ReadonlyMap<string, string>
}

const identity: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1 }
const colorNames: Record<string, string> = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' }

function slideTree(root: Element | undefined): Element | undefined {
  return child(child(root, 'cSld'), 'spTree')
}

function readTheme(theme: Element | undefined, master: Element | undefined) {
  const colors = new Map<string, string>([['dk1', '#000000'], ['lt1', '#ffffff']])
  const themeElements = child(theme, 'themeElements')
  const scheme = child(themeElements, 'clrScheme')
  for (const entry of scheme?.children ?? []) {
    const hex = rgb(entry.firstElementChild ?? undefined)
    if (hex) colors.set(entry.localName, hex)
  }

  const mapping = child(master, 'clrMap')
  for (const [alias, target] of Object.entries(colorNames)) {
    const hex = colors.get(attr(mapping, alias) ?? target)
    if (hex) colors.set(alias, hex)
  }
  const fontScheme = child(themeElements, 'fontScheme')
  const font = attr(child(child(fontScheme, 'minorFont'), 'latin'), 'typeface')
  const majorFont = attr(child(child(fontScheme, 'majorFont'), 'latin'), 'typeface')
  return { colors, font, majorFont, formats: child(themeElements, 'fmtScheme') }
}

function color(element: Element | undefined, theme: Map<string, string>): string | undefined {
  if (!element) return undefined
  if (element.localName === 'schemeClr') return theme.get(attr(element, 'val') ?? '')
  return rgb(element)
}

function readFill(parent: Element | undefined, theme: Map<string, string>): DesignFill | undefined {
  const solid = child(parent, 'solidFill')
  const hex = color(solid?.firstElementChild ?? undefined, theme)
  if (hex) return { type: 'solid', color: hex }
  const gradient = child(parent, 'gradFill')
  const linear = child(gradient, 'lin')
  const stops = Array.from(child(gradient, 'gsLst')?.children ?? []).flatMap((stop) => {
    const hex = color(stop.firstElementChild ?? undefined, theme)
    return hex ? [{ color: hex, position: (numeric(stop, 'pos') ?? 0) / 100_000 }] : []
  })
  return stops.length > 1 ? { type: 'gradient', angle: (numeric(linear, 'ang') ?? 0) / 60_000 + 90, stops } : undefined
}

function background(root: Element | undefined, theme: Map<string, string>): DesignFill | undefined {
  const bg = child(child(root, 'cSld'), 'bg')
  const fill = readFill(child(bg, 'bgPr'), theme)
  const ref = color(child(bg, 'bgRef')?.firstElementChild ?? undefined, theme)
  return fill ?? (ref ? { type: 'solid', color: ref } : undefined)
}

function placeholder(shape: Element): Element | undefined {
  const nonvisual = Array.from(shape.children).find((node) => node.localName.startsWith('nv'))
  return child(child(nonvisual, 'nvPr'), 'ph')
}

function placeholderType(element: Element): string {
  const type = attr(element, 'type') ?? 'obj'
  return type === 'ctrTitle' ? 'title' : type
}

function placeholderMatch(tree: Element | undefined, reference: Element | undefined): Element | undefined {
  if (!reference) return undefined
  const candidates = Array.from(tree?.children ?? []).flatMap((shape) => {
    const ph = placeholder(shape)
    return ph ? [{ shape, ph }] : []
  })
  const idx = attr(reference, 'idx')
  const byIndex = idx === undefined ? undefined : candidates.find(({ ph }) => attr(ph, 'idx') === idx)
  if (byIndex) return byIndex.shape
  const kind = placeholderType(reference)
  return candidates.find(({ ph }) => placeholderType(ph) === kind)?.shape
    ?? (kind === 'obj' ? candidates.find(({ ph }) => placeholderType(ph) === 'body')?.shape : undefined)
}

function geometry(transform: Element | undefined, context: SlideContext, space: Transform) {
  const off = child(transform, 'off')
  const ext = child(transform, 'ext')
  return {
    x: (space.x + (numeric(off, 'x') ?? 0) * space.scaleX) / context.width,
    y: (space.y + (numeric(off, 'y') ?? 0) * space.scaleY) / context.height,
    width: (numeric(ext, 'cx') ?? context.width) * space.scaleX / context.width,
    height: (numeric(ext, 'cy') ?? context.height) * space.scaleY / context.height,
  }
}

function groupTransform(transform: Element | undefined, parent: Transform): Transform {
  const ext = child(transform, 'ext')
  const innerExt = child(transform, 'chExt')
  const innerOff = child(transform, 'chOff')
  const off = child(transform, 'off')
  const scaleX = parent.scaleX * ((numeric(ext, 'cx') || 1) / (numeric(innerExt, 'cx') || 1))
  const scaleY = parent.scaleY * ((numeric(ext, 'cy') || 1) / (numeric(innerExt, 'cy') || 1))
  return {
    x: parent.x + (numeric(off, 'x') ?? 0) * parent.scaleX - (numeric(innerOff, 'x') ?? 0) * scaleX,
    y: parent.y + (numeric(off, 'y') ?? 0) * parent.scaleY - (numeric(innerOff, 'y') ?? 0) * scaleY,
    scaleX,
    scaleY,
  }
}

function shapeLayer(properties: Element | undefined, frame: DesignFrame, rotation: number | undefined, context: SlideContext, id: string): DesignLayer | undefined {
  const line = child(properties, 'ln')
  const border = color(child(line, 'solidFill')?.firstElementChild ?? undefined, context.theme)
  const thickness = (numeric(line, 'w') ?? 12_700) / context.height
  const fill = readFill(properties, context.theme)
  const preset = attr(child(properties, 'prstGeom'), 'prst')
  if (child(properties, 'custGeom') || (preset && !['rect', 'roundRect', 'ellipse'].includes(preset))) {
    context.visualWarnings.add(powerPointVisualWarnings.shape)
  }
  if (!fill && !border) return undefined
  const opacity = numeric(child(child(properties, 'solidFill')?.firstElementChild ?? undefined, 'alpha'), 'val')
  return {
    id, kind: 'fill', frame, rotation, fill: fill ?? { type: 'solid', color: 'transparent' },
    ...(opacity === undefined ? {} : { opacity: opacity / 100_000 }),
    ...(preset === 'roundRect' || preset === 'ellipse' ? { shape: preset } : {}),
    ...(border && thickness > 0 ? { outline: { color: border, width: thickness } } : {}),
  }
}

function textLayer(shape: Element, template: Element | undefined, frame: DesignFrame, rotation: number | undefined, context: SlideContext, id: string,
  cell?: TableTextDefaults): DesignLayer | undefined {
  const body = child(shape, 'txBody')
  const paragraphs = Array.from(body?.children ?? []).filter((element) => element.localName === 'p')
  const text = paragraphs.map(paragraphText).join('\n').replace(/\n+$/, '')
  if (!text.trim()) return undefined

  const list = child(child(body, 'lstStyle'), 'lvl1pPr')
  const firstParagraph = paragraphs.find((paragraph) => paragraphText(paragraph).trim()) ?? paragraphs[0]
  const paragraph = child(firstParagraph, 'pPr') ?? list
  const inheritedBody = child(template, 'txBody')
  const inheritedParagraph = child(child(inheritedBody, 'lstStyle'), 'lvl1pPr')
    ?? child(child(inheritedBody, 'p'), 'pPr')
  const run = child(firstParagraph, 'r') ?? child(firstParagraph, 'fld')
  const styles = [child(run, 'rPr'), child(paragraph, 'defRPr'), child(list, 'defRPr'), child(inheritedParagraph, 'defRPr')]
  const firstAttribute = (name: string) => styles.map((style) => attr(style, name)).find((value) => value !== undefined)
  const family = styles.map((style) => attr(child(style, 'latin'), 'typeface')).find(Boolean)
  const level = Math.max(0, Math.min(8, numeric(paragraph, 'lvl') ?? 0)) + 1
  const cellMaster = cell && child(child(context.tableMasterText, `lvl${level}pPr`), 'defRPr')
  const fontSize = Number(firstAttribute('sz')) || numeric(cellMaster, 'sz')
    || (placeholderType(placeholder(shape) ?? shape) === 'title' ? 3200 : 1800)
  const ink = styles.map((style) => color(child(style, 'solidFill')?.firstElementChild ?? undefined, context.theme)).find(Boolean)
  const align = attr(paragraph, 'algn') ?? attr(inheritedParagraph, 'algn')
  const bodyProperties = child(body, 'bodyPr')
  const fromTemplate = child(inheritedBody, 'bodyPr')
  const cellProperties = cell && child(shape, 'tcPr')
  const anchor = attr(cellProperties, 'anchor') ?? attr(bodyProperties, 'anchor') ?? attr(fromTemplate, 'anchor')
  const inset = (body: string, margin: string, fallback: number) =>
    numeric(cellProperties, margin) ?? numeric(bodyProperties, body) ?? numeric(fromTemplate, body) ?? fallback
  const left = inset('lIns', 'marL', 91_440) / context.width
  const right = inset('rIns', 'marR', 91_440) / context.width
  const top = inset('tIns', 'marT', 45_720) / context.height
  const bottom = inset('bIns', 'marB', 45_720) / context.height
  const style: DesignTextStyle = {
    padding: 0,
    align: align === 'ctr' ? 'center' : align === 'r' ? 'right' : 'left',
    verticalAlign: anchor === 'ctr' ? 'center' : anchor === 'b' ? 'bottom' : 'top',
    fontSize: fontSize * 127 / context.height,
    color: ink ?? cell?.color ?? context.theme.get('tx1') ?? '#000000',
    fontFamily: (family && !family.startsWith('+') ? family : cell?.fontFamily ?? context.themeFont) || undefined,
    bold: firstAttribute('b') === undefined ? Boolean(cell?.bold) : firstAttribute('b') === '1',
    italic: firstAttribute('i') === undefined ? cell?.italic ?? (attr(cellMaster, 'i') === '1') : firstAttribute('i') === '1',
    underline: Boolean(firstAttribute('u') && firstAttribute('u') !== 'none'),
  }
  if (paragraphs.some((node) => Array.from(node.children).filter((item) => item.localName === 'r').length > 1)) {
    context.warnings.add('ข้อความหลายรูปแบบในกล่องเดียวใช้รูปแบบหลักของกล่อง')
  }
  const content = {
    x: frame.x + left, y: frame.y + top,
    width: Math.max(0, frame.width - left - right), height: Math.max(0, frame.height - top - bottom),
  }
  const orientation = attr(cellProperties, 'vert')
  if (orientation !== 'vert' && orientation !== 'vert270') return { id, kind: 'text', text, style, rotation, frame: content }
  const width = content.height * context.height / context.width
  const height = content.width * context.width / context.height
  return { id, kind: 'text', text, style, rotation: orientation === 'vert' ? 90 : 270,
    frame: { x: content.x + (content.width - width) / 2, y: content.y + (content.height - height) / 2, width, height } }
}

function imageLayer(shape: Element, frame: DesignFrame, rotation: number | undefined, relationships: Relationships | undefined, context: SlideContext, id: string): DesignLayer | undefined {
  const imageFill = child(shape, 'blipFill')
  const image = child(imageFill, 'blip')
  const embed = image && [...image.attributes].find((attribute) => attribute.localName === 'embed')?.value
  const sourcePath = embed && relationships && Object.prototype.hasOwnProperty.call(relationships, embed) ? relationships[embed] : undefined
  if (!sourcePath || !powerPointAssetMime(sourcePath)?.startsWith('image/')) {
    context.warnings.add('ข้ามภาพที่ไม่ได้บรรจุในไฟล์หรือรูปแบบที่ยังไม่รองรับ')
    return undefined
  }
  const rect = child(imageFill, 'srcRect')
  const crop = {
    left: (numeric(rect, 'l') ?? 0) / 100_000,
    top: (numeric(rect, 't') ?? 0) / 100_000,
    right: (numeric(rect, 'r') ?? 0) / 100_000,
    bottom: (numeric(rect, 'b') ?? 0) / 100_000,
  }
  return {
    id, kind: 'media', frame, rotation, fit: 'fill',
    ...(Object.values(crop).some(Boolean) ? { crop } : {}),
    asset: { kind: 'image', filename: sourcePath.split('/').pop() ?? sourcePath, sourcePath },
  }
}

function rememberBuildTarget(context: SlideContext, shape: Element, layers: DesignLayer[], start: number) {
  const targets = context.buildTargets
  if (!targets) return
  const nonvisual = Array.from(shape.children).find((node) => node.localName.startsWith('nv'))
  const id = attr(child(nonvisual, 'cNvPr'), 'id')
  if (id) targets.set(id, targets.has(id) ? [] : layers.slice(start).map((layer) => layer.id))
}

function appendShapes(
  tree: Element | undefined, relationships: Relationships | undefined, context: SlideContext,
  prefix: string, layers: DesignLayer[], space: Transform = identity, template = false,
) {
  for (const [index, shape] of Array.from(tree?.children ?? []).entries()) {
    const type = shape.localName
    const id = `${prefix}:${index}`
    const start = layers.length
    if (type === 'grpSp') {
      const transform = child(child(shape, 'grpSpPr'), 'xfrm')
      if (numeric(transform, 'rot') || attr(transform, 'flipH') === '1' || attr(transform, 'flipV') === '1') {
        context.visualWarnings.add(powerPointVisualWarnings.group)
      }
      appendShapes(shape, relationships, context, id, layers, groupTransform(transform, space), template)
      if (!template) rememberBuildTarget(context, shape, layers, start)
      continue
    }
    if (type === 'graphicFrame') {
      const data = child(child(shape, 'graphic'), 'graphicData')
      const table = child(data, 'tbl')
      const transform = child(shape, 'xfrm')
      if (table && transform && /\/table$/.test(attr(data, 'uri') ?? '')) {
        const frame = geometry(transform, context, space)
        const result = powerPointTableLayers(table, frame, id, context.tableStyles, context.tableTheme, context, {
          text: (cell, frame, id, style) => textLayer(cell, undefined, frame, undefined, context, id, style),
          picture: (properties, frame, id) => imageLayer(properties, frame, undefined, relationships, context, id),
        })
        if (!result || result.incomplete || numeric(transform, 'rot') || attr(transform, 'flipH') === '1' || attr(transform, 'flipV') === '1') {
          context.visualWarnings.add(powerPointVisualWarnings.table)
        }
        if (result) layers.push(...result.layers)
        if (!template) rememberBuildTarget(context, shape, layers, start)
        continue
      }
    }
    if (type !== 'sp' && type !== 'pic') {
      if (['graphicFrame', 'cxnSp', 'contentPart', 'AlternateContent'].includes(type)) {
        context.visualWarnings.add(powerPointVisualWarnings.object)
      }
      continue
    }

    const ph = placeholder(shape)
    if (template && ph) continue
    const inherited = placeholderMatch(context.layout, ph) ?? placeholderMatch(context.master, ph)
    const properties = child(shape, 'spPr')
    const transform = child(properties, 'xfrm') ?? child(child(inherited, 'spPr'), 'xfrm')
    const frame = geometry(transform, context, space)
    const rawRotation = numeric(transform, 'rot')
    const rotation = rawRotation === undefined ? undefined : (rawRotation / 60_000) % 360
    if (attr(transform, 'flipH') === '1' || attr(transform, 'flipV') === '1') context.visualWarnings.add(powerPointVisualWarnings.flip)

    if (type === 'pic') {
      const layer = imageLayer(shape, frame, rotation, relationships, context, id)
      if (layer) layers.push(layer)
      if (!template) context.pictures.push({ shape, layerId: id, frame, rotation, relationships,
        linkedMediaProblems: context.linkedMediaProblems, onlineVideos: context.onlineVideos })
    } else {
      const fill = shapeLayer(properties, frame, rotation, context, id)
      if (fill) layers.push(fill)
      const text = textLayer(shape, inherited, frame, rotation, context, id + ':text')
      if (text) layers.push(text)
    }
    if (!template) rememberBuildTarget(context, shape, layers, start)
  }
}

export function parsePowerPointSlides(inputs: readonly PowerPointSlideInput[], width = 12_192_000, height = 6_858_000,
  tableStylesXml?: string): PowerPointParseResult {
  const warnings = new Set<string>()
  const visualWarnings = new Map<number, Set<string>>()
  const layoutsBeforeMedia = new Map<number, SlideDesign>()
  const unresolvedMedia = new Set<string>()
  const aspectRatio = width / height
  const tableStyles = readPowerPointTableStyles(tableStylesXml)
  const slides = inputs.map((input, index) => {
    const root = parseXml(input.xml)
    if (root?.localName !== 'sld') throw new Error(`อ่าน XML ของสไลด์ PowerPoint ${index + 1} ไม่สำเร็จ`)
    const layoutRoot = parseXml(input.layoutXml)
    const masterRoot = parseXml(input.masterXml)
    const { colors, font, majorFont, formats } = readTheme(parseXml(input.themeXml), masterRoot)
    const timing = child(root, 'timing')
    const { soundAction, ...playback } = readPowerPointTransition(root, warnings, {
      relationships: input.relationships, problems: input.linkedMediaProblems, unresolved: unresolvedMedia,
    })
    const buildTargets = timing ? new Map<string, string[]>() : undefined
    const context: SlideContext = {
      width, height, theme: colors, themeFont: font, tableStyles, tableTheme: { colors, formats, majorFont, minorFont: font },
      tableMasterText: child(child(masterRoot, 'txStyles'), 'otherStyle'),
      layout: slideTree(layoutRoot), master: slideTree(masterRoot), warnings, visualWarnings: new Set(), buildTargets, pictures: [],
      linkedMediaProblems: input.linkedMediaProblems,
      onlineVideos: input.onlineVideos,
    }
    const id = input.path
    const fill = background(root, colors) ?? background(layoutRoot, colors) ?? background(masterRoot, colors)
    const layers: DesignLayer[] = [{
      id: id + ':background', kind: 'fill', frame: { x: 0, y: 0, width: 1, height: 1 },
      fill: fill ?? { type: 'solid', color: colors.get('bg1') ?? '#ffffff' },
    }]
    if (attr(root, 'showMasterSp') !== '0') {
      if (attr(layoutRoot, 'showMasterSp') !== '0') appendShapes(context.master, input.masterRelationships, context, id + ':master', layers, identity, true)
      appendShapes(context.layout, input.layoutRelationships, context, id + ':layout', layers, identity, true)
    }
    appendShapes(slideTree(root), input.relationships, context, id, layers)
    if (context.visualWarnings.size) visualWarnings.set(index, context.visualWarnings)
    const animation = timing && buildTargets ? readPowerPointVisibilityBuild(timing, buildTargets) : undefined
    const base: SlideDesign = { aspectRatio, layers, ...(layers.some(isPowerPointTableLayer) ? { powerPointTablesImported: true } : {}),
      ...(animation?.build ? { powerPointBuild: animation.build } : {}) }
    const withMedia = applyEmbeddedPowerPointMedia(base, context.pictures, timing, warnings, unresolvedMedia, animation?.timeline)
    if (withMedia) layoutsBeforeMedia.set(index, base)
    const design: SlideDesign = withMedia ?? base
    const withSound: SlideDesign = soundAction === 'stop' ? { ...design, powerPointStopTransitionSound: true }
      : soundAction ? { ...design, soundtracks: [...design.soundtracks ?? [], soundAction] } : design
    const hasOtherEffects = timing && [...timing.getElementsByTagNameNS('*', 'cTn')]
      .some((node) => node.hasAttribute('presetClass') && node.getAttribute('presetClass') !== 'mediacall')
    if (timing && (!withMedia || hasOtherEffects) && (!animation || animation.incomplete)) warnings.add(unsupportedPowerPointBuild)
    if (attr(root, 'show') === '0') warnings.add(`สไลด์ ${index + 1} ที่ต้นฉบับซ่อนไว้ถูกเก็บตามลำดับในไฟล์`)
    return {
      id,
      label: attr(child(root, 'cSld'), 'name') || `สไลด์ ${index + 1}`,
      ...(input.speakerNotes !== undefined ? { speakerNotes: input.speakerNotes } : {}),
      design: withSound,
      ...playback,
    }
  })
  return { slides, warnings: [...warnings], visualWarnings, layoutsBeforeMedia, unresolvedMedia }
}
