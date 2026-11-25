/** Transfers a local media catalog and its original asset IDs between WorshipTeam browsers. */

import { BlobReader, BlobWriter, TextWriter, ZipReader, ZipWriter, type FileEntry } from '@zip.js/zip.js'
import { listAlertResourceCatalogs, listAlertTemplates, restoreAlertResourceCatalogs, restoreAlertTemplates } from './alertTemplateLibrary'
import { listEasyWorshipCollectionSets, restoreCollectionSets } from './collectionLibrary'
import { readDefaultThemes, saveDefaultThemes } from './defaultThemes'
import { readDvdReplacement, saveDvdReplacement } from './dvdReplacement'
import { catalogBackupPath, getCatalogDescriptor, missingCatalogMedia, parseLibraryCatalog, type LibraryCatalog } from './libraryCatalogBackup'
import { listLibraryMedia, mediaLibraryAssetId, readMediaLibraryBackup, restoreMediaLibraryAsset, restoreMediaLibrarySources } from './mediaLibrary'
import { historyBackupPath, mediaBackupPath, mediaPackageMaxFiles, mediaPackageMaxManifest, missingDefaultThemeMedia, parseMediaLibraryPackage,
  parsePackageScripture, parsePackageSongHistory, scriptureBackupPath,
  type MediaLibraryPackage, type PackageScheduleAsset, type PackageScripture, type PackageSongHistory } from './mediaLibraryPackageManifest'
import { readScheduleMediaBackup, restoreScheduleMediaAssets } from './scheduleMedia'
import { readPresentationControlBackup, restorePresentationControlBackup } from './presentationControlBackup'
import { readOutputAppearanceBackup, restoreOutputAppearanceBackup } from './outputSettingsStorage'
import { decodeNurserySettings, saveNurserySettings, storedNurserySettings } from './nurseryAlerts'
import { decodeMessageAlertSettings, saveMessageAlertSettings, storedMessageAlertSettings } from './messageAlertSettings'
import { listScriptureEditions, readScriptureEdition, restoreScriptureEdition } from './scriptureLibrary'
import { getSongHistory, listSongHistories, restoreSongHistory } from './songHistoryLibrary'
import type { MediaLibraryItem } from '../types/media'

const manifestPath = 'manifest.json'
const downloadLimit = 1024 ** 3
type Progress = (completed: number, total: number) => void

