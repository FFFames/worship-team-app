/** Loads an append destination and saves a batch of reviewed schedule cues. */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Playlist, PlaylistCue, PlaylistCueAsset } from '../types/database'
import { appendedScheduleNamespace, defaultEasyWorshipAppendId, easyWorshipAppendNamespace,
  recoverableAppendedScheduleMedia, scopeAppendedPlaybackRecovery, scopeAppendedPowerPointRecovery, scopeAppendedScriptureRecovery,
  scopeAppendedSlideDetailRecovery } from '../utils/easyWorshipAppendedSchedule'
import { fillScheduleSlideDetails, recoverableScheduleSlideDetails, type RecoveredScheduleSlideDetails, type ScheduleImportIds } from '../utils/easyWorshipScheduleCues'
import { canRecoverPackedLegacyVideo, fillScheduleMedia, type reviewEasyWorshipScheduleMedia, type ScheduleMediaRecovery, type ScheduleMediaRecoveryLink } from '../utils/easyWorshipScheduleMedia'
import type { RejectedPackedMedia } from '../utils/easyWorshipPackedMedia'
import { matchSchedulePowerPoint, type SchedulePowerPointRecovery } from '../utils/easyWorshipPowerPointRecovery'
import { fillScheduleScripture, type RecoveredScheduleScripture } from '../utils/easyWorshipScheduleScripture'
import { fillSchedulePlayback, type RecoveredSchedulePlayback } from '../utils/easyWorshipSchedulePlayback'
import { packedLegacyVideoExtension, readScheduleMedia, scheduleMediaAssets } from '../utils/scheduleMedia'
import { scheduleRows } from './useEasyWorshipScheduleImport'

export function useEasyWorshipAppendDestination(playlistId: string | undefined) {
  const [playlist, setPlaylist] = useState<Pick<Playlist, 'id' | 'name'> | null>(null)
  const [loading, setLoading] = useState(Boolean(playlistId))
  useEffect(() => {
    if (!playlistId) return
    let active = true
    void supabase.from('playlists').select('id,name').eq('id', playlistId).maybeSingle().then(({ data, error }) => {
      if (!active) return
      setPlaylist(error ? null : data)
      setLoading(false)
    })
    return () => { active = false }
  }, [playlistId])
  return { playlist, loading }
}

const missingAppendMigration = 'ฐานข้อมูลยังไม่รองรับการเพิ่มตาราง EasyWorship ต่อท้ายเพลย์ลิสต์'

async function appendReceipt(playlistId: string, operationId: string) {
  const { data, error } = await supabase.from('easyworship_schedule_appends').select('source_id, entry_count')
    .eq('playlist_id', playlistId).eq('operation_id', operationId).maybeSingle()
  if (error?.code === 'PGRST205' || error?.code === '42P01') throw new Error(missingAppendMigration)
  if (error) throw new Error(error.message)
  return data
}

export async function defaultEasyWorshipAppendOperation(playlistId: string, reviewedSourceId: string, verifiedSourceId = reviewedSourceId) {
  const reviewedOperationId = await defaultEasyWorshipAppendId(playlistId, reviewedSourceId)
  if (reviewedSourceId !== verifiedSourceId) {
    // Older imports used the attachment-derived operation ID, which backups preserve in their cue IDs.
    const receipt = await appendReceipt(playlistId, reviewedOperationId)
    if (receipt?.source_id === reviewedSourceId) return { sourceId: reviewedSourceId, operationId: reviewedOperationId }
    if (!receipt) {
      const namespace = easyWorshipAppendNamespace(reviewedOperationId)
      const { data, error } = await supabase.from('playlist_songs').select('id')
        .eq('playlist_id', playlistId).like('cue->>sourceId', `${namespace}:%`).limit(1)
      if (error) throw new Error(error.message)
      if (data.length) return { sourceId: reviewedSourceId, operationId: reviewedOperationId }
    }
    return { sourceId: verifiedSourceId, operationId: await defaultEasyWorshipAppendId(playlistId, verifiedSourceId) }
  }
  return { sourceId: reviewedSourceId, operationId: reviewedOperationId }
}

