/** Keeps edits local to a schedule and maintains the slide's displayed content. */

import type { PlaylistCue, PlaylistCueAsset, PlaylistSong, Song } from '../types/database'
import type { DesignAsset, DesignLayer, DesignTextRun, SlideDesign } from '../types/slideDesign'
import { designTextLines, editDesignText, editTextRuns } from './slideDesign'
import { alignedLyricRuns } from './songLyricFormatting'
import { songSectionDesign } from './playlistCues'
import { preparedLibrarySection, songLibrarySections } from './songLibrarySlides'
import { songCueLyrics } from './songCueLayout'
import { mediaObjectFit } from './mediaPlayback'

export type CueSlide = PlaylistCue['slides'][number]
type MediaLayer = Extract<DesignLayer, { kind: 'media' }>

export function cueForEditing(entry: PlaylistSong): PlaylistCue | undefined {
  if (entry.cue) return entry.cue.slides.length ? entry.cue : {
    ...entry.cue,
    slides: [{ label: entry.cue.label, lines: [], assets: entry.cue.assets }],
  }
  const song = entry.song
  if (!song) return undefined
  const sections = songLibrarySections(song)
  return {
    kind: 'song',
    label: song.title,
    ...(song.appearance?.looping !== undefined ? { looping: song.appearance.looping } : {}),
    slides: sections.length ? sections.flatMap((section, index) => preparedLibrarySection(section, songSectionDesign(song, sections, index), song.appearance?.slideLayout))
      : [{ label: song.title, lines: [] }],
  }
}

/** Stage and print keep the linked song's credits and key, using its local lyrics and chords. */
export function songForPlaylistEntry(entry: PlaylistSong): Song | null | undefined {
  const song = entry.song
  const cue = entry.cue
  if (!song || cue?.kind !== 'song') return song
  return {
    ...song,
    title: cue.label,
    sections: cue.slides.map((slide) => ({
      type: slide.sectionType ?? 'verse',
      label: slide.label,
      marker: '',
      lines: Array.from({ length: Math.max(slide.lines.length, slide.chords?.length ?? 0) }, (_, index) => ({
        lyrics: slide.lines[index] ?? '',
        chords: slide.chords?.[index] ?? '',
      })),
    })),
  }
}

export function editCueTextLayer(slide: CueSlide, layerId: string, text: string): CueSlide {
  if (!slide.design) return slide
  return editCueDesign(slide, {
    ...slide.design,
    layers: slide.design.layers.map((layer) => layer.id === layerId && layer.kind === 'text' ? editDesignText(layer, text) : layer),
  })
}

export function editCueDesign(slide: CueSlide, design: SlideDesign): CueSlide {
  const lyrics = design.layers.find((layer) => layer.kind === 'text' && layer.slot === 'content')
  const lines = lyrics?.kind === 'text'
    ? lyrics.text ? lyrics.text.split('\n') : []
    : designTextLines(design)
  return { ...editCueLines(slide, lines), design }
}

export function editCueLines(slide: CueSlide, lines: string[]): CueSlide {
  const before = slide.lines.join('\n')
  const existing = alignedLyricRuns(before, slide.lyricRuns)
  return { ...slide, lines, ...(slide.lyricRuns ? { lyricRuns: editTextRuns(existing, before, lines.join('\n')) } : {}) }
}

export function formatCueLyrics(slide: CueSlide, runs: DesignTextRun[]): CueSlide {
  const lyrics = songCueLyrics(slide)
  if (!lyrics || !alignedLyricRuns(lyrics.text, runs)) return slide
  if (!slide.design || !lyrics.layer) return { ...slide, lyricRuns: runs }
  const { lyricRuns: _plainRuns, ...styled } = slide
  return { ...styled, design: { ...slide.design, layers: slide.design.layers.map((layer) =>
    layer.id === lyrics.layer?.id && layer.kind === 'text' ? { ...layer, runs } : layer) } }
}

