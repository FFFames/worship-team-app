/** Applies authored song layouts over the selected theme or imported layers. */

import type { PlaylistCue } from '../types/database'
import type { DesignAsset, DesignFrame, DesignLayer, DesignTextStyle, ElementEffectChanges, SongArtwork, SongArtworkChange, SongArtworkLayer, SongElementEffectChange, SongSlideLayout } from '../types/slideDesign'
import { isCanvasBackground, visibleDesignTextRuns, withoutCanvasBackground } from './slideDesign'
import { songCueLyrics, songSlideLyricRuns } from './songCueLayout'
import { mediaObjectFit } from './mediaPlayback'
import { editElementEffects, moveLayerFrame, replacePositionedLayer } from './slideElementEffects'
import { authoredShapeGroup } from './slideShapePresets'

export const defaultSongFrame: DesignFrame = { x: 0.08, y: 0.15, width: 0.84, height: 0.7 }
export const defaultSongText: DesignTextStyle = { fontSize: 0.09, align: 'center', verticalAlign: 'center', fitText: true }
const canvas = { x: 0, y: 0, width: 1, height: 1 }

type CueSlide = PlaylistCue['slides'][number]

export function mergeSongSlideLayout(master?: SongSlideLayout, slide?: SongSlideLayout): SongSlideLayout | undefined {
  if (!master || !slide) return slide ?? master
  const artwork = master.artwork && slide.artwork ? {
    changes: [...(master.artwork.changes ?? []), ...(slide.artwork.changes ?? [])],
    order: slide.artwork.order ?? master.artwork.order,
  } : slide.artwork ?? master.artwork
  return { frame: { ...master.frame, ...slide.frame }, style: { ...master.style, ...slide.style },
    background: slide.background ?? master.background, ...(artwork ? { artwork } : {}),
    ...(master.elementEffects || slide.elementEffects ? { elementEffects: [...(master.elementEffects ?? []), ...(slide.elementEffects ?? [])] } : {}),
  }
}

export function updateSongElementEffects(changes: SongElementEffectChange[] = [], layerId: string | undefined, effects: ElementEffectChanges) {
  const previous = changes.find(({ layerId: saved }) => saved === layerId)
  const update = { ...(layerId !== undefined ? { layerId } : {}), effects: { ...previous?.effects, ...effects } }
  return [...changes.filter(({ layerId: saved }) => saved !== layerId), update]
}

export function applySongElementEffects(layers: DesignLayer[], changes?: SongElementEffectChange[],
  lyricId = layers.find((layer) => layer.kind === 'text' && layer.slot === 'content')?.id) {
  return changes?.reduce((layers, change) => {
    const id = change.layerId ?? lyricId
    return id ? editElementEffects(layers, id, change.effects) : layers
  }, layers) ?? layers
}

export function songArtworkChangeId(change: SongArtworkChange) {
  return change.action === 'hide' ? change.id : change.layer.id
}

export function updateSongArtworkLayer(artwork: SongArtwork | undefined, layer: SongArtworkLayer): SongArtwork {
  const changes = artwork?.changes ?? []
  const index = changes.findIndex((change) => songArtworkChangeId(change) === layer.id)
  const change: SongArtworkChange = { action: changes[index]?.action === 'add' ? 'add' : 'update', layer }
  return { ...artwork, changes: index < 0 ? [...changes, change] : changes.map((item, position) => position === index ? change : item) }
}

export function updateSongArtworkFrame(artwork: SongArtwork | undefined, layers: DesignLayer[], changed: SongArtworkLayer) {
  const group = authoredShapeGroup(changed.id)
  if (!group) return updateSongArtworkLayer(artwork, changed)
  const updated = replacePositionedLayer(moveLayerFrame(layers, changed.id, changed.frame), changed)
  return updated.reduce((next, layer) => authoredShapeGroup(layer.id) === group && editableSongArtwork(layer)
    ? updateSongArtworkLayer(next, layer) : next, artwork ?? {})
}

export function editableSongArtwork(layer: DesignLayer, lyricId?: string): layer is SongArtworkLayer {
  return layer.id !== lyricId && (layer.kind === 'text' ? !layer.slot
    : (layer.kind === 'media' || layer.kind === 'camera' || layer.kind === 'fill') && !isCanvasBackground(layer))
}

