/** Matches song layouts and resources from the same EasyWorship profile. */

import { getEasyWorshipSql, isEasyWorshipSqliteDatabase, type EasyWorshipImport, type EasyWorshipSection } from './easyWorship'
import { readEasyWorshipLayouts } from './easyWorshipDesigns'
import { easyWorshipArtworkContext, easyWorshipMediaInputMime, reviewEasyWorshipMediaFromSource,
  type CatalogMediaLookup, type EasyWorshipMediaEntry } from './easyWorshipMedia'
import { legacyVideoExtension } from './legacyVideo'
import type { DesignSlide, DesignSoundtrack } from '../types/slideDesign'
import type { MediaKind } from '../types/media'
import type { EasyWorshipProfileAssetSource } from './easyWorshipProfileFiles'
import { prepareProfileLayoutMedia, type PrepareLayoutMedia, type ResolveLayoutMedia } from './easyWorshipLayoutMedia'
import type { WithMediaBlob } from './zipAsset'
import { externalEasyWorshipMediaKey, matchEasyWorshipExternalMedia } from './easyWorshipExternalMedia'

export type SongAssetSource = {
  resolve: (kind: MediaKind, name: string, alias?: string) => { path: string; filename: string; audioRole?: DesignSoundtrack['role'] } | undefined
  read: (path: string) => Promise<Blob>
  withMedia?: WithMediaBlob
  prepareMedia?: PrepareLayoutMedia
}

