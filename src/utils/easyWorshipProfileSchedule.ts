/** Resolves the local profile files used by a bundled EasyWorship schedule. */

import type { EasyWorshipProfileReview } from './easyWorshipProfile'
import { readEasyWorshipSchedule } from './easyWorshipSchedule'
import { convertEasyWorshipCues, mapScheduleImportIds, recoveredScheduleSongLabels } from './easyWorshipScheduleCues'
import { recoveredScheduleScripture } from './easyWorshipScheduleScripture'
import { createEasyWorshipScheduleLibraryFinder, easyWorshipScheduleMediaKey, missingEasyWorshipScheduleMedia, recoverableScheduleMedia, relinkEasyWorshipScheduleMedia, reusedScheduleMediaNames,
  type MediaLink, type ScheduleMediaAsset } from './easyWorshipScheduleMedia'
import { reviewSchedulePowerPoint, storeSchedulePowerPoint,
  type SchedulePowerPointAttachment } from './easyWorshipSchedulePowerPoint'
import { importIdentity } from './importIdentity'
import { saveMigratedLibraryMedia } from './mediaLibrary'
import { legacyVideoExtension } from './legacyVideo'
import { isLegacyPowerPoint, isPowerPointFilename, modernPowerPointName, powerPointFilename } from './powerPointFilename'
import { createCatalogMediaLookup, createEasyWorshipMediaHashFinder, easyWorshipMediaInputMime, mediaFileHash, relocatedMediaPaths, withReviewedMedia } from './easyWorshipMedia'
import { profilePowerPointMediaCandidates } from './easyWorshipProfilePowerPointMedia'
import { matchEasyWorshipExternalMedia } from './easyWorshipExternalMedia'

function resourceName(path: string): string {
  return powerPointFilename(path).toLowerCase()
}

