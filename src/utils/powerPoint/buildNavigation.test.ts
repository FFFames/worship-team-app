/** Regression coverage for click builds without renumbering source slides. */

import { describe, expect, it } from 'vitest'
import type { SlideDesign } from '../../types/slideDesign'
import { powerPointDesignAtStep, stepPowerPointSlide } from './buildNavigation'
import { restoreEmbeddedPowerPointMedia, restorePowerPointBuild } from './layoutReplacement'

const frame = { x: 0, y: 0, width: 1, height: 1 }
const imported: SlideDesign = {
  aspectRatio: 16 / 9,
  layers: ['title', 'reveal', 'image', 'exit'].map((id) => ({ id, kind: 'text', frame, text: id })),
  powerPointBuild: [
    [{ layerId: 'reveal', visible: true }, { layerId: 'image', visible: true }],
    [{ layerId: 'exit', visible: false }],
  ],
}

describe('PowerPoint build navigation', () => {
  it('groups simultaneous changes and can rewind from the following slide', () => {
    const slides = [{ design: imported }, {}]
    const visible = (step: number) => powerPointDesignAtStep(imported, step).layers.map((layer) => layer.id)
    expect(visible(0)).toEqual(['title', 'exit'])
    expect(visible(1)).toEqual(['title', 'reveal', 'image', 'exit'])
    expect(visible(2)).toEqual(['title', 'reveal', 'image'])
    expect(stepPowerPointSlide(slides, 0, 0, 1)).toEqual({ index: 0, step: 1 })
    expect(stepPowerPointSlide(slides, 0, 2, 1)).toEqual({ index: 1, step: 0 })
    expect(stepPowerPointSlide(slides, 1, 0, -1)).toEqual({ index: 0, step: 2 })
    expect(stepPowerPointSlide(slides, 0, 0, -1)).toBeUndefined()
  })

  it('restores a build while retaining edited layers and respects removed layers', () => {
    const { powerPointBuild, ...original } = imported
    const saved = { ...original, layers: original.layers.map((layer) => ({ ...layer, opacity: .8 })) }
    expect(restorePowerPointBuild(saved, imported)).toEqual({ ...saved, powerPointBuild })
    expect(restorePowerPointBuild({ ...saved, layers: saved.layers.filter((layer) => layer.id !== 'image') }, imported)).toBeUndefined()
    expect(restorePowerPointBuild({ ...saved, powerPointBuild: [] }, imported)).toBeUndefined()
  })

  it('activates embedded audio on its step and gives it priority over an older track', () => {
    const design: SlideDesign = { ...imported,
      soundtracks: [
        { kind: 'audio', role: 'foreground', filename: 'click.mp3', powerPointMediaId: 'click' },
        { kind: 'audio', role: 'foreground', filename: 'auto.mp3', powerPointMediaId: 'auto' },
      ],
      powerPointBuild: [[{ layerId: 'click', visible: true }]],
    }
    expect(powerPointDesignAtStep(design, 0).soundtracks?.map((track) => track.filename)).toEqual(['auto.mp3'])
    expect(powerPointDesignAtStep(design, 1).soundtracks?.map((track) => track.filename)).toEqual(['auto.mp3', 'click.mp3'])
  })

  it('repairs the appended media steps of earlier imports and preserves edits to the visual build', () => {
    const video = { id: 'poster:embedded', kind: 'media' as const, frame, powerPointMedia: true as const,
      asset: { kind: 'video' as const, filename: 'clip.mp4' } }
    const audio = { kind: 'audio' as const, role: 'foreground' as const, filename: 'track.mp3', powerPointMediaId: 'audio:embedded' }
    const [reveal, exit] = imported.powerPointBuild!
    const showVideo = { layerId: video.id, visible: true }
    const showAudio = { layerId: audio.powerPointMediaId, visible: true }
    const ordered: SlideDesign = { ...imported, layers: [...imported.layers, video], soundtracks: [audio],
      powerPointBuild: [reveal, [showVideo], [...exit, showAudio]], powerPointLayoutBeforeMedia: 'a'.repeat(64) }
    const original: SlideDesign = { ...ordered, powerPointBuild: [reveal, exit, [showAudio], [showVideo]] }
    expect(restoreEmbeddedPowerPointMedia(original, ordered)).toEqual(ordered)
    expect(restoreEmbeddedPowerPointMedia(ordered, ordered)).toBeUndefined()
    const edited = { ...original, powerPointBuild: [exit, reveal, [showAudio], [showVideo]] }
    expect(restoreEmbeddedPowerPointMedia(edited, ordered)).toBeUndefined()

    const onlyVideo = { ...ordered, soundtracks: undefined, powerPointBuild: [reveal, [showVideo], exit] }
    const attached = { ...ordered, powerPointResolvedMediaLinks: [audio.powerPointMediaId] }
    expect(restoreEmbeddedPowerPointMedia(onlyVideo, attached)).toEqual(attached)
    expect(restoreEmbeddedPowerPointMedia({ ...onlyVideo, powerPointBuild: [exit, reveal, [showVideo]] }, attached)?.powerPointBuild)
      .toEqual([exit, reveal, [showVideo], [showAudio]])
  })
})
