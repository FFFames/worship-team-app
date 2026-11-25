/** Packs a WorshipTeam playlist and its local resources for another installation. */

import type { Entry, FileEntry } from '@zip.js/zip.js'
import type { Playlist, PlaylistCue, PlaylistCueAsset, PlaylistSong, Song } from '../types/database'
import type { MediaClip, MediaKind, VideoAlphaMode } from '../types/media'
import type { AppliedSlideTheme, SlideDesign, SongAppearance } from '../types/slideDesign'
import { libraryMediaExtension, libraryMediaMime, readLibraryMedia, saveLibraryDvd, saveLibraryMedia } from './mediaLibrary'
import { readDvdReplacement, resolveDvdAsset, saveDvdReplacement } from './dvdReplacement'
import type { DvdClip } from '../types/dvdClip'
import { mediaClipKey } from './mediaClip'
import { readScheduleMedia } from './scheduleMedia'
import { parsePlaylistPackage } from './playlistPackageManifest'
import { mapSongLayoutMedia } from './songSlideLayout'

export const playlistPackageExtension = '.wtschedule'
const manifestName = 'manifest.json'
const maxManifestBytes = 12 * 1024 ** 2
const maxPackageBytes = 1024 ** 3
const maxFiles = 4000

export type PackageSong = Pick<Song,
  'title' | 'artist' | 'original_key' | 'tempo' | 'time_signature' | 'youtube_url' | 'raw_content' |
  'sections' | 'tags' | 'copyright' | 'ccli_number' | 'easyworship_uid' | 'copyright_administrator' | 'description' | 'appearance'>
export type PackageEntry = {
  song?: number
  cue?: PlaylistCue
  transpose: number
  background_asset?: PlaylistCueAsset
  slide_theme?: AppliedSlideTheme
}
export type PackageAsset = { path: string; filename: string; mime: string; size: number }

export type PlaylistPackageManifest = {
  format: 'worshipteam.schedule'
  version: 1
  playlist: Pick<Playlist, 'name' | 'date' | 'notes'>
  songs: PackageSong[]
  entries: PackageEntry[]
  media: PackageAsset[]
  missing: string[]
}

type AssetReference = {
  filename: string
  kind: string
  libraryId?: string
  archivePath?: string
  sourcePath?: string
  importSourceId?: string
  importName?: string
  crc32?: number
  dvd?: DvdClip
  clip?: MediaClip
  alphaMode?: VideoAlphaMode
}
type RewriteAsset = <T extends AssetReference>(asset: T) => Promise<T>
type ReadAssets = {
  library: typeof readLibraryMedia
  schedule: typeof readScheduleMedia
}
const browserAssets: ReadAssets = { library: readLibraryMedia, schedule: readScheduleMedia }

function localMediaKind(kind: string): kind is MediaKind {
  return kind === 'image' || kind === 'video' || kind === 'audio'
}

function localAsset<T extends AssetReference>(asset: T, location: { archivePath?: string; libraryId?: string }): T {
  const { libraryId: _library, archivePath: _archive, sourcePath: _source, crc32: _crc,
    importSourceId: _import, importName: _name, ...description } = asset
  return { ...description, ...location } as T
}

async function mapDesign(design: SlideDesign, rewrite: RewriteAsset): Promise<SlideDesign> {
  return {
    ...design,
    layers: await Promise.all(design.layers.map(async (layer) => layer.kind === 'media'
      ? { ...layer, asset: await rewrite(layer.asset) } : layer)),
    ...(design.soundtracks ? { soundtracks: await Promise.all(design.soundtracks.map(rewrite)) } : {}),
  }
}

async function mapSong(song: PackageSong, rewrite: RewriteAsset): Promise<PackageSong> {
  const appearance = song.appearance
  const sections = song.sections?.some((section) => section.slideLayouts) ? await Promise.all(song.sections.map(async (section) => ({
    ...section, ...(section.slideLayouts ? { slideLayouts: await Promise.all(section.slideLayouts.map(async (entry) => ({
      ...entry, layout: await mapSongLayoutMedia(entry.layout, rewrite),
    }))) } : {}),
  }))) : song.sections
  if (!appearance) return { ...song, sections }
  const portable: SongAppearance = { ...appearance }
  if (appearance.slideLayout) portable.slideLayout = await mapSongLayoutMedia(appearance.slideLayout, rewrite)
  if (appearance.defaultDesign) portable.defaultDesign = await mapDesign(appearance.defaultDesign, rewrite)
  if (appearance.sections) {
    portable.sections = await Promise.all(appearance.sections.map(async (section) => ({
      ...section, design: await mapDesign(section.design, rewrite),
    })))
  }
  return { ...song, appearance: portable, sections }
}