function applyArtwork(layers: DesignLayer[], artwork: SongArtwork | undefined, lyricId: string): DesignLayer[] {
  if (!artwork) return layers
  const stack = new Map(layers.map((layer) => [layer.id, layer]))
  for (const change of artwork.changes ?? []) {
    const id = songArtworkChangeId(change)
    const previous = stack.get(id)
    if (change.action === 'add') {
      if (!previous) stack.set(id, { ...change.layer, songArtwork: true })
    } else if (previous && editableSongArtwork(previous, lyricId)) {
      if (change.action === 'hide') stack.delete(id)
      else if (previous.kind === change.layer.kind
        || ((previous.kind === 'fill' || previous.kind === 'media') && (change.layer.kind === 'fill' || change.layer.kind === 'media')
          && (previous.presetShape || change.layer.presetShape || previous.clipPaths))) {
        stack.set(id, { ...change.layer, songArtwork: true })
      }
    }
  }
  const result = [...stack.values()]
  if (!artwork.order?.length) return result
  const ordered = new Map(artwork.order.flatMap((id) => {
    const layer = stack.get(id)
    return layer && !isCanvasBackground(layer) ? [[id, layer] as const] : []
  }))
  const order = ordered.values()
  return result.map((layer) => ordered.has(layer.id) ? order.next().value ?? layer : layer)
}

export function songLayoutMedia(layout?: SongSlideLayout) {
  return [
    ...(layout?.background?.kind === 'media' ? [layout.background.asset] : []),
    ...(layout?.artwork?.changes?.flatMap((change) => change.action !== 'hide' && change.layer.kind === 'media' ? [change.layer.asset] : []) ?? []),
  ]
}

export async function mapSongLayoutMedia(layout: SongSlideLayout, map: (asset: DesignAsset) => Promise<DesignAsset>): Promise<SongSlideLayout> {
  const { background, artwork } = layout
  return {
    ...layout,
    ...(background?.kind === 'media' ? { background: { ...background, asset: await map(background.asset) } } : {}),
    ...(artwork?.changes ? { artwork: { ...artwork, changes: await Promise.all(artwork.changes.map(async (change) =>
      change.action !== 'hide' && change.layer.kind === 'media'
        ? { ...change, layer: { ...change.layer, asset: await map(change.layer.asset) } } : change)) } } : {}),
  }
}

/** Keeps authored layers and positioned native inputs when an output uses a different lyric template. */
export function carrySongArtwork(template: NonNullable<CueSlide['design']>, source?: CueSlide['design']): NonNullable<CueSlide['design']> {
  const carry = (layer: DesignLayer) => layer.songArtwork
    || ((layer.kind === 'camera' || (layer.kind === 'media' && layer.asset.dvd)) && !isCanvasBackground(layer))
  if (!source?.layers.some(carry)) return template
  const lyricIndex = (design: NonNullable<CueSlide['design']>) =>
    design.layers.findIndex((layer) => layer.kind === 'text' && layer.slot === 'content')
  const sourceLyric = lyricIndex(source)
  const before = source.layers.slice(0, Math.max(0, sourceLyric)).filter(carry)
  const after = source.layers.slice(sourceLyric + 1).filter(carry)
  const ids = new Set([...before, ...after].map(({ id }) => id))
  const layers = template.layers.filter((layer) => !ids.has(layer.id))
  const anchor = layers.findIndex((layer) => layer.kind === 'text' && layer.slot === 'content')
  if (anchor < 0) return { ...template, layers: [...layers, ...before, ...after] }
  return { ...template, layers: [...layers.slice(0, anchor), ...before, layers[anchor], ...after, ...layers.slice(anchor + 1)] }
}

export function applySongSlideLayout(slide: CueSlide, layout: SongSlideLayout | undefined): CueSlide {
  if (!layout) return slide
  const design: NonNullable<CueSlide['design']> = slide.design ?? { aspectRatio: 16 / 9, layers: [], inheritBackground: true }
  const lyrics = songCueLyrics(slide)
  const layer = lyrics?.layer
  const body: DesignLayer = {
    ...layer, kind: 'text', id: layer?.id ?? 'song-layout-lyrics', slot: 'content',
    text: lyrics?.text ?? slide.lines.join('\n'), runs: (layer && visibleDesignTextRuns(layer)) ?? songSlideLyricRuns(slide),
    frame: { ...(layer?.frame ?? defaultSongFrame), ...layout.frame },
    style: { ...(layer ? layer.style : defaultSongText), ...layout.style },
    ...(layout.style?.fitText !== undefined && layer?.textLayout?.sizing
      ? { textLayout: { ...layer.textLayout, sizing: layout.style.fitText ? 'fit' : 'fixed' } } : {}),
  }
  const retained = layout.background ? withoutCanvasBackground(design).layers : design.layers
  const artwork = applyArtwork(layer ? retained.map((item) => item === layer ? body : item) : [...retained, body], layout.artwork, body.id)
  const layers = applySongElementEffects(artwork, layout.elementEffects, body.id)
  const background = layout.background
  if (background) {
    const layer = { id: 'song-layout-background', frame: canvas, ...background }
    layers.unshift(layer.kind === 'media' ? { ...layer,
      fit: mediaObjectFit(layer.asset.playback ?? layer.asset.dvd?.playback, true) ?? (layer.asset.dvd ? 'fill' : 'cover'),
    } : layer)
  }
  return { ...slide, design: { ...design, layers, ...(background ? { inheritBackground: undefined } : {}) } }
}