async function prepareMediaLibraryPackage(maxBytes?: number, catalog?: LibraryCatalog) {
  const [backup, collectionSets, attachments, editions, alertTemplates, histories, alertResourceCatalogs] = await Promise.all([
    readMediaLibraryBackup(), listEasyWorshipCollectionSets(), readScheduleMediaBackup(), listScriptureEditions(), listAlertTemplates(),
    listSongHistories(), listAlertResourceCatalogs(),
  ])
  const blobs = new Map(backup.assets.map(({ id, blob }) => [id, { blob, library: true }]))
  const scheduleAssets: PackageScheduleAsset[] = []
  let bytes = backup.assets.reduce((sum, asset) => sum + asset.blob.size, 0)
  const checkDownloadSize = (size: number) => {
    if (maxBytes !== undefined && size > maxBytes) throw new Error('แพ็กเกจเกิน 1 GB เลือกบันทึกแพ็กเกจลงดิสก์ในเบราว์เซอร์ที่รองรับ')
  }
  checkDownloadSize(bytes)
  for (const { playlistId, archivePath, blob } of attachments) {
    checkDownloadSize(blob.size)
    const assetId = await mediaLibraryAssetId(blob)
    if (!blobs.has(assetId)) {
      bytes += blob.size
      checkDownloadSize(bytes)
      blobs.set(assetId, { blob, library: false })
    }
    scheduleAssets.push({ playlistId, archivePath, assetId, mime: blob.type })
  }
  const assetIds = new Set(backup.assets.map(({ id, blob }) => blob.type.startsWith('video/') ? id : undefined))
  const unavailableVideos: string[] = []
  const replacements = backup.dvds.flatMap((dvd) => {
    const replacement = readDvdReplacement(dvd.id)
    if (!replacement) return []
    if (assetIds.has(replacement.assetId)) return [{ dvdId: dvd.id, replacement }]
    unavailableVideos.push(dvd.name)
    return []
  })
  const documents = new Map<string, Blob>()
  function addDocument(path: string, value: unknown): number {
    const blob = new Blob([JSON.stringify(value)], { type: 'application/json' })
    bytes += blob.size
    checkDownloadSize(bytes)
    documents.set(path, blob)
    return blob.size
  }
  const scriptureEditions: PackageScripture[] = []
  for (const { id } of editions) {
    const edition = await readScriptureEdition(id)
    if (!edition) continue
    const { name, abbreviation } = edition
    const size = addDocument(scriptureBackupPath(scriptureEditions.length), edition)
    const descriptor = { id, name, abbreviation, size }
    parsePackageScripture(edition, descriptor)
    scriptureEditions.push(descriptor)
  }
  const songHistories: PackageSongHistory[] = []
  for (const { id, savedAt } of histories) {
    const history = await getSongHistory(id)
    if (!history) continue
    const size = addDocument(historyBackupPath(songHistories.length), history)
    const descriptor = { id, name: history.name, size, savedAt, actions: history.actions.length }
    parsePackageSongHistory(history, descriptor)
    songHistories.push(descriptor)
  }
  const defaultThemes = readDefaultThemes()
  const hasThemes = Object.keys(defaultThemes).length > 0
  const presentationControls = readPresentationControlBackup()
  const hasControls = Object.keys(presentationControls).length > 0
  const outputAppearance = readOutputAppearanceBackup()
  const hasAppearance = Object.keys(outputAppearance).length > 0
  const nurserySettings = decodeNurserySettings(storedNurserySettings())
  const hasNursery = Object.keys(nurserySettings).length > 0
  const messageAlertSettings = decodeMessageAlertSettings(storedMessageAlertSettings())
  const hasMessages = Object.keys(messageAlertSettings).length > 0
  const catalogInfo = catalog && getCatalogDescriptor(catalog, addDocument(catalogBackupPath, catalog),
    missingCatalogMedia(catalog, new Set(backup.assets.map(({ id }) => id)),
      new Set(scheduleAssets.map(({ playlistId, archivePath }) => `${playlistId}\0${archivePath}`))))
  const resources = catalogInfo
    ? { version: 11, scriptureEditions, alertTemplates, songHistories, defaultThemes, presentationControls, outputAppearance,
      ...(hasNursery ? { nurserySettings } : {}), ...(hasMessages ? { messageAlertSettings } : {}),
      ...(alertResourceCatalogs.length ? { alertResourceCatalogs } : {}), catalog: catalogInfo } as const
    : alertResourceCatalogs.length
    ? { version: 10, scriptureEditions, alertTemplates, songHistories, defaultThemes, presentationControls, outputAppearance,
      ...(hasNursery ? { nurserySettings } : {}), ...(hasMessages ? { messageAlertSettings } : {}), alertResourceCatalogs } as const
    : hasMessages ? { version: 9, scriptureEditions, alertTemplates, songHistories, defaultThemes, presentationControls, outputAppearance,
      ...(hasNursery ? { nurserySettings } : {}), messageAlertSettings } as const
    : hasNursery ? { version: 8, scriptureEditions, alertTemplates, songHistories, defaultThemes, presentationControls, outputAppearance, nurserySettings } as const
    : hasAppearance ? { version: 7, scriptureEditions, alertTemplates, songHistories, defaultThemes, presentationControls, outputAppearance } as const
    : hasControls ? { version: 6, scriptureEditions, alertTemplates, songHistories, defaultThemes, presentationControls } as const
    : hasThemes ? { version: 5, scriptureEditions, alertTemplates, songHistories, defaultThemes } as const
    : songHistories.length ? { version: 4, scriptureEditions, alertTemplates, songHistories } as const
    : alertTemplates.length ? { version: 3, scriptureEditions, alertTemplates } as const
    : scriptureEditions.length ? { version: 2, scriptureEditions } as const : { version: 1 } as const
  const manifest: MediaLibraryPackage = {
    format: 'worshipteam.media-library', ...resources,
    items: backup.items, collectionSets, replacements, scheduleAssets,
    feeds: backup.feeds, dvds: backup.dvds, assets: [...blobs].map(([id, { blob, library }]) => ({ id, mime: blob.type, size: blob.size, library })),
  }
  const json = new Blob([JSON.stringify(manifest)], { type: 'application/json' })
  if (json.size > mediaPackageMaxManifest) throw new Error('รายการในแพ็กเกจมีขนาดเกิน 32 MB')
  if (!manifest.items.length && !manifest.assets.length && !manifest.feeds.length && !manifest.dvds.length
    && !collectionSets.length && !documents.size && !alertTemplates.length && !alertResourceCatalogs.length
    && !hasThemes && !hasControls && !hasAppearance && !hasNursery && !hasMessages) {
    throw new Error('คลังนี้ยังไม่มีรายการสำหรับส่งออก')
  }
  parseMediaLibraryPackage(JSON.parse(await json.text()))
  return { json, blobs, documents, unavailableVideos, unavailableThemeMedia: missingDefaultThemeMedia(manifest),
    unavailableCatalogMedia: catalogInfo?.missingMedia ?? [] }
}

