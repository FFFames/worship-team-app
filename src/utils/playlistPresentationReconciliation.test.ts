/** Regression coverage for transporting reusable schedule designs. */

import { describe, expect, it } from 'vitest'
import type { LibraryDesign } from '../types/slideDesign'
import { matchesPresentationKind, playlistCueFromLibrary, presentationContentFromCue, presentationSourceUid, type PresentationCue } from './playlistPresentationReconciliation'
import { presentationCue } from './slideDesign'

const frame = { x: .1, y: .1, width: .8, height: .8 }
const cue: PresentationCue = {
  kind: 'presentation', label: 'สไลด์ในตาราง', sourceOrder: 3, looping: true,
  metadata: { presentationUid: 'native-uid', notes: 'ประกาศหลังสไลด์นี้', groupLevel: 2, author: 'ผู้แต่ง' },
  slides: [{
    label: 'สไลด์แรก', lines: ['เนื้อหา'], sourceId: 'native-slide', template: 'Title & Content',
    advanceMs: 1000, playback: { mode: 'timer', delayMs: 1000 }, transition: { values: { type: '1' } },
    assets: [
      { kind: 'video', filename: 'intro.mpg', archivePath: 'Media/intro.mp4', role: 'background' },
      { kind: 'audio', filename: 'bed.wav', archivePath: 'Media/bed.wav', role: 'background', repeat: true },
    ],
    design: { aspectRatio: 4 / 3, layers: [
      { id: 'video', kind: 'media', frame, asset: { kind: 'video', filename: 'intro.mpg', archivePath: 'Media/intro.mp4' }, fit: 'contain' },
      { id: 'title', kind: 'text', frame, text: 'เนื้อหา', runs: [{ text: 'เนื้อหา', style: { bold: true, color: '#123456' } }] },
    ] },
  }],
}

describe('schedule presentation reconciliation', () => {
  it('uses a PowerPoint file fingerprint ahead of the schedule item UID', () => {
    const scheduled: PresentationCue = { ...cue, kind: 'powerpoint',
      metadata: { presentationUid: 'native-uid', powerPointImportKey: 'verified-file-fingerprint' } }
    expect(presentationSourceUid(scheduled)).toBe('verified-file-fingerprint')
    expect(presentationContentFromCue(scheduled).source).toMatchObject({
      format: 'powerpoint', uid: 'verified-file-fingerprint',
    })
    expect(presentationSourceUid(cue)).toBe('native-uid')
  })

  it('keeps geometry, styled lyrics, playback, and media without duplicating authored layers', () => {
    const content = presentationContentFromCue(cue, true)
    expect(content).toMatchObject({ looping: true, source: { format: 'easyworship', uid: 'native-uid', author: 'ผู้แต่ง' } })
    expect(content.slides[0]).toMatchObject({ id: 'native-slide', template: 'Title & Content', playback: { delayMs: 1000 }, transition: cue.slides[0].transition })
    expect(content.slides[0].design).toMatchObject({ aspectRatio: 4 / 3, layers: [
      { id: 'video', kind: 'media', frame, asset: { filename: 'intro.mp4', sourcePath: 'Media/intro.mp4' } },
      { id: 'title', kind: 'text', runs: [{ style: { bold: true, color: '#123456' } }] },
    ], soundtracks: [{ filename: 'bed.wav', sourcePath: 'Media/bed.wav', repeat: true }] })
    expect(content.slides[0].design.layers).toHaveLength(2)
    expect(cue.slides[0].design?.layers[0]).toMatchObject({ asset: { archivePath: 'Media/intro.mp4' } })
  })

  it('copies the library snapshot but keeps the schedule note and grouping', () => {
    const content = presentationContentFromCue(cue)
    expect(content.notes).toBeUndefined()
    const notes = 'โน้ตของงานในคลัง\nบรรทัดที่สอง'
    const target: LibraryDesign = { id: 'library-id', title: 'สไลด์ในคลัง', kind: 'presentation', created_at: '',
      content: { ...content, notes } }
    expect(presentationCue(target).metadata).toMatchObject({ notes, libraryNotes: notes })
    const replacement = playlistCueFromLibrary(cue, target)
    expect(matchesPresentationKind(cue, target)).toBe(true)
    expect(matchesPresentationKind({ ...cue, kind: 'powerpoint' }, target)).toBe(false)
    expect(replacement).toMatchObject({ label: target.title, libraryDesignId: target.id, sourceOrder: 3,
      metadata: { notes: 'ประกาศหลังสไลด์นี้', libraryNotes: notes, groupLevel: 2 }, slides: [{ assets: [{ kind: 'audio', repeat: true }] }] })
    expect(replacement.slides[0].design?.soundtracks).toBeUndefined()
    expect(presentationContentFromCue(replacement as PresentationCue).notes).toBe(notes)
    const cleared = playlistCueFromLibrary({ ...cue, metadata: { ...cue.metadata, notes: '' } }, target)
    expect(cleared.metadata).toMatchObject({ notes: '', libraryNotes: notes })
  })
})
