import { describe, expect, it } from 'vitest'
import type { PlaylistCue, PlaylistCueAsset } from '../types/database'
import { matchSchedulePowerPoint, schedulePowerPointRecovery } from './easyWorshipPowerPointRecovery'
import { easyWorshipAppendNamespace, namespaceAppendedCues, scopeAppendedPowerPointRecovery } from './easyWorshipAppendedSchedule'
import { powerPointLayoutKey } from './powerPoint/layoutReplacement'
import { fallbackPowerPointTransition, unsupportedPowerPointTransition } from './powerPoint/transitions'
import type { SlideDesign } from '../types/slideDesign'

const attachment: PlaylistCueAsset = { kind: 'powerpoint', filename: 'Sunday.pptx', role: 'foreground' }
const before: PlaylistCue = {
  kind: 'powerpoint', label: 'Sunday', sourceId: 'sunday',
  slides: [{ label: 'Sunday', lines: [], sourceId: 'original-slide', sourceOrder: 0, assets: [attachment] }],
  warnings: ['Sunday.pptx · แนบไฟล์ .pptx ต้นฉบับเพื่อคืนสไลด์', 'ข้อสังเกตจากตาราง'],
}
const after: PlaylistCue = {
  ...before, slides: [{ label: 'Welcome', lines: ['Welcome to church'] }],
  warnings: ['มีเอฟเฟกต์ที่นำเข้าไม่ได้'],
}

function recovery(original = before, key = 'deck-sha', restored = after) {
  const candidates = new Map([['sunday', { asset: attachment, key }]])
  const result = schedulePowerPointRecovery({ sourceId: 'schedule' }, [original], [restored], candidates)
  if (!result) throw new Error('Expected a PowerPoint recovery')
  return result
}

