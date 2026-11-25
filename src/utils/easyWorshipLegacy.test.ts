import { BlobReader, BlobWriter, ZipWriter } from '@zip.js/zip.js'
import { describe, expect, it } from 'vitest'
import { reviewEasyWorshipArchive } from './easyWorshipArchive'
import { readEasyWorshipLegacySongs } from './easyWorshipLegacy'
import { readEasyWorshipSongLibrary } from './easyWorshipSongLibrary'

const fields = [
  { name: 'Title', type: 1, size: 30 },
  { name: 'RecID', type: 4, size: 4 },
  { name: 'Author', type: 1, size: 24 },
  { name: 'Copyright', type: 1, size: 24 },
  { name: 'Administrator', type: 1, size: 24 },
  { name: 'Song Number', type: 3, size: 2 },
  { name: 'Words', type: 12, size: 30 },
  { name: 'Default Background', type: 9, size: 1 },
  { name: 'BK Type', type: 3, size: 2 },
  { name: 'BK Color', type: 4, size: 4 },
  { name: 'Override Enabled', type: 9, size: 1 },
  { name: 'Text Color Default', type: 9, size: 1 },
  { name: 'Text Color', type: 4, size: 4 },
]
const text = new TextEncoder()
const asBytes = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16))
const headerBytes = 2048
const tableBlockBytes = 1024
const memoBlockBytes = 4096
const rowWidth = fields.reduce((size, field) => size + field.size, 0)
const firstRow = headerBytes + 6
const externalWords = text.encode("{\\rtf1\\ansi Verse 1\\par{\\b \\'be\\'c3\\'d0\\'a4\\'d8\\'b3}\\par\\par Chorus\\par Amen}")
const fontWords = text.encode("{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fcharset222 Test;}}\\f0 Verse 1\\par\\'a1\\'a2\\page Ending\\par\\'a4}")

function buildFixture(codePage = 874) {
  const table = new Uint8Array(headerBytes + 2 * tableBlockBytes)
  const view = new DataView(table.buffer)
  view.setUint16(0, rowWidth, true)
  view.setUint16(2, headerBytes, true)
  table[5] = 1
  view.setUint16(14, 1, true)
  view.setUint16(33, fields.length, true)
  view.setUint32(37, 0xff00ff00, true)
  view.setUint16(106, codePage, true)
  let nameOffset = 385 + fields.length * 6
  const offsets = new Map<string, number>()
  let recordOffset = 0
  for (const [index, field] of fields.entries()) {
    table.set([field.type, field.size], 120 + index * 2)
    const name = text.encode(field.name)
    table.set(name, nameOffset)
    nameOffset += name.length + 1
    offsets.set(field.name, recordOffset)
    recordOffset += field.size
  }

  const memo = new Uint8Array(3 * memoBlockBytes)
  const memoView = new DataView(memo.buffer)
  const single = memoBlockBytes
  memo[single] = 2
  memoView.setUint16(single + 1, 1, true)
  memoView.setUint32(single + 3, externalWords.length, true)
  memoView.setUint16(single + 7, 7, true)
  memo.set(externalWords, single + 9)

  const packed = 2 * memoBlockBytes
  const slot = 5
  const index = packed + 12 + 5 * slot
  const units = Math.ceil(fontWords.length / 16)
  memo[packed] = 3
  memoView.setUint16(packed + 1, 1, true)
  memo[index] = 21
  memo[index + 1] = units
  memoView.setUint16(index + 2, 7, true)
  memo[index + 4] = fontWords.length - (units - 1) * 16
  memo.set(fontWords, packed + 21 * 16)

  function row(start: number, id: number, title: Uint8Array, words: Uint8Array, pointer = 0) {
    table.set(title, start + offsets.get('Title')!)
    view.setUint32(start + offsets.get('RecID')!, 0x80000000 + id)
    const offset = start + offsets.get('Words')!
    if (!pointer) table.set(words, offset)
    const reference = offset + 20
    view.setUint32(reference, pointer, true)
    view.setUint32(reference + 4, words.length, true)
    if (pointer) view.setUint16(reference + 8, 7, true)
  }

  view.setUint16(headerBytes, 2, true)
  view.setInt16(headerBytes + 4, rowWidth, true)
  const secondBlock = headerBytes + tableBlockBytes
  view.setUint16(secondBlock + 2, 1, true)
  view.setInt16(secondBlock + 4, 0, true)
  row(firstRow, 112, asBytes('e0bec5a7e4b7c2'), externalWords, single + 255)
  table.set(asBytes('bcd9e9e1b5e8a7'), firstRow + offsets.get('Author')!)
  table.set(asBytes('c5d4a2cad4b7b8d4ec'), firstRow + offsets.get('Copyright')!)
  table.set(asBytes('bcd9e9b4d9e1c5'), firstRow + offsets.get('Administrator')!)
  view.setUint16(firstRow + offsets.get('Song Number')!, 0x8000 + 12345)
  row(firstRow + rowWidth, 118, text.encode('Font code page'), fontWords, packed + slot)
  row(secondBlock + 6, 129, asBytes('e0bec5a7cad1e9b9'), text.encode('Intro\nAmen'))
  return {
    view, memoView, secondBlock, offsets,
    tableFile: () => new File([table], 'Songs.DB'),
    memoFile: () => new File([memo], 'Songs.MB'),
  }
}

