/** Saves the selected records of a reviewed EasyWorship profile with independent stage results. */

import type { DesignInput, ImportSlideDesigns } from '../hooks/useSlideDesigns'
import type { SongImportBatch } from '../hooks/useEasyWorshipImport'
import type { SavedEasyWorshipSchedule, ScheduleImportOptions } from '../hooks/useEasyWorshipScheduleImport'
import type { PlaylistCue } from '../types/database'
import type { EasyWorshipSong } from './easyWorship'
import type { EasyWorshipProfileReview } from './easyWorshipProfile'
import type { WithMediaBlob } from './zipAsset'
import { withReviewedMedia } from './easyWorshipMedia'
import { readEasyWorshipBible } from './easyWorshipBible'
import { createProfileScheduleImporter } from './easyWorshipProfileSchedule'
import { importIdentity } from './importIdentity'
import { listLibraryMedia, saveLibraryDvd, saveLibraryFeed, saveMigratedLibraryMedia } from './mediaLibrary'
import { reviewCatalogedPowerPoint, savePowerPointDesign } from './powerPoint'
import { profilePowerPointMediaCandidates } from './easyWorshipProfilePowerPointMedia'
import { createPowerPointMediaResolver } from './powerPoint/linkedMedia'
import { saveScheduleMedia, scheduleMediaAssets, stageRecoveredScheduleMedia } from './scheduleMedia'
import { restoreScriptureEdition } from './scriptureLibrary'
import { saveSongHistory } from './songHistoryLibrary'
import { addImportedAlertResourceCatalog, addImportedAlertTemplate } from './alertTemplateLibrary'
import { alertOutputLabels } from '../types/alertTemplate'
import { saveNurserySettings } from './nurseryAlerts'
import { saveMessageAlertSettings } from './messageAlertSettings'
import { restoreOutputAppearanceBackup, restoreScriptureOutputSettings } from './outputSettingsStorage'
import { outputLabels } from './outputSettings'
import { foldbackContentLabels, foldbackContentRoles, foldbackContentSourceId } from './foldbackAppearance'
import { hasPresentationFields, readDefaultThemes, saveDefaultThemes } from './defaultThemes'
import { saveEasyWorshipCollectionSet } from './collectionLibrary'
import { easyWorshipDesignIdentityContent, storeSlideDesignAssets } from './slideDesignAssets'
import { backfillDesignMediaPlayback, backfillDesignSlidePlayback, hasDesignMediaPlayback, hasDesignSlidePlayback } from './designSlidePlayback'
import { hasDesignGeometry, restoreSlideGeometry } from './designLayerGeometry'

export type ProfileCategory = 'songs' | 'media' | 'feeds' | 'dvds' | 'designs' | 'powerPoints' | 'schedules' | 'bibles' | 'songHistory' | 'collections' | 'alerts' | 'alertCatalog' | 'nursery' | 'messageStyles' | 'defaultThemes' | 'foldbackAppearance' | 'foldbackService' | 'foldbackContent' | 'scriptureOutputs'
export type ProfileImportSelection = Record<ProfileCategory, Set<string>>
export type ProfileItemOutcome = {
  sourceId: string
  status: 'saved' | 'duplicate' | 'verified' | 'failed'
  destinationId?: string
  filled?: boolean
  restoredSongLabels?: number
  restoredFormatting?: number
  restoredSlidePlayback?: number
  restoredMediaPlayback?: number
  restoredScripture?: number
  restoredFeedVideo?: number
  restoredMasterBackgrounds?: number
  restoredMasterSoundtracks?: number
  restoredLayerRotations?: number
  restoredShapeMasks?: number
  restoredElementBorders?: number
  restoredElementShadows?: number
  restoredElementReflections?: number
  linkedSongs?: number
  ambiguousSongs?: number
  linkedPresentations?: number
  ambiguousPresentations?: number
  restoredPowerPoints?: number
  keptPowerPoints?: number
  restoredMedia?: number
  notes?: string[]
  error?: string
}
export type ProfileStageResult = {
  key: ProfileCategory
  total: number
  processed: number
  saved: number
  duplicates: number
  verified: number
  filled?: number
  restoredSongLabels?: number
  restoredFormatting?: number
  restoredSlidePlayback?: number
  restoredMediaPlayback?: number
  restoredScripture?: number
  restoredFeedVideo?: number
  restoredMasterBackgrounds?: number
  restoredMasterSoundtracks?: number
  restoredLayerRotations?: number
  restoredShapeMasks?: number
  restoredElementBorders?: number
  restoredElementShadows?: number
  restoredElementReflections?: number
  linkedSongs?: number
  ambiguousSongs?: number
  linkedPresentations?: number
  ambiguousPresentations?: number
  restoredPowerPoints?: number
  keptPowerPoints?: number
  restoredMedia?: number
  failures: { name: string; message: string }[]
  links: { name: string; id: string }[]
  items: ProfileItemOutcome[]
}

