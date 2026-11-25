/** Validates the bounded SVG path subset used for imported slide masks and strokes. */

import type { DesignShapeFill, DesignShapePath } from '../types/slideDesign'

export const MAX_CLIP_PATHS = 16
export const MAX_CLIP_PATH_LENGTH = 24_000
const coordinate = '-?(?:[0-9]|[12][0-9]|3[0-2])(?:\\.[0-9]{1,6})?'
const point = ` ${coordinate} ${coordinate}`
const contour = `M${point}(?: (?:L${point}|Q${point.repeat(2)}|C${point.repeat(3)}|A${point} 0 [01] [01]${point}))*`
const clipContour = contour + ' Z'
const drawnContour = contour + '(?: Z)?'
const pathPattern = new RegExp(`^${clipContour}(?: ${clipContour})*$`)
const styledPathPattern = new RegExp(`^${drawnContour}(?: ${drawnContour})*$`)
export const shapeFillModes: readonly DesignShapeFill[] = ['none', 'norm', 'darken', 'darkenLess', 'lightenLess', 'lighten']

export function validDesignClipPaths(paths: unknown): paths is string[] {
  return Array.isArray(paths) && paths.length > 0 && paths.length <= MAX_CLIP_PATHS && paths.every((path: unknown) =>
    typeof path === 'string' && path.length <= MAX_CLIP_PATH_LENGTH && pathPattern.test(path))
}

export function isShapeFillMode(value: unknown): value is DesignShapeFill {
  return shapeFillModes.includes(value as DesignShapeFill)
}

export function validDesignShapePaths(value: unknown): value is DesignShapePath[] {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_CLIP_PATHS && value.every((path: DesignShapePath) =>
    path && typeof path.d === 'string' && path.d.length <= MAX_CLIP_PATH_LENGTH && styledPathPattern.test(path.d)
    && isShapeFillMode(path.fill) && typeof path.stroke === 'boolean')
}
