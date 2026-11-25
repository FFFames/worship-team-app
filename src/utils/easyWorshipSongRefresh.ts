/** Fills missing native song formatting and files without replacing the saved chart. */

import type { Section, Song } from '../types/database'
import type { DesignAsset, DesignLayer, DesignSoundtrack, SlideDesign, SongAppearance } from '../types/slideDesign'
import { getSectionDisplayLabel } from './chordParser'
import { sectionLyricText, songLibrarySections } from './songLibrarySlides'
import { alignedLyricRuns } from './songLyricFormatting'
import { backfillImportedTextLayout, restoreMasterLayers } from './slideDesignAssets'
import { MISSING_MASTER_BACKGROUND, MISSING_VERIFIED_LAYOUT_MEDIA } from './slideDesign'
import { fillImportedDesignMediaPlayback } from './easyWorshipMediaPlaybackRecovery'
import { restoreDesignGeometry } from './designLayerGeometry'
import { recoverMissingParagraphLists } from './songParagraphFormatting'

export type SongImportSnapshot = Pick<Song, 'raw_content' | 'sections' | 'appearance'>

const sectionLabel = (label: string) => label.normalize('NFC').trim().toLowerCase()
const unmatchedSlides = 'เลย์เอาต์บางท่อนไม่ตรงกับรหัสสไลด์ของเนื้อร้อง'

function sameSection(saved: Section | undefined, source: Section | undefined) {
  return Boolean(saved && source && sectionLabel(getSectionDisplayLabel(saved)) === sectionLabel(getSectionDisplayLabel(source))
    && sectionLyricText(saved) === sectionLyricText(source))
}

function sameFile(saved: DesignAsset | DesignSoundtrack, source: DesignAsset | DesignSoundtrack) {
  if (saved.kind !== source.kind) return false
  if (saved.easyWorshipFileHash) return saved.easyWorshipFileHash === source.easyWorshipFileHash
  const oldName = saved.filename.normalize('NFC').toLowerCase()
  const newName = source.filename.normalize('NFC').toLowerCase()
  return oldName === newName || (saved.kind === 'video' && newName.endsWith('.mp4')
    && oldName.replace(/\.[^.]+$/, '') === newName.slice(0, -4))
}

function fillDesign(saved: SlideDesign, source: SlideDesign, recovered: Set<string>): SlideDesign {
  const byId = new Map<string, DesignLayer | undefined>()
  for (const layer of source.layers) byId.set(layer.id, byId.has(layer.id) ? undefined : layer)
  function withFile<T extends DesignAsset | DesignSoundtrack>(asset: T, next?: T) {
    if (!next?.libraryId || asset.libraryId || asset.archivePath || asset.sourcePath || !sameFile(asset, next)) return asset
    recovered.add(asset.filename)
    recovered.add(next.filename)
    return { ...asset, filename: next.filename, libraryId: next.libraryId,
      ...(next.easyWorshipFileHash ? { easyWorshipFileHash: next.easyWorshipFileHash } : {}) }
  }
  const layers = saved.layers.map((layer) => {
    const next = byId.get(layer.id)
    if (layer.songArtwork) return layer
    if (layer.kind !== 'media' || next?.kind !== 'media') return backfillImportedTextLayout(layer, next)
    const asset = withFile(layer.asset, next.asset)
    return asset === layer.asset ? layer : { ...layer, asset }
  })
  const soundtracks = saved.soundtracks?.map((track) => {
    const matches = source.soundtracks?.filter((candidate) => sameFile(track, candidate)) ?? []
    const sameRole = matches.filter((candidate) => candidate.role === track.role)
    return withFile(track, sameRole.length === 1 ? sameRole[0] : matches.length === 1 ? matches[0] : undefined)
  })
  const updated = { ...saved, layers, ...(soundtracks ? { soundtracks } : {}) }
  const inherited = restoreMasterLayers(updated, source)
  const restored = inherited?.design ?? updated
  const geometry = restoreDesignGeometry(restored, source)
  const design = geometry?.design ?? restored
  const media = fillImportedDesignMediaPlayback(design, source)
  if (inherited || geometry || media !== design) return media ?? design
  if (layers.every((layer, index) => layer === saved.layers[index])
    && soundtracks?.every((track, index) => track === saved.soundtracks?.[index]) !== false) return saved
  return updated
}

