/** Relinks EasyWorship schedule media that was saved outside the schedule file. */

import type { PlaylistCue, PlaylistCueAsset } from '../types/database'
import { importBlobIdentities, importIdentity } from './importIdentity'
import { mediaLibraryIdentityInput, libraryMediaMime, readLibraryMedia } from './mediaLibrary'
import { createEasyWorshipLibraryMediaFinder, createEasyWorshipMediaHashFinder, mediaFileHash } from './easyWorshipMedia'
import { packedLegacyVideoExtension, scheduleMediaAssets } from './scheduleMedia'
import { canConvertLegacyVideo, legacyVideoExtension, legacyVideoSourceMime } from './legacyVideo'
import { powerPointFilename } from './powerPointFilename'
import type { ScheduleImportIds } from './easyWorshipScheduleCues'
import { packedScheduleMediaWarning, type RejectedPackedMedia } from './easyWorshipPackedMedia'
import { MISSING_MASTER_BACKGROUND } from './slideDesign'
import { matchSuppliedEasyWorshipExternalMedia, suppliedEasyWorshipMediaLocation } from './easyWorshipExternalMedia'

export type MediaLink = Pick<PlaylistCueAsset, 'archivePath' | 'libraryId' | 'mediaImportId'>
export type ScheduleMediaAsset = PlaylistCueAsset & { kind: 'image' | 'video' | 'audio' }
type SourceMediaDetails = Pick<PlaylistCueAsset, 'easyWorshipFileHash' | 'easyWorshipSourceLocationId' | 'easyWorshipFileSize'>
type AddressedAsset = Pick<PlaylistCueAsset, 'kind' | 'filename' | 'role' | 'dvd' | 'crc32'> & SourceMediaDetails & MediaLink
export type ScheduleMediaRecoveryLink = MediaLink & { replaceArchivePath?: string }
export type ScheduleMediaRecovery = {
  ids: ScheduleImportIds
  cues: ReadonlyMap<string, ReadonlyMap<string, ScheduleMediaRecoveryLink>>
  verifiedAttachments?: true
}

export function createEasyWorshipScheduleLibraryFinder() {
  const find = createEasyWorshipLibraryMediaFinder()
  return async ({ kind, filename, easyWorshipFileHash: hash, easyWorshipFileSize: size }: ScheduleMediaAsset) =>
    hash ? (await find({ kind, filename, hash, size }, true))?.assetId : undefined
}

function isMediaAsset(asset: PlaylistCueAsset): asset is ScheduleMediaAsset {
  return asset.kind === 'image' || asset.kind === 'video' || asset.kind === 'audio'
}

export function easyWorshipScheduleMediaKey(asset: Pick<PlaylistCueAsset, 'kind' | 'filename'>) {
  return `${asset.kind}:${powerPointFilename(asset.filename).normalize('NFC').toLowerCase()}`
}

function sourceDiscriminator(asset: SourceMediaDetails) {
  return asset.easyWorshipFileHash ?? (asset.easyWorshipSourceLocationId
    ? `path:${asset.easyWorshipSourceLocationId}:${asset.easyWorshipFileSize ?? ''}` : undefined)
}

function sourceMediaKey(asset: Pick<AddressedAsset, 'kind' | 'filename'> & SourceMediaDetails) {
  const name = easyWorshipScheduleMediaKey(asset)
  const discriminator = sourceDiscriminator(asset)
  return discriminator ? `${name}\0${discriminator}` : name
}

function mediaLink(asset: AddressedAsset, links: ReadonlyMap<string, MediaLink>) {
  return links.get(sourceMediaKey(asset)) ?? (asset.easyWorshipSourceLocationId ? undefined : links.get(easyWorshipScheduleMediaKey(asset)))
}

export function missingEasyWorshipScheduleMedia(cues: readonly PlaylistCue[]) {
  const missing = new Map<string, ScheduleMediaAsset>()
  for (const asset of scheduleMediaAssets(cues)) {
    if (asset.archivePath || asset.libraryId || asset.dvd || !isMediaAsset(asset)) continue
    missing.set(sourceMediaKey(asset), asset)
  }
  return missing
}

export function reusedScheduleMediaNames(cues: readonly PlaylistCue[]) {
  const sources = new Map<string, string | undefined>()
  const reused = new Set<string>()
  for (const asset of scheduleMediaAssets(cues)) {
    if (!isMediaAsset(asset) || asset.dvd) continue
    const name = easyWorshipScheduleMediaKey(asset)
    const discriminator = sourceDiscriminator(asset)
    if (!sources.has(name)) sources.set(name, discriminator)
    else if (sources.get(name) !== discriminator) reused.add(name)
  }
  return reused
}