describe('EasyWorship legacy song migration', () => {
  it('reads inline, single-block and packed memo lyrics, including Thai metadata and slide order', async () => {
    const fixture = buildFixture()
    const { format, preview } = await readEasyWorshipSongLibrary(fixture.tableFile(), {
      memo: async () => fixture.memoFile(),
      songWords: async () => { throw new Error('Unexpected SQLite companion read') },
    })

    expect(format).toBe('paradox')
    expect(preview.skipped).toEqual([])
    expect(preview.songs[0].sections[0].lyricRuns).toEqual([{ text: 'พระคุณ', style: { bold: true } }])
    expect(preview.songs).toMatchObject([
      {
        sourceId: 'paradox:112', title: 'เพลงไทย', author: 'ผู้แต่ง', ccli: '12345',
        copyright: 'ลิขสิทธิ์ · ดูแลลิขสิทธิ์โดย ผู้ดูแล',
        sections: [{ label: 'Verse 1', lines: ['พระคุณ'] }, { label: 'Chorus', lines: ['Amen'] }],
      },
      {
        sourceId: 'paradox:118', title: 'Font code page',
        sections: [{ label: 'Verse 1', lines: ['กข'] }, { label: 'Ending', lines: ['ค'] }],
      },
      { sourceId: 'paradox:129', title: 'เพลงสั้น', sections: [{ label: 'Intro', lines: ['Amen'] }] },
    ])
  })

  it('uses a manual encoding override when the header names a different Windows locale', async () => {
    const fixture = buildFixture(437)
    const defaultPreview = await readEasyWorshipLegacySongs(fixture.tableFile(), fixture.memoFile())
    const thaiPreview = await readEasyWorshipLegacySongs(fixture.tableFile(), fixture.memoFile(), '874')

    expect(defaultPreview.songs[0].title).not.toEqual('เพลงไทย')
    expect(defaultPreview.songs[1].sections[0].lines).toEqual(['กข'])
    expect(thaiPreview.songs[0]).toMatchObject({
      title: 'เพลงไทย',
      sections: [{ label: 'Verse 1', lines: ['พระคุณ'] }, { label: 'Chorus', lines: ['Amen'] }],
    })
  })

  it('restores an explicit background and lets font-only overrides inherit the default', async () => {
    const fixture = buildFixture()
    const { view, offsets, secondBlock } = fixture
    const explicit = firstRow
    const defaulted = firstRow + rowWidth
    const textOnly = secondBlock + 6
    for (const row of [explicit, defaulted, textOnly]) {
      view.setUint8(row + offsets.get('Default Background')!, row === explicit ? 0x80 : 0x81)
      view.setUint16(row + offsets.get('BK Type')!, 0x8000)
      view.setUint32(row + offsets.get('BK Color')!, 0x80332211)
    }
    view.setUint8(textOnly + offsets.get('Override Enabled')!, 0x81)
    view.setUint8(textOnly + offsets.get('Text Color Default')!, 0x80)
    view.setUint32(textOnly + offsets.get('Text Color')!, 0x80665544)

    const { songs } = await readEasyWorshipLegacySongs(fixture.tableFile(), fixture.memoFile())
    expect(songs[0].appearance?.defaultDesign?.layers[0]).toMatchObject({ kind: 'fill', fill: { type: 'solid', color: '#112233' } })
    expect(songs[1].appearance).toBeUndefined()
    expect(songs[2].appearance?.defaultDesign).toMatchObject({
      inheritBackground: true, layers: [{ kind: 'text', slot: 'content', style: { color: '#445566' } }],
    })
    expect(songs.map((song) => song.sections[0].lines[0])).toEqual(['พระคุณ', 'กข', 'Amen'])
  })

  it('reports an inconsistent memo without dropping the rest of the table', async () => {
    const fixture = buildFixture()
    fixture.memoView.setUint16(memoBlockBytes + 7, 8, true)
    const preview = await readEasyWorshipLegacySongs(fixture.tableFile(), fixture.memoFile())

    expect(preview.songs.map((song) => song.sourceId)).toEqual(['paradox:118', 'paradox:129'])
    expect(preview.skipped).toMatchObject([
      { sourceId: 'paradox:112', title: 'เพลงไทย', reason: expect.stringContaining('Songs.MB') },
    ])
  })

  it('rejects cyclic or out-of-range record blocks', async () => {
    const fixture = buildFixture()
    fixture.view.setUint16(fixture.secondBlock, 1, true)
    await expect(readEasyWorshipLegacySongs(fixture.tableFile(), fixture.memoFile())).rejects.toThrow('ฐานเพลง Songs.DB รุ่นเก่าเสียหาย')
    fixture.view.setUint16(fixture.secondBlock, 0, true)
    fixture.view.setInt16(fixture.secondBlock + 4, rowWidth * 20, true)
    await expect(readEasyWorshipLegacySongs(fixture.tableFile(), fixture.memoFile())).rejects.toThrow('ฐานเพลง Songs.DB รุ่นเก่าเสียหาย')
  })

  it('matches a legacy companion in the same archive directory regardless of case', async () => {
    const fixture = buildFixture()
    const zip = new ZipWriter(new BlobWriter())
    await zip.add('Legacy/Databases/Data/Songs.DB', new BlobReader(fixture.tableFile()))
    await zip.add('legacy/databases/data/SONGS.mb', new BlobReader(fixture.memoFile()))
    await zip.add('Other/Songs.DB', new BlobReader(fixture.tableFile()))
    const archive = new File([await zip.close()], 'profile.ewprofile')

    const review = await reviewEasyWorshipArchive(archive)
    expect(review.profiles).toEqual(['Legacy/Databases/Data'])
    expect(review.format).toBe('paradox')
    expect(review.preview?.songs).toHaveLength(3)
  })
})
