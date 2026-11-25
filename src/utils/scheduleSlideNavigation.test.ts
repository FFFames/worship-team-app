import { describe, expect, it } from 'vitest'
import type { PlaylistSlide } from './playlistCues'
import { stepScheduleSlide } from './scheduleSlideNavigation'

const lyric: PlaylistSlide = { sectionType: 'verse', sectionLabel: 'Verse', lines: ['Words'] }
const built: PlaylistSlide = { ...lyric, design: {
  aspectRatio: 16 / 9,
  layers: [],
  powerPointBuild: [[{ layerId: 'caption', visible: true }]],
} }
const schedule = [[lyric, built], [], [lyric]]
const slidesFor = (cue: number) => schedule[cue] ?? []

describe('continuous schedule slide navigation', () => {
  it('starts at the first slide and crosses empty cues only in continuous mode', () => {
    expect(stepScheduleSlide(slidesFor, schedule.length, { cue: -1, index: -1, step: 0 }, 1, true))
      .toEqual({ cue: 0, blocks: schedule[0], index: 0, step: 0 })
    const lastBuild = { cue: 0, index: 1, step: 1 }
    expect(stepScheduleSlide(slidesFor, schedule.length, lastBuild, 1, false)).toBeUndefined()
    expect(stepScheduleSlide(slidesFor, schedule.length, lastBuild, 1, true))
      .toEqual({ cue: 2, blocks: schedule[2], index: 0, step: 0 })
  })

  it('walks each build and enters the previous cue at its last rendered step', () => {
    expect(stepScheduleSlide(slidesFor, schedule.length, { cue: 0, index: 1, step: 0 }, 1, true))
      .toEqual({ cue: 0, blocks: schedule[0], index: 1, step: 1 })
    const lastCue = { cue: 2, index: 0, step: 0 }
    expect(stepScheduleSlide(slidesFor, schedule.length, lastCue, -1, true))
      .toEqual({ cue: 0, blocks: schedule[0], index: 1, step: 1 })
    expect(stepScheduleSlide(slidesFor, schedule.length, lastCue, 1, true)).toBeUndefined()
    expect(stepScheduleSlide(slidesFor, schedule.length, { cue: 0, index: 0, step: 0 }, -1, true)).toBeUndefined()
  })
})
