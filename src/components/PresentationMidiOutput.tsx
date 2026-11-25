import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { EasyWorshipMidiOutputMapping } from '../utils/easyWorshipMidi'
import { isMidiNumber } from '../utils/midiControls'
import {
  easyWorshipDefaultOutputNotes, midiOutputActions, midiOutputPackets, midiOutputStorageKey, readMidiOutputPreferences, saveMidiOutputPreferences,
  type MidiDisplayEvent, type MidiOutputAction, type MidiOutputEmitter, type MidiOutputEvent,
  type MidiOutputGroups, type MidiOutputPreferences, type MidiOverlay,
} from '../utils/midiOutput'

const actions = Object.keys(midiOutputActions) as MidiOutputAction[]
const groupLabels = {
  schedule: 'รายการและสไลด์',
  overlays: 'จอดำ จอต้อนรับ และล้างเนื้อหา',
  playback: 'เล่นหรือพักสื่อ',
} satisfies Record<keyof MidiOutputGroups, string>
const groupKeys = Object.keys(groupLabels) as (keyof MidiOutputGroups)[]

export function PresentationMidiOutput({ access, profiles, emitter, snapshot }: {
  access?: MIDIAccess
  profiles: EasyWorshipMidiOutputMapping[]
  emitter: RefObject<MidiOutputEmitter | null>
  snapshot: () => MidiDisplayEvent | undefined
}) {
  const [settings, setSettings] = useState(readMidiOutputPreferences)
  const [outputs, setOutputs] = useState<MIDIOutput[]>([])
  const [armed, setArmed] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [profileId, setProfileId] = useState('')
  const configuration = useRef(settings)
  const activePort = useRef<MIDIOutput | null>(null)
  const previousOverlay = useRef<MidiOverlay | undefined>(undefined)
  const needsSync = useRef(true)
  const profile = profiles.find((entry) => entry.id === profileId) ?? profiles[0]
  const output = outputs.find((port) => port.id === settings.outputId)

  const stop = useCallback(() => {
    const port = activePort.current
    activePort.current = null
    previousOverlay.current = undefined
    needsSync.current = true
    setArmed(false)
    if (port) void port.close().catch(() => {})
  }, [])

  useEffect(() => {
    function syncSettings(event: StorageEvent) {
      if (event.key !== midiOutputStorageKey && event.key !== null) return
      const wasSending = activePort.current !== null
      stop()
      const next = readMidiOutputPreferences()
      configuration.current = next
      setSettings(next)
      if (wasSending) setStatus('อัปเดตการจับคู่แล้ว เปิดส่ง MIDI อีกครั้งเมื่อพร้อม')
    }
    window.addEventListener('storage', syncSettings)
    return () => window.removeEventListener('storage', syncSettings)
  }, [stop])

  useEffect(() => {
    if (!access) return
    const refresh = () => {
      setOutputs([...access.outputs.values()].filter((port) => port.state === 'connected'))
      if (activePort.current?.state === 'disconnected') {
        stop()
        setStatus('อุปกรณ์ MIDI ขาออกหลุด เปิดส่งใหม่เมื่อเชื่อมต่อแล้ว')
      }
    }
    refresh()
    access.addEventListener('statechange', refresh)
    window.addEventListener('pagehide', stop)
    return () => {
      access.removeEventListener('statechange', refresh)
      window.removeEventListener('pagehide', stop)
      const port = activePort.current
      activePort.current = null
      if (port) void port.close().catch(() => {})
    }
  }, [access, stop])

  const publish = useCallback((event: MidiOutputEvent, synchronize = false) => {
    const port = activePort.current
    if (port?.state !== 'connected') return
    const packet = midiOutputPackets(event, configuration.current, previousOverlay.current, synchronize || needsSync.current)
    if (packet.warning) {
      setError(packet.warning === 'range' ? 'MIDI ส่งได้เฉพาะหมายเลขรายการและสไลด์ 1–127'
        : 'ตั้งค่าโน้ตหมายเลขรายการและสไลด์สำหรับส่งตำแหน่ง MIDI')
      return
    }
    if (!packet.data.length) return
    try {
      port.send(packet.data)
      if (event.type !== 'playback') {
        previousOverlay.current = event.type === 'overlay' ? event.mode : undefined
        needsSync.current = false
      }
      setError('')
    } catch {
      stop()
      setError('ส่งคำสั่ง MIDI ไม่สำเร็จ ตรวจอุปกรณ์แล้วเปิดส่งอีกครั้ง')
    }
  }, [stop])

  useEffect(() => {
    emitter.current = (event, fromMidi) => {
      if (!fromMidi || configuration.current.forwardInput) publish(event)
    }
    return () => { emitter.current = null }
  }, [emitter, publish])

  function save(next: MidiOutputPreferences) {
    stop()
    configuration.current = next
    setSettings(next)
    setError('')
    setStatus('')
    try { saveMidiOutputPreferences(next) } catch { setError('เบราว์เซอร์บันทึกการตั้งค่า MIDI ขาออกไม่ได้') }
  }

  function setNote(action: MidiOutputAction, field: HTMLInputElement) {
    const current = settings.notes[action]
    const note = field.value === '' ? undefined : field.valueAsNumber
    if (!field.validity.valid || (note !== undefined && !isMidiNumber(note))) {
      field.value = String(current ?? '')
      setError('ใช้หมายเลขโน้ต 0–127')
      return
    }
    if (note === current) return
    const duplicate = note === undefined ? undefined : actions.find((other) => other !== action && settings.notes[other] === note)
    if (duplicate) {
      field.value = String(current ?? '')
      setError(`Note ${note} ใช้กับ “${midiOutputActions[duplicate]}” อยู่`)
      return
    }
    const notes = { ...settings.notes }
    if (note === undefined) delete notes[action]
    else notes[action] = note
    save({ ...settings, notes })
  }

  return (
    <details className="min-w-0 rounded-md border border-[var(--border-subtle)] p-2!">
      <summary className="cursor-pointer font-medium">ส่ง MIDI ไปยังเครื่องอื่น</summary>
      <div className="mt-2! grid min-w-0 gap-3">
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1">อุปกรณ์ MIDI ขาออก
            <select className="input-field min-w-0" aria-label="อุปกรณ์ MIDI ขาออก" disabled={!access} value={settings.outputId}
              onChange={(event) => save({ ...settings, outputId: event.currentTarget.value })}>
              <option value="">เลือกอุปกรณ์</option>
              {settings.outputId && !output && <option value={settings.outputId}>อุปกรณ์เดิมกำลังรอเชื่อมต่อ</option>}
              {outputs.map((port) => <option key={port.id} value={port.id}>{port.name || port.manufacturer || 'อุปกรณ์ MIDI'}</option>)}
            </select>
          </label>
          <label className="grid min-w-0 gap-1">ช่อง MIDI ขาออก
            <select className="input-field min-w-0" aria-label="ช่อง MIDI ขาออก" value={settings.channel}
              onChange={(event) => save({ ...settings, channel: Number(event.currentTarget.value) })}>
              {Array.from({ length: 16 }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}
            </select>
          </label>
        </div>
        {access && !outputs.length && <p>กำลังรออุปกรณ์ MIDI ขาออก</p>}
        {profile && <div className="grid gap-2 rounded-md border border-[var(--border-subtle)] p-2!">
          <label className="grid gap-1">ชุด MIDI ขาออกจาก EasyWorship
            <select className="input-field" aria-label="ชุด MIDI ขาออกจาก EasyWorship" value={profile.id} onChange={(event) => setProfileId(event.currentTarget.value)}>
              {profiles.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}
            </select>
          </label>
          <p>{Object.keys(profile.notes).length} คำสั่ง · ช่อง {profile.channel}{profile.skipped > 0 && ` · ข้าม ${profile.skipped} คำสั่ง`}</p>
          {profile.device && <p className="wrap-anywhere">อุปกรณ์เดิม · {profile.device}</p>}
          {profile.unsupportedMode && <p>ชุดนี้มีโหมดส่งจาก EasyWorship ที่ยังไม่รองรับ</p>}
          <details>
            <summary className="cursor-pointer">ตรวจคำสั่งขาออกในชุดนี้</summary>
            <p>ส่ง {groupKeys.filter((group) => profile.groups[group]).map((group) => groupLabels[group]).join(', ') || 'ปิดทุกกลุ่ม'}</p>
            <ul className="mt-2! grid gap-1">
              {actions.map((action) => profile.notes[action] === undefined ? null :
                <li key={action}>{midiOutputActions[action]} · Note {profile.notes[action]}</li>)}
            </ul>
          </details>
          <button type="button" className="btn-secondary justify-self-start" disabled={!Object.keys(profile.notes).length}
            onClick={() => {
              save({ ...settings, channel: profile.channel, notes: profile.notes, groups: profile.groups })
              setStatus(`ใช้ชุด ${profile.name} แล้ว เลือกอุปกรณ์ MIDI บนเครื่องนี้ก่อนเปิดส่ง`)
            }}>ใช้ชุดคำสั่งขาออกนี้</button>
        </div>}
        <fieldset className="grid gap-2">
          <legend className="mb-1! font-medium">ส่งคำสั่งตามการเปลี่ยนแปลงของจอ</legend>
          {groupKeys.map((group) => <label key={group} className="flex items-center gap-2">
            <input type="checkbox" checked={settings.groups[group]}
              onChange={(event) => save({ ...settings, groups: { ...settings.groups, [group]: event.currentTarget.checked } })} />
            {groupLabels[group]}
          </label>)}
        </fieldset>
        <details>
          <summary className="cursor-pointer">กำหนดโน้ตขาออก</summary>
          <div className="mt-2! grid gap-2">
            <button type="button" className="btn-secondary justify-self-start"
              onClick={() => save({ ...settings, notes: easyWorshipDefaultOutputNotes })}>ใช้โน้ตขาเข้าเริ่มต้นของ EasyWorship</button>
            {actions.map((action) => <label className="flex items-center justify-between gap-2" key={action}>
              {midiOutputActions[action]}
              <input key={settings.notes[action] ?? 'empty'} className="input-field w-20!" type="number" min={0} max={127} step={1}
                defaultValue={settings.notes[action]} onBlur={(event) => setNote(action, event.currentTarget)}
                onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
            </label>)}
          </div>
        </details>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={settings.forwardInput}
            onChange={(event) => save({ ...settings, forwardInput: event.currentTarget.checked })} />
          ส่งต่อการเปลี่ยนแปลงจาก MIDI ขาเข้า
        </label>
        {settings.forwardInput && <p>ใช้พอร์ตขาเข้าและขาออกแยกกัน และปิดขาออกของเครื่องที่ตาม เพื่อป้องกันคำสั่งวนกลับ</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" aria-pressed={armed}
            disabled={!armed && (!output || !Object.keys(settings.notes).length || !groupKeys.some((group) => settings.groups[group]))}
            onClick={() => {
              if (armed) stop()
              else if (output?.state === 'connected') {
                activePort.current = output
                setError('')
                setStatus('')
                setArmed(true)
              }
            }}>{armed ? 'ปิดส่ง MIDI' : 'เปิดส่ง MIDI'}</button>
          <button type="button" className="btn-secondary" disabled={!armed} onClick={() => {
            const event = snapshot()
            if (event) publish(event, true)
            else setStatus('ขึ้นสไลด์หรือเลือกโหมดจอก่อนส่งสถานะปัจจุบัน')
          }}>ส่งสถานะจอปัจจุบัน</button>
        </div>
        {status && <p role="status" className="wrap-anywhere">{status}</p>}
        {error && <p role="alert" className="wrap-anywhere text-[var(--status-error-text)]">{error}</p>}
      </div>
    </details>
  )
}
