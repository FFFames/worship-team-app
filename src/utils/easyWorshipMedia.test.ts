/** Regression coverage for verified EasyWorship Media.db profile mappings. */

import initSqlJs from 'sql.js'
import { BlobReader, BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import { describe, expect, it, vi } from 'vitest'
import { createEasyWorshipLibraryMediaFinder, mediaFileHash, relocatedMediaPaths, resolvedMediaPaths, reviewEasyWorshipMedia } from './easyWorshipMedia'
import { reviewEasyWorshipDesigns } from './easyWorshipDesigns'
import { cameraConstraints, feedObjectFit, liveFeedAsset } from './livePresentation'
import * as library from './mediaLibrary'

function profileFile(bytes: Uint8Array, path: string): File {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const file = new File([copy], path.split('/').pop() ?? 'file')
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}

async function mediaDatabase(): Promise<Uint8Array> {
  const SQL = await initSqlJs()
  const database = new SQL.Database()
  database.run([
    'CREATE TABLE media (media_uid TEXT, media_type INTEGER, title TEXT, path TEXT, filename TEXT, file_hash TEXT, filesize INTEGER, modified_date TEXT, duration INTEGER, width INTEGER, height INTEGER, ready INTEGER, error_msg TEXT);',
    "INSERT INTO media(rowid, media_uid, media_type, title, path, filename, file_hash, filesize, ready) VALUES (17, 'video-uid', 1, 'Sky', '<videos>', 'sky.mp4', 'video-hash', 10, 1);",
    "INSERT INTO media(rowid, media_uid, media_type, title, path, filename, file_hash, filesize, ready) VALUES (22, 'image-uid', 2, 'Still', '<images>', 'still.jpg', 'image-hash', 20, 1);",
    "INSERT INTO media(rowid, media_uid, media_type, title, path, filename, ready) VALUES (23, 'unknown-uid', 8, 'Other', '<other>', 'other.bin', 1);",
    "INSERT INTO media(rowid, media_uid, media_type, title, path, filename, ready) VALUES (9007199254740999, 'audio-uid', 5, 'Choir', '<audio>', 'choir.wav', 1);",
  ].join('\n'))
  const bytes = database.export()
  database.close()
  return bytes
}

function legacyBackgroundDatabases() {
  const encoder = new TextEncoder()
  const fields = [
    ['Index', 4, 4], ['BK Type', 3, 2], ['BK Bitmap Name', 1, 140], ['BK Bitmap', 13, 10],
    ['BK Color', 4, 4], ['BK Gradient Color1', 4, 4], ['BK Gradient Color2', 4, 4],
    ['BK Gradient Shading', 3, 2], ['BK Gradient Variant', 3, 2],
    ['Override Enabled', 9, 1], ['Text Percent Rect Default', 9, 1],
    ['Text Percentage Left', 3, 2], ['Text Percentage Top', 3, 2],
    ['Text Percentage Right', 3, 2], ['Text Percentage Bottom', 3, 2],
  ] as const
  const rowWidth = fields.reduce((size, field) => size + field[2], 0)
  const header = 2048
  const table = new Uint8Array(header + 1024)
  const view = new DataView(table.buffer)
  view.setUint16(0, rowWidth, true)
  view.setUint16(2, header, true)
  table[5] = 1
  view.setUint16(14, 1, true)
  view.setUint16(33, fields.length, true)
  let namePosition = 385 + 6 * fields.length
  for (const [index, [name, type, size]] of fields.entries()) {
    table.set([type, size], 120 + 2 * index)
    table.set(encoder.encode(name), namePosition)
    namePosition += name.length + 1
  }
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9])
  const memo = new Uint8Array(8192)
  const memoView = new DataView(memo.buffer)
  memo[4096] = 2
  memoView.setUint16(4097, 1, true)
  memoView.setUint32(4099, jpeg.length, true)
  memoView.setUint16(4103, 1, true)
  memo.set(jpeg, 4105)
  const backgrounds = [
    [3, '<ImageResourcesDir>\\still.jpg'], [3, '<ImageResourcesDir>\\backup.jpg'],
    [4, '<VideoResourcesDir>\\converted.mpg'], [4, '<VideoResourcesDir>\\missing.mpg'], [1, ''],
  ] as const
  view.setInt16(header + 4, rowWidth * (backgrounds.length - 1), true)
  for (const [index, [type, path]] of backgrounds.entries()) {
    const row = header + 6 + index * rowWidth
    view.setUint32(row, 0x80000000 + index)
    view.setUint16(row + 4, 0x8000 + type)
    table.set(encoder.encode(path), row + 6)
    view.setUint32(row + 146, 4096 + 255, true)
    view.setUint32(row + 150, jpeg.length, true)
    view.setUint16(row + 154, 1, true)
    if (index === 0) {
      table.set([0x81, 0x80], row + 172)
      view.setUint16(row + 174, 0x8000 + 2)
      view.setUint16(row + 176, 0x8000 + 36)
      view.setUint16(row + 178, 0x8000 + 35)
      view.setUint16(row + 180, 0x8000)
    }
    if (type === 1) {
      view.setUint32(row + 160, 0x80000000 + 0x332211)
      view.setUint32(row + 164, 0x80000000 + 0x665544)
      view.setUint16(row + 168, 0x8000 + 2)
      view.setUint16(row + 170, 0x8000 + 3)
    }
  }
  return { table, memo, jpeg }
}