type PreparedMediaLibrary = Awaited<ReturnType<typeof prepareMediaLibraryPackage>>

async function writeMediaLibraryArchive<T>(archive: ZipWriter<T>, { json, blobs, documents }: PreparedMediaLibrary, onProgress?: Progress) {
  await archive.add(manifestPath, new BlobReader(json))
  let completed = 0
  const total = blobs.size + documents.size
  for (const [id, { blob }] of blobs) {
    await archive.add(mediaBackupPath(id), new BlobReader(blob))
    onProgress?.(++completed, total)
  }
  for (const [path, blob] of documents) {
    await archive.add(path, new BlobReader(blob))
    onProgress?.(++completed, total)
  }
}

export async function exportMediaLibraryPackage(onProgress?: Progress, catalog?: LibraryCatalog) {
  const data = await prepareMediaLibraryPackage(downloadLimit, catalog)
  const archive = new ZipWriter(new BlobWriter('application/zip'), { level: 0 })
  try {
    await writeMediaLibraryArchive(archive, data, onProgress)
  } catch (error) {
    await archive.close().catch(() => {})
    throw error
  }
  return { file: await archive.close(), unavailableVideos: data.unavailableVideos, unavailableThemeMedia: data.unavailableThemeMedia,
    unavailableCatalogMedia: data.unavailableCatalogMedia }
}

export async function saveMediaLibraryPackageTo(handle: Pick<FileSystemFileHandle, 'createWritable'>, onProgress?: Progress, catalog?: LibraryCatalog) {
  const data = await prepareMediaLibraryPackage(undefined, catalog)
  const file = await handle.createWritable()
  try {
    const archive = new ZipWriter(file, { level: 0, zip64: true, preventClose: true })
    await writeMediaLibraryArchive(archive, data, onProgress)
    await archive.close()
    await file.close()
    return { unavailableVideos: data.unavailableVideos, unavailableThemeMedia: data.unavailableThemeMedia,
      unavailableCatalogMedia: data.unavailableCatalogMedia }
  } catch (error) {
    await file.abort(error).catch(() => {})
    throw error
  }
}

