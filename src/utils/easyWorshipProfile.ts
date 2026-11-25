/** Combines same-profile EasyWorship catalogue reviews while keeping files browser-local. */

import { recoverEasyWorshipLyrics, type EasyWorshipImport } from './easyWorship'
import { readEasyWorshipBibleInfo, type EasyWorshipBibleInfo } from './easyWorshipBible'
import type { AlertResourceCatalog, AlertTemplate } from '../types/alertTemplate'
import { makeAlertResourceCatalog, readEasyWorshipAlerts, readEasyWorshipServiceIntervals } from './easyWorshipAlerts'
import type { LegacySongEncoding } from './easyWorshipEncoding'
import { readEasyWorshipSongLibrary } from './easyWorshipSongLibrary'
import { readEasyWorshipSongHistory, type SongHistory } from './easyWorshipSongHistory'
import { readEasyWorshipCollections, type EasyWorshipCollectionSet } from './easyWorshipCollections'
import { mediaCollectionRows, resolveResourceCollections } from './easyWorshipResourceCollections'
import { readEasyWorshipDefaultThemes, readEasyWorshipFoldbackSettings, readEasyWorshipMessageStyle, readEasyWorshipNurseryStyle,
  reviewEasyWorshipDesignsFromSource, reviewEasyWorshipDesignExports, type EasyWorshipDefaultTheme, type EasyWorshipDesignReview, type EasyWorshipMessageStyle,
  type EasyWorshipNurseryStyle, type EasyWorshipScriptureOutput } from './easyWorshipDesigns'
import { attachEasyWorshipMediaFiles, easyWorshipArtworkContext, easyWorshipMediaInputMime,
  reviewEasyWorshipMediaFromSource, withEasyWorshipLibraryMedia, type EasyWorshipMediaReview } from './easyWorshipMedia'
import { songAppearanceAssets } from './easyWorshipSongAppearance'
import { designCollectionKey } from './collectionLibrary'
import { logoMediaTheme, themeOutputLabels } from './defaultThemes'
import { resolveLibraryMediaPlayback } from './mediaPlayback'
import type { FoldbackAppearance, FoldbackContentSettings, FoldbackServiceSettings } from './foldbackAppearance'
import {
  createEasyWorshipProfileFiles,
  easyWorshipWalWarning,
  withProfileMedia,
  type EasyWorshipLazyFile,
  type EasyWorshipOptionSet,
  type EasyWorshipProfileFiles,
  type EasyWorshipProfileInventory,
} from './easyWorshipProfileFiles'
import type { WithMediaBlob } from './zipAsset'
import { combineProfileDesignExports, withDesignExportMedia } from './easyWorshipProfileDesignExports'

export type EasyWorshipProfileReview = {
  profile: EasyWorshipProfileInventory
  options?: EasyWorshipOptionSet
  legacyEncoding?: LegacySongEncoding
  songs?: EasyWorshipImport
  songHistory?: SongHistory
  alerts: AlertTemplate[]
  alertCatalog?: AlertResourceCatalog
  nursery: EasyWorshipNurseryStyle[]
  messageStyles: EasyWorshipMessageStyle[]
  foldbackAppearance?: { id: string; appearance: FoldbackAppearance }
  foldbackService?: { id: string; settings: FoldbackServiceSettings }
  foldbackContent?: { path: string; styles: FoldbackContentSettings }
  scriptureOutputs: EasyWorshipScriptureOutput[]
  defaultThemes: EasyWorshipDefaultTheme[]
  readAsset: (path: string) => Promise<Blob>
  withAsset?: WithMediaBlob
  collections?: EasyWorshipCollectionSet
  media?: EasyWorshipMediaReview
  designs?: EasyWorshipDesignReview
  schedules: EasyWorshipLazyFile[]
  bibles: (EasyWorshipLazyFile & { info?: EasyWorshipBibleInfo; warning?: string })[]
  resources: { path: string; filename: string; size?: number; hashOnly?: true; attached?: true; externalPath?: string; readFile: () => Promise<File>
    withFile?: <T>(consume: (blob: Blob) => Promise<T>) => Promise<T> }[]
  warnings: string[]
}

