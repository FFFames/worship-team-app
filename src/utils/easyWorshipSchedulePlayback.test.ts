import { describe, expect, it } from 'vitest'
import type { PlaylistCue } from '../types/database'
import type { DesignContent, DesignLayer } from '../types/slideDesign'
import { namespaceAppendedCues, scopeAppendedPlaybackRecovery } from './easyWorshipAppendedSchedule'
import { fillSchedulePlayback, recoverableSchedulePlayback } from './easyWorshipSchedulePlayback'
import { getSlideAdvance } from './slidePlayback'
import { cutSlideTransition } from './slideTransitions'
import { backfillImportedLayoutDetails, easyWorshipDesignIdentityContent } from './slideDesignAssets'

const effect = { uid: 'sdDXCover', values: { Duration: '850', 'Value-Direction': '1' } }
const native: PlaylistCue = { kind: 'presentation', sourceId: '10', label: 'Native', slides: [
  { sourceId: '20', label: 'First', lines: ['Original first'], transition: effect, advanceMs: 1800,
    playback: { mode: 'timer', delayMs: 1800, restart: true } },
  { sourceId: '21', label: 'Second', lines: ['Original second'], transition: effect,
    playback: { mode: 'media', delayMs: 50, loop: false } },
  { sourceId: '22', label: 'Third', lines: ['Original third'], transition: effect, advanceMs: 1800,
    playback: { mode: 'timer', delayMs: 1800 } },
] }

