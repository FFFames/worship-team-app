/** Recovers linked files and embedded fallback images from EasyWorship 2009. */

import type { EasyWorshipMediaAssetSource, EasyWorshipMediaEntry, EasyWorshipMediaReview } from './easyWorshipMedia'
import { withProfileMedia } from './easyWorshipProfileFiles'
import { decodeEasyWorshipText, legacySongCodePage, type LegacySongEncoding } from './easyWorshipEncoding'
import { createParadoxMemo, readEasyWorshipParadoxTable } from './easyWorshipParadox'
import { easyWorshipMediaInputMime } from './easyWorshipMedia'
import { legacyVideoExtension } from './legacyVideo'
import { legacyBackgroundFill, legacyBackgroundTheme } from './easyWorshipLegacyStyle'
import type { EasyWorshipDesignEntry, EasyWorshipDesignReview } from './easyWorshipDesigns'

export const LEGACY_BACKGROUND_PATH = /(?:^|\/)backgrounds\.db$/i

const CATALOG_LIMIT = 128 * 1024 * 1024
const MEMO_LIMIT = 512 * 1024 * 1024
type AssetSource = Pick<EasyWorshipMediaAssetSource, 'paths' | 'read' | 'withMedia'>

export function embeddedImageFormat(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { extension: 'jpg', mime: 'image/jpeg' }
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return { extension: 'bmp', mime: 'image/bmp' }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { extension: 'png', mime: 'image/png' }
  }
  return undefined
}

function assetPaths(source: AssetSource, folder: string) {
  const index = new Map<string, string[]>()
  for (const [path, matches] of source.paths) {
    if (!path.startsWith(folder)) continue
    const name = path.slice(path.lastIndexOf('/') + 1)
    index.set(name, [...(index.get(name) ?? []), ...matches])
  }
  return index
}

