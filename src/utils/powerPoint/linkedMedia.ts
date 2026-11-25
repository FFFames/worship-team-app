/** Matches a PowerPoint media link against files the operator supplied. */

import { mediaFileHash } from '../importIdentity'
import { libraryMediaMime } from '../mediaLibrary'

export const linkedPowerPointMediaPrefix = '/linked-powerpoint/'
const recoveryNotice = 'กู้สื่อ PowerPoint ที่ลิงก์ไว้ '
const onlineVideoNotice = 'นำเข้าวิดีโอ YouTube หรือ Vimeo จาก PowerPoint '
const mediaLinkWarnings = ['สื่อ PowerPoint ที่ลิงก์ภายนอก', 'ไม่พบไฟล์สื่อ PowerPoint ที่ลิงก์ไว้',
  'พบสื่อ PowerPoint ชื่อซ้ำ', 'อ่านสื่อ PowerPoint ที่ลิงก์ไว้ไม่ได้', recoveryNotice, onlineVideoNotice]

export function linkedPowerPointMediaNotice(count: number) {
  return `${recoveryNotice}${count} รายการ`
}

export function powerPointOnlineVideoNotice(count: number) {
  return `${onlineVideoNotice}${count} รายการ เปิดจากจอผู้ชมและต้องใช้อินเทอร์เน็ต`
}

export function refreshLinkedPowerPointMediaWarnings(saved: readonly string[], incoming: readonly string[], prefix = '') {
  const isLinked = (warning: string) => mediaLinkWarnings.some((start) => warning.startsWith(prefix + start))
  return [...new Set([...saved.filter((warning) => !isLinked(warning)), ...incoming.filter(isLinked)])]
}

export type PowerPointMediaCandidate = {
  path: string
  filename: string
  readFile: () => Promise<Blob>
  expectedHash?: string
}
type MediaMatch = { blob: Blob; hash: string }
type MediaLinkResult = { match: MediaMatch } | { warning: string }
export type PowerPointMediaLinkResolver = (target: string) => Promise<MediaLinkResult>

function pathSegments(path: string) {
  const segments: string[] = []
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (part === '..') segments.pop()
    else if (part && part !== '.') segments.push(part)
  }
  return segments
}

export function powerPointFileLink(target: string) {
  const raw = target.trim()
  const uri = /^file:/i.test(raw)
  const drive = /^[a-z]:[/\\]/i.test(raw)
  if (!raw || raw.length > 4096 || (!uri && !drive && /^[a-z][\w+.-]*:/i.test(raw))) return undefined
  let decoded = raw
  if (uri || raw.includes('%')) {
    try { decoded = decodeURIComponent(uri ? raw.replace(/[?#].*$/, '') : raw) } catch { return undefined }
  }
  const path = decoded.replace(/^file:/i, '')
  if (/[\u0000-\u001f]/.test(path) || (!uri && !drive && /^[a-z][\w+.-]*:/i.test(path))) return undefined
  const pieces = pathSegments(path)
  const filename = pieces[pieces.length - 1]
  const mime = filename && libraryMediaMime(filename)
  if (!mime || (!mime.startsWith('audio/') && !mime.startsWith('video/'))) return undefined
  return { filename, pieces: pieces.map((part) => part.normalize('NFC').toLowerCase()) }
}

export function suppliedPowerPointMedia(files: readonly File[]): PowerPointMediaCandidate[] {
  return files.map((file) => ({ path: file.webkitRelativePath || file.name, filename: file.name, readFile: async () => file }))
}

export function createPowerPointMediaResolver(candidates: readonly PowerPointMediaCandidate[]): PowerPointMediaLinkResolver {
  const index = new Map<string, { file: PowerPointMediaCandidate; path: string[] }[]>()
  for (const file of candidates) {
    const filename = file.filename.normalize('NFC').toLowerCase()
    const mime = libraryMediaMime(filename)
    if (!mime?.startsWith('video/') && !mime?.startsWith('audio/')) continue
    const files = index.get(filename) ?? []
    files.push({ file, path: pathSegments(file.path.normalize('NFC').toLowerCase()) })
    index.set(filename, files)
  }
  const inspected = new Map<PowerPointMediaCandidate, Promise<MediaMatch | undefined>>()
  const resolutions = new Map<string, Promise<MediaLinkResult>>()
  return (target) => {
    const known = resolutions.get(target)
    if (known) return known
    const result = resolve(target)
    resolutions.set(target, result)
    return result
  }

  async function resolve(target: string): Promise<MediaLinkResult> {
    const link = powerPointFileLink(target)
    if (!link) return { warning: 'สื่อ PowerPoint ที่ลิงก์ภายนอกใช้ภาพตัวอย่างเมื่อมี' }
    const files = index.get(link.pieces[link.pieces.length - 1]) ?? []
    if (!files.length) return { warning: `ไม่พบไฟล์สื่อ PowerPoint ที่ลิงก์ไว้ · ${link.filename}` }

    let best = 0
    let chosen: PowerPointMediaCandidate[] = []
    for (const { file, path } of files) {
      let score = 1
      while (score < Math.min(path.length, link.pieces.length)
        && path[path.length - 1 - score] === link.pieces[link.pieces.length - 1 - score]) score++
      if (score > best) { best = score; chosen = [] }
      if (score === best) chosen.push(file)
    }
    const expected = new Set(chosen.flatMap(({ expectedHash }) => expectedHash ? [expectedHash.toLowerCase()] : []))
    const ambiguous = { warning: `พบสื่อ PowerPoint ชื่อซ้ำที่ระบุไฟล์ต้นฉบับไม่ได้ · ${link.filename}` }
    if (expected.size > 1) return ambiguous
    const [expectedHash] = expected
    const matches = new Map<string, MediaMatch>()
    let unreadable = false
    for (const file of chosen) {
      let reading = inspected.get(file)
      if (!reading) {
        reading = file.readFile().then(async (blob) => {
          if (!blob.size) return undefined
          const hash = await mediaFileHash(blob)
          return file.expectedHash && file.expectedHash.toLowerCase() !== hash ? undefined : { blob, hash }
        }).catch(() => undefined)
        inspected.set(file, reading)
      }
      const media = await reading
      if (media) matches.set(media.hash, media)
      else unreadable = true
    }
    if (!expectedHash && (matches.size > 1 || (unreadable && chosen.length > 1))) return ambiguous
    const match = expectedHash ? matches.get(expectedHash) : matches.values().next().value
    return match ? { match } : { warning: `อ่านสื่อ PowerPoint ที่ลิงก์ไว้ไม่ได้ · ${link.filename}` }
  }
}
