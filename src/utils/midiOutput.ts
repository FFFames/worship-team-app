/** Converts committed presentation changes into ordered MIDI note pulses. */

import { easyWorshipDefaultInputNotes, isMidiNumber } from './midiControls'

export const midiOutputActions = {
  cueNumber: 'หมายเลขรายการ',
  slideNumber: 'หมายเลขสไลด์',
  goLive: 'ขึ้นสไลด์แรก',
  blackOn: 'เปิดจอดำ',
  blackOff: 'ออกจากจอดำ',
  welcomeOn: 'เปิดจอต้อนรับ',
  welcomeOff: 'ออกจากจอต้อนรับ',
  clearOn: 'ล้างเนื้อหาจอ',
  clearOff: 'คืนเนื้อหาจอ',
  play: 'เล่นสื่อ',
  pause: 'พักสื่อ',
} as const

export type MidiOutputAction = keyof typeof midiOutputActions
export type MidiOutputNotes = Partial<Record<MidiOutputAction, number>>
export type MidiOutputGroups = { schedule: boolean; overlays: boolean; playback: boolean }
export type MidiOutputPreferences = {
  outputId: string
  channel: number
  notes: MidiOutputNotes
  groups: MidiOutputGroups
  forwardInput: boolean
  configured?: true
}
export type MidiOverlay = 'black' | 'welcome' | 'clear'
export type MidiDisplayEvent = { type: 'live'; cue: number; slide: number } | { type: 'overlay'; mode: MidiOverlay }
export type MidiOutputEvent = MidiDisplayEvent | { type: 'playback'; playing: boolean } | { type: 'overlayOff'; mode: MidiOverlay }
export type MidiOutputEmitter = (event: MidiOutputEvent, fromMidi?: boolean) => void

export const midiOutputStorageKey = 'worshipteam.midi-output.v1'
export const defaultMidiOutputPreferences: MidiOutputPreferences = {
  outputId: '', channel: 1, notes: {}, groups: { schedule: true, overlays: true, playback: false }, forwardInput: false,
}
export const easyWorshipDefaultOutputNotes: MidiOutputNotes = {}
for (const action of Object.keys(midiOutputActions) as MidiOutputAction[]) {
  easyWorshipDefaultOutputNotes[action] = easyWorshipDefaultInputNotes[action]
}

export function isMidiOutputAction(value: string): value is MidiOutputAction {
  return Object.prototype.hasOwnProperty.call(midiOutputActions, value)
}

export function readMidiOutputPreferences(): MidiOutputPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(midiOutputStorageKey) ?? 'null')
    if (!value || typeof value !== 'object') return defaultMidiOutputPreferences
    const notes: MidiOutputNotes = {}
    for (const action of Object.keys(midiOutputActions) as MidiOutputAction[]) {
      if (isMidiNumber(value.notes?.[action])) notes[action] = value.notes[action]
    }
    return {
      outputId: typeof value.outputId === 'string' ? value.outputId : '',
      channel: isMidiNumber(value.channel) && value.channel >= 1 && value.channel <= 16 ? value.channel : 1,
      notes,
      groups: {
        schedule: value.groups?.schedule !== false,
        overlays: value.groups?.overlays !== false,
        playback: value.groups?.playback === true,
      },
      forwardInput: value.forwardInput === true,
      ...(value.configured === true ? { configured: true } : {}),
    }
  } catch {
    return defaultMidiOutputPreferences
  }
}

export function hasMidiOutputConfiguration(settings: MidiOutputPreferences): boolean {
  const { channel, groups, forwardInput, notes, configured } = settings
  return configured === true || channel !== 1 || !groups.schedule || !groups.overlays || groups.playback || forwardInput || Object.keys(notes).length > 0
}

export function saveMidiOutputPreferences(settings: MidiOutputPreferences) {
  const configured = hasMidiOutputConfiguration(settings) || hasMidiOutputConfiguration(readMidiOutputPreferences())
  localStorage.setItem(midiOutputStorageKey, JSON.stringify({ ...settings, ...(configured ? { configured: true } : {}) }))
}

const overlayActions = {
  black: { on: 'blackOn', off: 'blackOff' },
  welcome: { on: 'welcomeOn', off: 'welcomeOff' },
  clear: { on: 'clearOn', off: 'clearOff' },
} as const

export function midiOutputPackets(
  event: MidiOutputEvent,
  settings: Pick<MidiOutputPreferences, 'channel' | 'notes' | 'groups'>,
  previousOverlay?: MidiOverlay,
  sync = false,
): { data: number[]; warning?: 'range' | 'mapping' } {
  const data: number[] = []
  const channel = settings.channel - 1
  const { notes, groups } = settings
  const add = (action: MidiOutputAction, value = 127) => {
    const note = notes[action]
    if (note !== undefined) data.push(0x90 | channel, note, value, 0x80 | channel, note, 0)
  }
  if (event.type === 'playback') {
    if (groups.playback) add(event.playing ? 'play' : 'pause')
    return { data }
  }
  if (event.type === 'overlayOff') {
    if (groups.overlays) add(overlayActions[event.mode].off)
    return { data }
  }
  if (groups.overlays && event.type === 'live') {
    for (const key of Object.keys(overlayActions) as MidiOverlay[]) {
      if (sync || key === previousOverlay) add(overlayActions[key].off)
    }
  }
  if (event.type === 'live' && groups.schedule) {
    const cue = event.cue + 1
    const slide = event.slide + 1
    if (!isMidiNumber(cue) || cue === 0 || !isMidiNumber(slide) || slide === 0) return { data: [], warning: 'range' }
    const selector = slide === 1 && notes.goLive !== undefined ? 'goLive' : 'slideNumber'
    if (notes.cueNumber === undefined || notes[selector] === undefined) return { data: [], warning: 'mapping' }
    add('cueNumber', cue)
    add(selector, slide)
  }
  if (groups.overlays && event.type === 'overlay') {
    const overlay = event.mode
    add(overlayActions[overlay].on)
    if (sync) {
      for (const key of Object.keys(overlayActions) as MidiOverlay[]) {
        if (key !== overlay) add(overlayActions[key].off)
      }
    } else if (previousOverlay && previousOverlay !== overlay) {
      add(overlayActions[previousOverlay].off)
    }
  }
  return { data }
}
