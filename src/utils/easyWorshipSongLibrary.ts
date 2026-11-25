/** Chooses a song reader by the contents of Songs.db, not the file's extension. */

import { isEasyWorshipSqliteDatabase, readEasyWorshipSongs, recoverEasyWorshipLyrics, type EasyWorshipImport } from './easyWorship'
import type { LegacySongEncoding } from './easyWorshipEncoding'
import { isEasyWorshipParadoxTable } from './easyWorshipParadox'
import { attachEasyWorshipSongLayouts, reviewSongAppearanceAssets, type SongAssetSource } from './easyWorshipSongAppearance'
import { easyWorshipWalWarning } from './easyWorshipProfileFiles'
import { attachEasyWorshipMediaFiles, withEasyWorshipLibraryMedia } from './easyWorshipMedia'

export type EasyWorshipSongFormat = 'sqlite' | 'paradox'
type CompanionFiles = { songWords?: () => Promise<File>; memo?: () => Promise<File>; layouts?: () => Promise<File>; assets?: SongAssetSource }
type SqliteSongFiles = {
  songs?: File | null; words: File; layouts?: File | null; media?: File | null; attachedMedia?: readonly File[]; walFiles?: File[]
}

/** Reads loose SQLite files and their optional logs without changing the originals. */
export async function reviewEasyWorshipSqliteFiles({ songs, words, layouts, media, attachedMedia = [], walFiles = [] }: SqliteSongFiles) {
  const databases = [songs, words, songs ? layouts : null, songs && layouts ? media : null].filter((file): file is File => Boolean(file))
  const logs = new Map<File, File>()
  for (const wal of walFiles) {
    const matches = databases.filter((database) => wal.name.toLowerCase() === `${database.name.toLowerCase()}-wal`)
    if (matches.length !== 1) {
      throw new Error(matches.length
        ? `${wal.name} ตรงกับฐานข้อมูลหลายไฟล์ เลือกฐานข้อมูลที่มีชื่อไฟล์ต่างกัน`
        : `ไม่พบฐานข้อมูลคู่กับ ${wal.name} เลือกไฟล์ -wal ของฐานข้อมูลที่แนบไว้`)
    }
    const [database] = matches
    if (logs.has(database)) throw new Error(`พบไฟล์ -wal ของ ${database.name} ซ้ำ เลือกเพียงไฟล์เดียว`)
    logs.set(database, wal)
  }

  const warnings: string[] = []
  async function read(file: File) {
    const wal = logs.get(file)
    if (!wal?.size) return file
    try {
      const { sqliteWalSnapshot } = await import('./sqliteWal')
      const snapshot = await sqliteWalSnapshot(file, wal, 128 * 1024 * 1024)
      const warning = easyWorshipWalWarning({ path: file.name, ...snapshot })
      if (warning) warnings.push(warning)
      return new File([snapshot.database], file.name)
    } catch (error) {
      throw new Error(`อ่าน ${wal.name} ไม่สำเร็จ · ${error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'}`)
    }
  }
  async function prepareArtwork() {
    const mediaPath = media ? 'Media.db' : undefined
    const { source } = withEasyWorshipLibraryMedia(attachEasyWorshipMediaFiles({
      paths: new Map(),
      size: (path) => path === mediaPath ? media?.size : undefined,
      read: async (path) => {
        if (path === mediaPath && media) return read(media)
        throw new Error('ไม่พบไฟล์ที่อ้างอิง')
      },
    }, attachedMedia))
    return reviewSongAppearanceAssets(source, '', (message) => warnings.push(message), mediaPath)
  }
  const assets = songs && layouts ? await prepareArtwork() : undefined
  const preview = songs ? (await readEasyWorshipSongLibrary(await read(songs), {
    songWords: () => read(words),
    ...(layouts ? { layouts: () => read(layouts), assets } : {}),
  })).preview : await recoverEasyWorshipLyrics(await read(words))
  return warnings.length ? { ...preview, warnings: [...new Set([...(preview.warnings ?? []), ...warnings])] } : preview
}

export async function detectEasyWorshipSongFormat(file: File): Promise<EasyWorshipSongFormat | undefined> {
  const header = new Uint8Array(await file.slice(0, 120).arrayBuffer())
  if (isEasyWorshipSqliteDatabase(header)) return 'sqlite'
  return isEasyWorshipParadoxTable(header, file.size) ? 'paradox' : undefined
}

export async function readEasyWorshipSongLibrary(
  table: File,
  companions: CompanionFiles,
  encoding: LegacySongEncoding = 'auto',
): Promise<{ format: EasyWorshipSongFormat; preview: EasyWorshipImport }> {
  const format = await detectEasyWorshipSongFormat(table)
  if (format === 'sqlite') {
    if (!companions.songWords) throw new Error('ต้องใช้ Songs.db คู่กับ SongWords.db หรือ SongWords.dat ที่เป็น SQLite')
    const songs = await readEasyWorshipSongs(table, await companions.songWords())
    const preview = await attachEasyWorshipSongLayouts(songs, companions.layouts, companions.assets)
    return { format, preview }
  }
  if (format === 'paradox') {
    if (!companions.memo) throw new Error('ต้องใช้ Songs.DB และ Songs.MB จากฐานข้อมูล EasyWorship รุ่นเก่าชุดเดียวกัน')
    const { readEasyWorshipLegacySongs } = await import('./easyWorshipLegacy')
    const preview = await readEasyWorshipLegacySongs(table, await companions.memo(), encoding, companions.assets)
    return { format, preview }
  }
  throw new Error('ไม่รู้จักรูปแบบของ Songs.db กรุณาตรวจว่าเลือกฐานเพลง EasyWorship ที่ถูกต้อง')
}
