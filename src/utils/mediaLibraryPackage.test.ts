/** Checks backup identity and schedule attachment validation before importing local resources. */

import { describe, expect, it } from 'vitest'
import { BlobReader, BlobWriter, ZipWriter } from '@zip.js/zip.js'
import { importMediaLibraryPackage, reviewMediaLibraryPackage } from './mediaLibraryPackage'
import { libraryMediaCueAsset, mediaLibraryAssetId, visibleLibraryMedia } from './mediaLibrary'
import type { MediaLibraryItem } from '../types/media'
import { defaultNurserySettings } from './nurseryAlerts'
import { historyBackupPath, mediaBackupPath, missingDefaultThemeMedia, parseMediaLibraryPackage, scriptureBackupPath,
  type MediaLibraryPackage } from './mediaLibraryPackageManifest'

const playlistId = '00000000-0000-4000-8000-000000000001'
const archivePath = 'packed/slides/background.png'
const blob = new Blob(['source bytes'], { type: 'image/png' })

async function contents(): Promise<Extract<MediaLibraryPackage, { version: 1 }>> {
  const id = await mediaLibraryAssetId(blob)
  return {
    format: 'worshipteam.media-library', version: 1,
    assets: [{ id, mime: blob.type, size: blob.size, library: false }],
    scheduleAssets: [{ playlistId, archivePath, assetId: id, mime: blob.type }],
    items: [], feeds: [], dvds: [], replacements: [], collectionSets: [],
  }
}

async function pack(manifest: MediaLibraryPackage, file: Blob, path = mediaBackupPath(manifest.assets[0].id), zip64 = false) {
  const writer = new ZipWriter(new BlobWriter(), { level: 0, zip64 })
  await writer.add('manifest.json', new BlobReader(new Blob([JSON.stringify(manifest)])))
  await writer.add(path, new BlobReader(file))
  return writer.close()
}

