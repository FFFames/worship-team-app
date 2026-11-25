/** Reads the Paradox table and memo layout used by legacy EasyWorship. */

type Field = { type: number; size: number; offset: number }
export type EasyWorshipParadoxRow = {
  position: string
  alpha: (name: string) => Uint8Array | undefined
  number: (name: string) => number | undefined
  logical: (name: string) => boolean | undefined
  memo: (name: string, source: ReturnType<typeof createParadoxMemo>) => Uint8Array | undefined
}
type RawSong = {
  sourceId: string
  row: EasyWorshipParadoxRow
  title?: Uint8Array
  author?: Uint8Array
  copyright?: Uint8Array
  administrator?: Uint8Array
  ccli?: Uint8Array | number
  words?: Uint8Array
  error?: string
}

const HEADER_BYTES = 2048
const BLOCK_HEADER_BYTES = 6
const FIELD_DESCRIPTORS = 120
const FIELD_NAMES_BASE = 385
const MEMO_BLOCK_BYTES = 4096
const MEMO_REFERENCE_BYTES = 10
const INVALID_TABLE = 'ฐานเพลง Songs.DB รุ่นเก่าเสียหายหรือใช้รูปแบบที่ยังไม่รองรับ'

function dataView(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

export function isEasyWorshipParadoxTable(header: Uint8Array, size: number): boolean {
  if (header.length < FIELD_DESCRIPTORS || size < HEADER_BYTES) return false
  const view = dataView(header)
  const blockBytes = header[5] * 1024
  const recordSize = view.getUint16(0, true)
  const fieldCount = view.getUint16(33, true)
  return view.getUint16(2, true) === HEADER_BYTES
    && (header[4] === 0 || header[4] === 2)
    && blockBytes >= 1024 && blockBytes <= 4096
    && recordSize > 0 && recordSize <= blockBytes - BLOCK_HEADER_BYTES
    && fieldCount > 0 && FIELD_NAMES_BASE + 6 * fieldCount < HEADER_BYTES
}

function readFields(table: Uint8Array, fieldCount: number, recordSize: number, invalidTable: string) {
  const fields = new Map<string, Field>()
  const decoder = new TextDecoder()
  const header = table.subarray(0, HEADER_BYTES)
  let nameStart = FIELD_NAMES_BASE + 6 * fieldCount
  let offset = 0

  for (let index = 0; index < fieldCount; index++) {
    const descriptor = FIELD_DESCRIPTORS + index * 2
    const type = table[descriptor]
    const size = table[descriptor + 1]
    const nameEnd = header.indexOf(0, nameStart)
    if (nameEnd <= nameStart || nameEnd >= HEADER_BYTES || !size || offset + size > recordSize) {
      throw new Error(invalidTable)
    }
    const name = decoder.decode(table.subarray(nameStart, nameEnd)).toLowerCase()
    if (fields.has(name)) throw new Error(invalidTable)
    fields.set(name, { type, size, offset })
    offset += size
    nameStart = nameEnd + 1
  }
  if (offset !== recordSize) throw new Error(invalidTable)
  return fields
}

function readAlpha(row: Uint8Array, field: Field | undefined): Uint8Array | undefined {
  if (field?.type !== 1) return undefined
  const bytes = row.subarray(field.offset, field.offset + field.size)
  const end = bytes.indexOf(0)
  return end === 0 ? undefined : (end < 0 ? bytes : bytes.subarray(0, end))
}

function readNumber(row: Uint8Array, field: Field | undefined): number | undefined {
  if (!field || !row.subarray(field.offset, field.offset + field.size).some((byte) => byte !== 0)) return undefined
  const view = dataView(row)
  // Paradox sorts its big-endian integers with the sign bit inverted.
  if (field.type === 3 && field.size === 2) return view.getUint16(field.offset) - 0x8000
  if ((field.type === 4 || field.type === 0x16) && field.size === 4) return view.getUint32(field.offset) - 0x80000000
  return undefined
}

function readLogical(row: Uint8Array, field: Field | undefined): boolean | undefined {
  if (field?.type !== 9 || field.size !== 1) return undefined
  const value = row[field.offset]
  return value === 0x81 ? true : value === 0x80 ? false : undefined
}

export function createParadoxMemo(bytes: Uint8Array, tableName: string, filename: string, maxMegabytes: number) {
  return {
    bytes, view: dataView(bytes), invalid: `ตำแหน่งหรือขนาดข้อมูลใน ${filename} ไม่ตรงกับ ${tableName}`,
    limit: maxMegabytes * 1024 * 1024, tooLarge: `ข้อมูลใน ${filename} มีขนาดเกิน ${maxMegabytes} MB ต่อรายการ`,
  }
}

function readMemo(row: Uint8Array, field: Field, source: ReturnType<typeof createParadoxMemo>): Uint8Array | undefined {
  const { bytes: memo, view: memoView, invalid, limit, tooLarge } = source
  if (field.size < MEMO_REFERENCE_BYTES) throw new Error(invalid)
  const reference = field.offset + field.size - MEMO_REFERENCE_BYTES
  const view = dataView(row)
  const length = view.getUint32(reference + 4, true)
  if (!length) return undefined
  if (length <= field.size - MEMO_REFERENCE_BYTES) return row.subarray(field.offset, field.offset + length)
  if (length > limit) throw new Error(tooLarge)

  const pointer = view.getUint32(reference, true)
  const revision = view.getUint16(reference + 8, true)
  const index = pointer % 256
  const block = pointer - index
  if (!block || block % MEMO_BLOCK_BYTES !== 0 || block + 3 > memo.length || memo[0] !== 0) {
    throw new Error(invalid)
  }
  const blocks = memoView.getUint16(block + 1, true)
  const end = block + blocks * MEMO_BLOCK_BYTES
  if (!blocks || end > memo.length) throw new Error(invalid)

  let start: number
  if (memo[block] === 2) {
    start = block + 9
    if (index !== 255 || memoView.getUint32(block + 3, true) !== length
      || memoView.getUint16(block + 7, true) !== revision) throw new Error(invalid)
  } else if (memo[block] === 3 && index < 64 && blocks === 1) {
    const entry = block + 12 + 5 * index
    const parts = memo[entry + 1]
    const lastPart = memo[entry + 4]
    start = block + memo[entry] * 16
    if (start < block + 12 + 5 * 64 || !parts || lastPart > 16 || (parts - 1) * 16 + lastPart !== length
      || memoView.getUint16(entry + 2, true) !== revision) {
      throw new Error(invalid)
    }
  } else {
    throw new Error(invalid)
  }
  if (start + length > end) throw new Error(invalid)
  return memo.subarray(start, start + length)
}

export function readEasyWorshipParadoxTable(table: Uint8Array, tableName: string) {
  const invalidTable = tableName === 'Songs.DB' ? INVALID_TABLE : `ฐานข้อมูล ${tableName} เสียหายหรือใช้รูปแบบที่ยังไม่รองรับ`
  if (!isEasyWorshipParadoxTable(table, table.length)) throw new Error(invalidTable)
  const view = dataView(table)
  const recordSize = view.getUint16(0, true)
  const blockSize = table[5] * 1024
  const fieldCount = view.getUint16(33, true)
  const codePage = view.getUint16(106, true)
  const encryption = view.getUint32(37, true)
  if (encryption === 0xff00ff00 ? view.getUint32(92, true) : encryption) {
    throw new Error(`ฐานข้อมูล ${tableName} ใช้การเข้ารหัสของ Paradox`)
  }

  const fields = readFields(table, fieldCount, recordSize, invalidTable)
  function* rows(): Generator<EasyWorshipParadoxRow> {
    const visited = new Set<number>()
    for (let block = view.getUint16(14, true); block; ) {
      const position = HEADER_BYTES + (block - 1) * blockSize
      if (visited.has(block) || position + blockSize > table.length) throw new Error(invalidTable)
      visited.add(block)
      const lastRecordOffset = view.getInt16(position + 4, true)
      const rowBytes = lastRecordOffset + recordSize
      if (rowBytes < 0 || (lastRecordOffset >= 0 && rowBytes % recordSize !== 0)
        || rowBytes > blockSize - BLOCK_HEADER_BYTES) throw new Error(invalidTable)

      const base = position + BLOCK_HEADER_BYTES
      const count = Math.floor(rowBytes / recordSize)
      for (let index = 0; index < count; index++) {
        const start = base + index * recordSize
        const row = table.subarray(start, start + recordSize)
        yield {
          position: `${block}:${index}`,
          alpha: (name: string) => readAlpha(row, fields.get(name)),
          number: (name: string) => readNumber(row, fields.get(name)),
          logical: (name: string) => readLogical(row, fields.get(name)),
          memo: (name: string, source: ReturnType<typeof createParadoxMemo>) => {
            const field = fields.get(name)
            return field && [0x0c, 0x0d, 0x0e].includes(field.type) ? readMemo(row, field, source) : undefined
          },
        }
      }
      block = view.getUint16(position, true)
    }
  }
  return { codePage, fields, rows: rows() }
}

export function readEasyWorshipParadox(table: Uint8Array, memo: Uint8Array) {
  const { codePage, fields, rows } = readEasyWorshipParadoxTable(table, 'Songs.DB')
  const words = fields.get('words')
  if (fields.get('title')?.type !== 1 || !words || ![0x0c, 0x0d, 0x0e].includes(words.type) || words.size < MEMO_REFERENCE_BYTES) {
    throw new Error('ไม่พบคอลัมน์ชื่อเพลงและเนื้อร้องในฐานเพลง Songs.DB รุ่นเก่า')
  }

  const memoSource = createParadoxMemo(memo, 'Songs.DB', 'Songs.MB', 1)
  const records: RawSong[] = []
  const usedIds = new Set<number>()
  for (const row of rows) {
    const recordId = row.number('recid')
    const hasUniqueId = recordId !== undefined && recordId > 0 && !usedIds.has(recordId)
    if (hasUniqueId) usedIds.add(recordId)
    const record: RawSong = {
      sourceId: hasUniqueId ? String(recordId) : row.position,
      row,
      title: row.alpha('title'),
      author: row.alpha('author'),
      copyright: row.alpha('copyright'),
      administrator: row.alpha('administrator'),
      ccli: row.number('song number') ?? row.alpha('song number'),
    }
    try {
      record.words = row.memo('words', memoSource)
    } catch (error) {
      record.error = error instanceof Error ? error.message : memoSource.invalid
    }
    records.push(record)
  }
  return { codePage, records }
}