export function canRecoverPackedLegacyVideo(cues: readonly PlaylistCue[]) {
  return canConvertLegacyVideo() && scheduleMediaAssets(cues).some((asset) => packedLegacyVideoExtension(asset.archivePath, asset))
}

function rewriteCueMedia(cue: PlaylistCue, resolve: (asset: AddressedAsset, slot?: string, sourceSlot?: string) => MediaLink | undefined) {
  const warnings = new Set(cue.warnings)
  const updated = new Set<string>()
  const remaining = new Set<string>()
  function relink<T extends AddressedAsset>(asset: T, slide: string | undefined, layer: string | null, scope?: 'cue' | 'soundtrack'): T {
    const slot = slide && JSON.stringify([slide, layer, easyWorshipScheduleMediaKey(asset), asset.role, ...(scope ? [scope] : [])])
    const discriminator = sourceDiscriminator(asset)
    const sourceSlot = slot && discriminator ? `${slot}\0${discriminator}` : undefined
    const link = resolve(asset, slot, sourceSlot)
    if (!link) {
      if (!asset.archivePath && !asset.libraryId && !asset.dvd && isMediaAsset(asset)) remaining.add(asset.filename)
      return asset
    }
    updated.add(asset.filename)
    const { archivePath, libraryId: _library, mediaImportId: _fingerprint, crc32, ...original } = asset
    return { ...original, ...(archivePath && archivePath === link.archivePath ? { crc32 } : {}), ...link } as T
  }
  const assets = cue.assets?.map((asset) => relink(asset, cue.sourceId, null, 'cue'))
  const slides = cue.slides.map((slide) => {
    return {
      ...slide,
      ...(slide.assets ? { assets: slide.assets.map((asset) => relink(asset, slide.sourceId, null)) } : {}),
      ...(slide.design ? { design: {
        ...slide.design,
        layers: slide.design.layers.map((layer) => layer.kind === 'media'
          ? { ...layer, asset: relink(layer.asset, slide.sourceId, layer.id) } : layer),
        ...(slide.design.soundtracks ? { soundtracks: slide.design.soundtracks.map((track) => relink(track, slide.sourceId, null, 'soundtrack')) } : {}),
      } } : {}),
    }
  })
  for (const filename of updated) {
    if (remaining.has(filename)) continue
    warnings.delete(`ไม่พบไฟล์ ${filename} ใน .ewsx`)
    warnings.delete(`ไม่พบไฟล์ ${filename} ที่เล่นได้ใน .ews`)
    warnings.delete(`ไม่พบไฟล์ ${filename} ที่อ้างอิงจากเลย์เอาต์`)
    warnings.delete(`${MISSING_MASTER_BACKGROUND}${filename}`)
    warnings.delete(packedScheduleMediaWarning(filename, 'checksum'))
    warnings.delete(packedScheduleMediaWarning(filename, 'unreadable'))
  }
  return updated.size ? { ...cue, ...(assets ? { assets } : {}), slides, warnings: [...warnings] } : cue
}

export function relinkEasyWorshipScheduleMedia(cues: PlaylistCue[], links: ReadonlyMap<string, MediaLink>) {
  return links.size ? cues.map((cue) => rewriteCueMedia(cue, (asset) => asset.archivePath || asset.libraryId || asset.dvd
    ? undefined : mediaLink(asset, links))) : cues
}

function sameRecoveryLink(a: ScheduleMediaRecoveryLink | undefined, b: ScheduleMediaRecoveryLink | undefined) {
  return a === b || (a && b && a.archivePath === b.archivePath && a.libraryId === b.libraryId
    && a.mediaImportId === b.mediaImportId && a.replaceArchivePath === b.replaceArchivePath)
}

