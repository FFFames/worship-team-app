import { describe, expect, it } from 'vitest'
import { createEasyWorshipProfileFiles } from './easyWorshipProfileFiles'
import { sqliteWalSnapshot } from './sqliteWal'

const size = 512
const limit = 128 * 1024 * 1024

function headerPage(marker: number, pages: number) {
  const page = new Uint8Array(size)
  page.set(new TextEncoder().encode('SQLite format 3\0'))
  const view = new DataView(page.buffer)
  view.setUint16(16, size)
  page[18] = page[19] = 2
  view.setUint32(24, 7)
  view.setUint32(28, pages)
  view.setUint32(92, 7)
  page[100] = marker
  return page
}

function fromHex(hex: string) {
  return Uint8Array.from(hex.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16))
}

// Precomputed headers for an added page, a commit, and a later uncommitted rewrite.
const littleHeaders = [
  '377f0682002de2180000020000000000222233335555777707fe2535374f522f',
  '000000020000000022223333555577770e1362b4719933a0',
  '00000001000000022222333355557777eded723acc8f8acb',
  '000000010000000022223333555577776ba2df1b99e30085',
]
const bigHeaders = [
  '377f0683002de218000002000000000022223333555577773826fe0a34554f3a',
  '00000002000000002222333355557777ebdb0fafdaf915c4',
  '00000001000000022222333355557777e02703be8d88f208',
  '000000010000000022223333555577770a5cbdce74edcd71',
]

function walParts(encoded: string[]) {
  const [header, extension, commit, pending] = encoded.map(fromHex)
  return [header, extension, new Uint8Array(size).fill(97), commit, headerPage(98, 2), pending, headerPage(99, 2)]
}

function profileFile(path: string, file: Blob) {
  const result = new File([file], path.split('/').pop()!)
  Object.defineProperty(result, 'webkitRelativePath', { value: path })
  return result
}

describe('SQLite write-ahead log recovery', () => {
  it.each([littleHeaders, bigHeaders])('applies the last complete commit in either checksum byte order', async (...headers) => {
    const result = await sqliteWalSnapshot(new Blob([headerPage(0, 1)]), new Blob(walParts(headers)), limit)
    const copy = new Uint8Array(await result.database.arrayBuffer())
    expect(copy.length).toBe(2 * size)
    expect([copy[18], copy[19], copy[100], copy[size]]).toEqual([1, 1, 98, 97])
    expect(result).toMatchObject({ recovered: true, ignoredDamagedTail: false })
  })

  it('returns a verified commit before a truncated or corrupt tail', async () => {
    const parts = walParts(littleHeaders)
    const main = new Blob([headerPage(0, 1)])
    const full = new Blob(parts)
    const damaged = parts[6]
    damaged[100] ^= 0xff
    for (const wal of [full.slice(0, full.size - 1), new Blob(parts)]) {
      const result = await sqliteWalSnapshot(main, wal, limit)
      expect(result).toMatchObject({ recovered: true, ignoredDamagedTail: true })
      expect(new Uint8Array(await result.database.arrayBuffer())[100]).toBe(98)
    }
    await expect(sqliteWalSnapshot(main, full.slice(0, 42), limit)).rejects.toThrow('ไม่พบการบันทึกที่ครบถ้วน')
  })

  it('stops at stale frames left over after a checkpoint reset', async () => {
    const parts = walParts(littleHeaders)
    parts[5][8] ^= 0xff
    const result = await sqliteWalSnapshot(new Blob([headerPage(0, 1)]), new Blob(parts), limit)
    expect(result).toMatchObject({ recovered: true, ignoredDamagedTail: false })
  })

  it('opens a companion only alongside its own catalog and flags duplicate names', async () => {
    const db = new Blob([headerPage(0, 1)])
    const wal = new Blob(walParts(littleHeaders))
    const files = await createEasyWorshipProfileFiles([
      profileFile('Main/Data/Songs.db', db), profileFile('Main/Data/SONGS.DB-WAL', wal),
      profileFile('Youth/Data/Songs.db', db), profileFile('Youth/Other/Songs.db-wal', wal),
    ])
    const [main, youth] = files.profiles
    expect((await files.file(main.id, 'Main/Data/Songs.db')).size).toBe(2 * size)
    expect((await files.file(youth.id, 'Youth/Data/Songs.db')).size).toBe(size)
    const duplicates = await createEasyWorshipProfileFiles([
      profileFile('Main/Data/Songs.db', db), profileFile('Main/Data/SONGS.DB-WAL', wal), profileFile('Main/Data/Songs.db-wal', wal),
    ])
    await expect(duplicates.file(duplicates.profiles[0].id, 'Main/Data/Songs.db')).rejects.toThrow('ซ้ำ')
  })
})
