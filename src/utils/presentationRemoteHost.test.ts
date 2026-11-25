import { afterEach, expect, it, vi } from 'vitest'
import {
  createRemotePhone, isPresenterMessage, openRemoteMessage, parseRemoteInvite, sealRemoteMessage,
  type PhoneMessage, type PresenterMessage, type RemotePacket,
} from './presentationRemote'
import { createPresentationRemoteHost, type RemoteDeviceStatus } from './presentationRemoteHost'

const channels = new Map<string, {
  receive: (packet: RemotePacket) => void
  status: (ready: boolean) => void
  packets: RemotePacket[]
}>()

vi.mock('./presentationRemoteChannel', () => ({
  connectPresentationRemote(topic: string, _side: string, receive: (packet: RemotePacket) => void, status: (ready: boolean) => void) {
    const packets: RemotePacket[] = []
    channels.set(topic, { receive, status, packets })
    queueMicrotask(() => status(true))
    return {
      async send(packet: RemotePacket) { packets.push(packet); return true },
      close() { channels.delete(topic) },
    }
  },
}))

afterEach(() => vi.unstubAllGlobals())

it('keeps commands serialized across phones and rejects a delayed command from a downgraded phone', async () => {
  vi.stubGlobal('window', { setInterval, clearInterval })
  let devices: RemoteDeviceStatus[] = []
  let completeCommand!: (success: boolean) => void
  const execute = vi.fn().mockImplementationOnce(() => new Promise<boolean>((resolve) => { completeCommand = resolve }))
    .mockResolvedValue(true)
  const host = createPresentationRemoteHost(
    () => ({ title: 'Service', cues: [], cue: 0, slide: 0, slides: [], lines: [], output: 'live' }),
    execute, (next) => { devices = next },
  )

  async function pairPhone() {
    await host.invite()
    const device = devices[devices.length - 1]
    const phone = await createRemotePhone(parseRemoteInvite(device.token!)!)
    const channel = channels.get(phone.topic)!
    async function packet(message: PhoneMessage) {
      return sealRemoteMessage(phone.cipher, 'phone', phone.peer, message)
    }
    async function waitForMessage<T extends PresenterMessage>(predicate: (message: PresenterMessage) => message is T) {
      return vi.waitFor(async () => {
        const matching = (await Promise.all(channel.packets.map((entry) => openRemoteMessage(phone.cipher, 'presenter', entry))))
          .filter(isPresenterMessage).reverse().find(predicate)
        expect(matching).toBeDefined()
        return matching!
      })
    }
    channel.receive(await packet({ type: 'hello', sequence: 1 }))
    await vi.waitFor(() => expect(devices.find(({ id }) => id === device.id)?.phone?.access).toBe('pending'))
    host.grant(device.id, 'control')
    const { grant } = await waitForMessage((message): message is Extract<PresenterMessage, { access: 'control' }> =>
      message.type === 'state' && message.access === 'control')
    return {
      id: device.id, setConnection: channel.status,
      async send(sequence: number) {
        channel.receive(await packet({ type: 'command', sequence, grant, command: { type: 'black' } }))
      },
      ack: (command: number) => waitForMessage((message): message is Extract<PresenterMessage, { type: 'ack' }> =>
        message.type === 'ack' && message.command === command),
    }
  }

  try {
    const first = await pairPhone()
    const second = await pairPhone()

    await first.send(1)
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
    await second.send(1)
    expect(await second.ack(1)).toMatchObject({ applied: false })
    completeCommand(true)
    expect(await first.ack(1)).toMatchObject({ applied: true })

    first.setConnection(false)
    host.grant(first.id, 'view')
    expect(devices.find(({ id }) => id === first.id)?.phone?.access).toBe('view')
    first.setConnection(true)
    await first.send(2)
    expect(await first.ack(2)).toMatchObject({ applied: false })
    await second.send(2)
    expect(await second.ack(2)).toMatchObject({ applied: true })
    expect(execute).toHaveBeenCalledTimes(2)
  } finally {
    host.close()
  }
})
