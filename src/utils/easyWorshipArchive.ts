/** Reviews songs in one catalog directory of an EasyWorship archive. */

import { recoverEasyWorshipLyrics, type EasyWorshipImport } from './easyWorship'
import type { LegacySongEncoding } from './easyWorshipEncoding'
import { readEasyWorshipSongLibrary, type EasyWorshipSongFormat } from './easyWorshipSongLibrary'
import { createEasyWorshipProfileFiles, easyWorshipWalWarning, type EasyWorshipProfileFiles } from './easyWorshipProfileFiles'
import { reviewSongAppearanceAssets } from './easyWorshipSongAppearance'
import { withEasyWorshipLibraryMedia } from './easyWorshipMedia'

type ArchiveReview = { profiles: string[]; preview?: EasyWorshipImport; format?: EasyWorshipSongFormat }

export async function reviewEasyWorshipArchive(file: File, profile?: string, encoding?: LegacySongEncoding): Promise<ArchiveReview> {
  let files: EasyWorshipProfileFiles
  try {
    files = await createEasyWorshipProfileFiles(file)
  } catch {
    throw new Error('เปิดไฟล์บีบอัดไม่ได้ กรุณาเลือกไฟล์ ZIP หรือเลือกฐานเพลงกับไฟล์คู่กันโดยตรง')
  }
  const candidates = files.profiles.filter(({ files: { songs, songWords, songMemo } }) => songWords || (songs && songMemo))
  const profiles = candidates.map(({ dataPath }) => dataPath.replace(/\/$/, ''))
  if (!profiles.length) throw new Error('ไม่พบ SongWords.db, SongWords.dat หรือคู่ไฟล์ Songs.DB และ Songs.MB ในไฟล์บีบอัด')
  if (profile === undefined && profiles.length > 1) return { profiles }

  const path = profile ?? profiles[0]
  const selected = candidates.find(({ id }) => id === (path ? path.toLowerCase() + '/' : '/'))
  if (!selected) throw new Error('ไม่พบคู่ฐานข้อมูลหรือไฟล์เนื้อร้องในโฟลเดอร์ที่เลือก')

  const warnings = new Set(selected.warnings)
  const { source } = withEasyWorshipLibraryMedia(files.forProfile(selected.id))
  const scoped = {
    ...source,
    read: (path: string) => source.read(path, (notice) => {
      const warning = easyWorshipWalWarning(notice)
      if (warning) warnings.add(warning)
    }),
  }
  const readFile = async (path: string) => new File([await scoped.read(path)], path.slice(path.lastIndexOf('/') + 1))
  const { songs, songWords, songMemo, layouts, media } = selected.files
  const assets = songs ? await reviewSongAppearanceAssets(scoped, selected.rootPath, (message) => warnings.add(message),
    layouts ? media : undefined, Boolean(selected.archiveName)) : undefined
  const result = songs ? await readEasyWorshipSongLibrary(await readFile(songs), {
    ...(songWords ? { songWords: () => readFile(songWords) } : {}),
    ...(songMemo ? { memo: () => readFile(songMemo) } : {}),
    ...(layouts ? { layouts: () => readFile(layouts) } : {}),
    assets,
  }, encoding) : { format: 'sqlite' as const, preview: await recoverEasyWorshipLyrics(await readFile(songWords!)) }
  for (const warning of result.preview.warnings ?? []) warnings.add(warning)
  return { profiles, format: result.format, preview: { ...result.preview, warnings: [...warnings] } }
}
