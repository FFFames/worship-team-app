/** Converts schedule-local slides to reusable presentations and back. */

import type { PlaylistCue, PlaylistCueAsset } from '../types/database'
import type { DesignAsset, DesignContent, DesignLayer, DesignSoundtrack, LibraryDesign, SlideDesign } from '../types/slideDesign'
import { presentationWebUrl } from './livePresentation'
import { playlistMediaFilename } from './scheduleMedia'
import { presentationCue } from './slideDesign'
import { mediaObjectFit } from './mediaPlayback'
import { validOptionalSpeakerNotes } from './speakerNotes'

export type PresentationDecision = 'add' | 'replace' | 'use_library'
export type PresentationCue = PlaylistCue & { kind: 'presentation' | 'powerpoint' }

const canvas = { x: 0, y: 0, width: 1, height: 1 }

export function isPresentationCue(cue?: PlaylistCue | null): cue is PresentationCue {
  return cue?.kind === 'presentation' || cue?.kind === 'powerpoint'
}

function metadataText(cue: PresentationCue, key: string) {
  const value = cue.metadata?.[key]
  return typeof value === 'string' ? value.trim() || undefined : undefined
}

export function presentationSourceUid(cue: PresentationCue) {
  if (cue.kind === 'powerpoint') {
    return metadataText(cue, 'powerPointImportKey') ?? metadataText(cue, 'uid') ?? metadataText(cue, 'presentationUid')
  }
  return metadataText(cue, 'presentationUid') ?? metadataText(cue, 'uid')
}

export function matchesPresentationKind(cue: PresentationCue, design: LibraryDesign) {
  return design.kind === 'presentation' && (cue.kind === 'powerpoint') === (design.content.source?.format === 'powerpoint')
}

function libraryAsset<T extends DesignAsset | DesignSoundtrack>(asset: T, portable: boolean): T {
  if (!portable || !asset.archivePath) return asset
  const { archivePath, ...stored } = asset
  return { ...stored, filename: playlistMediaFilename(asset), sourcePath: archivePath } as T
}

function visualAsset(asset: PlaylistCueAsset): DesignAsset | undefined {
  if (asset.kind !== 'image' && asset.kind !== 'video') return undefined
  const { kind, filename, libraryId, mediaCatalog, archivePath, clip, posterSeconds, alphaMode, dvd, playback } = asset
  return { kind, filename, libraryId, mediaCatalog, archivePath, clip, posterSeconds, alphaMode, dvd, playback }
}

function sameAsset(a: DesignAsset, b: DesignAsset) {
  if (a.kind !== b.kind) return false
  if (a.libraryId && b.libraryId) return a.libraryId === b.libraryId
  if (a.archivePath && b.archivePath) return a.archivePath === b.archivePath
  if (a.dvd && b.dvd) return a.dvd.id === b.dvd.id
  return a.filename === b.filename
}

export function presentationContentFromCue(cue: PresentationCue, portable = false): DesignContent {
  const warnings = new Set(cue.warnings)
  const slides = cue.slides.length ? cue.slides : [{ label: cue.label, lines: [], assets: cue.assets }]
  const uid = presentationSourceUid(cue)
  const source = uid || cue.kind === 'powerpoint' ? {
    format: cue.kind === 'powerpoint' ? 'powerpoint' as const : 'easyworship' as const,
    uid: uid ?? cue.sourceId ?? cue.label,
    author: metadataText(cue, 'author'), copyright: metadataText(cue, 'copyright'), description: metadataText(cue, 'description'),
  } : undefined
  const content = slides.map((slide, index) => {
    const assets = slide.assets ?? cue.assets ?? []
    const layers = [...(slide.design?.layers ?? [])]
    for (const [position, asset] of assets.entries()) {
      const visual = visualAsset(asset)
      const id = `schedule-asset:${position}`
      if (visual && !layers.some((layer) => layer.kind === 'media' && sameAsset(layer.asset, visual))) {
        const layer: DesignLayer = { kind: 'media', id, frame: canvas, asset: visual, role: asset.role, loop: asset.repeat,
          fit: mediaObjectFit(asset.playback, asset.role === 'background') ?? (asset.role === 'background' ? 'cover' : 'contain') }
        if (asset.role === 'background') layers.unshift(layer)
        else layers.push(layer)
      }
      if (asset.kind === 'web' && !layers.some((layer) => layer.kind === 'web' && layer.url === asset.url)) {
        const url = presentationWebUrl(asset.url ?? '')
        if (url) layers.push({ kind: 'web', id, url, frame: canvas, role: asset.role, hideScrollbars: asset.hideScrollbars })
      }
      if (asset.kind === 'camera') warnings.add('กล้องสดอยู่ในคิวของตารางและใช้ในคลังงานนำเสนอไม่ได้')
    }
    if (!slide.design && slide.lines.some((line) => line.trim())) {
      layers.push({ id: 'schedule-text', kind: 'text', text: slide.lines.join('\n'),
        frame: { x: .06, y: .05, width: .88, height: .9 }, style: { fitText: true, fontSize: .085 } })
    }
    const tracks = assets.flatMap<DesignSoundtrack>((asset) => asset.kind === 'audio' ? [{
      kind: 'audio', filename: asset.filename, role: asset.role ?? 'foreground', archivePath: asset.archivePath,
      libraryId: asset.libraryId, mediaCatalog: asset.mediaCatalog, clip: asset.clip, repeat: asset.repeat, playback: asset.playback,
    }] : [])
    const soundtracks = (tracks.length ? tracks : slide.design?.soundtracks)?.map((asset) => libraryAsset(asset, portable))
    const design: SlideDesign = {
      ...slide.design,
      aspectRatio: slide.design?.aspectRatio ?? 16 / 9,
      layers: layers.map((layer) => layer.kind === 'media' ? { ...layer, asset: libraryAsset(layer.asset, portable) } : layer),
      ...(soundtracks?.length ? { soundtracks } : {}),
    }
    return { id: slide.sourceId ?? `schedule-slide:${index}`, label: slide.label, design,
      ...(slide.speakerNotes !== undefined ? { speakerNotes: slide.speakerNotes } : {}),
      advanceMs: slide.advanceMs, playback: slide.playback, transition: slide.transition,
      transitionEdited: slide.transitionEdited, template: slide.template }
  })
  const notes = cue.metadata?.libraryNotes
  return { slides: content, looping: cue.looping, source,
    ...(typeof notes === 'string' && validOptionalSpeakerNotes(notes) ? { notes } : {}),
    ...(warnings.size ? { warnings: [...warnings] } : {}),
  }
}

export function playlistCueFromLibrary(previous: PresentationCue, target: LibraryDesign): PlaylistCue {
  const next = presentationCue(target)
  return {
    ...next, sourceOrder: previous.sourceOrder,
    metadata: { ...next.metadata, notes: previous.metadata?.notes ?? null, groupLevel: previous.metadata?.groupLevel ?? null },
  }
}
