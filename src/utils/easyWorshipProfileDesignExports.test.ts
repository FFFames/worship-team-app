/** Covers safe identity matches between the profile catalog and separately exported designs. */

import { describe, expect, it } from 'vitest'
import type { EasyWorshipDesignEntry, EasyWorshipDesignExportReview } from './easyWorshipDesigns'
import type { EasyWorshipProfileAssetSource } from './easyWorshipProfileFiles'
import { combineProfileDesignExports, withDesignExportMedia } from './easyWorshipProfileDesignExports'

const hash = 'b'.repeat(64)
const assetPath = '@easyworship-export-0:media/blue.png'
const warning = 'ไม่พบไฟล์ Blue.png ที่อ้างอิงจากเลย์เอาต์'
const frame = { x: 0, y: 0, width: 1, height: 1 }
const profileFile: EasyWorshipProfileAssetSource = {
  paths: new Map([['root/path.png', ['root/path.png']]]),
  read: async () => new Blob(['profile']), size: () => 7,
}

function entry(id = '1', sourcePath?: string, checksum?: string): EasyWorshipDesignEntry {
  return {
    title: 'Catalog title', kind: 'song-theme', layoutId: id, nativeRevision: 'native-revision',
    content: { source: { format: 'easyworship', uid: 'DESIGN-ID' }, warnings: [warning], slides: [{
      id: 'slide-native-id', label: 'Original slide title', design: { aspectRatio: 16 / 9, layers: [{
        id: `image-${id}`, kind: 'media', role: 'background', frame,
        asset: { kind: 'image', filename: 'Blue.png', ...(sourcePath ? { sourcePath } : {}), ...(checksum ? { easyWorshipFileHash: checksum } : {}) },
      }] },
    }] },
  }
}

function exports(entries: EasyWorshipDesignEntry[]): EasyWorshipDesignExportReview {
  const readAsset = async () => new Blob(['pack'])
  return { profiles: [], entries, warnings: [], packedMediaPaths: [assetPath],
    ownsAsset: (path) => path === assetPath, assetSize: () => 4, readAsset,
    withAsset: async (_path, consume) => consume(await readAsset()),
  }
}

describe('profile design exports', () => {
  it('uses checksum-only routing and augments a matching design without duplicating its catalog identity', async () => {
    const base = entry()
    const archive = { ...entry('22', assetPath, hash), exportId: 'standalone-id', exportFilename: 'Blue.ewtx', title: 'Export file title' }
    const pack = exports([archive])
    const source = withDesignExportMedia(profileFile, pack)
    expect(source.attachedMedia).toBeUndefined()
    expect(source.hashOnlyMedia).toEqual([assetPath])
    expect(source.paths.size).toBe(1)
    const result = combineProfileDesignExports({ profiles: [], warnings: [], entries: [base] }, pack, source)
    expect(result.entries?.map(({ title, layoutId, exportId, exportFilename }) => ({ title, layoutId, exportId, exportFilename })))
      .toEqual([{ title: base.title, layoutId: base.layoutId, exportId: undefined, exportFilename: 'Blue.ewtx' }])
    expect(result.entries?.[0].content.slides[0].design.layers).toMatchObject([
      { id: 'image-1', asset: { filename: 'Blue.png', easyWorshipFileHash: hash, sourcePath: assetPath } },
    ])
    expect(result.entries?.[0].content.warnings).toBeUndefined()
    expect(await result.withAsset?.(assetPath, (blob) => blob.text())).toBe('pack')
    expect(await (await result.readAsset?.('root/path.png'))?.text()).toBe('profile')
  })

  it('preserves conflicting references and treats a different revision as another design', () => {
    const saved = entry('1', undefined, 'c'.repeat(64))
    const same = { ...entry('22', assetPath, hash), exportFilename: 'Blue.ewtx', exportId: 'standalone-id' }
    const profile = { profiles: [], warnings: [], entries: [saved] }
    const merged = combineProfileDesignExports(profile, exports([same]), profileFile)
    expect(merged.entries?.[0].content).toBe(saved.content)
    expect(merged.entries).toHaveLength(1)
    const version = { ...same, nativeRevision: 'another-revision' }
    const separate = combineProfileDesignExports(profile, exports([version]), profileFile)
    expect(separate.entries?.[1]).toEqual(version)
    expect(separate.warnings[0]).toContain('เก็บเป็นรายการแยก')
  })
})