export function recoverableScheduleMedia(ids: ScheduleImportIds, cues: readonly PlaylistCue[], links: ReadonlyMap<string, MediaLink>,
  rejected?: RejectedPackedMedia, namespace?: string): ScheduleMediaRecovery | undefined {
  const convertPacked = canRecoverPackedLegacyVideo(cues)
  if (!links.size && !convertPacked) return undefined
  const candidates = new Map<string, Map<string, ScheduleMediaRecoveryLink>>()
  const uncheckedLinks = new Set(links.values())
  let hasUnverifiedAttachment = false
  for (const cue of cues) {
    if (!cue.sourceId) continue
    const available = new Map<string, ScheduleMediaRecoveryLink>()
    const fallback = new Map<string, ScheduleMediaRecoveryLink | undefined>()
    rewriteCueMedia(cue, (asset, slot, sourceSlot) => {
      if (slot && !asset.libraryId && !asset.dvd && (!asset.archivePath || (convertPacked && packedLegacyVideoExtension(asset.archivePath, asset)))) {
        const recovered = asset.archivePath ? { archivePath: asset.archivePath } : mediaLink(asset, links)
        if (recovered && !asset.archivePath) {
          uncheckedLinks.delete(recovered)
          if (!asset.easyWorshipFileHash) hasUnverifiedAttachment = true
        }
        const path = rejected?.get(asset)?.path
        const link = path && recovered ? { ...recovered, replaceArchivePath: namespace ? `${namespace}/${path}` : path } : recovered
        if (sourceSlot && link) available.set(sourceSlot, link)
        // Earlier playlists have no source hash. Only fill a slot if every original match points to the same file.
        if (!fallback.has(slot)) fallback.set(slot, link)
        else if (!sameRecoveryLink(fallback.get(slot), link)) fallback.set(slot, undefined)
      }
      return undefined
    })
    for (const [slot, link] of fallback) if (link) available.set(slot, link)
    if (available.size) candidates.set(cue.sourceId, available)
  }
  const verified = links.size > 0 && !uncheckedLinks.size && !hasUnverifiedAttachment
  return candidates.size ? { ids, cues: candidates, ...(verified ? { verifiedAttachments: true } : {}) } : undefined
}

export function fillScheduleMedia(cue: PlaylistCue, recovery: ScheduleMediaRecovery) {
  const available = cue.sourceId ? recovery.cues.get(cue.sourceId) : undefined
  if (!available) return undefined
  let matched = false
  let different = false
  const updated = rewriteCueMedia(cue, (asset, slot, sourceSlot) => {
    const key = sourceSlot ?? slot
    const recoveryLink = key ? available.get(key) : undefined
    if (!recoveryLink || asset.dvd) return undefined
    const { replaceArchivePath, ...link } = recoveryLink
    if (!asset.archivePath && !asset.libraryId) return link
    if (replaceArchivePath && asset.archivePath === replaceArchivePath && !asset.libraryId && !asset.mediaImportId) return link
    if ((!link.archivePath || asset.archivePath === link.archivePath) && (!link.libraryId || asset.libraryId === link.libraryId)) {
      matched = true
      return undefined
    }
    if (link.mediaImportId && (asset.libraryId ?? asset.mediaImportId) === link.mediaImportId) {
      matched = true
      return { archivePath: link.archivePath ?? asset.archivePath, libraryId: link.libraryId ?? asset.libraryId,
        mediaImportId: link.mediaImportId }
    }
    // A locally substituted resource stays in its slot. A previous import of different file bytes is a separate variant.
    if (asset.mediaImportId || asset.archivePath?.startsWith('worshipteam-attachments/')) different = true
    return undefined
  })
  return { cue: updated === cue ? undefined : updated, matched, different }
}

