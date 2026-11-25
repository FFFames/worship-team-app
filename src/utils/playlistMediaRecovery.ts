/** Finds file-backed schedule media and detects library copies by file content. */

import type { PlaylistCueAsset, PlaylistSong } from '../types/database'
import type { MediaKind, MediaLibraryItem } from '../types/media'
import type { SlideDesign } from '../types/slideDesign'
import { libraryMediaMime, listLibraryMedia, mediaLibraryAssetId, readLibraryMedia, saveLibraryMedia } from './mediaLibrary'
import { playlistMediaFilename, readScheduleMedia } from './scheduleMedia'
import { songLayoutMedia } from './songSlideLayout'

type FileAsset = PlaylistCueAsset & { kind: MediaKind }
type MediaReference = { id: string; asset: FileAsset; playlistId: string; positions: number[] }
export type ReviewedPlaylistMedia = MediaReference & { filename: string; blob?: Blob; library?: MediaLibraryItem; problem?: string }

function designAssets(design?: SlideDesign | null): PlaylistCueAsset[] {
  return [...(design?.soundtracks ?? []), ...(design?.layers.flatMap((layer) => layer.kind === 'media' ? [layer.asset] : []) ?? [])]
}

export function playlistMediaReferences(entries: readonly PlaylistSong[]) {
  const references = new Map<string, MediaReference>()
  entries.forEach((entry, index) => {
    const assets = [entry.background_asset, ...designAssets(entry.slide_theme?.design), ...(entry.cue?.assets ?? []),
      ...songLayoutMedia(entry.cue?.slideLayout),
      ...(entry.cue?.slides.flatMap((slide) => [...(slide.assets ?? []), ...designAssets(slide.design), ...songLayoutMedia(slide.slideLayout)]) ?? [])]
    for (const asset of assets) {
      if (!asset || (asset.kind !== 'image' && asset.kind !== 'video' && asset.kind !== 'audio')) continue
      if (asset.dvd && !asset.archivePath && !asset.libraryId) continue
      const id = JSON.stringify([entry.playlist_id, asset.kind, asset.libraryId, asset.archivePath, !asset.libraryId && !asset.archivePath && asset.filename])
      const reference: MediaReference = references.get(id) ?? {
        id, asset: { ...asset, kind: asset.kind }, playlistId: entry.playlist_id, positions: [],
      }
      if (reference.positions[reference.positions.length - 1] !== index + 1) reference.positions.push(index + 1)
      references.set(id, reference)
    }
  })
  return [...references.values()]
}

export async function reviewPlaylistMedia(references: readonly MediaReference[]) {
  const library = await listLibraryMedia()
  const byDigest = new Map(library.map((item) => [item.assetId, item]))
  const reviewed = new Map<string, ReviewedPlaylistMedia>()
  for (const reference of references) {
    const { asset, playlistId } = reference
    const filename = playlistMediaFilename(asset)
    const stored = asset.libraryId ? await readLibraryMedia(asset.libraryId) : null
    const blob = stored ?? (asset.archivePath ? await readScheduleMedia(playlistId, asset.archivePath) : null)
    if (!blob?.size) {
      reviewed.set(reference.id, { ...reference, filename, problem: 'ไม่พบไฟล์ในเบราว์เซอร์นี้' })
      continue
    }
    const id = stored && asset.libraryId ? asset.libraryId : await mediaLibraryAssetId(blob)
    const existing = reviewed.get(id)
    if (existing) {
      existing.positions = [...new Set([...existing.positions, ...reference.positions])].sort((a, b) => a - b)
      continue
    }
    const libraryItem = byDigest.get(id)
    if (libraryItem?.kind === asset.kind) reviewed.set(id, { ...reference, id, filename, library: libraryItem })
    else if (libraryMediaMime(filename)?.startsWith(`${asset.kind}/`)) reviewed.set(id, { ...reference, id, filename, blob })
    else reviewed.set(reference.id, { ...reference, filename, problem: 'รูปแบบไฟล์ยังไม่รองรับ' })
  }
  return [...reviewed.values()]
}

export async function saveReviewedPlaylistMedia(item: ReviewedPlaylistMedia) {
  if (!item.blob) throw new Error('ไม่พบไฟล์ที่ตรวจไว้')
  return saveLibraryMedia(item.blob, { filename: item.filename, kind: item.asset.kind, alphaMode: item.asset.alphaMode })
}
