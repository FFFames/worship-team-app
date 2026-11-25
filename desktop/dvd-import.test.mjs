import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import dvdImport from './dvd-import.cjs'
import titleTable from './dvd-title-table.cjs'

const selection = { title: 2, chapter: 2, lastChapter: 3, angle: 1, audio: 2 }

it('validates DVD chapter ranges and excludes arbitrary conversion parameters', () => {
  expect(dvdImport.dvdSelection({ ...selection, path: '/untrusted' })).toEqual(selection)
  expect(dvdImport.dvdSelection({ ...selection, chapter: 100 })).toBeUndefined()
  expect(dvdImport.dvdSelection({ ...selection, lastChapter: 1 })).toBeUndefined()
  expect(dvdImport.dvdSelection({ ...selection, audio: 9 })).toBeUndefined()
  expect(dvdImport.dvdSelection({ ...selection, subtitle: 32 })?.subtitle).toBe(32)
  expect(dvdImport.dvdSelection({ ...selection, subtitle: 33 })).toBeUndefined()
  expect(dvdImport.dvdSelection({ ...selection, subtitle: '2' })).toBeUndefined()
})

it('selects the native display variants of DVD subtitle tracks in disc order', () => {
  const report = `Input #0, dvdvideo, from 'DVD directory':
  Stream #0:0[0x1e0]: Video: mpeg2video, 720x480
  Stream #0:1[0x80](eng): Audio: ac3
  Stream #0:2[0x20](eng): Subtitle: dvd_subtitle (dvdsub)
    Metadata:
      VIEWPORT        : Widescreen
  Stream #0:3[0x22](eng): Subtitle: dvd_subtitle (dvdsub)
    Metadata:
      VIEWPORT        : Letterbox
  Stream #0:4[0x21](tha): Subtitle: dvd_subtitle (dvdsub)
    Metadata:
      VIEWPORT        : Widescreen
  Stream #0:5[0x23](tha): Subtitle: dvd_subtitle (dvdsub)
    Metadata:
      VIEWPORT        : Pan and Scan
At least one output file must be specified`
  expect(dvdImport.dvdStreams(report)).toEqual({
    audio: [{ stream: 1, language: 'eng' }], subtitles: [{ stream: 2, language: 'eng' }, { stream: 4, language: 'tha' }],
  })
  expect(dvdImport.dvdStreams('Could not open the DVD')).toEqual({ audio: [], subtitles: [] })
})

it('carries chapter and angle bounds through the authorized disc chooser and rejects a changed disc', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'worshipteam-dvd-inventory-'))
  try {
    const folder = path.join(base, 'VIDEO_TS')
    const manager = path.join(folder, 'VIDEO_TS.IFO')
    const bytes = Buffer.alloc(4096)
    bytes.write('DVDVIDEO-VMG')
    bytes.writeUInt32BE(1, 0xc4)
    bytes.writeUInt16BE(2, 2048)
    bytes.writeUInt32BE(31, 2052)
    bytes[2057] = 1
    bytes.writeUInt16BE(3, 2058)
    bytes[2069] = 4
    bytes.writeUInt16BE(7, 2070)
    await mkdir(folder)
    await writeFile(manager, bytes)
    const handlers = new Map()
    let opened = 0
    const owner = {}
    const dvd = dvdImport.registerDvdImport({
      ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
      dialog: { showOpenDialog: async () => { opened++; return { canceled: false, filePaths: [folder] } } },
      allowed: (sender) => sender === owner, ownerWindow: () => undefined,
    })
    expect(await handlers.get('dvd:choose')({})).toEqual({ state: 'error', error: 'settings' })
    expect(opened).toBe(0)
    const chosen = await handlers.get('dvd:choose')(owner)
    expect(chosen.disc.titles).toEqual([{ number: 1, chapters: 3, angles: 1 }, { number: 2, chapters: 7, angles: 4 }])
    expect(chosen.disc).not.toHaveProperty('root')
    expect(await handlers.get('dvd:tracks')(owner, chosen.disc.id, { ...selection, angle: 5 })).toEqual({ state: 'error', error: 'settings' })
    bytes.writeUInt16BE(6, 2070)
    await writeFile(manager, bytes)
    expect(await handlers.get('dvd:prepare')(owner, selection, chosen.disc.id)).toEqual({ state: 'error', error: 'disc' })
    expect(opened).toBe(1)
    dvd.close()
    bytes.writeUInt32BE(0xffffffff, 2052)
    await writeFile(manager, bytes)
    await expect(titleTable.readDvdTitleTable(manager)).rejects.toThrow('catalog')
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

it.skipIf(process.platform === 'win32')('rejects a header-only MP4 even when FFmpeg exits successfully', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'worshipteam-dvd-test-'))
  try {
    const source = path.join(folder, 'VIDEO_TS')
    const output = path.join(folder, 'clip.mp4')
    const encoder = path.join(folder, 'ffmpeg-fixture')
    await mkdir(source)
    await writeFile(path.join(source, 'VIDEO_TS.IFO'), '')
    await writeFile(encoder, `#!/usr/bin/env node
const { writeFileSync } = require('node:fs')
if (process.argv.includes('-demuxers')) console.log(' D  dvdvideo DVD-Video')
else if (process.argv.includes('-encoders')) console.log(' V..... libx264 H.264')
else {
  writeFileSync(process.argv.at(-1), 'MP4 header')
  console.log('frame=0\\nprogress=end')
}
`)
    await chmod(encoder, 0o700)
    await expect(dvdImport.convertDvd(source, output, selection, new AbortController().signal, undefined, encoder))
      .rejects.toThrow('convert')
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})
