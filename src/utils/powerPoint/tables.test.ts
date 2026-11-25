import { describe, expect, it } from 'vitest'
import type { DesignLayer, SlideDesign } from '../../types/slideDesign'
import { restorePowerPointTableLayers, withoutPowerPointTableLayers } from './layoutReplacement'

const frame = { x: 0, y: 0, width: 1, height: 1 }
const background: DesignLayer = { kind: 'fill', id: 'slide:background', frame, fill: { type: 'solid', color: '#ffffff' } }
const cell: DesignLayer = { kind: 'text', id: 'slide:2:table:0:0:text', frame, text: 'ตาราง' }
const caption: DesignLayer = { kind: 'text', id: 'slide:3:text', frame, text: 'Source caption' }
const incoming: SlideDesign = { aspectRatio: 16 / 9, layers: [background, cell, caption], powerPointTablesImported: true }

describe('PowerPoint table recovery', () => {
  it('restores a table at its source layer position and preserves a local edit', () => {
    const edited = { ...caption, text: 'Local caption' }
    const prior: SlideDesign = { aspectRatio: 16 / 9, layers: [background, edited] }
    const restored = restorePowerPointTableLayers(prior, incoming)
    expect(restored.layers).toEqual([background, cell, edited])
    expect(withoutPowerPointTableLayers(restored)).toEqual(prior)
  })

  it('preserves a previously edited table and a slide already rendered to a still', () => {
    const removed = { ...incoming, layers: [background, caption] }
    const rendered = { ...removed, powerPointTablesImported: undefined, powerPointLayoutBeforeRendering: 'prior-render' }
    expect(restorePowerPointTableLayers(removed, incoming)).toBe(removed)
    expect(restorePowerPointTableLayers(rendered, incoming)).toBe(rendered)
  })
})
