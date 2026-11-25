/** Reads unprotected EasyWorship format-1 Bible plug-ins locally in the browser. */

import type { Database } from 'sql.js'
import type { ScriptureBook, ScriptureEdition, ScriptureEditionInfo, ScriptureVerse } from '../types/scripture'
import { getEasyWorshipSql, isEasyWorshipSqliteDatabase, textFromEasyWorshipRtf } from './easyWorship'

const MAX_BIBLE_BYTES = 128 * 1024 * 1024
const REQUIRED_TABLES = ['header', 'books', 'streams']

type SqlRow = Record<string, unknown>

function rows(database: Database, query: string): SqlRow[] {
  const statement = database.prepare(query)
  const result: SqlRow[] = []
  try {
    while (statement.step()) result.push(statement.getAsObject())
  } finally {
    statement.free()
  }
  return result
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function metadataText(value: unknown): string | undefined {
  return typeof value === 'string' ? textFromEasyWorshipRtf(value) || undefined : undefined
}

function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined
}

function blob(value: unknown): Uint8Array | undefined {
  return value instanceof Uint8Array ? value : undefined
}

function hasTables(database: Database): boolean {
  const names = new Set(rows(database, "SELECT name FROM sqlite_master WHERE type = 'table'")
    .map((row) => text(row.name)?.toLowerCase()))
  return REQUIRED_TABLES.every((name) => names.has(name))
}

async function inflateZlib(compressed: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('เบราว์เซอร์นี้ไม่รองรับการคลายข้อมูลพระคัมภีร์ EasyWorship')
  }
  const footer = compressed.byteLength >= 10 ? compressed.slice(-10) : undefined
  const hasFooter = footer?.[0] === 0x51 && footer[1] === 0x4b && footer[2] === 0x03 && footer[3] === 0x04
  let decoded: ArrayBuffer

  try {
    const source = new Uint8Array(hasFooter ? compressed.subarray(0, -10) : compressed)
    const stream = new Blob([source]).stream().pipeThrough(new DecompressionStream('deflate'))
    decoded = await new Response(stream).arrayBuffer()
  } catch {
    throw new Error('ไม่สามารถคลายข้อมูลพระคัมภีร์ EasyWorship ได้')
  }

  if (hasFooter) {
    const expectedLength = footer[4] + footer[5] * 0x100 + footer[6] * 0x10000 + footer[7] * 0x1000000
    if (decoded.byteLength !== expectedLength || footer[8] !== 0x08 || footer[9] !== 0x00) {
      throw new Error('ข้อมูลพระคัมภีร์ EasyWorship ไม่สมบูรณ์')
    }
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(decoded)
  } catch {
    throw new Error('อ่านตัวอักษรจากไฟล์พระคัมภีร์ไม่ได้')
  }
}

function decodeVerseInfo(verseInfo: Uint8Array, stream: string, bookName: string): ScriptureVerse[] {
  if (verseInfo.byteLength === 0 || verseInfo.byteLength % 8 !== 0) {
    throw new Error('ข้อมูลข้อพระคัมภีร์ของ ' + bookName + ' ไม่สมบูรณ์')
  }
  const verses: ScriptureVerse[] = []
  for (let offset = 0; offset < verseInfo.byteLength; offset += 8) {
    const packedPointer = verseInfo[offset + 1]
      + verseInfo[offset + 2] * 0x100
      + verseInfo[offset + 3] * 0x10000
    const length = verseInfo[offset] + 0x100 * (packedPointer % 4)
    const pointer = Math.floor(packedPointer / 4)
    // EasyWorship packs carries from the 4x-scaled verse into the chapter byte,
    // then carries chapters into the book byte. Decode the address directly:
    // some official plugin-v2 book_info counters contain extra trailing bytes.
    const verseCarry = verseInfo[offset + 5] % 4
    const chapterCarry = verseInfo[offset + 6] % 4
    const verse = (verseInfo[offset + 4] + 0x100 * verseCarry) / 4
    const chapter = (verseInfo[offset + 5] + 0x100 * chapterCarry - verseCarry) / 4
    if (!Number.isInteger(verse) || !Number.isInteger(chapter) || verse < 1 || chapter < 1
      || pointer + 2 + length > stream.length) {
      throw new Error('ตำแหน่งข้อพระคัมภีร์ของ ' + bookName + ' ไม่ถูกต้อง')
    }
    verses.push({ chapter, verse, text: stream.slice(pointer + 2, pointer + 2 + length) })
  }
  return verses
}

