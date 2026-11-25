/** Checks packed schedule attachments without retaining the inflated bytes. */

import type { FileEntry } from '@zip.js/zip.js'
import type { EasyWorshipScheduleCue, EasyWorshipScheduleSlide } from './easyWorshipSchedule'
import type { PlaylistCueAsset } from '../types/database'
import { safeScheduleMediaPath } from './scheduleMedia'

type PackedIssue = 'checksum' | 'unreadable'
type PackedMediaRejection = { path: string; warning: string }
export type RejectedPackedMedia = ReadonlyMap<object, PackedMediaRejection>

export function packedScheduleMediaWarning(filename: string, issue: PackedIssue) {
  return issue === 'checksum'
    ? `ไฟล์ ${filename} ที่บรรจุใน .ewsx มีเนื้อหาไม่ตรงกับต้นฉบับ`
    : `อ่านไฟล์ ${filename} ที่บรรจุใน .ewsx ไม่สำเร็จ`
}

function slideMedia(slide: EasyWorshipScheduleSlide): PlaylistCueAsset[] {
  return [...slide.assets,
    ...(slide.design?.layers.flatMap((layer) => layer.kind === 'media' ? [layer.asset] : []) ?? []),
    ...(slide.design?.soundtracks ?? [])]
}

async function checkEntry(entry: FileEntry, includeHash: boolean): Promise<string | undefined> {
  const hash = includeHash ? (await import('@noble/hashes/sha2.js')).sha256.create() : undefined
  await entry.getData(new WritableStream<Uint8Array>({ write: (chunk) => { hash?.update(chunk) } }), {
    checkCrc32: true, checkOverlappingEntry: true,
  })
  return hash && Array.from(hash.digest(), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function verifyEasyWorshipPackedMedia(cues: readonly EasyWorshipScheduleCue[], entries: readonly FileEntry[]) {
  const sources = new Map<string, { asset: PlaylistCueAsset; slide: EasyWorshipScheduleSlide }[]>()
  for (const { slides } of cues) {
    for (const slide of slides) {
      for (const asset of slideMedia(slide)) {
        const path = asset.archivePath
        if (!path || asset.dvd || !['video', 'image', 'audio'].includes(asset.kind)) continue
        const refs = sources.get(path) ?? []
        refs.push({ asset, slide })
        sources.set(path, refs)
      }
    }
  }
  const byPath = new Map<string, FileEntry | null>()
  for (const entry of entries) {
    const path = safeScheduleMediaPath(entry.filename)
    if (!path || entry.directory || !sources.has(path)) continue
    byPath.set(path, byPath.has(path) ? null : entry)
  }

  const rejected = new Map<object, PackedMediaRejection>()
  for (const [path, refs] of sources) {
    const entry = byPath.get(path)
    const checked = entry && !entry.encrypted
      ? await checkEntry(entry, refs.some(({ asset }) => Boolean(asset.easyWorshipFileHash)))
        .then((digest) => ({ digest })).catch(() => undefined)
      : undefined
    for (const { asset, slide } of refs) {
      const issue = !checked ? 'unreadable' : asset.easyWorshipFileHash && asset.easyWorshipFileHash !== checked.digest ? 'checksum' : undefined
      if (!issue) continue
      const warning = packedScheduleMediaWarning(asset.filename, issue)
      rejected.set(asset, { path, warning })
      delete asset.archivePath
      delete asset.crc32
      if (!slide.warnings.includes(warning)) slide.warnings.push(warning)
    }
  }
  return rejected
}
