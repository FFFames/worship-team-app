/** Regression coverage for the documented EasyWorship SQLite EWB format. */

import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'
import { readEasyWorshipBible, readEasyWorshipBibleInfo } from './easyWorshipBible'
import { reviewEasyWorshipProfile } from './easyWorshipProfile'
import { attachEasyWorshipProfileBibles, createEasyWorshipProfileFiles } from './easyWorshipProfileFiles'
import { reviewEasyWorshipScheduleBibles } from './easyWorshipScheduleBibles'

async function deflate(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate'))
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer())
  const result = new Uint8Array(compressed.length + 10)
  result.set(compressed)
  const byteLength = new TextEncoder().encode(text).byteLength
  result.set([0x51, 0x4b, 0x03, 0x04, byteLength & 0xff, (byteLength >> 8) & 0xff,
    (byteLength >> 16) & 0xff, (byteLength >> 24) & 0xff, 0x08, 0x00], compressed.length)
  return result
}

function verseInfo(entries: Array<{ chapter: number; verse: number; text: string }>): Uint8Array {
  let pointer = 0
  const result = new Uint8Array(entries.length * 8)
  for (const [index, entry] of entries.entries()) {
    const offset = index * 8
    const packedPointer = pointer * 4 + Math.floor(entry.text.length / 0x100)
    result[offset] = entry.text.length % 0x100
    result[offset + 1] = packedPointer & 0xff
    result[offset + 2] = (packedPointer >> 8) & 0xff
    result[offset + 3] = (packedPointer >> 16) & 0xff
    result[offset + 4] = entry.verse * 4
    result[offset + 5] = entry.chapter * 4
    result[offset + 6] = 4
    result[offset + 7] = 2
    pointer += entry.text.length
  }
  return result
}

async function makeBible(key = 0, pluginVersion = 1, translationId = 17): Promise<File> {
  const entries = [
    { chapter: 1, verse: 1, text: 'In the beginning' },
    { chapter: 1, verse: 2, text: 'พระเจ้าทรงรักโลก' },
    { chapter: 1, verse: 3, text: 'After Thai text' },
  ]
  const SQL = await initSqlJs()
  const database = new SQL.Database()
  database.run([
    'CREATE TABLE header (id INTEGER, key INTEGER, name TEXT, abbrev_name TEXT, lang_code TEXT, plugin_version INTEGER, format_version INTEGER, copyright TEXT, license TEXT);',
    'CREATE TABLE books (name TEXT, abbrev_name TEXT, alt_name TEXT, book_info BLOB, verse_info BLOB);',
    'CREATE TABLE streams (stream BLOB);',
    'CREATE TABLE words (word TEXT, verse_info BLOB);',
    `INSERT INTO header VALUES (${translationId}, ${key}, 'Test Bible', 'TB', 'TH', ${pluginVersion}, 1, '{\\rtf1\\ansi{\\fonttbl{\\f0 Test Font;}}Copyright test}', 'License test');`,
  ].join('\n'))
  database.run('INSERT INTO books(rowid, name, abbrev_name, alt_name, book_info, verse_info) VALUES (?, ?, ?, ?, ?, ?)',
    [1, 'Genesis', 'Gen', 'ปฐมกาล', new Uint8Array([1, 3]), verseInfo(entries)])
  database.run('INSERT INTO streams(rowid, stream) VALUES (?, ?)', [1, await deflate('\0\0' + entries.map((entry) => entry.text).join(''))])
  const bytes = database.export()
  database.close()
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new File([copy], 'test.ewb')
}

