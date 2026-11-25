/** Manages independently invited remotes for one live presentation. */

import {
  createRemoteInvite, isPhoneMessage, openRemoteMessage, remotePairCode, remotePulseMs, remoteTimeoutMs,
  sealRemoteMessage, type PresenterMessage, type RemoteAccess, type RemoteCommand, type RemotePacket, type RemoteSnapshot,
} from './presentationRemote'
import { connectPresentationRemote } from './presentationRemoteChannel'

type PairedPhone = {
  peer: string
  cipher: CryptoKey
  code: string
  access: RemoteAccess
  grant: string
  lastHello: number
  lastCommand: number
  lastSeen: number
}

type RemoteHostStatus = { connected: boolean; phone: { code: string; access: RemoteAccess; online: boolean } | null }
const initialRemoteHostStatus: RemoteHostStatus = { connected: false, phone: null }
type EndReason = 'removed' | 'closed'
type ApprovedAccess = Exclude<RemoteAccess, 'pending'>

async function startPhoneSession(
  snapshot: () => RemoteSnapshot,
  execute: (command: RemoteCommand) => boolean | Promise<boolean>,
  report: (status: RemoteHostStatus) => void,
) {
  const invite = await createRemoteInvite()
  let phone: PairedPhone | null = null
  let connected = false
  let closed = false
  let pairing = false
  let stateSequence = 0
  let previousStatus = initialRemoteHostStatus

  const online = () => phone !== null && Date.now() - phone.lastSeen < remoteTimeoutMs

  function reportStatus() {
    if (closed) return
    const status = phone ? { code: phone.code, access: phone.access, online: connected && online() } : null
    const previous = previousStatus.phone
    if (connected === previousStatus.connected && status?.code === previous?.code
      && status?.access === previous?.access && status?.online === previous?.online) return
    previousStatus = { connected, phone: status }
    report(previousStatus)
  }

  async function send(target: PairedPhone, message: PresenterMessage) {
    const packet = await sealRemoteMessage(target.cipher, 'presenter', target.peer, message)
    if (closed && message.type !== 'ended') return false
    return channel.send(packet)
  }

  function publish(readSnapshot = snapshot) {
    if (closed || !connected || !phone || !online()) return
    const sequence = ++stateSequence
    const state: PresenterMessage = phone.access === 'pending'
      ? { type: 'state', sequence, access: 'pending' }
      : phone.access === 'view' ? { type: 'state', sequence, access: 'view', snapshot: readSnapshot() }
        : { type: 'state', sequence, access: 'control', snapshot: readSnapshot(), grant: phone.grant }
    void send(phone, state).catch(() => {})
  }

  async function pair(packet: RemotePacket) {
    if (pairing) return
    pairing = true
    try {
      const cipher = await invite.cipherFor(packet.peer)
      const request = await openRemoteMessage(cipher, 'phone', packet)
      if (closed || phone || !isPhoneMessage(request) || request.type !== 'hello') return
      const code = await remotePairCode(packet.peer)
      if (closed) return
      phone = { peer: packet.peer, cipher, code, access: 'pending', grant: '', lastHello: request.sequence, lastCommand: -1, lastSeen: Date.now() }
      reportStatus()
      publish()
    } finally {
      pairing = false
    }
  }

  async function receive(packet: RemotePacket) {
    const target = phone
    if (!target) { await pair(packet); return }
    if (target.peer !== packet.peer) return
    const message = await openRemoteMessage(target.cipher, 'phone', packet)
    if (closed || !isPhoneMessage(message)) return
    if (message.type === 'hello') {
      if (message.sequence <= target.lastHello) return
      const wasOnline = online()
      target.lastSeen = Date.now()
      target.lastHello = message.sequence
      if (!wasOnline) { reportStatus(); publish() }
      return
    }
    if (message.sequence <= target.lastCommand) return
    target.lastCommand = message.sequence
    let applied = false
    if (connected && online() && target.access === 'control' && message.grant === target.grant) {
      applied = await execute(message.command)
    }
    if (!closed) await send(target, { type: 'ack', command: message.sequence, applied })
  }

  const channel = connectPresentationRemote(invite.topic, 'presenter', (packet) => {
    void receive(packet).catch(() => {})
  }, (ready) => {
    connected = ready
    reportStatus()
    if (ready) publish()
  })

  const pulse = window.setInterval(() => {
    if (!phone) return
    reportStatus()
    publish()
  }, remotePulseMs)

  return {
    token: invite.token,
    publish,
    grant(access: ApprovedAccess) {
      if (!phone || closed || phone.access === access) return
      const withdrawingControl = phone.access === 'control' && access === 'view'
      if (!withdrawingControl && (!online() || !connected)) return
      phone.access = access
      phone.grant = access === 'control' ? crypto.randomUUID() : ''
      reportStatus()
      publish()
    },
    close(reason?: EndReason) {
      if (closed) return
      closed = true
      window.clearInterval(pulse)
      // Stop accepting commands immediately. Let the last notification reach the phone if possible.
      if (reason && phone && connected) void send(phone, { type: 'ended', reason }).finally(() => channel.close()).catch(() => {})
      else channel.close()
    },
  }
}

export type RemoteDeviceStatus = RemoteHostStatus & { id: number; token?: string }
export const maxRemoteDevices = 8

export function createPresentationRemoteHost(
  snapshot: () => RemoteSnapshot,
  execute: (command: RemoteCommand) => boolean | Promise<boolean>,
  report: (devices: RemoteDeviceStatus[]) => void,
) {
  type Device = { status: RemoteDeviceStatus; session?: Awaited<ReturnType<typeof startPhoneSession>> }
  const devices = new Map<number, Device>()
  let nextId = 0
  let closed = false
  let applying = false

  function reportDevices() {
    if (!closed) report(Array.from(devices.values(), ({ status }) => status))
  }

  async function executeOnce(command: RemoteCommand) {
    if (closed || applying) return false
    applying = true
    try { return await execute(command) } catch { return false } finally { applying = false }
  }

  return {
    async invite() {
      if (closed || devices.size >= maxRemoteDevices || Array.from(devices.values()).some(({ status }) =>
        !status.phone || status.phone.access === 'pending')) return
      const id = ++nextId
      const device: Device = { status: { id, ...initialRemoteHostStatus } }
      devices.set(id, device)
      reportDevices()
      try {
        const session = await startPhoneSession(snapshot, executeOnce, (status) => {
          if (!devices.has(id)) return
          device.status = { ...device.status, ...status }
          reportDevices()
        })
        if (!devices.has(id)) { session.close(); return }
        device.session = session
        device.status = { ...device.status, token: session.token }
        reportDevices()
      } catch (error) {
        if (!devices.delete(id)) return
        reportDevices()
        throw error
      }
    },
    publish() {
      let current: RemoteSnapshot | undefined
      const readSnapshot = () => current ??= snapshot()
      for (const { session } of devices.values()) session?.publish(readSnapshot)
    },
    grant(id: number, access: ApprovedAccess) {
      devices.get(id)?.session?.grant(access)
    },
    remove(id: number) {
      const device = devices.get(id)
      if (!device) return
      devices.delete(id)
      device.session?.close('removed')
      reportDevices()
    },
    close(notify = false) {
      closed = true
      for (const { session } of devices.values()) session?.close(notify ? 'closed' : undefined)
      devices.clear()
    },
  }
}