export type ProfileImportProgress = Pick<ProfileStageResult, 'key' | 'total' | 'processed'>
export type ProfileImportResult = { stages: Partial<Record<ProfileCategory, ProfileStageResult>> }

type ProfileWriters = {
  songs: (
    songs: EasyWorshipSong[], onBatch: (counts: SongImportBatch) => void,
    readAsset?: (path: string) => Promise<Blob>,
    withAsset?: WithMediaBlob,
  ) => Promise<void>
  resolveSongIds: (ids: string[]) => Promise<Map<string, string>>
  designs: ImportSlideDesigns
  schedule: (id: string, name: string, cues: PlaylistCue[], options?: ScheduleImportOptions) => Promise<SavedEasyWorshipSchedule>
}

function errorMessage(error: unknown, fallback = 'นำเข้าไม่สำเร็จ'): string {
  if (error instanceof Error && error.name === 'QuotaExceededError') return 'พื้นที่จัดเก็บข้อมูลในเบราว์เซอร์ไม่พอ'
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

export async function runEasyWorshipProfileImport(
  review: EasyWorshipProfileReview,
  selection: ProfileImportSelection,
  writers: ProfileWriters,
  onProgress?: (stage: ProfileImportProgress) => void,
): Promise<ProfileImportResult> {
  const stages: ProfileImportResult['stages'] = {}
  function emit({ key, total, processed }: ProfileStageResult) {
    onProgress?.({ key, total, processed })
  }
  function start(key: ProfileCategory, total: number) {
    const stage: ProfileStageResult = { key, total, processed: 0, saved: 0, duplicates: 0, verified: 0, failures: [], links: [], items: [] }
    stages[key] = stage
    emit(stage)
    return stage
  }
  function record(stage: ProfileStageResult, name: string, item: ProfileItemOutcome) {
    stage.items.push(item)
    stage.processed++
    if (item.status === 'saved') stage.saved++
    if (item.status === 'duplicate') stage.duplicates++
    if (item.status === 'verified') stage.verified++
    if (item.filled) stage.filled = (stage.filled ?? 0) + 1
    if (item.restoredSongLabels) stage.restoredSongLabels = (stage.restoredSongLabels ?? 0) + item.restoredSongLabels
    if (item.restoredFormatting) stage.restoredFormatting = (stage.restoredFormatting ?? 0) + item.restoredFormatting
    if (item.restoredSlidePlayback) stage.restoredSlidePlayback = (stage.restoredSlidePlayback ?? 0) + item.restoredSlidePlayback
    if (item.restoredMediaPlayback) stage.restoredMediaPlayback = (stage.restoredMediaPlayback ?? 0) + item.restoredMediaPlayback
    if (item.restoredScripture) stage.restoredScripture = (stage.restoredScripture ?? 0) + item.restoredScripture
    if (item.restoredFeedVideo) stage.restoredFeedVideo = (stage.restoredFeedVideo ?? 0) + item.restoredFeedVideo
    if (item.restoredMasterBackgrounds) stage.restoredMasterBackgrounds = (stage.restoredMasterBackgrounds ?? 0) + item.restoredMasterBackgrounds
    if (item.restoredMasterSoundtracks) stage.restoredMasterSoundtracks = (stage.restoredMasterSoundtracks ?? 0) + item.restoredMasterSoundtracks
    if (item.restoredLayerRotations) stage.restoredLayerRotations = (stage.restoredLayerRotations ?? 0) + item.restoredLayerRotations
    if (item.restoredShapeMasks) stage.restoredShapeMasks = (stage.restoredShapeMasks ?? 0) + item.restoredShapeMasks
    if (item.restoredElementBorders) stage.restoredElementBorders = (stage.restoredElementBorders ?? 0) + item.restoredElementBorders
    if (item.restoredElementShadows) stage.restoredElementShadows = (stage.restoredElementShadows ?? 0) + item.restoredElementShadows
    if (item.restoredElementReflections) stage.restoredElementReflections = (stage.restoredElementReflections ?? 0) + item.restoredElementReflections
    if (item.linkedSongs) stage.linkedSongs = (stage.linkedSongs ?? 0) + item.linkedSongs
    if (item.ambiguousSongs) stage.ambiguousSongs = (stage.ambiguousSongs ?? 0) + item.ambiguousSongs
    if (item.linkedPresentations) stage.linkedPresentations = (stage.linkedPresentations ?? 0) + item.linkedPresentations
    if (item.ambiguousPresentations) stage.ambiguousPresentations = (stage.ambiguousPresentations ?? 0) + item.ambiguousPresentations
    if (item.restoredPowerPoints) stage.restoredPowerPoints = (stage.restoredPowerPoints ?? 0) + item.restoredPowerPoints
    if (item.keptPowerPoints) stage.keptPowerPoints = (stage.keptPowerPoints ?? 0) + item.keptPowerPoints
    if (item.restoredMedia) stage.restoredMedia = (stage.restoredMedia ?? 0) + item.restoredMedia
    if (item.error) stage.failures.push({ name, message: item.error })
  }
  async function process<T>(
    key: ProfileCategory, rows: T[], identify: (row: T) => [sourceId: string, name: string],
    save: (row: T, stage: ProfileStageResult) => Promise<'saved' | 'duplicate' | Omit<ProfileItemOutcome, 'sourceId'>>,
  ) {
    if (!rows.length) return
    const stage = start(key, rows.length)
    for (const row of rows) {
      const [sourceId, name] = identify(row)
      try {
        const outcome = await save(row, stage)
        record(stage, name, { sourceId, ...(typeof outcome === 'string' ? { status: outcome } : outcome) })
      } catch (error) {
        record(stage, name, { sourceId, status: 'failed', error: errorMessage(error) })
      }
      emit(stage)
    }
  }

  const songs = review.songs?.songs.filter((song) => selection.songs.has(song.sourceId)) ?? []
  if (songs.length) {
    const stage = start('songs', songs.length)
    const titles = new Map(songs.map((song) => [song.sourceId, song.title]))
    try {
      await writers.songs(songs, ({ items }) => {
        for (const item of items) record(stage, titles.get(item.sourceId) ?? item.sourceId, item)
        emit(stage)
      }, review.songs?.readAppearanceAsset, review.withAsset)
    } catch (error) {
      const remaining = songs.length - stage.processed
      if (remaining > 0) stage.failures.push({ name: `เพลงที่ยังไม่เริ่ม ${remaining} รายการ`, message: errorMessage(error) })
      emit(stage)
    }
  }

  const history = review.songHistory && selection.songHistory.has(review.songHistory.id) ? [review.songHistory] : []
  await process('songHistory', history, (item) => [item.id, item.filename], saveSongHistory)
  await process('alerts', review.alerts.filter((item) => selection.alerts.has(item.id)), (item) => [item.id, item.title], addImportedAlertTemplate)
  const catalog = review.alertCatalog
  if (catalog && selection.alertCatalog.has(catalog.id)) {
    await process('alertCatalog', [catalog], (item) => [item.id, item.sourceName], addImportedAlertResourceCatalog)
  }
  await process('nursery', review.nursery.filter((item) => selection.nursery.has(item.id)), (item) => [item.id, alertOutputLabels[item.output]],
    async ({ output, style }) => saveNurserySettings({ [output]: style }, true) ? 'saved' : 'duplicate')
  await process('messageStyles', review.messageStyles.filter((item) => selection.messageStyles.has(item.id)), (item) => [item.id, alertOutputLabels[item.output]],
    async ({ output, style }) => saveMessageAlertSettings({ [output]: style }, true) ? 'saved' : 'duplicate')
  const foldback = review.foldbackAppearance
  if (foldback && selection.foldbackAppearance.has(foldback.id)) {
    await process('foldbackAppearance', [foldback], (item) => [item.id, 'จอเวที'],
      async ({ appearance }) => restoreOutputAppearanceBackup({ foldback: appearance }) ? 'saved' : 'duplicate')
  }
  const service = review.foldbackService
  if (service && selection.foldbackService.has(service.id)) {
    await process('foldbackService', [service], (item) => [item.id, 'เวลานับถอยหลังบนจอเวที'],
      async ({ settings }) => restoreOutputAppearanceBackup({ foldbackService: settings }) ? 'saved' : 'duplicate')
  }
  const content = review.foldbackContent
  if (content) {
    const styles = foldbackContentRoles.flatMap((role) => {
      const id = foldbackContentSourceId(content.path, role)
      const style = content.styles[role]
      return style && selection.foldbackContent.has(id) ? [{ id, role, style }] : []
    })
    await process('foldbackContent', styles, ({ id, role }) => [id, foldbackContentLabels[role]],
      async ({ role, style }) => restoreOutputAppearanceBackup({ foldbackContent: { [role]: style } }) ? 'saved' : 'duplicate')
  }
  await process('scriptureOutputs', review.scriptureOutputs.filter(({ id }) => selection.scriptureOutputs.has(id)),
    ({ id, output }) => [id, outputLabels[output]],
    async ({ output, settings }) => restoreScriptureOutputSettings(output, settings) ? 'saved' : 'duplicate')
  const collections = review.collections && selection.collections.has(review.collections.id) ? [review.collections] : []
  await process('collections', collections, (item) => [item.id, item.filename], async (item) => {
    const ids = new Set(item.collections.filter(({ resource }) => resource === 'songs').flatMap((group) =>
      [...group.songIds, ...Object.values(group.resourceItems ?? {})]))
    const resolved = await writers.resolveSongIds([...ids])
    const destination = (id: string) => resolved.get(id) ?? id
    return saveEasyWorshipCollectionSet({ ...item, collections: item.collections.map((group) => group.resource !== 'songs' ? group : {
      ...group, songIds: group.songIds.map(destination),
      ...(group.resourceItems ? { resourceItems: Object.fromEntries(Object.entries(group.resourceItems)
        .map(([source, id]) => [source, destination(id)])) } : {}),
    }) })
  })
  const defaults = review.defaultThemes.filter((theme) => selection.defaultThemes.has(theme.id))
  await process('defaultThemes', defaults, (theme) => [theme.id, theme.title], async (theme) => {
    const current = readDefaultThemes()[theme.slot]
    const upgrading = current && current.title === theme.title && !hasPresentationFields(current.slides)
      && hasPresentationFields(theme.content.slides)
    const canRestoreDetails = current && current.title === theme.title
      && (hasDesignSlidePlayback(theme.content.slides) || hasDesignMediaPlayback(theme.content.slides)
        || theme.content.slides.some(({ design }) => hasDesignGeometry(design)))
    if (current !== undefined && !upgrading && !canRestoreDetails) return 'duplicate'
    const missing = theme.content.slides.flatMap((slide) => slide.design.layers.flatMap((layer) =>
      layer.kind === 'media' && !layer.asset.sourcePath ? [layer.asset.filename] : []))
    if (missing.length) {
      if (current) return 'duplicate'
      throw new Error(`ไม่พบไฟล์สื่อใน Resources · ${[...new Set(missing)].join(', ')}`)
    }
    const content = await storeSlideDesignAssets(theme.content, review.readAsset, { withAsset: review.withAsset })
    const id = await importIdentity(['easyworship-default-theme-v1', theme.slot, theme.title, easyWorshipDesignIdentityContent(content, theme.legacyTransitionWarningAt)])
    if (!current) {
      const saved = saveDefaultThemes({ [theme.slot]: { id, title: theme.title, slides: content.slides,
        ...(theme.slot.endsWith(':logo') && content.looping !== undefined ? { looping: content.looping } : {}) } }, true)
      return saved ? 'saved' : 'duplicate'
    }
    if (current.id !== id || JSON.stringify(readDefaultThemes()[theme.slot]) !== JSON.stringify(current)) return 'duplicate'
    const playback = backfillDesignSlidePlayback(current.slides, content.slides)
    const media = backfillDesignMediaPlayback(playback.slides, content.slides)
    const geometry = restoreSlideGeometry(media.slides, content.slides)
    if (!upgrading && !playback.count && !media.count && geometry.slides === media.slides) return 'duplicate'
    const savedSlides = new Map(geometry.slides.map((slide) => [slide.id, slide]))
    const slides = upgrading ? content.slides.map((slide) => {
      const prior = savedSlides.get(slide.id)
      if (!prior) return slide
      const { advanceMs, playback, transition, transitionEdited } = prior
      return { ...slide, advanceMs, playback, transition, transitionEdited }
    }) : geometry.slides
    saveDefaultThemes({ [theme.slot]: { ...current, slides } })
    return { status: 'duplicate', restoredSlidePlayback: playback.count, restoredMediaPlayback: media.count,
      restoredLayerRotations: geometry.rotations, restoredShapeMasks: geometry.masks, restoredElementBorders: geometry.borders,
      restoredElementShadows: geometry.shadows, restoredElementReflections: geometry.reflections }
  })

  const media = review.media?.entries?.filter((entry) => selection.media.has(entry.sourceId) && entry.readFile) ?? []
  const existingMedia = media.length ? await listLibraryMedia()
    .then((items) => new Set(items.map((item) => item.id))).catch(() => undefined) : undefined
  await process('media', media, (entry) => [entry.sourceId, entry.name], async (entry) => {
    if (!entry.readFile) throw new Error('ไม่พบไฟล์สื่อที่อ้างอิง')
    const uid = entry.metadata?.mediaUid
    const sourceId = entry.importSourceId ?? (entry.unregistered ? undefined : typeof uid === 'string' ? uid : `${review.profile.files.media}:${entry.sourceId}`)
    const saved = await withReviewedMedia(entry, (blob) => saveMigratedLibraryMedia(blob, { ...entry, sourceId }))
    if (!existingMedia) return { status: 'verified', destinationId: saved.id }
    if (existingMedia.has(saved.id)) return { status: 'duplicate', destinationId: saved.id }
    existingMedia.add(saved.id)
    return { status: 'saved', destinationId: saved.id }
  })

  const feeds = review.media?.feeds?.filter((feed) => selection.feeds.has(feed.id)) ?? []
  await process('feeds', feeds, (feed) => [feed.id, feed.name], ({ sourceId: _row, ...feed }) => saveLibraryFeed(feed))

  const dvds = review.media?.dvds?.filter((clip) => selection.dvds?.has(clip.id)) ?? []
  await process('dvds', dvds, (clip) => [clip.id, clip.name], saveLibraryDvd)

  const designs = review.designs?.entries?.filter((entry) => selection.designs.has(entry.exportId ?? entry.layoutId) && entry.content.slides.length) ?? []
  if (designs.length) {
    const stage = start('designs', designs.length)
    const cache = new Map<string, string | null>()
    const readAsset = review.designs?.readAsset
    const batchSize = 10
    for (let offset = 0; offset < designs.length; offset += batchSize) {
      const batch = designs.slice(offset, offset + batchSize)
      const prepared: { sourceId: string; row: DesignInput }[] = []
      const independentIds = new Set<string>()
      for (const entry of batch) {
        const sourceId = entry.exportId ?? entry.layoutId
        try {
          const content = readAsset ? await storeSlideDesignAssets(entry.content, readAsset,
            { cache, withAsset: review.designs?.withAsset ?? review.withAsset }) : entry.content
          const id = entry.exportId ?? await importIdentity(['easyworship-design-v1', entry.kind, entry.title, easyWorshipDesignIdentityContent(content, entry.legacyTransitionWarningAt)])
          prepared.push({ sourceId, row: { id, title: entry.title, kind: entry.kind, content } })
          if (entry.exportId) independentIds.add(id)
        } catch (error) {
          record(stage, entry.title, { sourceId, status: 'failed', error: errorMessage(error) })
        }
      }
      if (prepared.length) {
        try {
          const inserted = new Set<string>()
          const matched = new Map<string, { destinationId: string; restoredSlidePlayback: number; restoredMediaPlayback?: number }>()
          await writers.designs(prepared.map(({ row }) => row), (ids) => {
            for (const id of ids) inserted.add(id)
          }, (importId, destinationId, restoredSlidePlayback, restoredMediaPlayback) =>
            matched.set(importId, { destinationId, restoredSlidePlayback, restoredMediaPlayback }), independentIds)
          for (const { sourceId, row } of prepared) {
            record(stage, row.title, {
              sourceId, destinationId: row.id, ...matched.get(row.id), status: inserted.delete(row.id) ? 'saved' : 'duplicate',
              notes: row.content.warnings,
            })
          }
        } catch (error) {
          for (const { sourceId, row } of prepared) {
            record(stage, row.title, { sourceId, status: 'failed', error: errorMessage(error) })
          }
        }
      }
      emit(stage)
    }
  }

  const powerPoints = review.designs?.powerPoints?.filter((entry) => selection.powerPoints.has(entry.id) && entry.sourcePath) ?? []
  const powerPointMedia = createPowerPointMediaResolver(profilePowerPointMediaCandidates(review))
  await process('powerPoints', powerPoints, (entry) => [entry.id, entry.title], async (entry) => {
    const blob = entry.sourcePath && await review.designs?.readAsset?.(entry.sourcePath)
    if (!blob) throw new Error('ไม่พบไฟล์ PowerPoint ที่อ้างอิง')
    const deck = await reviewCatalogedPowerPoint(blob, entry, powerPointMedia)
    const row = await savePowerPointDesign(deck)
    const added = await writers.designs([row])
    return { status: added ? 'saved' : 'duplicate', destinationId: row.id, notes: row.content.warnings }
  })

  const bibles = review.bibles.filter((entry) => !entry.warning && selection.bibles.has(entry.path))
  await process('bibles', bibles, (entry) => [entry.path, entry.info?.edition.name ?? entry.filename], async (entry) => {
    const edition = await readEasyWorshipBible(await entry.readFile())
    const added = await restoreScriptureEdition(edition)
    return { status: added ? 'saved' : 'duplicate', destinationId: edition.id }
  })

  const schedules = review.schedules.filter((entry) => selection.schedules.has(entry.path))
  const prepareSchedule = createProfileScheduleImporter(review)
  await process('schedules', schedules, (entry) => [entry.path, entry.filename], async (entry, stage) => {
    async function importSchedule(file: File) {
      const prepared = await prepareSchedule(file)
      const title = entry.filename.replace(/\.ewsx?$/i, '')
      const { playlistId, status, restoredSongLabels, restoredFormatting, restoredSlidePlayback, restoredMediaPlayback, restoredScripture, restoredFeedVideo, restoredMasterBackgrounds, restoredMasterSoundtracks, linkedSongs, ambiguousSongs,
        linkedPresentations, ambiguousPresentations, restoredLayerRotations, restoredShapeMasks, restoredElementBorders, restoredElementShadows, restoredElementReflections,
        restoredPowerPoints, keptPowerPoints, keptPowerPointMedia, restoredMedia } = await writers.schedule(prepared.sourceId, title, prepared.cues, {
        labels: prepared.songLabels, scripture: prepared.scripture, previousSourceId: prepared.previousSourceId,
        powerPoint: prepared.powerPoint, powerPointMediaIds: prepared.powerPointMediaIds, media: prepared.media,
        stageMasterSoundtracks: stageRecoveredScheduleMedia(file, prepared.packedMedia),
      })
      stage.links.push({ name: title, id: playlistId })
      const assets = scheduleMediaAssets(prepared.cues).concat((keptPowerPointMedia ?? [])
        .filter(({ archivePath }) => archivePath && prepared.packedMedia?.has(archivePath)))
      const problems = [...prepared.problems]
      try {
        const { missing, videoErrors } = await saveScheduleMedia(file, playlistId, assets, prepared.packedMedia)
        if (missing) problems.push(`เก็บสื่อที่บรรจุไม่สำเร็จ ${missing} ไฟล์`)
        if (videoErrors) problems.push(...videoErrors)
      } catch (error) {
        problems.push(errorMessage(error, 'บันทึกสื่อของตารางไม่สำเร็จ'))
      }
      return { status, destinationId: playlistId, restoredSongLabels, restoredFormatting, restoredSlidePlayback, restoredMediaPlayback, restoredScripture, restoredFeedVideo, restoredMasterBackgrounds, restoredMasterSoundtracks, linkedSongs, ambiguousSongs,
        linkedPresentations, ambiguousPresentations, restoredLayerRotations, restoredShapeMasks, restoredElementBorders, restoredElementShadows, restoredElementReflections,
        restoredPowerPoints, keptPowerPoints, restoredMedia, ...(problems.length ? { error: problems.join(' · ') } : {}) }
    }
    return entry.withFile ? entry.withFile(importSchedule) : importSchedule(await entry.readFile())
  })
  return { stages }
}
