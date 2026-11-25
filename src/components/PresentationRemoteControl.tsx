/** Invites individual remotes and shows their presentation access. */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { createPresentationRemoteHost, maxRemoteDevices, type RemoteDeviceStatus } from '../utils/presentationRemoteHost'
import type { RemoteCommand, RemoteSnapshot } from '../utils/presentationRemote'

type Props = {
  snapshot: () => RemoteSnapshot
  execute: (command: RemoteCommand) => boolean | Promise<boolean>
}

export function PresentationRemoteControl({ snapshot, execute }: Props) {
  const host = useRef<ReturnType<typeof createPresentationRemoteHost> | null>(null)
  const callbacks = useRef({ snapshot, execute })
  const addDevice = useRef<HTMLButtonElement>(null)
  const panelTitle = useRef<HTMLElement>(null)
  const returnFocus = useRef(false)
  const [devices, setDevices] = useState<RemoteDeviceStatus[]>([])
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    callbacks.current = { snapshot, execute }
    host.current?.publish()
  }, [snapshot, execute])

  useEffect(() => {
    const dispose = () => {
      host.current?.close()
      host.current = null
    }
    function onRestore(event: PageTransitionEvent) {
      if (!event.persisted) return
      setDevices([])
      setFeedback('')
    }
    window.addEventListener('pagehide', dispose)
    window.addEventListener('pageshow', onRestore)
    return () => {
      dispose()
      window.removeEventListener('pagehide', dispose)
      window.removeEventListener('pageshow', onRestore)
    }
  }, [])

  useLayoutEffect(() => {
    if (!returnFocus.current) return
    returnFocus.current = false
    if (document.activeElement !== document.body) return
    const add = addDevice.current
    if (add && !add.disabled) add.focus()
    else panelTitle.current?.focus()
  }, [devices])

  async function start() {
    setFeedback('')
    const active = host.current ??= createPresentationRemoteHost(
      () => callbacks.current.snapshot(), (command) => callbacks.current.execute(command), setDevices,
    )
    try {
      await active.invite()
    } catch {
      if (host.current === active) setFeedback('เปิดรีโมตไม่ได้ ใช้เบราว์เซอร์ที่รองรับการเข้ารหัสและเปิดแอปผ่าน HTTPS')
    }
  }

  function stop() {
    returnFocus.current = true
    host.current?.close(true)
    host.current = null
    setDevices([])
    setFeedback('ปิดรีโมตแล้ว')
  }

  function removeDevice(id: number, approved: boolean) {
    returnFocus.current = true
    host.current?.remove(id)
    setFeedback(approved ? 'ยกเลิกการจับคู่อุปกรณ์แล้ว' : 'ยกเลิกลิงก์จับคู่แล้ว')
  }

  async function copyInvite(invite: string) {
    try {
      await navigator.clipboard.writeText(invite)
      setFeedback('คัดลอกลิงก์แล้ว')
    } catch {
      setFeedback('เลือกและคัดลอกลิงก์ด้วยตนเอง')
    }
  }

  const pending = devices.some(({ phone }) => !phone || phone.access === 'pending')
  const full = devices.length >= maxRemoteDevices
  return (
    <details className="mb-4! rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3!">
      <summary ref={panelTitle} className="cursor-pointer font-medium">รีโมตมือถือ</summary>
      <div className="mt-3! flex flex-col items-start gap-3 text-sm">
        {devices.length > 0 && <ul aria-label="อุปกรณ์รีโมต" className="grid w-full min-w-0 gap-2">
          {devices.map(({ id, phone, token, connected }) => {
            const approved = phone !== null && phone.access !== 'pending'
            const invite = token && !phone ? new URL(`/remote#${token}`, window.location.origin).href : undefined
            return <li key={id} className="min-w-0 rounded-md border border-[var(--border-subtle)] p-3!">
              <div role="group" aria-label={`อุปกรณ์ ${id}${phone ? ` รหัส ${phone.code}` : ''}`} className="grid min-w-0 gap-2">
                <p role="status"><span className="font-medium">อุปกรณ์ {id}</span>{phone && <>
                  {' · '}<span className="font-mono text-base">{phone.code}</span>{' · '}
                  {phone.access === 'pending' ? 'ตรวจรหัสบนมือถือก่อนอนุญาต' : phone.access === 'view' ? 'ดูสไลด์ได้' : 'ควบคุมสไลด์ได้'}
                  {!phone.online && ' · ขาดการเชื่อมต่อ'}
                </>}{!phone && (!token ? ' · กำลังสร้างลิงก์…' : connected ? ' · รอจับคู่' : ' · กำลังเชื่อมต่อเครือข่ายรีโมต…')}</p>
                {invite && <>
                  <p>สแกน QR หรือเปิดลิงก์บนมือถือที่ต้องการจับคู่</p>
                  <div className="w-fit max-w-full rounded-md bg-white p-2!">
                    <QRCodeCanvas value={invite} size={176} marginSize={4} aria-label="QR สำหรับจับคู่รีโมต" role="img" className="max-w-full" />
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-2">
                    <input type="url" className="input-field min-w-0 flex-1" aria-label="ลิงก์จับคู่รีโมต" readOnly value={invite}
                      onFocus={(event) => event.currentTarget.select()} />
                    <button type="button" className="btn-secondary" onClick={() => void copyInvite(invite)}>คัดลอกลิงก์</button>
                  </div>
                </>}
                <div className="flex flex-wrap gap-2">
                  {phone && <>
                    <button type="button" className="btn-secondary" disabled={!phone.online && phone.access !== 'control'} aria-pressed={phone.access === 'view'}
                      onClick={() => host.current?.grant(id, 'view')}>ให้ดูสไลด์</button>
                    <button type="button" className="btn-secondary" disabled={!phone.online} aria-pressed={phone.access === 'control'}
                      onClick={() => host.current?.grant(id, 'control')}>ให้ควบคุมสไลด์</button>
                  </>}
                  <button type="button" className="btn-secondary" onClick={() => removeDevice(id, approved)}>
                    {approved ? 'เลิกจับคู่อุปกรณ์' : 'ยกเลิกการจับคู่'}
                  </button>
                </div>
              </div>
            </li>
          })}
        </ul>}
        <div className="flex flex-wrap gap-2">
          <button ref={addDevice} type="button" className="btn-secondary" disabled={pending || full} onClick={() => void start()}>
            {devices.length ? 'จับคู่อุปกรณ์เพิ่ม' : 'เปิดการจับคู่'}
          </button>
          {devices.length > 0 && <button type="button" className="btn-secondary" onClick={stop}>ปิดรีโมต</button>}
        </div>
        {full && <p>จับคู่ได้สูงสุด {maxRemoteDevices} เครื่อง</p>}
        {feedback && <p role="status">{feedback}</p>}
      </div>
    </details>
  )
}