export async function reviewEasyWorshipScheduleMedia(cues: PlaylistCue[], files: readonly File[], legacy: boolean,
  findInLibrary?: ReturnType<typeof createEasyWorshipScheduleLibraryFinder>, rejected?: RejectedPackedMedia,
  externalMediaLocations?: ReadonlyMap<string, string>) {
  const candidates = new Map<string, File[]>()
  const byKind = new Map<string, File[]>()
  const folderFiles: File[] = []
  for (const file of files) {
    const mime = libraryMediaMime(file.name) ?? (canConvertLegacyVideo() && legacyVideoExtension(file.name) ? legacyVideoSourceMime : undefined)
    if (!mime || !file.size) continue
    if (file.webkitRelativePath) {
      if (!suppliedEasyWorshipMediaLocation(file)) continue
      folderFiles.push(file)
    }
    const kind = mime.split('/')[0]
    const key = `${kind}:${file.name.normalize('NFC').toLowerCase()}`
    for (const [index, name] of [[candidates, key], [byKind, kind]] as const) {
      const matches = index.get(name)
      if (matches) matches.push(file)
      else index.set(name, [file])
    }
  }
  const matchLocation = matchSuppliedEasyWorshipExternalMedia(folderFiles)

  const links = new Map<string, MediaLink>()
  const attachments = new Map<string, Blob>()
  const unresolved = new Set<string>()
  const used = new Map<File, { archivePath: string; mediaImportId: string; libraryId?: string }>()
  const libraryFiles = new Map<string, File>()
  const libraryAttachments = new Set<string>()
  const identityReferences = new Map<string, { archivePath: string }>()
  const reused = reusedScheduleMediaNames(cues)
  const findByHash = createEasyWorshipMediaHashFinder<File>(mediaFileHash)
  for (const [key, asset] of missingEasyWorshipScheduleMedia(cues)) {
    const name = easyWorshipScheduleMediaKey(asset)
    const original = asset.kind === 'video' && legacyVideoExtension(name)
    const lookup = legacy && original && !asset.easyWorshipFileHash ? name.replace(/\.[^.]+$/, '.mp4') : name
    const matches = candidates.get(lookup) ?? []
    const originals = lookup === name ? matches : candidates.get(name) ?? []
    const reusedName = reused.has(name)
    const location = asset.easyWorshipSourceLocationId && externalMediaLocations?.get(asset.easyWorshipSourceLocationId)
    const found = location ? matchLocation(location) ?? (lookup !== name ? matchLocation(location.replace(/\.[^.]+$/, '.mp4')) : undefined) : undefined
    const located = found?.candidates
    const eligible = (supplied: File[]) => asset.easyWorshipSourceLocationId ? supplied.filter((file) => !file.webkitRelativePath) : supplied
    const originalFiles = eligible(originals)
    const preferred = located || (originalFiles.length ? originalFiles : eligible(matches))
    const { easyWorshipFileHash: hash, easyWorshipFileSize: size } = asset
    const sameSize = (file: File) => !size || file.size === size
    const filename = lookup.slice(lookup.indexOf(':') + 1)
    const all = byKind.get(asset.kind) ?? []
    const renamed = all.filter(sameSize)
    let file = hash ? await findByHash(hash, new Set([...matches, ...renamed])) ?? await findByHash(hash, all)
      : (located || !reusedName) && preferred.length === 1 && sameSize(preferred[0]) ? preferred[0] : undefined
    const libraryId = file ? undefined : await findInLibrary?.(asset)
    if (libraryId) {
      file = libraryFiles.get(libraryId)
      if (!file) {
        const blob = await readLibraryMedia(libraryId).catch(() => null)
        if (blob) {
          file = new File([blob], filename, { type: blob.type })
          libraryFiles.set(libraryId, file)
        }
      }
    }
    if (!file) {
      unresolved.add(preferred.length > 1 ? `${asset.filename} · พบไฟล์แนบชื่อเดียวกันหลายไฟล์`
        : preferred.length ? `${asset.filename} · ไฟล์แนบไม่ตรงกับฉบับที่ตารางอ้างอิง` : rejected?.get(asset)?.warning ?? asset.filename)
      continue
    }

    let link = used.get(file)
    if (!link) {
      const [fingerprint, mediaImportId] = await importBlobIdentities([
        ['easyworship-schedule-media', lookup], mediaLibraryIdentityInput(file),
      ], file)
      const sourceExtension = !libraryId && asset.kind === 'video' ? legacyVideoExtension(file.name) : undefined
      const packedName = sourceExtension ? filename.replace(/\.[^.]+$/, '') + '.' + sourceExtension : filename
      link = { archivePath: `worshipteam-attachments/${fingerprint}/${packedName}`, mediaImportId, ...(libraryId ? { libraryId } : {}) }
      used.set(file, link)
      const mime = sourceExtension ? legacyVideoSourceMime : (hash ? libraryMediaMime(filename) : undefined) ?? libraryMediaMime(file.name) ?? file.type
      attachments.set(link.archivePath, file.slice(0, file.size, mime))
    }
    if (libraryId) libraryAttachments.add(link.archivePath)
    links.set(reusedName || asset.easyWorshipSourceLocationId ? key : name, link)
    if (!(hash && original && (legacyVideoExtension(file.name) || libraryId))) {
      // Keep the attachment identity of earlier imports when this name identifies just one file.
      identityReferences.set(reusedName ? key : name, { archivePath: link.archivePath })
    }
  }

  return {
    cues: relinkEasyWorshipScheduleMedia(cues, links), attachments, unresolved: [...unresolved], links,
    libraryMatches: libraryAttachments.size,
    async sourceId(original: string) {
      const previousReferences = [...identityReferences].sort()
      return previousReferences.length ? importIdentity(['easyworship-schedule-attachments-v1', original, previousReferences]) : original
    },
  }
}