/** Restores material outside the .ewsx only when it uniquely matches a file in the selected profile. */
export function createProfileScheduleImporter(profile: EasyWorshipProfileReview) {
  const resources = new Map<string, EasyWorshipProfileReview['resources']>()
  const resourcesByPath = new Map<string, EasyWorshipProfileReview['resources'][number]>()
  const resourcesByKind = new Map<string, EasyWorshipProfileReview['resources']>()
  for (const resource of profile.resources) {
    resourcesByPath.set(resource.path, resource)
    const key = resourceName(resource.filename)
    const matches = resources.get(key)
    if (matches) matches.push(resource)
    else resources.set(key, [resource])
    const kind = easyWorshipMediaInputMime(resource.filename)?.split('/')[0]
    if (kind) {
      const candidates = resourcesByKind.get(kind)
      if (candidates) candidates.push(resource)
      else resourcesByKind.set(kind, [resource])
    }
  }
  const catalogEntries = profile.media?.entries ?? []
  const catalogMedia = profile.profile.files.media ? createCatalogMediaLookup(catalogEntries, profile.profile.files.media) : undefined
  const matchLocation = matchEasyWorshipExternalMedia(profile.resources.flatMap((resource) =>
    resource.externalPath ? [[resource, resource.externalPath] as const] : []))
  const relocated = relocatedMediaPaths(catalogEntries)
  const movedNames = new Set([...relocated.keys()].map(resourceName))
  for (const { originalLocation, rejectedPath, catalogPath } of catalogEntries) {
    if ((originalLocation || rejectedPath) && catalogPath) movedNames.add(resourceName(catalogPath))
  }
  const catalogPathsByName = new Map<string, Set<string | undefined>>()
  for (const { kind, catalogPath, sourcePath } of catalogEntries) {
    if (!catalogPath) continue
    const filename = resourceName(catalogPath)
    if (!movedNames.has(filename)) continue
    const key = `${kind}:${filename}`
    const matches = catalogPathsByName.get(key) ?? new Set<string | undefined>()
    matches.add(sourcePath)
    catalogPathsByName.set(key, matches)
  }
  const mediaCache = new Map<string, string>()
  const findInLibrary = createEasyWorshipScheduleLibraryFinder()
  const findByHash = createEasyWorshipMediaHashFinder((resource: EasyWorshipProfileReview['resources'][number]) => withReviewedMedia(resource, mediaFileHash))
  const powerPointCache = new Map<string, File>()
  const decks = new Map(profile.resources.filter(({ filename }) => isPowerPointFilename(filename)).map((resource) => [resource.path, resource]))
  const designReadAsset = profile.designs?.readAsset
  const aliases = new Map<string, Set<string>>()
  const deckChecks = new Map<string, Set<string>>()
  const mediaCandidates = profilePowerPointMediaCandidates(profile)
  for (const { fileChecks } of profile.designs?.powerPoints ?? []) {
    for (const { filenames, hash } of fileChecks ?? []) {
      for (const filename of filenames) {
        const name = resourceName(filename)
        const versions = deckChecks.get(name) ?? new Set<string>()
        versions.add(hash)
        deckChecks.set(name, versions)
      }
    }
  }
  if (designReadAsset) {
    for (const { filename, sourcePath, originalFilename } of profile.designs?.powerPoints ?? []) {
      if (!sourcePath || !isPowerPointFilename(filename)) continue
      if (!decks.has(sourcePath)) decks.set(sourcePath, { path: sourcePath, filename,
        readFile: async () => new File([await designReadAsset(sourcePath)], filename) })
      if (originalFilename) {
        const name = resourceName(originalFilename)
        const paths = aliases.get(name) ?? new Set<string>()
        paths.add(sourcePath)
        aliases.set(name, paths)
      }
    }
  }

  async function getPowerPoint(asset: SchedulePowerPointAttachment, converted: boolean, requiresExact: boolean, location?: string) {
    const originalName = resourceName(asset.filename)
    const name = converted ? modernPowerPointName(originalName) : originalName
    const legacy = isLegacyPowerPoint(name)
    const scheduleHash = converted ? undefined : asset.easyWorshipFileHash
    const located = location ? matchLocation(converted ? location.replace(/\.ppt$/i, '.pptx') : location) : undefined
    const catalogHashes = scheduleHash ? undefined : deckChecks.get(name)
    if (requiresExact && !scheduleHash) {
      const exact = located && uniqueLocatedResource(located.candidates, asset)
      if (!exact) return undefined
      if (catalogHashes?.size && !(await Promise.all([...catalogHashes].map((hash) => findByHash(hash, [exact])))).some(Boolean)) {
        throw new Error(`ไม่พบ PowerPoint ${asset.filename} ที่ตรงกับ SHA-256 ใน Presentations.db`)
      }
      return exact.readFile()
    }
    if ((catalogHashes?.size ?? 0) > 1) throw new Error(`พบ PowerPoint ชื่อ ${name} หลายฉบับใน Presentations.db`)
    const catalogHash = catalogHashes?.values().next().value
    const hash = scheduleHash ?? catalogHash
    const key = `${converted ? 'converted' : 'original'}:${legacy ? 'ppt' : 'pptx'}:${hash ?? asset.easyWorshipSourceLocationId ?? originalName}`
    if (powerPointCache.has(key)) return powerPointCache.get(key)
    const matched = resources.get(name) ?? []
    const aliased = [...(aliases.get(originalName) ?? [])].flatMap((path) => {
      const deck = decks.get(path)
      return deck && isLegacyPowerPoint(deck.filename) === legacy ? [deck] : []
    })
    let resource
    if (hash) {
      const candidates = new Set([...matched, ...aliased])
      const other = [...decks.values()].filter((deck) => isLegacyPowerPoint(deck.filename) === legacy && !candidates.has(deck))
      const likely = other.filter(({ size }) => !asset.easyWorshipFileSize || !size || size === asset.easyWorshipFileSize)
      for (const deck of likely) candidates.add(deck)
      resource = await findByHash(hash, candidates)
        ?? (likely.length === other.length ? undefined : await findByHash(hash, other))
      if (!resource && catalogHash) throw new Error(`ไม่พบ PowerPoint ${asset.filename} ที่ตรงกับ SHA-256 ใน Presentations.db`)
    } else if (located) {
      resource = uniqueLocatedResource(located.candidates, asset)
    } else {
      const permitted = matched.filter((match) => !match.hashOnly || (match.attached && !match.externalPath))
      const matches = permitted.length ? permitted : aliased
      if (matches.length > 1) throw new Error(`พบไฟล์ ${asset.filename} ชื่อเดียวกันหลายไฟล์ในโปรไฟล์`)
      resource = matches[0]
    }
    const file = await resource?.readFile()
    if (!file) return undefined
    powerPointCache.set(key, file)
    return file
  }

  function uniqueLocatedResource(matches: EasyWorshipProfileReview['resources'], asset: ScheduleMediaAsset | SchedulePowerPointAttachment) {
    if (matches.length > 1) throw new Error(`พบไฟล์ ${asset.filename} ตรงกับพาธเดิมหลายไฟล์`)
    const [resource] = matches
    if (resource && asset.easyWorshipFileSize && resource.size !== asset.easyWorshipFileSize) {
      throw new Error(`ขนาดไฟล์ ${asset.filename} ไม่ตรงกับตาราง EasyWorship`)
    }
    return resource
  }

  async function getMedia(asset: ScheduleMediaAsset, legacy: boolean, reusedName: boolean, location?: string) {
    const { filename, kind, easyWorshipFileHash: hash, easyWorshipFileSize: size } = asset
    const key = resourceName(filename)
    const matchesFor = (name: string) => (resources.get(name) ?? []).filter((resource) => easyWorshipMediaInputMime(resource.filename)?.startsWith(`${kind}/`))
    const sourceMatches = matchesFor(key)
    const candidate = legacy && !hash && !sourceMatches.length && kind === 'video' && legacyVideoExtension(key)
      ? key.replace(/\.[^.]+$/, '.mp4') : key
    const catalogPaths = catalogPathsByName.get(`${kind}:${candidate}`)
    const matches = candidate === key ? sourceMatches : matchesFor(candidate)
    const catalogMatches = [...(catalogPaths ?? [])].flatMap((path) => {
      const match = path ? resourcesByPath.get(path) : undefined
      return match ? [match] : []
    })
    let resource
    const catalog = location ? catalogMedia?.(kind, location) : undefined
    if (hash) {
      const candidates = new Set([...catalogMatches, ...matches])
      for (const match of resourcesByKind.get(kind) ?? []) if (!size || !match.size || match.size === size) candidates.add(match)
      resource = await findByHash(hash, candidates)
      if (!resource) {
        const libraryId = await findInLibrary(asset)
        if (libraryId) return libraryId
        throw new Error(`ไม่พบไฟล์ ${filename} ที่มีข้อมูลตรงกับตาราง`)
      }
    } else if (catalog) {
      const match = catalog.sourcePath ? resourcesByPath.get(catalog.sourcePath) : undefined
      resource = match ? uniqueLocatedResource([match], asset) : undefined
    } else if (location) {
      resource = uniqueLocatedResource(matchLocation(location)?.candidates ?? [], asset)
    } else {
      const nameMatches = matches.filter((match) => !match.hashOnly)
      if (reusedName || (catalogPaths?.size ?? nameMatches.length) > 1) throw new Error(`พบไฟล์ ${filename} ชื่อเดียวกันหลายไฟล์ในโปรไฟล์`)
      resource = catalogPaths ? catalogMatches[0] : nameMatches[0]
    }
    if (!resource) return undefined
    const cached = mediaCache.get(resource.path)
    if (cached) return cached
    const entry = catalogEntries.find((entry) => entry.kind === kind && entry.sourcePath === resource.path)
    const uid = entry?.metadata?.mediaUid
    const saved = await withReviewedMedia(resource, (blob) => saveMigratedLibraryMedia(blob, {
      filename: resource.filename, kind,
      ...(entry && !entry.unregistered ? { name: entry.name, metadata: entry.metadata, ...('clip' in entry ? { clip: entry.clip } : {}),
        ...('posterSeconds' in entry ? { posterSeconds: entry.posterSeconds } : {}),
        ...('alphaMode' in entry ? { alphaMode: entry.alphaMode } : {}),
        ...(entry.playback ? { playback: entry.playback } : {}),
        sourceId: entry.importSourceId ?? (typeof uid === 'string' ? uid : `${profile.profile.files.media}:${entry.sourceId}`) } : {}),
    }))
    mediaCache.set(resource.path, saved.assetId)
    return saved.assetId
  }

  return async (file: File) => {
    const schedule = await readEasyWorshipSchedule(file, profile.legacyEncoding)
    const original = (asset: ScheduleMediaAsset | SchedulePowerPointAttachment) =>
      asset.easyWorshipSourceLocationId ? schedule.externalMediaLocations?.get(asset.easyWorshipSourceLocationId) : undefined
    const cues = convertEasyWorshipCues(schedule)
    const review = await reviewSchedulePowerPoint(file, cues, [], {
      resolveFromProfile: (asset, converted, requiresExact) => getPowerPoint(asset, converted, requiresExact, original(asset)),
      packedMedia: schedule.packedMedia, mediaCandidates, externalMediaLocations: schedule.externalMediaLocations,
    })
    const restored = await storeSchedulePowerPoint(cues, review, {
      sourceId: schedule.source.importId, previousSourceId: schedule.source.previousScriptureImportId,
    })
    const references = new Set<string>()
    const problems = new Set<string>(review.unresolved.values())
    const links = new Map<string, MediaLink>()
    const missing = missingEasyWorshipScheduleMedia(restored.cues)
    const reused = reusedScheduleMediaNames(cues)
    for (const [key, asset] of missing) {
      try {
        const sameName = reused.has(easyWorshipScheduleMediaKey(asset))
        const libraryId = await getMedia(asset, Boolean(schedule.packedMedia), sameName, original(asset))
        if (libraryId) {
          links.set(key, { libraryId, mediaImportId: libraryId })
          if (!(asset.kind === 'video' && asset.easyWorshipFileHash && legacyVideoExtension(asset.filename))) {
            const identity = [asset.kind, resourceName(asset.filename), libraryId]
            if (sameName && asset.easyWorshipSourceLocationId && !asset.easyWorshipFileHash) identity.push(asset.easyWorshipSourceLocationId)
            references.add(JSON.stringify(identity))
          }
        } else {
          problems.add(schedule.rejectedPackedMedia?.get(asset)?.warning ?? `ไม่พบไฟล์ ${asset.filename} ในโปรไฟล์เดียวกัน`)
        }
      } catch (cause) {
        problems.add(schedule.rejectedPackedMedia?.get(asset)?.warning
          ?? (cause instanceof Error ? cause.message : `เก็บไฟล์ ${asset.filename} ไม่สำเร็จ`))
      }
    }

    const sortedReferences = [...references].sort()
    const identify = (id: string) => importIdentity(['easyworship-schedule-profile-resources-v1', id, sortedReferences])
    const ids = sortedReferences.length
      ? await mapScheduleImportIds(restored.ids, identify)
      : restored.ids
    const powerPoint = restored.recovery
    const powerPointMediaIds = powerPoint && sortedReferences.length ? await mapScheduleImportIds(powerPoint.ids, identify) : undefined
    return {
      ...ids, cues: relinkEasyWorshipScheduleMedia(restored.cues, links), problems: [...problems],
      packedMedia: schedule.packedMedia, songLabels: recoveredScheduleSongLabels(schedule),
      scripture: recoveredScheduleScripture(schedule), powerPoint, powerPointMediaIds,
      media: recoverableScheduleMedia(restored.ids, restored.cues, links, schedule.rejectedPackedMedia),
    }
  }
}
