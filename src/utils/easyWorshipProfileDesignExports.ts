/** Routes verified packed media and combines matching profile and exported layouts. */

import type { DesignAsset, DesignFrame, DesignLayer, DesignSoundtrack } from '../types/slideDesign'
import type { EasyWorshipDesignEntry, EasyWorshipDesignExportReview, EasyWorshipDesignReview } from './easyWorshipDesigns'
import { withProfileMedia, type EasyWorshipProfileAssetSource } from './easyWorshipProfileFiles'
import { MISSING_MASTER_BACKGROUND, MISSING_VERIFIED_LAYOUT_MEDIA } from './slideDesign'

export function withDesignExportMedia(source: EasyWorshipProfileAssetSource, exports: EasyWorshipDesignExportReview) {
  const hashOnlyMedia = [...(source.hashOnlyMedia ?? []), ...exports.packedMediaPaths]
  const scoped: EasyWorshipProfileAssetSource = {
    ...source,
    hashOnlyMedia,
    read: (path, notice) => exports.ownsAsset(path) ? exports.readAsset(path) : source.read(path, notice),
    size: (path) => exports.ownsAsset(path) ? exports.assetSize(path) : source.size(path),
    withMedia: (path, consume) => exports.ownsAsset(path) ? exports.withAsset(path, consume) : withProfileMedia(source, path, consume),
  }
  return scoped
}

const normalized = (value?: string) => value?.normalize('NFC').trim().toLowerCase()

function nativeDesignKey(entry: EasyWorshipDesignEntry) {
  const source = entry.content.source
  const uid = source?.format === 'easyworship' && normalized(source.uid)
  return uid ? JSON.stringify([entry.kind, uid]) : undefined
}

function sameRevisionAndSlides(profile: EasyWorshipDesignEntry, exported: EasyWorshipDesignEntry) {
  const before = normalized(profile.nativeRevision)
  const after = normalized(exported.nativeRevision)
  if (before && after && before !== after) return false
  const source = new Set(exported.content.slides.map(({ id }) => id))
  const saved = new Set(profile.content.slides.map(({ id }) => id))
  return source.size > 0 && source.size === exported.content.slides.length && saved.size === profile.content.slides.length
    && saved.size === source.size && [...saved].every((id) => source.has(id))
}

function sameFrame(left: DesignFrame, right: DesignFrame) {
  return Math.abs(left.x - right.x) < 0.000001 && Math.abs(left.y - right.y) < 0.000001
    && Math.abs(left.width - right.width) < 0.000001 && Math.abs(left.height - right.height) < 0.000001
}

type MediaLayer = Extract<DesignLayer, { kind: 'media' }>
function isMediaLayer(layer: DesignLayer): layer is MediaLayer {
  return layer.kind === 'media' && !layer.asset.dvd
}

