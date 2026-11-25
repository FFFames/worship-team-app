/** EasyWorship nests theme definitions beside the scheduled presentations that use them. */

import type { PlaylistSong } from '../types/database'

function isGlobalTheme(type: unknown, uid: unknown, level: unknown) {
  return type === 11 && typeof uid === 'string' && uid.trim().toUpperCase() === 'GLOBAL'
    && typeof level === 'number' && Number.isInteger(level) && level > 0
}

type PresentationRow = Record<string, unknown>

export function isNestedScheduleGlobal(presentation: PresentationRow) {
  return isGlobalTheme(presentation.presentation_type, presentation.presentation_uid, presentation.group_level)
}

export function scheduleGlobalThemeParents(presentations: readonly PresentationRow[]) {
  const globalsByOrder = new Map<number, PresentationRow[]>()
  for (const row of presentations.filter(isNestedScheduleGlobal)) {
    if (typeof row.order_index !== 'number') continue
    const shared = globalsByOrder.get(row.order_index) ?? []
    shared.push(row)
    globalsByOrder.set(row.order_index, shared)
  }
  const parents = new Map<string, string>()
  for (const row of presentations) {
    if (![12, 13, 14].includes(Number(row.presentation_type)) || typeof row.order_index !== 'number'
      || typeof row.group_level !== 'number' || row.group_level <= 0) continue
    const matches = globalsByOrder.get(row.order_index)?.filter((global) => Number(global.group_level) > Number(row.group_level))
    if (matches?.length === 1) parents.set(String(row._id), String(matches[0]._id))
  }
  return parents
}

const nativeGlobalTitles = ['Master', 'Song', 'Scripture', 'Presentation']

/** Earlier imports staged the stock Global definition as an unknown item. Keep altered items visible. */
export function isLegacyGlobalThemeEntry(entry: PlaylistSong) {
  const cue = entry.cue
  if (!cue?.sourceId || cue.kind !== 'unknown' || cue.label !== 'Global' || cue.looping || cue.assets?.length
    || entry.song_id || entry.background_asset || entry.slide_theme || cue.metadata?.notes
    || !isGlobalTheme(cue.metadata?.type, cue.metadata?.presentationUid, cue.metadata?.groupLevel)) return false

  return cue.slides.length === nativeGlobalTitles.length && cue.slides.every((slide, index) =>
    slide.label === nativeGlobalTitles[index] && Boolean(slide.sourceId) && slide.sourceOrder === index && !slide.labelEdited
    && !slide.lines.length && !slide.assets?.length && !slide.design && !slide.playback && !slide.transition
    && !slide.transitionEdited && slide.advanceMs === undefined && slide.speakerNotes === undefined)
}
