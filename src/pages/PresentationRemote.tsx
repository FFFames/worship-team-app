/** Mobile view and controls for a paired live presentation. */

import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  createRemotePhone, isPresenterMessage, openRemoteMessage, parseRemoteInvite, remotePulseMs, remoteTimeoutMs,
  sealRemoteMessage, type PhoneMessage, type RemoteCommand, type RemoteSnapshot,
} from '../utils/presentationRemote'
import { connectPresentationRemote } from '../utils/presentationRemoteChannel'

type RemoteView = { access: 'view' | 'control'; snapshot: RemoteSnapshot }
const outputText = { live: 'กำลังฉาย', black: 'จอดำ', welcome: 'จอต้อนรับ', clear: 'ล้างเนื้อหา' }

export default function PresentationRemote() {
  const { hash } = useLocation()
  const sender = useRef<((command: RemoteCommand) => void) | null>(null)
  const [phase, setPhase] = useState('กำลังเชื่อมต่อ…')
  const [code, setCode] = useState('')
  const [view, setView] = useState<RemoteView | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    const invite = parseRemoteInvite(hash)
    setView(null)
    setCode('')
    setBusy(false)
    setFeedback('')
    if (!invite) { setPhase('เปิดลิงก์หรือสแกน QR จากเครื่องฉายเพื่อจับคู่'); return }

    setPhase('กำลังเชื่อมต่อ…')
    let stopped = false
    let ended = false
    let ready = false
    let heartbeat = 0
    let sequence = 0
    let helloSequence = 0
    let lastState = -1
    let lastSeen = 0
    let grant = ''
    let waiting: { sequence: number; timer: number } | null = null
    let channel: ReturnType<typeof connectPresentationRemote> | undefined

    function clearWaiting() {
      if (waiting) window.clearTimeout(waiting.timer)
      waiting = null
    }

    function deactivate(text: string) {
      ready = false
      grant = ''
      clearWaiting()
      setPhase(text)
      setView(null)
      setBusy(false)
    }

    void createRemotePhone(invite).then((phone) => {
      if (stopped) return
      setCode(phone.code)
      async function send(message: PhoneMessage) {
        const packet = await sealRemoteMessage(phone.cipher, 'phone', phone.peer, message)
        return channel?.send(packet)
      }
      const hello = () => { void send({ type: 'hello', sequence: ++helloSequence }).catch(() => {}) }

      channel = connectPresentationRemote(phone.topic, 'phone', async (packet) => {
        if (packet.peer !== phone.peer) return
        const message = await openRemoteMessage(phone.cipher, 'presenter', packet)
        if (stopped || ended || !ready || !isPresenterMessage(message)) return
        if (message.type === 'ended') {
          ended = true
          deactivate(message.reason === 'removed' ? 'เครื่องฉายยกเลิกการจับคู่กับอุปกรณ์นี้' : 'เครื่องฉายปิดรีโมตแล้ว')
          setCode('')
          window.clearInterval(heartbeat)
          channel?.close()
          return
        }
        if (message.type === 'ack') {
          if (waiting?.sequence !== message.command) return
          clearWaiting()
          setBusy(false)
          if (!message.applied) setFeedback('เครื่องฉายไม่ได้ใช้คำสั่งนี้')
          return
        }
        if (message.sequence <= lastState) return
        lastState = message.sequence
        lastSeen = Date.now()
        grant = message.access === 'control' ? message.grant : ''
        if (message.access === 'pending') {
          setPhase('รอผู้ควบคุมยืนยันรหัสจับคู่')
          setView(null)
        } else {
          setView({ access: message.access, snapshot: message.snapshot })
          setPhase(message.access === 'view' ? 'ดูสไลด์' : 'ควบคุมสไลด์')
        }
      }, (connected) => {
        if (stopped || ended) return
        if (!connected) {
          deactivate('การเชื่อมต่อขาดหาย กำลังเชื่อมต่อใหม่…')
          return
        }
        ready = true
        setPhase('กำลังรอเครื่องฉาย…')
        hello()
      })

      sender.current = (command) => {
        if (!ready || !grant || waiting || Date.now() - lastSeen > remoteTimeoutMs) return
        const commandSequence = ++sequence
        setBusy(true)
        setFeedback('')
        const fail = () => {
          if (waiting?.sequence !== commandSequence) return
          clearWaiting()
          setBusy(false)
          setFeedback('เครื่องฉายยังไม่ได้ยืนยันคำสั่ง')
        }
        waiting = { sequence: commandSequence, timer: window.setTimeout(fail, remoteTimeoutMs) }
        void send({ type: 'command', sequence: commandSequence, grant, command }).then((ok) => {
          if (!ok) fail()
        }).catch(fail)
      }

      heartbeat = window.setInterval(() => {
        if (!ready) return
        hello()
        if (lastSeen && Date.now() - lastSeen > remoteTimeoutMs) {
          lastSeen = 0
          grant = ''
          setView(null)
          setPhase('เครื่องฉายไม่ตอบสนอง กำลังรอเชื่อมต่อใหม่…')
        }
      }, remotePulseMs)
    }).catch(() => { if (!stopped) setPhase('เปิดลิงก์จับคู่ไม่ได้ ตรวจว่าเบราว์เซอร์รองรับการเข้ารหัสและใช้ HTTPS') })

    return () => {
      stopped = true
      clearWaiting()
      window.clearInterval(heartbeat)
      channel?.close()
      sender.current = null
    }
  }, [hash])

  const snapshot = view?.snapshot
  const canControl = view?.access === 'control' && !busy
  function send(command: RemoteCommand) { sender.current?.(command) }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 bg-[var(--bg-primary)] px-4! py-6!">
      <header>
        <h1 className="text-2xl font-semibold">รีโมต WorshipTeam</h1>
        <p role="status" className="mt-1! text-sm text-[var(--fg-secondary)]">{phase}</p>
      </header>
      {!snapshot && code && <section aria-label="รหัสจับคู่" className="rounded-xl border border-[var(--border-subtle)] p-4!">
        <p className="text-sm text-[var(--fg-secondary)]">รหัสจับคู่บนเครื่องฉาย</p>
        <p className="mt-1! font-mono text-3xl tracking-widest">{code}</p>
      </section>}
      {snapshot && <>
        <section className="flex flex-col gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4!">
          <p className="text-sm text-[var(--fg-secondary)]">{snapshot.title} · {outputText[snapshot.output]}</p>
          <h2 className="text-lg font-medium wrap-anywhere">{snapshot.cues.find((cue) => cue.index === snapshot.cue)?.title ?? 'ยังไม่มีรายการ'}</h2>
          {snapshot.slides[snapshot.slide] && <p className="text-sm text-[var(--fg-secondary)]">{snapshot.slides[snapshot.slide]}</p>}
          {snapshot.output === 'live' && snapshot.lines.length > 0 && <p className="whitespace-pre-wrap text-base wrap-anywhere">{snapshot.lines.join('\n')}</p>}
          {snapshot.slides[snapshot.slide + 1] && <p className="text-sm text-[var(--fg-secondary)]">ถัดไป · {snapshot.slides[snapshot.slide + 1]}</p>}
        </section>
        {view.access === 'control' && <section aria-label="ควบคุมเครื่องฉาย" className="grid grid-cols-2 gap-3">
          <button type="button" className="btn-secondary min-h-12" disabled={!canControl || (snapshot.cue === snapshot.cues[0]?.index && snapshot.slide === 0)}
            onClick={() => send({ type: 'step', delta: -1 })}>ก่อนหน้า</button>
          <button type="button" className="btn-primary min-h-12" disabled={!canControl || !snapshot.cues.length
            || (snapshot.cue === snapshot.cues[snapshot.cues.length - 1]?.index && snapshot.slide >= snapshot.slides.length - 1)}
            onClick={() => send({ type: 'step', delta: 1 })}>ถัดไป</button>
          <button type="button" className="btn-secondary col-span-2 min-h-12" disabled={!canControl}
            onClick={() => send({ type: snapshot.output === 'black' ? 'resume' : 'black' })}>
            {snapshot.output === 'black' ? 'คืนภาพ' : 'จอดำ'}
          </button>
        </section>}
        {feedback && <p role="status" className="text-sm">{feedback}</p>}
        <details className="rounded-xl border border-[var(--border-subtle)] p-3!">
          <summary className="cursor-pointer font-medium">สไลด์ในรายการนี้</summary>
          <ol className="mt-2! grid gap-2">
            {snapshot.slides.map((label, index) => <li key={index}>
              {view.access === 'view' ? <p className="py-2!">{label}</p> : <button type="button"
                className="btn-secondary min-h-11 w-full justify-start text-left" disabled={!canControl}
                aria-current={index === snapshot.slide ? 'true' : undefined}
                onClick={() => send({ type: 'slide', cue: snapshot.cue, index })}>{label}</button>}
            </li>)}
          </ol>
        </details>
        <details className="rounded-xl border border-[var(--border-subtle)] p-3!">
          <summary className="cursor-pointer font-medium">รายการนำเสนอ</summary>
          <ol className="mt-2! grid gap-2">
            {snapshot.cues.map((cue) => <li key={cue.index}>
              {view.access === 'view' ? <p className="py-2!">{cue.title}</p> : <button type="button"
                className="btn-secondary min-h-11 w-full justify-start text-left" disabled={!canControl}
                aria-current={cue.index === snapshot.cue ? 'true' : undefined}
                onClick={() => send({ type: 'cue', index: cue.index })}>{cue.title}</button>}
            </li>)}
          </ol>
        </details>
      </>}
    </main>
  )
}
