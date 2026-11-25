/** Exercises the encrypted pairing and verifies closed command decoding. */

import { describe, expect, it } from 'vitest'
import {
  createRemoteInvite, createRemotePhone, isPhoneMessage, openRemoteMessage, parseRemoteInvite,
  remotePairCode, sealRemoteMessage, validRemotePacket,
} from './presentationRemote'

describe('presentation remote pairing', () => {
  it('accepts only the paired phone’s encrypted messages and rejects reflection and tampering', async () => {
    const host = await createRemoteInvite()
    const invite = parseRemoteInvite('#' + host.token)!
    const phone = await createRemotePhone(invite)
    const otherPhone = await createRemotePhone(invite)
    const hostCipher = await host.cipherFor(phone.peer)
    const message = { type: 'hello', sequence: 2 } as const
    const packet = await sealRemoteMessage(phone.cipher, 'phone', phone.peer, message)

    expect(phone.code).toBe(await remotePairCode(phone.peer))
    expect(phone.topic).toBe(host.topic)
    expect(host.topic).not.toContain(invite.secret)
    expect(validRemotePacket(packet)).toBe(true)
    expect(await openRemoteMessage(hostCipher, 'phone', packet)).toEqual(message)
    expect(await openRemoteMessage(otherPhone.cipher, 'phone', packet)).toBeUndefined()
    expect(await openRemoteMessage(hostCipher, 'presenter', packet)).toBeUndefined()
    expect(await openRemoteMessage(hostCipher, 'phone', { ...packet, peer: otherPhone.peer })).toBeUndefined()
    const corrupted = (packet.data[0] === 'A' ? 'B' : 'A') + packet.data.slice(1)
    expect(await openRemoteMessage(hostCipher, 'phone', { ...packet, data: corrupted })).toBeUndefined()
  })

  it('restricts the remote input to known commands and nonnegative indices', () => {
    const command = { type: 'command', sequence: 1, grant: crypto.randomUUID() }
    expect(isPhoneMessage({ ...command, command: { type: 'slide', cue: 2, index: 1 } })).toBe(true)
    expect(isPhoneMessage({ ...command, command: { type: 'slide', cue: -1, index: 1 } })).toBe(false)
    expect(isPhoneMessage({ ...command, command: { type: 'arbitrary' } })).toBe(false)
    expect(isPhoneMessage({ ...command, grant: '', command: { type: 'black' } })).toBe(false)
    expect(parseRemoteInvite('#1.PIN.invalid')).toBeUndefined()
  })
})
