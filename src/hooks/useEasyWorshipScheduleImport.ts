/** Saves an EasyWorship schedule and fills missing slide data on repeat imports. */

import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { PlaylistCue, PlaylistCueAsset } from '../types/database'
import { fillScheduleFormatting, fillScheduleSlideDetails, fillScheduleSongLabels, recoverableScheduleFormatting, recoverableScheduleSlideDetails,
  type RecoveredScheduleSongLabels, type RecoveredScheduleSlideDetails, type ScheduleImportIds } from '../utils/easyWorshipScheduleCues'
import { fillScheduleScripture, type RecoveredScheduleScripture } from '../utils/easyWorshipScheduleScripture'
import { matchSchedulePowerPoint, type SchedulePowerPointRecovery } from '../utils/easyWorshipPowerPointRecovery'
import { scheduleMediaAssets } from '../utils/scheduleMedia'
import { fillScheduleMedia, type ScheduleMediaRecovery } from '../utils/easyWorshipScheduleMedia'
import { fillSchedulePlayback, recoverableSchedulePlayback, type RecoveredSchedulePlayback } from '../utils/easyWorshipSchedulePlayback'

export type SavedEasyWorshipSchedule = {
  playlistId: string
  status: 'saved' | 'duplicate' | 'verified'
  restoredSongLabels?: number
  restoredFormatting?: number
  restoredSlidePlayback?: number
  restoredMediaPlayback?: number
  restoredScripture?: number
  restoredFeedVideo?: number
  restoredMasterBackgrounds?: number
  restoredMasterSoundtracks?: number
  restoredLayerRotations?: number
  restoredShapeMasks?: number
  restoredElementBorders?: number
  restoredElementShadows?: number
  restoredElementReflections?: number
  linkedSongs?: number
  ambiguousSongs?: number
  linkedPresentations?: number
  ambiguousPresentations?: number
  restoredPowerPoints?: number
  keptPowerPoints?: number
  restoredMedia?: number
  keptPowerPointMedia?: PlaylistCueAsset[]
  usedPowerPointFallback?: boolean
}

export type ScheduleImportOptions = {
  labels?: RecoveredScheduleSongLabels
  scripture?: RecoveredScheduleScripture
  previousSourceId?: string
  powerPoint?: SchedulePowerPointRecovery
  powerPointMediaIds?: ScheduleImportIds
  media?: ScheduleMediaRecovery
  stageMasterSoundtracks?: (playlistId: string, assets: readonly PlaylistCueAsset[]) => Promise<void>
}

type ScheduleRecovery = ScheduleImportOptions & {
  formatting: ReturnType<typeof recoverableScheduleFormatting>
  playback?: RecoveredSchedulePlayback
  slideDetails?: RecoveredScheduleSlideDetails
}

const powerPointKinds = ['powerpoint', 'presentation', 'unknown'] as const

function scheduleLinks(data?: {
  linked_songs?: number; ambiguous_songs?: number; linked_presentations?: number; ambiguous_presentations?: number
}) {
  return { linkedSongs: data?.linked_songs, ambiguousSongs: data?.ambiguous_songs,
    linkedPresentations: data?.linked_presentations, ambiguousPresentations: data?.ambiguous_presentations }
}

type ScheduleRow = { id: string; order: number; cue: PlaylistCue; hasAppliedSoundtrack: boolean }

export async function* scheduleRows(playlistId: string, kinds?: readonly PlaylistCue['kind'][]): AsyncGenerator<ScheduleRow> {
  let cursor: string | undefined
  while (true) {
    const query = supabase.from('playlist_songs').select('id, order, cue, slide_theme').eq('playlist_id', playlistId)
    const selected = !kinds ? query : kinds.length === 1 ? query.eq('cue->>kind', kinds[0]) : query.in('cue->>kind', kinds)
    const page = selected.order('id').limit(100)
    const { data, error } = await (cursor ? page.gt('id', cursor) : page)
    if (error) throw new Error(error.message)
    if (!data.length) return
    for (const row of data) if (row.cue) yield { id: row.id, order: row.order, cue: row.cue as PlaylistCue,
      hasAppliedSoundtrack: Boolean(row.slide_theme?.design?.soundtracks?.length) }
    cursor = data[data.length - 1].id
  }
}

