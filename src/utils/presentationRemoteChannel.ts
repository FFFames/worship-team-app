/** Sends encrypted presenter packets between browsers over Supabase Realtime. */

import { supabase } from '../lib/supabase'
import { validRemotePacket, type RemotePacket, type RemoteSide } from './presentationRemote'

export function connectPresentationRemote(
  topic: string, side: RemoteSide,
  receive: (packet: RemotePacket) => void,
  connection: (ready: boolean) => void,
) {
  let ready = false
  let closed = false
  const channel = supabase.channel(topic, { config: { broadcast: { ack: true }, presence: { enabled: false } } })
    .on('broadcast', { event: side === 'presenter' ? 'phone' : 'presenter' }, ({ payload }) => {
      if (!closed && ready && validRemotePacket(payload)) receive(payload)
    })
    .subscribe((status) => {
      if (closed) return
      ready = status === 'SUBSCRIBED'
      connection(ready)
    })
  return {
    async send(packet: RemotePacket) {
      if (!closed && ready && validRemotePacket(packet)) {
        return await channel.send({ type: 'broadcast', event: side, payload: packet }) === 'ok'
      }
      return false
    },
    close() {
      closed = true
      void supabase.removeChannel(channel)
    },
  }
}
