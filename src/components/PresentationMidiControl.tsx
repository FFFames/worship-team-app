/** Pairs a browser MIDI input with live presentation commands. */

import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react'
import { readEasyWorshipMidi, type EasyWorshipMidiProfiles } from '../utils/easyWorshipMidi'
import {
  easyWorshipDefaultInputNotes, assignMidiBinding, midiActionFor, midiActions, midiInputStorageKey, parseMidiMessage, readMidiPreferences, saveMidiPreferences,
  type MidiAction, type MidiBindings, type MidiPreferences,
} from '../utils/midiControls'

import type { MidiDisplayEvent, MidiOutputEmitter } from '../utils/midiOutput'
import { PresentationMidiOutput } from './PresentationMidiOutput'

const actions = Object.keys(midiActions) as MidiAction[]

export function PresentationMidiControl({ execute, queued, emitter, snapshot }: {
  execute: (action: MidiAction, value: number, followMaster: boolean) => void | Promise<void>
  queued?: string
  emitter: RefObject<MidiOutputEmitter | null>
  snapshot: () => MidiDisplayEvent | undefined
}) {
  const [settings, setSettings] = useState(readMidiPreferences)
  const [access, setAccess] = useState<MIDIAccess>()
  const [inputs, setInputs] = useState<MIDIInput[]>([])
  const [connecting, setConnecting] = useState(false)
  const [armed, setArmed] = useState(false)
  const [learning, setLearning] = useState<MidiAction>()
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [profiles, setProfiles] = useState<EasyWorshipMidiProfiles>({ inputs: [], outputs: [] })
  const [profileId, setProfileId] = useState('')
  const [reading, setReading] = useState(false)
  const lifecycle = useRef(0)
  const current = useRef({ settings, execute, armed, learning })
  const input = inputs.find((candidate) => candidate.id === settings.inputId)
  const profile = profiles.inputs.find((candidate) => candidate.id === profileId)
  const bindingsCount = Object.keys(settings.bindings).length
  const supported = typeof navigator.requestMIDIAccess === 'function'

  useEffect(() => {
    current.current.execute = execute
  }, [execute])

  useEffect(() => {
    lifecycle.current++
    function stopListening() {
      current.current.armed = false
      current.current.learning = undefined
      setArmed(false)
      setLearning(undefined)
    }
    function syncSettings(event: StorageEvent) {
      if (event.key !== midiInputStorageKey && event.key !== null) return
      const wasListening = current.current.armed || current.current.learning !== undefined
      stopListening()
      const next = readMidiPreferences()
      current.current.settings = next
      setSettings(next)
      if (wasListening) setStatus('อัปเดตการจับคู่แล้ว เปิดรับ MIDI อีกครั้งเมื่อพร้อม')
    }
    window.addEventListener('pagehide', stopListening)
    window.addEventListener('storage', syncSettings)
    return () => {
      lifecycle.current++
      window.removeEventListener('pagehide', stopListening)
      window.removeEventListener('storage', syncSettings)
    }
  }, [])

  useEffect(() => {
    if (!access) { setInputs([]); return }
    function refresh() {
      if (access) setInputs([...access.inputs.values()].filter((port) => port.state === 'connected'))
    }
    refresh()
    access.addEventListener('statechange', refresh)
    return () => access.removeEventListener('statechange', refresh)
  }, [access])

  function save(next: MidiPreferences) {
    current.current.settings = next
    setSettings(next)
    try {
      saveMidiPreferences(next)
      setError('')
    } catch {
      setError('เบราว์เซอร์บันทึกการจับคู่ MIDI ไม่ได้')
    }
  }

  function enable(value: boolean) {
    current.current.armed = value
    setArmed(value)
  }

  function learn(action: MidiAction | undefined) {
    current.current.learning = action
    setLearning(action)
  }

  useEffect(() => {
    if (!input) return
    let active = true
    const highControls = new Set<string>()
    function receive(event: MIDIMessageEvent) {
      if (!active || input?.state !== 'connected' || !event.data) return
      const message = parseMidiMessage(event.data)
      const configuration = current.current
      if (!message || (configuration.settings.channel !== null && message.channel !== configuration.settings.channel)) return
      if (message.kind === 'control') {
        const key = `${message.channel}:${message.number}`
        if (message.value < 64) { highControls.delete(key); return }
        if (highControls.has(key)) return
        highControls.add(key)
      }

      if (configuration.learning) {
        const action = configuration.learning
        const bindings = assignMidiBinding(configuration.settings.bindings, action, { kind: message.kind, number: message.number })
        save({ ...configuration.settings, bindings })
        learn(undefined)
        setStatus(`จับคู่ ${midiActions[action]} แล้ว`)
        return
      }

      if (!configuration.armed) return
      const action = midiActionFor(configuration.settings.bindings, message)
      if (action) void Promise.resolve(configuration.execute(action, message.value, configuration.settings.followMaster)).catch(() => {
        if (active) setError('ใช้คำสั่ง MIDI ไม่สำเร็จ')
      })
    }
    input.addEventListener('midimessage', receive)
    void input.open().catch(() => { if (active) setError('เปิดอุปกรณ์ MIDI นี้ไม่ได้') })
    return () => {
      active = false
      input.removeEventListener('midimessage', receive)
      void input.close().catch(() => {})
    }
  }, [input])

  async function connect() {
    const version = lifecycle.current
    setConnecting(true)
    setError('')
    try {
      const next = await navigator.requestMIDIAccess({ sysex: false })
      if (lifecycle.current === version) setAccess(next)
    } catch {
      if (lifecycle.current === version) setError('เข้าถึง MIDI ไม่ได้ ตรวจสิทธิ์ของเว็บไซต์ในเบราว์เซอร์แล้วลองอีกครั้ง')
    } finally {
      if (lifecycle.current === version) setConnecting(false)
    }
  }

  async function review(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setError('')
    setStatus('')
    setProfiles({ inputs: [], outputs: [] })
    setProfileId('')
    setReading(true)
    const version = lifecycle.current
    try {
      const found = await readEasyWorshipMidi(file)
      if (lifecycle.current !== version) return
      setProfiles(found)
      setProfileId(found.inputs[0]?.id ?? '')
      if (!found.inputs.length && !found.outputs.length) setStatus('ไฟล์นี้ไม่มีชุดคำสั่ง MIDI')
    } catch (cause) {
      if (lifecycle.current === version) setError(cause instanceof Error ? cause.message : 'อ่านไฟล์ตั้งค่า MIDI ไม่สำเร็จ')
    } finally {
      if (lifecycle.current === version) setReading(false)
    }
  }

  function applyImport() {
    if (!profile) return
    enable(false)
    learn(undefined)
    save({ ...settings, channel: profile.channel, bindings: profile.bindings })
    setStatus(`ใช้ชุด ${profile.name} แล้ว เลือกอุปกรณ์ MIDI บนเครื่องนี้ก่อนเปิดรับคำสั่ง`)
  }

  function applyDefaultNotes() {
    const bindings: MidiBindings = {}
    for (const action of actions) bindings[action] = { kind: 'note', number: easyWorshipDefaultInputNotes[action] }
    enable(false)
    learn(undefined)
    save({ ...settings, bindings })
    setStatus('ใช้โน้ตตั้งต้น EasyWorship แล้ว เปิดรับ MIDI เมื่อตั้งอุปกรณ์และช่องเรียบร้อย')
  }

  return (
    <details className="mb-4! rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3!">
      <summary className="cursor-pointer font-medium">ควบคุมด้วย MIDI</summary>
      <div className="mt-3! grid min-w-0 gap-3 text-sm">
        {!supported && <p>ใช้เบราว์เซอร์ที่รองรับ Web MIDI และเปิดแอปผ่าน HTTPS เพื่อเชื่อมอุปกรณ์</p>}
        {supported && !access && <button type="button" className="btn-secondary justify-self-start" disabled={connecting}
          onClick={() => void connect()}>{connecting ? 'กำลังเชื่อมต่อ…' : 'เชื่อมต่อ MIDI'}</button>}
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1">อุปกรณ์ MIDI ขาเข้า
            <select className="input-field min-w-0" aria-label="อุปกรณ์ MIDI ขาเข้า" value={settings.inputId} disabled={!access}
              onChange={(event) => {
                enable(false)
                learn(undefined)
                save({ ...settings, inputId: event.currentTarget.value })
              }}>
              <option value="">เลือกอุปกรณ์</option>
              {settings.inputId && !input && <option value={settings.inputId}>อุปกรณ์เดิมกำลังรอเชื่อมต่อ</option>}
              {inputs.map((port) => <option key={port.id} value={port.id}>{port.name || port.manufacturer || 'อุปกรณ์ MIDI'}</option>)}
            </select>
          </label>
          <label className="grid min-w-0 gap-1">ช่อง MIDI
            <select className="input-field min-w-0" aria-label="ช่อง MIDI" value={settings.channel ?? ''} onChange={(event) => {
              const value = event.currentTarget.value
              enable(false)
              learn(undefined)
              save({ ...settings, channel: value ? Number(value) : null })
            }}>
              <option value="">ทุกช่อง</option>
              {Array.from({ length: 16 }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}
            </select>
          </label>
        </div>
        {access && inputs.length === 0 && <p>กำลังรออุปกรณ์ MIDI ขาเข้า</p>}
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={settings.followMaster}
            onChange={(event) => save({ ...settings, followMaster: event.currentTarget.checked })} />
          รอสไลด์จากเครื่องหลักเมื่อขึ้นสไลด์ผ่าน MIDI
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary" disabled={!armed && (!input || !bindingsCount || Boolean(learning))}
            aria-pressed={armed} onClick={() => enable(!armed)}>{armed ? 'ปิดรับคำสั่ง MIDI' : 'เปิดรับคำสั่ง MIDI'}</button>
          {queued && <p role="status" className="wrap-anywhere">รายการที่ MIDI เลือกไว้ · {queued}</p>}
        </div>
        <details className="min-w-0 rounded-md border border-[var(--border-subtle)] p-2!">
          <summary className="cursor-pointer font-medium">จับคู่คำสั่ง · {bindingsCount} รายการ</summary>
          <button type="button" className="btn-secondary mt-2!" onClick={applyDefaultNotes}>ใช้โน้ตขาเข้าเริ่มต้นของ EasyWorship</button>
          <ul className="mt-2! grid gap-2">
            {actions.map((action) => {
              const binding = settings.bindings[action]
              return <li key={action} className="flex min-w-0 flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] pb-2!">
                <span className="mr-auto">{midiActions[action]}</span>
                <span className="text-[var(--fg-secondary)]">{binding ? `${binding.kind === 'note' ? 'Note' : 'CC'} ${binding.number}` : 'ว่าง'}</span>
                <button type="button" className="chip-btn" aria-label={`จับคู่ ${midiActions[action]}`} disabled={!input}
                  onClick={() => {
                    enable(false)
                    learn(learning === action ? undefined : action)
                    setStatus(learning === action ? '' : `กดโน้ตหรือปุ่มบนอุปกรณ์เพื่อจับคู่ ${midiActions[action]}`)
                  }}>{learning === action ? 'ยกเลิก' : 'จับคู่'}</button>
                {binding && <button type="button" className="chip-btn" aria-label={`ลบการจับคู่ ${midiActions[action]}`}
                  onClick={() => { learn(undefined); save({ ...settings, bindings: assignMidiBinding(settings.bindings, action) }) }}>ลบ</button>}
              </li>
            })}
          </ul>
        </details>
        <details className="min-w-0 rounded-md border border-[var(--border-subtle)] p-2!">
          <summary className="cursor-pointer font-medium">นำเข้าคำสั่ง MIDI จาก EasyWorship</summary>
          <label className="mt-2! grid gap-1">ไฟล์ MIDIControls.7.db
            <input type="file" accept=".db" aria-label="ไฟล์ MIDIControls.7.db" disabled={reading} onChange={(event) => void review(event)} />
          </label>
          {profiles.outputs.length > 0 && <p className="mt-2!">พบชุดขาออก {profiles.outputs.length} ชุด เปิด “ส่ง MIDI ไปยังเครื่องอื่น” เพื่อตรวจและเลือกใช้</p>}
          {profile && (
            <div className="mt-2! grid gap-2">
              <label className="grid gap-1">ชุด MIDI จาก EasyWorship
                <select className="input-field" aria-label="ชุด MIDI จาก EasyWorship" value={profileId} onChange={(event) => setProfileId(event.currentTarget.value)}>
                  {profiles.inputs.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}
                </select>
              </label>
              <p>{Object.keys(profile.bindings).length} คำสั่ง · ช่อง {profile.channel ?? 'ทั้งหมด'}{profile.skipped > 0 && ` · ข้าม ${profile.skipped} คำสั่ง`}</p>
              {profile.device && <p className="wrap-anywhere">อุปกรณ์เดิม · {profile.device}</p>}
              <details>
                <summary className="cursor-pointer">ตรวจคำสั่งในชุดนี้</summary>
                <ul className="mt-2! grid gap-1">
                  {actions.map((action) => {
                    const binding = profile.bindings[action]
                    return binding ? <li key={action}>{midiActions[action]} · Note {binding.number}</li> : null
                  })}
                </ul>
              </details>
              <button type="button" className="btn-secondary justify-self-start" disabled={!Object.keys(profile.bindings).length}
                onClick={applyImport}>ใช้ชุดคำสั่งนี้แทนการจับคู่ปัจจุบัน</button>
            </div>
          )}
        </details>
        <PresentationMidiOutput access={access} profiles={profiles.outputs} emitter={emitter} snapshot={snapshot} />
        {status && <p role="status" className="wrap-anywhere">{status}</p>}
        {error && <p role="alert" className="wrap-anywhere text-[var(--status-error-text)]">{error}</p>}
      </div>
    </details>
  )
}