describe('EasyWorship schedule PowerPoint recovery', () => {
  it('restores PowerPoint timing and effects by slide ID while keeping deliberate playback choices', () => {
    const transition = { uid: 'sdDXBlend', values: { Duration: '600' } }
    const restored = ['one', 'two'].map((sourceId) => ({ sourceId, label: 'Welcome', lines: ['Original'], advanceMs: 900, transition }))
    const saved: PlaylistCue = { ...before, metadata: { powerPointImportKey: 'deck-sha', notes: 'Keep this' },
      slides: [
        { sourceId: 'two', label: 'Edited', lines: ['Local words'], transitionEdited: true, playback: { mode: 'manual' } },
        { sourceId: 'one', label: 'Welcome', lines: ['Original'] },
      ], warnings: ['Operator warning', 'Sunday.pptx · ' + unsupportedPowerPointTransition] }
    const plan = recovery(before, 'deck-sha', { ...after, slides: restored, warnings: ['Sunday.pptx · ' + fallbackPowerPointTransition] })
    expect(matchSchedulePowerPoint(saved, plan)).toEqual({ state: 'ready', cue: { ...saved,
      slides: [saved.slides[0], restored[0]], warnings: ['Operator warning', 'Sunday.pptx · ' + fallbackPowerPointTransition] } })
  })

  it('restores an unchanged fallback and retains cue details and relevant warnings', () => {
    const saved: PlaylistCue = {
      ...before, label: 'ตารางเย็น', metadata: { notes: 'เก็บข้อความนี้' },
      slides: [{ lines: [], sourceOrder: 0, sourceId: 'original-slide', label: 'Sunday',
        assets: [{ filename: 'Sunday.pptx', role: 'foreground', kind: 'powerpoint' }] }],
    }
    const restored = matchSchedulePowerPoint(saved, recovery())
    expect(restored).toEqual({
      state: 'ready', cue: { ...saved, slides: after.slides,
        warnings: ['ข้อสังเกตจากตาราง', 'มีเอฟเฟกต์ที่นำเข้าไม่ได้'],
        metadata: { notes: 'เก็บข้อความนี้', powerPointImportKey: 'deck-sha' } },
    })
    if (restored?.state !== 'ready') throw new Error('Expected restored slides')
    expect(matchSchedulePowerPoint(restored.cue, recovery())).toEqual({ state: 'restored' })
    expect(matchSchedulePowerPoint(restored.cue, recovery(before, 'another-export'))).toEqual({ state: 'different' })
  })

  it.each([
    { ...before, slides: [{ ...before.slides[0], lines: ['Local wording'] }] },
    { ...before, slides: [{ ...before.slides[0], advanceMs: 3000 }] },
    { ...before, slides: [...before.slides, { label: 'New slide', lines: [] }] },
    { ...before, libraryDesignId: 'local-library-design' },
    { ...before, assets: [{ kind: 'web', filename: 'Local page' }] } satisfies PlaylistCue,
  ])('preserves locally edited fallback slides and links', (saved) => {
    expect(matchSchedulePowerPoint(saved, recovery())).toEqual({ state: 'edited' })
  })

  it('restores cached legacy slides and their earlier single-slide placeholder', () => {
    const cached: PlaylistCue = {
      ...before, kind: 'presentation', metadata: { presentationUid: null, presentationPreview: true },
      warnings: ['แสดงภาพสไลด์ที่บันทึกมากับตาราง'],
      slides: [{ ...before.slides[0], assets: [{ kind: 'image', filename: 'Slide1.jpg', archivePath: 'legacy/slide.jpg' }] }],
    }
    expect(matchSchedulePowerPoint(cached, recovery(cached))).toMatchObject({
      state: 'ready', cue: { metadata: { presentationPreview: false }, warnings: after.warnings },
    })
    expect(matchSchedulePowerPoint({ ...before, metadata: { presentationUid: null } }, recovery(cached))).toMatchObject({
      state: 'ready', cue: { kind: 'powerpoint', slides: after.slides },
    })
    expect(matchSchedulePowerPoint({ ...cached, slides: [{ ...cached.slides[0], label: 'Local name' }] }, recovery(cached)))
      .toEqual({ state: 'edited' })
  })

  it('ignores attachment recovery for mixed cue types', () => {
    expect(schedulePowerPointRecovery({ sourceId: 'schedule' }, [before], [{ ...after, kind: 'song' }],
      new Map([['sunday', { asset: attachment, key: 'deck-sha' }]]))).toBeUndefined()
  })

  it('fills earlier placeholders without a saved location while keeping a known different deck reference', () => {
    const incoming = structuredClone(before)
    incoming.slides[0].assets![0].easyWorshipSourceLocationId = 'a'.repeat(64)
    const other = structuredClone(before)
    other.slides[0].assets![0].easyWorshipSourceLocationId = 'b'.repeat(64)
    const plan = recovery(incoming)
    expect(matchSchedulePowerPoint(before, plan)?.state).toBe('ready')
    expect(matchSchedulePowerPoint(incoming, plan)?.state).toBe('ready')
    expect(matchSchedulePowerPoint(other, plan)?.state).toBe('edited')
  })

  it('fills rendered graphics in the same deck while preserving slide order, timing, and edited layouts', () => {
    const frame = { x: 0, y: 0, width: 1, height: 1 }
    const editable: SlideDesign = { aspectRatio: 16 / 9, layers: [{ id: 'title', kind: 'text', text: 'Title', frame }] }
    const rendered: SlideDesign = {
      ...editable, powerPointLayoutBeforeRendering: powerPointLayoutKey(editable),
      layers: [{ id: 'rendered', kind: 'media', frame, asset: { filename: 'slide.png', kind: 'image', libraryId: 'asset' } }],
    }
    const current = {
      ...before, metadata: { powerPointImportKey: 'deck-sha', notes: 'Operator note' },
      slides: [
        { sourceId: '2', label: 'Edited slide', lines: ['Local wording'], design: editable },
        { sourceId: '1', label: 'New label', lines: ['Title'], design: editable, advanceMs: 2000 },
      ],
    }
    const next = { ...after, slides: ['1', '2'].map((sourceId) => ({ sourceId, label: 'Title', lines: [], design: rendered })) }
    const plan = recovery(before, 'deck-sha', next)
    const result = matchSchedulePowerPoint(current, plan)
    expect(result).toEqual({ state: 'ready', cue: { ...current, slides: [
      current.slides[0], { ...current.slides[1], lines: [], design: rendered },
    ] } })
    if (result?.state !== 'ready') throw new Error('Expected rendered replacement')
    expect(matchSchedulePowerPoint(result.cue, plan)).toEqual({ state: 'edited' })
    expect(matchSchedulePowerPoint(current, recovery(before, 'different-deck', next))).toEqual({ state: 'different' })
  })

  it('matches a previous placeholder without file evidence but keeps a locally changed reference', () => {
    const verified = structuredClone(before)
    verified.slides[0].assets![0].easyWorshipFileHash = 'a'.repeat(64)
    verified.slides[0].assets![0].easyWorshipFileSize = 2048
    expect(matchSchedulePowerPoint(before, recovery(verified))?.state).toBe('ready')
    const edited = structuredClone(before)
    edited.slides[0].assets![0].filename = 'Locally selected.pptx'
    expect(matchSchedulePowerPoint(edited, recovery(verified))).toEqual({ state: 'edited' })
  })

  it('recovers a cached binary .ppt imported before its packed offset was recorded', () => {
    const legacyDeck = { ...attachment, filename: 'Sunday.ppt' }
    const preview: PlaylistCueAsset = { kind: 'image', filename: 'Slide1.jpg', archivePath: 'legacy/slide.jpg' }
    const cached: PlaylistCue = {
      ...before, kind: 'presentation', metadata: { presentationPreview: true, notes: 'Local note' },
      slides: [{ ...before.slides[0], assets: [preview, legacyDeck] }],
    }
    const packed = { ...legacyDeck, archivePath: 'legacy/1886-512.ppt' }
    const current = { ...cached, slides: [{ ...cached.slides[0], assets: [preview, packed] }] }
    const plan = schedulePowerPointRecovery({ sourceId: 'schedule' }, [current], [after], new Map([['sunday', { asset: packed, key: 'deck-sha' }]]))!
    expect(matchSchedulePowerPoint(cached, plan)).toMatchObject({ state: 'ready', cue: { metadata: { notes: 'Local note' } } })
    const edited = { ...cached, slides: [{ ...cached.slides[0], lines: ['Local wording'] }] }
    expect(matchSchedulePowerPoint(edited, plan)).toEqual({ state: 'edited' })
  })

  it('replaces cached slides in the selected append and scopes the restored slide IDs', () => {
    const selected = easyWorshipAppendNamespace('selected')
    const separate = easyWorshipAppendNamespace('separate')
    const cached: PlaylistCue = {
      ...before, kind: 'presentation', metadata: { presentationUid: null, presentationPreview: true },
      slides: [{ ...before.slides[0], assets: [{ kind: 'image', filename: 'Slide1.jpg', archivePath: 'legacy/slide.jpg' }] }],
    }
    const deck: PlaylistCue = { ...after, slides: [{ ...after.slides[0], sourceId: 'original-slide:deck:1' }] }
    const scoped = scopeAppendedPowerPointRecovery(recovery(cached, 'deck-sha', deck), selected)!
    const [saved] = namespaceAppendedCues([cached], selected, 'native-file')
    saved.metadata!.notes = 'Local note'
    expect(matchSchedulePowerPoint(namespaceAppendedCues([cached], separate)[0], scoped)).toBeUndefined()
    expect(matchSchedulePowerPoint(saved, scoped)).toMatchObject({
      state: 'ready', cue: { sourceId: `${selected}:sunday`, metadata: { notes: 'Local note', easyWorshipAppendSourceId: 'native-file' },
        slides: [{ sourceId: `${selected}:original-slide:deck:1`, lines: ['Welcome to church'] }] },
    })
    expect(matchSchedulePowerPoint({ ...saved, slides: [{ ...saved.slides[0], lines: ['Local wording'] }] }, scoped))
      .toEqual({ state: 'edited' })
  })
})
