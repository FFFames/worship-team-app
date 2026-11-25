/** Validates live URLs and keeps camera preferences local to this browser. */

import type { PlaylistCue, PlaylistCueAsset } from '../types/database'
import type { CameraInput, FeedAsset, FeedSound, FeedVideo, LiveFeed } from '../types/liveFeed'
import type { DesignLayer, SlideDesign } from '../types/slideDesign'

export function presentationWebUrl(value: string | undefined): string | undefined {
  if (typeof value !== 'string' || value.length > 4096) return undefined
  try {
    const url = new URL(value.trim())
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) {
      return url.href
    }
  } catch {
    return undefined
  }
  return undefined
}

export function webPlaylistCue(label: string, url: string, hideScrollbars: boolean): PlaylistCue {
  const asset: PlaylistCueAsset = { kind: 'web', filename: label, role: 'foreground', url,
    ...(hideScrollbars ? { hideScrollbars: true } : {}) }
  return { kind: 'web', label, slides: [{ label, lines: [], assets: [asset] }] }
}

export function cameraInputKey(playlistId: string, asset: Pick<PlaylistCueAsset, 'filename' | 'feedId'>): string {
  return 'worshipteam:camera:' + JSON.stringify(asset.feedId
    ? ['library-feed', asset.feedId] : [playlistId, asset.filename.trim().toLowerCase()])
}

export function designCameraAssets(design?: SlideDesign) {
  return design?.layers.flatMap((layer) => layer.kind === 'camera' ? [layer.asset] : []) ?? []
}

export function cameraLayerKey(layerId: string) {
  return `camera-layer:${layerId}`
}

export function savedCameraInput(key: string): CameraInput | undefined {
  try {
    const stored = localStorage.getItem(key)
    if (!stored) return undefined
    if (!stored.startsWith('{')) return { deviceId: stored }
    const value = JSON.parse(stored) as Partial<CameraInput>
    if (typeof value.deviceId !== 'string' || !value.deviceId) return undefined
    const audioDeviceId = typeof value.audioDeviceId === 'string' && value.audioDeviceId ? value.audioDeviceId : undefined
    return { deviceId: value.deviceId, audioLevel: feedAudioLevel(value.audioLevel), ...(audioDeviceId ? { audioDeviceId } : {}) }
  } catch {
    return undefined
  }
}

export function saveCameraInput(key: string, input: CameraInput): void {
  try {
    localStorage.setItem(key, JSON.stringify(input))
  } catch {
    // The caller can still use the device during this session.
  }
}

export function feedAudioLevel(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : undefined
}

export function importedFeedSound(feed: LiveFeed): FeedSound | undefined {
  const mute = feed.metadata?.mute
  const level = feedAudioLevel(feed.metadata?.volume)
  if (mute === 0 || mute === 1 || level !== undefined) return { muted: mute !== 0, level: level ?? 100 }
}

export function feedDimension(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 32768 ? value : undefined
}

export function feedFrameRate(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.1 && value <= 1000 ? value : undefined
}

export function feedObjectFit(fit: FeedVideo['fit'], background: boolean) {
  return fit === 'contain' || fit === 'cover' || fit === 'fill' ? fit : background ? 'cover' : 'contain'
}

export function liveFeedAsset(feed: LiveFeed, role: 'foreground' | 'background'): FeedAsset {
  const feedSound = importedFeedSound(feed)
  const audioDeviceHint = feed.metadata?.audioDeviceNames
  const width = feedDimension(feed.metadata?.width)
  const height = feedDimension(feed.metadata?.height)
  const frameRate = feedFrameRate(feed.metadata?.frameRate)
  const aspect = feed.metadata?.aspectType
  const fit = typeof aspect === 'number' ? (['auto', 'contain', 'fill', 'cover'] as const)[aspect] : undefined
  const feedVideo = width !== undefined || height !== undefined || frameRate !== undefined || fit
    ? { width, height, frameRate, fit } : undefined
  return { kind: 'camera', filename: feed.name, role, feedId: feed.id,
    ...(feed.deviceHints.length ? { deviceHints: feed.deviceHints } : {}),
    ...(typeof audioDeviceHint === 'string' && audioDeviceHint ? { audioDeviceHint } : {}),
    ...(feedSound ? { feedSound } : {}), ...(feedVideo ? { feedVideo } : {}) }
}

export function positionedFeedLayer(feed: LiveFeed): Extract<DesignLayer, { kind: 'camera' }> {
  return { id: crypto.randomUUID(), kind: 'camera', asset: liveFeedAsset(feed, 'foreground'),
    frame: { x: .62, y: .08, width: .3, height: .3 } }
}

export function cameraConstraints(deviceId = 'default', feedVideo?: FeedVideo): MediaStreamConstraints {
  const video: MediaTrackConstraints = deviceId === 'default' ? {} : { deviceId: { exact: deviceId } }
  const width = feedDimension(feedVideo?.width)
  const height = feedDimension(feedVideo?.height)
  const frameRate = feedFrameRate(feedVideo?.frameRate)
  if (width !== undefined) video.width = { ideal: width }
  if (height !== undefined) video.height = { ideal: height }
  if (frameRate !== undefined) video.frameRate = { ideal: frameRate }
  return { audio: false, video: Object.keys(video).length ? video : true }
}

export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : undefined
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'กรุณาอนุญาตให้เบราว์เซอร์ใช้กล้อง'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'ไม่พบกล้องที่เลือก กรุณาเชื่อมต่อหรือเลือกกล้องอีกครั้ง'
  if (name === 'NotReadableError') return 'เปิดกล้องไม่ได้ กรุณาตรวจว่ากล้องพร้อมใช้งานและปิดแอปอื่นที่กำลังใช้กล้อง'
  return 'เปิดกล้องไม่สำเร็จ กรุณาตรวจการตั้งค่ากล้องในเบราว์เซอร์'
}

export function microphoneConstraints(deviceId = 'default'): MediaStreamConstraints {
  return {
    video: false,
    audio: {
      ...(deviceId === 'default' ? {} : { deviceId: { exact: deviceId } }),
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  }
}

export function microphoneErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : undefined
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'กรุณาอนุญาตให้เบราว์เซอร์ใช้ไมโครโฟน'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'ไม่พบไมโครโฟนที่เลือก กรุณาเชื่อมต่อหรือเลือกไมโครโฟนอีกครั้ง'
  if (name === 'NotReadableError') return 'เปิดไมโครโฟนไม่ได้ กรุณาตรวจการเชื่อมต่อและแอปที่กำลังใช้งาน'
  return 'เปิดไมโครโฟนไม่สำเร็จ กรุณาตรวจการตั้งค่าเสียงในเบราว์เซอร์'
}
