import { describe, expect, it } from 'vitest'
import type { DesignLayer, SlideDesign } from '../types/slideDesign'
import { validDesignClipPaths, validDesignShapePaths } from './designClipPaths'
import { restoreDesignGeometry } from './designLayerGeometry'
import { changeElementShape, editShapeCaption, moveLayerFrame, moveSlideElement, replacePositionedLayer } from './slideElementEffects'
import { isSlideShapePreset, newSlideShape, revealSlideShape, shapePresets, withShapePreset } from './slideShapePresets'

describe('authored slide shapes', () => {
  it('produces bounded paths at adjustment extremes without changing the stored geometry', () => {
    for (const preset of Object.keys(shapePresets).filter(isSlideShapePreset)) {
      const layer = newSlideShape(preset)
      expect(layer.clipPaths).toBeUndefined()
      for (const adjustment of [0, .5, 1]) {
        const resolved = revealSlideShape({ ...layer, presetShape: { preset, adjustment } }, 16 / 9)
        if (preset === 'line') {
          expect(validDesignShapePaths(resolved.shapePaths)).toBe(true)
          expect(resolved.elementBorder).toBeTruthy()
        } else if (preset !== 'rectangle' && (preset !== 'roundRect' || adjustment > 0)) {
          expect(validDesignClipPaths(resolved.clipPaths)).toBe(true)
        }
      }
    }
  })

  it('moves, rotates and reorders a caption with the artwork that holds it', () => {
    const shape = newSlideShape('star')
    const base: DesignLayer = { id: 'background', frame: { x: 0, y: 0, width: 1, height: 1 },
      kind: 'fill', fill: { type: 'solid', color: '#222222' } }
    const neighbor: DesignLayer = { id: 'label', frame: shape.frame, kind: 'text', text: 'Separate' }
    const layers = editShapeCaption([base, shape, neighbor], shape, 'Caption')
    const frame = { ...shape.frame, x: .2, y: .3, width: .6 }
    const moved = moveLayerFrame(layers, shape.id + ':text', frame)
    const rotated = replacePositionedLayer(moved, { ...shape, frame, rotation: 25 })
    const changed = changeElementShape(rotated, shape.id, { preset: 'roundRect', adjustment: .2 })
    expect(changed.slice(1, 3)).toMatchObject([
      { frame, rotation: 25, presetShape: { preset: 'roundRect', adjustment: .2 } },
      { frame, rotation: 25, presetShape: { preset: 'roundRect', adjustment: .2 } },
    ])
    expect(moveSlideElement(changed, shape.id + ':text', 1).map(({ id }) => id)).toEqual([base.id, neighbor.id, shape.id, shape.id + ':text'])
    expect(moveSlideElement(changed, shape.id, -1)).toBe(changed)
  })

  it('retains the local choice when the original outline is available again', () => {
    const native = newSlideShape('star')
    const previous = { ...native, presetShape: { preset: 'rectangle' as const } }
    const source: SlideDesign = { aspectRatio: 16 / 9, layers: [{ ...native, presetShape: undefined, clipPaths: ['M 0 0 L 1 0 L 0.5 1 Z'] }] }
    const restored = restoreDesignGeometry({ ...source, layers: [previous] }, source)
    expect(restored?.masks).toBe(1)
    const layer = restored!.design.layers[0]
    expect(layer.presetShape).toEqual(previous.presetShape)
    expect(revealSlideShape(layer, 16 / 9).clipPaths).toBeUndefined()
    expect(revealSlideShape(withShapePreset(layer, undefined), 16 / 9).clipPaths).toEqual(source.layers[0].clipPaths)
  })
})
