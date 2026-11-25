/** Fills media playback on previously imported layers and attachments. */

import type { PlaylistCueAsset } from '../types/database'
import type { DesignLayer, DesignSoundtrack, SlideDesign } from '../types/slideDesign'
import type { MediaCatalogReference, MediaPlayback } from '../types/media'

type MediaLayer = Extract<DesignLayer, { kind: 'media' }>
type VisualLayer = Extract<DesignLayer, { kind: 'media' | 'fill' }>
type MediaAddress = Pick<PlaylistCueAsset, 'kind' | 'filename' | 'libraryId' | 'archivePath' | 'easyWorshipFileHash' | 'role' | 'dvd' | 'crc32'>
  & { sourcePath?: string }

function sameSource(saved: MediaAddress, source: MediaAddress) {
  if (saved.kind !== source.kind || (saved.kind !== 'audio' && saved.kind !== 'video' && saved.kind !== 'image')
    || saved.role !== source.role || saved.dvd || source.dvd) return false
  const { easyWorshipFileHash: savedHash } = saved
  const { easyWorshipFileHash: sourceHash } = source
  if (savedHash && savedHash !== sourceHash) return false
  const addresses = ['libraryId', 'archivePath', 'sourcePath'] as const
  if (addresses.some((key) => saved[key] && source[key] && saved[key] !== source[key])) return false
  const trusted = Boolean(savedHash || addresses.some((key) => saved[key] && saved[key] === source[key]))
  if (saved.crc32 !== undefined && source.crc32 !== undefined && saved.crc32 !== source.crc32) return false
  if (trusted) return true
  return !addresses.some((key) => saved[key])
    && saved.filename.normalize('NFC').toLowerCase() === source.filename.normalize('NFC').toLowerCase()
}

function fillUniqueReferences<T extends MediaAddress & {
  mediaCatalog?: MediaCatalogReference; playback?: MediaPlayback; posterSeconds?: number; repeat?: boolean; easyWorshipLegacyRepeat?: false
}>(
  saved: T[], source: readonly T[],
) {
  let changed = false
  const result = saved.map((asset) => {
    if (asset.mediaCatalog) return asset
    const matches = source.filter((candidate) => sameSource(asset, candidate))
    if (matches.length !== 1 || saved.filter((other) => sameSource(other, matches[0])).length !== 1) return asset
    const incoming = matches[0]
    const playback = asset.playback === undefined ? incoming.playback : undefined
    const posterSeconds = asset.kind === 'video' && asset.posterSeconds === undefined ? incoming.posterSeconds : undefined
    const repeat = asset.repeat === undefined ? incoming.repeat : undefined
    if (!playback && posterSeconds === undefined && repeat === undefined) return asset
    changed = true
    return { ...asset, ...(playback ? { playback } : {}), ...(posterSeconds !== undefined ? { posterSeconds } : {}), ...(repeat !== undefined ? {
      repeat, ...(incoming.easyWorshipLegacyRepeat === false ? { easyWorshipLegacyRepeat: false as const } : {}),
    } : {}) }
  })
  return changed ? result : saved
}

export function fillImportedCueMediaPlayback(saved: PlaylistCueAsset[] | undefined, source: PlaylistCueAsset[] | undefined) {
  return saved?.length && source?.length ? fillUniqueReferences(saved, source) : saved
}

function fillLayer(saved: MediaLayer, source: MediaLayer): MediaLayer {
  const dvdId = saved.asset.dvd?.id
  const sameAsset = dvdId ? dvdId === source.asset.dvd?.id : sameSource(saved.asset, source.asset)
  if (saved.songArtwork || saved.inheritedFromMaster !== source.inheritedFromMaster
    || !sameAsset) return saved
  const role = saved.role === undefined ? source.role : undefined
  const fillPlayback = !dvdId && !saved.asset.mediaCatalog && saved.asset.playback === undefined && saved.easyWorshipLegacyPlayback === undefined
  const previous = fillPlayback ? source.easyWorshipLegacyPlayback : undefined
  const fit = previous?.fit !== undefined && saved.fit === previous.fit ? source.fit : saved.fit
  const loop = previous?.loop !== undefined && saved.loop === previous.loop ? source.loop : saved.loop
  const playback = fillPlayback ? source.asset.playback : undefined
  const posterSeconds = !saved.asset.mediaCatalog && saved.asset.kind === 'video' && saved.asset.posterSeconds === undefined
    ? source.asset.posterSeconds : undefined
  const changedFit = fit !== saved.fit
  const changedLoop = loop !== saved.loop
  if (!role && !playback && posterSeconds === undefined && !changedFit && !changedLoop) return saved
  return { ...saved, ...(role ? { role } : {}), ...(changedFit ? { fit } : {}), ...(changedLoop ? { loop } : {}),
    ...(changedFit || changedLoop ? { easyWorshipLegacyPlayback: {
      ...(changedFit ? { fit: saved.fit } : {}), ...(changedLoop ? { loop: saved.loop } : {}),
    } } : {}),
    ...(playback || posterSeconds !== undefined ? { asset: { ...saved.asset,
      ...(playback ? { playback } : {}), ...(posterSeconds !== undefined ? { posterSeconds } : {}),
    } } : {}) }
}

export function hasImportedMediaPlayback(design?: SlideDesign) {
  return Boolean(design?.layers.some((layer) => (layer.kind === 'fill' && layer.role)
    || (layer.kind === 'media' && (layer.role || (!layer.asset.dvd
      && (layer.asset.playback || layer.easyWorshipLegacyPlayback || layer.asset.posterSeconds !== undefined)))))
    || design?.soundtracks?.some((track) => track.playback || track.repeat !== undefined))
}

export function fillImportedDesignMediaPlayback(saved: SlideDesign | undefined, source: SlideDesign | undefined) {
  if (!saved || !source || !hasImportedMediaPlayback(source)) return saved
  const incoming = new Map<string, VisualLayer | undefined>()
  for (const layer of source.layers) {
    if (layer.kind === 'media' || layer.kind === 'fill') incoming.set(layer.id, incoming.has(layer.id) ? undefined : layer)
  }
  const ids = new Map<string, number>()
  for (const layer of saved.layers) ids.set(layer.id, (ids.get(layer.id) ?? 0) + 1)
  let changed = false
  const layers = saved.layers.map((layer) => {
    const next = ids.get(layer.id) === 1 ? incoming.get(layer.id) : undefined
    const filled = layer.kind === 'media' && next?.kind === 'media' ? fillLayer(layer, next)
      : layer.kind === 'fill' && next?.kind === 'fill' && !layer.role && next.role
        && layer.inheritedFromMaster === next.inheritedFromMaster ? { ...layer, role: next.role } : layer
    changed ||= filled !== layer
    return filled
  })
  const tracks = saved.soundtracks?.length && source.soundtracks?.length
    ? fillUniqueReferences<DesignSoundtrack>(saved.soundtracks, source.soundtracks) : saved.soundtracks
  return changed || tracks !== saved.soundtracks ? { ...saved, layers, ...(tracks ? { soundtracks: tracks } : {}) } : saved
}
