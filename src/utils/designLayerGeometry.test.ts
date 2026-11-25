/** Covers portable mask validation and incremental recovery on existing slides. */

import { describe, expect, it } from 'vitest'
import type { DesignElementBorder, DesignLayer, SlideDesign } from '../types/slideDesign'
import { validDesignClipPaths, validDesignShapePaths } from './designClipPaths'
import { restoreDesignGeometry } from './designLayerGeometry'
import { shadeShapeFill } from './slideShapePaint'

const frame = { x: .1, y: .2, width: .7, height: .3 }
const triangle = 'M 0 0 L 1 0 L 0.5 1 Z'
const circle = 'M 1 0.5 A 0.5 0.5 0 0 1 0 0.5 A 0.5 0.5 0 0 1 1 0.5 Z'

describe('imported shape geometry', () => {
  it('preserves open strokes without admitting open masks or malformed path paint', () => {
    const line = 'M 0.1 0.5 L 0.9 0.5'
    expect(validDesignClipPaths([line])).toBe(false)
    expect(validDesignShapePaths([{ d: line, fill: 'none', stroke: true }])).toBe(true)
    expect(validDesignShapePaths([{ d: line + ' " />', fill: 'none', stroke: true }])).toBe(false)
    expect(validDesignShapePaths([{ d: line, fill: 'transparent', stroke: true }])).toBe(false)
    expect(validDesignShapePaths([{ d: line, fill: 'none', stroke: 1 }])).toBe(false)
    expect(shadeShapeFill({ type: 'solid', color: '#42bd3080' }, 'darken')).toEqual({ type: 'solid', color: '#35972680' })
  })

  it('recovers missing path paint only when the saved contour still matches', () => {
    const fill: DesignLayer = { id: 'shape', kind: 'fill', frame, fill: { type: 'solid', color: '#42bd30' }, clipPaths: [triangle] }
    const original: SlideDesign = { aspectRatio: 16 / 9, layers: [{
      ...fill, shapePaths: [
        { d: triangle, fill: 'darken', stroke: false },
        { d: 'M 0.3 0.4 L 0.7 0.4', fill: 'none', stroke: true },
      ],
    }] }
    const result = restoreDesignGeometry({ ...original, layers: [fill] }, original)
    expect(result?.masks).toBe(1)
    expect(result?.design).toEqual(original)
    expect(restoreDesignGeometry(original, original)).toBeUndefined()
    expect(restoreDesignGeometry({ ...original, layers: [{ ...fill, clipPaths: [circle] }] }, original)).toBeUndefined()
  })

  it('accepts closed contours and rejects unsafe or oversized path data', () => {
    expect(validDesignClipPaths([triangle, circle])).toBe(true)
    expect(validDesignClipPaths(['M 0 0 Q 0.25 0 0.5 0.5 C 0.7 0 0.8 1 1 1 L 0 1 Z'])).toBe(true)
    expect(validDesignClipPaths(['M 0 0 L 0 1'])).toBe(false)
    expect(validDesignClipPaths(['M 0 0 A 0.5 0.5 0 0 2 1 1 Z'])).toBe(false)
    expect(validDesignClipPaths(['M 0 0 L 1000 1 Z'])).toBe(false)
    expect(validDesignClipPaths(['M 0 0 L 1 -Infinity Z'])).toBe(false)
    expect(validDesignClipPaths(['" /><image href="https://example.test/image.png">'])).toBe(false)
    expect(validDesignClipPaths(Array(17).fill(triangle))).toBe(false)
  })

  it('fills missing geometry without changing a locally replaced mask, media file or frame', () => {
    const text: DesignLayer = { id: 'title', kind: 'text', text: 'แก้หัวเรื่องแล้ว', frame, rotation: 0 }
    const fill: DesignLayer = { id: 'fill', kind: 'fill', frame, clipPaths: [triangle], fill: { type: 'solid', color: '#fff' } }
    const media: DesignLayer = { id: 'media', kind: 'media', frame, asset: { kind: 'image', filename: 'local.png' } }
    const moved: DesignLayer = { ...text, id: 'moved', frame: { ...frame, x: .3 } }
    const saved: SlideDesign = { aspectRatio: 16 / 9, layers: [text, fill, media, moved] }
    const source: SlideDesign = { aspectRatio: 16 / 9, layers: [
      { ...text, text: 'Original', rotation: -35, clipPaths: [circle] },
      { ...fill, rotation: -35, clipPaths: [circle] },
      { ...media, asset: { kind: 'image', filename: 'source.png' }, clipPaths: [circle] },
      { ...moved, frame, clipPaths: [circle] },
    ] }
    const result = restoreDesignGeometry(saved, source)
    expect(result?.rotations).toBe(1)
    expect(result?.masks).toBe(1)
    expect(result?.design.layers).toEqual([{ ...text, clipPaths: [circle] }, { ...fill, rotation: -35 }, media, moved])
    expect(restoreDesignGeometry(result?.design, source)).toBeUndefined()
  })

  it('restores a line-only frame in source order and keeps a local disabled border', () => {
    const border: DesignElementBorder = { color: '#ee9900', opacity: .67, width: .01, position: 'inner', join: 'round' }
    const text: DesignLayer = { id: 'title', kind: 'text', frame, text: 'ข้อความแก้แล้ว', elementBorder: false }
    const image: DesignLayer = { id: 'image', kind: 'media', frame, asset: { kind: 'image', filename: 'banner.png' } }
    const line: DesignLayer = { id: 'native-border:42', kind: 'fill', frame, role: 'foreground',
      fill: { type: 'solid', color: 'transparent' }, elementBorder: border }
    const saved: SlideDesign = { aspectRatio: 16 / 9, layers: [text, image] }
    const original: SlideDesign = { ...saved, layers: [{ ...text, elementBorder: border }, line, { ...image, elementBorder: border }] }
    const restored = restoreDesignGeometry(saved, original)
    expect(restored?.borders).toBe(2)
    expect(restored?.design.layers).toEqual([text, line, { ...image, elementBorder: border }])
    expect(restoreDesignGeometry(restored?.design, original)).toBeUndefined()
    const reordered = restoreDesignGeometry({ ...saved, layers: [image, text] }, original)
    expect(reordered?.design.layers).toEqual([{ ...image, elementBorder: border }, text])
  })

  it('restores a missing element shadow while keeping a saved disable and a moved frame', () => {
    const title: DesignLayer = { id: '20-foreground', kind: 'text', text: 'หัวเรื่องที่แก้แล้ว', frame }
    const disabled: DesignLayer = { ...title, id: '30-foreground', elementShadow: false }
    const moved: DesignLayer = { ...title, id: '40-foreground', frame: { ...frame, x: .4 } }
    const saved: SlideDesign = { aspectRatio: 16 / 9, layers: [title, disabled, moved] }
    const shadow = { group: '20', color: '#000000', opacity: .9, blur: .02, offset: .01, angle: 315 }
    const source: SlideDesign = { ...saved, layers: [
      { ...title, text: 'Original', elementShadow: shadow },
      { ...disabled, elementShadow: { ...shadow, group: '30' } },
      { ...moved, frame, elementShadow: { ...shadow, group: '40' } },
    ] }
    const restored = restoreDesignGeometry(saved, source)
    expect(restored?.shadows).toBe(1)
    expect(restored?.design.layers).toEqual([{ ...title, elementShadow: shadow }, disabled, moved])
    expect(restoreDesignGeometry(restored?.design, source)).toBeUndefined()
  })
})
