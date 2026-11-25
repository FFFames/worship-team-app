/** Reviews changing a playlist's media snapshots to match one library record. */

import type { PlaylistCue, PlaylistCueAsset, PlaylistSong } from '../types/database'
import type { MediaLibraryItem } from '../types/media'
import type { DesignAsset, DesignLayer, DesignSoundtrack, SlideDesign, SongSlideLayout } from '../types/slideDesign'
import { libraryMediaCueAsset } from './mediaLibrary'
import { mediaObjectFit, sameMediaPlayback } from './mediaPlayback'
import { mediaClipKey } from './mediaClip'
import { isCanvasBackground } from './slideDesign'

export type PlaylistMediaRow = Pick<PlaylistSong, 'id' | 'order' | 'cue' | 'background_asset' | 'slide_theme'> & {
  song?: { title: string } | null
}

export type PlaylistMediaUpdate = {
  entry_id: string
  expected_cue: PlaylistCue | null
  cue: PlaylistCue | null
  expected_background: PlaylistCueAsset | null
  background: PlaylistCueAsset | null
  expected_theme: PlaylistSong['slide_theme'] | null
  theme: PlaylistSong['slide_theme'] | null
}

type MediaReference = PlaylistCueAsset | DesignAsset | DesignSoundtrack
type MediaLayer = Extract<DesignLayer, { kind: 'media' }>

function filenameKey(name: string) {
  const path = name.replace(/\\/g, '/')
  return path.slice(path.lastIndexOf('/') + 1).normalize('NFC').toLowerCase()
}

function matcher(item: MediaLibraryItem, records: readonly MediaLibraryItem[]) {
  const catalog = records.filter((record) => record.kind === item.kind)
  return (asset: MediaReference) => {
    if (asset.kind !== item.kind || ('dvd' in asset && asset.dvd)) return false
    if (asset.mediaCatalog) return asset.mediaCatalog.id === item.id
    const candidates = catalog.filter((record) => asset.libraryId === record.assetId || (asset.easyWorshipFileHash
      && [record.metadata?.fileHash, record.metadata?.legacyVideoSourceHash].includes(asset.easyWorshipFileHash)))
    if (candidates.length === 1) return candidates[0].id === item.id
    const filename = filenameKey(asset.filename)
    const named = candidates.filter((record) => filename === filenameKey(record.filename)
      || (typeof record.metadata?.catalogFilename === 'string' && filename === filenameKey(record.metadata.catalogFilename)))
    return named.length === 1 && named[0].id === item.id
  }
}

export function reviewPlaylistMediaUpdates(rows: readonly PlaylistMediaRow[], item: MediaLibraryItem, records: readonly MediaLibraryItem[]) {
  const matches = matcher(item, records)
  const { clip, alphaMode, playback, posterSeconds, repeat, mediaCatalog } = libraryMediaCueAsset(item, 'foreground')
  function refreshVisual<T extends MediaReference>(asset: T): T {
    if (asset.mediaCatalog?.id === item.id && asset.mediaCatalog.name === item.name
      && mediaClipKey(asset.clip) === mediaClipKey(clip) && sameMediaPlayback(asset.playback, playback)
      && asset.alphaMode === alphaMode && ('posterSeconds' in asset ? asset.posterSeconds : undefined) === posterSeconds) return asset
    return { ...asset, clip, alphaMode, playback, posterSeconds, mediaCatalog }
  }
  function refreshAsset<T extends PlaylistCueAsset | DesignSoundtrack>(asset: T): T {
    if (!matches(asset)) return asset
    const next = refreshVisual(asset)
    return next.repeat === repeat ? next : { ...next, repeat }
  }
  function refreshLayer(layer: MediaLayer, background: boolean): MediaLayer {
    if (!matches(layer.asset)) return layer
    const asset = refreshVisual(layer.asset)
    const fit = mediaObjectFit(playback, background) ?? layer.fit
    const loop = asset.kind === 'video' ? repeat ?? layer.loop : layer.loop
    if (asset === layer.asset && fit === layer.fit && loop === layer.loop) return layer
    const { easyWorshipLegacyPlayback: _legacy, ...layout } = layer
    return { ...layout, asset, fit, loop }
  }
  function refreshDesign(design: SlideDesign): SlideDesign {
    return { ...design, layers: design.layers.map((layer) => layer.kind === 'media'
      ? refreshLayer(layer, Boolean(layer.inheritedFromMaster) || isCanvasBackground(layer)) : layer),
      ...(design.soundtracks ? { soundtracks: design.soundtracks.map(refreshAsset) } : {}) }
  }
  function refreshLayout(layout: SongSlideLayout): SongSlideLayout {
    const { background, artwork } = layout
    const asset = background?.kind === 'media' && matches(background.asset) ? refreshVisual(background.asset) : undefined
    return { ...layout,
      ...(asset && background?.kind === 'media' ? { background: { ...background, asset, loop: repeat ?? background.loop } } : {}),
      ...(artwork?.changes ? { artwork: { ...artwork, changes: artwork.changes.map((change) =>
        change.action !== 'hide' && change.layer.kind === 'media' ? { ...change, layer: refreshLayer(change.layer, false) } : change) } } : {}),
    }
  }
  function refreshCue(cue: PlaylistCue): PlaylistCue {
    const followsCatalog = (assets: PlaylistCueAsset[] | undefined, label: string) =>
      cue.kind === item.kind && assets?.some((asset) => matches(asset) && asset.mediaCatalog?.name === label)
    const renameCue = followsCatalog(cue.assets, cue.label)
      || cue.slides.some((slide) => !slide.labelEdited && followsCatalog(slide.assets, cue.label))
    return { ...cue, ...(renameCue ? { label: item.name } : {}),
      ...(cue.assets ? { assets: cue.assets.map(refreshAsset) } : {}),
      ...(cue.slideLayout ? { slideLayout: refreshLayout(cue.slideLayout) } : {}),
      slides: cue.slides.map((slide) => ({ ...slide,
        ...(!slide.labelEdited && followsCatalog(slide.assets ?? cue.assets, slide.label) ? { label: item.name } : {}),
        ...(slide.assets ? { assets: slide.assets.map(refreshAsset) } : {}),
        ...(slide.design ? { design: refreshDesign(slide.design) } : {}),
        ...(slide.slideLayout ? { slideLayout: refreshLayout(slide.slideLayout) } : {}),
      })),
    }
  }

  return rows.flatMap((row) => {
    const expectedCue = row.cue ?? null
    const expectedBackground = row.background_asset ?? null
    const expectedTheme = row.slide_theme ?? null
    const cue = expectedCue && refreshCue(expectedCue)
    const background = expectedBackground && refreshAsset(expectedBackground)
    const theme = expectedTheme && { ...expectedTheme, design: refreshDesign(expectedTheme.design) }
    if (JSON.stringify([expectedCue, expectedBackground, expectedTheme]) === JSON.stringify([cue, background, theme])) return []
    const update: PlaylistMediaUpdate = { entry_id: row.id, expected_cue: expectedCue, cue, expected_background: expectedBackground,
      background, expected_theme: expectedTheme, theme }
    return [{ update, order: row.order, label: expectedCue?.label || row.song?.title || item.name }]
  })
}
