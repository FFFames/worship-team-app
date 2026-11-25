/** Verifies that archive detection never pairs song databases from separate profiles. */

import { BlobReader, BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'
import { reviewEasyWorshipArchive } from './easyWorshipArchive'
import { reviewEasyWorshipSqliteFiles } from './easyWorshipSongLibrary'

async function makeArchive(names: string[]) {
  const archive = new ZipWriter(new BlobWriter())
  for (const name of names) await archive.add(name, new TextReader('test entry'), { level: 0 })
  return new File([await archive.close()], 'profiles.ewprofile')
}

describe('EasyWorship archive discovery', () => {
  it('asks which complete database pair to use when several are present', async () => {
    const file = await makeArchive([
      'A/Databases/Data/Songs.db', 'A/Databases/Data/SongWords.db',
      'B/Databases/Data/SONGS.DB', 'B/Databases/Data/SONGWORDS.DB',
      'C/Databases/Data/Songs.db',
    ])

    const result = await reviewEasyWorshipArchive(file)
    expect(result.profiles).toEqual(['A/Databases/Data', 'B/Databases/Data'])
    expect(result.preview).toBeUndefined()
  })

  it('recovers words from a different folder without pairing them with an unrelated Songs.db', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database()
    db.run("CREATE TABLE word (song_id INTEGER, words TEXT); INSERT INTO word VALUES (7,'Recovered words');")
    const archive = new ZipWriter(new BlobWriter())
    await archive.add('A/Songs.db', new TextReader('unrelated catalog'))
    await archive.add('B/SongWords.dat', new BlobReader(new Blob([new Uint8Array(db.export())])))
    db.close()
    const result = await reviewEasyWorshipArchive(new File([await archive.close()], 'partial.zip'))
    expect(result.profiles).toEqual(['B'])
    expect(result.preview).toMatchObject({ recoveredLyricsOnly: true, songs: [{ title: 'เพลงกู้คืน #7 · Recovered words', author: null }] })
  })

  it('keeps a backup with duplicate catalog names from blocking review of another backup', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database()
    db.run("CREATE TABLE word (song_id INTEGER, words TEXT); INSERT INTO word VALUES (7,'Words from selected backup');")
    const words = new Blob([new Uint8Array(db.export())])
    db.close()
    const archive = new ZipWriter(new BlobWriter())
    await archive.add('Church/Databases/Archive/Older/Songs.db', new TextReader('first invalid copy'))
    await archive.add('Church/Databases/Archive/Older/SONGS.DB', new TextReader('second invalid copy'))
    await archive.add('Church/Databases/Archive/Older/SongWords.db', new BlobReader(words))
    await archive.add('Church/Databases/Archive/Newer/SongWords.dat', new BlobReader(words))
    const file = new File([await archive.close()], 'several-backups.zip')
    const discovery = await reviewEasyWorshipArchive(file)
    expect(discovery.profiles).toEqual(['Church/Databases/Archive/Older', 'Church/Databases/Archive/Newer'])
    const newer = await reviewEasyWorshipArchive(file, discovery.profiles[1])
    expect(newer.preview).toMatchObject({
      recoveredLyricsOnly: true, songs: [{ title: 'เพลงกู้คืน #7 · Words from selected backup' }],
    })
    expect(newer.preview?.warnings?.join('\n')).not.toContain('ซ้ำ')
    const older = await reviewEasyWorshipArchive(file, discovery.profiles[0])
    expect(older.preview?.songs[0].title).toBe('เพลงกู้คืน #7 · Words from selected backup')
    expect(older.preview?.warnings).toContain('พบไฟล์ Songs.db ซ้ำในโปรไฟล์เดียวกัน')
  })

  it('applies a words-only WAL to the chosen snapshot and reports a truncated tail', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database()
    db.run("PRAGMA page_size=512; CREATE TABLE word (song_id INTEGER, words TEXT); INSERT INTO word VALUES (7,'Saved before WAL');")
    const main = new Uint8Array(db.export())
    db.close()
    main[18] = main[19] = 2

    // SQLite wrote one page for UPDATE word SET words='Read from WAL' WHERE song_id=7.
    const hex = (value: string) => Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16))
    const wal = new Uint8Array(569)
    wal.set(hex('377f0682002de218000002000000000100000001baf2b896d6cb0313265dcd72000000020000000200000001baf2b8968d9fe387df91f480'))
    wal.set(hex('0d0000000101ed0001ed00000000'), 56)
    wal.set(hex('110103012707526561642066726f6d2057414c'), 549)
    // The final byte is the start of an incomplete frame.
    const archive = new ZipWriter(new BlobWriter())
    await archive.add('Latest/SongWords.dat', new BlobReader(new Blob([main])))
    await archive.add('Latest/SONGWORDS.DAT-WAL', new BlobReader(new Blob([wal])))
    await archive.add('Older/SongWords.dat', new BlobReader(new Blob([main])))
    const file = new File([await archive.close()], 'words-wal.zip')
    const latest = await reviewEasyWorshipArchive(file, 'Latest')
    expect(latest.preview?.songs[0].title).toBe('เพลงกู้คืน #7 · Read from WAL')
    expect(latest.preview?.warnings?.join('\n')).toContain('ส่วนท้ายไฟล์ WAL ไม่ครบ')
    const older = await reviewEasyWorshipArchive(file, 'Older')
    expect(older.preview?.songs[0].title).toBe('เพลงกู้คืน #7 · Saved before WAL')
    expect(older.preview?.warnings).toEqual([])

    const words = new File([main], 'SongWords.dat')
    const journal = new File([wal], 'SONGWORDS.DAT-WAL')
    const loose = await reviewEasyWorshipSqliteFiles({ words, walFiles: [journal] })
    expect(loose).toEqual(latest.preview)
    await expect(reviewEasyWorshipSqliteFiles({ words, walFiles: [journal, new File([wal], 'SongWords.dat-wal')] }))
      .rejects.toThrow('พบไฟล์ -wal ของ SongWords.dat ซ้ำ')
    await expect(reviewEasyWorshipSqliteFiles({ words, walFiles: [new File([wal], 'Songs.db-wal')] }))
      .rejects.toThrow('ไม่พบฐานข้อมูลคู่กับ Songs.db-wal')
  })
})