export async function appendEasyWorshipSchedule(playlistId: string, operationId: string, sourceId: string, cues: PlaylistCue[]) {
  const { data, error } = await supabase.rpc('append_easyworship_schedule', {
    p_playlist_id: playlistId, p_operation_id: operationId, p_source_id: sourceId, p_cues: cues,
  })
  if (error?.code === 'PGRST202') throw new Error(missingAppendMigration)
  if (error?.code === '23505') {
    // A newer parser can omit old theme rows while replaying the same native source.
    const receipt = await appendReceipt(playlistId, operationId)
    if (receipt?.source_id === sourceId) return { playlistId, status: 'duplicate' as const, appendedEntries: receipt.entry_count }
  }
  if (error) throw new Error(error.message)
  if (data?.id !== playlistId || typeof data.appended !== 'boolean' || data.entries !== cues.length) {
    throw new Error('ยืนยันผลการเพิ่มตารางไม่ได้ กรุณาลองอีกครั้ง')
  }
  return { playlistId, status: data.appended ? 'saved' as const : 'duplicate' as const, appendedEntries: cues.length }
}

export type AppendedScheduleRepairBatch = {
  namespace: string
  firstOrder: number
  entries: number
  media?: ScheduleMediaRecovery
  assets: PlaylistCueAsset[]
  powerPoint?: SchedulePowerPointRecovery
  powerPointUids: ReadonlySet<string>
  scripture?: RecoveredScheduleScripture
  playback?: RecoveredSchedulePlayback
  slideDetails?: RecoveredScheduleSlideDetails
  restoresLayout?: boolean
  restoresMasterSoundtrack?: boolean
  restoresMediaPlayback?: boolean
  restoresSlidePlayback?: boolean
}