async function scheduleTarget(id: string, { previousSourceId, powerPoint, powerPointMediaIds, media }: ScheduleImportOptions,
  slideDetails: RecoveredScheduleSlideDetails) {
  if (!previousSourceId && !powerPoint && !media) return { playlistId: id }
  const resolved = [id, previousSourceId].filter((value): value is string => Boolean(value))
  const fallbacks = new Map<string, boolean>()
  for (const [ids, restorePowerPoint] of [[media?.ids, false], [powerPointMediaIds, true], [powerPoint?.ids, true]] as const) {
    for (const candidate of [ids?.sourceId, ids?.previousSourceId]) {
      if (candidate && !fallbacks.has(candidate)) fallbacks.set(candidate, restorePowerPoint)
    }
  }
  const { data, error } = await supabase.from('playlists').select('id').in('id', [...new Set([...resolved, ...fallbacks.keys()])])
  if (error) throw new Error(error.message)
  const existing = new Set(data.map((row) => row.id))
  const exact = resolved.find((candidate) => existing.has(candidate))
  if (exact) return { playlistId: exact }
  for (const [candidate, restorePowerPoint] of fallbacks) {
    if (!existing.has(candidate)) continue
    // Verified attachments belong to this original schedule even when its media slots were edited or removed.
    if (!restorePowerPoint && media?.verifiedAttachments) return { playlistId: candidate, reuse: true }
    let applicable = false
    let different = false
    for await (const { cue, hasAppliedSoundtrack } of scheduleRows(candidate, media ? undefined : powerPointKinds)) {
      const presentation = restorePowerPoint && powerPoint ? matchSchedulePowerPoint(cue, powerPoint) : undefined
      const restored = media && !restorePowerPoint ? fillScheduleSlideDetails(cue, slideDetails, hasAppliedSoundtrack) : undefined
      const attachments = media && fillScheduleMedia(restored?.cue ?? cue, media)
      if (presentation?.state === 'different' || attachments?.different) { different = true; break }
      if (presentation?.state === 'ready' || presentation?.state === 'restored' || attachments?.cue || attachments?.matched) applicable = true
    }
    if (applicable && !different) return { playlistId: candidate, reuse: true, usedPowerPointFallback: restorePowerPoint }
  }
  return { playlistId: media && !existing.has(media.ids.sourceId) ? media.ids.sourceId : id }
}

async function restoreEntryDetails(playlistId: string, row: ScheduleRow, recovery: ScheduleRecovery) {
  const { id: entryId } = row
  let current: PlaylistCue | null = row.cue
  let hasAppliedSoundtrack = row.hasAppliedSoundtrack
  for (let attempt = 0; attempt < 2 && current; attempt++) {
    const labels = recovery.labels && fillScheduleSongLabels(current, recovery.labels)
    const formatting = fillScheduleFormatting(labels?.cue ?? current, recovery.formatting)
    const textCue = formatting?.cue ?? labels?.cue ?? current
    const slideDetails = recovery.slideDetails && fillScheduleSlideDetails(textCue, recovery.slideDetails, hasAppliedSoundtrack)
    const scripture = recovery.scripture && fillScheduleScripture(slideDetails?.cue ?? textCue, recovery.scripture)
    const other = scripture?.cue ?? slideDetails?.cue ?? formatting?.cue ?? labels?.cue
    const powerPoint = recovery.powerPoint && matchSchedulePowerPoint(other ?? current, recovery.powerPoint)
    const afterPowerPoint = powerPoint?.state === 'ready' ? powerPoint.cue : other
    const media = recovery.media && fillScheduleMedia(afterPowerPoint ?? current, recovery.media)
    const playback = recovery.playback && fillSchedulePlayback(media?.cue ?? afterPowerPoint ?? current, recovery.playback)
    const updated = playback?.cue ?? media?.cue ?? afterPowerPoint
    const keptPowerPoint = powerPoint?.state === 'edited' || powerPoint?.state === 'different'
    const result = { restoredSongLabels: labels?.count ?? 0, restoredFormatting: formatting?.count ?? 0,
      restoredSlidePlayback: playback?.count ?? 0, restoredMediaPlayback: playback?.mediaCount ?? 0,
      restoredFeedVideo: slideDetails?.count ?? 0, restoredMasterBackgrounds: slideDetails?.backgrounds ?? 0,
      restoredMasterSoundtracks: slideDetails?.soundtracks ?? 0,
      restoredLayerRotations: slideDetails?.rotations ?? 0,
      restoredShapeMasks: slideDetails?.masks ?? 0,
      restoredElementBorders: slideDetails?.borders ?? 0,
      restoredElementShadows: slideDetails?.shadows ?? 0,
      restoredElementReflections: slideDetails?.reflections ?? 0,
      restoredScripture: scripture?.count ?? 0, restoredPowerPoints: powerPoint?.state === 'ready' ? 1 : 0, restoredMedia: media?.cue ? 1 : 0,
      keptPowerPoints: keptPowerPoint ? 1 : 0, keptPowerPointMedia: keptPowerPoint ? scheduleMediaAssets([current]) : [] }
    if (!updated) return result
    if (slideDetails?.soundtracks) await recovery.stageMasterSoundtracks?.(playlistId, slideDetails.soundtrackAssets)
    const { error } = await supabase.rpc('edit_playlist_cue', {
      p_playlist_id: playlistId, p_entry_id: entryId, p_expected_cue: current, p_cue: updated,
    })
    if (!error) return result
    if (error.code !== '40001') throw new Error(error.message)
    if (attempt === 1) throw new Error('มีการแก้ตารางระหว่างคืนข้อมูลสไลด์ กรุณานำเข้าไฟล์เดิมอีกครั้ง')
    const { data, error: readError } = await supabase.from('playlist_songs').select('cue, slide_theme')
      .eq('playlist_id', playlistId).eq('id', entryId).maybeSingle()
    if (readError) throw new Error(readError.message)
    current = data?.cue ?? null
    hasAppliedSoundtrack = Boolean(data?.slide_theme?.design?.soundtracks?.length)
  }
}

