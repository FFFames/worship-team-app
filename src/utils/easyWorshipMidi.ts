/** Reads the note bindings in an EasyWorship MIDIControls.7.db file. */

import type { Database } from 'sql.js'
import { getEasyWorshipSql, isEasyWorshipSqliteDatabase } from './easyWorship'
import { isMidiOutputAction, type MidiOutputGroups, type MidiOutputNotes } from './midiOutput'
import { isMidiNumber, type MidiAction, type MidiBindings } from './midiControls'

const nativeActions = new Map<string, MidiAction>([
  ['mccLogoOn', 'welcomeOn'], ['mccLogoOff', 'welcomeOff'],
  ['mccBlackOn', 'blackOn'], ['mccBlackOff', 'blackOff'],
  ['mccClearOn', 'clearOn'], ['mccClearOff', 'clearOff'],
  ['mccPrevSchedule', 'previousCue'], ['mccNextSchedule', 'nextCue'],
  ['mccPrevBuild', 'previousSlide'], ['mccNextBuild', 'nextSlide'],
  ['mccGotoStartOfPres', 'goLive'], ['mccGotoStartOfSlide', 'restartSlide'],
  ['mccPlayPauseToggle', 'playPause'], ['mccPlay', 'play'], ['mccPause', 'pause'],
  ['mccGotoScheduleNo', 'cueNumber'], ['mccGotoSlideNo', 'slideNumber'],
])

export type EasyWorshipMidiMapping = {
  id: string
  name: string
  device: string
  channel: number | null
  bindings: MidiBindings
  skipped: number
}

// Both columns contain simple identifiers or numbers, optionally quoted by the native CSV serializer.
function tokens(value: string) {
  return value ? value.split(',').map((part) => part.trim().replace(/^"([^"]*)"$/, '$1')) : []
}

export type EasyWorshipMidiOutputMapping = {
  id: string
  name: string
  device: string
  channel: number
  notes: MidiOutputNotes
  groups: MidiOutputGroups
  skipped: number
  unsupportedMode: boolean
}

export type EasyWorshipMidiProfiles = {
  inputs: EasyWorshipMidiMapping[]
  outputs: EasyWorshipMidiOutputMapping[]
}

function readRows(db: Database, kind: 'input' | 'output') {
  const table = kind === 'input' ? 'midicontrol' : 'midicontrol_out'
  const columns = new Set(db.exec(`PRAGMA table_info(${table})`)[0]?.values.map((column) => column[1]))
  const fields = ['caption', `${kind}_device`, `${kind}_channel`, 'commands_csv', 'notevals_csv']
  if (kind === 'output') fields.push('output_mode')
  if (fields.some((column) => !columns.has(column))) return undefined
  const statement = db.prepare(`SELECT CAST(rowid AS TEXT) AS id, ${fields.join(', ')} FROM ${table} NOT INDEXED ORDER BY rowid`)
  const rows = []
  try {
    while (statement.step()) {
      const row = statement.getAsObject()
      const channel = row[`${kind}_channel`]
      const device = row[`${kind}_device`]
      rows.push({
        id: String(row.id),
        name: typeof row.caption === 'string' && row.caption.trim() ? row.caption.trim() : `ชุด MIDI ${row.id}`,
        device: typeof device === 'string' ? device : '',
        channel: isMidiNumber(channel) && channel < 16 ? channel + 1 : null,
        mode: typeof row.output_mode === 'number' ? row.output_mode : 3,
        commands: tokens(typeof row.commands_csv === 'string' ? row.commands_csv : ''),
        notes: tokens(typeof row.notevals_csv === 'string' ? row.notevals_csv : ''),
      })
    }
    return rows
  } finally { statement.free() }
}

function decodeBindings(commands: string[], rawNotes: string[], output: boolean) {
  const bindings = new Map<MidiAction, number>()
  if (commands.length !== rawNotes.length) return { bindings, skipped: Math.max(commands.length, rawNotes.length) }
  const used = new Set<number>()
  let skipped = 0
  for (const [index, command] of commands.entries()) {
    const action = nativeActions.get(command)
    const raw = rawNotes[index]
    const note = /^\d{1,3}$/.test(raw) ? Number(raw) : NaN
    if (!action || (output && !isMidiOutputAction(action)) || !isMidiNumber(note) || used.has(note) || bindings.has(action)) {
      skipped++
      continue
    }
    bindings.set(action, note)
    used.add(note)
  }
  return { bindings, skipped }
}

export async function readEasyWorshipMidi(file: File): Promise<EasyWorshipMidiProfiles> {
  if (file.size > 16 * 1024 * 1024) throw new Error('ไฟล์ตั้งค่า MIDI มีขนาดเกิน 16 MB')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isEasyWorshipSqliteDatabase(bytes)) throw new Error('ไฟล์นี้ไม่ใช่ฐานข้อมูล SQLite ของ EasyWorship')
  const SQL = await getEasyWorshipSql()
  const db = new SQL.Database(bytes)
  try {
    const inputRows = readRows(db, 'input')
    const outputRows = readRows(db, 'output')
    if (!inputRows && !outputRows) throw new Error('ไม่พบตารางการตั้งค่า MIDI ของ EasyWorship ในไฟล์นี้')
    const inputs = (inputRows ?? []).map(({ id, name, device, channel, commands, notes }): EasyWorshipMidiMapping => {
      const decoded = decodeBindings(commands, notes, false)
      const bindings: MidiBindings = {}
      for (const [action, number] of decoded.bindings) bindings[action] = { kind: 'note', number }
      return { id, name, device, channel, bindings, skipped: decoded.skipped }
    })
    const outputs = (outputRows ?? []).map(({ id, name, device, channel, mode, commands, notes }): EasyWorshipMidiOutputMapping => {
      const decoded = decodeBindings(commands, notes, true)
      const outputNotes: MidiOutputNotes = {}
      for (const [action, number] of decoded.bindings) {
        if (isMidiOutputAction(action)) outputNotes[action] = number
      }
      return {
        id, name, device, channel: channel ?? 1, notes: outputNotes, skipped: decoded.skipped,
        groups: { schedule: Boolean(mode & 1), overlays: Boolean(mode & 2), playback: false },
        unsupportedMode: mode < 0 || mode > 3,
      }
    })
    return { inputs, outputs }
  } finally { db.close() }
}