function editionId(headerId: number, abbreviation: string): string {
  return 'easyworship-' + headerId + '-' + abbreviation.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

export type EasyWorshipBibleInfo = { translationId: number; edition: ScriptureEditionInfo; warning?: string }

async function withEasyWorshipBible<T>(file: File, consume: (database: Database, info: EasyWorshipBibleInfo) => T | Promise<T>): Promise<T> {
  if (file.size > MAX_BIBLE_BYTES) throw new Error('ไฟล์ .ewb มีขนาดเกิน 128 MB')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isEasyWorshipSqliteDatabase(bytes)) {
    throw new Error('ไฟล์ .ewb ไม่ใช่ฐานข้อมูล SQLite ของ EasyWorship ที่รองรับ')
  }
  const SQL = await getEasyWorshipSql()
  const database = new SQL.Database(bytes)
  try {
    if (!hasTables(database)) throw new Error('ไฟล์ .ewb นี้ไม่มีตารางพระคัมภีร์ EasyWorship ที่รองรับ')
    const header = rows(database, 'SELECT id, key, name, abbrev_name, lang_code, plugin_version, format_version, copyright, license FROM header ORDER BY rowid LIMIT 1')[0]
    const headerId = integer(header?.id)
    const key = integer(header?.key)
    const name = text(header?.name)
    const abbreviation = text(header?.abbrev_name)
    if (headerId === undefined || key === undefined || !name || !abbreviation) {
      throw new Error('ส่วนหัวของไฟล์ .ewb ไม่สมบูรณ์')
    }
    const pluginVersion = integer(header.plugin_version)
    const warning = key !== 0 ? 'พระคัมภีร์ EasyWorship รุ่นนี้ถูกป้องกันและไม่สามารถนำเข้าได้'
      : (pluginVersion !== 1 && pluginVersion !== 2) || integer(header.format_version) !== 1
        ? 'รูปแบบพระคัมภีร์ EasyWorship รุ่นนี้ยังไม่รองรับ' : undefined
    const language = text(header.lang_code)
    const copyright = metadataText(header.copyright)
    const license = metadataText(header.license)
    return await consume(database, {
      translationId: headerId,
      edition: { id: editionId(headerId, abbreviation), name, abbreviation,
        ...(language ? { language } : {}), ...(copyright ? { copyright } : {}), ...(license ? { license } : {}) },
      warning,
    })
  } finally {
    database.close()
  }
}

/** Previews only the edition header, without opening any verse streams. */
export function readEasyWorshipBibleInfo(file: File): Promise<EasyWorshipBibleInfo> {
  return withEasyWorshipBible(file, (_database, info) => info)
}

/** Imports unprotected SQLite EWB format-1 plug-ins (plugin versions 1 and 2). */
export function readEasyWorshipBible(file: File): Promise<ScriptureEdition> {
  return withEasyWorshipBible(file, async (database, { edition, warning }) => {
    if (warning) throw new Error(warning)
    const bookRows = rows(database,
      'SELECT b.rowid AS id, b.name, b.abbrev_name, b.alt_name, b.book_info, b.verse_info, s.stream'
      + ' FROM books b LEFT JOIN streams s ON s.rowid = b.rowid ORDER BY b.rowid')
    if (bookRows.length === 0) throw new Error('ไฟล์ .ewb นี้ไม่มีหนังสือพระคัมภีร์ที่อ่านได้')
    const books: ScriptureBook[] = []
    for (const row of bookRows) {
      const id = integer(row.id)
      const bookName = text(row.name)
      const abbreviationName = text(row.abbrev_name)
      const bookInfo = blob(row.book_info)
      const verseInfo = blob(row.verse_info)
      const compressed = blob(row.stream)
      if (id === undefined || !bookName || !bookInfo || !verseInfo || !compressed) {
        throw new Error('ข้อมูลหนังสือพระคัมภีร์ไม่สมบูรณ์')
      }
      const stream = await inflateZlib(compressed)
      const aliases = [abbreviationName, text(row.alt_name)].filter((value): value is string => Boolean(value))
      books.push({
        id: String(id),
        name: bookName,
        ...(abbreviationName ? { abbreviation: abbreviationName } : {}),
        ...(aliases.length > 0 ? { aliases: [...new Set(aliases)] } : {}),
        verses: decodeVerseInfo(verseInfo, stream, bookName),
      })
    }
    return { ...edition, books }
  })
}
