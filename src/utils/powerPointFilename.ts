/** Identifies PowerPoint filenames in local files and EasyWorship resource records. */

export const maxPackedPowerPointBytes = 128 * 1024 * 1024
export const powerPointOpenXmlMime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

export function isLegacyPowerPoint(path: string): boolean {
  return /\.ppt$/i.test(powerPointFilename(path))
}

export function modernPowerPointName(path: string): string {
  return powerPointFilename(path).replace(/\.ppt$/i, '.pptx')
}

export function hasPowerPointCompoundHeader(bytes: Uint8Array): boolean {
  return [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((byte, index) => bytes[index] === byte)
}

export function powerPointFilename(path: string): string {
  return path.replace(/\\/g, '/').replace(/^<[^<>/]+>\/?/, '').split('/').pop()?.trim() || 'PowerPoint'
}

export function isPowerPointFilename(path: string): boolean {
  return /\.pptx?$/i.test(powerPointFilename(path))
}
