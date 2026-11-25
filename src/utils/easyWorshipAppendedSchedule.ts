/** Keeps an appended schedule's source rows and media separate from existing playlist items. */

import type { PlaylistCue } from '../types/database'
import { recoverableScheduleMedia, type MediaLink } from './easyWorshipScheduleMedia'
import type { RejectedPackedMedia } from './easyWorshipPackedMedia'
import type { RecoveredScheduleSlideDetails, ScheduleImportIds } from './easyWorshipScheduleCues'
import type { SchedulePowerPointRecovery } from './easyWorshipPowerPointRecovery'
import type { RecoveredScheduleScripture } from './easyWorshipScheduleScripture'
import type { RecoveredSchedulePlayback } from './easyWorshipSchedulePlayback'
import { importIdentity } from './importIdentity'
import { safeScheduleMediaPath } from './scheduleMedia'

export function easyWorshipAppendNamespace(operationId: string) {
  return `easyworship-append/${operationId}`
}

export function defaultEasyWorshipAppendId(playlistId: string, sourceId: string) {
  return importIdentity(['easyworship-append-v1', playlistId, sourceId])
}

function namespacedMedia<T extends { archivePath?: string }>(asset: T, namespace: string): T {
  const path = safeScheduleMediaPath(asset.archivePath)
  return path ? { ...asset, archivePath: `${namespace}/${path}` } : asset
}

function namespaceSlideMedia<T extends Pick<PlaylistCue['slides'][number], 'assets' | 'design'>>(slide: T, namespace: string): T {
  const assetPath = <U extends { archivePath?: string }>(asset: U) => namespacedMedia(asset, namespace)
  return {
    ...slide,
    ...(slide.assets ? { assets: slide.assets.map(assetPath) } : {}),
    ...(slide.design ? { design: {
      ...slide.design,
      layers: slide.design.layers.map((layer) => layer.kind === 'media' ? { ...layer, asset: assetPath(layer.asset) } : layer),
      ...(slide.design.soundtracks ? { soundtracks: slide.design.soundtracks.map(assetPath) } : {}),
    } } : {}),
  }
}

export function namespaceAppendedCues(cues: readonly PlaylistCue[], namespace: string, sourceId?: string): PlaylistCue[] {
  return cues.map((cue, index) => ({
    ...cue,
    sourceId: `${namespace}:${cue.sourceId ?? index}`,
    ...(sourceId ? { metadata: { ...cue.metadata, easyWorshipAppendSourceId: sourceId } } : {}),
    ...(cue.assets ? { assets: cue.assets.map((asset) => namespacedMedia(asset, namespace)) } : {}),
    slides: cue.slides.map((slide, position) => ({
      ...namespaceSlideMedia(slide, namespace),
      sourceId: `${namespace}:${slide.sourceId ?? position}`,
    })),
  }))
}

export function appendedScheduleNamespace(cue: PlaylistCue, sourceIds: ReadonlySet<string>, legacyNamespaces: ReadonlySet<string>) {
  const namespace = cue.sourceId?.match(/^(easyworship-append\/[0-9a-f-]{36}):/)?.[1]
  if (!namespace) return undefined
  const sourceId = cue.metadata?.easyWorshipAppendSourceId
  return (typeof sourceId === 'string' ? sourceIds.has(sourceId) : legacyNamespaces.has(namespace)) ? namespace : undefined
}

export function recoverableAppendedScheduleMedia(
  ids: ScheduleImportIds, cues: readonly PlaylistCue[], links: ReadonlyMap<string, MediaLink>, namespace: string, rejected?: RejectedPackedMedia,
) {
  const scoped = new Map([...links].map(([key, link]) => [key, namespacedMedia(link, namespace)]))
  return recoverableScheduleMedia(ids, namespaceAppendedCues(cues, namespace), scoped, rejected, namespace)
}

export function scopeAppendedPowerPointRecovery(recovery: SchedulePowerPointRecovery | undefined, namespace: string) {
  if (!recovery) return undefined
  const cues = new Map([...recovery.cues].map(([sourceId, candidate]) => {
    const [before, after] = namespaceAppendedCues([candidate.before, candidate.after], namespace)
    return [`${namespace}:${sourceId}`, { ...candidate, before, after }] as const
  }))
  return { ...recovery, cues }
}

export function scopeAppendedScriptureRecovery(recovery: RecoveredScheduleScripture | undefined,
  namespace: string): RecoveredScheduleScripture | undefined {
  if (!recovery?.size) return undefined
  return new Map([...recovery].map(([cueId, slides]) => [`${namespace}:${cueId}`,
    new Map([...slides].map(([slideId, slide]) => [`${namespace}:${slideId}`, slide])),
  ]))
}

export function scopeAppendedPlaybackRecovery(recovery: RecoveredSchedulePlayback | undefined,
  namespace: string): RecoveredSchedulePlayback | undefined {
  if (!recovery?.size) return undefined
  return new Map([...recovery].map(([cueId, { kind, slides }]) => [`${namespace}:${cueId}`, { kind,
    slides: new Map([...slides].map(([slideId, slide]) => [`${namespace}:${slideId}`, namespaceSlideMedia(slide, namespace)])),
  }]))
}

export function scopeAppendedSlideDetailRecovery(recovery: RecoveredScheduleSlideDetails,
  namespace: string): RecoveredScheduleSlideDetails | undefined {
  if (!recovery.size) return undefined
  return new Map([...recovery].map(([cueId, { slides, warnings }]) => [`${namespace}:${cueId}`, { warnings,
    slides: new Map([...slides].map(([slideId, slide]) => [`${namespace}:${slideId}`, namespaceSlideMedia(slide, namespace)])),
  }]))
}