describe('WorshipTeam media library package', () => {
  it('counts an asset fallback only when its named catalog record is absent', () => {
    const item: MediaLibraryItem = { id: 'named', assetId: 'image', name: 'Catalog Photo', filename: 'photo.png',
      kind: 'image', size: 100, mediaType: 'image/png', addedAt: '' }
    const fallback: MediaLibraryItem = { ...item, name: 'photo.png', id: 'image', generatedReference: true }
    const another = { ...fallback, id: 'other', assetId: 'other' }
    expect(visibleLibraryMedia([fallback, item, another])).toEqual([item, another])
    expect(visibleLibraryMedia([fallback, another])).toEqual([fallback, another])
  })
  it('opens a valid package and validates its schedule links and archive layout', async () => {
    const manifest = await contents()
    await expect(reviewMediaLibraryPackage(await pack(manifest, blob))).resolves.toEqual(manifest)
    await expect(reviewMediaLibraryPackage(await pack(manifest, blob, 'wrong.png'))).rejects.toThrow('ไฟล์สื่อในแพ็กเกจ')
    const attachment = manifest.scheduleAssets[0]
    expect(() => parseMediaLibraryPackage({ ...manifest, scheduleAssets: [{ ...attachment, archivePath: 'packed/../background.png' }] }))
      .toThrow('ข้อมูลไฟล์ในตาราง')
    expect(() => parseMediaLibraryPackage({ ...manifest, scheduleAssets: [attachment, attachment] })).toThrow('ข้อมูลไฟล์ในตาราง')
  })

  it('restores valid catalog playback defaults and rejects invalid values', async () => {
    const base = await contents()
    const asset = { ...base.assets[0], mime: 'video/mp4', library: true }
    const item = { id: asset.id, assetId: asset.id, size: asset.size, filename: 'test.mp4', kind: 'video',
      name: 'Intro', mediaType: asset.mime, addedAt: '2026-11-24', playbackEdited: true,
      playback: { volume: 0, muted: false, fit: 'contain', repeat: false } }
    const manifest = { ...base, assets: [asset], scheduleAssets: [], items: [item] }
    expect(parseMediaLibraryPackage(manifest).items).toEqual([item])
    expect(() => parseMediaLibraryPackage({ ...manifest, items: [{ ...item, playback: { ...item.playback, volume: -1 } }] }))
      .toThrow('รายการสื่อในแพ็กเกจ')
  })

  it('restores edited visual defaults and resolves usage into portable cue settings', async () => {
    const base = await contents()
    const asset = { ...base.assets[0], library: true }
    const image: MediaLibraryItem = { id: asset.id, assetId: asset.id, size: asset.size, filename: 'test.png', kind: 'image',
      name: 'Portrait', mediaType: asset.mime, addedAt: '2026-11-25', usageEdited: true, playback: { usage: 'background' } }
    const manifest = { ...base, assets: [asset], scheduleAssets: [], items: [image] }
    expect(parseMediaLibraryPackage(manifest).items).toEqual([image])
    expect(libraryMediaCueAsset(image, 'foreground')).toMatchObject({ role: 'foreground', playback: { fit: 'fill' } })
    const video: MediaLibraryItem = { ...image, filename: 'test.mp4', kind: 'video', mediaType: 'video/mp4',
      playback: { usage: 'background', fit: 'contain', repeat: false } }
    expect(libraryMediaCueAsset(video, 'foreground')).toMatchObject({ playback: { fit: 'contain' }, repeat: false })
    expect(() => parseMediaLibraryPackage({ ...manifest, items: [{ ...image, playback: { ...image.playback, muted: true } }] }))
      .toThrow('รายการสื่อในแพ็กเกจ')
  })

  it('restores selected video frames and explicit resets with valid poster positions', async () => {
    const base = await contents()
    const asset = { ...base.assets[0], mime: 'video/mp4', library: true }
    const item = { id: asset.id, assetId: asset.id, size: asset.size, filename: 'test.mp4', kind: 'video',
      name: 'Intro', mediaType: asset.mime, addedAt: '2026-11-24', posterSeconds: 0, posterEdited: true }
    const manifest = { ...base, assets: [asset], scheduleAssets: [], items: [item] }
    expect(parseMediaLibraryPackage(manifest).items).toEqual([item])
    const reset = { ...item, posterSeconds: undefined }
    expect(parseMediaLibraryPackage({ ...manifest, items: [reset] }).items).toEqual([reset])
    for (const posterSeconds of [-1, Infinity, '5', null]) {
      expect(() => parseMediaLibraryPackage({ ...manifest, items: [{ ...item, posterSeconds }] })).toThrow('รายการสื่อในแพ็กเกจ')
    }
    const audio = { ...item, kind: 'audio', filename: 'intro.mp3', mediaType: 'audio/mpeg' }
    expect(() => parseMediaLibraryPackage({ ...manifest, assets: [{ ...asset, mime: audio.mediaType }], items: [audio] }))
      .toThrow('รายการสื่อในแพ็กเกจ')
  })

  it('rejects replacement bytes with a valid ZIP checksum but a different stable asset ID', async () => {
    const manifest = await contents()
    const substituted = new Blob(['edited bytes'], { type: blob.type })
    expect(substituted.size).toBe(blob.size)
    await expect(importMediaLibraryPackage(await pack(manifest, substituted, undefined, true))).rejects.toThrow('เนื้อหาไฟล์สื่อไม่ตรงกับรหัส')
  })

  it('keeps the exact manifest size of a ZIP64 media entry above 4 GiB', async () => {
    const manifest = await contents()
    manifest.assets[0].size = 4 * 1024 ** 3 + 1
    expect(parseMediaLibraryPackage(manifest).assets[0].size).toBe(4_294_967_297)
    await expect(reviewMediaLibraryPackage(await pack(manifest, blob, undefined, true))).rejects.toThrow('ขนาดไม่ตรงกับรายการ')
  })

  it('accepts a Scripture-only package and rejects a substituted edition or invalid verse', async () => {
    const edition = { id: 'easyworship-17-kjv', name: 'ฉบับทดสอบ', abbreviation: 'KJV',
      books: [{ id: '43', name: 'John', verses: [{ chapter: 3, verse: 16, text: 'Test verse' }] }] }
    const file = new Blob([JSON.stringify(edition)])
    const { id, name, abbreviation } = edition
    const manifest: MediaLibraryPackage = { ...await contents(), version: 2, assets: [], scheduleAssets: [],
      scriptureEditions: [{ id, name, abbreviation, size: file.size }] }
    const path = scriptureBackupPath(0)
    await expect(reviewMediaLibraryPackage(await pack(manifest, file, path))).resolves.toEqual(manifest)
    await expect(reviewMediaLibraryPackage(await pack(manifest, file, 'scripture/1.json'))).rejects.toThrow('ไฟล์พระคัมภีร์ในแพ็กเกจ')
    expect(() => parseMediaLibraryPackage({ ...manifest, version: 1 })).toThrow('รุ่นของแพ็กเกจ')
    for (const modified of [JSON.stringify(edition).replace('17-kjv', '18-kjv'), JSON.stringify(edition).replace('"verse":16', '"verse":-6')]) {
      await expect(importMediaLibraryPackage(await pack(manifest, new Blob([modified]), path))).rejects.toThrow('ข้อมูลพระคัมภีร์')
    }
  })

  it('accepts an alert-only package with native timers and rejects invalid times and duplicate templates', () => {
    const alert = { id: playlistId, title: 'นับถอยหลัง', text: '{{เวลานมัสการ}}', output: 'stage',
      playback: { mode: 'static', alignment: 'right', passes: null, endOnToken: true },
      source: { profileName: 'Default', rowId: '8', rtf: '{\\rtf1}', displayType: 0, alignment: 2, endType: 2, repeatCount: null,
        endToken: '1', tokens: [{ id: '1', name: 'เวลานมัสการ', uid: null, type: 5, format: 'mm:ss', interval: 0,
          timeValue: null, fixedTime: null, allowOverrun: null }],
        serviceIntervals: [{ startDay: 0, startSeconds: 36000, endDay: 0, endSeconds: 41400 }] } }
    const manifest = { format: 'worshipteam.media-library', version: 3, assets: [], scheduleAssets: [], items: [], feeds: [], dvds: [],
      replacements: [], collectionSets: [], scriptureEditions: [], alertTemplates: [alert] }
    expect(parseMediaLibraryPackage(manifest)).toEqual(manifest)
    expect(() => parseMediaLibraryPackage({ ...manifest, version: 2 })).toThrow('รุ่นของแพ็กเกจ')
    expect(() => parseMediaLibraryPackage({ ...manifest, alertTemplates: [alert, alert] })).toThrow('ข้อมูลข้อความแจ้งเตือน')
    const formatted = { ...alert, runs: [{ text: alert.text, style: { bold: true, outline: { width: 0.05 } } }] }
    expect(parseMediaLibraryPackage({ ...manifest, alertTemplates: [formatted] }).alertTemplates).toEqual([formatted])
    expect(() => parseMediaLibraryPackage({ ...manifest, alertTemplates: [{ ...formatted, text: 'Changed' }] })).toThrow('ข้อมูลข้อความแจ้งเตือน')
    alert.source.serviceIntervals[0].startSeconds = 86400
    expect(() => parseMediaLibraryPackage(manifest)).toThrow('ข้อมูลข้อความแจ้งเตือน')
  })

  it('previews a history-only package and rejects mismatched event counts before restoring', async () => {
    const history = { id: playlistId, name: 'ประวัติจาก EasyWorship', filename: 'SongHistory.db', songs: [],
      actions: [{ id: '9223372036854775807', songId: null, type: '48', originalDate: '134321760001234567', originalTransmitDate: null }] }
    const payload = new Blob([JSON.stringify(history)])
    const descriptor = { id: history.id, name: history.name, size: payload.size, actions: 1, savedAt: 1795500000000 }
    const manifest: MediaLibraryPackage = { ...await contents(), version: 4, assets: [], scheduleAssets: [],
      scriptureEditions: [], alertTemplates: [], songHistories: [descriptor] }
    const path = historyBackupPath(0)
    await expect(reviewMediaLibraryPackage(await pack(manifest, payload, path))).resolves.toEqual(manifest)
    await expect(reviewMediaLibraryPackage(await pack(manifest, payload, 'other.json'))).rejects.toThrow('ไฟล์ประวัติการใช้เพลงในแพ็กเกจ')
    const altered = await pack({ ...manifest, songHistories: [{ ...descriptor, actions: 2 }] }, payload, path)
    await expect(importMediaLibraryPackage(altered)).rejects.toThrow('ข้อมูลประวัติการใช้เพลง')
  })

  it('preserves explicit default-theme resets and reports media unavailable in the packaged library', async () => {
    const base = await contents()
    const assetId = base.assets[0].id
    const asset = { kind: 'image', filename: 'theme.png', libraryId: assetId }
    const theme = { id: 'song-theme', title: 'ธีมจอผู้ชม', slides: [{ id: 'verse', label: 'Verse', design: { aspectRatio: 16 / 9,
      layers: [{ kind: 'media', id: 'art', frame: { x: 0, y: 0, width: 1, height: 1 }, asset }] } }] }
    const manifest = { ...base, version: 5, scriptureEditions: [], alertTemplates: [], songHistories: [],
      defaultThemes: { 'live:song': theme, 'alternate:presentation': null, 'live:logo': { ...theme, looping: true } } }
    const parsed = parseMediaLibraryPackage(manifest)
    expect(parsed.defaultThemes?.['alternate:presentation']).toBeNull()
    expect(parsed.defaultThemes?.['live:logo']).toEqual({ ...theme, looping: true })
    expect(missingDefaultThemeMedia(parsed)).toEqual(['theme.png'])
    const included = parseMediaLibraryPackage({ ...manifest, assets: base.assets.map((asset) => ({ ...asset, library: true })) })
    expect(missingDefaultThemeMedia(included)).toEqual([])
    expect(() => parseMediaLibraryPackage({ ...manifest, defaultThemes: { 'stage:song': theme } })).toThrow('ข้อมูลธีมเริ่มต้น')
    asset.libraryId = 'unrecognized'
    expect(() => parseMediaLibraryPackage(manifest)).toThrow('ข้อมูลธีมเริ่มต้น')
  })

  it('accepts presentation control maps and disallows transferring device IDs and invalid channels', async () => {
    const presentationControls = { keyboard: null, midiInput: { channel: 3, bindings: { nextSlide: { kind: 'note', number: 42 } }, followMaster: true },
      midiOutput: { channel: 9, notes: { slideNumber: 29 }, groups: { schedule: true, overlays: true, playback: false }, forwardInput: false } }
    const input = { ...await contents(), version: 6, scriptureEditions: [], alertTemplates: [], songHistories: [], defaultThemes: {}, presentationControls }
    expect(parseMediaLibraryPackage(input).presentationControls).toEqual(presentationControls)
    for (const controls of [{ ...presentationControls, midiInput: { ...presentationControls.midiInput, inputId: 'device-on-another-computer' } },
      { ...presentationControls, midiOutput: { ...presentationControls.midiOutput, channel: 17 } }]) {
      expect(() => parseMediaLibraryPackage({ ...input, presentationControls: controls })).toThrow('ข้อมูลปุ่มลัดหรือ MIDI')
    }
  })

  it('validates output margin groups and excludes physical assignments from the package', async () => {
    const outputAppearance = { live: { top: 10, right: 20, bottom: 30, left: 40 }, alternateLayers: { background: false, foreground: true },
      songLabels: { live: false, alternate: true }, scripture: {
        live: { reference: 'after-slide', completePassage: false, pagination: { flow: true, breakOnVerse: false, minFontRatio: .06 },
          fonts: { text: { fontFamily: 'Tahoma', bold: true },
          number: { sizeScale: 0.55 }, reference: { color: '#ffcc00', fontRatio: 0.05, effects: { fontOpacity: 50 } } } },
        alternate: { reference: 'after-passage', completePassage: true, abbreviateBooks: true, referenceInsets: { left: .06, top: .025, bottom: 0 } },
      }, foldback: { nextLines: 1, next: { fontFamily: 'Tahoma', textColor: '#00aaff' },
        clock: { enabled: false, format: 'HH:NN:SS', position: 'bottom-left' } },
      foldbackService: { enabled: true, intervals: [{ startDay: 0, endDay: 0, startSeconds: 32400, endSeconds: 36000 }],
        format: 'hh:nn{ss}', allowOverrun: true },
      foldbackContent: { song: { fontFamily: 'Georgia', align: 'left', normalize: true,
        layout: { sizing: 'fit', insets: { left: 0.1 } } }, scripture: { verticalAlign: 'bottom' } } }
    const input = { ...await contents(), version: 7, scriptureEditions: [], alertTemplates: [], songHistories: [], defaultThemes: {},
      presentationControls: {}, outputAppearance }
    expect(parseMediaLibraryPackage(input).outputAppearance).toEqual(outputAppearance)
    for (const appearance of [{ ...outputAppearance, displays: { live: {} } }, { ...outputAppearance, live: { ...outputAppearance.live, left: -1 } },
      { ...outputAppearance, scripture: { ...outputAppearance.scripture, alternate: { reference: 'last-slides', completePassage: true } } },
      { ...outputAppearance, scripture: { ...outputAppearance.scripture,
        live: { ...outputAppearance.scripture.live, fonts: { number: { sizeScale: 5 } } } } },
      { ...outputAppearance, scripture: { ...outputAppearance.scripture,
        live: { ...outputAppearance.scripture.live, fonts: { number: { sizeScale: .6, fontRatio: .04 } } } } },
      { ...outputAppearance, scripture: { ...outputAppearance.scripture,
        alternate: { ...outputAppearance.scripture.alternate, referenceInsets: { right: -0.1 } } } },
      { ...outputAppearance, scripture: { ...outputAppearance.scripture,
        live: { ...outputAppearance.scripture.live, pagination: { minFontRatio: 4 } } } },
      { ...outputAppearance, foldback: { nextLines: 4 } },
      { ...outputAppearance, foldback: { clock: { fontRatio: 5 } } },
      { ...outputAppearance, foldbackContent: { song: { layout: { insets: { left: -0.1 } } } } },
      { ...outputAppearance, foldbackService: { intervals: [{ startDay: 8, endDay: 0, startSeconds: 32400, endSeconds: 36000 }] } }]) {
      expect(() => parseMediaLibraryPackage({ ...input, outputAppearance: appearance })).toThrow('ข้อมูลค่าจอในแพ็กเกจ')
    }
  })

  it('accepts only portable nursery settings for the audience and broadcast outputs', async () => {
    const initial = { ...await contents(), version: 8, scriptureEditions: [], alertTemplates: [], songHistories: [], defaultThemes: {},
      presentationControls: {}, outputAppearance: {} }
    const nurserySettings = { live: { ...defaultNurserySettings.live, seconds: null } }
    expect(parseMediaLibraryPackage({ ...initial, nurserySettings }).nurserySettings).toEqual(nurserySettings)
    expect(() => parseMediaLibraryPackage({ ...initial, nurserySettings: { stage: nurserySettings.live } })).toThrow('ค่าการเรียกผู้ปกครอง')
    expect(() => parseMediaLibraryPackage({ ...initial, nurserySettings: { live: { ...nurserySettings.live, notices: ['0001'] } } }))
      .toThrow('ค่าการเรียกผู้ปกครอง')
  })

  it('validates version 10 alert catalogs independently of saved templates and settings', async () => {
    const catalog = { id: playlistId, sourceName: 'Sunday', tokens: [],
      serviceIntervals: [{ startDay: 0, startSeconds: 32400, endDay: 0, endSeconds: 36000 }] }
    const input = { ...await contents(), version: 10, scriptureEditions: [], alertTemplates: [], songHistories: [],
      defaultThemes: {}, presentationControls: {}, outputAppearance: {}, alertResourceCatalogs: [catalog] }
    expect(parseMediaLibraryPackage(input).alertResourceCatalogs).toEqual([catalog])
    expect(() => parseMediaLibraryPackage({ ...input, alertResourceCatalogs: [catalog, catalog] })).toThrow('ข้อมูลคลังโทเค็น')
    expect(() => parseMediaLibraryPackage({ ...input, alertResourceCatalogs: [{ ...catalog, serviceIntervals: [] }] })).toThrow('ข้อมูลคลังโทเค็น')
    const outputAppearance = { live: { top: 0, right: 0, bottom: 0, left: 0 } }
    expect(() => parseMediaLibraryPackage({ ...input, version: 7, outputAppearance })).toThrow('รุ่นของแพ็กเกจ')
  })
})
