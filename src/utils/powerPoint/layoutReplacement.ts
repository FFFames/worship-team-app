/** Matches slide updates from the same PowerPoint source while keeping operator edits. */

import { sha256 } from '@noble/hashes/sha2.js'
import type { DesignContent, DesignLayer, PowerPointBuild, SlideDesign } from '../../types/slideDesign'
import { maxPowerPointBuildChanges, maxPowerPointBuildSteps } from './buildNavigation'
import { refreshLinkedPowerPointMediaWarnings } from './linkedMedia'
import { isPowerPointVideoLayer } from './embeddedMedia'
import { fillMissingSlidePlayback, type SlidePlaybackFields } from '../slidePlayback'
import { fallbackPowerPointTransition, unavailablePowerPointTransitionSound, unsupportedPowerPointTransition, unsupportedPowerPointTransitionSound } from './transitions'
import { hasPowerPointTransitionSound, restorePowerPointTransitionSound, withoutPowerPointTransitionSound } from './transitionSound'
import { isPowerPointTableLayer } from './tables'
import { fillMissingSpeakerNotes } from '../speakerNotes'

export const powerPointVisualWarnings = {
  shape: 'รูปทรง PowerPoint บางชนิดแสดงได้ไม่ครบในสไลด์แบบแก้ไข',
  group: 'การหมุนหรือกลับด้านกลุ่ม PowerPoint ยังไม่รองรับ',
  object: 'ข้ามวัตถุ PowerPoint ที่ต้องใช้ตัวแสดงผลเพิ่มเติม เช่น แผนภูมิหรือเส้นเชื่อม',
  table: 'ตาราง PowerPoint บางรายการมีรูปแบบที่แสดงได้ไม่ครบในสไลด์แบบแก้ไข',
  flip: 'การกลับด้านบางองค์ประกอบยังไม่รองรับ',
}
const incompleteVisualWarnings = new Set([...Object.values(powerPointVisualWarnings), 'รูปร่าง PowerPoint บางชนิดแสดงด้วยกรอบสี่เหลี่ยม',
  'ข้ามวัตถุ PowerPoint ที่ต้องใช้ตัวแสดงผลเพิ่มเติม เช่น ตาราง แผนภูมิ หรือเส้นเชื่อม'])
const renderedNotice = 'ใช้ภาพนิ่งจาก LibreOffice Impress สำหรับสไลด์ '
const legacyBuildWarning = 'เอฟเฟ็กต์และลำดับแอนิเมชัน PowerPoint ยังไม่รองรับ'
export const unsupportedPowerPointBuild = 'เอฟเฟ็กต์หรือตัวจับเวลาแอนิเมชัน PowerPoint บางรายการแสดงได้เฉพาะสถานะนิ่งหรือยังไม่รองรับ'
const buildNotice = 'ใช้ปุ่มถัดไปเพื่อแสดงองค์ประกอบทีละขั้นในสไลด์ '

export function powerPointRenderedNotice(slideNumbers: readonly number[]) {
  return renderedNotice + slideNumbers.join(', ')
}

export function powerPointBuildNotice(slideNumbers: readonly number[]) {
  return buildNotice + slideNumbers.join(', ')
}

export function refreshPowerPointVisualWarnings(saved: readonly string[], incoming: readonly string[], prefix = '') {
  return [...new Set([...saved.filter((warning) => !warning.startsWith(prefix)
    || !incompleteVisualWarnings.has(warning.slice(prefix.length))),
    ...incoming.filter((warning) => warning.startsWith(prefix + renderedNotice)
      || (warning.startsWith(prefix) && incompleteVisualWarnings.has(warning.slice(prefix.length))))])]
}

export function refreshPowerPointBuildWarnings(saved: readonly string[], incoming: readonly string[], prefix = '') {
  return [...new Set([...saved.filter((warning) => warning !== prefix + legacyBuildWarning),
    ...incoming.filter((warning) => warning.startsWith(prefix + buildNotice) || warning === prefix + unsupportedPowerPointBuild)])]
}

export function refreshPowerPointTransitionWarnings(saved: readonly string[], incoming: readonly string[], prefix = '',
  playbackRestored = false, soundRestored = false) {
  const notices = new Set([
    ...playbackRestored ? [unsupportedPowerPointTransition, fallbackPowerPointTransition] : [],
    ...soundRestored ? [unsupportedPowerPointTransitionSound, unavailablePowerPointTransitionSound] : [],
  ].map((notice) => prefix + notice))
  return [...new Set([...saved.filter((notice) => !notices.has(notice)), ...incoming.filter((notice) => notices.has(notice))])]
}

