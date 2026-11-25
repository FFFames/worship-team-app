import { describe, expect, it } from 'vitest'
import type { DesignContent } from '../types/slideDesign'
import { upgradeLegacyChecksumLayout } from './easyWorshipLegacyLayoutUpgrade'

const hash = 'a'.repeat(64)
const frame = { x: 0, y: 0, width: 1, height: 1 }
const legacy: DesignContent = {
  source: { format: 'easyworship', uid: 'native-id' },
  slides: [{
    id: 'slide-id', label: 'Local label',
    design: { aspectRatio: 16 / 9, layers: [{ id: 'media-id', kind: 'media', frame, asset: { kind: 'image', filename: 'Photo.jpg' } }] },
  }],
  warnings: ['ไม่พบไฟล์ Photo.jpg ที่อ้างอิงจากเลย์เอาต์'],
}

function source(checksum = hash): DesignContent {
  return {
    ...legacy, warnings: undefined,
    slides: [{
      id: 'slide-id', label: 'Original label',
      design: { aspectRatio: 16 / 9, layers: [{
        id: 'media-id', kind: 'media', frame,
        asset: { kind: 'image', filename: 'Photo.jpg', libraryId: 'verified-image', easyWorshipFileHash: checksum },
      }] },
    }],
  }
}

describe('upgradeLegacyChecksumLayout', () => {
  it('binds an unchanged native layout to its checksum import and repairs its missing image', () => {
    const restored = upgradeLegacyChecksumLayout(legacy, source(), 'checksum-import')
    expect(restored).toMatchObject({ easyWorshipChecksumImportId: 'checksum-import', slides: [{
      label: 'Local label', design: { layers: [{ asset: { libraryId: 'verified-image', easyWorshipFileHash: hash } }] },
    }] })
    expect(restored?.warnings).toBeUndefined()
    expect(upgradeLegacyChecksumLayout(restored!, source(), 'checksum-import')).toBe(restored)
    expect(upgradeLegacyChecksumLayout(restored!, source('b'.repeat(64)), 'different-checksum-import')).toBeUndefined()
  })

  it('requires evidence before adopting an old row with a different slide or an assigned image', () => {
    const edited = structuredClone(legacy)
    const layer = edited.slides[0].design.layers[0]
    if (layer.kind !== 'media') throw new Error('Expected the media fixture layer')
    layer.asset.libraryId = 'edited-or-different-image'
    expect(upgradeLegacyChecksumLayout(edited, source(), 'checksum-import')).toBeUndefined()
    delete layer.asset.libraryId
    layer.frame.x = .1
    expect(upgradeLegacyChecksumLayout(edited, source(), 'checksum-import')).toBeUndefined()
  })

  it('adds a catalog checksum to a layout that already has an independently verified layer', () => {
    const saved = structuredClone(legacy)
    const incoming = source()
    const independentlyVerified = {
      id: 'verified', kind: 'media' as const, frame,
      asset: { kind: 'image' as const, filename: 'Graphic.png', easyWorshipFileHash: 'b'.repeat(64), libraryId: 'verified-graphic' },
    }
    saved.easyWorshipChecksumImportId = 'earlier-checksum-import'
    saved.slides[0].design.layers.push(independentlyVerified)
    incoming.slides[0].design.layers.push(independentlyVerified)
    const upgraded = upgradeLegacyChecksumLayout(saved, incoming, 'expanded-checksum-import')
    expect(upgraded).toMatchObject({ easyWorshipChecksumImportId: 'expanded-checksum-import', slides: [{
      label: 'Local label', design: { layers: [{ asset: { libraryId: 'verified-image', easyWorshipFileHash: hash } }, independentlyVerified] },
    }] })
    incoming.slides[0].design.layers[1] = { ...independentlyVerified, asset: { ...independentlyVerified.asset, easyWorshipFileHash: 'c'.repeat(64) } }
    expect(upgradeLegacyChecksumLayout(saved, incoming, 'another-checksum-import')).toBeUndefined()
  })
})
