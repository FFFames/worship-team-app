/** Covers isolation of source row IDs and media addresses between appended schedules. */

import { describe, expect, it } from 'vitest'
import type { PlaylistCue } from '../types/database'
import { appendedScheduleNamespace, easyWorshipAppendNamespace, namespaceAppendedCues, recoverableAppendedScheduleMedia,
  scopeAppendedScriptureRecovery, scopeAppendedSlideDetailRecovery } from './easyWorshipAppendedSchedule'
import { fillScheduleSlideDetails, recoverableScheduleSlideDetails } from './easyWorshipScheduleCues'
import { fillScheduleMedia, reviewEasyWorshipScheduleMedia } from './easyWorshipScheduleMedia'
import { fillScheduleScripture, missingScriptureText, type RecoveredScheduleScripture } from './easyWorshipScheduleScripture'
import { editCueAsset } from './playlistCueEditing'
import { scheduleMediaAssets } from './scheduleMedia'

describe('appended EasyWorship schedules', () => {
  it('scopes packed, detached, and layered media while preserving the source content', () => {
    const cue: PlaylistCue = {
      kind: 'presentation', label: 'Upcoming service', sourceId: '7', metadata: { notes: 'Local to the source schedule' },
      assets: [{ kind: 'image', filename: 'Cover.png', archivePath: 'media\\cover.png' }],
      slides: [{ label: 'Heading', sourceId: '10', lines: ['Thai and English'], assets: [
        { kind: 'audio', filename: 'Intro.wav', archivePath: 'worshipteam-attachments/one/intro.wav' },
      ], design: { aspectRatio: 16 / 9, layers: [{
        id: 'video', kind: 'media', frame: { x: 0, y: 0, width: 1, height: 1 },
        asset: { kind: 'video', filename: 'Intro.mp4', archivePath: 'media/intro.mp4' },
      }], soundtracks: [{ kind: 'audio', filename: 'Bed.wav', role: 'background', archivePath: 'media/bed.wav' }] } }],
    }
    const first = easyWorshipAppendNamespace('first')
    const second = easyWorshipAppendNamespace('second')
    const [appended] = namespaceAppendedCues([cue], first)
    expect(appended).toMatchObject({ sourceId: first + ':7', label: cue.label, metadata: cue.metadata,
      slides: [{ sourceId: first + ':10', lines: cue.slides[0].lines }] })
    expect(scheduleMediaAssets([appended]).map((asset) => asset.archivePath)).toEqual([
      `${first}/media/cover.png`, `${first}/worshipteam-attachments/one/intro.wav`,
      `${first}/media/intro.mp4`, `${first}/media/bed.wav`,
    ])
    expect(scheduleMediaAssets(namespaceAppendedCues([cue], second)).every((asset) => asset.archivePath?.startsWith(second + '/'))).toBe(true)
    expect(cue.assets?.[0].archivePath).toBe('media\\cover.png')
  })

  it('identifies the exact source and fills only the selected batch and original media slots', async () => {
    const first = easyWorshipAppendNamespace('1188a584-b4cc-41f9-8794-105429ade542')
    const second = easyWorshipAppendNamespace('4f561397-e7d4-4aec-9dd1-521d029cdb08')
    const cue: PlaylistCue = {
      kind: 'presentation', label: 'Service', sourceId: '7',
      assets: [{ kind: 'video', filename: 'Opening.mp4' }],
      slides: [{ label: 'Prayer', sourceId: '10', lines: ['Original'], design: {
        aspectRatio: 16 / 9, layers: [], soundtracks: [{ kind: 'audio', filename: 'Bed.wav', role: 'background', repeat: true }],
      } }],
    }
    const [earlier] = namespaceAppendedCues([cue], first)
    const [selected] = namespaceAppendedCues([cue], second, 'same-schedule')
    const sources = new Set(['same-schedule'])
    const legacy = new Set([first])
    expect(appendedScheduleNamespace(earlier, sources, legacy)).toBe(first)
    expect(appendedScheduleNamespace(selected, sources, legacy)).toBe(second)
    expect(appendedScheduleNamespace(cue, sources, legacy)).toBeUndefined()
    expect(appendedScheduleNamespace({ ...selected, metadata: { easyWorshipAppendSourceId: 'other-schedule' } }, sources, legacy)).toBeUndefined()

    selected.slides[0].lines = ['Edited words']
    selected.assets![0].libraryId = 'local-edit'
    const review = await reviewEasyWorshipScheduleMedia([cue], [new File(['video'], 'Opening.mp4'), new File(['audio'], 'Bed.wav')], false)
    const recovery = recoverableAppendedScheduleMedia({ sourceId: 'same-schedule' }, [cue], review.links, second)!
    expect(fillScheduleMedia(earlier, recovery)).toBeUndefined()
    const restored = fillScheduleMedia(selected, recovery)?.cue!
    expect(restored.assets).toEqual(selected.assets)
    expect(restored.slides[0].lines).toEqual(['Edited words'])
    expect(restored.slides[0].design?.soundtracks).toMatchObject([
      { archivePath: `${second}/${review.links.get('audio:bed.wav')?.archivePath}`, repeat: true },
    ])
    expect(fillScheduleMedia(restored, recovery)).toEqual({ cue: undefined, matched: true, different: false })
  })

  it('restores scripture only in the selected batch and preserves an intentionally blank slide', () => {
    const range = { translationId: 17, book: 43, chapter: 3, firstVerse: 17, lastVerse: 17 }
    const sourceLabel = 'John 3:17'
    const incomingSlide = {
      id: '10', order: 0, label: 'John 3:17 · KJV', lines: ['Restored passage'], assets: [], warnings: [], scriptureRange: range,
      scriptureRecovery: { fallbackLabel: sourceLabel, missingText: true, replaceLabel: true },
      scriptureVerseStarts: [{ line: 0, verse: 17 }],
    }
    const recovered: RecoveredScheduleScripture = new Map([['7', new Map([
      ['10', incomingSlide], ['11', { ...incomingSlide, id: '11', order: 1 }],
    ])]])
    const cue: PlaylistCue = {
      kind: 'scripture', label: sourceLabel, sourceId: '7', warnings: [missingScriptureText(sourceLabel, 17)],
      slides: [
        { sourceId: '10', label: sourceLabel, lines: [], scriptureRange: range, advanceMs: 35000 },
        { sourceId: '11', label: 'Local label', labelEdited: true, lines: [], textEdited: true, scriptureRange: range },
      ],
    }
    const first = easyWorshipAppendNamespace('first')
    const second = easyWorshipAppendNamespace('second')
    const scoped = scopeAppendedScriptureRecovery(recovered, second)!
    const [selected] = namespaceAppendedCues([cue], second)
    expect(fillScheduleScripture(namespaceAppendedCues([cue], first)[0], scoped)).toBeUndefined()
    const repaired = fillScheduleScripture(selected, scoped)
    expect(repaired?.count).toBe(1)
    expect(repaired?.cue.slides[0]).toMatchObject({ sourceId: `${second}:10`, advanceMs: 35000, lines: ['Restored passage'] })
    expect(repaired?.cue.slides[1]).toEqual(selected.slides[1])
    expect(fillScheduleScripture(repaired!.cue, scoped)).toBeUndefined()
  })

  it('restores inherited backgrounds and positioned feeds only in the selected batch', () => {
    const frame = { x: 0, y: 0, width: 1, height: 1 }
    const feed = { kind: 'camera', filename: 'Camera 2' } as const
    const text = { id: 'lyrics', kind: 'text', frame, text: 'Original', style: {} } as const
    const current: PlaylistCue = { kind: 'presentation', sourceId: '7', label: 'Local presentation',
      slides: [{ sourceId: '10', label: 'Local slide', lines: ['Edited'], assets: [feed],
        design: { aspectRatio: 16 / 9, layers: [{ ...text, text: 'Edited' }] } }] }
    const incoming: PlaylistCue = { ...current, slides: [{ ...current.slides[0], assets: [],
      design: { aspectRatio: 16 / 9, backgroundMasterImported: true, layers: [
        { id: 'master', kind: 'media', inheritedFromMaster: true, frame,
          asset: { kind: 'image', filename: 'Background.jpg', archivePath: 'media/background.jpg' } },
        { id: 'positioned', kind: 'camera', frame: { ...frame, width: 0.5 }, asset: feed }, text,
      ] } }] }
    const first = easyWorshipAppendNamespace('first')
    const second = easyWorshipAppendNamespace('second')
    const recovery = scopeAppendedSlideDetailRecovery(recoverableScheduleSlideDetails([incoming]), second)!
    expect(fillScheduleSlideDetails(namespaceAppendedCues([current], first)[0], recovery)).toBeUndefined()

    const restored = fillScheduleSlideDetails(namespaceAppendedCues([current], second)[0], recovery)
    expect(restored).toMatchObject({ backgrounds: 1, count: 1, cue: { label: 'Local presentation',
      slides: [{ label: 'Local slide', lines: ['Edited'], assets: [], design: { layers: [
        { id: 'master', asset: { archivePath: `${second}/media/background.jpg` } },
        { id: 'positioned', frame: { width: 0.5 }, asset: feed }, { text: 'Edited' },
      ] } }] } })
    expect(fillScheduleSlideDetails(restored!.cue, recovery)).toBeUndefined()
    const intentionallyRemoved = structuredClone(restored!.cue)
    intentionallyRemoved.slides[0].design!.layers.shift()
    expect(fillScheduleSlideDetails(intentionallyRemoved, recovery)).toBeUndefined()
  })

  it('restores a resolved master soundtrack and keeps a local soundtrack or deliberate removal', () => {
    const track = { kind: 'audio', filename: 'Bed.wav', archivePath: 'media/bed.wav', role: 'background',
      inheritedFromMaster: true, repeat: true, clip: { startSeconds: 2 } } as const
    const current: PlaylistCue = { kind: 'presentation', label: 'Edited schedule', sourceId: '7',
      slides: [{ sourceId: '10', label: 'Edited slide', lines: ['Edited words'] }] }
    const incoming: PlaylistCue = { ...current, slides: [{ ...current.slides[0], assets: [track] }] }
    const scoping = easyWorshipAppendNamespace('selected')
    const [selected] = namespaceAppendedCues([current], scoping)
    const recovered = scopeAppendedSlideDetailRecovery(recoverableScheduleSlideDetails([incoming]), scoping)!

    const result = fillScheduleSlideDetails(selected, recovered)!
    expect(result).toMatchObject({ soundtracks: 1, cue: { label: current.label, slides: [{ ...selected.slides[0],
      assets: [{ ...track, archivePath: `${scoping}/media/bed.wav` }],
    }] } })
    expect(fillScheduleSlideDetails(result.cue, recovered)).toBeUndefined()
    expect(fillScheduleSlideDetails({ ...selected, slides: [editCueAsset(result.cue.slides[0], 0)] }, recovered)).toBeUndefined()
    expect(fillScheduleSlideDetails(selected, recovered, true)).toBeUndefined()
    expect(fillScheduleSlideDetails({ ...selected, slides: [{ ...selected.slides[0],
      assets: [{ kind: 'audio', filename: 'Local recording.wav', libraryId: 'replacement' }],
    }] }, recovered)).toBeUndefined()

    const missing: PlaylistCue = { ...incoming, slides: [{ ...incoming.slides[0], assets: [{ ...track, archivePath: undefined }] }] }
    expect(recoverableScheduleSlideDetails([missing]).size).toBe(0)
  })
})