async function mapEntry(entry: PackageEntry, rewrite: RewriteAsset): Promise<PackageEntry> {
  const result = { ...entry }
  if (entry.background_asset) result.background_asset = await rewrite(entry.background_asset)
  if (entry.slide_theme) {
    result.slide_theme = { ...entry.slide_theme, design: await mapDesign(entry.slide_theme.design, rewrite) }
  }
  if (entry.cue) {
    result.cue = {
      ...entry.cue,
      ...(entry.cue.slideLayout ? { slideLayout: await mapSongLayoutMedia(entry.cue.slideLayout, rewrite) } : {}),
      ...(entry.cue.assets ? { assets: await Promise.all(entry.cue.assets.map(rewrite)) } : {}),
      slides: await Promise.all(entry.cue.slides.map(async (slide) => ({
        ...slide,
        ...(slide.slideLayout ? { slideLayout: await mapSongLayoutMedia(slide.slideLayout, rewrite) } : {}),
        ...(slide.assets ? { assets: await Promise.all(slide.assets.map(rewrite)) } : {}),
        ...(slide.design ? { design: await mapDesign(slide.design, rewrite) } : {}),
      }))),
    }
  }
  return result
}

export async function preparePlaylistPackage(playlist: Playlist, entries: readonly PlaylistSong[], readers = browserAssets) {
  const media = new Map<string, { filename: string; blob: Blob }>()
  const cache = new Map<string, Promise<string | undefined>>()
  const missing = new Set<string>()
  let totalBytes = 0
  async function pack<T extends AssetReference>(original: T): Promise<T> {
    const asset = resolveDvdAsset(original)
    if (!localMediaKind(asset.kind)) return localAsset(asset, {})
    const key = JSON.stringify([asset.kind, asset.libraryId, asset.archivePath])
    let cached = cache.get(key)
    if (!cached) {
      cached = (async () => {
        const libraryBlob = asset.libraryId ? await readers.library(asset.libraryId) : null
        const blob = libraryBlob ?? (asset.archivePath ? await readers.schedule(playlist.id, asset.archivePath) : null)
        if (!blob?.size) return
        const mime = libraryMediaExtension(blob.type) ? blob.type : libraryMediaMime(asset.filename)
        if (!mime?.startsWith(asset.kind + '/')) return
        totalBytes += blob.size
        if (totalBytes > maxPackageBytes || media.size >= maxFiles) throw new Error('ไฟล์สื่อรวมเกินขนาดที่แพ็กได้ (1 GB)')
        const path = `assets/${media.size + 1}`
        media.set(path, { filename: asset.filename, blob: blob.type === mime ? blob : blob.slice(0, blob.size, mime) })
        return path
      })()
      cache.set(key, cached)
    }
    const archivePath = await cached
    if (!archivePath) missing.add(asset.filename)
    return localAsset(asset, archivePath ? { archivePath } : {})
  }

  const songIndices = new Map<string, number>()
  const songs: PackageSong[] = []
  const portableEntries: PackageEntry[] = []
  for (const entry of entries) {
    let song: number | undefined
    if (!entry.song && (entry.song_id || !entry.cue)) {
      throw new Error('เพลย์ลิสต์มีเพลงที่เปิดไม่ได้ กรุณาตรวจรายการก่อนส่งออก')
    }
    if (entry.song) {
      song = songIndices.get(entry.song.id)
      if (song === undefined) {
        song = songs.length
        songIndices.set(entry.song.id, song)
        const { title, artist, original_key, tempo, time_signature, youtube_url, raw_content,
          sections, tags, copyright, ccli_number, easyworship_uid, copyright_administrator, description, appearance } = entry.song
        songs.push(await mapSong({ title, artist, original_key, tempo, time_signature, youtube_url,
          raw_content, sections, tags, copyright, ccli_number, easyworship_uid, copyright_administrator, description, appearance }, pack))
      }
    }
    portableEntries.push(await mapEntry({
      ...(song === undefined ? {} : { song }),
      ...(entry.cue ? { cue: entry.cue } : {}),
      transpose: entry.transpose,
      ...(entry.background_asset ? { background_asset: entry.background_asset } : {}),
      ...(entry.slide_theme ? { slide_theme: entry.slide_theme } : {}),
    }, pack))
  }

  const manifest: PlaylistPackageManifest = {
    format: 'worshipteam.schedule',
    version: 1,
    playlist: { name: playlist.name, date: playlist.date, notes: playlist.notes },
    songs,
    entries: portableEntries,
    media: [...media].map(([path, { filename, blob }]) => ({ path, filename, mime: blob.type, size: blob.size })),
    missing: [...missing],
  }
  return { manifest, media }
}

export type PreparedPlaylistPackage = Awaited<ReturnType<typeof preparePlaylistPackage>>

export async function writePlaylistPackage({ manifest, media }: PreparedPlaylistPackage, onProgress?: (done: number, total: number) => void) {
  const { BlobReader, BlobWriter, ZipWriter } = await import('@zip.js/zip.js')
  const json = new Blob([JSON.stringify(manifest)], { type: 'application/json' })
  if (json.size > maxManifestBytes) throw new Error('ข้อมูลเพลย์ลิสต์เกิน 12 MB')
  parsePlaylistPackage(JSON.parse(await json.text()))
  const archive = new ZipWriter(new BlobWriter('application/zip'))
  try {
    await archive.add(manifestName, new BlobReader(json))
    let done = 0
    for (const [path, { blob }] of media) {
      await archive.add(path, new BlobReader(blob), { level: 0 })
      onProgress?.(++done, media.size)
    }
  } catch (cause) {
    await archive.close().catch(() => {})
    throw cause
  }
  return archive.close()
}