export async function findAppendedScheduleRepairBatches(
  playlistId: string, ids: ScheduleImportIds, cues: readonly PlaylistCue[],
  { links, attachments, sourceId, cues: reviewedCues }: Awaited<ReturnType<typeof reviewEasyWorshipScheduleMedia>>,
  { powerPoint, rejected, scripture, playback }: {
    powerPoint?: SchedulePowerPointRecovery; rejected?: RejectedPackedMedia; scripture?: RecoveredScheduleScripture; playback?: RecoveredSchedulePlayback
  } = {},
) {
  const legacyVideo = canRecoverPackedLegacyVideo(cues)
  const slideDetails = recoverableScheduleSlideDetails(reviewedCues)
  if (!attachments.size && !legacyVideo && !powerPoint && !scripture?.size && !playback?.size && !slideDetails.size) return []
  const sourceIds = new Set([ids.sourceId, ...(ids.previousSourceId ? [ids.previousSourceId] : [])])
  const attachmentIds = attachments.size ? await Promise.all([...sourceIds].map(sourceId)) : []
  const legacyNamespaces = new Set(await Promise.all([...new Set([...sourceIds, ...attachmentIds])].map(async (id) =>
    easyWorshipAppendNamespace(await defaultEasyWorshipAppendId(playlistId, id)))))
  const batches = new Map<string, Omit<AppendedScheduleRepairBatch, 'assets' | 'powerPointUids'> & {
    assets: Map<string, PlaylistCueAsset>; powerPointUids: Set<string>; hasPowerPoint: boolean; hasScripture: boolean
    checkedSlideDetailPaths: Set<string>
  }>()
  for await (const { cue, order, hasAppliedSoundtrack } of scheduleRows(playlistId)) {
    const namespace = appendedScheduleNamespace(cue, sourceIds, legacyNamespaces)
    if (!namespace) continue
    let batch = batches.get(namespace)
    if (!batch) {
      const media = attachments.size || legacyVideo ? recoverableAppendedScheduleMedia(ids, cues, links, namespace, rejected) : undefined
      batch = { namespace, firstOrder: order, entries: 0, media, assets: new Map(), hasPowerPoint: false, powerPointUids: new Set(),
        hasScripture: false, scripture: scopeAppendedScriptureRecovery(scripture, namespace),
        playback: scopeAppendedPlaybackRecovery(playback, namespace),
        checkedSlideDetailPaths: new Set(), slideDetails: scopeAppendedSlideDetailRecovery(slideDetails, namespace),
        powerPoint: scopeAppendedPowerPointRecovery(powerPoint, namespace) }
      batches.set(namespace, batch)
    }
    batch.firstOrder = Math.min(batch.firstOrder, order)
    batch.entries++
    if (batch.scripture && fillScheduleScripture(cue, batch.scripture)) batch.hasScripture = true
    if (batch.playback && !(batch.restoresMediaPlayback && batch.restoresSlidePlayback)) {
      const restored = fillSchedulePlayback(cue, batch.playback)
      if (restored?.count) batch.restoresSlidePlayback = true
      if (restored?.mediaCount) batch.restoresMediaPlayback = true
    }
    const deck = batch.powerPoint && matchSchedulePowerPoint(cue, batch.powerPoint)
    if (deck) {
      batch.hasPowerPoint = true
      const candidate = cue.sourceId ? batch.powerPoint?.cues.get(cue.sourceId) : undefined
      if (candidate && (deck.state === 'ready' || deck.state === 'restored')) batch.powerPointUids.add(candidate.key)
    }
    const restored = batch.slideDetails && fillScheduleSlideDetails(cue, batch.slideDetails, hasAppliedSoundtrack)
    if (restored) {
      if (restored.count || restored.backgrounds || restored.rotations || restored.masks || restored.borders || restored.shadows
        || restored.reflections) batch.restoresLayout = true
      if (restored.soundtracks) batch.restoresMasterSoundtrack = true
      const existingAssets = new Set(scheduleMediaAssets([cue]))
      for (const asset of scheduleMediaAssets([restored.cue])) {
        const path = asset.archivePath
        if (existingAssets.has(asset) || !path?.startsWith(`${namespace}/`) || batch.checkedSlideDetailPaths.has(path)) continue
        batch.checkedSlideDetailPaths.add(path)
        const archivePath = path.slice(namespace.length + 1)
        if (batch.assets.has(archivePath)) continue
        const stored = await readScheduleMedia(playlistId, path).catch(() => null)
        if (!stored?.size || (packedLegacyVideoExtension(archivePath, asset) && stored.type !== 'video/mp4')) {
          batch.assets.set(archivePath, { ...asset, archivePath })
        }
      }
    }
    const beforeMedia = restored?.cue ?? cue
    const filled = batch.media && fillScheduleMedia(beforeMedia, batch.media)
    if (!filled?.cue && !filled?.matched) continue
    for (const asset of scheduleMediaAssets([filled.cue ?? beforeMedia])) {
      if (!asset.archivePath?.startsWith(`${namespace}/`)) continue
      const archivePath = asset.archivePath.slice(namespace.length + 1)
      if (batch.assets.has(archivePath)) continue
      if (attachments.has(archivePath) || (legacyVideo && packedLegacyVideoExtension(archivePath, asset)
        && (await readScheduleMedia(playlistId, asset.archivePath).catch(() => null))?.type !== 'video/mp4')) {
        batch.assets.set(archivePath, { ...asset, archivePath })
      }
    }
  }
  return [...batches.values()].filter(({ assets, hasPowerPoint, hasScripture, restoresLayout, restoresMasterSoundtrack, restoresMediaPlayback, restoresSlidePlayback }) =>
    assets.size || hasPowerPoint || hasScripture || restoresLayout || restoresMasterSoundtrack || restoresMediaPlayback || restoresSlidePlayback)
    .sort((a, b) => a.firstOrder - b.firstOrder)
    .map(({ namespace, firstOrder, entries, hasPowerPoint, hasScripture, restoresLayout, restoresMasterSoundtrack, restoresMediaPlayback, restoresSlidePlayback,
      assets, media, powerPoint, powerPointUids, scripture, playback, slideDetails }): AppendedScheduleRepairBatch => {
      const paths = new Set([...assets.keys()].map((path) => `${namespace}/${path}`))
      const cues = new Map<string, ReadonlyMap<string, ScheduleMediaRecoveryLink>>()
      for (const [sourceId, slots] of media?.cues ?? []) {
        const stored = new Map([...slots].filter(([, link]) => link.archivePath && paths.has(link.archivePath)))
        if (stored.size) cues.set(sourceId, stored)
      }
      return { namespace, firstOrder, entries, powerPoint: hasPowerPoint ? powerPoint : undefined, powerPointUids,
        scripture: hasScripture ? scripture : undefined, playback: restoresMediaPlayback || restoresSlidePlayback ? playback : undefined,
        slideDetails: restoresLayout || restoresMasterSoundtrack ? slideDetails : undefined, restoresLayout, restoresMasterSoundtrack,
        restoresMediaPlayback, restoresSlidePlayback,
        assets: [...assets.values()], media: cues.size ? { ids, cues } : undefined }
    })
}
