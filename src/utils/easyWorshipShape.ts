/** Converts EasyWorship DrawingML contours to local, frame-relative clipping paths. */

import { attr, child, parseXml } from './powerPoint/xml'
import { isShapeFillMode, MAX_CLIP_PATHS, validDesignClipPaths, validDesignShapePaths } from './designClipPaths'
import type { DesignShapePath } from '../types/slideDesign'

type Point = [number, number]
const turn = 21_600_000
const radians = Math.PI * 2 / turn
const rectanglePath = /^M 0 0 L 1 0 L 1 1 L 0 1(?: L 0 0)? Z$/
export const unsupportedEasyWorshipShape = 'รูปทรง EasyWorship บางส่วนอ่านไม่ได้ จึงแสดงเป็นกรอบสี่เหลี่ยม'

function formula(op: string, x: number, y: number, z: number) {
  switch (op) {
    case 'val': return x
    case '+-': return x + y - z
    case '*/': return x * y / z
    case '+/': return (x + y) / z
    case '?:': return x > 0 ? y : z
    case 'pin': return Math.min(Math.max(x, y), z)
    case 'min': return Math.min(x, y)
    case 'max': return Math.max(x, y)
    case 'abs': return Math.abs(x)
    case 'sqrt': return Math.sqrt(x)
    case 'mod': return Math.hypot(x, y, z)
    case 'sin': return x * Math.sin(y * radians)
    case 'cos': return x * Math.cos(y * radians)
    case 'tan': return x * Math.tan(y * radians)
    case 'at2': return Math.atan2(y, x) / radians
    case 'cat2': return x * Math.cos(Math.atan2(z, y))
    case 'sat2': return x * Math.sin(Math.atan2(z, y))
    default: return NaN
  }
}

function guideLookup(geometry: Element, width: number, height: number) {
  const shortest = Math.min(width, height)
  const values = new Map(Object.entries({ l: 0, t: 0, r: width, b: height, w: width, h: height,
    hc: width / 2, vc: height / 2, ss: shortest, ls: Math.max(width, height) }))
  function read(token?: string): number {
    if (!token) throw new Error('Missing shape coordinate')
    const stored = values.get(token)
    if (stored !== undefined) return stored
    if (/^-?[0-9]+$/.test(token)) {
      const value = Number(token)
      if (Number.isSafeInteger(value)) return value
    }
    const angle = /^(\d+)?cd(\d+)$/.exec(token)
    if (angle && Number(angle[2]) > 0) return turn * Number(angle[1] ?? 1) / Number(angle[2])
    const fraction = /^(wd|hd|ssd)(\d+)$/.exec(token)
    if (fraction && Number(fraction[2]) > 0) {
      const total = fraction[1] === 'wd' ? width : fraction[1] === 'hd' ? height : shortest
      return total / Number(fraction[2])
    }
    throw new Error('Unknown shape coordinate')
  }
  const guides = ['avLst', 'gdLst'].flatMap((list) => Array.from(child(geometry, list)?.children ?? []))
  if (guides.length > 512) throw new Error('Too many shape guides')
  for (const guide of guides) {
    const name = attr(guide, 'name')
    const [op, ...args] = (attr(guide, 'fmla') ?? '').trim().split(/\s+/)
    if (!name || args.length > 3) throw new Error('Invalid shape guide')
    const [x = 0, y = 0, z = 0] = args.map(read)
    const value = formula(op, x, y, z)
    if (!Number.isFinite(value)) throw new Error('Invalid shape guide value')
    values.set(name, value)
  }
  return read
}

/** DrawingML angles are rays from the ellipse center, rather than parametric angles. */
function ellipsePoint(rx: number, ry: number, angle: number): Point {
  const x = Math.cos(angle * radians)
  const y = Math.sin(angle * radians)
  const length = 1 / Math.hypot(x / rx, y / ry)
  return [x * length, y * length]
}

