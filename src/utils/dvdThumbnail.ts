const jpegPrefix = 'data:image/jpeg;base64,'
const maxBytes = 256 * 1024

export function encodeDvdThumbnail(value: unknown): string | undefined {
  if (!(value instanceof Uint8Array) || value.length < 4 || value.length > maxBytes
    || value[0] !== 0xff || value[1] !== 0xd8 || value[2] !== 0xff) return undefined
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return jpegPrefix + btoa(binary)
}

export function dvdThumbnailUrl(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= jpegPrefix.length + 4 * Math.ceil(maxBytes / 3)
    && /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(value) ? value : undefined
}

export function captureDvdThumbnail(video: HTMLVideoElement): string | undefined {
  if (!video.videoWidth || !video.videoHeight || video.seeking || video.readyState < 2) return undefined
  const scale = Math.min(1, 320 / video.videoWidth, 240 / video.videoHeight)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) return undefined
  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  return dvdThumbnailUrl(canvas.toDataURL('image/jpeg', 0.82))
}
