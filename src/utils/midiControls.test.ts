/** Covers MIDI signal decoding and the native EasyWorship input mapping schema. */

import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'
import { readEasyWorshipMidi } from './easyWorshipMidi'
import { assignMidiBinding, midiActionFor, parseMidiMessage } from './midiControls'

describe('MIDI presentation control', () => {
  it('reads the MIDI channel and note velocity, ignores Note Off and supports control pulses', () => {
    expect(parseMidiMessage(new Uint8Array([0x91, 0, 2]))).toEqual({ kind: 'note', channel: 2, number: 0, value: 2 })
    expect(parseMidiMessage(new Uint8Array([0x81, 60, 64]))).toBeUndefined()
    expect(parseMidiMessage(new Uint8Array([0x91, 60, 0]))).toBeUndefined()
    expect(parseMidiMessage(new Uint8Array([0xb0, 4, 0]))).toEqual({ kind: 'control', channel: 1, number: 4, value: 0 })
    expect(parseMidiMessage(new Uint8Array([0xf8]))).toBeUndefined()
  })

  it('assigns an input event to one command and preserves the distinction between CC and Note', () => {
    const before = { nextSlide: { kind: 'note', number: 60 }, blackOn: { kind: 'control', number: 60 } } as const
    const changed = assignMidiBinding(before, 'previousSlide', { kind: 'note', number: 60 })
    expect(changed).toEqual({ previousSlide: { kind: 'note', number: 60 }, blackOn: before.blackOn })
    expect(midiActionFor(changed, { kind: 'control', channel: 1, number: 60, value: 127 })).toBe('blackOn')
  })

  it('imports ordered native command and note columns, retaining any-channel and explicit channel mappings', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database()
    try {
      db.run(`
        CREATE TABLE midicontrol (caption TEXT, input_device TEXT, input_channel INTEGER, commands_csv TEXT, notevals_csv TEXT);
        INSERT INTO midicontrol VALUES
          ('Test pad','Old input',1,'"mccNextSchedule","mccGotoStartOfPres","mccGotoSlideNo",Unknown','"40",41,0,64'),
          ('All channels','',-1,'mccBlackOff,mccBlackOn','22,22'),
          ('Truncated','',5,'mccLogoOn,mccLogoOff','40');
        CREATE TABLE midicontrol_out (caption TEXT, output_device TEXT, output_channel INTEGER, commands_csv TEXT, notevals_csv TEXT, output_mode INTEGER);
        INSERT INTO midicontrol_out VALUES
          ('Aux output','Old MIDI output',15,'mccGotoScheduleNo,mccGotoSlideNo,mccBlackOn,mccPrevBuild','15,16,2,8',7),
          ('Overlays only','',0,'mccClearOn,mccClearOff','0,5',2);
      `)
      const file = new File([new Uint8Array(db.export())], 'MIDIControls.7.db')
      const profiles = await readEasyWorshipMidi(file)
      expect(profiles.inputs).toEqual([
        { id: '1', name: 'Test pad', device: 'Old input', channel: 2, skipped: 1,
          bindings: { nextCue: { kind: 'note', number: 40 }, goLive: { kind: 'note', number: 41 }, slideNumber: { kind: 'note', number: 0 } } },
        { id: '2', name: 'All channels', device: '', channel: null, skipped: 1, bindings: { blackOff: { kind: 'note', number: 22 } } },
        { id: '3', name: 'Truncated', device: '', channel: 6, skipped: 2, bindings: {} },
      ])
      expect(profiles.outputs).toEqual([
        { id: '1', name: 'Aux output', device: 'Old MIDI output', channel: 16, skipped: 1, unsupportedMode: true,
          notes: { cueNumber: 15, slideNumber: 16, blackOn: 2 }, groups: { schedule: true, overlays: true, playback: false } },
        { id: '2', name: 'Overlays only', device: '', channel: 1, skipped: 0, unsupportedMode: false,
          notes: { clearOn: 0, clearOff: 5 }, groups: { schedule: false, overlays: true, playback: false } },
      ])
    } finally { db.close() }
  })
})