describe('reviewEasyWorshipMedia', () => {
  it('uses the saved content hash to find an existing browser file even if its name and reported size differ', async () => {
    const good = new Blob(['correct original'], { type: 'video/mp4' })
    const wrong = new Blob(['same name, another version'], { type: 'video/mp4' })
    const hash = await mediaFileHash(good)
    const brief = { kind: 'video' as const, mediaType: 'video/mp4', addedAt: '2025-01-01' }
    const original = { ...brief, assetId: 'original', id: 'library-1', name: 'Original', filename: 'renamed.mp4', size: good.size }
    const conflicting = { ...brief, assetId: 'other', id: 'library-2', name: 'Other', filename: 'intro.mp4', size: wrong.size }
    const catalog = vi.spyOn(library, 'listLibraryMedia').mockResolvedValue([original, conflicting])
    const assets = vi.spyOn(library, 'readLibraryMedia').mockImplementation(async (id) => id === 'original' ? good : wrong)
    try {
      const find = createEasyWorshipLibraryMediaFinder()
      const reference = { kind: 'video' as const, filename: 'intro.mp4', size: wrong.size, hash }
      await expect(find(reference)).resolves.toEqual(original)
      await expect(find({ ...reference, filename: 'unrelated.mp4' })).resolves.toEqual(original)
      await expect(find({ ...reference, hash: 'invalid' })).resolves.toBeUndefined()
      expect(assets.mock.calls).toEqual([['other'], ['original']])
    } finally {
      catalog.mockRestore()
      assets.mockRestore()
    }
  })

  it('only returns a previous video conversion when the caller accepts converted media', async () => {
    const hash = 'a'.repeat(64)
    const video = new Blob(['converted content'], { type: 'video/mp4' })
    const item = { id: 'converted', assetId: 'mp4', name: 'Converted', filename: 'clip.mp4', kind: 'video' as const,
      size: video.size, mediaType: video.type, addedAt: '2025-01-01',
      metadata: { legacyVideoSourceHash: hash, legacyVideoSourceSize: 123 } }
    const catalog = vi.spyOn(library, 'listLibraryMedia').mockResolvedValue([item])
    const files = vi.spyOn(library, 'readLibraryMedia').mockResolvedValue(video)
    try {
      const find = createEasyWorshipLibraryMediaFinder()
      const reference = { kind: 'video' as const, filename: 'clip.wmv', size: 123, hash }
      await expect(find(reference)).resolves.toBeUndefined()
      await expect(find(reference, true)).resolves.toEqual(item)
      await expect(find({ ...reference, size: 124 }, true)).resolves.toBeUndefined()
    } finally {
      catalog.mockRestore()
      files.mockRestore()
    }
  })

  it('keeps a fileless DVD entry with its saved marks, JPEG and native segment fields', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database(await mediaDatabase())
    db.run(`
      ALTER TABLE media ADD COLUMN start_pos INTEGER;
      ALTER TABLE media ADD COLUMN end_pos INTEGER;
      ALTER TABLE media ADD COLUMN volume INTEGER;
      ALTER TABLE media ADD COLUMN mute BOOLEAN;
      ALTER TABLE media ADD COLUMN aspect_type INTEGER;
      CREATE TABLE dvd_disk (disk_uid TEXT, disk_name TEXT);
      CREATE TABLE media_dvd (media_id INTEGER, dvd_disk_id INTEGER, clip_title INTEGER, clip_chapter INTEGER,
        clip_audio INTEGER, clip_segment_start_pos INTEGER, clip_segment_duration INTEGER, thumbnail JPEG);
      INSERT INTO media(rowid, media_uid, media_type, title, start_pos, end_pos, volume, mute, aspect_type)
      VALUES (40, 'dvd-fixture', 3, 'เพลงจากแผ่น', 20000000, 45000000, 0, 1, 2);
      INSERT INTO dvd_disk VALUES ('disk-uid', 'แผ่นเพลง');
      INSERT INTO media_dvd VALUES (40,1,2,3,0,300000000,1000000000,X'FFD8FFE0');
    `)
    try {
      const review = await reviewEasyWorshipMedia(profileFile(db.export(), 'Media.db'))
      expect(review.dvds).toMatchObject([{ name: 'เพลงจากแผ่น', discName: 'แผ่นเพลง', discUid: 'disk-uid',
        title: 2, chapter: 3, audioTrack: 0, segmentStart: 300000000, segmentDuration: 1000000000,
        clip: { startSeconds: 2, endSeconds: 4.5 }, thumbnail: 'data:image/jpeg;base64,/9j/4A==',
        playback: { volume: 0, muted: true, fit: 'fill' } }])
      expect(review.unsupported.some(({ sourceId }) => sourceId === '40')).toBe(false)
      expect(review.entries?.some(({ sourceId }) => sourceId === '40')).toBe(false)
    } finally { db.close() }
  })

  it('finds fileless Feeds and restores compatible capture preferences without machine IDs', async () => {
    const SQL = await initSqlJs()
    const database = new SQL.Database(await mediaDatabase())
    database.run(`
      CREATE TABLE media_feed (media_id INTEGER, feed_type INTEGER);
      ALTER TABLE media ADD COLUMN aspect_type INTEGER;
      CREATE TABLE feed_pc (media_id INTEGER, device_name TEXT, device_uid TEXT, frame_rate INTEGER);
      CREATE TABLE device_video (device_name TEXT, device_uid TEXT, width INTEGER, height INTEGER, frame_rate INTEGER);
      CREATE TABLE device_audio (device_name TEXT, device_uid TEXT);
      CREATE TABLE device_link (media_id INTEGER, computer_id INTEGER, device_video_id INTEGER, device_audio_id INTEGER);
      INSERT INTO media(rowid, media_uid, title, aspect_type) VALUES (30, 'feed-pulpit', 'กล้องธรรมาสน์', 1);
      INSERT INTO media(rowid, media_uid, title) VALUES (31, 'feed-spare', 'กล้องธรรมาสน์');
      INSERT INTO media_feed VALUES (30, 1), (31, 0);
      INSERT INTO device_video VALUES ('Booth (NDI Camera)', 'machine-video-id', 1920, 1080, 333667);
      INSERT INTO device_audio VALUES ('Mixer', 'machine-audio-id');
      INSERT INTO device_link VALUES (30, 50, 1, 1);
      INSERT INTO feed_pc VALUES (30, 'Booth (NDI Camera)', 'machine-legacy-a', 400000), (30, 'HDMI Capture', 'machine-legacy-b', 400000),
        (31, 'Legacy camera', 'machine-legacy-c', 400000);
    `)
    try {
      const result = await reviewEasyWorshipMedia(profileFile(database.export(), 'Media.db'))
      expect(result.entries?.map(({ name }) => name)).toEqual(['Sky', 'Still', 'Choir'])
      expect(result.feeds).toMatchObject([
        { sourceId: '30', name: 'กล้องธรรมาสน์', deviceHints: ['Booth (NDI Camera)', 'HDMI Capture'],
          metadata: { mediaUid: 'feed-pulpit', audioDeviceNames: 'Mixer', feedType: 1, width: 1920, height: 1080, frameRate: 29.97, aspectType: 1 } },
        { sourceId: '31', name: 'กล้องธรรมาสน์', deviceHints: ['Legacy camera'], metadata: { mediaUid: 'feed-spare', feedType: 0, frameRate: 25 } },
      ])
      const wrapped = await reviewEasyWorshipMedia(profileFile(database.export(), 'Example/v6.1/Databases/Data/Media.db'))
      expect(result.feeds?.map(({ id }) => id)).toEqual(wrapped.feeds?.map(({ id }) => id))
      expect(new Set(result.feeds?.map(({ id }) => id)).size).toBe(2)
      expect(JSON.stringify(result.feeds)).not.toContain('machine-')
      expect(result.feeds?.map((feed) => liveFeedAsset(feed, 'foreground').audioDeviceHint)).toEqual(['Mixer', undefined])
      const asset = liveFeedAsset(result.feeds![0], 'background')
      expect(asset.feedVideo).toEqual({ width: 1920, height: 1080, frameRate: 29.97, fit: 'contain' })
      expect(feedObjectFit(asset.feedVideo?.fit, true)).toBe('contain')
      expect(cameraConstraints('current-camera', asset.feedVideo)).toEqual({ audio: false, video: {
        deviceId: { exact: 'current-camera' }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 29.97 },
      } })
      expect(cameraConstraints()).toEqual({ audio: false, video: true })
    } finally { database.close() }
  })

  it('resolves only exact same-profile resources from a selected file directory', async () => {
    const database = await mediaDatabase()
    const result = await reviewEasyWorshipMedia([
      profileFile(database, 'Default/v6.1/Databases/Data/Media.db'),
      profileFile(new TextEncoder().encode('video bytes'), 'Default/Resources/Videos/sky.mp4'),
      profileFile(new TextEncoder().encode('image bytes'), 'Default/Resources/Images/still.jpg'),
      profileFile(new TextEncoder().encode('audio bytes'), 'Default/Resources/Audio/choir.wav'),
      profileFile(new TextEncoder().encode('wrong profile'), 'Other/Resources/Images/still.jpg'),
    ])

    expect(result.profiles).toEqual([{
      id: 'easyworship-media-default-v6-1-databases-data-media-db', name: 'Default', databasePath: 'Default/v6.1/Databases/Data/Media.db',
    }])
    expect(result.entries?.map((entry) => [entry.sourceId, entry.kind, entry.filename, entry.metadata?.mediaUid])).toEqual([
      ['17', 'video', 'sky.mp4', 'video-uid'], ['22', 'image', 'still.jpg', 'image-uid'],
      ['9007199254740999', 'audio', 'choir.wav', 'audio-uid'],
    ])
    expect(await result.entries?.[0].readFile?.()).toBeInstanceOf(Blob)
    expect(await (await result.entries?.[1].readFile?.())?.text()).toBe('image bytes')
    expect(await (await result.entries?.[2].readFile?.())?.text()).toBe('audio bytes')
    expect(result.unsupported).toEqual([{ sourceId: '23', message: 'ชนิดสื่อ EasyWorship 8 ยังไม่รองรับ' }])
  })

  it('reads split alpha from a Media.db video without treating other media as packed video', async () => {
    const SQL = await initSqlJs()
    const database = new SQL.Database(await mediaDatabase())
    database.run('ALTER TABLE media ADD COLUMN alpha_channel_mode INTEGER; UPDATE media SET alpha_channel_mode=2;')
    try {
      const result = await reviewEasyWorshipMedia([profileFile(database.export(), 'Default/Data/Media.db')])
      expect(result.entries?.[0]).toMatchObject({ filename: 'sky.mp4', alphaMode: 'side-by-side' })
      expect(result.entries?.[1]?.alphaMode).toBeUndefined()
      expect(result.entries?.[2]?.alphaMode).toBeUndefined()
    } finally { database.close() }
  })

  it('preserves explicit mute, zero volume, aspect and a disabled repeat in Media.db', async () => {
    const SQL = await initSqlJs()
    const database = new SQL.Database(await mediaDatabase())
    database.run(`
      ALTER TABLE media ADD COLUMN volume INTEGER;
      ALTER TABLE media ADD COLUMN mute BOOLEAN;
      ALTER TABLE media ADD COLUMN aspect_type INTEGER;
      ALTER TABLE media ADD COLUMN repeating BOOLEAN;
      UPDATE media SET volume=0, mute=0, aspect_type=3, repeating=0 WHERE rowid=17;
      UPDATE media SET volume=35, mute=-1, aspect_type=1, repeating=1 WHERE rowid=9007199254740999;
    `)
    try {
      const { entries } = await reviewEasyWorshipMedia(profileFile(database.export(), 'Media.db'))
      expect(entries?.map(({ playback }) => playback)).toEqual([
        { volume: 0, muted: false, fit: 'cover', repeat: false }, undefined, { volume: .35, muted: true, repeat: true },
      ])
    } finally { database.close() }
  })

  it('preserves visual usage and aspect without treating an image as playable audio', async () => {
    const SQL = await initSqlJs()
    const database = new SQL.Database(await mediaDatabase())
    database.run(`
      ALTER TABLE media ADD COLUMN aspect_type INTEGER;
      ALTER TABLE media ADD COLUMN usage_type INTEGER;
      ALTER TABLE media ADD COLUMN volume INTEGER;
      ALTER TABLE media ADD COLUMN mute BOOLEAN;
      UPDATE media SET aspect_type=3, usage_type=1, volume=25, mute=1 WHERE media_type=2;
      UPDATE media SET aspect_type=0, usage_type=2 WHERE media_type=1;
    `)
    try {
      const { entries } = await reviewEasyWorshipMedia(profileFile(database.export(), 'Media.db'))
      expect(entries?.map(({ playback }) => playback)).toEqual([
        { fit: 'auto', usage: 'foreground' }, { fit: 'cover', usage: 'background' }, undefined,
      ])
    } finally { database.close() }
  })

  it('reads video poster positions independently of trim and distinguishes an unset poster from a missing column', async () => {
    const SQL = await initSqlJs()
    const missing = await mediaDatabase()
    const review = (bytes: Uint8Array) => reviewEasyWorshipMedia(profileFile(bytes, 'Media.db'))
    expect((await review(missing)).entries?.[0]).not.toHaveProperty('posterSeconds')
    const database = new SQL.Database(missing)
    try {
      database.run(`
        ALTER TABLE media ADD COLUMN poster_frame_pos INTEGER DEFAULT -1;
        ALTER TABLE media ADD COLUMN start_pos INTEGER DEFAULT -1;
        UPDATE media SET poster_frame_pos=12500000;
        UPDATE media SET start_pos=2500000 WHERE rowid=17;
      `)
      const { entries } = await review(database.export())
      expect(entries?.[0]).toMatchObject({ posterSeconds: 1.25, clip: { startSeconds: 0.25 } })
      expect(entries?.slice(1).every((entry) => !('posterSeconds' in entry))).toBe(true)
      database.run('UPDATE media SET poster_frame_pos=0 WHERE rowid=17')
      expect((await review(database.export())).entries?.[0]?.posterSeconds).toBe(0)
      database.run('UPDATE media SET poster_frame_pos=-1 WHERE rowid=17')
      expect((await review(database.export())).entries?.[0]).toHaveProperty('posterSeconds', undefined)
      database.run('UPDATE media SET poster_frame_pos=-2 WHERE rowid=17')
      expect((await review(database.export())).entries?.[0]).not.toHaveProperty('posterSeconds')
    } finally { database.close() }
  })

  it('keeps archive extraction lazy and exposes the same exact resources', async () => {
    const archive = new ZipWriter(new BlobWriter())
    const database = await mediaDatabase()
    const copy = new Uint8Array(database.byteLength)
    copy.set(database)
    await archive.add('Data/Media.db', new BlobReader(new Blob([copy.buffer])))
    await archive.add('Resources/Videos/sky.mp4', new TextReader('video bytes'))
    await archive.add('Resources/Images/still.jpg', new TextReader('image bytes'))
    const result = await reviewEasyWorshipMedia(new File([await archive.close()], 'demo.ewpck'))

    expect(result.entries).toHaveLength(3)
    const asset = await result.entries?.[1]?.readFile?.()
    expect(asset?.size).toBeGreaterThan(0)
  })

  it('recovers renamed media by its catalog SHA-256 within the selected profile', async () => {
    const bytes = new Uint8Array(300_000).fill(147)
    const different = new Uint8Array(bytes.length).fill(148)
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    const digest = Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('')
    const SQL = await initSqlJs()
    const database = new SQL.Database(await mediaDatabase())
    database.run('UPDATE media SET filesize = ?, file_hash = ? WHERE rowid IN (17, 22)', [bytes.length, digest])
    const result = await reviewEasyWorshipMedia([
      profileFile(database.export(), 'Default/v6.1/Databases/Data/Media.db'),
      profileFile(different, 'Default/Resources/Videos/another.mp4'),
      profileFile(bytes, 'Default/Resources/Videos/Copied/Rehearsal.mp4'),
      profileFile(bytes, 'Other/Resources/Images/renamed.jpg'),
      profileFile(different, 'Default/Resources/Images/another.jpg'),
    ])
    database.close()

    expect(result.entries?.[0]).toMatchObject({
      name: 'Sky', filename: 'Rehearsal.mp4', sourcePath: 'Default/Resources/Videos/Copied/Rehearsal.mp4',
      metadata: { mediaUid: 'video-uid', fileHash: digest },
    })
    expect(result.entries?.[1].readFile).toBeUndefined()
    expect(relocatedMediaPaths(result.entries ?? [])).toEqual(new Map([
      ['default/resources/videos/sky.mp4', 'Default/Resources/Videos/Copied/Rehearsal.mp4'],
    ]))
  })

  it('checks current resources against an archived Media.db before using them', async () => {
    const original = new Uint8Array([1, 2, 3, 4, 5])
    const replacement = new Uint8Array([5, 4, 3, 2, 1])
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', original)),
      (byte) => byte.toString(16).padStart(2, '0')).join('')
    const SQL = await initSqlJs()
    const database = new SQL.Database(await mediaDatabase())
    database.run('UPDATE media SET filesize = ?, file_hash = ? WHERE rowid IN (17, 22)', [original.length, hash])
    const catalog = profileFile(database.export(), 'Default/v6.1/Databases/Archive/2025-07-08 7.4/Media.db')
    database.close()
    const review = await reviewEasyWorshipMedia([
      catalog,
      profileFile(replacement, 'Default/Resources/Videos/sky.mp4'),
      profileFile(original, 'Default/Resources/Videos/renamed.mp4'),
      profileFile(replacement, 'Default/Resources/Images/still.jpg'),
      profileFile(original, 'Different profile/Resources/Images/still.jpg'),
    ])
    expect(review.profiles[0].name).toBe('Default · ฐานข้อมูลย้อนหลัง 2025-07-08 7.4')
    expect(review.entries?.[0].sourcePath).toBe('Default/Resources/Videos/renamed.mp4')
    expect(review.entries?.[1].readFile).toBeUndefined()
    expect(review.entries?.[1].warning).toContain('ไม่ตรงกับข้อมูล')
  })

  it('verifies current catalog resources and recovers a renamed original even with a stale recorded size', async () => {
    const original = new Uint8Array([1, 2, 3, 4, 5])
    const replacement = new Uint8Array([5, 4, 3, 2, 1])
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', original)),
      (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
    const SQL = await initSqlJs()
    const database = new SQL.Database(await mediaDatabase())
    database.run('UPDATE media SET filesize = 8, file_hash = ? WHERE rowid = 17', [digest])
    const catalog = profileFile(database.export(), 'Default/v6.1/Databases/Data/Media.db')
    database.close()
    const rejectedPath = 'Default/Resources/Videos/sky.mp4'
    const files = [catalog, profileFile(replacement, rejectedPath), profileFile(original, 'Default/Resources/Images/still.jpg')]
    const first = await reviewEasyWorshipMedia(files)
    expect(first.entries?.[0]).toMatchObject({ name: 'Sky', rejectedPath })
    expect(first.entries?.[0].readFile).toBeUndefined()
    expect(first.entries?.[0].warning).toContain('ไม่ตรงกับข้อมูลใน Media.db')
    expect(first.entries?.[1].readFile).toBeDefined()

    const sourcePath = 'Default/Resources/Videos/Copied/Rehearsal.mp4'
    const recovered = await reviewEasyWorshipMedia([...files, profileFile(original, sourcePath)])
    expect(recovered.entries?.[0]).toMatchObject({ rejectedPath, sourcePath })
    expect(new Uint8Array(await (await recovered.entries?.[0]?.readFile?.())!.arrayBuffer())).toEqual(original)
  })

  it('links explicitly attached external media and rejects ambiguous names and mismatched hashes', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    const decoy = new Uint8Array([4, 3, 2, 1, 5])
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('')
    const SQL = await initSqlJs()
    const database = new SQL.Database(await mediaDatabase())
    database.run('UPDATE media SET path = ?, filesize = ?, file_hash = ? WHERE rowid = 17', ['E:\\Services\\Videos', bytes.length, hash])
    database.run('UPDATE media SET path = ?, filesize = ?, file_hash = NULL WHERE rowid = 22', ['\\\\server\\share', bytes.length])
    database.run("INSERT INTO media(media_uid,media_type,title,path,filename,filesize) VALUES ('duplicate-1',2,'D1','/old','same.jpg',5),('duplicate-2',2,'D2','/other','same.jpg',5)")
    const files = [profileFile(database.export(), 'Default/v6.1/Databases/Data/Media.db'), profileFile(decoy, 'Default/Resources/Videos/sky.mp4')]
    database.close()
    const missing = await reviewEasyWorshipMedia(files, undefined, [new File([decoy], 'sky.mp4')])
    expect(missing.entries?.find(({ name }) => name === 'Sky')?.readFile).toBeUndefined()

    const recovered = await reviewEasyWorshipMedia(files, undefined, [new File([bytes], 'Renamed.mp4'),
      new File([bytes], 'still.jpg'), new File([bytes], 'same.jpg')])
    const sky = recovered.entries?.find(({ name }) => name === 'Sky')
    expect(sky).toMatchObject({ filename: 'Renamed.mp4', originalLocation: 'E:\\Services\\Videos\\sky.mp4',
      metadata: { mediaUid: 'video-uid', catalogFilename: 'sky.mp4' } })
    expect(new Uint8Array(await (await sky?.readFile?.())!.arrayBuffer())).toEqual(bytes)
    expect(recovered.entries?.find(({ name }) => name === 'Still')?.readFile).toBeDefined()
    expect(recovered.entries?.filter(({ name }) => name.startsWith('D')).every(({ readFile }) => !readFile)).toBe(true)
    expect(relocatedMediaPaths(recovered.entries ?? []).get('default/resources/videos/sky.mp4')).toBe(sky?.sourcePath)

    const restored = await reviewEasyWorshipMedia([files[0], profileFile(bytes, 'Default/Resources/Videos/sky.mp4')])
    expect(resolvedMediaPaths(restored.entries ?? []).get('default/resources/videos/sky.mp4')).toBe('Default/Resources/Videos/sky.mp4')
    expect(relocatedMediaPaths(restored.entries ?? []).has('default/resources/videos/sky.mp4')).toBe(false)
  })

  it('uses the strongest folder suffix for external media while keeping size, hashes, and ambiguous paths distinct', async () => {
    const SQL = await initSqlJs()
    const database = new SQL.Database(await mediaDatabase())
    const original = new Uint8Array([1, 2, 3, 4, 5])
    const alternate = original.slice().reverse()
    database.run('DELETE FROM media')
    for (const [id, title, location, size, checksum] of [
      ['1', 'Offering', 'E:\\Service\\Offering', 5, null],
      ['2', 'Baptism', '\\\\server\\Rehearsal\\Baptism', 5, null],
      ['3', 'Ambiguous', 'E:\\Another\\Offering', 5, null],
      ['4', 'Different size', '/media/Service/Different', 6, null],
      ['5', 'Incorrect checksum', '/media/Service/Verified', 5, 'a'.repeat(64)],
    ]) database.run(`INSERT INTO media(media_uid,media_type,title,path,filename,filesize,file_hash) VALUES (?,1,?,?,'clip.mp4',?,?)`,
      [id, title, location, size, checksum])
    const catalog = new File([new Uint8Array(database.export())], 'Media.db')
    database.close()
    const folder = [profileFile(original, 'Copied/Service/Offering/CLIP.MP4'), profileFile(alternate, 'Copied/Rehearsal/Baptism/clip.mp4'),
      profileFile(alternate, 'Copied/Old/Offering/clip.mp4'), profileFile(original, 'Copied/Service/Different/clip.mp4'),
      profileFile(original, 'Copied/Service/Verified/clip.mp4')]
    const result = await reviewEasyWorshipMedia(catalog, undefined, folder)
    const [offering, baptism, ...unresolved] = result.entries ?? []
    expect(new Uint8Array(await (await offering.readFile!()).arrayBuffer())).toEqual(original)
    expect(new Uint8Array(await (await baptism.readFile!()).arrayBuffer())).toEqual(alternate)
    expect(unresolved.map(({ readFile }) => readFile)).toEqual([undefined, undefined, undefined])
  })

  it('recovers legacy images and linked videos without using a video preview as the original', async () => {
    const { table, memo, jpeg } = legacyBackgroundDatabases()
    const bytes = new TextEncoder().encode('external asset')
    const result = await reviewEasyWorshipMedia([
      profileFile(table, 'Old/Data/BackGrounds.DB'),
      profileFile(memo, 'Old/Data/BackGrounds.MB'),
      profileFile(bytes, 'Old/Resources/Images/still.jpg'),
      profileFile(bytes, 'Old/Resources/Videos/converted.mp4'),
      profileFile(bytes, 'Other/Resources/Images/backup.jpg'),
      profileFile(bytes, 'Other/Resources/Videos/missing.mp4'),
    ])

    expect(result.entries?.map((entry) => [entry.filename, entry.kind, Boolean(entry.readFile)])).toEqual([
      ['still.jpg', 'image', true], ['backup.jpg', 'image', true],
      ['converted.mp4', 'video', true], ['missing.mpg', 'video', false],
    ])
    expect(await (await result.entries?.[0].readFile?.())?.text()).toBe('external asset')
    const recovered = await result.entries?.[1].readFile?.()
    expect(recovered?.type).toBe('image/jpeg')
    expect(new Uint8Array(await recovered!.arrayBuffer())).toEqual(jpeg)
    expect(result.entries?.[1].warning).toContain('ภาพสำรอง')
    expect(result.unsupported).toEqual([])
  })

  it('reads reusable gradient and media themes with normalised legacy text margins', async () => {
    const { table, memo } = legacyBackgroundDatabases()
    const result = await reviewEasyWorshipDesigns([
      profileFile(table, 'Old/Data/BackGrounds.DB'),
      profileFile(memo, 'Old/Data/BackGrounds.MB'),
      profileFile(new TextEncoder().encode('local image'), 'Old/Resources/Images/still.jpg'),
    ])
    const themes = result.entries ?? []
    expect(themes.map((theme) => theme.kind)).toEqual(['text-theme', 'text-theme', 'text-theme'])
    const [background, text] = themes[0].content.slides[0].design.layers
    expect(background).toMatchObject({ kind: 'media', asset: { filename: 'still.jpg' } })
    expect(text).toMatchObject({ kind: 'text', slot: 'content', frame: { x: 0.02, y: 0.36, width: 0.63, height: 0.64 } })
    if (background.kind !== 'media' || !background.asset.sourcePath) throw new Error('Expected a linked background')
    expect(await (await result.readAsset?.(background.asset.sourcePath))?.text()).toBe('local image')
    expect(themes[2].content.slides[0].design.layers[0]).toMatchObject({
      fill: { type: 'gradient', angle: 45, stops: [
        { color: '#445566', position: 0 }, { color: '#112233', position: 0.5 }, { color: '#445566', position: 1 },
      ] },
    })
    expect(result.warnings).toEqual([expect.stringContaining('2 รายการ')])
  })
})