/** Older profiles can omit the hash. Bind it only to a uniquely matching layer of the same native design. */
function recoverDesignReferences(profile: EasyWorshipDesignEntry, exported: EasyWorshipDesignEntry) {
  const incomingSlides = new Map(exported.content.slides.map((slide) => [slide.id, slide]))
  const restoredWarnings = new Set<string>()
  function takeAsset<T extends DesignAsset | DesignSoundtrack>(saved: T, candidates: readonly T[]) {
    if (saved.sourcePath || saved.libraryId || saved.archivePath || saved.easyWorshipFileHash) return saved
    const matches = candidates.filter((asset) => asset.kind === saved.kind && normalized(asset.filename) === normalized(saved.filename)
      && asset.sourcePath && asset.easyWorshipFileHash)
    if (matches.length !== 1) return saved
    const { sourcePath, easyWorshipFileHash } = matches[0]
    return { ...saved, sourcePath, easyWorshipFileHash }
  }
  const slides = profile.content.slides.map((slide) => {
    const source = incomingSlides.get(slide.id)?.design
    if (!source) return slide
    const providedLayers = source.layers.filter(isMediaLayer)
    const layers = slide.design.layers.map((layer) => {
      if (!isMediaLayer(layer)) return layer
      const asset = takeAsset(layer.asset, providedLayers
        .filter((item) => item.role === layer.role && sameFrame(item.frame, layer.frame)).map(({ asset }) => asset))
      if (asset === layer.asset) return layer
      restoredWarnings.add(layer.inheritedFromMaster ? MISSING_MASTER_BACKGROUND + asset.filename
        : `ไม่พบไฟล์ ${asset.filename} ที่อ้างอิงจากเลย์เอาต์`)
      return { ...layer, asset }
    })
    const soundtracks = slide.design.soundtracks?.map((track) => {
      const asset = takeAsset(track, source.soundtracks?.filter(({ role }) => role === track.role) ?? [])
      if (asset !== track) restoredWarnings.add(`ไม่พบไฟล์เสียง ${asset.filename} ที่อ้างอิงจากเลย์เอาต์`)
      return asset
    })
    return { ...slide, design: { ...slide.design, layers, ...(soundtracks ? { soundtracks } : {}) } }
  })
  if (!restoredWarnings.size) return profile.content
  // Keep a warning if another frame with the same label still needs the file.
  const missing = new Set(slides.flatMap(({ design }) => [
    ...design.layers.filter(isMediaLayer).map(({ asset }) => asset), ...(design.soundtracks ?? []),
  ]).filter((asset) => !asset.sourcePath && !asset.libraryId && !asset.archivePath).flatMap(({ filename }) =>
    [MISSING_VERIFIED_LAYOUT_MEDIA + filename, MISSING_MASTER_BACKGROUND + filename,
      `ไม่พบไฟล์ ${filename} ที่อ้างอิงจากเลย์เอาต์`, `ไม่พบไฟล์เสียง ${filename} ที่อ้างอิงจากเลย์เอาต์`]))
  const warnings = profile.content.warnings?.filter((warning) => !restoredWarnings.has(warning) || missing.has(warning))
  const { warnings: _warnings, ...content } = profile.content
  return { ...content, slides, ...(warnings?.length ? { warnings } : {}) }
}

export function combineProfileDesignExports(
  profile: EasyWorshipDesignReview | undefined, exports: EasyWorshipDesignExportReview, source: EasyWorshipProfileAssetSource,
): EasyWorshipDesignReview {
  const entries = [...(profile?.entries ?? [])]
  const byUid = new Map<string, number[]>()
  for (const [index, entry] of entries.entries()) {
    const key = nativeDesignKey(entry)
    if (key) byUid.set(key, [...(byUid.get(key) ?? []), index])
  }
  const warnings = [...(profile?.warnings ?? []), ...exports.warnings]
  const exportCounts = new Map<string, number>()
  for (const { exportId } of exports.entries ?? []) {
    if (exportId) exportCounts.set(exportId, (exportCounts.get(exportId) ?? 0) + 1)
  }
  for (const entry of exports.entries ?? []) {
    const uid = nativeDesignKey(entry)
    const candidates = uid ? byUid.get(uid) ?? [] : []
    const matches = candidates.filter((index) => sameRevisionAndSlides(entries[index], entry))
    if (matches.length === 1) {
      const index = matches[0]
      entries[index] = { ...entries[index], exportFilename: entry.exportFilename, content: recoverDesignReferences(entries[index], entry) }
    } else {
      const useRevision = entry.exportRevisionId && (candidates.length > 0 || (exportCounts.get(entry.exportId ?? '') ?? 0) > 1)
      entries.push(useRevision ? { ...entry, exportId: entry.exportRevisionId } : entry)
      if (candidates.length) warnings.push(`${entry.exportFilename ?? entry.title} · เก็บเป็นรายการแยก เพราะฉบับหรือสไลด์ไม่ตรงกับรายการเดียวในโปรไฟล์`)
    }
  }
  return {
    ...profile, profiles: profile?.profiles ?? [], entries, warnings,
    readAsset: (path) => exports.ownsAsset(path) ? exports.readAsset(path) : (profile?.readAsset ?? source.read)(path),
    withAsset: (path, consume) => withProfileMedia(source, path, consume),
  }
}
