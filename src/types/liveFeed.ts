/** A reusable live input stored on the presentation computer. */

import type { MediaMetadata } from './media'

export type LiveFeed = {
  id: string
  name: string
  deviceHints: string[]
  metadata?: MediaMetadata
}

export type CameraInput = {
  deviceId: string
  /** Local microphone for a browser camera. NDI receives audio from its source. */
  audioDeviceId?: string
  /** An absent level keeps the input silent. The level is a percentage. */
  audioLevel?: number
}

export type FeedSound = {
  muted: boolean
  level: number
}

export type FeedVideo = {
  width?: number
  height?: number
  frameRate?: number
  fit?: 'auto' | 'contain' | 'fill' | 'cover'
}

export type FeedAsset = {
  kind: 'camera'
  filename: string
  role?: 'background' | 'foreground'
  deviceHints?: string[]
  audioDeviceHint?: string
  feedId?: string
  feedSound?: FeedSound
  feedVideo?: FeedVideo
}
