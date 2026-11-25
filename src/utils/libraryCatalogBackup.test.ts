/** Regression coverage for full-backup row identity and media validation. */

import { describe, expect, it } from 'vitest'
import { getCatalogDescriptor, missingCatalogMedia, parseLibraryCatalog } from './libraryCatalogBackup'
import { parseMediaLibraryPackage } from './mediaLibraryPackageManifest'

const id = (suffix: string) => `00000000-0000-4000-8000-0000000000${suffix}`
const songId = id('01')
const playlistId = id('02')
const entryId = id('03')
const assetId = id('04')
const created_at = '2026-11-23T10:00:00Z'
const cue = { kind: 'song', label: 'ซ้อมเพลง', slides: [{ label: 'ท่อนหนึ่ง', lines: ['เสียงเรา'],
  assets: [{ kind: 'audio', filename: 'bed.wav', archivePath: 'Audio/bed.wav' }] }] }
const data = {
  songs: [{ id: songId, title: 'เพลงทีม', original_key: 'C', raw_content: 'C\nเสียงเรา', sections: null, tags: null, favorite: true, easyworship_uid: 'pci-fixture',
    user_id: 'old-project-only', created_at, updated_at: created_at }],
  playlists: [{ id: playlistId, name: 'ตารางวันอาทิตย์', created_at, updated_at: created_at }],
  entries: [{ id: entryId, playlist_id: playlistId, song_id: songId, order: 1, transpose: 3, created_at, cue,
    background_asset: { kind: 'image', filename: 'background.png', libraryId: assetId, role: 'background' } }],
  designs: [], backgrounds: [],
}

describe('full library backups', () => {
  it('retains source IDs, removes non-catalog columns, and checks schedule and library media independently', () => {
    const catalog = parseLibraryCatalog(data)
    expect(catalog.songs[0]).toMatchObject({ id: songId, created_at, favorite: true, easyworship_uid: 'pci-fixture' })
    expect(catalog.songs[0]).not.toHaveProperty('user_id')
    expect(catalog.entries[0]).toMatchObject({ id: entryId, song_id: songId, playlist_id: playlistId, cue })
    expect(missingCatalogMedia(catalog, new Set([assetId]), new Set())).toEqual(['bed.wav'])
    expect(missingCatalogMedia(catalog, new Set(), new Set([`${playlistId}\0Audio/bed.wav`]))).toEqual(['background.png'])
    expect(missingCatalogMedia(catalog, new Set([assetId]), new Set([`${playlistId}\0Audio/bed.wav`]))).toEqual([])
    const recovered = structuredClone(catalog)
    recovered.entries[0].cue!.slides[0].assets![0].libraryId = id('05')
    expect(missingCatalogMedia(recovered, new Set([assetId]), new Set([`${playlistId}\0Audio/bed.wav`]))).toEqual([])
    expect(missingCatalogMedia(recovered, new Set([assetId, id('05')]), new Set())).toEqual([])
  })

  it('rejects duplicate IDs, dangling links, invalid archive paths and mismatched declared counts', () => {
    expect(() => parseLibraryCatalog({ ...data, songs: [...data.songs, ...data.songs] })).toThrow(/songs/)
    expect(() => parseLibraryCatalog({ ...data, songs: [] })).toThrow(/อ้างถึงเพลง/)
    const entry = { ...data.entries[0], cue: { ...cue, slides: [{ ...cue.slides[0], assets: [{ ...cue.slides[0].assets[0], archivePath: '../bed.wav' }] }] } }
    expect(() => parseLibraryCatalog({ ...data, entries: [entry] })).toThrow(/entries/)
    const descriptor = getCatalogDescriptor(parseLibraryCatalog(data), 1500, [])
    expect(() => parseLibraryCatalog(data, { ...descriptor, entries: 2 })).toThrow(/จำนวนรายการ/)
  })

  it('checks media assigned through reusable and occurrence song layouts', () => {
    const songLayout = { background: { kind: 'media', asset: { kind: 'image', filename: 'master.png', libraryId: id('05') } },
      artwork: { changes: [{ action: 'add', layer: { id: 'logo', kind: 'media', frame: { x: .8, y: .1, width: .2, height: .2 },
        asset: { kind: 'image', filename: 'logo.png', libraryId: id('07') } } }] } }
    const cueLayout = { background: { kind: 'media', asset: { kind: 'image', filename: 'slide.png', libraryId: id('06') } } }
    const snapshot = {
      ...data, songs: [{ ...data.songs[0], appearance: { slideLayout: songLayout } }],
      entries: [{ ...data.entries[0], cue: { ...cue, slides: [{ ...cue.slides[0], slideLayout: cueLayout }] } }],
    }
    const catalog = parseLibraryCatalog(snapshot)
    expect(catalog.songs[0].appearance?.slideLayout).toEqual(songLayout)
    expect(missingCatalogMedia(catalog, new Set([assetId]), new Set([`${playlistId}\0Audio/bed.wav`]))).toEqual(['logo.png', 'master.png', 'slide.png'])
  })

  it('requires the catalog descriptor for version 11 and continues opening earlier media-only packages', () => {
    const base = { format: 'worshipteam.media-library', items: [], assets: [], feeds: [], dvds: [], replacements: [], collectionSets: [], scheduleAssets: [] }
    const later = { ...base, version: 11, scriptureEditions: [], alertTemplates: [], songHistories: [], defaultThemes: {}, presentationControls: {}, outputAppearance: {} }
    expect(parseMediaLibraryPackage({ ...base, version: 1 }).catalog).toBeUndefined()
    expect(() => parseMediaLibraryPackage(later)).toThrow(/ฐานข้อมูล/)
    expect(parseMediaLibraryPackage({ ...later, catalog: getCatalogDescriptor(parseLibraryCatalog(data), 1500, []) })).toMatchObject({ version: 11, catalog: { songs: 1 } })
  })
})
