/** Matches an existing, unmodified schedule placeholder to a recovered PowerPoint. */

import type { PlaylistCue, PlaylistCueAsset } from '../types/database'
import type { ScheduleImportIds } from './easyWorshipScheduleCues'
import { isLegacyPowerPoint, powerPointFilename } from './powerPointFilename'
import { hasPowerPointSlideUpdate, refreshPowerPointBuildWarnings, refreshPowerPointTransitionWarnings, refreshPowerPointVisualWarnings,
  replaceEditablePowerPointLayout, restoreEmbeddedPowerPointMedia, restorePowerPointBuild, restorePowerPointTableLayers } from './powerPoint/layoutReplacement'
import { designTextLines } from './slideDesign'
import { refreshLinkedPowerPointMediaWarnings } from './powerPoint/linkedMedia'
import { fillMissingSlidePlayback } from './slidePlayback'
import { restorePowerPointTransitionSound } from './powerPoint/transitionSound'
import { fillMissingSpeakerNotes } from './speakerNotes'

type Candidate = { before: PlaylistCue; after: PlaylistCue; attachment: PlaylistCueAsset; key: string }
export type SchedulePowerPointRecovery = { ids: ScheduleImportIds; cues: ReadonlyMap<string, Candidate>; hasSlideUpdates?: boolean }

function canonicalJson(value: unknown) {
  return JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item
    // Older imports omitted source hashes, lengths, original path IDs, and packed binary .ppt offsets.
    const keys = item.kind === 'powerpoint' && typeof item.filename === 'string'
      ? Object.keys(item).filter((key) => key !== 'easyWorshipFileHash' && key !== 'easyWorshipFileSize' && key !== 'easyWorshipSourceLocationId'
        && !(key === 'archivePath' && isLegacyPowerPoint(item.filename) && /^legacy\/\d+-\d+\.ppt$/.test(item.archivePath)))
      : Object.keys(item)
    return Object.fromEntries(keys.sort().map((key) => [key, item[key]]))
  })
}

function compatiblePlaceholderLocations(saved: PlaylistCue['slides'], source: PlaylistCue['slides']) {
  return saved.every((slide, slideIndex) => slide.assets?.every((asset, assetIndex) => {
    const location = source[slideIndex]?.assets?.[assetIndex]?.easyWorshipSourceLocationId
    return asset.kind !== 'powerpoint' || !asset.easyWorshipSourceLocationId || asset.easyWorshipSourceLocationId === location
  }) ?? true)
}

export function schedulePowerPointRecovery(ids: ScheduleImportIds, before: PlaylistCue[], after: PlaylistCue[],
  recovered: ReadonlyMap<string, { asset: PlaylistCueAsset; key: string }>): SchedulePowerPointRecovery | undefined {
  const candidates = new Map<string, Candidate>()
  for (const [index, source] of before.entries()) {
    const restored = after[index]
    const match = source.sourceId ? recovered.get(source.sourceId) : undefined
    if (!source.sourceId || !match || restored.kind !== 'powerpoint' || restored === source) continue
    candidates.set(source.sourceId, { before: source, after: restored, attachment: match.asset, key: match.key })
  }
  return candidates.size ? { ids, cues: candidates, hasSlideUpdates: [...candidates.values()].some(({ after }) =>
    after.slides.some(hasPowerPointSlideUpdate)) } : undefined
}

function legacyPlaceholder(cue: PlaylistCue, candidate: Candidate) {
  const { before, attachment } = candidate
  if (!before.metadata?.presentationPreview || before.metadata.presentationUid !== null
    || (cue.kind !== 'presentation' && cue.kind !== 'powerpoint')
    || cue.metadata?.presentationPreview || cue.slides.length !== 1) return false
  const first = before.slides[0]
  const expected = {
    label: before.label, lines: [], sourceId: first.sourceId, sourceOrder: first.sourceOrder,
    assets: [{ kind: 'powerpoint', filename: attachment.filename, role: 'foreground' }],
  }
  const location = cue.slides[0].assets?.[0]?.easyWorshipSourceLocationId
  return (!location || location === attachment.easyWorshipSourceLocationId) && canonicalJson(cue.slides[0]) === canonicalJson(expected)
}

