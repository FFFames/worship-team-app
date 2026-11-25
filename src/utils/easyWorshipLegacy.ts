/** Maps native EasyWorship Paradox song rows to the shared lyric preview. */

import type { EasyWorshipImport } from './easyWorship'
import { decodeEasyWorshipText, legacySongCodePage, type LegacySongEncoding } from './easyWorshipEncoding'
import { createParadoxMemo, readEasyWorshipParadox } from './easyWorshipParadox'
import { readEasyWorshipLegacySections } from './easyWorshipLegacyLyrics'
import { legacyBackgroundDesign, legacyBackgroundFill } from './easyWorshipLegacyStyle'
import { embeddedImageFormat } from './easyWorshipLegacyBackgrounds'
import type { SongAssetSource } from './easyWorshipSongAppearance'

const MAX_TABLE_BYTES = 128 * 1024 * 1024
const MAX_MEMO_BYTES = 512 * 1024 * 1024

export async function readEasyWorshipLegacySongs(
  table: File,
  memo: File,
  encoding: LegacySongEncoding = 'auto',
  assets?: SongAssetSource,
): Promise<EasyWorshipImport> {
  if (table.size > MAX_TABLE_BYTES) throw new Error('Songs.DB รุ่นเก่ามีขนาดเกิน 128 MB')
  if (memo.size > MAX_MEMO_BYTES) throw new Error('Songs.MB มีขนาดเกิน 512 MB')

  const tableBytes = new Uint8Array(await table.arrayBuffer())
  const memoBytes = new Uint8Array(await memo.arrayBuffer())
  const { codePage, records } = readEasyWorshipParadox(tableBytes, memoBytes)
  const page = legacySongCodePage(codePage, encoding)
  const result: EasyWorshipImport = { songs: [], skipped: [] }
  const embedded = new Map<string, Blob>()
  const songMedia = createParadoxMemo(memoBytes, 'Songs.DB', 'Songs.MB', 64)
  const field = (bytes: Uint8Array | undefined) => bytes?.length ? decodeEasyWorshipText(bytes, page).trim() || null : null

  for (const record of records) {
    const sourceId = `paradox:${record.sourceId}`
    const title = field(record.title) ?? `เพลงไม่มีชื่อ ${record.sourceId}`
    const sections = record.error ? [] : readEasyWorshipLegacySections(record.words, page)
    if (record.error || !sections.some((section) => section.lines.length > 0)) {
      result.skipped.push({ sourceId, title, reason: record.error || 'ไม่พบสไลด์เนื้อร้องที่อ่านได้' })
      continue
    }
    const copyright = field(record.copyright)
    const administrator = field(record.administrator)
    const { row } = record
    const customBackground = row.logical('default background') === false
    const customText = row.logical('override enabled') === true
    const type = row.number('bk type')
    let background: Parameters<typeof legacyBackgroundDesign>[2]
    const appearanceWarnings: string[] = []
    if (customBackground && (type === 0 || type === 1)) {
      const fill = legacyBackgroundFill(row, type)
      if (fill) background = { fill }
    } else if (customBackground && (type === 3 || type === 4)) {
      const kind = type === 3 ? 'image' : 'video'
      const name = field(row.alpha('bk bitmap name'))
      const attached = name && assets?.resolve(kind, name)
      if (attached) background = { asset: { kind, filename: attached.filename, sourcePath: attached.path } }
      else if (kind === 'image') {
        try {
          const bytes = row.memo('bk bitmap', songMedia)
          const format = bytes && embeddedImageFormat(bytes)
          if (bytes && format) {
            const sourcePath = '\0' + sourceId
            const filename = (name?.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || title) + '.' + format.extension
            embedded.set(sourcePath, new Blob([bytes.slice()], { type: format.mime }))
            background = { asset: { kind, filename, sourcePath } }
            appearanceWarnings.push('ใช้ภาพสำรองที่เก็บอยู่ในฐานเพลง')
          }
        } catch (error) {
          if (error instanceof Error) appearanceWarnings.push(error.message)
        }
      }
    }
    if (customBackground && !background) appearanceWarnings.push('ไม่พบพื้นหลังที่อ่านได้สำหรับเพลงนี้')
    const appearance = background || customText || appearanceWarnings.length ? {
      ...(background || customText ? { defaultDesign: legacyBackgroundDesign(row, page, background) } : {}),
      ...(appearanceWarnings.length ? { warnings: appearanceWarnings } : {}),
    } : undefined
    result.songs.push({
      sourceId,
      title,
      author: field(record.author),
      copyright: administrator && administrator !== copyright
        ? [copyright, `ดูแลลิขสิทธิ์โดย ${administrator}`].filter(Boolean).join(' · ')
        : copyright,
      ccli: typeof record.ccli === 'number' ? (record.ccli > 0 ? String(record.ccli) : null) : field(record.ccli),
      sections,
      ...(appearance ? { appearance } : {}),
    })
  }
  if (embedded.size || assets) {
    result.withAppearanceAsset = assets?.withMedia
    result.readAppearanceAsset = async (path) => {
      const blob = embedded.get(path)
      if (blob) return blob
      if (assets && !path.startsWith('\0')) return assets.read(path)
      throw new Error('ไม่พบไฟล์พื้นหลังของเพลง EasyWorship')
    }
  }
  return result
}