export function powerPointLayoutKey(design: SlideDesign) {
  const json = JSON.stringify(withoutPowerPointTransitionSound(design), (_, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value)
  return Array.from(sha256(new TextEncoder().encode(json)), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function replaceEditablePowerPointLayout(saved: SlideDesign, incoming: SlideDesign): SlideDesign | undefined {
  const key = incoming.powerPointLayoutBeforeRendering
  if (key && !saved.powerPointLayoutBeforeRendering && !saved.powerPointTablesImported && powerPointLayoutKey(saved) === key) {
    return hasPowerPointTransitionSound(saved)
      ? restorePowerPointTransitionSound(withoutPowerPointTransitionSound(incoming), saved) : incoming
  }
}

export function hasPowerPointSlideUpdate({ design, transition, advanceMs, speakerNotes }: SlidePlaybackFields & { design?: SlideDesign; speakerNotes?: string }) {
  return Boolean(speakerNotes || transition || advanceMs !== undefined || design?.powerPointLayoutBeforeRendering
    || design?.powerPointLayoutBeforeMedia || design?.powerPointBuild?.length || design?.powerPointTablesImported || hasPowerPointTransitionSound(design))
}

export function withoutPowerPointTableLayers(design: SlideDesign): SlideDesign {
  if (!design.powerPointTablesImported) return design
  const { powerPointTablesImported: _tables, ...layout } = design
  return { ...layout, layers: layout.layers.filter((layer) => !isPowerPointTableLayer(layer)) }
}

export function restorePowerPointTableLayers(saved: SlideDesign, incoming: SlideDesign): SlideDesign {
  if (saved.powerPointTablesImported || saved.powerPointLayoutBeforeRendering || !incoming.powerPointTablesImported) return saved
  const savedIds = new Set(saved.layers.map(({ id }) => id))
  const next = new Map<string, DesignLayer[]>()
  let pending: DesignLayer[] = []
  for (const layer of incoming.layers) {
    if (isPowerPointTableLayer(layer) && !savedIds.has(layer.id)) pending.push(layer)
    else if (pending.length && savedIds.has(layer.id)) {
      next.set(layer.id, pending)
      pending = []
    }
  }
  if (!next.size && !pending.length) return saved
  const layers = saved.layers.flatMap((layer) => [...next.get(layer.id) ?? [], layer])
  return { ...saved, layers: [...layers, ...pending], powerPointTablesImported: true }
}

function mediaIds(design: SlideDesign) {
  return new Set([...design.layers.filter(isPowerPointVideoLayer).map(({ id }) => id),
    ...design.soundtracks?.flatMap((track) => track.powerPointMediaId ?? []) ?? []])
}

function filterBuild(build: PowerPointBuild, keep: (id: string) => boolean): PowerPointBuild {
  return build.map((step) => step.filter(({ layerId }) => keep(layerId))).filter((step) => step.length)
}

function recoverMediaBuild(saved: SlideDesign, incoming: SlideDesign, added: ReadonlySet<string>): PowerPointBuild {
  const previous = saved.powerPointBuild ?? []
  const source = incoming.powerPointBuild ?? []
  const fallback = added.size ? [...previous, ...filterBuild(source, (id) => added.has(id))] : previous
  if (saved.powerPointLayoutBeforeRendering !== incoming.powerPointLayoutBeforeRendering) return fallback

  const retained = new Set([...saved.layers.map(({ id }) => id), ...mediaIds(saved), ...added])
  const ordered = filterBuild(source, (id) => retained.has(id))
  const prior = filterBuild(ordered, (id) => !added.has(id))
  const sameBuild = (left: PowerPointBuild, right: PowerPointBuild) =>
    left.length === right.length && left.every((step, index) => step.length === right[index].length
      && step.every((change, position) => change.layerId === right[index][position].layerId && change.visible === right[index][position].visible))
  if (sameBuild(previous, prior)) return sameBuild(previous, ordered) ? previous : ordered

  // Older imports appended one start step per file after the entire visual sequence.
  const media = mediaIds(incoming)
  const visual = filterBuild(prior, (id) => !media.has(id))
  const expected = filterBuild(prior, (id) => media.has(id)).flat()
  const tail = previous.slice(visual.length)
  const legacyStarts = new Set(tail.flatMap((step) => step.length === 1 && step[0].visible ? [step[0].layerId] : []))
  if (legacyStarts.size === tail.length && tail.length === expected.length
    && expected.every(({ layerId, visible }) => visible && legacyStarts.has(layerId))
    && sameBuild(previous.slice(0, visual.length), visual)) return sameBuild(previous, ordered) ? previous : ordered
  return added.size ? fallback : previous
}

function addLinkedPowerPointMedia(saved: SlideDesign, incoming: SlideDesign): SlideDesign | undefined {
  if (saved.powerPointLayoutBeforeMedia !== incoming.powerPointLayoutBeforeMedia) return undefined
  const previous = new Set(saved.powerPointResolvedMediaLinks)
  const needed = new Set(incoming.powerPointResolvedMediaLinks?.filter((id) => !previous.has(id)))
  const ready = new Set<string>()
  const layers = [...saved.layers]
  for (const layer of incoming.layers) {
    if (!isPowerPointVideoLayer(layer) || !needed.has(layer.id) || layers.some((old) => old.id === layer.id)) continue
    const posterId = layer.id.slice(0, -':embedded'.length)
    const reference = incoming.layers.find((candidate) => candidate.id === posterId)
    const position = layers.findIndex((candidate) => candidate.id === posterId)
    if (reference) {
      const old = layers[position]
      if (!old || old.kind !== 'media' || reference.kind !== 'media' || old.asset.libraryId !== reference.asset.libraryId) continue
      const { role: _was, ...original } = old
      const { role: _now, ...expected } = reference
      if (powerPointLayoutKey({ aspectRatio: 1, layers: [original] }) !== powerPointLayoutKey({ aspectRatio: 1, layers: [expected] })) continue
      layers[position] = { ...old, role: 'foreground' }
    }
    const inRenderedSlide = Boolean(saved.powerPointLayoutBeforeRendering)
    if (!reference && Boolean(incoming.powerPointLayoutBeforeRendering) !== inRenderedSlide) continue
    const followsPoster = layer.kind === 'media' ? layer.fit !== 'contain'
      : incoming.layers[incoming.layers.indexOf(layer) - 1]?.id === posterId
    if (position >= 0 && followsPoster) layers.splice(position + 1, 0, layer)
    else layers.push(layer)
    ready.add(layer.id)
  }
  const tracks = (incoming.soundtracks ?? []).filter((track) => track.powerPointMediaId && needed.has(track.powerPointMediaId)
    && !saved.soundtracks?.some((existing) => existing.powerPointMediaId === track.powerPointMediaId))
  for (const { powerPointMediaId } of tracks) if (powerPointMediaId) ready.add(powerPointMediaId)
  const build = recoverMediaBuild(saved, incoming, ready)
  if (!ready.size) return build.length && build !== saved.powerPointBuild ? { ...saved, powerPointBuild: build } : undefined
  if (build.length > maxPowerPointBuildSteps
    || build.reduce((count, step) => count + step.length, 0) > maxPowerPointBuildChanges) return undefined
  return { ...saved, layers,
    ...(tracks.length ? { soundtracks: [...saved.soundtracks ?? [], ...tracks] } : {}),
    ...(build.length ? { powerPointBuild: build } : {}), powerPointResolvedMediaLinks: [...previous, ...ready] }
}

export function restoreEmbeddedPowerPointMedia(saved: SlideDesign, incoming: SlideDesign): SlideDesign | undefined {
  if (!incoming.powerPointLayoutBeforeMedia) return undefined
  if (saved.powerPointLayoutBeforeMedia) return addLinkedPowerPointMedia(saved, incoming)
  const { powerPointBuild, ...base } = withoutPowerPointTransitionSound(saved)
  const priorStill = saved.powerPointLayoutBeforeRendering
  if (priorStill) {
    if (priorStill !== incoming.powerPointLayoutBeforeRendering) return undefined
    const { powerPointBuild: _build, powerPointLayoutBeforeMedia: _media, soundtracks: _sounds,
      powerPointResolvedMediaLinks: _links, ...still } = withoutPowerPointTransitionSound(incoming)
    const layers = still.layers.filter((layer) => !isPowerPointVideoLayer(layer))
    if (powerPointLayoutKey(base) !== powerPointLayoutKey({ ...still, layers })) return undefined
  } else {
    if (powerPointLayoutKey(withoutPowerPointTableLayers(base)) !== incoming.powerPointLayoutBeforeMedia) return undefined
    if (saved.powerPointTablesImported) {
      const tableKey = (design: SlideDesign) => powerPointLayoutKey({ aspectRatio: design.aspectRatio, layers: design.layers.filter(isPowerPointTableLayer) })
      if (tableKey(saved) !== tableKey(incoming)) return undefined
    }
  }
  const recovered = hasPowerPointTransitionSound(saved)
    ? restorePowerPointTransitionSound(withoutPowerPointTransitionSound(incoming), saved) : incoming
  if (!powerPointBuild || incoming.powerPointLayoutBeforeRendering) return recovered

  const build = recoverMediaBuild(saved, incoming, mediaIds(incoming))
  if (build.length > maxPowerPointBuildSteps
    || build.reduce((count, step) => count + step.length, 0) > maxPowerPointBuildChanges) return undefined
  return { ...recovered, powerPointBuild: build }
}

export function restorePowerPointBuild(saved: SlideDesign, incoming: SlideDesign): SlideDesign | undefined {
  if (saved.powerPointBuild || !incoming.powerPointBuild?.length) return undefined
  const layers = new Set(saved.layers.map((layer) => layer.id))
  if (!incoming.powerPointBuild.every((step) => step.every(({ layerId }) => layers.has(layerId)))) return undefined
  return { ...saved, powerPointBuild: incoming.powerPointBuild }
}

export function restorePowerPointSlides(saved: DesignContent, incoming: DesignContent): DesignContent {
  if (saved.source?.format !== 'powerpoint' || incoming.source?.format !== 'powerpoint' || saved.source.uid !== incoming.source.uid) return saved
  const targets = new Map(incoming.slides.filter(hasPowerPointSlideUpdate).map((slide) => [slide.id, slide]))
  if (!targets.size) return saved
  let changed = false
  let playbackRestored = false
  let soundRestored = false
  const slides = saved.slides.map((slide) => {
    const target = targets.get(slide.id)
    if (!target) return slide
    const withPlayback = fillMissingSlidePlayback(slide, target)
    const updated = fillMissingSpeakerNotes(withPlayback, target)
    playbackRestored ||= withPlayback !== slide
    const next = target.design
    const recovered = restoreEmbeddedPowerPointMedia(slide.design, next)
      ?? (!next.powerPointLayoutBeforeMedia ? replaceEditablePowerPointLayout(slide.design, next) ?? restorePowerPointBuild(slide.design, next) : undefined)
    const withTables = restorePowerPointTableLayers(recovered ?? slide.design, next)
    const withBuild = withTables !== slide.design && next.powerPointBuild ? restorePowerPointBuild(withTables, next) ?? withTables : withTables
    const design = restorePowerPointTransitionSound(withBuild, next)
    soundRestored ||= !hasPowerPointTransitionSound(slide.design) && hasPowerPointTransitionSound(design)
    changed ||= design !== slide.design || updated !== slide
    return design !== slide.design ? { ...updated, design } : updated
  })
  if (!changed) return saved
  const unresolved = slides.some((slide) => targets.get(slide.id)?.design.powerPointLayoutBeforeRendering
    && !slide.design.powerPointLayoutBeforeRendering)
  let warnings = unresolved ? saved.warnings : refreshPowerPointVisualWarnings(saved.warnings ?? [], incoming.warnings ?? [])
  if (slides.some((slide, index) => slide.design.powerPointBuild && slide.design.powerPointBuild !== saved.slides[index].design.powerPointBuild)
    && !slides.some((slide) => targets.get(slide.id)?.design.powerPointBuild && !slide.design.powerPointBuild)) {
    warnings = refreshPowerPointBuildWarnings(warnings ?? [], incoming.warnings ?? [])
  }
  if (soundRestored || slides.some((slide, index) => slide.design.powerPointResolvedMediaLinks !== saved.slides[index].design.powerPointResolvedMediaLinks)) {
    warnings = refreshLinkedPowerPointMediaWarnings(warnings ?? [], incoming.warnings ?? [])
  }
  if (playbackRestored || soundRestored) {
    warnings = refreshPowerPointTransitionWarnings(warnings ?? [], incoming.warnings ?? [], '', playbackRestored, soundRestored)
  }
  return { ...saved, slides, warnings }
}