export function matchSchedulePowerPoint(cue: PlaylistCue, recovery: SchedulePowerPointRecovery) {
  const candidate = cue.sourceId ? recovery.cues.get(cue.sourceId) : undefined
  if (!candidate) return undefined
  const imported = cue.metadata?.powerPointImportKey
  if (typeof imported === 'string') {
    if (imported !== candidate.key) return { state: 'different' } as const
    const targets = new Map(candidate.after.slides.filter((slide) => slide.sourceId && hasPowerPointSlideUpdate(slide))
      .map((slide) => [slide.sourceId, slide]))
    if (!targets.size) return { state: 'restored' } as const
    let changed = false
    let edited = false
    let buildRestored = false
    let linksRestored = false
    let playbackRestored = false
    let soundRestored = false
    const slides = cue.slides.map((slide) => {
      const next = targets.get(slide.sourceId)
      if (!next) return slide
      const withPlayback = fillMissingSlidePlayback(slide, next)
      let updated = fillMissingSpeakerNotes(withPlayback, next)
      playbackRestored ||= withPlayback !== slide
      changed ||= updated !== slide
      const sourceDesign = next.design
      if (!sourceDesign) return updated
      const current = slide.design && restorePowerPointTransitionSound(slide.design, sourceDesign)
      if (current && current !== slide.design) {
        updated = { ...updated, design: current }
        changed = true
        soundRestored = true
      }
      const restoreTables = (design: typeof current) => {
        if (!design) return updated
        const withTables = restorePowerPointTableLayers(design, sourceDesign)
        changed ||= withTables !== design
        const lines = !current?.powerPointTablesImported && withTables.powerPointTablesImported
          && current && canonicalJson(slide.lines) === canonicalJson(designTextLines(current))
          ? designTextLines(withTables) : updated.lines
        return { ...updated, design: withTables, lines }
      }
      if (sourceDesign.powerPointLayoutBeforeMedia) {
        if (!current) return updated
        const design = restoreEmbeddedPowerPointMedia(current, sourceDesign)
        if (!design) {
          if (!current.powerPointLayoutBeforeMedia && !sourceDesign.powerPointTablesImported) edited = true
          return restoreTables(current)
        }
        changed = true
        buildRestored ||= Boolean(design.powerPointBuild?.length)
        linksRestored ||= design.powerPointResolvedMediaLinks !== current.powerPointResolvedMediaLinks
        return restoreTables(design)
      }
      if (current?.powerPointLayoutBeforeRendering) return updated
      if (sourceDesign.powerPointBuild) {
        const withTables = restoreTables(current)
        if (!withTables.design || withTables.design.powerPointBuild) return withTables
        const design = restorePowerPointBuild(withTables.design, sourceDesign)
        if (!design) { edited = true; return withTables }
        buildRestored = true
        changed = true
        return { ...withTables, design }
      }
      if (!sourceDesign.powerPointLayoutBeforeRendering) return restoreTables(current)
      const design = current && replaceEditablePowerPointLayout(current, sourceDesign)
      if (!current || !design || canonicalJson(slide.lines) !== canonicalJson(designTextLines(current))) {
        edited = true
        return updated
      }
      changed = true
      return { ...updated, design, lines: next.lines }
    })
    if (!changed) return { state: edited ? 'edited' : 'restored' } as const
    const prefix = `${powerPointFilename(candidate.attachment.filename)} · `
    let warnings = edited ? cue.warnings : refreshPowerPointVisualWarnings(cue.warnings ?? [], candidate.after.warnings ?? [], prefix)
    if (buildRestored && !edited) warnings = refreshPowerPointBuildWarnings(warnings ?? [], candidate.after.warnings ?? [], prefix)
    if ((linksRestored || soundRestored) && !edited) warnings = refreshLinkedPowerPointMediaWarnings(warnings ?? [], candidate.after.warnings ?? [], prefix)
    if (playbackRestored || soundRestored) {
      warnings = refreshPowerPointTransitionWarnings(warnings ?? [], candidate.after.warnings ?? [], prefix, playbackRestored, soundRestored)
    }
    return { state: 'ready', cue: { ...cue, slides, warnings } } as const
  }
  const { before, after, attachment } = candidate
  const unchanged = cue.kind === before.kind && canonicalJson(cue.slides) === canonicalJson(before.slides)
    && compatiblePlaceholderLocations(cue.slides, before.slides)
  if (cue.libraryDesignId || cue.assets?.length || (!unchanged && !legacyPlaceholder(cue, candidate))) return { state: 'edited' } as const
  const filename = powerPointFilename(attachment.filename)
  const replaced = (warning: string) => warning === 'แสดงภาพสไลด์ที่บันทึกมากับตาราง'
    || warning === `ไม่พบไฟล์ ${attachment.filename} ใน .ewsx` || warning === `ไม่พบไฟล์ ${filename}`
    || (warning.startsWith(`${filename} · `) && /แนบไฟล์|บันทึกเป็น \.pptx/.test(warning))
  const warnings = [...new Set([...(cue.warnings ?? []).filter((warning) => !replaced(warning)), ...(after.warnings ?? [])])]
  return { state: 'ready', cue: {
    ...cue, kind: after.kind, slides: after.slides, warnings,
    metadata: { ...cue.metadata, ...(cue.metadata?.presentationPreview ? { presentationPreview: false } : {}), powerPointImportKey: candidate.key },
  } } as const
}
