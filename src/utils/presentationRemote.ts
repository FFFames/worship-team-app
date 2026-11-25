/** Pairs a phone with a presenter and encrypts messages over Realtime Broadcast. */

export type RemoteAccess = 'pending' | 'view' | 'control'
export type RemoteCommand =
  | { type: 'step'; delta: -1 | 1 }
  | { type: 'cue'; index: number }
  | { type: 'slide'; cue: number; index: number }
  | { type: 'black' | 'resume' }

export type RemoteSnapshot = {
  title: string
  cues: { index: number; title: string }[]
  cue: number
  slide: number
  slides: string[]
  lines: string[]
  output: 'live' | 'black' | 'welcome' | 'clear'
}

export type PhoneMessage = { type: 'hello'; sequence: number }
  | { type: 'command'; sequence: number; grant: string; command: RemoteCommand }
export type PresenterMessage =
  | { type: 'state'; sequence: number; access: 'pending' }
  | { type: 'state'; sequence: number; access: 'view'; snapshot: RemoteSnapshot }
  | { type: 'state'; sequence: number; access: 'control'; snapshot: RemoteSnapshot; grant: string }
  | { type: 'ack'; command: number; applied: boolean }
  | { type: 'ended'; reason?: 'removed' | 'closed' }

export type RemotePacket = { peer: string; iv: string; data: string }
export type RemoteSide = 'presenter' | 'phone'
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const protocol = 'worshipteam-presentation-remote-v1'
export const remotePulseMs = 2_500
export const remoteTimeoutMs = 9_000

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function base64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function unbase64(value: string) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0))
}

const publicKeyPattern = /^[\w-]{87}$/
const secretPattern = /^[\w-]{43}$/

export function parseRemoteInvite(fragment: string) {
  const [version, secret, hostKey, extra] = fragment.replace(/^#/, '').split('.')
  if (version !== '1' || !secretPattern.test(secret ?? '') || !publicKeyPattern.test(hostKey ?? '') || extra !== undefined) return undefined
  return { secret, hostKey }
}

type Invite = NonNullable<ReturnType<typeof parseRemoteInvite>>

async function topicFor(invite: Invite) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${protocol}.${invite.secret}.${invite.hostKey}`))
  return `presentation-remote:${hex(new Uint8Array(digest))}`
}

async function generateRemoteKeys() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
  const publicKey = base64(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)))
  return { privateKey: keys.privateKey, publicKey }
}

async function createCipher(privateKey: CryptoKey, publicKey: string, invite: Invite) {
  const remoteKey = await crypto.subtle.importKey('raw', unbase64(publicKey), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: remoteKey }, privateKey, 256)
  const material = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey({
    name: 'HKDF', hash: 'SHA-256', salt: unbase64(invite.secret), info: encoder.encode(protocol),
  }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function createRemoteInvite() {
  const host = await generateRemoteKeys()
  const invite = { secret: base64(crypto.getRandomValues(new Uint8Array(32))), hostKey: host.publicKey }
  return {
    token: `1.${invite.secret}.${invite.hostKey}`,
    topic: await topicFor(invite),
    cipherFor: (peer: string) => createCipher(host.privateKey, peer, invite),
  }
}

export async function createRemotePhone(invite: Invite) {
  const { privateKey, publicKey: peer } = await generateRemoteKeys()
  return {
    peer,
    code: await remotePairCode(peer),
    topic: await topicFor(invite),
    cipher: await createCipher(privateKey, invite.hostKey, invite),
  }
}

export async function remotePairCode(peer: string) {
  const digest = await crypto.subtle.digest('SHA-256', unbase64(peer))
  return String(new DataView(digest).getUint32(0) % 1_000_000).padStart(6, '0')
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function validRemotePacket(value: unknown): value is RemotePacket {
  return record(value) && typeof value.peer === 'string' && publicKeyPattern.test(value.peer)
    && typeof value.iv === 'string' && /^[\w-]{16}$/.test(value.iv)
    && typeof value.data === 'string' && value.data.length >= 22 && value.data.length <= 240_000
}

export async function sealRemoteMessage(cipher: CryptoKey, side: RemoteSide, peer: string, message: PhoneMessage | PresenterMessage) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = await crypto.subtle.encrypt({
    name: 'AES-GCM', iv, additionalData: encoder.encode(`${protocol}:${side}:${peer}`),
  }, cipher, encoder.encode(JSON.stringify(message)))
  return { peer, iv: base64(iv), data: base64(new Uint8Array(sealed)) }
}

export async function openRemoteMessage(cipher: CryptoKey, side: RemoteSide, packet: RemotePacket): Promise<unknown> {
  try {
    const value = await crypto.subtle.decrypt({
      name: 'AES-GCM', iv: unbase64(packet.iv), additionalData: encoder.encode(`${protocol}:${side}:${packet.peer}`),
    }, cipher, unbase64(packet.data))
    return JSON.parse(decoder.decode(value))
  } catch {
    return undefined
  }
}

function index(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function remoteCommand(value: unknown): value is RemoteCommand {
  if (!record(value)) return false
  switch (value.type) {
    case 'step': return value.delta === -1 || value.delta === 1
    case 'cue': return index(value.index)
    case 'slide': return index(value.cue) && index(value.index)
    case 'black':
    case 'resume': return true
    default: return false
  }
}

function validGrant(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value)
}

export function isPhoneMessage(value: unknown): value is PhoneMessage {
  return record(value) && index(value.sequence)
    && (value.type === 'hello' || (value.type === 'command' && validGrant(value.grant) && remoteCommand(value.command)))
}

function isRemoteSnapshot(value: unknown): value is RemoteSnapshot {
  if (!record(value)) return false
  return typeof value.title === 'string' && index(value.cue) && index(value.slide)
    && Array.isArray(value.cues) && value.cues.every((cue) => record(cue) && index(cue.index) && typeof cue.title === 'string')
    && Array.isArray(value.slides) && value.slides.every((slide) => typeof slide === 'string')
    && Array.isArray(value.lines) && value.lines.every((line) => typeof line === 'string')
    && (value.output === 'live' || value.output === 'black' || value.output === 'welcome' || value.output === 'clear')
}

export function isPresenterMessage(value: unknown): value is PresenterMessage {
  if (!record(value)) return false
  if (value.type === 'ended') return value.reason === undefined || value.reason === 'removed' || value.reason === 'closed'
  if (value.type === 'ack') return index(value.command) && typeof value.applied === 'boolean'
  return value.type === 'state' && index(value.sequence) && (value.access === 'pending'
    || ((value.access === 'view' || (value.access === 'control' && validGrant(value.grant))) && isRemoteSnapshot(value.snapshot)))
}
