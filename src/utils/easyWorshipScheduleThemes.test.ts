import { describe, expect, it } from 'vitest'
import type { PlaylistSong } from '../types/database'
import { isLegacyGlobalThemeEntry, isNestedScheduleGlobal, scheduleGlobalThemeParents } from './easyWorshipScheduleThemes'

const global = { _id: 10, presentation_type: 11, presentation_uid: 'GLOBAL', group_level: 2, order_index: 0 }
const child = { _id: 11, presentation_type: 12, group_level: 1, order_index: 0 }

describe('EasyWorship schedule theme definitions', () => {
  it('recognizes nested Global rows and only maps the unambiguous parent in the same order slot', () => {
    expect(isNestedScheduleGlobal(global)).toBe(true)
    expect(isNestedScheduleGlobal({ ...global, group_level: 0 })).toBe(false)
    expect(isNestedScheduleGlobal({ ...global, presentation_uid: 'USER' })).toBe(false)
    expect([...scheduleGlobalThemeParents([global, child, { ...child, _id: 12, order_index: 1 }])]).toEqual([['11', '10']])
    expect(scheduleGlobalThemeParents([global, child, { ...global, _id: 13 }]).size).toBe(0)
    expect(scheduleGlobalThemeParents([global, { ...child, group_level: 2 }]).size).toBe(0)
  })

  it('hides an old stock definition while retaining a locally renamed or edited entry', () => {
    const globalEntry: PlaylistSong = {
      id: 'row', playlist_id: 'playlist', song_id: null, transpose: 0, order: 0, created_at: '',
      cue: { kind: 'unknown', label: 'Global', sourceId: '69',
        metadata: { type: 11, presentationUid: 'GLOBAL', groupLevel: 2 },
        slides: ['Master', 'Song', 'Scripture', 'Presentation'].map((label, index) => ({
          label, sourceId: String(286 + index), sourceOrder: index, lines: [], assets: [],
        })),
      },
    }
    const cue = globalEntry.cue!
    expect(isLegacyGlobalThemeEntry(globalEntry)).toBe(true)
    expect(isLegacyGlobalThemeEntry({ ...globalEntry, cue: { ...cue, label: 'Local label' } })).toBe(false)
    expect(isLegacyGlobalThemeEntry({ ...globalEntry, cue: { ...cue, metadata: { ...cue.metadata, notes: 'Local note' } } })).toBe(false)
    expect(isLegacyGlobalThemeEntry({ ...globalEntry, cue: { ...cue,
      slides: [{ ...cue.slides[0], lines: ['Local text'] }, ...cue.slides.slice(1)],
    } })).toBe(false)
  })
})
