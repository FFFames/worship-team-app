/** Keeps slide rendering and direct frame editing on the same normalized coordinates. */

import type { DesignFrame } from '../types/slideDesign'

const bound = (value: number, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

export function slideAspectRatio(aspectRatio: number) {
  return bound(aspectRatio, .25, 4, 16 / 9)
}

export function slideRotation(rotation?: number) {
  return bound(rotation ?? 0, -360, 360, 0)
}

export function visibleSlideFrame(frame: DesignFrame): DesignFrame {
  return {
    x: bound(frame.x, -1, 1, 0), y: bound(frame.y, -1, 1, 0),
    width: bound(frame.width, 0, 2, 1), height: bound(frame.height, 0, 2, 1),
  }
}

export function slideFrameCorner(frame: DesignFrame, aspect: number, rotation: number) {
  const radians = rotation * Math.PI / 180
  const w = frame.width * aspect / 2
  const h = frame.height / 2
  return {
    x: frame.x + frame.width / 2 + (w * Math.cos(radians) - h * Math.sin(radians)) / aspect,
    y: frame.y + frame.height / 2 + w * Math.sin(radians) + h * Math.cos(radians),
  }
}

export function adjustSlideFrame(frame: DesignFrame, mode: 'move' | 'resize', delta: { x: number; y: number },
  size: { width: number; height: number }, rotation = 0): DesignFrame {
  const { x, y, width, height } = visibleSlideFrame(frame)
  if (!size.width || !size.height || (!delta.x && !delta.y)) return frame
  if (mode === 'move') return visibleSlideFrame({ x: x + delta.x / size.width, y: y + delta.y / size.height, width, height })

  const radians = slideRotation(rotation) * Math.PI / 180
  const cos = Math.cos(radians), sin = Math.sin(radians)
  const newWidth = bound(width + (delta.x * cos + delta.y * sin) / size.width, .01, 2, width)
  const newHeight = bound(height + (-delta.x * sin + delta.y * cos) / size.height, .01, 2, height)
  const dw = (newWidth - width) * size.width / 2
  const dh = (newHeight - height) * size.height / 2
  // Moving the center with the rotated corner keeps the opposite corner fixed.
  return visibleSlideFrame({ x: x + (dw * cos - dh * sin - dw) / size.width,
    y: y + (dw * sin + dh * cos - dh) / size.height, width: newWidth, height: newHeight })
}