async function readArchive(archive: ZipReader<BlobReader>) {
  const entries = new Map<string, FileEntry>()
  for await (const entry of archive.getEntriesGenerator()) {
    if (entry.directory || entry.encrypted || entry.compressionMethod !== 0 || entry.compressedSize !== entry.uncompressedSize
      || entries.has(entry.filename) || entries.size > mediaPackageMaxFiles) {
      throw new Error('พบรายการไฟล์ที่ไม่ถูกต้องในแพ็กเกจคลังสื่อ')
    }
    entries.set(entry.filename, entry)
  }
  const header = entries.get(manifestPath)
  if (!header || header.uncompressedSize > mediaPackageMaxManifest) throw new Error('ไม่พบรายการสำรองหรือข้อมูลมีขนาดเกิน 32 MB')
  const manifest = parseMediaLibraryPackage(JSON.parse(await header.getData(new TextWriter(), { checkCrc32: true, checkOverlappingEntry: true })))
  if (manifest.assets.some(({ id, size }) => entries.get(mediaBackupPath(id))?.uncompressedSize !== size)) {
    throw new Error('ไฟล์สื่อในแพ็กเกจไม่ครบหรือมีขนาดไม่ตรงกับรายการ')
  }
  if (manifest.scriptureEditions?.some(({ size }, index) => entries.get(scriptureBackupPath(index))?.uncompressedSize !== size)) {
    throw new Error('ไฟล์พระคัมภีร์ในแพ็กเกจไม่ครบหรือมีขนาดไม่ตรงกับรายการ')
  }
  if (manifest.songHistories?.some(({ size }, index) => entries.get(historyBackupPath(index))?.uncompressedSize !== size)) {
    throw new Error('ไฟล์ประวัติการใช้เพลงในแพ็กเกจไม่ครบหรือมีขนาดไม่ตรงกับรายการ')
  }
  const { catalog: descriptor } = manifest
  const database = descriptor ? entries.get(catalogBackupPath) : undefined
  if (descriptor && (!database || database.uncompressedSize !== descriptor.size)) {
    throw new Error('ไฟล์ฐานข้อมูลในแพ็กเกจไม่ครบหรือมีขนาดไม่ตรงกับรายการ')
  }
  if (entries.size !== 1 + manifest.assets.length + (manifest.scriptureEditions?.length ?? 0) + (manifest.songHistories?.length ?? 0) + (database ? 1 : 0)) {
    throw new Error('พบไฟล์ที่ไม่อยู่ในรายการแพ็กเกจคลังสื่อ')
  }
  const catalog = database && parseLibraryCatalog(await readJsonEntry(database), descriptor)
  return { entries, manifest, catalog }
}

class MediaPackageReader extends BlobReader {
  override readUint8Array(index: number, length: number) {
    // zip.js can read the central directory in one chunk. Keep metadata bounded independently of file size.
    if (length > mediaPackageMaxManifest) throw new Error('ข้อมูลกำกับแพ็กเกจคลังสื่อมีขนาดเกินกำหนด')
    return super.readUint8Array(index, length)
  }
}

function openArchive(file: Blob) {
  return new ZipReader(new MediaPackageReader(file), { strictness: 'strict' })
}

export async function reviewMediaLibraryPackage(file: Blob) {
  const archive = openArchive(file)
  try { return (await readArchive(archive)).manifest }
  finally { await archive.close() }
}

async function readJsonEntry(entry: FileEntry): Promise<unknown> {
  return JSON.parse(await entry.getData(new TextWriter(), { checkCrc32: true, checkOverlappingEntry: true }))
}