export async function reviewLegacyBackgrounds(
  source: AssetSource, databasePath: string, root: string, encoding: LegacySongEncoding = 'auto',
) {
  const blob = await source.read(databasePath)
  if (blob.size > CATALOG_LIMIT) throw new Error('BackGrounds.DB มีขนาดเกิน 128 MB')

  const { codePage, fields, rows } = readEasyWorshipParadoxTable(new Uint8Array(await blob.arrayBuffer()), 'BackGrounds.DB')
  if (!fields.has('bk type') || fields.get('bk bitmap name')?.type !== 1 || !fields.has('bk bitmap')) {
    throw new Error('ไม่พบคอลัมน์พื้นหลังภาพและวิดีโอใน BackGrounds.DB')
  }

  const page = legacySongCodePage(codePage, encoding)
  const images = assetPaths(source, root.toLowerCase() + 'resources/images/')
  const videos = assetPaths(source, root.toLowerCase() + 'resources/videos/')
  const entries: EasyWorshipMediaEntry[] = []
  const unsupported: EasyWorshipMediaReview['unsupported'] = []
  const themes: EasyWorshipDesignEntry[] = []
  const themeFiles = new Map<string, () => Promise<Blob>>()
  let unavailableThemes = 0

  const directory = databasePath.slice(0, databasePath.lastIndexOf('/') + 1)
  const memoPaths = source.paths.get(directory.toLowerCase() + 'backgrounds.mb') ?? []
  let memoSource: ReturnType<typeof createParadoxMemo> | undefined
  if (memoPaths.length > 1) {
    unsupported.push({ message: 'พบ BackGrounds.MB มากกว่าหนึ่งไฟล์ในโฟลเดอร์เดียวกัน' })
  } else if (memoPaths.length === 1) {
    try {
      const memo = await source.read(memoPaths[0])
      if (memo.size > MEMO_LIMIT) throw new Error('BackGrounds.MB มีขนาดเกิน 512 MB')
      memoSource = createParadoxMemo(new Uint8Array(await memo.arrayBuffer()), 'BackGrounds.DB', 'BackGrounds.MB', 64)
    } catch (error) {
      unsupported.push({ message: error instanceof Error ? error.message : 'เปิด BackGrounds.MB ไม่สำเร็จ' })
    }
  }

  const seen = new Set<number>()
  for (const row of rows) {
    const index = row.number('index')
    const uniqueIndex = index !== undefined && !seen.has(index)
    if (uniqueIndex) seen.add(index)
    const sourceId = 'legacy-background:' + (uniqueIndex ? String(index) : row.position)
    const type = row.number('bk type')
    const rawName = row.alpha('bk bitmap name')
    const filename = rawName ? decodeEasyWorshipText(rawName, page).split(/[\\/]/).pop()?.trim() : undefined
    if (type === 0 || type === 1) {
      const fill = legacyBackgroundFill(row, type)
      const label = fill?.type === 'solid' ? `พื้นหลังสีพื้น ${fill.color}`
        : fill?.type === 'gradient' ? `พื้นหลังไล่สี ${fill.stops[0].color} – ${fill.stops[1].color}` : undefined
      if (fill && label) themes.push(legacyBackgroundTheme(row, page, sourceId, label, { fill }))
      else {
        unavailableThemes++
        unsupported.push({ sourceId, message: `${type === 0 ? 'พื้นหลังสีพื้น' : 'พื้นหลังไล่สี'} · ไม่พบค่าสีที่รองรับ` })
      }
      continue
    }
    if (!filename || (type !== 3 && type !== 4)) {
      unavailableThemes++
      const label = 'พื้นหลังชนิด ' + (type ?? '?')
      unsupported.push({ sourceId, message: `${label} · ยังนำเข้าเป็นสื่อไม่ได้` })
      continue
    }

    const kind = type === 3 ? 'image' : 'video'
    const catalog = kind === 'image' ? images : videos
    const supported = easyWorshipMediaInputMime(filename)?.startsWith(kind + '/')
    const exact = supported ? catalog.get(filename.toLowerCase()) : undefined
    const fallback = kind === 'video' && (!supported || legacyVideoExtension(filename))
      ? catalog.get(filename.replace(/\.[^.]+$/, '').toLowerCase() + '.mp4') : undefined
    const candidates = exact ?? fallback ?? []
    const assetPath = candidates.length === 1 ? candidates[0] : undefined
    const entry: EasyWorshipMediaEntry = {
      sourceId, name: filename, filename, kind,
      importSourceId: `${sourceId}:${filename.toLowerCase()}`,
    }

    if (assetPath) {
      entry.filename = assetPath.split('/').pop() ?? filename
      entry.sourcePath = assetPath
      entry.readFile = () => source.read(assetPath)
      entry.withFile = (consume) => withProfileMedia(source, assetPath, consume)
    } else if (kind === 'image' && memoSource) {
      try {
        const bytes = row.memo('bk bitmap', memoSource)
        const format = bytes && embeddedImageFormat(bytes)
        if (bytes && format) {
          entry.filename = filename.replace(/\.[^.]+$/, '') + '.' + format.extension
          entry.warning = 'ใช้ภาพสำรองใน BackGrounds.MB ซึ่งอาจมีความละเอียดต่ำกว่าต้นฉบับ'
          entry.metadata = { description: entry.warning }
          entry.readFile = async () => new Blob([bytes.slice()], { type: format.mime })
        }
      } catch (error) {
        entry.warning = error instanceof Error ? error.message : 'อ่านภาพสำรองไม่สำเร็จ'
      }
    }

    if (!entry.readFile && !entry.warning) {
      entry.warning = candidates.length > 1 ? 'พบไฟล์ชื่อเดียวกันหลายไฟล์ในโปรไฟล์'
        : kind === 'video' ? 'ไม่พบวิดีโอต้นฉบับที่เล่นได้ใน Resources/Videos หรือไฟล์ MP4 ชื่อเดียวกัน'
        : 'ไม่พบไฟล์ภาพใน Resources/Images หรือภาพสำรองที่อ่านได้'
    }
    entries.push(entry)
    if (entry.readFile) {
      // Archive paths disallow NUL, so the virtual name cannot shadow a file.
      const sourcePath = '\0' + sourceId
      themeFiles.set(sourcePath, entry.readFile)
      themes.push(legacyBackgroundTheme(row, page, sourceId, entry.name.replace(/\.[^.]+$/, ''), {
        asset: { kind, filename: entry.filename, sourcePath, importSourceId: entry.importSourceId, importName: entry.name },
      }, entry.warning))
    } else {
      unavailableThemes++
    }
  }
  const legacyThemes: EasyWorshipDesignReview = {
    profiles: [{ id: databasePath.toLowerCase(), name: root.replace(/\/$/, '') || 'EasyWorship profile', databasePath }],
    entries: themes,
    warnings: unavailableThemes ? [`พื้นหลัง ${unavailableThemes} รายการขาดไฟล์สื่อหรือใช้ค่าที่ธีมยังไม่รองรับ`] : [],
    readAsset: async (path) => {
      const get = themeFiles.get(path)
      if (!get) throw new Error('ไม่พบไฟล์พื้นหลัง EasyWorship ที่อ้างอิง')
      return get()
    },
  }
  return { entries, unsupported, legacyThemes }
}
