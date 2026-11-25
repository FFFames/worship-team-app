/** Keeps transition audio continuous until the next sound action in the same deck. */

import type { SlideDesign } from '../../types/slideDesign'
import type { PresentationSoundtrack } from '../presentationChannel'

export type PowerPointTransitionSoundState = {
  scopeId: string
  slideIndex: number
  sound?: PresentationSoundtrack
}

export function hasPowerPointTransitionSound(design: SlideDesign | undefined) {
  return Boolean(design?.powerPointStopTransitionSound || design?.soundtracks?.some((track) => track.powerPointTransitionSound))
}

export function withoutPowerPointTransitionSound(design: SlideDesign): SlideDesign {
  if (!hasPowerPointTransitionSound(design)) return design
  const { powerPointStopTransitionSound: _stop, soundtracks, ...layout } = design
  const tracks = soundtracks?.filter((track) => !track.powerPointTransitionSound)
  return tracks && (tracks.length || !soundtracks?.length) ? { ...layout, soundtracks: tracks } : layout
}

export function restorePowerPointTransitionSound(saved: SlideDesign, incoming: SlideDesign): SlideDesign {
  if (hasPowerPointTransitionSound(saved)) return saved
  if (incoming.powerPointStopTransitionSound) return { ...saved, powerPointStopTransitionSound: true }
  const track = incoming.soundtracks?.find((candidate) => candidate.powerPointTransitionSound)
  return track ? { ...saved, soundtracks: [...saved.soundtracks ?? [], track] } : saved
}

export function advancePowerPointTransitionSound(previous: PowerPointTransitionSoundState | undefined,
  scopeId: string | undefined, slideIndex: number, design: SlideDesign | undefined, playlistId?: string, restart = false) {
  if (!scopeId) return undefined
  if (!restart && previous?.scopeId === scopeId && previous.slideIndex === slideIndex) return previous
  const state: PowerPointTransitionSoundState = { scopeId, slideIndex }
  if (design?.powerPointStopTransitionSound) return state
  const track = design?.soundtracks?.find((candidate) => candidate.powerPointTransitionSound)
  if (track) {
    const address = track.libraryId ? { libraryId: track.libraryId, playlistId, archivePath: track.archivePath }
      : playlistId && track.archivePath ? { playlistId, archivePath: track.archivePath } : undefined
    if (address) state.sound = { ...address, kind: 'audio', role: 'foreground', repeat: track.repeat, clip: track.clip, playback: track.playback,
      runId: crypto.randomUUID() }
  } else if (!restart && previous?.scopeId === scopeId) state.sound = previous.sound
  return state
}
