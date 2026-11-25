/** Maps MIDI input messages to presentation commands and stores the local bindings. */

export const midiActions = {
  nextSlide: 'สไลด์ถัดไป',
  previousSlide: 'สไลด์ก่อนหน้า',
  nextCue: 'เลือกรายการถัดไป',
  previousCue: 'เลือกรายการก่อนหน้า',
  cueNumber: 'เลือกรายการตามค่า Velocity',
  goLive: 'ขึ้นรายการที่เลือกตั้งแต่ต้น',
  slideNumber: 'ขึ้นสไลด์ตามค่า Velocity',
  restartSlide: 'เริ่มสไลด์ปัจจุบันใหม่',
  blackOn: 'เปิดจอดำ',
  blackOff: 'ออกจากจอดำ',
  welcomeOn: 'เปิดจอต้อนรับ',
  welcomeOff: 'ออกจากจอต้อนรับ',
  clearOn: 'ล้างเนื้อหาจอ',
  clearOff: 'คืนเนื้อหาจอ',
  playPause: 'เล่นหรือพักสื่อ',
  play: 'เล่นสื่อ',
  pause: 'พักสื่อ',
} as const

export type MidiAction = keyof typeof midiActions
export type MidiBinding = { kind: 'note' | 'control'; number: number }
export type MidiBindings = Partial<Record<MidiAction, MidiBinding>>
export type MidiPreferences = { inputId: string; channel: number | null; bindings: MidiBindings; followMaster: boolean; configured?: true }
export type MidiInputMessage = MidiBinding & { channel: number; value: number }
export const midiInputStorageKey = 'worshipteam.midi-control.v1'
export const defaultMidiPreferences: MidiPreferences = { inputId: '', channel: null, bindings: {}, followMaster: false }

export const easyWorshipDefaultInputNotes = {
  welcomeOn: 0, welcomeOff: 1, blackOn: 2, blackOff: 3, clearOn: 4, clearOff: 5,
  previousCue: 6, nextCue: 7, previousSlide: 8, nextSlide: 9, goLive: 10, restartSlide: 11,
  playPause: 12, play: 13, pause: 14, cueNumber: 15, slideNumber: 16,
} satisfies Record<MidiAction, number>

export function isMidiNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 127
}

export function midiBindingKey(binding: MidiBinding) {
  return `${binding.kind}:${binding.number}`
}

export function assignMidiBinding(bindings: MidiBindings, action: MidiAction, binding?: MidiBinding): MidiBindings {
  const next = { ...bindings }
  if (!binding) {
    delete next[action]
    return next
  }
  for (const key of Object.keys(next) as MidiAction[]) {
    if (next[key] && midiBindingKey(next[key]) === midiBindingKey(binding)) delete next[key]
  }
  return { ...next, [action]: binding }
}

export function parseMidiMessage(bytes: Uint8Array): MidiInputMessage | undefined {
  if (bytes.length !== 3) return undefined
  const [status, number, value] = bytes
  const message = status & 0xf0
  if (!isMidiNumber(number) || !isMidiNumber(value)) return undefined
  const channel = (status & 0x0f) + 1
  if (message === 0x90 && value > 0) return { kind: 'note', channel, number, value }
  if (message === 0xb0) return { kind: 'control', channel, number, value }
  return undefined
}

export function midiActionFor(bindings: MidiBindings, message: MidiInputMessage): MidiAction | undefined {
  return (Object.keys(bindings) as MidiAction[]).find((action) => {
    const binding = bindings[action]
    return binding?.kind === message.kind && binding.number === message.number
  })
}

export function readMidiPreferences(): MidiPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(midiInputStorageKey) ?? 'null')
    if (!saved || typeof saved !== 'object') return defaultMidiPreferences
    const bindings: MidiBindings = {}
    const used = new Set<string>()
    for (const action of Object.keys(midiActions) as MidiAction[]) {
      const savedBinding = saved.bindings?.[action]
      if (!(savedBinding?.kind === 'note' || savedBinding?.kind === 'control') || !isMidiNumber(savedBinding.number)) continue
      const key = midiBindingKey(savedBinding)
      if (used.has(key)) continue
      used.add(key)
      bindings[action] = { kind: savedBinding.kind, number: savedBinding.number }
    }
    return {
      inputId: typeof saved.inputId === 'string' ? saved.inputId : '',
      channel: isMidiNumber(saved.channel) && saved.channel >= 1 && saved.channel <= 16 ? saved.channel : null,
      bindings,
      followMaster: saved.followMaster === true,
      ...(saved.configured === true ? { configured: true } : {}),
    }
  } catch {
    return defaultMidiPreferences
  }
}

export function hasMidiInputConfiguration(settings: MidiPreferences): boolean {
  return settings.configured === true || settings.channel !== null || settings.followMaster || Object.keys(settings.bindings).length > 0
}

export function saveMidiPreferences(settings: MidiPreferences) {
  const configured = hasMidiInputConfiguration(settings) || hasMidiInputConfiguration(readMidiPreferences())
  localStorage.setItem(midiInputStorageKey, JSON.stringify({ ...settings, ...(configured ? { configured: true } : {}) }))
}