async function indexArchive(entries: AsyncIterable<Entry>) {
  const index = new Map<string, FileEntry>()
  for await (const entry of entries) {
    if (entry.directory && entry.filename === 'assets/') continue
    if (entry.directory || entry.encrypted || index.has(entry.filename)
      || (entry.filename !== manifestName && !/^assets\/[1-9]\d{0,5}$/.test(entry.filename))) {
      throw new Error('พบรายการไฟล์ที่ไม่ถูกต้องในแพ็กเกจเพลย์ลิสต์')
    }
    index.set(entry.filename, entry)
    if (index.size > maxFiles + 1) throw new Error('แพ็กเกจมีไฟล์มากเกินไป')
  }
  return index
}

export async function reviewPlaylistPackage(file: Blob) {
  if (file.size > maxPackageBytes + maxManifestBytes + maxFiles * 256) throw new Error('แพ็กเกจเพลย์ลิสต์มีขนาดเกิน 1 GB')
  const { BlobReader, TextWriter, ZipReader } = await import('@zip.js/zip.js')
  const archive = new ZipReader(new BlobReader(file))
  try {
    const entries = await indexArchive(archive.getEntriesGenerator())
    const header = entries.get(manifestName)
    if (!header || header.uncompressedSize > maxManifestBytes) throw new Error('ข้อมูลรายการในแพ็กเกจหายไปหรือเกิน 12 MB')
    const manifest = parsePlaylistPackage(JSON.parse(await header.getData(new TextWriter(), { checkSignature: true })))
    let bytes = 0
    for (const asset of manifest.media) {
      const entry = entries.get(asset.path)
      bytes += asset.size
      if (!entry || entry.uncompressedSize !== asset.size || bytes > maxPackageBytes) {
        throw new Error('ไฟล์สื่อในแพ็กเกจไม่ครบหรือมีขนาดไม่ตรงกับรายการ')
      }
    }
    if (entries.size !== manifest.media.length + 1) throw new Error('พบไฟล์สื่อเกินจากรายการในแพ็กเกจ')
    return manifest
  } finally {
    await archive.close()
  }
}

export async function materializePlaylistPackage(file: Blob, manifest: PlaylistPackageManifest, onProgress?: (done: number, total: number) => void) {
  const records = new Map<string, string>()
  if (manifest.media.length) {
    const { BlobReader, BlobWriter, ZipReader } = await import('@zip.js/zip.js')
    const archive = new ZipReader(new BlobReader(file))
    try {
      const entries = await indexArchive(archive.getEntriesGenerator())
      for (const asset of manifest.media) {
        const entry = entries.get(asset.path)
        const extension = libraryMediaExtension(asset.mime)
        if (!entry || !extension || entry.uncompressedSize !== asset.size) throw new Error('อ่านไฟล์สื่อในแพ็กเกจไม่ได้')
        const blob = await entry.getData(new BlobWriter(asset.mime), { checkSignature: true })
        const filename = libraryMediaMime(asset.filename) === asset.mime ? asset.filename : `playlist-${asset.path.split('/')[1]}.${extension}`
        const saved = await saveLibraryMedia(blob, { filename, name: asset.filename, generatedReference: true })
        records.set(asset.path, saved.assetId)
        onProgress?.(records.size, manifest.media.length)
      }
    } finally {
      await archive.close()
    }
  }

  const discs = new Map<string, { dvd: DvdClip; libraryId?: string; clip?: MediaClip; alphaMode?: VideoAlphaMode }>()
  async function restore<T extends AssetReference>(asset: T): Promise<T> {
    const libraryId = asset.archivePath && records.get(asset.archivePath)
    if (asset.dvd) {
      const previous = discs.get(asset.dvd.id)
      if (!previous || (!previous.libraryId && libraryId)) {
        discs.set(asset.dvd.id, { dvd: asset.dvd, libraryId, clip: asset.clip, alphaMode: asset.alphaMode })
      }
    }
    return localAsset(asset, libraryId ? { libraryId } : {})
  }
  const payload = {
    songs: await Promise.all(manifest.songs.map((song) => mapSong(song, restore))),
    entries: await Promise.all(manifest.entries.map((entry) => mapEntry(entry, restore))),
  }
  for (const { dvd, libraryId, clip, alphaMode } of discs.values()) {
    await saveLibraryDvd(dvd)
    if (libraryId && !readDvdReplacement(dvd.id)) {
      saveDvdReplacement(dvd.id, { assetId: libraryId, useMarks: mediaClipKey(clip) === mediaClipKey(dvd.clip),
        alphaMode, subtitle: dvd.subtitleSelection })
    }
  }
  return payload
}

export function playlistPackageFilename(name: string) {
  const safe = name.replace(/[<>:"/\\|?*\p{Cc}]/gu, '-').trim().replace(/[. ]+$/g, '').slice(0, 100)
  return (safe || 'playlist') + playlistPackageExtension
}