async function restoreScheduleDetails(playlistId: string, recovery: ScheduleRecovery, includeScripture: boolean) {
  const kinds: PlaylistCue['kind'][] = ['song']
  if (includeScripture) kinds.push('scripture')
  if (recovery.powerPoint) kinds.push(...powerPointKinds)
  for (const { kind } of recovery.playback?.values() ?? []) if (!kinds.includes(kind)) kinds.push(kind)
  const counts = { restoredSongLabels: 0, restoredFormatting: 0, restoredSlidePlayback: 0, restoredMediaPlayback: 0, restoredScripture: 0, restoredFeedVideo: 0, restoredMasterBackgrounds: 0,
    restoredMasterSoundtracks: 0, restoredLayerRotations: 0, restoredShapeMasks: 0, restoredElementBorders: 0, restoredElementShadows: 0, restoredElementReflections: 0, restoredPowerPoints: 0, keptPowerPoints: 0, restoredMedia: 0 }
  const keptPowerPointMedia: PlaylistCueAsset[] = []
  for await (const row of scheduleRows(playlistId, recovery.media || recovery.slideDetails?.size ? undefined : kinds)) {
    const result = await restoreEntryDetails(playlistId, row, recovery)
    if (!result) continue
    counts.restoredSongLabels += result.restoredSongLabels
    counts.restoredFormatting += result.restoredFormatting
    counts.restoredSlidePlayback += result.restoredSlidePlayback
    counts.restoredMediaPlayback += result.restoredMediaPlayback
    counts.restoredScripture += result.restoredScripture
    counts.restoredFeedVideo += result.restoredFeedVideo
    counts.restoredMasterBackgrounds += result.restoredMasterBackgrounds
    counts.restoredMasterSoundtracks += result.restoredMasterSoundtracks
    counts.restoredLayerRotations += result.restoredLayerRotations
    counts.restoredShapeMasks += result.restoredShapeMasks
    counts.restoredElementBorders += result.restoredElementBorders
    counts.restoredElementShadows += result.restoredElementShadows
    counts.restoredElementReflections += result.restoredElementReflections
    counts.restoredPowerPoints += result.restoredPowerPoints
    counts.keptPowerPoints += result.keptPowerPoints
    counts.restoredMedia += result.restoredMedia
    for (const asset of result.keptPowerPointMedia) keptPowerPointMedia.push(asset)
  }
  return { ...counts, keptPowerPointMedia }
}

