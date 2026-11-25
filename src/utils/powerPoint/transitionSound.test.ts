import { describe, expect, it } from 'vitest'
import type { DesignSoundtrack, SlideDesign } from '../../types/slideDesign'
import { designSoundtrackAssets } from '../slideDesign'
import { powerPointLayoutKey, restorePowerPointSlides } from './layoutReplacement'
import { advancePowerPointTransitionSound, restorePowerPointTransitionSound } from './transitionSound'
import { unsupportedPowerPointTransitionSound } from './transitions'

const empty: SlideDesign = { aspectRatio: 16 / 9, layers: [] }
const stop: SlideDesign = { ...empty, powerPointStopTransitionSound: true }
const track: DesignSoundtrack = { kind: 'audio', role: 'foreground', filename: 'bell.wav', libraryId: 'bell',
  powerPointTransitionSound: true, repeat: false }
const once: SlideDesign = { ...empty, soundtracks: [track] }
const loop: SlideDesign = { ...empty, soundtracks: [{ ...track, repeat: true }] }

describe('PowerPoint transition audio', () => {
  it('preserves the current run through builds and slides without a sound action', () => {
    const first = advancePowerPointTransitionSound(undefined, 'deck', 0, once)
    expect(first?.sound).toMatchObject({ libraryId: 'bell', repeat: false })
    expect(advancePowerPointTransitionSound(first, 'deck', 0, once)).toBe(first)
    expect(advancePowerPointTransitionSound(first, 'deck', 1, empty)?.sound).toBe(first?.sound)

    const second = advancePowerPointTransitionSound(first, 'deck', 2, loop)
    expect(second?.sound?.repeat).toBe(true)
    expect(second?.sound?.runId).not.toBe(first?.sound?.runId)
    expect(advancePowerPointTransitionSound(second, 'deck', 3, stop)?.sound).toBeUndefined()
    expect(advancePowerPointTransitionSound(second, 'next deck', 0, empty)?.sound).toBeUndefined()
    expect(advancePowerPointTransitionSound(second, 'deck', 2, loop, undefined, true)?.sound?.runId).not.toBe(second?.sound?.runId)
  })

  it('uses a portable address and keeps transition sounds out of ordinary playback', () => {
    const portable = { ...empty, soundtracks: [{ ...track, libraryId: undefined, archivePath: 'media/bell.wav' }] }
    expect(advancePowerPointTransitionSound(undefined, 'entry', 0, portable, 'list')?.sound)
      .toMatchObject({ playlistId: 'list', archivePath: 'media/bell.wav' })
    expect(advancePowerPointTransitionSound(undefined, 'entry', 0, portable)?.sound).toBeUndefined()
    expect(designSoundtrackAssets(portable)).toBeUndefined()
  })

  it('adds missing actions without replacing regular audio, existing actions, or edited labels', () => {
    const regular: DesignSoundtrack = { kind: 'audio', role: 'foreground', filename: 'song.wav', libraryId: 'song' }
    const prior = { ...empty, soundtracks: [regular] }
    const source = { format: 'powerpoint' as const, uid: 'same-source' }
    const saved = { source, slides: [{ id: 'slide', label: 'Local label', design: prior }], warnings: [unsupportedPowerPointTransitionSound] }
    const incoming = { source, slides: [{ id: 'slide', label: 'Source label', design: loop }] }
    const recovered = restorePowerPointSlides(saved, incoming)
    expect(recovered.slides[0]).toEqual({ ...saved.slides[0], design: { ...prior, soundtracks: [regular, loop.soundtracks![0]] } })
    expect(recovered.warnings).toEqual([])
    expect(restorePowerPointSlides(recovered, incoming)).toBe(recovered)
    expect(restorePowerPointTransitionSound(stop, loop)).toBe(stop)
    expect(powerPointLayoutKey(recovered.slides[0].design)).toBe(powerPointLayoutKey(prior))
  })
})
