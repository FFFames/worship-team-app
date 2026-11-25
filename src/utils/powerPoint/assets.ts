/** Safe, package-local PowerPoint media helpers. */

export type PowerPointAsset = {
  sourcePath: string
  filename: string
  mime: string
  bytes: Uint8Array
}

const MIME_BY_EXTENSION: Record<string, string> = {
  bmp: 'image/bmp', gif: 'image/gif', jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png',
  svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff', webp: 'image/webp',
  aac: 'audio/aac', flac: 'audio/flac', m4a: 'audio/mp4', mp3: 'audio/mpeg', oga: 'audio/ogg', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav',
  m4v: 'video/x-m4v', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', wmv: 'video/x-ms-wmv',
}

export function powerPointAssetMime(path: string): string | undefined {
  const extension = path.split('.').pop()?.toLowerCase()
  return extension ? MIME_BY_EXTENSION[extension] : undefined
}

export function isPowerPointMediaMime(mime: string | undefined): boolean {
  return Boolean(mime && (mime.startsWith('image/') || mime.startsWith('audio/') || mime.startsWith('video/')))
}

export function powerPointAssetName(path: string): string {
  return path.split('/').pop() ?? path
}
