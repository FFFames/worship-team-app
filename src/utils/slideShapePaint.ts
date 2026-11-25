import type { DesignFill, DesignShapeFill, DesignShapePath } from '../types/slideDesign'

/** EasyWorship scales HSL lightness for solid fills. */
export const shapeBrightness: Record<DesignShapeFill, number> = {
  none: 0, darken: .8, darkenLess: .9, norm: 1, lightenLess: 1.1, lighten: 1.2,
}

function shadeColor(color: string, scale: number) {
  if (!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(color)) return color
  const rgb = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16) / 255)
  const lightness = (Math.max(...rgb) + Math.min(...rgb)) / 2
  const next = Math.min(1, lightness * scale)
  const chroma = 1 - Math.abs(2 * lightness - 1)
  const ratio = chroma ? (1 - Math.abs(2 * next - 1)) / chroma : 0
  const hex = rgb.map((channel) => Math.round(255 * (next + (channel - lightness) * ratio)).toString(16).padStart(2, '0'))
  return `#${hex.join('')}${color.slice(7)}`
}

export function shadeShapeFill(fill: DesignFill, mode: DesignShapeFill): DesignFill {
  if (mode === 'norm') return fill
  const scale = shapeBrightness[mode]
  return fill.type === 'solid' ? { ...fill, color: shadeColor(fill.color, scale) }
    : { ...fill, stops: fill.stops.map((stop) => ({ ...stop, color: shadeColor(stop.color, scale) })) }
}

/** White identifies the selected shade. Later paths cover earlier paths in the same element. */
export function shapeShadeMask(paths: DesignShapePath[], mode: DesignShapeFill) {
  const surfaces = paths.flatMap(({ d, fill }) => fill === 'none' ? [] : [
    `<path d="${d}" fill="${fill === mode ? 'white' : 'black'}"/>`,
  ])
  return 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 1 1" preserveAspectRatio="none">${surfaces.join('')}</svg>`)
}
