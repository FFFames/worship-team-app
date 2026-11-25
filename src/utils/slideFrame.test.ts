/** Covers resize geometry and editable bounds on non-square slides. */

import { describe, expect, it } from 'vitest'
import { adjustSlideFrame, slideFrameCorner, visibleSlideFrame } from './slideFrame'

describe('slide frame editing', () => {
  const frame = { x: .2, y: .25, width: .2, height: .3 }
  const viewport = { width: 1600, height: 900 }

  it('expresses a drag in slide-relative coordinates and keeps the existing frame on a click', () => {
    expect(adjustSlideFrame(frame, 'move', { x: 0, y: 0 }, viewport)).toBe(frame)
    expect(adjustSlideFrame(frame, 'move', { x: 160, y: -90 }, viewport)).toMatchObject({
      x: expect.closeTo(.3), y: expect.closeTo(.15), width: .2, height: .3,
    })
    expect(visibleSlideFrame({ x: -3, y: 2, width: Infinity, height: 3 })).toEqual({ x: -1, y: 1, width: 1, height: 2 })
  })

  it('keeps the opposite corner fixed when resizing a rotated layer', () => {
    const aspect = viewport.width / viewport.height
    const anchor = slideFrameCorner(frame, aspect, 240)
    const next = adjustSlideFrame(frame, 'resize', { x: -40, y: 110 }, viewport, 60)
    expect(next.width).toBeGreaterThan(frame.width)
    const nextAnchor = slideFrameCorner(next, aspect, 240)
    expect(nextAnchor.x).toBeCloseTo(anchor.x)
    expect(nextAnchor.y).toBeCloseTo(anchor.y)
    expect(adjustSlideFrame(frame, 'resize', { x: -500, y: -500 }, viewport)).toEqual({ ...frame, width: .01, height: .01 })
  })
})
