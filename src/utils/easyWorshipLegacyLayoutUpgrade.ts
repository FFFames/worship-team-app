/** Recognizes a previously imported EasyWorship layout before binding its checksums. */

import type { DesignAsset, DesignContent, DesignSoundtrack } from '../types/slideDesign'
import { backfillImportedLayoutDetails, easyWorshipDesignIdentityContent } from './slideDesignAssets'
import { MISSING_VERIFIED_LAYOUT_MEDIA } from './slideDesign'

export function hasEasyWorshipLayoutChecksums(content: DesignContent) {
  return content.source?.format === 'easyworship' && content.slides.some(({ design }) =>
    design.layers.some((layer) => layer.kind === 'media' && layer.asset.easyWorshipFileHash)
    || design.soundtracks?.some((track) => track.easyWorshipFileHash))
}

function comparable(content: DesignContent) {
  const { warnings: _warnings, slides, ...identity } = easyWorshipDesignIdentityContent(content)
  return JSON.stringify({ ...identity, slides: slides.map(({ label: _label, ...slide }) => slide) }, (_, value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
  })
}

function checksumAsset<T extends DesignAsset | DesignSoundtrack>(saved: T, source: T | undefined) {
  const hash = source?.easyWorshipFileHash
  if (!hash || saved.easyWorshipFileHash || saved.kind !== source?.kind || saved.filename !== source.filename
    || saved.sourcePath || saved.archivePath
    || (saved.libraryId && saved.libraryId !== source.libraryId)) return saved
  return { ...saved, easyWorshipFileHash: hash }
}

export function upgradeLegacyChecksumLayout(saved: DesignContent, source: DesignContent, importId: string): DesignContent | undefined {
  if (!hasEasyWorshipLayoutChecksums(source) || saved.source?.format !== 'easyworship' || saved.source.uid !== source.source?.uid) return
  if (saved.easyWorshipChecksumImportId === importId) return backfillImportedLayoutDetails(saved, source)

  const migratedWarnings = new Map<string, string>()
  const slides = saved.slides.map((slide) => {
    const incoming = source.slides.find(({ id }) => id === slide.id)
    if (!incoming) return slide
    const layers = slide.design.layers.map((layer) => {
      if (layer.kind !== 'media') return layer
      const next = incoming.design.layers.find(({ id }) => id === layer.id)
      const asset = checksumAsset(layer.asset, next?.kind === 'media' ? next.asset : undefined)
      if (asset === layer.asset) return layer
      migratedWarnings.set(`ไม่พบไฟล์ ${asset.filename} ที่อ้างอิงจากเลย์เอาต์`, MISSING_VERIFIED_LAYOUT_MEDIA + asset.filename)
      return { ...layer, asset }
    })
    const soundtracks = slide.design.soundtracks?.map((track, index) => {
      const next = incoming.design.soundtracks?.[index]
      const asset = checksumAsset(track, next?.role === track.role ? next : undefined)
      if (asset !== track) migratedWarnings.set(`ไม่พบไฟล์เสียง ${asset.filename} ที่อ้างอิงจากเลย์เอาต์`, MISSING_VERIFIED_LAYOUT_MEDIA + asset.filename)
      return asset
    })
    return { ...slide, design: { ...slide.design, layers, ...(soundtracks ? { soundtracks } : {}) } }
  })
  const withChecksums = { ...saved, slides }
  if (!migratedWarnings.size || comparable(withChecksums) !== comparable(source)) return
  const warnings = saved.warnings?.map((warning) => migratedWarnings.get(warning) ?? warning)
  return backfillImportedLayoutDetails({
    ...withChecksums, ...(warnings ? { warnings } : {}), easyWorshipChecksumImportId: importId,
  }, source)
}
