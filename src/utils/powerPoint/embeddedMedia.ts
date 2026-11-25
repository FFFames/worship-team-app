/** Reads PowerPoint audio and video, their poster frames, and supported start settings. */

import type { MediaClip } from '../../types/media'
import type { DesignFrame, DesignLayer, DesignSoundtrack, PowerPointBuild, SlideDesign } from '../../types/slideDesign'
import { libraryMediaMime } from '../mediaLibrary'
import { maxPowerPointBuildChanges, maxPowerPointBuildSteps } from './buildNavigation'
import { linkedPowerPointMediaPrefix } from './linkedMedia'
import { powerPointOnlineVideoHtml } from './onlineVideo'
import { isPowerPointPlayCommand, type PowerPointClickGroup } from './visibilityBuild'

export type PowerPointPicture = { shape: Element; layerId: string; frame: DesignFrame; rotation?: number; relationships?: Record<string, string>;
  linkedMediaProblems?: ReadonlyMap<string, string>; onlineVideos?: ReadonlyMap<string, string> }
const p14 = 'http://schemas.microsoft.com/office/powerpoint/2010/main'
const p15 = 'http://schemas.microsoft.com/office/powerpoint/2012/main'
const wp15 = 'http://schemas.microsoft.com/office/word/2012/wordprocessingDrawing'

export function isPowerPointVideoLayer(layer: DesignLayer): layer is Extract<DesignLayer, { kind: 'media' | 'web' }> {
  return (layer.kind === 'media' || layer.kind === 'web') && layer.powerPointMedia === true
}

function child(parent: Element | undefined, name: string) {
  return parent && [...parent.children].find((element) => element.localName === name)
}

function attr(element: Element | undefined, name: string) {
  return element?.getAttribute(name) ?? undefined
}

function reference(element: Element | undefined, name: string) {
  return element && [...element.attributes].find((attribute) => attribute.localName === name && /relationships$/.test(attribute.namespaceURI ?? ''))?.value
}