export type EasyWorshipProfileResult = {
  files: EasyWorshipProfileFiles
  profiles: EasyWorshipProfileInventory[]
  review?: EasyWorshipProfileReview
}

export async function reviewEasyWorshipProfile(
  source: File | File[] | EasyWorshipProfileFiles,
  selectedProfile?: string,
  legacyEncoding?: LegacySongEncoding,
  selectedOptions?: string | null,
  attachedMedia: readonly File[] = [],
  attachedDesigns: readonly File[] = [],
): Promise<EasyWorshipProfileResult> {
  const files = 'profiles' in source ? source : await createEasyWorshipProfileFiles(source)
  const profile = selectedProfile
    ? files.profiles.find((item) => item.id === selectedProfile)
    : files.profiles.length === 1 ? files.profiles[0] : undefined
  if (!profile) return { files, profiles: files.profiles }

  const sourceFiles = attachEasyWorshipMediaFiles(files.forProfile(profile.id), attachedMedia, true)
  const designExports = attachedDesigns.length ? await reviewEasyWorshipDesignExports(attachedDesigns, { preserveRevisions: true }) : undefined
  const libraryMedia = withEasyWorshipLibraryMedia(designExports ? withDesignExportMedia(sourceFiles, designExports) : sourceFiles)
  const baseSource = libraryMedia.source
  const walNotices = new Map<string, string>()
  const scoped = { ...baseSource, read: (path: string) => baseSource.read(path, (notice) => {
    const warning = easyWorshipWalWarning(notice)
    if (warning) walNotices.set(path, warning)
  }) }
  const readFile = async (path: string) => new File([await scoped.read(path)], path.slice(path.lastIndexOf('/') + 1))
  const withAsset: WithMediaBlob = (path, consume) => withProfileMedia(scoped, path, consume)
  const warnings = [...profile.warnings]
  const optionsId = selectedOptions === undefined ? profile.defaultOptionsId : selectedOptions
  const options = optionsId ? profile.optionSets.find((set) => set.id === optionsId) : undefined
  if (optionsId && !options) throw new Error('ไม่พบชุดตัวเลือกในโปรไฟล์ EasyWorship ที่เลือก')
  async function read<T>(label: string, review: () => Promise<T>): Promise<T | undefined> {
    try {
      return await review()
    } catch (cause) {
      warnings.push(`อ่าน${label}ไม่สำเร็จ · ${cause instanceof Error ? cause.message : 'เกิดข้อผิดพลาด'}`)
      return undefined
    }
  }

  const { songs: songsPath, songWords, songMemo, media: mediaPath, backgrounds, backgroundMemo, layouts, presentations } = profile.files
  const catalogMedia = mediaPath ? await read(' Media.db ', () => reviewEasyWorshipMediaFromSource(scoped, mediaPath)) : undefined
  if (catalogMedia && !catalogMedia.entries?.some((entry) => entry.readFile) && !catalogMedia.feeds?.length && !catalogMedia.dvds?.length) {
    warnings.push('Media.db ไม่มีไฟล์สื่อที่พร้อมนำเข้า')
  }
  const catalogEntries = catalogMedia?.entries ?? []
  const { source: artworkSource, rejectedPaths, audioRole, catalogMedia: catalogLookup } =
    easyWorshipArtworkContext(scoped, catalogEntries, mediaPath, Boolean(profile.archiveName))
  const profileArtwork = songAppearanceAssets(artworkSource, profile.rootPath, audioRole, catalogLookup)
  const songReview = songsPath && (songWords || songMemo) ? await read('เพลง', async () =>
    readEasyWorshipSongLibrary(await readFile(songsPath), {
      ...(songWords ? { songWords: () => readFile(songWords) } : {}),
      ...(songMemo ? { memo: () => readFile(songMemo) } : {}),
      ...(layouts ? { layouts: () => readFile(layouts) } : {}),
      assets: profileArtwork,
    }, legacyEncoding)) : undefined
  const lyricsRecovery = !songsPath && songWords
    ? await read('เนื้อร้องจาก SongWords', async () => recoverEasyWorshipLyrics(await readFile(songWords))) : undefined
  const songs = songReview?.preview ?? lyricsRecovery
  if (songs?.warnings) warnings.push(...songs.warnings)
  if ((songsPath && !songWords && !songMemo) || (!songsPath && (songWords || songMemo))) {
    warnings.push('พบฐานเพลงไม่ครบคู่ Songs.db และ SongWords.db หรือ Songs.MB')
  }
  if (songs && !songs.songs.length) warnings.push('ฐานเพลงนี้ไม่มีเพลงที่นำเข้าได้')

  const historyPath = profile.files.songHistory
  const songHistory = historyPath ? await read('ประวัติการใช้เพลง', async () =>
    readEasyWorshipSongHistory(await readFile(historyPath), profile.name)) : undefined
  const { alertFile, serviceIntervalsFile } = options ?? {}
  const alertSource = `${profile.name} · ${options?.name ?? ''}`
  const intervals = serviceIntervalsFile ? await read('เวลานมัสการจาก ServiceIntervals.db', async () =>
    readEasyWorshipServiceIntervals(await readFile(serviceIntervalsFile))) : undefined
  const imported = alertFile ? await read('ข้อความจาก Alerts.db', async () =>
    readEasyWorshipAlerts(await readFile(alertFile), alertSource, intervals)) : undefined
  const alerts = imported?.alerts ?? []
  if (imported) warnings.push(...imported.warnings)
  const alertCatalog = await makeAlertResourceCatalog(alertSource, imported?.catalogTokens, intervals)
  const collectionPath = profile.files.collections
  const collectionReview = collectionPath ? await read('กลุ่มจาก Collections.db', async () =>
    readEasyWorshipCollections(await readFile(collectionPath), profile.name, songs?.songs)) : undefined

  const legacyMedia = backgrounds ? await read(' BackGrounds.DB ', () => reviewEasyWorshipMediaFromSource(artworkSource, backgrounds, legacyEncoding)) : undefined
  if (backgroundMemo && !backgrounds) warnings.push('ไม่พบ BackGrounds.DB คู่กับ BackGrounds.MB')

  const designPath = layouts ?? presentations
  const modernDesigns = designPath ? await read('เลย์เอาต์และงานนำเสนอ', () =>
    reviewEasyWorshipDesignsFromSource(artworkSource, designPath, undefined, audioRole, profileArtwork.prepareMedia)) : undefined
  const legacyDesigns = legacyMedia?.legacyThemes
  const catalogDesigns = legacyDesigns ? {
    profiles: [...(modernDesigns?.profiles ?? []), ...legacyDesigns.profiles],
    entries: [...(modernDesigns?.entries ?? []), ...(legacyDesigns.entries ?? [])],
    powerPoints: modernDesigns?.powerPoints,
    collectionCatalog: modernDesigns?.collectionCatalog,
    warnings: [...(modernDesigns?.warnings ?? []), ...legacyDesigns.warnings],
    readAsset: (path: string) => path.startsWith('\0') && legacyDesigns.readAsset ? legacyDesigns.readAsset(path) : scoped.read(path),
  } : modernDesigns
  const designs = designExports ? combineProfileDesignExports(catalogDesigns, designExports, scoped) : catalogDesigns
  if (designs?.warnings.length) warnings.push(...designs.warnings)
  if (designs && !designs.entries?.some((entry) => entry.content.slides.length) && !designs.powerPoints?.some((entry) => entry.sourcePath)) {
    warnings.push('ไม่พบสไลด์หรือไฟล์ PowerPoint ที่พร้อมนำเข้าในโปรไฟล์นี้')
  }

  const resources: EasyWorshipProfileReview['resources'] = []
  const mediaEntries = [...catalogEntries]
  const mediaPaths = new Set(mediaEntries.map((entry) => entry.sourcePath?.toLowerCase()).filter(Boolean))
  const attached = new Set(scoped.attachedMedia)
  for (const path of new Set([...attached, ...(scoped.hashOnlyMedia ?? []), ...libraryMedia.borrowedPaths()])) {
    const filename = path.slice(path.lastIndexOf('/') + 1)
    resources.push({ path, filename, size: scoped.size(path), externalPath: scoped.attachedMediaLocations?.get(path),
      readFile: () => readFile(path), withFile: (consume) => withAsset(path, consume),
      ...(!mediaPaths.has(path.toLowerCase()) ? { hashOnly: true } : {}),
      ...(attached.has(path) ? { attached: true } : {}) })
  }
  for (const entry of legacyMedia?.entries ?? []) {
    const key = entry.sourcePath?.toLowerCase()
    if (key && mediaPaths.has(key)) continue
    if (key) mediaPaths.add(key)
    mediaEntries.push(entry)
  }
  const rawMedia: NonNullable<EasyWorshipMediaReview['entries']> = []
  for (const [key, paths] of scoped.paths) {
    const relative = key.slice(profile.rootPath.toLowerCase().length)
    if (!/^resources\/(images|videos|audio|presentations)\//.test(relative)) continue
    for (const path of paths) {
      const filename = path.slice(path.lastIndexOf('/') + 1)
      resources.push({ path, filename, size: scoped.size(path), readFile: () => readFile(path), withFile: (consume) => withAsset(path, consume),
        ...(rejectedPaths.has(key) ? { hashOnly: true } : {}) })
    }
    if (profile.archiveName || rejectedPaths.has(key) || mediaPaths.has(key) || paths.length !== 1) continue
    const expected = relative.startsWith('resources/images/') ? 'image'
      : relative.startsWith('resources/videos/') ? 'video'
        : relative.startsWith('resources/audio/') ? 'audio' : undefined
    const path = paths[0]
    const filename = path.slice(path.lastIndexOf('/') + 1)
    if (expected && easyWorshipMediaInputMime(filename)?.startsWith(expected + '/')) {
      rawMedia.push({
        sourceId: `resource:${relative}`, name: filename, kind: expected, filename,
        sourcePath: path, unregistered: true, readFile: () => scoped.read(path), withFile: (consume) => withAsset(path, consume),
      })
    }
  }
  const media = catalogMedia || legacyMedia || rawMedia.length ? {
    profiles: [...(catalogMedia?.profiles ?? []), ...(legacyMedia?.profiles ?? [])],
    entries: [...mediaEntries, ...rawMedia],
    feeds: catalogMedia?.feeds,
    dvds: catalogMedia?.dvds,
    unsupported: [...(catalogMedia?.unsupported ?? []), ...(legacyMedia?.unsupported ?? [])],
  } : undefined
  const collections = collectionReview && resolveResourceCollections(collectionReview, {
    ...designs?.collectionCatalog, media: mediaCollectionRows(catalogMedia?.entries ?? [], catalogMedia?.feeds, catalogMedia?.dvdCatalog),
  })
  if (collections) warnings.push(...collections.warnings)
  const nursery: EasyWorshipNurseryStyle[] = []
  for (const path of options?.nurseryStyleFiles ?? []) {
    const filename = path.slice(path.lastIndexOf('/') + 1)
    const result = await read(filename, () => readEasyWorshipNurseryStyle(scoped, path))
    if (result?.entry) nursery.push(result.entry)
    else if (result?.hasNativeStyle) {
      warnings.push(`${filename} · ไม่พบรายการเรียกผู้ปกครองที่อ่านได้ ตั้งค่าได้ในคลังข้อความแจ้งเตือน`)
    }
  }
  const messageStyles: EasyWorshipMessageStyle[] = []
  for (const path of options?.messageStyleFiles ?? []) {
    const filename = path.slice(path.lastIndexOf('/') + 1)
    const result = await read(filename, () => readEasyWorshipMessageStyle(scoped, path))
    if (result?.entry) messageStyles.push(result.entry)
    else if (result?.hasNativeStyle) warnings.push(`${filename} · ไม่พบการตั้งค่าข้อความแจ้งเตือนที่อ่านได้`)
  }
  const foldbackPath = options?.foldbackAppearanceFile
  const foldback = foldbackPath
    ? await read(' Foldback.Settings.db ', () => readEasyWorshipFoldbackSettings(scoped, foldbackPath)) : undefined
  const foldbackService = foldback?.service || intervals?.length ? {
    ...foldback?.service, ...(intervals?.length ? { intervals } : {}),
  } : undefined
  const foldbackServicePath = foldback?.service ? foldbackPath : serviceIntervalsFile
  const defaultThemes: EasyWorshipDefaultTheme[] = []
  const scriptureOutputs: EasyWorshipScriptureOutput[] = []
  for (const path of options?.defaultThemeFiles ?? []) {
    const imported = await read('ธีมเริ่มต้นของจอ', () => readEasyWorshipDefaultThemes(scoped, path, (kind, filename, alias) => {
      const asset = profileArtwork.resolve(kind, filename, alias)
      return asset ? { sourcePath: asset.path, filename: asset.filename, audioRole: asset.audioRole } : {}
    }, profileArtwork.prepareMedia))
    if (imported) {
      defaultThemes.push(...imported.themes)
      if (imported.scripture) scriptureOutputs.push(imported.scripture)
      if (imported.logo) {
        const { id, type } = imported.logo
        const slot = `${imported.output}:logo` as const
        const kind = type === 1 ? 'video' : type === 2 ? 'image' : undefined
        const media = kind && catalogMedia?.entries?.find((item) => item.sourceId === id && item.kind === kind)
        const key = type === 8 && designs?.collectionCatalog?.presentations?.find((record) => record.id === id)?.key
        const presentation = key && designs?.entries?.find((entry) => entry.kind === 'presentation' && designCollectionKey(entry.content.source) === key)
        let logo = presentation || undefined
        if (media && media.sourcePath && kind) {
          const { playback, repeat } = resolveLibraryMediaPlayback(kind, media.playback)
          const theme = logoMediaTheme(id, media.name, { kind, filename: media.filename, sourcePath: media.sourcePath,
            clip: media.clip, posterSeconds: media.posterSeconds, alphaMode: media.alphaMode, playback }, repeat)
          logo = { title: media.name, kind: 'presentation', layoutId: id, content: { slides: theme.slides } }
        }
        if (logo) defaultThemes.push({ ...logo, id: `${path}:logo:${id}`, slot, optionsName: imported.optionsName })
        else warnings.push(`โลโก้พักจอ · ${themeOutputLabels[imported.output]} · ไม่พบสื่อหรืองานนำเสนอที่รองรับสำหรับรหัส ${id}`)
      }
      warnings.push(...imported.warnings)
    }
  }
  const bibles: EasyWorshipProfileReview['bibles'] = []
  for (const entry of profile.bibles) {
    try {
      const info = await readEasyWorshipBibleInfo(await entry.readFile())
      bibles.push({ ...entry, info, warning: info.warning })
    } catch (error) {
      bibles.push({ ...entry, warning: error instanceof Error ? error.message : 'อ่านไฟล์พระคัมภีร์ไม่สำเร็จ' })
    }
  }
  return {
    files,
    profiles: files.profiles,
    review: { profile, options, legacyEncoding, songs, songHistory, alerts, alertCatalog, nursery, messageStyles,
      ...(foldback?.appearance && foldbackPath ? { foldbackAppearance: { id: foldbackPath, appearance: foldback.appearance } } : {}),
      ...(foldbackService && foldbackServicePath ? { foldbackService: { id: foldbackServicePath, settings: foldbackService } } : {}),
      ...(foldback?.content && foldbackPath ? { foldbackContent: { path: foldbackPath, styles: foldback.content } } : {}),
      defaultThemes, scriptureOutputs, readAsset: scoped.read, withAsset, collections, media, designs, schedules: profile.schedules, bibles, resources,
      warnings: [...new Set([...warnings, ...walNotices.values()])] },
  }
}