export async function restoreAppendedScheduleDetails(playlistId: string, sources: Pick<ScheduleRecovery, 'media' | 'powerPoint' | 'scripture' | 'playback' | 'slideDetails'>,
  previewPowerPoint?: SchedulePowerPointRecovery) {
  const recovery = { ...sources, formatting: new Map() }
  const counts = { restoredMedia: 0, restoredPowerPoints: 0, keptPowerPoints: 0, restoredScripture: 0, restoredSlidePlayback: 0,
    restoredMediaPlayback: 0, restoredFeedVideo: 0, restoredMasterBackgrounds: 0, restoredMasterSoundtracks: 0, restoredLayerRotations: 0, restoredShapeMasks: 0, restoredElementBorders: 0, restoredElementShadows: 0, restoredElementReflections: 0 }
  const kinds: PlaylistCue['kind'][] = recovery.powerPoint || previewPowerPoint ? [...powerPointKinds] : []
  if (recovery.scripture?.size) kinds.push('scripture')
  for (const { kind } of recovery.playback?.values() ?? []) if (!kinds.includes(kind)) kinds.push(kind)
  const allKinds = recovery.media || recovery.slideDetails?.size
  if (!allKinds && !kinds.length) return counts
  for await (const row of scheduleRows(playlistId, allKinds ? undefined : kinds)) {
    const { cue } = row
    if (!cue.sourceId) continue
    const hasStoredDeck = recovery.powerPoint?.cues.has(cue.sourceId)
    if (!hasStoredDeck && previewPowerPoint) {
      const deck = matchSchedulePowerPoint(cue, previewPowerPoint)
      if (deck?.state === 'edited' || deck?.state === 'different') counts.keptPowerPoints++
    }
    if (!hasStoredDeck && !recovery.media?.cues.has(cue.sourceId) && !recovery.scripture?.has(cue.sourceId)
      && !recovery.playback?.has(cue.sourceId) && !recovery.slideDetails?.has(cue.sourceId)) continue
    const result = await restoreEntryDetails(playlistId, row, recovery)
    counts.restoredMedia += result?.restoredMedia ?? 0
    counts.restoredPowerPoints += result?.restoredPowerPoints ?? 0
    counts.keptPowerPoints += result?.keptPowerPoints ?? 0
    counts.restoredScripture += result?.restoredScripture ?? 0
    counts.restoredSlidePlayback += result?.restoredSlidePlayback ?? 0
    counts.restoredMediaPlayback += result?.restoredMediaPlayback ?? 0
    counts.restoredFeedVideo += result?.restoredFeedVideo ?? 0
    counts.restoredMasterBackgrounds += result?.restoredMasterBackgrounds ?? 0
    counts.restoredMasterSoundtracks += result?.restoredMasterSoundtracks ?? 0
    counts.restoredLayerRotations += result?.restoredLayerRotations ?? 0
    counts.restoredShapeMasks += result?.restoredShapeMasks ?? 0
    counts.restoredElementBorders += result?.restoredElementBorders ?? 0
    counts.restoredElementShadows += result?.restoredElementShadows ?? 0
    counts.restoredElementReflections += result?.restoredElementReflections ?? 0
  }
  return counts
}

export function useEasyWorshipScheduleImport() {
  return useCallback(async (
    id: string, name: string, cues: PlaylistCue[], options: ScheduleImportOptions = {},
  ): Promise<SavedEasyWorshipSchedule> => {
    const incomingSlideDetails = recoverableScheduleSlideDetails(cues)
    const target = await scheduleTarget(id, options, incomingSlideDetails)
    const { playlistId, reuse, usedPowerPointFallback } = target
    let links = scheduleLinks()
    if (!reuse) {
      const args = { p_playlist_id: playlistId, p_name: name, p_cues: cues }
      const { data, error } = await supabase.rpc('import_easyworship_schedule_with_status', args)
      // A project can be upgraded after the frontend. Only fall back if PostgREST did not run this RPC.
      if (error?.code === 'PGRST202') {
        const legacy = await supabase.rpc('import_easyworship_schedule', args)
        if (legacy.error) throw new Error(legacy.error.message)
        if (legacy.data !== playlistId) throw new Error('ยืนยันรหัสตารางในปลายทางไม่ได้')
        return { playlistId, status: 'verified' }
      }
      if (error) throw new Error(error.message)
      if (data?.id !== playlistId || typeof data.created !== 'boolean') throw new Error('ยืนยันผลการบันทึกตารางไม่ได้')
      links = scheduleLinks(data)
      if (data.created) return { playlistId, status: 'saved', ...links }
    }
    const formatting = recoverableScheduleFormatting(cues)
    const playback = recoverableSchedulePlayback(cues)
    const slideDetails = usedPowerPointFallback ? undefined : incomingSlideDetails
    const includeScripture = Boolean(options.scripture?.size) || cues.some((cue) => cue.kind === 'scripture' && cue.sourceId && formatting.has(cue.sourceId))
    const powerPoint = usedPowerPointFallback || options.powerPoint?.hasSlideUpdates ? options.powerPoint : undefined
    const details = options.labels?.size || options.scripture?.size || formatting.size || playback?.size || slideDetails?.size || powerPoint || options.media
      ? await restoreScheduleDetails(playlistId, { ...options, powerPoint, formatting, playback, slideDetails }, includeScripture) : {}
    if (reuse) {
      const params = { p_playlist_id: playlistId }
      const decks = cues.filter((cue) => cue.kind === 'powerpoint' && cue.metadata?.powerPointImportKey)
      const [songs, presentations] = await Promise.all([
        supabase.rpc('link_easyworship_schedule_songs', params),
        supabase.rpc('link_easyworship_schedule_presentations', decks.length ? { ...params, p_cues: decks } : params),
      ])
      for (const result of [songs, presentations]) {
        if (result.error && result.error.code !== 'PGRST202') throw new Error(result.error.message)
      }
      links = scheduleLinks({ ...songs.data, ...presentations.data })
      const { data, error } = await supabase.from('playlists').select('id').eq('id', playlistId).maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new Error('เพลย์ลิสต์ถูกลบระหว่างนำเข้า กรุณาตรวจรายการและลองอีกครั้ง')
    }
    return { playlistId, status: 'duplicate', usedPowerPointFallback, ...links, ...details }
  }, [])
}
