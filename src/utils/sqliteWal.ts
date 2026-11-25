/** Restores committed SQLite pages from a database and its write-ahead log. */

import { isEasyWorshipSqliteDatabase } from './easyWorship'

const WAL_HEADER_BYTES = 32
const FRAME_HEADER_BYTES = 24
const LITTLE_ENDIAN_WAL = 0x377f0682
const BIG_ENDIAN_WAL = 0x377f0683
const WAL_FORMAT_VERSION = 3007000

type WalSnapshot = { database: Blob; recovered: boolean; ignoredDamagedTail: boolean }

function validPageSize(size: number) {
  return size >= 512 && size <= 65536 && (size & (size - 1)) === 0
}

/** SQLite validates a rolling pair over the WAL header and each frame's first eight bytes and page. */
function walChecksum(view: DataView, littleEndian: boolean) {
  let first = 0
  let second = 0
  return {
    add(offset: number, length: number) {
      for (let position = offset; position < offset + length; position += 8) {
        first = (first + view.getUint32(position, littleEndian) + second) >>> 0
        second = (second + view.getUint32(position + 4, littleEndian) + first) >>> 0
      }
    },
    matches(offset: number) {
      return first === view.getUint32(offset) && second === view.getUint32(offset + 4)
    },
  }
}

export async function sqliteWalSnapshot(database: Blob, wal: Blob, maxBytes: number): Promise<WalSnapshot> {
  if (!wal.size) return { database, recovered: false, ignoredDamagedTail: false }
  if (database.size > maxBytes || wal.size > maxBytes) {
    throw new Error(`ฐานข้อมูลหรือไฟล์ WAL มีขนาดเกิน ${maxBytes / 1024 / 1024} MB`)
  }

  const headerBytes = new Uint8Array(await database.slice(0, 100).arrayBuffer())
  if (headerBytes.length < 100 || !isEasyWorshipSqliteDatabase(headerBytes) || headerBytes[18] !== 2 || headerBytes[19] !== 2) {
    throw new Error('ไฟล์ WAL ต้องใช้คู่กับฐาน SQLite ต้นฉบับที่อยู่ในโหมด WAL')
  }
  const databasePageSize = new DataView(headerBytes.buffer).getUint16(16)
  const bytes = new Uint8Array(await wal.arrayBuffer())
  const view = new DataView(bytes.buffer)
  if (bytes.length < WAL_HEADER_BYTES) throw new Error('ส่วนหัวของไฟล์ WAL ไม่ครบ')
  const magic = view.getUint32(0)
  if ((magic !== LITTLE_ENDIAN_WAL && magic !== BIG_ENDIAN_WAL) || view.getUint32(4) !== WAL_FORMAT_VERSION) {
    throw new Error('ไฟล์ WAL ไม่ใช่รูปแบบ SQLite ที่รองรับ')
  }
  const pageSize = view.getUint32(8)
  if (!validPageSize(pageSize) || pageSize !== (databasePageSize === 1 ? 65536 : databasePageSize)
    || database.size < pageSize || database.size % pageSize !== 0) {
    throw new Error('ขนาดหน้าข้อมูลของฐาน SQLite และไฟล์ WAL ไม่ตรงกัน')
  }

  const checksum = walChecksum(view, magic === LITTLE_ENDIAN_WAL)
  checksum.add(0, 24)
  if (!checksum.matches(24)) throw new Error('ค่าตรวจสอบส่วนหัวของไฟล์ WAL ไม่ตรงกัน')
  const firstSalt = view.getUint32(16)
  const secondSalt = view.getUint32(20)
  const frameSize = FRAME_HEADER_BYTES + pageSize
  const maxPages = Math.floor(maxBytes / pageSize)
  let endOfCommit = WAL_HEADER_BYTES
  let committedPages = 0
  let ignoredDamagedTail = false

  for (let offset = WAL_HEADER_BYTES; offset < bytes.length; offset += frameSize) {
    // A reset can leave pages with the old salts behind the current log.
    if (bytes.length - offset >= FRAME_HEADER_BYTES
      && (view.getUint32(offset + 8) !== firstSalt || view.getUint32(offset + 12) !== secondSalt)) break
    if (offset + frameSize > bytes.length) {
      ignoredDamagedTail = true
      break
    }
    checksum.add(offset, 8)
    checksum.add(offset + FRAME_HEADER_BYTES, pageSize)
    if (!checksum.matches(offset + 16) || !view.getUint32(offset)) {
      ignoredDamagedTail = true
      break
    }
    const pageCount = view.getUint32(offset + 4)
    if (!pageCount) continue
    if (pageCount > maxPages) throw new Error(`ฐาน SQLite หลังอ่าน WAL มีขนาดเกิน ${maxBytes / 1024 / 1024} MB`)
    committedPages = pageCount
    endOfCommit = offset + frameSize
  }

  if (!committedPages && ignoredDamagedTail) throw new Error('ไม่พบการบันทึกที่ครบถ้วนก่อนส่วนที่เสียหายในไฟล์ WAL')
  const size = committedPages ? committedPages * pageSize : database.size
  const snapshot = new Uint8Array(size)
  snapshot.set(new Uint8Array(await database.slice(0, size).arrayBuffer()))
  for (let offset = WAL_HEADER_BYTES; offset < endOfCommit; offset += frameSize) {
    const page = view.getUint32(offset)
    if (page > committedPages) continue
    const data = offset + FRAME_HEADER_BYTES
    snapshot.set(bytes.subarray(data, data + pageSize), (page - 1) * pageSize)
  }

  const snapshotHeader = new DataView(snapshot.buffer)
  if (!isEasyWorshipSqliteDatabase(snapshot) || snapshotHeader.getUint16(16) !== databasePageSize) {
    throw new Error('ส่วนหัวของฐาน SQLite หลังอ่าน WAL ไม่ตรงกับฐานต้นฉบับ')
  }
  // The result is a standalone copy with no WAL or shared-memory sidecars.
  snapshot[18] = 1
  snapshot[19] = 1
  snapshotHeader.setUint32(28, size / pageSize)
  snapshotHeader.setUint32(92, snapshotHeader.getUint32(24))
  return { database: new Blob([snapshot]), recovered: Boolean(committedPages), ignoredDamagedTail }
}
