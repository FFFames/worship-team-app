import { memo } from 'react'
import type { DesignShapeFill, DesignShapePath } from '../types/slideDesign'
import { shapeBrightness, shapeShadeMask } from '../utils/slideShapePaint'

export const SlideShapeMediaFilter = memo(function SlideShapeMediaFilter({ id, paths }: { id: string; paths: DesignShapePath[] }) {
  const modes = [...new Set(paths.map(({ fill }) => fill))].filter((mode) => mode !== 'none')
  return <filter id={id} x="0" y="0" width="100%" height="100%" primitiveUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
    {modes.map((mode) => <Shade key={mode} mode={mode} paths={paths} />)}
    <feMerge>{modes.map((mode) => <feMergeNode key={mode} in={mode} />)}</feMerge>
  </filter>
})

function Shade({ mode, paths }: { mode: DesignShapeFill; paths: DesignShapePath[] }) {
  const brightness = shapeBrightness[mode]
  return <>
    <feImage x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" href={shapeShadeMask(paths, mode)} result={`${mode}-image`} />
    <feColorMatrix in={`${mode}-image`} type="luminanceToAlpha" result={`${mode}-mask`} />
    {mode !== 'norm' && <feComponentTransfer in="SourceGraphic" result={`${mode}-source`}>
      <feFuncR type="linear" slope={brightness} />
      <feFuncG type="linear" slope={brightness} />
      <feFuncB type="linear" slope={brightness} />
    </feComponentTransfer>}
    <feComposite in={mode === 'norm' ? 'SourceGraphic' : `${mode}-source`} in2={`${mode}-mask`} operator="in" result={mode} />
  </>
}