function imageOrVideo(asset: PlaylistCueAsset | undefined): DesignAsset | undefined {
  if (!asset || (asset.kind !== 'image' && asset.kind !== 'video')) return undefined
  return { kind: asset.kind, filename: asset.filename, archivePath: asset.archivePath, libraryId: asset.libraryId,
    ...(asset.mediaCatalog ? { mediaCatalog: asset.mediaCatalog } : {}),
    ...(asset.mediaImportId ? { mediaImportId: asset.mediaImportId } : {}),
    ...(asset.clip ? { clip: asset.clip } : {}), ...(asset.alphaMode ? { alphaMode: asset.alphaMode } : {}),
    ...(asset.posterSeconds !== undefined ? { posterSeconds: asset.posterSeconds } : {}),
    ...(asset.playback ? { playback: asset.playback } : {}) }
}

function matchesLayer(layer: DesignLayer, source: DesignAsset): layer is MediaLayer {
  if (layer.kind !== 'media' || layer.asset.kind !== source.kind) return false
  if (source.archivePath && layer.asset.archivePath) return source.archivePath === layer.asset.archivePath
  if (source.libraryId && layer.asset.libraryId) return source.libraryId === layer.asset.libraryId
  return layer.asset.filename.toLowerCase() === source.filename.toLowerCase()
}

export function editCueAsset(
  slide: CueSlide, position: number, next?: PlaylistCueAsset, layerId?: string,
): CueSlide {
  const assets = [...(slide.assets ?? [])]
  const previous = assets[position]
  if (previous) assets.splice(position, 1, ...(next ? [next] : []))
  else if (next) assets.push(next)
  const updated = { ...slide, assets,
    ...(previous?.kind === 'audio' && next?.kind !== 'audio' ? { soundtrackEdited: true as const } : {}) }
  if (!slide.design) return updated

  const priorMedia = imageOrVideo(previous)
  const nextMedia = imageOrVideo(next)
  const fit = mediaObjectFit(nextMedia?.playback, next?.role === 'background')
  const loop = nextMedia?.kind === 'video' ? next?.repeat : undefined
  let replaced = false
  const matchingPosition = (asset: PlaylistCueAsset) => {
    const current = imageOrVideo(asset)
    return current && priorMedia && current.kind === priorMedia.kind && current.archivePath === priorMedia.archivePath
      && current.libraryId === priorMedia.libraryId && current.filename === priorMedia.filename
  }
  const originalAssets = slide.assets ?? []
  const matchingAssets = originalAssets.filter(matchingPosition)
  const matchingLayers = priorMedia ? slide.design.layers.filter((layer) => matchesLayer(layer, priorMedia)) : []
  const targetLayers = matchingAssets.length <= 1 ? matchingLayers
    : matchingLayers.length === matchingAssets.length
      ? matchingLayers.slice(matchingAssets.indexOf(previous), matchingAssets.indexOf(previous) + 1) : []
  const layers = slide.design.layers.flatMap((layer): DesignLayer[] => {
    if (layer.kind !== 'media' || !targetLayers.includes(layer)) return [layer]
    if (!nextMedia) return []
    replaced = true
    return [{ ...layer, asset: nextMedia, fit: fit ?? layer.fit, loop: loop ?? layer.loop }]
  })
  if (nextMedia && !replaced && layerId) {
    const added: DesignLayer = {
      id: layerId, kind: 'media', asset: nextMedia, frame: { x: 0, y: 0, width: 1, height: 1 },
      fit: fit ?? (next?.role === 'background' ? 'cover' : 'contain'), ...(loop !== undefined ? { loop } : {}),
    }
    if (next?.role === 'background') {
      const firstForeground = layers.findIndex((layer) =>
        layer.frame.x > 0.01 || layer.frame.y > 0.01 || layer.frame.width < 0.99 || layer.frame.height < 0.99 || layer.kind === 'text')
      layers.splice(firstForeground < 0 ? layers.length : firstForeground, 0, added)
    } else {
      layers.push(added)
    }
  }
  return { ...updated, design: { ...slide.design, layers } }
}
