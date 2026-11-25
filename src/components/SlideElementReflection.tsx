import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { DesignElementReflection, DesignElementShadow } from '../types/slideDesign'
import { elementShadowOffset } from '../utils/slideElementEffects'

type Props = {
  reflection: DesignElementReflection
  shadow?: DesignElementShadow
  top: number
  height: number
  aspect: number
  order: number
  engine: 'webkit' | 'gecko'
  children: ReactNode
}

export function SlideElementReflection({ reflection, shadow, top, height, aspect, order, engine, children }: Props) {
  const filterId = useId()
  const sourceId = `reflection-source-${filterId}`
  const row = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const needsFilter = reflection.blur > 0 || Boolean(shadow)
  useLayoutEffect(() => {
    if (!row.current || !needsFilter) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(row.current)
    return () => observer.disconnect()
  }, [needsFilter])

  const slideHeight = width / aspect
  const frameHeight = height * slideHeight
  const mirrorStart = frameHeight + reflection.distance * slideHeight
  const blur = reflection.blur * slideHeight
  const shadowOffset = shadow ? elementShadowOffset(shadow) : undefined
  const padding = (3 * Math.max(reflection.blur, shadow?.blur ?? 0) + (shadow?.offset ?? 0)) * slideHeight
  const filter = needsFilter && width > 0
  // Reflect the browser's painted surface so the mirror uses the same video frame and never starts a second player.
  const mask = `linear-gradient(to top, rgb(0 0 0 / ${reflection.opacity}), transparent ${reflection.size * 100}%)`
  const gap = `${reflection.distance * 100}cqh`

  return <div ref={row} className="pointer-events-none absolute inset-x-0" data-element-reflection={reflection.group}
    data-element-shadow={shadow?.group} style={{ top: `${top * 100}%`, height: `${height * 100}%`, zIndex: order, filter: filter ? `url("#${filterId}")` : undefined }}>
    {filter && <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <filter id={filterId} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"
          x={-padding} y={-padding} width={width + 2 * padding} height={2 * padding + mirrorStart + frameHeight}>
          <feFlood x={-padding} y={mirrorStart} width={width + 2 * padding} height={frameHeight + padding}
            floodColor="#fff" result="mirrorArea" />
          <feComposite in="SourceGraphic" in2="mirrorArea" operator="out" result="original" />
          <feComposite in="SourceGraphic" in2="mirrorArea" operator="in" result="mirror" />
          <feGaussianBlur in="mirror" stdDeviation={blur} result="softMirror" />
          {shadow && shadowOffset && <>
            <feGaussianBlur in="original" stdDeviation={shadow.blur * slideHeight} result="shadowAlpha" />
            <feOffset in="shadowAlpha" dx={shadowOffset.x * slideHeight} dy={shadowOffset.y * slideHeight} result="shiftedShadow" />
            <feFlood floodColor={shadow.color} floodOpacity={shadow.opacity} result="shadowColor" />
            <feComposite in="shadowColor" in2="shiftedShadow" operator="in" result="shadow" />
          </>}
          <feMerge>
            {shadow && <feMergeNode in="shadow" />}
            <feMergeNode in="softMirror" />
            <feMergeNode in="original" />
          </feMerge>
        </filter>
      </defs>
    </svg>}
    <div id={sourceId} className="absolute inset-0"
      style={engine === 'webkit' ? { WebkitBoxReflect: `below ${gap} ${mask}` } : undefined}>{children}</div>
    {engine === 'gecko' && <div className="absolute inset-x-0 h-full" aria-hidden="true"
      style={{ top: `calc(100% + ${gap})`, transform: 'scaleY(-1)', maskImage: mask,
        backgroundImage: `-moz-element(#${CSS.escape(sourceId)})`, backgroundRepeat: 'no-repeat', backgroundSize: '100% 100%' }} />}
  </div>
}