describe('EasyWorship schedule playback recovery', () => {
  it('recovers by slide ID after local edits and preserves intentional choices', () => {
    const newSlide = { label: 'Local addition', lines: ['New'] }
    const legacy = { ...native, label: 'Local title', metadata: { notes: 'Local note' }, slides: [
      { ...native.slides[1], label: 'Local label', lines: ['Local content'], transition: undefined, playback: undefined },
      newSlide,
      { ...native.slides[0], transition: cutSlideTransition, playback: undefined },
      { ...native.slides[2], transition: undefined, transitionEdited: true as const, advanceMs: undefined, playback: { mode: 'manual' as const } },
    ] }
    const recovery = recoverableSchedulePlayback([native])
    const update = fillSchedulePlayback(legacy, recovery)!
    expect(update.count).toBe(2)
    expect(update.cue).toEqual({ ...legacy, slides: [
      { ...legacy.slides[0], transition: effect, playback: native.slides[1].playback }, newSlide,
      { ...legacy.slides[2], playback: native.slides[0].playback }, legacy.slides[3],
    ] })
    expect(getSlideAdvance(update.cue.slides, 0)).toEqual({ index: 1, delay: 50, afterMedia: true })
    expect(getSlideAdvance(update.cue.slides, 2)).toEqual({ index: 3, delay: 1800, afterMedia: false })
    expect(fillSchedulePlayback(update.cue, recovery)).toBeUndefined()
  })

  it('keeps a different legacy duration and refuses ambiguous source or stored IDs', () => {
    const saved = { ...native, slides: [{ sourceId: '20', label: 'Local', lines: [], advanceMs: 9000 }] }
    const source = recoverableSchedulePlayback([native])
    expect(fillSchedulePlayback(saved, source)?.cue.slides).toEqual([{ ...saved.slides[0], transition: effect }])
    expect(fillSchedulePlayback({ ...saved, kind: 'song' }, source)).toBeUndefined()
    expect(fillSchedulePlayback({ ...saved, slides: [...saved.slides, ...saved.slides] }, source)).toBeUndefined()
    expect(fillSchedulePlayback(saved, recoverableSchedulePlayback([native, { ...native, slides: [] }]))).toBeUndefined()
    expect(fillSchedulePlayback(saved, recoverableSchedulePlayback([
      { ...native, slides: [...native.slides, { ...saved.slides[0], advanceMs: undefined }] },
    ]))).toBeUndefined()
  })

  it('targets the selected append batch even if other batches share the original IDs', () => {
    const incomplete = { ...native, slides: [{ sourceId: '20', label: 'Old', lines: [] }] }
    const [first] = namespaceAppendedCues([incomplete], 'append/first')
    const [second] = namespaceAppendedCues([incomplete], 'append/second')
    const recovery = scopeAppendedPlaybackRecovery(recoverableSchedulePlayback([native]), 'append/second')!
    expect(fillSchedulePlayback(first, recovery)).toBeUndefined()
    expect(fillSchedulePlayback(second, recovery)?.cue.slides[0]).toEqual({ ...second.slides[0],
      transition: effect, advanceMs: 1800, playback: native.slides[0].playback })
  })

  it('restores missing settings to a single namespaced slide with the verified source', () => {
    const asset = { kind: 'video' as const, filename: 'loop.mp4', archivePath: 'media/loop.mp4', crc32: 350 }
    const playback = { fit: 'fill' as const, muted: true, volume: .27 }
    const layer = { id: '90-foreground', kind: 'media' as const, asset,
      frame: { x: 0, y: 0, width: 1, height: 1 }, fit: 'cover' as const, loop: true }
    const oldSlide = { sourceId: '20', label: 'Edited title', lines: [], assets: [asset],
      design: { aspectRatio: 16 / 9, layers: [{ ...layer, frame: { ...layer.frame, x: .1 } }] } }
    const fresh = { ...native, slides: [{ ...oldSlide, assets: [{ ...asset, playback, repeat: false }],
      design: { ...oldSlide.design, layers: [{ ...layer, asset: { ...asset, playback },
        fit: 'fill' as const, loop: false, easyWorshipLegacyPlayback: { fit: layer.fit, loop: layer.loop } }] } }] }
    const recovery = scopeAppendedPlaybackRecovery(recoverableSchedulePlayback([fresh]), 'append/second')!
    const [other] = namespaceAppendedCues([{ ...native, slides: [oldSlide] }], 'append/first')
    const [saved] = namespaceAppendedCues([{ ...native, slides: [oldSlide] }], 'append/second')
    const result = fillSchedulePlayback(saved, recovery)!
    expect(result).toMatchObject({ count: 0, mediaCount: 1, cue: { slides: [{ label: 'Edited title',
      assets: [{ archivePath: 'append/second/media/loop.mp4', playback, repeat: false }],
      design: { layers: [{ frame: { x: .1 }, fit: 'fill', loop: false, asset: { playback } }] },
    }] } })
    expect(fillSchedulePlayback(other, recovery)).toBeUndefined()
    expect(fillSchedulePlayback(result.cue, recovery)).toBeUndefined()
  })

  it('fills a missing poster independently of saved playback and design identity', () => {
    const asset = { kind: 'video' as const, filename: 'loop.mp4', libraryId: 'same-bytes', playback: { muted: true } }
    const layer = { id: 'video', kind: 'media' as const, asset, frame: { x: .1, y: 0, width: .9, height: 1 } }
    const slide = { sourceId: '20', label: 'Local title', lines: [], assets: [asset], design: { aspectRatio: 16 / 9, layers: [layer] } }
    const cue = { ...native, slides: [slide] }
    const original = { ...asset, posterSeconds: 0, playback: { muted: false } }
    const incoming = { ...slide, assets: [original], design: { ...slide.design, layers: [{ ...layer, asset: original }] } }
    const recovery = recoverableSchedulePlayback([{ ...cue, slides: [incoming] }])
    const result = fillSchedulePlayback(cue, recovery)!
    expect(result.cue.slides[0]).toMatchObject({ ...slide, assets: [{ ...asset, posterSeconds: 0 }],
      design: { layers: [{ ...layer, asset: { ...asset, posterSeconds: 0 } }] } })
    expect(fillSchedulePlayback(result.cue, recovery)).toBeUndefined()
    const content = (design: typeof slide.design): DesignContent => ({ slides: [{ id: '20', label: 'Title', design }] })
    expect(easyWorshipDesignIdentityContent(content(incoming.design))).toEqual(easyWorshipDesignIdentityContent(content(slide.design)))
  })

  it('keeps explicit media choices and refuses conflicting or ambiguous references', () => {
    const local = { kind: 'audio' as const, role: 'background' as const, filename: 'Tone.wav', libraryId: 'tone' }
    const recovered = { ...local, repeat: true, playback: { muted: false, volume: 0 } }
    const saved = { ...native, slides: [{ sourceId: '20', label: 'Local', lines: [],
      assets: [{ ...local, repeat: false }, { ...local, libraryId: 'substitute' }],
      design: { aspectRatio: 16 / 9, layers: [], soundtracks: [{ ...local, playback: { volume: .9 } }] } }] }
    const incoming = { ...saved, slides: [{ ...saved.slides[0], assets: [recovered],
      design: { ...saved.slides[0].design, soundtracks: [recovered, recovered] } }] }
    const next = fillSchedulePlayback(saved, recoverableSchedulePlayback([incoming]))!
    expect(next.cue.slides[0].assets).toEqual([{ ...local, repeat: false, playback: recovered.playback }, saved.slides[0].assets[1]])
    expect(next.cue.slides[0].design).toBe(saved.slides[0].design)
    const ambiguous = { ...incoming, slides: [{ ...incoming.slides[0], assets: [recovered, recovered] }] }
    expect(fillSchedulePlayback(saved, recoverableSchedulePlayback([ambiguous]))).toBeUndefined()
  })

  it('retains the JSON fingerprint of a layout and updates only its native defaults once', () => {
    const video: Extract<DesignLayer, { kind: 'media' }> = { id: 'video', kind: 'media', frame: { x: 0, y: 0, width: 1, height: 1 },
      asset: { kind: 'video', filename: 'Opening.mp4', libraryId: 'opening' }, fit: 'cover', loop: true }
    const audio = { kind: 'audio' as const, filename: 'Choir.wav', role: 'background' as const, libraryId: 'choir' }
    const saved: DesignContent = { source: { format: 'easyworship', uid: 'show' }, slides: [
      { id: 'opening', label: 'Opening', design: { aspectRatio: 16 / 9, layers: [video], soundtracks: [audio] } },
    ] }
    const imported: DesignContent = { ...saved, slides: [{ ...saved.slides[0], design: {
      ...saved.slides[0].design, layers: [{ ...video, fit: 'fill', loop: false,
        easyWorshipLegacyPlayback: { fit: 'cover', loop: true }, asset: { ...video.asset, playback: { volume: .27, fit: 'fill' } } }],
      soundtracks: [{ ...audio, repeat: false, easyWorshipLegacyRepeat: false, playback: { muted: true } }],
    } }] }
    expect(JSON.stringify(easyWorshipDesignIdentityContent(imported))).toBe(JSON.stringify(easyWorshipDesignIdentityContent(saved)))
    const locallyFitted = { ...video, fit: 'contain' as const }
    const edited = { ...saved, slides: [{ ...saved.slides[0], design: { ...saved.slides[0].design, layers: [locallyFitted] } }] }
    const result = backfillImportedLayoutDetails(edited, imported)
    expect(result.slides[0].design.layers[0]).toMatchObject({ fit: 'contain', loop: false, asset: { playback: { volume: .27 } } })
    expect(result.slides[0].design.soundtracks?.[0]).toMatchObject({ repeat: false, playback: { muted: true } })
    expect(backfillImportedLayoutDetails(result, imported)).toBe(result)
    const duplicates = { ...edited, slides: [...edited.slides, ...edited.slides] }
    expect(backfillImportedLayoutDetails(duplicates, imported)).toBe(duplicates)
  })
})
