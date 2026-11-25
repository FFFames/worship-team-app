import { describe, expect, it } from 'vitest'
import { defaultMidiOutputPreferences, easyWorshipDefaultOutputNotes, midiOutputPackets } from './midiOutput'

const settings = { ...defaultMidiOutputPreferences, channel: 3, notes: easyWorshipDefaultOutputNotes }
const note = (id: number, velocity = 127) => [0x92, id, velocity, 0x82, id, 0]

describe('MIDI output', () => {
  it('selects a cue before going live and uses slide velocity for later slides', () => {
    expect(midiOutputPackets({ type: 'live', cue: 1, slide: 0 }, settings).data).toEqual([
      ...note(15, 2), ...note(10, 1),
    ])
    expect(midiOutputPackets({ type: 'live', cue: 126, slide: 126 }, settings).data).toEqual([
      ...note(15, 127), ...note(16, 127),
    ])
    const mapped = { ...settings, notes: { cueNumber: 0, slideNumber: 16 } }
    expect(midiOutputPackets({ type: 'live', cue: 0, slide: 0 }, mapped).data).toEqual([
      ...note(0, 1), ...note(16, 1),
    ])
  })

  it('clears existing overlays before navigating to avoid restoring the former slide after the new cue', () => {
    expect(midiOutputPackets({ type: 'live', cue: 0, slide: 1 }, settings, 'black', true).data).toEqual([
      ...note(3), ...note(1), ...note(5), ...note(15, 1), ...note(16, 2),
    ])
    expect(midiOutputPackets({ type: 'overlay', mode: 'welcome' }, settings, 'clear').data).toEqual([
      ...note(0), ...note(5),
    ])
  })

  it('never sends a partial schedule change when a cue or slide cannot be selected', () => {
    expect(midiOutputPackets({ type: 'live', cue: 127, slide: 0 }, settings, 'black')).toEqual({ data: [], warning: 'range' })
    expect(midiOutputPackets({ type: 'live', cue: 0, slide: -1 }, settings)).toEqual({ data: [], warning: 'range' })
    expect(midiOutputPackets({ type: 'live', cue: 0, slide: 1 }, { ...settings, notes: { cueNumber: 15 } })).toEqual({
      data: [], warning: 'mapping',
    })
  })

  it('restores the cleared foreground without sending schedule selection notes', () => {
    expect(midiOutputPackets({ type: 'overlayOff', mode: 'clear' }, settings, 'clear', true).data).toEqual(note(5))
  })

  it('respects independent overlay, navigation and playback settings', () => {
    const overlaysOnly = { ...settings, groups: { schedule: false, overlays: true, playback: false } }
    expect(midiOutputPackets({ type: 'live', cue: 0, slide: 0 }, overlaysOnly, 'welcome').data).toEqual(note(1))
    expect(midiOutputPackets({ type: 'playback', playing: false }, overlaysOnly).data).toEqual([])
    const playbackOnly = { ...settings, groups: { schedule: false, overlays: false, playback: true } }
    expect(midiOutputPackets({ type: 'playback', playing: false }, playbackOnly).data).toEqual(note(14))
    expect(midiOutputPackets({ type: 'overlay', mode: 'black' }, playbackOnly).data).toEqual([])
  })
})