export async function importMediaLibraryPackage(file: Blob, onProgress?: Progress) {
  const archive = openArchive(file)
  try {
    const { manifest, entries, catalog } = await readArchive(archive)
    const byAsset = new Map<string, MediaLibraryItem[]>()
    for (const item of manifest.items) {
      const items = byAsset.get(item.assetId) ?? []
      items.push(item)
      byAsset.set(item.assetId, items)
    }
    const bySchedule = new Map<string, PackageScheduleAsset[]>()
    for (const attachment of manifest.scheduleAssets) {
      const group = bySchedule.get(attachment.assetId) ?? []
      group.push(attachment)
      bySchedule.set(attachment.assetId, group)
    }
    const previouslyVisible = new Set(manifest.items.length ? (await listLibraryMedia()).map(({ id }) => id) : [])
    const updatedItems = new Set<string>()
    let restoredAttachments = 0
    let completed = 0
    const total = manifest.assets.length + (manifest.scriptureEditions?.length ?? 0) + (manifest.songHistories?.length ?? 0)
    for (const asset of manifest.assets) {
      const entry = entries.get(mediaBackupPath(asset.id))
      if (!entry) throw new Error('ไม่พบไฟล์สื่อในแพ็กเกจ')
      // Stored ZIP entries can be read as a slice of the original file after zip.js validates the local header.
      await entry.getData(new WritableStream(), { checkOverlappingEntryOnly: true })
      const offset = entry.localDirectory?.dataOffset
      if (offset === undefined) throw new Error('อ่านตำแหน่งไฟล์สื่อในแพ็กเกจไม่ได้')
      const blob = file.slice(offset, offset + asset.size, asset.mime)
      if (blob.size !== asset.size || await mediaLibraryAssetId(blob) !== asset.id) {
        throw new Error('เนื้อหาไฟล์สื่อไม่ตรงกับรหัสในแพ็กเกจ')
      }
      if (asset.library) {
        const saved = await restoreMediaLibraryAsset({ id: asset.id, blob }, byAsset.get(asset.id) ?? [])
        saved.forEach((id) => updatedItems.add(id))
      }
      restoredAttachments += await restoreScheduleMediaAssets((bySchedule.get(asset.id) ?? []).map(({ playlistId, archivePath, mime }) => ({
        playlistId, archivePath, blob: blob.type === mime ? blob : blob.slice(0, blob.size, mime),
      })))
      onProgress?.(++completed, total)
    }
    let scriptureEditions = 0
    for (const [index, descriptor] of (manifest.scriptureEditions ?? []).entries()) {
      const entry = entries.get(scriptureBackupPath(index))
      if (!entry) throw new Error(`ไม่พบไฟล์พระคัมภีร์ ${descriptor.name} ในแพ็กเกจ`)
      if (await restoreScriptureEdition(parsePackageScripture(await readJsonEntry(entry), descriptor))) scriptureEditions++
      onProgress?.(++completed, total)
    }
    let songHistories = 0
    let songHistoryEvents = 0
    for (const [index, descriptor] of (manifest.songHistories ?? []).entries()) {
      const entry = entries.get(historyBackupPath(index))
      if (!entry) throw new Error(`ไม่พบไฟล์ประวัติการใช้เพลง ${descriptor.name} ในแพ็กเกจ`)
      const history = parsePackageSongHistory(await readJsonEntry(entry), descriptor)
      const restored = await restoreSongHistory(history, descriptor.savedAt)
      songHistories += restored.histories
      songHistoryEvents += restored.events
      onProgress?.(++completed, total)
    }
    const sources = await restoreMediaLibrarySources(manifest.feeds, manifest.dvds)
    let videoLinks = 0
    for (const { dvdId, replacement } of manifest.replacements) {
      if (readDvdReplacement(dvdId)) continue
      saveDvdReplacement(dvdId, replacement)
      videoLinks++
    }
    const collectionSets = await restoreCollectionSets(manifest.collectionSets)
    const alertTemplates = await restoreAlertTemplates(manifest.alertTemplates ?? [])
    const alertResourceCatalogs = await restoreAlertResourceCatalogs(manifest.alertResourceCatalogs ?? [])
    const defaultThemes = manifest.defaultThemes ? saveDefaultThemes(manifest.defaultThemes, true) : 0
    const presentationControls = manifest.presentationControls ? restorePresentationControlBackup(manifest.presentationControls) : 0
    const outputAppearance = manifest.outputAppearance ? restoreOutputAppearanceBackup(manifest.outputAppearance) : 0
    const nurserySettings = manifest.nurserySettings ? saveNurserySettings(manifest.nurserySettings, true) : 0
    const messageAlertSettings = manifest.messageAlertSettings ? saveMessageAlertSettings(manifest.messageAlertSettings, true) : 0
    const visibleItems = updatedItems.size ? (await listLibraryMedia()).filter(({ id }) => updatedItems.has(id) && !previouslyVisible.has(id)).length : 0
    return { items: updatedItems.size, visibleItems, attachments: restoredAttachments, ...sources, videoLinks, collectionSets, scriptureEditions, alertTemplates,
      alertResourceCatalogs, songHistories, songHistoryEvents, defaultThemes, presentationControls, outputAppearance, nurserySettings, messageAlertSettings, catalog }
  } finally { await archive.close() }
}