function makePath(path: Element, read: ReturnType<typeof guideLookup>, width: number, height: number, closeOpen: boolean) {
  const pathWidth = attr(path, 'w') === undefined ? width : read(attr(path, 'w'))
  const pathHeight = attr(path, 'h') === undefined ? height : read(attr(path, 'h'))
  if (pathWidth <= 0 || pathHeight <= 0 || path.children.length > 512) throw new Error('Invalid shape path extent')
  const digits = (value: number) => {
    if (!Number.isFinite(value) || Math.abs(value) > 32) throw new Error('Invalid shape coordinate')
    return Number(value.toFixed(6)).toString()
  }
  const point = ([x, y]: Point) => `${digits(x / pathWidth)} ${digits(y / pathHeight)}`
  const commands: string[] = []
  let current: Point | undefined
  let start: Point | undefined
  function close(explicit = false) {
    if (start && (explicit || closeOpen)) commands.push('Z')
    current = start ?? current
    start = undefined
  }
  for (const step of path.children) {
    if (step.localName === 'close') { close(true); continue }
    if (step.localName === 'arcTo') {
      if (!current || !start) throw new Error('Shape arc without starting point')
      const rx = read(attr(step, 'wR'))
      const ry = read(attr(step, 'hR'))
      const angle = read(attr(step, 'stAng'))
      const sweep = read(attr(step, 'swAng'))
      if (rx < 0 || ry < 0 || Math.abs(sweep) > turn) throw new Error('Invalid shape arc')
      if (!rx || !ry || !sweep) continue
      const offset = ellipsePoint(rx, ry, angle)
      const center: Point = [current[0] - offset[0], current[1] - offset[1]]
      const segments = Math.ceil(Math.abs(sweep) / (turn / 2))
      for (let index = 1; index <= segments; index++) {
        const end = ellipsePoint(rx, ry, angle + sweep * index / segments)
        current = [center[0] + end[0], center[1] + end[1]]
        commands.push(`A ${point([rx, ry])} 0 0 ${sweep > 0 ? 1 : 0} ${point(current)}`)
      }
      continue
    }
    const kind = step.localName
    const points: Point[] = Array.from(step.children, (value) => [read(attr(value, 'x')), read(attr(value, 'y'))])
    if (kind === 'moveTo' && points.length === 1) {
      close()
      current = start = points[0]
      commands.push(`M ${point(current)}`)
      continue
    }
    if (!start) throw new Error('Shape path without starting point')
    const command = kind === 'lnTo' && points.length === 1 ? 'L' : kind === 'quadBezTo' && points.length === 2 ? 'Q'
      : kind === 'cubicBezTo' && points.length === 3 ? 'C' : undefined
    if (!command) throw new Error('Unknown shape operation')
    current = points[points.length - 1]
    commands.push(`${command} ${points.map(point).join(' ')}`)
  }
  close()
  return commands.join(' ')
}

export function easyWorshipClipPaths(raw: string | undefined, width: number, height: number): {
  clipPaths?: string[]; shapePaths?: DesignShapePath[]; unsupported?: true
} {
  if (!raw || typeof DOMParser === 'undefined') return {}
  if (raw.length > 256_000 || width <= 0 || height <= 0) return { unsupported: true }
  const root = parseXml(raw)
  const shape = root?.localName === 'DMLShape' ? root : child(root, 'DMLShape')
  const properties = child(shape, 'spPr')
  const custom = child(properties, 'custGeom')
  if (attr(child(properties, 'prstGeom'), 'prst') === 'rect') return {}
  if (!custom) return { unsupported: true }
  const preset = attr(custom, 'sdmlFromDMLPreset')
  const geometry = preset && child(custom, preset) || custom
  const paths = Array.from(child(geometry, 'pathLst')?.children ?? [])
  if (!paths.length || paths.length > MAX_CLIP_PATHS) return { unsupported: true }
  try {
    const read = guideLookup(geometry, width, height)
    const styled = paths.map((path) => {
      if (path.localName !== 'path') throw new Error('Invalid shape path')
      const fill = attr(path, 'fill') ?? 'norm'
      const stroke = attr(path, 'stroke')?.toLowerCase()
      if (!isShapeFillMode(fill) || (stroke !== undefined && !['1', 'true', 'on', '0', 'false', 'off'].includes(stroke))) {
        throw new Error('Invalid shape path style')
      }
      return { fill, stroke: !['0', 'false', 'off'].includes(stroke ?? ''), d: makePath(path, read, width, height, false) }
    })
    if (!validDesignShapePaths(styled)) return { unsupported: true }
    const clipPaths = styled.flatMap(({ fill, d }, index) => fill === 'none' ? []
      : [validDesignClipPaths([d]) ? d : makePath(paths[index], read, width, height, true)])
    if (clipPaths.length && !validDesignClipPaths(clipPaths)) return { unsupported: true }
    const needsPaintStyles = styled.some(({ fill, stroke, d }) => fill !== 'norm' || !stroke || !validDesignClipPaths([d]))
    return {
      ...(clipPaths.length && (clipPaths.length !== 1 || !rectanglePath.test(clipPaths[0])) ? { clipPaths } : {}),
      ...(needsPaintStyles ? { shapePaths: styled } : {}),
    }
  } catch {
    return { unsupported: true }
  }
}