describe('readEasyWorshipBible', () => {
  it('reads format-1 SQLite books and uses character offsets for Thai Unicode text', async () => {
    const result = await readEasyWorshipBible(await makeBible())

    expect(result).toMatchObject({
      id: 'easyworship-17-tb', name: 'Test Bible', abbreviation: 'TB', language: 'TH',
      copyright: 'Copyright test', license: 'License test',
    })
    expect(result.books).toEqual([{
      id: '1', name: 'Genesis', abbreviation: 'Gen', aliases: ['Gen', 'ปฐมกาล'],
      verses: [
        { chapter: 1, verse: 1, text: 'In the beginning' },
        { chapter: 1, verse: 2, text: 'พระเจ้าทรงรักโลก' },
        { chapter: 1, verse: 3, text: 'After Thai text' },
      ],
    }])
  })

  it('does not attempt to bypass a protected edition', async () => {
    const file = await makeBible(99)
    expect(await readEasyWorshipBibleInfo(file)).toMatchObject({
      translationId: 17, edition: { id: 'easyworship-17-tb', name: 'Test Bible' }, warning: expect.stringContaining('ถูกป้องกัน'),
    })
    await expect(readEasyWorshipBible(file)).rejects.toThrow('ถูกป้องกัน')
  })

  it('accepts the verified version-2 plug-in envelope when its format remains version 1', async () => {
    await expect(readEasyWorshipBible(await makeBible(0, 2))).resolves.toMatchObject({ abbreviation: 'TB' })
  })

  it('previews external editions only for the selected profile and isolates unreadable files', async () => {
    const profiles = await createEasyWorshipProfileFiles(['Main', 'Youth'].map((name) => {
      const file = new File(['catalog marker'], 'Songs.db')
      Object.defineProperty(file, 'webkitRelativePath', { value: `${name}/Data/Songs.db` })
      return file
    }))
    const [main, youth] = profiles.profiles
    const files = attachEasyWorshipProfileBibles(profiles, main.id, [await makeBible(), new File(['damaged'], 'broken.ewb')])
    expect(profiles.profiles[0].bibles).toEqual([])
    expect((await reviewEasyWorshipProfile(files, youth.id)).review?.bibles).toEqual([])
    const bibles = (await reviewEasyWorshipProfile(files, main.id)).review?.bibles
    expect(bibles).toMatchObject([
      { filename: 'test.ewb', info: { translationId: 17, edition: { abbreviation: 'TB', language: 'TH' } }, warning: undefined },
      { filename: 'broken.ewb', warning: expect.stringContaining('SQLite') },
    ])
  })

  it('uses a matching schedule attachment and reports unused, protected, and ambiguous plug-ins', async () => {
    const matching = await makeBible()
    const unrelated = new File([await makeBible(0, 1, 23)], 'different.ewb')
    const protectedFile = new File([await makeBible(19)], 'protected.ewb')
    const attached = await reviewEasyWorshipScheduleBibles([matching, unrelated, protectedFile])
    expect(await attached.lookup(17)).toMatchObject({ id: 'easyworship-17-tb' })
    expect(attached.results()).toMatchObject({
      matched: ['TB · รหัส EasyWorship 17'],
      warnings: expect.arrayContaining([expect.stringContaining('different.ewb · ตารางนี้ไม่มีข้อที่อ้างรหัส EasyWorship 23'),
        expect.stringContaining('protected.ewb')]),
    })
    const installed = { ...await readEasyWorshipBible(matching), name: 'Installed copy' }
    const ambiguous = await reviewEasyWorshipScheduleBibles([matching, new File([matching], 'another.ewb')], async () => installed)
    expect(await ambiguous.lookup(17)).toBe(installed)
    expect(ambiguous.results().matched).toEqual([])
    expect(ambiguous.results().warnings).toContain('แนบพระคัมภีร์รหัส EasyWorship 17 หลายไฟล์ เลือกไฟล์ของฉบับนี้เพียงไฟล์เดียว')
    const uniqueMarker = await reviewEasyWorshipScheduleBibles([matching])
    expect(await uniqueMarker.lookup.byAbbreviation?.(' tb ')).toMatchObject({ id: 'easyworship-17-tb' })
    expect(await attached.lookup.byAbbreviation?.('TB')).toBeNull()
    expect(attached.results().warnings).toContain('แนบพระคัมภีร์ตัวย่อ TB หลายฉบับ เลือกฉบับที่ตรงกับตารางเพียงไฟล์เดียว')
  })
})