function fillAppearance(saved: SongAppearance | null | undefined, source: SongAppearance, matches: (index: number) => boolean,
  canAddDefault: boolean, recovered: Set<string>, sectionCount: number): SongAppearance | null | undefined {
  const sections = [...(saved?.sections ?? [])]
  let adoptedLayout = false
  const looping = saved?.looping ?? (canAddDefault ? source.looping : undefined)
  let changed = looping !== saved?.looping
  for (const section of source.sections ?? []) {
    if (!matches(section.index)) continue
    const position = sections.findIndex((existing) => existing.index === section.index)
    if (position < 0) {
      sections.push(section)
      adoptedLayout = changed = true
    } else if (sectionLabel(sections[position].label) === sectionLabel(section.label)) {
      const old = sections[position]
      const design = fillDesign(old.design, section.design, recovered)
      if (old.design !== design) {
        sections[position] = { ...old, design }
        changed = true
      }
    }
  }
  let defaultDesign = saved?.defaultDesign
  if (source.defaultDesign && (defaultDesign || canAddDefault)) {
    const design = defaultDesign ? fillDesign(defaultDesign, source.defaultDesign, recovered) : source.defaultDesign
    adoptedLayout ||= !defaultDesign
    changed ||= design !== defaultDesign
    defaultDesign = design
  }
  if (!changed) return saved

  const designs = [...sections.map(({ design }) => design), ...(defaultDesign ? [defaultDesign] : [])]
  const unresolved = new Set(designs.flatMap((design) => [
    ...design.layers.flatMap((layer) => layer.kind === 'media' ? [layer.asset] : []), ...(design.soundtracks ?? []),
  ]).flatMap((asset) => asset.libraryId || asset.archivePath ? [] : [asset.filename]))
  const resolved = new Set([...recovered].filter((filename) => !unresolved.has(filename)).flatMap((filename) => [
    `ไม่พบไฟล์ ${filename} ที่อ้างอิงจากเลย์เอาต์`, `${MISSING_MASTER_BACKGROUND}${filename}`, `ไม่พบไฟล์เสียง ${filename} ที่อ้างอิงจากเลย์เอาต์`,
    `เก็บไฟล์ ${filename} ในคลังสื่อไม่สำเร็จ`, MISSING_VERIFIED_LAYOUT_MEDIA + filename,
  ]))
  const warnings = [...new Set([...(saved?.warnings ?? []), ...(adoptedLayout ? source.warnings ?? [] : [])])]
    .filter((warning) => !resolved.has(warning)
      && (warning !== unmatchedSlides || sections.filter(({ index }) => matches(index)).length < sectionCount
        || source.warnings?.includes(warning)))
  const { sections: _sections, warnings: _warnings, ...old } = saved ?? {}
  return { ...old, ...(looping !== undefined ? { looping } : {}), ...(defaultDesign ? { defaultDesign } : {}), ...(sections.length ? { sections } : {}),
    ...(warnings.length ? { warnings } : {}) }
}

export function missingEasyWorshipSongFields(saved: SongImportSnapshot, source: SongImportSnapshot) {
  if (saved.raw_content !== source.raw_content) return {}
  const savedSections = songLibrarySections(saved)
  const sourceSections = source.sections ?? []
  const matches = (index: number) => sameSection(savedSections[index], sourceSections[index])
  const sections = savedSections.map((section, index) => {
    if (!matches(index)) return section
    const source = sourceSections[index]
    const lyrics = sectionLyricText(section)
    const runs = section.lyricRuns ? recoverMissingParagraphLists(lyrics, section.lyricRuns, source.lyricRuns)
      : alignedLyricRuns(lyrics, source.lyricRuns)
    const slideLabel = section.slideLabel === undefined ? source.slideLabel : undefined
    const transition = section.transition === undefined ? source.transition : undefined
    const playback = section.playback === undefined ? source.playback : undefined
    return runs || slideLabel || transition || playback ? { ...section, ...(runs ? { lyricRuns: runs } : {}),
      ...(slideLabel ? { slideLabel } : {}), ...(transition ? { transition } : {}), ...(playback ? { playback } : {}) } : section
  })
  const recovered = new Set<string>()
  const appearance = source.appearance ? fillAppearance(saved.appearance, source.appearance, matches,
    savedSections.length === sourceSections.length && savedSections.every((_, index) => matches(index)), recovered, sourceSections.length) : saved.appearance
  return {
    ...(sections.some((section, index) => section !== savedSections[index]) ? { sections } : {}),
    ...(appearance !== saved.appearance ? { appearance } : {}),
  }
}