function positiveNumber(element: Element | undefined, name: string) {
  const raw = attr(element, name)
  if (!raw || !/^\d+(?:\.\d+)?$/.test(raw)) return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

function timingNodes(timing: Element | undefined) {
  const byShape = new Map<string, Element>()
  for (const node of timing?.getElementsByTagNameNS('*', 'cMediaNode') ?? []) {
    const id = attr(child(child(node, 'tgtEl'), 'spTgt'), 'spid')
    if (id && !byShape.has(id)) byShape.set(id, node)
  }
  return byShape
}

function automaticMedia(timing: Element | undefined, media: Element | undefined, shapeId: string | undefined) {
  const conditions = child(child(media, 'cTn'), 'stCondLst')
  if (conditions?.children.length === 1 && attr(child(conditions, 'cond'), 'delay') === '0'
    && !child(conditions, 'cond')?.hasAttribute('evt')) return true
  // PowerPoint can start media with the slide using a zero-delay media command in the main sequence.
  for (const command of timing?.getElementsByTagNameNS('*', 'cmd') ?? []) {
    if (!isPowerPointPlayCommand(attr(command, 'cmd'))) continue
    if (attr(child(child(child(command, 'cBhvr'), 'tgtEl'), 'spTgt'), 'spid') !== shapeId || !shapeId) continue
    for (let parent = command.parentElement; parent; parent = parent.parentElement) {
      if (parent.localName !== 'cTn') continue
      const type = attr(parent, 'nodeType')
      if (type === 'mainSeq') return true
      if (type === 'interactiveSeq' || type === 'clickEffect') break
      const start = child(parent, 'stCondLst')
      if (start && [...start.children].some((condition) => attr(condition, 'delay') !== '0' || condition.hasAttribute('evt'))) break
    }
  }
  return false
}

export function applyEmbeddedPowerPointMedia(base: SlideDesign, pictures: readonly PowerPointPicture[], timing: Element | undefined,
  warnings: Set<string>, unresolvedMedia: Set<string>, timeline: readonly PowerPointClickGroup[] = []) {
  const byShape = timingNodes(timing)
  const mediaGroups = new Map<string, number>()
  const occupied = new Set<number>()
  for (const [index, group] of timeline.entries()) {
    if (group.changes.length) occupied.add(index)
    for (const shape of group.mediaShapeIds) mediaGroups.set(shape, index)
  }
  const starts = new Map<string, PowerPointBuild[number][number]>()
  const extraSteps: PowerPointBuild = []
  const layers = [...base.layers]
  const soundtracks: DesignSoundtrack[] = []
  const fullScreen: DesignLayer[] = []
  const resolvedLinks: string[] = []
  let converted = false
  let changes = base.powerPointBuild?.reduce((total, step) => total + step.length, 0) ?? 0

  for (const picture of pictures) {
    const metadata = child(picture.shape, 'nvPicPr')
    const properties = child(metadata, 'nvPr')
    const video = child(properties, 'videoFile')
    const audio = child(properties, 'audioFile') ?? child(properties, 'wavAudioFile')
    const media = properties?.getElementsByTagNameNS(p14, 'media')[0]
    const webVideo = picture.shape.getElementsByTagNameNS(p15, 'webVideoPr')[0]
      ?? picture.shape.getElementsByTagNameNS(wp15, 'webVideoPr')[0]
    const kind = video || webVideo ? 'video' : audio ? 'audio' : undefined
    const typeSource = video ?? audio
    if (!kind && !media) continue
    const relationships = picture.relationships ?? {}
    const candidates = [reference(media, 'embed'), reference(typeSource, 'embed'), reference(typeSource, 'link'), reference(media, 'link')]
    const files = candidates.flatMap((id) => id && Object.prototype.hasOwnProperty.call(relationships, id) ? [relationships[id]] : [])
      .filter((path) => libraryMediaMime(path)?.startsWith(`${kind}/`))
    const source = files.find((path) => !path.startsWith(linkedPowerPointMediaPrefix)) ?? files[0]
    const videoLink = reference(video, 'link') ?? reference(media, 'link')
    const onlineUrl = !source && kind === 'video' && (powerPointOnlineVideoHtml(attr(webVideo, 'embeddedHtml'))
      ?? (videoLink && picture.onlineVideos?.get(videoLink)))
    if (!source && !onlineUrl) {
      const reasons = candidates.flatMap((id) => {
        const reason = id && picture.linkedMediaProblems?.get(id)
        return reason ? [reason] : []
      })
      for (const reason of reasons) unresolvedMedia.add(reason)
      if (!reasons.length) warnings.add('สื่อ PowerPoint ที่ลิงก์ภายนอกหรือรูปแบบที่ยังไม่รองรับใช้ภาพตัวอย่างเมื่อมี')
      continue
    }

    const shapeId = attr(child(metadata, 'cNvPr'), 'id')
    const playbackNode = shapeId ? byShape.get(shapeId) : undefined
    const group = shapeId && !starts.has(shapeId) ? mediaGroups.get(shapeId) : undefined
    const auto = group === undefined && automaticMedia(timing, playbackNode, shapeId)
    const addsStep = group === undefined || !occupied.has(group)
    const stepCount = (timeline.length ? occupied.size : base.powerPointBuild?.length ?? 0) + extraSteps.length
    if (!auto && ((addsStep && stepCount >= maxPowerPointBuildSteps) || changes >= maxPowerPointBuildChanges)) {
      warnings.add('สไลด์นี้มีคำสั่งให้เล่นสื่อ PowerPoint เกินจำนวนที่รองรับ')
      continue
    }
    const id = `${picture.layerId}:embedded`
    if (onlineUrl || source?.startsWith(linkedPowerPointMediaPrefix)) resolvedLinks.push(id)
    const volume = Math.min(1, (positiveNumber(playbackNode, 'vol') ?? 100_000) / 100_000)
    const repeat = attr(child(playbackNode, 'cTn'), 'repeatCount') === 'indefinite'
    const fullscreen = ['1', 'true'].includes(playbackNode?.parentElement?.getAttribute('fullScrn') ?? '')
    const layerBase = { id, role: 'foreground' as const, powerPointMedia: true as const,
      frame: fullscreen ? { x: 0, y: 0, width: 1, height: 1 } : picture.frame,
      ...(!fullscreen && picture.rotation ? { rotation: picture.rotation } : {}) }
    let layer: DesignLayer | undefined
    if (onlineUrl) {
      layer = { ...layerBase, kind: 'web', url: onlineUrl }
    } else if (source && kind) {
      const trim = child(media, 'trim')
      const start = positiveNumber(trim, 'st')
      const end = positiveNumber(trim, 'end')
      const clip: MediaClip | undefined = start || end ? { ...(start ? { startSeconds: start / 1000 } : {}),
        ...(end ? { endTrimSeconds: end / 1000 } : {}) } : undefined
      if (child(media, 'fade') || child(media, 'bmkLst')) warnings.add('ยังใช้บุ๊กมาร์กและการเฟดของสื่อจาก PowerPoint ไม่ได้')
      const asset = { filename: source.split('/').pop() ?? source, sourcePath: source,
        playback: { volume, muted: volume === 0 }, ...(clip ? { clip } : {}) }
      if (kind === 'audio') soundtracks.push({ ...asset, kind, role: 'foreground', repeat, powerPointMediaId: id })
      else layer = { ...layerBase, kind: 'media', fit: fullscreen ? 'contain' : 'fill', loop: repeat, asset: { ...asset, kind } }
    }
    if (layer) {
      const poster = layers.findIndex((layer) => layer.id === picture.layerId)
      const posterLayer = layers[poster]
      if (posterLayer?.kind === 'media') layers[poster] = { ...posterLayer, role: 'foreground' }
      if (fullscreen) fullScreen.push(layer)
      else if (poster >= 0) layers.splice(poster + 1, 0, layer)
      else layers.push(layer)
    }
    if (!auto) {
      const change = { layerId: id, visible: true }
      if (group !== undefined && shapeId) {
        starts.set(shapeId, change)
        occupied.add(group)
      } else extraSteps.push([change])
      changes++
    }
    converted = true
  }
  if (!converted) return undefined
  if (soundtracks.length > 1) warnings.add('แทร็กเสียง PowerPoint ที่เริ่มล่าสุดเล่นเป็นแทร็กหลักของสไลด์')
  const ordered = timeline.length ? timeline.map(({ changes, mediaShapeIds }) => [
    ...changes, ...mediaShapeIds.flatMap((shape) => {
      const start = starts.get(shape)
      return start ? [start] : []
    }),
  ]).filter((step) => step.length) : base.powerPointBuild ?? []
  const build = [...ordered, ...extraSteps]
  return { ...base, layers: [...layers, ...fullScreen], ...(build.length ? { powerPointBuild: build } : {}),
    ...(soundtracks.length ? { soundtracks } : {}), ...(resolvedLinks.length ? { powerPointResolvedMediaLinks: resolvedLinks } : {}) } satisfies SlideDesign
}
