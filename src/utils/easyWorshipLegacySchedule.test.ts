import { describe, expect, it } from 'vitest'
import { readEasyWorshipSchedule } from './easyWorshipSchedule'
import { convertEasyWorshipCues, fillScheduleFormatting, recoverableScheduleFormatting } from './easyWorshipScheduleCues'
import { getPlaylistSlides } from './playlistCues'
import { scriptureOutputDesign, scriptureOutputLayout } from './scriptureOutput'
import { validPlaylistCue } from './playlistPackageManifest'
import { reviewEasyWorshipScheduleMedia } from './easyWorshipScheduleMedia'

const encoder = new TextEncoder()
const compoundDeck = new Uint8Array(512)
compoundDeck.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
const headers = { '1.6': [40, 848], '3': [48, 1528], '5': [56, 1816] } as const
type Version = keyof typeof headers
type Row = { type: number; name: Uint8Array; resource?: string; payload?: Uint8Array<ArrayBuffer>; customize?: (row: Uint8Array) => void }

async function textBlock(text: string) {
  const original = encoder.encode(text)
  const compressed = new Uint8Array(await new Response(new Blob([original]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer())
  const block = new Uint8Array(14 + compressed.length)
  const view = new DataView(block.buffer)
  view.setUint32(0, block.length - 4, true)
  block.set(compressed, 4)
  view.setUint32(block.length - 10, 0x514b0304)
  view.setUint32(block.length - 6, original.length, true)
  view.setUint16(block.length - 2, 8, true)
  return block
}

function binaryBlock(content: number[]) {
  const block = new Uint8Array(4 + content.length)
  new DataView(block.buffer).setUint32(0, content.length, true)
  block.set(content, 4)
  return block
}

function scheduleFile(version: Version, entries: Row[], filename = 'บริการ.ews') {
  const [countOffset, width] = headers[version]
  const directory = new Uint8Array(countOffset + 6 + width * entries.length)
  const blockType = 'EasyWorship Schedule File Version '
  directory.set(encoder.encode(blockType + version.padStart(38 - blockType.length)))
  const header = new DataView(directory.buffer)
  header.setUint32(countOffset, entries.length, true)
  header.setUint16(countOffset + 4, width, true)
  const payloads: Uint8Array<ArrayBuffer>[] = []
  let pointer = directory.length
  for (const [index, entry] of entries.entries()) {
    const row = directory.subarray(countOffset + 6 + width * index, countOffset + 6 + width * (index + 1))
    const view = new DataView(row.buffer, row.byteOffset, row.byteLength)
    row.set(entry.name, 0)
    if (entry.resource) row.set(encoder.encode(entry.resource), 51)
    view.setUint32(820, entry.type, true)
    if (entry.payload) {
      view.setUint32(800, pointer, true)
      pointer += entry.payload.length
      payloads.push(entry.payload)
    }
    entry.customize?.(row)
  }
  return new File([directory, ...payloads], filename)
}

describe('EasyWorship binary EWS schedules', () => {
  it('restores same-named binary schedule clips from their respective original folders', async () => {
    const firstPath = 'D:\\Service\\Baptism\\Loop.mp4'
    const secondPath = '\\\\server\\Service\\Offering\\Loop.mp4'
    const schedule = await readEasyWorshipSchedule(scheduleFile('5', [
      { type: 4, name: encoder.encode('Baptism'), resource: firstPath },
      { type: 4, name: encoder.encode('Offering'), resource: secondPath },
    ]))
    const cues = convertEasyWorshipCues(schedule)
    const clip = (path: string, data: string) => Object.defineProperty(new File([data], 'Loop.mp4'), 'webkitRelativePath', { value: path })
    const offering = clip('Copy/Service/Offering/Loop.mp4', 'blue')
    const baptism = clip('Copy/Service/Baptism/Loop.mp4', 'reds')
    const flat = await reviewEasyWorshipScheduleMedia(cues, [new File(['blue'], 'Loop.mp4')], true,
      undefined, undefined, schedule.externalMediaLocations)
    expect(flat.links.size).toBe(0)

    const reviewed = await reviewEasyWorshipScheduleMedia(cues, [offering, baptism], true,
      undefined, undefined, schedule.externalMediaLocations)
    const assets = reviewed.cues.map((cue) => cue.slides[0].assets![0])
    expect(assets.map((asset) => schedule.externalMediaLocations?.get(asset.easyWorshipSourceLocationId!))).toEqual([firstPath, secondPath])
    expect(await Promise.all(assets.map(({ archivePath }) => reviewed.attachments.get(archivePath!)?.text()))).toEqual(['reds', 'blue'])
    expect(reviewed.unresolved).toEqual([])
    expect(JSON.stringify(reviewed.cues)).not.toContain('Service')
  })

  it('keeps formatted Scripture compatible with portable playlists', async () => {
    const file = scheduleFile('5', [{ type: 2, name: encoder.encode('John 1:1 (KJV)'),
      payload: await textBlock(String.raw`{\rtf1\ansi {\i Selected words} in the verse}`) }])
    const lookup = Object.assign(async () => null, { byAbbreviation: async (marker: string) => marker === 'KJV' ? {
      id: 'easyworship-17-kjv', name: 'King James Version', abbreviation: 'KJV',
      books: [{ id: '43', name: 'John', abbreviation: 'Jn', verses: [] }],
    } : null })
    const [cue] = convertEasyWorshipCues(await readEasyWorshipSchedule(file, undefined, lookup))
    expect(cue.slides[0].lyricRuns?.[0]).toMatchObject({ text: 'Selected words', style: { italic: true } })
    expect(cue.slides[0].scriptureBookNames).toContainEqual({ name: 'John', abbreviation: 'Jn' })
    expect(validPlaylistCue(cue, () => true)).toBe(true)
  })

  it('keeps styled Thai fragments aligned across headings and fills only unedited slides on repeat import', async () => {
    const rtf = String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0 Arial;}{\f1 Tahoma;}}{\colortbl;\red0\green80\blue160;}
\pard\ql\f0\fs20 Verse 1\par
\pard\ql\li200\f0\fs20 บรรทัด {\b\cf1\f1\fs30 \'a1\'a2}\line {\i ต่อท้าย}\par
\pard\par
\pard\qr\f0\fs20 Chorus\par
\pard\qr\f0\fs20 {\ul Repeat}\par}`
    const file = scheduleFile('5', [{ type: 1, name: encoder.encode('Styled legacy song'), payload: await textBlock(rtf) }])
    const [cue] = convertEasyWorshipCues(await readEasyWorshipSchedule(file, '874'))
    const [verse, chorus] = cue.slides
    expect(verse.lines).toEqual(['บรรทัด กข', 'ต่อท้าย'])
    expect(verse.lyricRuns?.map((run) => run.text).join('')).toBe('บรรทัด กข\nต่อท้าย')
    expect(verse.lyricRuns).toContainEqual(expect.objectContaining({ text: 'กข\n', paragraph: expect.objectContaining({ leftIndent: 1 }),
      style: expect.objectContaining({ bold: true, fontFamily: 'Tahoma', color: '#0050a0', sizeScale: 1.5 }) }))
    expect(chorus.lyricRuns).toContainEqual(expect.objectContaining({ text: 'Repeat', align: 'right',
      style: expect.objectContaining({ underline: true }) }))

    const recovered = recoverableScheduleFormatting([cue])
    const old = { ...cue, slides: [
      { ...chorus, lyricRuns: [{ text: 'Repeat', style: { bold: true } }] },
      { ...verse, lyricRuns: undefined, label: 'ป้ายที่แก้เอง', advanceMs: 2500 },
      { ...verse, sourceId: 'user-added', lyricRuns: undefined },
    ] }
    const update = fillScheduleFormatting(old, recovered)
    expect(update).toEqual({ count: 1, cue: { ...old, slides: [old.slides[0], { ...old.slides[1], lyricRuns: verse.lyricRuns }, old.slides[2]] } })
    expect(fillScheduleFormatting(update!.cue, recovered)).toBeUndefined()
    const edited = { ...cue, slides: [{ ...verse, lines: ['คำที่แก้ในแอป'], lyricRuns: undefined }] }
    expect(fillScheduleFormatting(edited, recovered)).toBeUndefined()
  })

  it('preserves ordered occurrences, Thai characters and explicit background colors', async () => {
    const lyrics = await textBlock("{\\rtf1 Verse 1\\par\\'a1\\'a2\\par\\par Chorus\\par Amen\\par\\par Chorus\\par Amen}")
    const song = {
      type: 1, name: new Uint8Array([0xe0, 0xbe, 0xc5, 0xa7, 0xe4, 0xb7, 0xc2]), payload: lyrics,
      customize: (row: Uint8Array) => {
        row[510] = 1
        row[512] = 1
        row.set([0x20, 0x60, 0x80], 520)
        row.set([0x10, 0x20, 0x30], 524)
        row[528] = 1
        row[529] = 2
        row.set(encoder.encode('01234'), 1410)
      },
    }
    const result = await readEasyWorshipSchedule(scheduleFile('5', [
      song, { type: 2, name: encoder.encode('John 1:1'), payload: await textBlock('Scripture passage'),
        customize: (row) => {
          row.set(encoder.encode('John 1:1 (KJV)'), 307)
          row.set(encoder.encode('KJV'), 358)
          row[510] = 1
          row.set([0x12, 0x34, 0x56], 516)
        } }, song,
    ]), '874')

    expect(result.cues.map((cue) => [cue.id, cue.kind, cue.label])).toEqual([
      ['1', 'song', 'เพลงไทย'], ['2', 'scripture', 'John 1:1'], ['3', 'song', 'เพลงไทย'],
    ])
    const [first, scripture] = result.cues
    expect(first.metadata.referenceNumber).toBe('01234')
    expect(first.slides.map((slide) => [slide.label, slide.lines])).toEqual([
      ['Verse 1', ['กข']], ['Chorus', ['Amen']], ['Chorus', ['Amen']],
    ])
    expect(first.slides[0].design?.layers[0]).toMatchObject({ fill: {
      type: 'gradient', angle: 180, stops: [
        { color: '#206080', position: 0 }, { color: '#102030', position: 0.5 }, { color: '#206080', position: 1 },
      ],
    } })
    expect(scripture.slides[0]).toMatchObject({ label: 'John 1:1 (KJV)', lines: ['Scripture passage'] })
    expect(scripture.metadata).toMatchObject({ scripturePassage: 'John 1:1 (KJV)', abbreviation: 'KJV' })
    const cue = convertEasyWorshipCues(result)[1]
    const [projected] = getPlaylistSlides({ id: 'entry', playlist_id: 'service', cue, song_id: null, transpose: 0, order: 0, created_at: '' }, 4)
    const layout = scriptureOutputLayout(projected.scripture!, { reference: 'before-slide', completePassage: true })
    expect(scriptureOutputDesign(projected.design!, layout).layers).toMatchObject([
      { kind: 'fill', fill: { type: 'solid', color: '#123456' } },
      { slot: 'content', text: 'John 1:1 (KJV)\nScripture passage' },
    ])
  })

  it.each([
    ['pptx', Uint8Array.of(0x50, 0x4b, 3, 4, 1, 2, 3, 4)],
    ['ppt', compoundDeck],
  ] as const)('extracts a packed .%s deck and its cached images from the native presentation stream', async (extension, deck) => {
    const jpeg = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9)
    const stream = new Uint8Array(68 + 5 + jpeg.length)
    const header = new DataView(stream.buffer)
    header.setUint32(0, 48, true)
    stream.set(encoder.encode('$ezwppstream$'), 4)
    header.setUint32(44, 1, true)
    header.setUint32(48, 1, true)
    header.setUint32(52, 68, true)
    stream[68] = 1
    header.setUint32(69, jpeg.length, true)
    stream.set(jpeg, 73)
    const payload = new Uint8Array(8 + deck.length + stream.length)
    new DataView(payload.buffer).setUint32(0, deck.length, true)
    payload.set(deck, 8)
    payload.set(stream, 8 + deck.length)
    const sample = scheduleFile('5', [{ type: 3, name: encoder.encode('Announcement'), resource: `D:\\Decks\\Original.${extension}`, payload,
      customize: (row) => new DataView(row.buffer, row.byteOffset).setUint32(840, stream.length, true) }])
    const result = await readEasyWorshipSchedule(sample)
    const [cue] = result.cues
    expect(cue.metadata.presentationPreview).toBe(true)
    const [preview, original] = cue.slides[0].assets
    expect(preview.kind).toBe('image')
    expect(original).toMatchObject({ kind: 'powerpoint', filename: `Original.${extension}` })
    expect(new Uint8Array(await result.packedMedia!.get(preview.archivePath!)!.arrayBuffer())).toEqual(jpeg)
    expect(new Uint8Array(await result.packedMedia!.get(original.archivePath!)!.arrayBuffer())).toEqual(deck)
  })

  it('reads media by signature, preserves missing references, and hashes unchanged source bytes', async () => {
    const video = [0, 0, 0, 16, ...encoder.encode('ftypisom')]
    const paddedVideo = new Uint8Array(8 + video.length)
    new DataView(paddedVideo.buffer).setUint32(0, video.length, true)
    paddedVideo.set(video, 8)
    const entries = [
      { type: 7, name: encoder.encode('Packed Image'), resource: 'C:\\source\\photo.jpg',
        payload: binaryBlock([0xff, 0xd8, 0xff, 0xe0]) },
      { type: 4, name: encoder.encode('Packed Video'), resource: 'clip.mpg',
        payload: binaryBlock(video) },
      { type: 8, name: encoder.encode('Missing audio'), resource: 'music.wav' },
      { type: 5, name: encoder.encode('Camera') },
      { type: 4, name: encoder.encode('Packed Video with Padding'), resource: 'verified.mp4', payload: paddedVideo },
    ]
    const first = await readEasyWorshipSchedule(scheduleFile('5', entries))
    const second = await readEasyWorshipSchedule(scheduleFile('5', entries, 'renamed.ewsx'))

    expect(second.source.importId).toBe(first.source.importId)
    expect(first.cues.map((cue) => cue.kind)).toEqual(['image', 'video', 'audio', 'camera', 'video'])
    expect(first.cues[3].slides[0].assets).toEqual([{ kind: 'camera', filename: 'Camera', role: 'foreground' }])
    const image = first.cues[0].slides[0].assets[0]
    expect(image).toMatchObject({ filename: 'photo.jpg', role: 'foreground' })
    expect(first.packedMedia?.get(image.archivePath!)?.type).toBe('image/jpeg')
    expect([...first.packedMedia!.values()].map((asset) => asset.type)).toEqual(['image/jpeg', 'video/mp4', 'video/mp4'])
    const paddedPath = first.cues[4].slides[0].assets[0].archivePath!
    expect([...new Uint8Array(await first.packedMedia!.get(paddedPath)!.arrayBuffer())]).toEqual(video)
    expect(first.cues[2].slides[0].assets[0].archivePath).toBeUndefined()
    expect(first.cues[2].warnings[0]).toContain('music.wav')
  })

  it('handles earlier entry widths and keeps readable cues when one payload is truncated', async () => {
    const lyrics = await textBlock('Early song lyrics')
    for (const version of ['1.6', '3'] as const) {
      const file = scheduleFile(version, [
        { type: 1, name: encoder.encode('Corrupt payload'),
          customize: (row) => new DataView(row.buffer, row.byteOffset).setUint32(800, 100_000, true) },
        { type: 1, name: encoder.encode('Earlier song'), payload: lyrics },
      ])
      const result = await readEasyWorshipSchedule(file)
      expect(result.source.version).toBe(version)
      expect(result.cues[0].warnings[0]).toContain('บีบอัด')
      expect(result.cues[1].slides[0].lines).toEqual(['Early song lyrics'])
      const broken = new File([file.slice(0, 70)], 'truncated.ews')
      await expect(readEasyWorshipSchedule(broken)).rejects.toThrow('รายการในตาราง .ews')
    }
  })
})
