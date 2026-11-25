/** Geometry for transitions applied to the outgoing and incoming browser snapshots. */

export type SlideTransitionSize = { width: number; height: number }

const clampUnit = (value: number) => Math.min(1, Math.max(0, value))
const point = (value: number) => Math.round(value * 100) / 100

export function transitionPercent(value: string | undefined, fallback: number) {
  const percent = value?.trim() ? Number(value) : NaN
  return clampUnit((Number.isFinite(percent) ? percent : fallback) / 100)
}

export type SlideTransitionMask = { kind: 'wipe' | 'iris-open' | 'iris-close'; band: number; angle?: number }

function maskFrontFrames(band: number, inward = false): Keyframe[] {
  const positions = [`${-band}%`, '100%']
  return (inward ? positions.reverse() : positions).map((position) => ({ '--presentation-mask-front': position }))
}

export function wipeMaskFrames(x: number, y: number, { width, height }: SlideTransitionSize, softness: number) {
  // In normalized slide coordinates a diagonal is halfway between the two edge distances.
  const angle = Math.atan2(x / width, -y / height) * 180 / Math.PI
  const band = softness * 200
  const mask: SlideTransitionMask = { kind: 'wipe', band, angle }
  return { mask, incoming: maskFrontFrames(band) }
}

export function irisMaskFrames(softness: number, inward: boolean) {
  const band = softness * 200 / Math.SQRT1_2
  const mask: SlideTransitionMask = { kind: inward ? 'iris-close' : 'iris-open', band }
  return inward ? { mask, outgoing: maskFrontFrames(band, true), exitOnTop: true as const }
    : { mask, incoming: maskFrontFrames(band) }
}

export function cubeFrames(direction: number, size: SlideTransitionSize, retreat: number) {
  const horizontal = direction < 2
  const dimension = horizontal ? size.width : size.height
  const axis = horizontal ? 'Y' : 'X'
  const degrees = direction % 2 === 0 ? -90 : 90
  const half = dimension / 2
  const perspective = dimension * 1.8
  const frame = (angle: number, offset: number): Keyframe => {
    const z = point(half + Math.sin(offset * Math.PI) * retreat * half)
    return { offset, transform: `perspective(${perspective}px) translateZ(${-z}px) rotate${axis}(${angle}deg) translateZ(${half}px)`,
      backfaceVisibility: 'hidden' }
  }
  return {
    incoming: [frame(-degrees, 0), frame(-degrees / 2, .5), frame(0, 1)],
    outgoing: [frame(0, 0), frame(degrees / 2, .5), frame(degrees, 1)],
  }
}

export function pageFlipFrames(direction: number, size: SlideTransitionSize, transparency: number, fade: boolean): Keyframe[] {
  const left = direction === 0
  const sign = left ? -1 : 1
  const pivot = left ? 'left center' : 'right center'
  const perspective = size.width * 1.6
  const frame = (offset: number, angle: number, lift: number): Keyframe => {
    // Keep a beveled corner on the turning snapshot while exposing the new page beneath it.
    const shape = left ? `polygon(0 0, ${100 - lift}% 0, 100% ${lift}%, 100% 100%, 0 100%)`
      : `polygon(${lift}% 0, 100% 0, 100% 100%, 0 100%, 0 ${lift}%)`
    return { offset, transform: `perspective(${perspective}px) rotateY(${sign * angle}deg)`, transformOrigin: pivot,
      clipPath: shape, opacity: (1 - Math.sin(offset * Math.PI) * transparency) * (fade ? 1 - offset : 1),
      backfaceVisibility: 'hidden' }
  }
  return [frame(0, 0, 0), frame(.32, 18, 6), frame(.68, 58, 13), frame(1, 90, 18)]
}

export function hexTileFrames({ width, height }: SlideTransitionSize): Keyframe[] {
  const radius = Math.max(height / 12, width / 24)
  const rowHeight = Math.sqrt(3) * radius
  const columns = Math.ceil(width / (1.5 * radius)) + 1
  const rows = Math.ceil(height / rowHeight) + 1
  const corners = [[1, 0], [.5, Math.sqrt(3) / 2], [-.5, Math.sqrt(3) / 2], [-1, 0],
    [-.5, -Math.sqrt(3) / 2], [.5, -Math.sqrt(3) / 2]]
  const tiles = Array.from({ length: columns * rows }, (_, i) => {
    const column = i % columns
    const row = Math.floor(i / columns)
    const x = column * radius * 1.5
    const y = (row - (column % 2) * .5) * rowHeight
    const variation = ((column * 13 + row * 29) % 17) / 17
    const start = clampUnit(.65 * (.6 * x / width + .4 * y / height) + variation * .08)
    return { x, y, start }
  })
  return Array.from({ length: 11 }, (_, step) => {
    const offset = step / 10
    // Each subpath keeps the same commands so the browser can interpolate it. The final overlap removes tile seams.
    const shape = tiles.map(({ x, y, start }) => {
      const growth = clampUnit((offset - start) / .23)
      const size = radius * growth * (offset > .9 ? 1.04 : .96)
      return corners.map(([dx, dy], index) => `${index ? 'L' : 'M'}${point(x + dx * size)} ${point(y + dy * size)}`).join(' ') + ' Z'
    }).join(' ')
    return { offset, clipPath: `path(nonzero, "${shape}")` }
  })
}