export function songAppearanceAssets(source: EasyWorshipProfileAssetSource, root: string,
  audioRole?: (path: string) => DesignSoundtrack['role'] | undefined,
  catalogMedia?: CatalogMediaLookup): SongAssetSource {
  const matchLocation = matchEasyWorshipExternalMedia(source.attachedMediaLocations)
  return {
    read: source.read,
    withMedia: source.withMedia,
    prepareMedia: prepareProfileLayoutMedia(source, root, audioRole, catalogMedia),
    resolve(kind, name, alias) {
      if (externalEasyWorshipMediaKey(name)) {
        const catalog = catalogMedia?.(kind, name)
        const match = catalog ? undefined : matchLocation(name)
        const path = catalog ? catalog.sourcePath : match?.candidates.length === 1 ? match.candidates[0] : undefined
        const filename = path?.split('/').pop()
        if (!path || !filename || !easyWorshipMediaInputMime(filename)?.startsWith(kind + '/')) return undefined
        return { path, filename, ...(kind === 'audio' ? { audioRole: catalog?.audioRole ?? audioRole?.(path) } : {}) }
      }
      const relative = name.replace(/\\/g, '/').replace(/^<(?:images|videos|audio|imageresourcesdir|videoresourcesdir|audioresourcesdir)>\/*/i, '')
      const basename = relative.split('/').pop()
      if (!basename) return undefined
      const folder = root + (kind === 'image' ? 'Resources/Images/' : kind === 'video' ? 'Resources/Videos/' : 'Resources/Audio/')
      const safeRelative = !relative.split('/').some((part) => !part || part === '.' || part === '..' || part.includes(':'))
      const playable = easyWorshipMediaInputMime(basename)?.startsWith(kind + '/') ? basename : undefined
      const exact = safeRelative && playable ? relative : undefined
      const fallback = kind === 'video' && (!playable || legacyVideoExtension(basename)) ? basename.replace(/\.[^.]+$/, '') + '.mp4' : undefined
      const aliasName = alias?.replace(/\\/g, '/').split('/').pop()
      const playableAlias = aliasName && easyWorshipMediaInputMime(aliasName)?.startsWith(kind + '/') ? aliasName : undefined
      for (const candidate of new Set([exact, playableAlias, playable, fallback])) {
        if (!candidate) continue
        const matches = source.paths.get((folder + candidate).toLowerCase()) ?? []
        if (matches.length > 1) return undefined
        if (matches.length === 1) return {
          path: matches[0], filename: matches[0].split('/').pop() ?? basename,
          ...(kind === 'audio' ? { audioRole: audioRole?.(matches[0]) } : {}),
        }
      }
      return undefined
    },
  }
}

export async function reviewSongAppearanceAssets(source: EasyWorshipProfileAssetSource, root: string,
  warn: (message: string) => void, mediaPath?: string, archived = false) {
  let entries: EasyWorshipMediaEntry[] = []
  if (mediaPath) {
    try {
      entries = (await reviewEasyWorshipMediaFromSource(source, mediaPath)).entries ?? []
    } catch (cause) {
      warn(`อ่าน Media.db ไม่สำเร็จ · ${cause instanceof Error ? cause.message : 'เกิดข้อผิดพลาด'}`)
    }
  }
  const artwork = easyWorshipArtworkContext(source, entries, mediaPath, archived)
  return songAppearanceAssets(artwork.source, root, artwork.audioRole, artwork.catalogMedia)
}

function lyricKey(text: string) {
  return text.normalize('NFC').trim().replace(/\s+/g, ' ')
}

function uniqueByKey<T>(values: readonly T[], identify: (value: T) => string) {
  const matches = new Map<string, T | undefined>()
  for (const value of values) {
    const key = identify(value)
    if (key) matches.set(key, matches.has(key) ? undefined : value)
  }
  return matches
}

function matchSongLayouts(sections: readonly EasyWorshipSection[], slideIds: readonly (string | null)[], slides: readonly DesignSlide[]) {
  const byId = uniqueByKey(slides, (slide) => slide.id.toLowerCase())
  const matches = sections.map((_, index) => byId.get(slideIds[index]?.toLowerCase() ?? ''))
  const remaining = sections.flatMap((section, index) => {
    if (matches[index]) return []
    const words = lyricKey(section.lines.join('\n'))
    return words ? [{ index, section, words }] : []
  })
  if (!remaining.length) return matches

  const used = new Set(matches)
  const lyrics = slides.flatMap((slide) => {
    if (used.has(slide)) return []
    const layers = slide.design.layers.filter((layer) => layer.kind === 'text' && layer.slot === 'content')
    const words = layers.length === 1 && layers[0].kind === 'text' ? lyricKey(layers[0].text) : ''
    return words ? [{ slide, words }] : []
  })
  function matchUnique(key: (words: string, label?: string) => string) {
    const source = uniqueByKey(remaining.filter(({ index }) => !matches[index]),
      ({ section, words }) => key(words, section.slideLabel ?? section.label))
    const candidates = uniqueByKey(lyrics.filter(({ slide }) => !used.has(slide)),
      ({ slide, words }) => key(words, slide.songLabel))
    for (const [id, section] of source) {
      const candidate = candidates.get(id)
      if (!section || !candidate) continue
      matches[section.index] = candidate.slide
      used.add(candidate.slide)
    }
  }

  // Labels can distinguish repeated lyrics. Both the source section and the matching layout must be unique.
  matchUnique((words, label) => label ? JSON.stringify([words, lyricKey(label).toLowerCase()]) : '')
  matchUnique((words) => words)
  return matches
}

export async function attachEasyWorshipSongLayouts(
  preview: EasyWorshipImport,
  file?: () => Promise<File>,
  assets?: SongAssetSource,
): Promise<EasyWorshipImport> {
  const linked = preview.songs.filter((song) => song.layoutLink)
  if (!linked.length) return preview
  const warnings = new Set(preview.warnings)
  if (!file) {
    warnings.add('พบเพลงที่อ้างอิง PresentationLayouts.db กรุณาเลือกไฟล์เลย์เอาต์หรือย้ายโปรไฟล์พร้อม Resources')
    return { ...preview, warnings: [...warnings] }
  }

  try {
    const source = await file()
    if (source.size > 128 * 1024 * 1024) throw new Error('PresentationLayouts.db มีขนาดเกิน 128 MB')
    const bytes = new Uint8Array(await source.arrayBuffer())
    if (!isEasyWorshipSqliteDatabase(bytes)) throw new Error('PresentationLayouts.db ไม่ใช่ฐานข้อมูล SQLite')
    const SQL = await getEasyWorshipSql()
    const db = new SQL.Database(bytes)
    try {
      const fallback: ResolveLayoutMedia = (kind, filename, alias) => {
        const asset = assets?.resolve(kind, filename, alias)
        if (!asset) return {}
        return easyWorshipMediaInputMime(filename) === easyWorshipMediaInputMime(asset.filename)
          ? { sourcePath: asset.path, audioRole: asset.audioRole }
          : { sourcePath: asset.path, filename: asset.filename, audioRole: asset.audioRole }
      }
      const layouts = readEasyWorshipLayouts(db, {
        songLayoutIds: new Set(linked.map((song) => song.layoutLink!.presentationId)),
        resolveAsset: assets?.prepareMedia ? await assets.prepareMedia(db, fallback) : fallback,
      })
      const byPresentation = new Map(layouts.entries.map((entry) => [entry.layoutId, entry.content]))
      const songs = preview.songs.map((song) => {
        const link = song.layoutLink
        if (!link) return song
        const content = byPresentation.get(link.presentationId)
        const songSections = [...song.sections]
        const matches = matchSongLayouts(song.sections, link.slideIds, content?.slides ?? [])
        const sections = matches.flatMap((matched, index) => {
          const source = songSections[index]
          if (!matched || !source) return []
          if (matched.songLabel || matched.transition || matched.playback) songSections[index] = { ...source,
            ...(matched.songLabel ? { slideLabel: matched.songLabel } : {}),
            ...(matched.transition ? { transition: matched.transition } : {}),
            ...(matched.playback ? { playback: matched.playback } : {}),
          }
          if (!matched.design.layers.some((layer) => layer.kind === 'text' && layer.slot === 'content')) return []
          return [{
            index, label: source.label,
            design: { ...matched.design, layers: matched.design.layers.map((layer) => layer.kind === 'text' && layer.slot === 'content'
              ? { ...layer, text: '', style: { ...layer.style, fitText: true } } : layer) },
          }]
        })
        const messages = new Set(content?.warnings)
        if (sections.length !== song.sections.length) messages.add('เลย์เอาต์บางท่อนไม่ตรงกับรหัสสไลด์ของเนื้อร้อง')
        if (!sections.length) warnings.add(`ไม่พบเลย์เอาต์ที่จับคู่กับเพลง ${song.title}`)
        const looping = content?.looping && matches.some(Boolean)
        return { ...song, sections: songSections, ...(sections.length || looping ? { appearance: {
          ...(sections.length ? { sections } : {}), ...(looping ? { looping: true } : {}),
          ...(messages.size ? { warnings: [...messages] } : {}),
        } } : {}) }
      })
      return {
        ...preview, songs, warnings: [...warnings],
        ...(assets ? { readAppearanceAsset: assets.read, withAppearanceAsset: assets.withMedia } : {}),
      }
    } finally {
      db.close()
    }
  } catch (error) {
    warnings.add(error instanceof Error ? error.message : 'อ่านเลย์เอาต์เพลง EasyWorship ไม่สำเร็จ')
    return { ...preview, warnings: [...warnings] }
  }
}
