/** Paints one native border along the imported frame contour. */

import type { CSSProperties } from 'react'
import type { DesignElementBorder, DesignShapePath } from '../types/slideDesign'
import { safeColor } from './StyledTextRuns'

const rectangle = ['M 0 0 H 1 V 1 H 0 Z']

export function SlideElementBorder({ border, paths = rectangle, styledPaths, style, id }: {
  border: DesignElementBorder
  paths?: string[]
  styledPaths?: DesignShapePath[]
  style: CSSProperties
  id: string
}) {
  const inner = border.position === 'inner'
  const outer = border.position === 'outer'
  const width = Math.min(0.2, Math.max(0, border.width)) * 100
  const stroked = styledPaths?.filter(({ stroke }) => stroke).map(({ d }) => d.split(/ (?=M )/))
  const closed = stroked?.map((subpaths) => subpaths.filter((d) => d.endsWith(' Z')).join(' ')).filter(Boolean) ?? paths
  const open = stroked?.flatMap((subpaths) => subpaths.filter((d) => !d.endsWith(' Z'))) ?? []
  if (!closed.length && !open.length) return null
  const doubled = closed.length > 0 && (inner || outer)
  const clipPath = doubled && inner ? `url(#${id})` : undefined
  const mask = doubled && outer ? `url(#${id})` : undefined
  return <svg aria-hidden="true" viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none"
    style={{ ...style, overflow: 'visible' }} data-element-border={border.position}>
    {doubled && <defs>
      {inner ? <clipPath id={id} clipPathUnits="userSpaceOnUse">
        {closed.map((d, index) => <path key={index} d={d} />)}
      </clipPath> : <mask id={id} maskUnits="userSpaceOnUse" x="-1" y="-1" width="3" height="3">
        <rect x="-1" y="-1" width="3" height="3" fill="white" />
        {closed.map((d, index) => <path key={index} d={d} fill="black" />)}
      </mask>}
    </defs>}
    <g fill="none" stroke={safeColor(border.color, 'black')} opacity={border.opacity} strokeLinejoin={border.join}
      clipPath={open.length ? undefined : clipPath} mask={open.length ? undefined : mask}>
      {closed.map((d, index) => <path key={index} d={d} vectorEffect="non-scaling-stroke" style={{ strokeWidth: `${doubled ? 2 * width : width}cqh` }}
        clipPath={open.length ? clipPath : undefined} mask={open.length ? mask : undefined} />)}
      {open.map((d, index) => <path key={closed.length + index} d={d} vectorEffect="non-scaling-stroke" style={{ strokeWidth: `${width}cqh` }} />)}
    </g>
  </svg>
}
