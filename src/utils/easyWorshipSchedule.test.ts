/** Regression tests for verified EasyWorship 6/7 EWSX schedule tables. */

import initSqlJs from 'sql.js'
import { BlobReader, BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import { describe, expect, it } from 'vitest'
import { readEasyWorshipSchedule } from './easyWorshipSchedule'
import { decodeEasyWorshipScriptureRange, fillScheduleScripture, recoveredScheduleScripture } from './easyWorshipScheduleScripture'
import { importIdentity } from './importIdentity'
import { convertEasyWorshipCues, fillScheduleSlideDetails, fillScheduleSongLabels, recoverableScheduleSlideDetails, recoveredScheduleSongLabels } from './easyWorshipScheduleCues'
import { mediaFileHash } from './easyWorshipMedia'
import { fillScheduleMedia, missingEasyWorshipScheduleMedia, recoverableScheduleMedia, relinkEasyWorshipScheduleMedia,
  reviewEasyWorshipScheduleMedia } from './easyWorshipScheduleMedia'

async function makeSchedule(additions = ''): Promise<File> {
  const SQL = await initSqlJs()
  const database = new SQL.Database()
  database.run([
    "CREATE TABLE info (version TEXT); INSERT INTO info VALUES ('7.3.0.11');",
    'CREATE TABLE presentation (presentation_uid TEXT, presentation_type INTEGER, order_index INTEGER, group_level INTEGER, title TEXT, author TEXT, copyright TEXT, administrator TEXT, reference_number TEXT, notes TEXT);',
    'CREATE TABLE slide (presentation_id INTEGER, title TEXT, order_index INTEGER);',
    'CREATE TABLE element (slide_id INTEGER, element_uid TEXT, order_index INTEGER, foreground_resource_id INTEGER, background_resource_id INTEGER);',
    'CREATE TABLE resource_text (resource_id INTEGER, rtf TEXT);',
    'CREATE TABLE resource_image (resource_id INTEGER, file_id INTEGER, original_filename TEXT);',
    'CREATE TABLE resource_video (resource_id INTEGER, file_id INTEGER, original_filename TEXT);',
    'CREATE TABLE resource_audio (resource_id INTEGER, file_id INTEGER, original_filename TEXT);',
    'CREATE TABLE resource_powerpoint (resource_id INTEGER, file_id INTEGER, original_filename TEXT);',
    'CREATE TABLE resource_web (resource_id INTEGER, url TEXT);',
    'CREATE TABLE file (filename TEXT);',
    "INSERT INTO presentation(rowid, presentation_uid, presentation_type, order_index, group_level, title) VALUES (20, 'song-a', 6, 2, 0, 'Duplicate Song');",
    "INSERT INTO presentation(rowid, presentation_uid, presentation_type, order_index, group_level, title) VALUES (21, 'song-a', 6, 3, 0, 'Duplicate Song');",
    "INSERT INTO presentation(rowid, presentation_uid, presentation_type, order_index, group_level, title, notes) VALUES (30, 'notice', 8, 1, 0, 'Welcome', 'Keep this note');",
    "INSERT INTO presentation(rowid, presentation_uid, presentation_type, order_index, group_level, title) VALUES (31, 'unknown', 12, 4, 1, 'Blank');",
    "INSERT INTO slide(rowid, presentation_id, title, order_index) VALUES (100, 30, 'Welcome slide', 0);",
    'INSERT INTO slide(rowid, presentation_id, title, order_index) VALUES (101, 20, NULL, 0);',
    'INSERT INTO slide(rowid, presentation_id, title, order_index) VALUES (102, 21, NULL, 0);',
    'INSERT INTO slide(rowid, presentation_id, title, order_index) VALUES (103, 31, NULL, 0);',
    "INSERT INTO resource_text VALUES (900, '{\\rtf1\\ansi Welcome\\par Home}');",
    "INSERT INTO resource_text VALUES (901, '{\\rtf1\\ansi Verse 1\\par Song lyric}');",
    "INSERT INTO resource_image VALUES (902, 50, 'Original Background.jpg');",
    "INSERT INTO resource_video VALUES (903, 51, 'Background.mp4');",
    "INSERT INTO file(rowid, filename) VALUES (50, 'packed-bg.jpg');",
    "INSERT INTO file(rowid, filename) VALUES (51, 'packed-video.mp4');",
    "INSERT INTO element VALUES (100, 'CONTENT_PRESENTATION', 0, 900, NULL);",
    "INSERT INTO element VALUES (100, 'BACKGROUND', 1, NULL, 902);",
    "INSERT INTO element VALUES (100, 'BACKGROUND', 2, 903, NULL);",
    "INSERT INTO element VALUES (101, 'CONTENT_SONG', 0, 901, NULL);",
    "INSERT INTO element VALUES (102, 'CONTENT_SONG', 0, 901, NULL);",
  ].join('\n'))
  if (additions) database.run(additions)
  const bytes = database.export()
  database.close()
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)

  const archive = new ZipWriter(new BlobWriter())
  await archive.add('main.db', new BlobReader(new Blob([copy])))
  await archive.add('media/packed-bg.jpg', new TextReader('image bytes'), { level: 0 })
  await archive.add('media/packed-video.mp4', new TextReader('video bytes'))
  await archive.add('media/packed-audio', new TextReader('audio test fixture'))
  return new File([await archive.close()], 'service.ewsx')
}

describe('readEasyWorshipSchedule', () => {
  it('recovers hidden song labels in source order without inserting them into the lyrics', async () => {
    const file = await makeSchedule(String.raw`
      UPDATE resource_text SET rtf='{\rtf1\ansi{\pard\sdparawysiwghidden Chorus 2\par}{\pard Words stay visible}}' WHERE resource_id=901;
      INSERT INTO slide(rowid, presentation_id, title, order_index) VALUES (105,20,'Explicit section',1);
      INSERT INTO element VALUES (105,'CONTENT_SONG',0,901,NULL);
    `)
    const schedule = await readEasyWorshipSchedule(file)
    const cue = convertEasyWorshipCues(schedule).find((cue) => cue.sourceId === '20')
    expect(cue?.slides).toMatchObject([
      { label: 'Chorus 2', sectionType: 'hook', lines: ['Words stay visible'], sourceOrder: 0 },
      { label: 'Explicit section', lines: ['Words stay visible'], sourceOrder: 1 },
    ])
    expect([...recoveredScheduleSongLabels(schedule).get('20')!]).toEqual([
      ['101', { previous: 'Slide 1', label: 'Chorus 2', sectionType: 'hook' }],
    ])
  })

  it('fills old labels by source ID after slides were reordered and keeps local changes', () => {
    const recovered = new Map([['cue', new Map([
      ['a', { previous: 'Slide 1', label: 'Chorus', sectionType: 'hook' as const }],
      ['b', { previous: 'Slide 2', label: '1', sectionType: 'verse' as const }],
      ['c', { previous: 'Slide 3', label: '1', sectionType: 'verse' as const }],
      ['deleted', { previous: 'Slide 4', label: '2', sectionType: 'verse' as const }],
    ])]])
    const existing = {
      kind: 'song' as const, label: 'Local song title', sourceId: 'cue', looping: true,
      slides: [
        { sourceId: 'c', label: 'Slide 3', labelEdited: true as const, lines: ['Intentional placeholder'] },
        { sourceId: 'b', label: 'ชื่อท่อนที่แก้เอง', lines: ['Local label edit'] },
        { sourceId: 'a', label: 'Slide 1', lines: ['Local lyric edit'], advanceMs: 3000 },
        { label: 'Slide 4', lines: ['New local slide'] },
      ],
    }
    const update = fillScheduleSongLabels(existing, recovered)
    expect(update).toEqual({ count: 1, cue: { ...existing, slides: [
      existing.slides[0], existing.slides[1], { ...existing.slides[2], label: 'Chorus', sectionType: 'hook' }, existing.slides[3],
    ] } })
    expect(fillScheduleSongLabels(update!.cue, recovered)).toBeUndefined()
    expect(fillScheduleSongLabels({ ...existing, sourceId: 'different-occurrence' }, recovered)).toBeUndefined()
  })

  it('reads webpages and foreground or background feed references without storing a device ID', async () => {
    const file = await makeSchedule(`
      CREATE TABLE resource_feed (resource_id INTEGER);
      CREATE TABLE resource_feed_pc (resource_id INTEGER, device_name TEXT, device_uid TEXT);
      INSERT INTO resource_feed VALUES (904);
      INSERT INTO resource_feed_pc VALUES (904, 'Pulpit Camera', 'machine-device-id');
      ALTER TABLE resource_web ADD COLUMN remove_scroll_bars BOOLEAN;
      INSERT INTO resource_web VALUES (905, 'https://example.test/announcement', 1);
      INSERT INTO resource_web VALUES (906, 'javascript:example()', 0);
      INSERT INTO element VALUES (101, 'BACKGROUND', 1, 904, NULL);
      INSERT INTO element VALUES (103, 'CONTENT_PRESENTATION', 0, 905, NULL);
      INSERT INTO element VALUES (103, 'CONTENT_PRESENTATION', 1, 906, NULL);
      INSERT INTO presentation (rowid, presentation_type, order_index, title) VALUES (32, 12, 5, 'Feed');
      INSERT INTO slide (rowid, presentation_id, title, order_index) VALUES (104, 32, 'Pulpit', 0);
      INSERT INTO element VALUES (104, 'CONTENT_PRESENTATION', 0, 904, NULL);
    `)
    const { cues } = await readEasyWorshipSchedule(file)
    expect(cues.find((cue) => cue.id === '20')?.slides[0].assets).toEqual([
      { kind: 'camera', filename: 'Pulpit Camera', role: 'background' },
    ])
    expect(cues.find((cue) => cue.id === '31')).toMatchObject({
      kind: 'web',
      slides: [{ assets: [{ kind: 'web', url: 'https://example.test/announcement', role: 'foreground', hideScrollbars: true }] }],
    })
    expect(cues.find((cue) => cue.id === '31')?.slides[0].assets).toHaveLength(1)
    expect(cues.find((cue) => cue.id === '32')).toMatchObject({
      kind: 'camera',
      slides: [{ assets: [{ kind: 'camera', filename: 'Pulpit Camera', role: 'foreground' }] }],
    })
    expect(JSON.stringify(cues)).not.toContain('machine-device-id')
  })

  it('retains a DVD as a direct cue or positioned layer without duplicating the layer as a full-screen video', async () => {
    const file = await makeSchedule(`
      CREATE TABLE resource (title TEXT, resource_uid TEXT, author TEXT);
      CREATE TABLE resource_dvd_disk (disk_uid TEXT, disk_name TEXT);
      CREATE TABLE resource_dvd (resource_id INTEGER, resource_dvd_disk_id INTEGER, start_pos INTEGER, end_pos INTEGER,
        clip_title INTEGER, clip_chapter INTEGER, clip_audio INTEGER, thumbnail JPEG);
      INSERT INTO resource(rowid,title,resource_uid,author) VALUES (906,'เพลงจาก DVD','resource-fixture','ทีมสื่อ');
      INSERT INTO resource_dvd_disk VALUES ('disc-uid','แผ่นทดสอบ');
      INSERT INTO resource_dvd VALUES (906,1,20000000,45000000,2,3,1,X'FFD8FFE0');
      ALTER TABLE element ADD COLUMN x REAL;
      ALTER TABLE element ADD COLUMN y REAL;
      ALTER TABLE element ADD COLUMN width REAL;
      ALTER TABLE element ADD COLUMN height REAL;
      INSERT INTO element(rowid,slide_id,element_uid,order_index,foreground_resource_id,x,y,width,height)
      VALUES (800,100,'DVD',5,906,.2,.25,.6,.5), (801,103,'DVD',0,906,0,0,1,1);
      CREATE TABLE element_property_group (link_id INTEGER, group_name TEXT);
      CREATE TABLE element_property (group_id INTEGER, key TEXT, value TEXT);
      INSERT INTO element_property_group(rowid,link_id,group_name) VALUES (1,800,'Foreground'), (2,801,'Foreground');
      INSERT INTO element_property VALUES (1,'AspectRatio','3'), (1,'Mute','0'), (1,'Volume','44'),
        (2,'AspectRatio','2'), (2,'Mute','1'), (2,'Volume','30');
    `)
    const { cues } = await readEasyWorshipSchedule(file)
    const standalone = cues.find((cue) => cue.id === '31')
    const asset = standalone?.slides[0].assets[0]
    expect(standalone?.kind).toBe('video')
    expect(asset).toMatchObject({ kind: 'video', filename: 'เพลงจาก DVD',
      dvd: { discName: 'แผ่นทดสอบ', title: 2, chapter: 3, audioTrack: 1, clip: { startSeconds: 2, endSeconds: 4.5 },
        thumbnail: 'data:image/jpeg;base64,/9j/4A==', metadata: { author: 'ทีมสื่อ' }, playback: { volume: .30, muted: true, fit: 'fill' } } })
    const layered = cues.find((cue) => cue.id === '30')?.slides[0]
    expect(layered?.assets.some((item) => item.dvd)).toBe(false)
    expect(layered?.design?.layers).toContainEqual(expect.objectContaining({
      kind: 'media', fit: 'cover', frame: { x: .2, y: .25, width: .6, height: .5 },
      asset: expect.objectContaining({ kind: 'video', dvd: { ...asset?.dvd, playback: { volume: .44, muted: false, fit: 'cover' } } }),
    }))
  })

  it('keeps the native Feed title and alternate device names on one cue asset', async () => {
    const file = await makeSchedule(`
      CREATE TABLE resource (title TEXT);
      INSERT INTO resource (rowid, title) VALUES (904, 'กล้องเวที');
      CREATE TABLE resource_feed (resource_id INTEGER);
      CREATE TABLE resource_feed_pc (resource_id INTEGER, device_name TEXT, device_uid TEXT);
      INSERT INTO resource_feed VALUES (904);
      INSERT INTO resource_feed_pc VALUES (904, 'AV Booth (Camera 1)', 'first-windows-id');
      INSERT INTO resource_feed_pc VALUES (904, 'Capture Card', 'second-windows-id');
      INSERT INTO resource_feed_pc VALUES (904, 'AV Booth (Camera 1)', 'same-device-other-pc');
      INSERT INTO element VALUES (101, 'BACKGROUND', 1, 904, NULL);
    `)
    const { cues } = await readEasyWorshipSchedule(file)
    expect(cues.find((cue) => cue.id === '20')?.slides[0].assets).toEqual([{
      kind: 'camera', filename: 'กล้องเวที', role: 'background', deviceHints: ['AV Booth (Camera 1)', 'Capture Card'],
    }])
    expect(JSON.stringify(cues)).not.toContain('windows-id')
  })

  it('preserves a schedule Feed’s compatible settings and its element’s aspect mode', async () => {
    const file = await makeSchedule(`
      CREATE TABLE resource (title TEXT);
      INSERT INTO resource (rowid, title) VALUES (904, 'กล้องเวที');
      CREATE TABLE resource_feed (resource_id INTEGER);
      INSERT INTO resource_feed VALUES (904);
      CREATE TABLE resource_feed_pc (resource_id INTEGER, device_name TEXT, width INTEGER, height INTEGER, frame_rate INTEGER);
      INSERT INTO resource_feed_pc VALUES (904, 'Camera A', 1280, 720, 333333), (904, 'Camera B', 1280, 720, 400000);
      INSERT INTO element(rowid, slide_id, element_uid, order_index, foreground_resource_id) VALUES (800, 101, 'BACKGROUND', 1, 904);
      CREATE TABLE element_property_group (link_id INTEGER, group_name TEXT);
      CREATE TABLE element_property (group_id INTEGER, key TEXT, value TEXT);
      INSERT INTO element_property_group VALUES (800, 'Foreground');
      INSERT INTO element_property VALUES (1, 'AspectRatio', '2');
    `)
    const schedule = await readEasyWorshipSchedule(file)
    const cues = convertEasyWorshipCues(schedule)
    const cue = cues.find((item) => item.sourceId === '20')!
    const slide = cue.slides[0]
    expect(slide.assets).toEqual([{
      kind: 'camera', filename: 'กล้องเวที', role: 'background', deviceHints: ['Camera A', 'Camera B'],
      feedVideo: { width: 1280, height: 720, fit: 'fill' },
    }])
    const recovered = recoverableScheduleSlideDetails(cues)
    const camera = { ...slide.assets![0], feedVideo: undefined }
    const earlier = { ...cue, label: 'Local title', slides: [{ ...slide, lines: ['Keep local lyrics'], assets: [
      camera, { ...camera, filename: 'Local backup camera' }, { ...camera, role: 'foreground' as const },
    ] }] }
    const result = fillScheduleSlideDetails(earlier, recovered)!
    expect(result.count).toBe(1)
    expect(result.cue).toEqual({ ...earlier, slides: [{ ...earlier.slides[0], assets: [slide.assets![0], ...earlier.slides[0].assets.slice(1)] }] })
    expect(fillScheduleSlideDetails(result.cue, recovered)).toBeUndefined()
  })

  it('places native camera layers in order, omits hidden elements and upgrades the old fullscreen attachment', async () => {
    const file = await makeSchedule(`
      ALTER TABLE element ADD COLUMN x REAL;
      ALTER TABLE element ADD COLUMN y REAL;
      ALTER TABLE element ADD COLUMN width REAL;
      ALTER TABLE element ADD COLUMN height REAL;
      CREATE TABLE resource (title TEXT);
      INSERT INTO resource(rowid, title) VALUES (904, 'Camera inset'), (905, 'Hidden camera');
      CREATE TABLE resource_feed (resource_id INTEGER);
      INSERT INTO resource_feed VALUES (904), (905);
      CREATE TABLE resource_feed_pc (resource_id INTEGER, device_name TEXT, width INTEGER, height INTEGER, frame_rate INTEGER);
      INSERT INTO resource_feed_pc VALUES (904, 'Native device', 1280, 720, 400000);
      INSERT INTO element(rowid,slide_id,element_uid,order_index,foreground_resource_id,x,y,width,height)
        VALUES (800,100,'CAMERA_PIP',-1,904,.55,.15,.3,.4), (801,100,'CAMERA_HIDDEN',2,905,0,0,1,1);
      CREATE TABLE element_property_group (link_id INTEGER, group_name TEXT);
      CREATE TABLE element_property (group_id INTEGER, key TEXT, value TEXT);
      INSERT INTO element_property_group VALUES (800, 'Foreground'), (801, 'Element');
      INSERT INTO element_property VALUES (1,'AspectRatio','2'), (1,'Opacity','72'), (1,'Mute','1'), (1,'Volume','45'), (2,'Hidden','1');
    `)
    const cues = convertEasyWorshipCues(await readEasyWorshipSchedule(file))
    const cue = cues.find(({ sourceId }) => sourceId === '30')!
    const slide = cue.slides[0]
    const layers = slide.design!.layers
    expect(layers[0]).toEqual({ id: '800-foreground', kind: 'camera', frame: { x: .55, y: .15, width: .3, height: .4 }, opacity: .72,
      asset: { kind: 'camera', filename: 'Camera inset', role: 'foreground', deviceHints: ['Native device'],
        feedVideo: { width: 1280, height: 720, frameRate: 25, fit: 'fill' }, feedSound: { muted: true, level: 45 } } })
    expect(layers[1].kind).toBe('text')
    expect(slide.assets?.some(({ kind }) => kind === 'camera')).toBe(false)
    const earlierText = { ...layers[1], text: 'An announcement edited in WorshipTeam' }
    expect(earlierText.kind).toBe('text')
    const earlier = { ...cue, slides: [{ ...slide, assets: [...slide.assets!, {
      kind: 'camera' as const, role: 'foreground' as const, filename: 'Camera inset',
    }], design: { ...slide.design!, layers: [earlierText, ...layers.slice(2)] } }] }
    const update = fillScheduleSlideDetails(earlier, recoverableScheduleSlideDetails(cues))!
    expect(update.count).toBe(1)
    expect(update.cue.slides[0].design?.layers).toEqual([layers[0], earlierText, ...layers.slice(2)])
    expect(update.cue.slides[0].assets).toEqual(slide.assets)
    expect(fillScheduleSlideDetails(update.cue, recoverableScheduleSlideDetails(cues))).toBeUndefined()
  })

  it('resolves camera elements through two linked layout levels and keeps child overrides', async () => {
    const file = await makeSchedule(`
      ALTER TABLE slide ADD COLUMN slide_uid TEXT;
      ALTER TABLE slide ADD COLUMN theme_id INTEGER;
      ALTER TABLE slide ADD COLUMN theme_slide_uid TEXT;
      ALTER TABLE element ADD COLUMN x REAL;
      ALTER TABLE element ADD COLUMN y REAL;
      ALTER TABLE element ADD COLUMN width REAL;
      ALTER TABLE element ADD COLUMN height REAL;
      CREATE TABLE resource (title TEXT);
      INSERT INTO resource(rowid, title) VALUES (904,'Master camera'), (905,'Local camera');
      CREATE TABLE resource_feed (resource_id INTEGER);
      INSERT INTO resource_feed VALUES (904), (905);
      CREATE TABLE resource_feed_pc (resource_id INTEGER, device_name TEXT, width INTEGER, height INTEGER, frame_rate INTEGER);
      INSERT INTO resource_feed_pc VALUES (904,'Native PTZ',1280,720,400000);
      INSERT INTO presentation(rowid,presentation_uid,presentation_type,order_index,group_level,title)
        VALUES (40,'master-theme',12,1,1,'Theme dependency');
      INSERT INTO slide(rowid,presentation_id,title,order_index,slide_uid,theme_slide_uid) VALUES
        (110,40,'Master',0,'MASTER',NULL),(111,40,'Title layout',1,'TITLE','MASTER');
      UPDATE slide SET theme_id=40,theme_slide_uid='TITLE' WHERE rowid=100;
      INSERT INTO slide(rowid,presentation_id,title,order_index,theme_id,theme_slide_uid) VALUES
        (112,30,'Hidden',1,40,'TITLE'),(113,30,'Empty override',2,40,'TITLE'),
        (114,30,'Photo override',3,40,'TITLE'),(115,30,'Local Feed',4,40,'TITLE');
      INSERT INTO element(rowid,slide_id,element_uid,order_index,foreground_resource_id,x,y,width,height) VALUES
        (800,110,'CAMERA_PIP',-1,904,.55,.16,.2,.3),(801,111,'CAMERA_PIP',-1,NULL,0,0,1,1),
        (802,112,'CAMERA_PIP',-1,NULL,0,0,1,1),(803,113,'CAMERA_PIP',-1,NULL,0,0,1,1),
        (804,114,'CAMERA_PIP',-1,902,.5,.2,.15,.25),(805,115,'CAMERA_PIP',-1,905,.4,.1,.3,.3),
        (806,100,'CAMERA_PIP',-1,NULL,.5,.14,.33,.3);
      CREATE TABLE element_property_group (link_id INTEGER, group_name TEXT);
      CREATE TABLE element_property (group_id INTEGER, key TEXT, value TEXT);
      INSERT INTO element_property_group VALUES (800,'Foreground'), (801,'Foreground'), (802,'Element'),
        (803,'Overrides'),(806,'Overrides');
      INSERT INTO element_property VALUES (1,'AspectRatio','1'),(1,'Mute','0'),(2,'Opacity','65'),
        (2,'Volume','40'),(3,'Hidden','true'),(4,'mofForeground','1'),(5,'mofDims','True');
    `)
    const cues = convertEasyWorshipCues(await readEasyWorshipSchedule(file))
    expect(cues.some((cue) => cue.sourceId === '40')).toBe(false)
    const cue = cues.find((item) => item.sourceId === '30')!
    const [linked, hidden, blank, photo, local] = cue.slides
    const feeds = (slide: typeof linked) => slide.design?.layers.filter((layer) => layer.kind === 'camera') ?? []
    expect(linked.design?.cameraMasterImported).toBe(true)
    expect(linked.design?.layers[0].kind).toBe('camera')
    expect(feeds(linked)).toMatchObject([{ id: '800-foreground', inheritedFromMaster: true,
      frame: { x: .5, y: .14, width: .33, height: .3 }, opacity: .65,
      asset: { filename: 'Master camera', feedSound: { muted: false, level: 40 }, feedVideo: { fit: 'contain', frameRate: 25 } } }])
    expect(linked.assets?.some((asset) => asset.kind === 'camera')).toBe(false)
    expect([hidden, blank, photo].map(feeds)).toEqual([[], [], []])
    expect(photo.design?.layers[0].kind).toBe('media')
    expect(feeds(local)).toMatchObject([{ id: '805-foreground', asset: { filename: 'Local camera' } }])
    const { layers, cameraMasterImported: _camera, ...oldLayout } = linked.design!
    const oldLayers = layers.filter((layer) => layer.kind !== 'camera')
    const earlier = { ...cue, slides: [{ ...linked, design: { ...oldLayout, layers: oldLayers } }] }
    const recovery = recoverableScheduleSlideDetails(cues)
    expect(fillScheduleSlideDetails(earlier, recovery)?.cue.slides[0].design).toEqual(linked.design)
    expect(fillScheduleSlideDetails({ ...cue, slides: [{ ...linked, design: { ...linked.design!, layers: oldLayers } }] }, recovery)).toBeUndefined()
  })

  it('reads the nested Global definition through the theme chain and omits it from the cue list', async () => {
    const file = await makeSchedule(`
      ALTER TABLE slide ADD COLUMN slide_uid TEXT;
      ALTER TABLE slide ADD COLUMN theme_id INTEGER;
      ALTER TABLE slide ADD COLUMN theme_slide_uid TEXT;
      INSERT INTO presentation(rowid,presentation_uid,presentation_type,order_index,group_level,title)
        VALUES (40,'BLANK',12,1,1,'Theme dependency'),(41,'GLOBAL',11,1,2,'Global'),(42,'blank-presentation',8,5,0,'Blank presentation');
      INSERT INTO slide(rowid,presentation_id,title,order_index,slide_uid,theme_slide_uid) VALUES
        (110,40,'Master',0,'MASTER','PRESENTATION'),(111,40,'Blank',1,'BLANK','MASTER'),
        (112,41,'Master',0,'MASTER',NULL),(113,41,'Presentation',1,'PRESENTATION','MASTER');
      UPDATE slide SET theme_id=40,theme_slide_uid='BLANK' WHERE rowid=100;
      INSERT INTO slide(rowid,presentation_id,order_index,theme_id,theme_slide_uid) VALUES (114,42,0,40,'BLANK');
      DELETE FROM element WHERE slide_id=100 AND element_uid='BACKGROUND';
      INSERT INTO file(rowid,filename) VALUES (52,'packed-audio');
      INSERT INTO resource_audio VALUES (904,52,'Global bed.wav');
      INSERT INTO element VALUES (112,'BACKGROUND',0,NULL,902),(112,'AUDIO',1,904,NULL);
      CREATE TABLE slide_property_group (link_id INTEGER, group_name TEXT);
      CREATE TABLE slide_property (group_id INTEGER, key TEXT, value TEXT);
      INSERT INTO slide_property_group VALUES(113,'SlideAdvance'),(113,'TransitionIn');
      INSERT INTO slide_property VALUES(1,'Action','1'),(1,'Delay','1500'),(2,'UID','sdDXBlend'),(2,'Duration','760');
    `)
    const result = await readEasyWorshipSchedule(file)
    expect(result.cues.map(({ id }) => id)).toEqual(['30', '20', '21', '31', '42'])
    expect(result.unsupported.some(({ cueId }) => cueId === '41')).toBe(false)
    const slide = result.cues[0].slides[0]
    expect(slide.design?.layers).toContainEqual(expect.objectContaining({ inheritedFromMaster: true, kind: 'media',
      asset: expect.objectContaining({ archivePath: 'media/packed-bg.jpg' }) }))
    expect(slide.assets).toContainEqual(expect.objectContaining({ role: 'background', filename: 'Global bed.wav', inheritedFromMaster: true }))
    expect(slide.playback).toEqual({ mode: 'timer', delayMs: 1500 })
    expect(slide.transition).toEqual({ uid: 'sdDXBlend', values: { Duration: '760' } })
    expect(result.cues[1].slides[0].transition).toBeUndefined()
    expect(result.cues.find(({ id }) => id === '42')).toMatchObject({ kind: 'presentation', slides: [{ lines: [], assets: [
      { kind: 'audio', filename: 'Global bed.wav', inheritedFromMaster: true },
    ] }] })
  })

  it('inherits a gradient and packed video through a shared background and respects a local image override', async () => {
    const file = await makeSchedule(`
      ALTER TABLE slide ADD COLUMN slide_uid TEXT;
      ALTER TABLE slide ADD COLUMN theme_id INTEGER;
      ALTER TABLE slide ADD COLUMN theme_slide_uid TEXT;
      ALTER TABLE resource_video ADD COLUMN start_pos INTEGER;
      ALTER TABLE resource_video ADD COLUMN end_pos INTEGER;
      ALTER TABLE resource_video ADD COLUMN alpha_channel_mode INTEGER;
      UPDATE resource_video SET start_pos=20000000,end_pos=80000000,alpha_channel_mode=2 WHERE resource_id=903;
      CREATE TABLE resource_gradient (resource_id INTEGER,angle INTEGER);
      CREATE TABLE resource_gradient_color (resource_id INTEGER,color_from INTEGER,color_to INTEGER,percent_from REAL,percent_to REAL);
      INSERT INTO resource_gradient VALUES (905,35);
      INSERT INTO resource_gradient_color VALUES (905,255,65280,0,100);
      INSERT INTO presentation(rowid,presentation_uid,presentation_type,order_index,group_level,title)
        VALUES (40,'master-image-theme',12,1,1,'Background dependency');
      INSERT INTO slide(rowid,presentation_id,title,order_index,slide_uid,theme_slide_uid) VALUES
        (110,40,'Master',0,'MASTER',NULL),(111,40,'Title layout',1,'TITLE','MASTER');
      UPDATE slide SET theme_id=40,theme_slide_uid='TITLE' WHERE rowid=100;
      DELETE FROM element WHERE slide_id=100 AND element_uid='BACKGROUND';
      INSERT INTO slide(rowid,presentation_id,title,order_index,theme_id,theme_slide_uid) VALUES
        (112,30,'Photo override',1,40,'TITLE'),(113,30,'Hide background',2,40,'TITLE');
      INSERT INTO element(rowid,slide_id,element_uid,order_index,foreground_resource_id,background_resource_id) VALUES
        (800,110,'BACKGROUND',-1,903,905),(801,111,'BACKGROUND',-1,NULL,NULL),
        (802,112,'BACKGROUND',-1,902,NULL),(803,113,'BACKGROUND',-1,NULL,NULL);
      CREATE TABLE element_property_group (link_id INTEGER, group_name TEXT);
      CREATE TABLE element_property (group_id INTEGER, key TEXT, value TEXT);
      INSERT INTO element_property_group VALUES (800,'Foreground'),(803,'Element');
      INSERT INTO element_property VALUES (1,'AspectRatio','2'),(1,'Opacity','78'),(2,'Hidden','1');
    `)
    const all = convertEasyWorshipCues(await readEasyWorshipSchedule(file))
    const cue = all.find(({ sourceId }) => sourceId === '30')!
    const [original, photo, hidden] = cue.slides
    expect(original.design?.backgroundMasterImported).toBe(true)
    expect(original.design?.layers).toMatchObject([
      { kind: 'fill', inheritedFromMaster: true, fill: { type: 'gradient', angle: 35, stops: [{ color: '#ff0000', position: 0 }, { color: '#00ff00', position: 1 }] } },
      { kind: 'media', inheritedFromMaster: true, opacity: .78, fit: 'fill', loop: true, asset: { kind: 'video', archivePath: 'media/packed-video.mp4',
        alphaMode: 'side-by-side', clip: { startSeconds: 2, endSeconds: 8 } } },
      { kind: 'text', text: 'Welcome\nHome' },
    ])
    expect(original.assets).toEqual([])
    expect(photo.design?.layers).toMatchObject([
      { kind: 'fill', inheritedFromMaster: true }, { kind: 'media', asset: { kind: 'image', archivePath: 'media/packed-bg.jpg' } },
    ])
    expect(hidden.design?.layers ?? []).toEqual([])

    const earlier = { ...cue, slides: cue.slides.map((slide) => {
      if (!slide.design) return slide
      const { backgroundMasterImported: _master, layers, ...design } = slide.design
      return { ...slide, design: { ...design, layers: layers.filter((layer) => !layer.inheritedFromMaster) } }
    }) }
    const recovered = fillScheduleSlideDetails(earlier, recoverableScheduleSlideDetails(all))
    expect(recovered?.backgrounds).toBe(3)
    expect(recovered?.cue.slides).toEqual(cue.slides)
    expect(fillScheduleSlideDetails(recovered!.cue, recoverableScheduleSlideDetails(all))).toBeUndefined()
  })

  it('keeps a scheduled song’s positioned text and packed background while hiding the editor-only marker', async () => {
    const file = await makeSchedule(String.raw`
      ALTER TABLE element ADD COLUMN x REAL;
      ALTER TABLE element ADD COLUMN y REAL;
      ALTER TABLE element ADD COLUMN width REAL;
      ALTER TABLE element ADD COLUMN height REAL;
      UPDATE element SET x=0.2,y=0.3,width=0.6,height=0.5 WHERE slide_id=101;
      UPDATE resource_text SET rtf='{\rtf1{\pard\sdparawysiwghidden Verse 1\par}{\pard\qr\fs108\sdfsauto Song lyric\par}}'
        WHERE resource_id=901;
      INSERT INTO element (slide_id,element_uid,order_index,foreground_resource_id) VALUES (101,'BACKGROUND',-1,903);
    `)
    const { cues } = await readEasyWorshipSchedule(file)
    expect(cues.find((cue) => cue.id === '20')?.slides[0]).toMatchObject({
      lines: ['Song lyric'],
      design: { layers: [
        { kind: 'media', loop: true, asset: { kind: 'video', archivePath: 'media/packed-video.mp4' } },
        { kind: 'text', slot: 'content', text: 'Song lyric', frame: { x: 0.2, y: 0.3, width: 0.6, height: 0.5 },
          style: { align: 'right', fitText: true } },
      ] },
    })
  })

  it('carries both native split alpha modes on attached media and layered designs', async () => {
    const file = await makeSchedule(`
      ALTER TABLE resource_video ADD COLUMN alpha_channel_mode INTEGER;
      UPDATE resource_video SET alpha_channel_mode=2 WHERE resource_id=903;
      INSERT INTO resource_video VALUES (904,51,'Top and bottom.mp4',1);
      INSERT INTO element VALUES (101,'BACKGROUND',1,904,NULL);
    `)
    const schedule = await readEasyWorshipSchedule(file)
    const [welcome, song] = convertEasyWorshipCues(schedule)
    const side = welcome.slides[0].assets?.find((asset) => asset.kind === 'video')
    const top = song.slides[0].assets?.find((asset) => asset.kind === 'video')
    expect(side?.alphaMode).toBe('side-by-side')
    expect(top?.alphaMode).toBe('top-bottom')
    expect(song.slides[0].design?.layers).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'media', asset: expect.objectContaining({ alphaMode: 'top-bottom' }) }),
    ]))
  })

  it('keeps independent poster positions for native video resources sharing packed bytes', async () => {
    const schedule = await readEasyWorshipSchedule(await makeSchedule(`
      ALTER TABLE resource_video ADD COLUMN poster_frame_pos INTEGER DEFAULT -1;
      UPDATE resource_video SET poster_frame_pos=15000000 WHERE resource_id=903;
      INSERT INTO resource_video VALUES (904,51,'Another use.mp4',0);
      INSERT INTO element VALUES (101,'BACKGROUND',1,904,NULL);
    `))
    const [welcome, song] = convertEasyWorshipCues(schedule)
    expect(welcome.slides[0].assets?.find((asset) => asset.kind === 'video')).toMatchObject({ posterSeconds: 1.5 })
    expect(song.slides[0].assets?.find((asset) => asset.kind === 'video')).toMatchObject({ posterSeconds: 0 })
    expect(song.slides[0].design?.layers).toContainEqual(
      expect.objectContaining({ kind: 'media', asset: expect.objectContaining({ posterSeconds: 0 }) }),
    )
  })

  it('keeps a song’s dedicated audio and identifies an audio-only cue', async () => {
    const file = await makeSchedule(`
      ALTER TABLE resource_audio ADD COLUMN repeating INTEGER;
      INSERT INTO resource_audio VALUES (904,52,'<audio>Choir.wav',1);
      INSERT INTO file(rowid,filename) VALUES (52,'packed-audio');
      INSERT INTO element VALUES (101,'AUDIO',2,904,NULL);
      INSERT INTO presentation(rowid,presentation_type,order_index,title) VALUES (32,8,5,'Choir audio');
      INSERT INTO slide(rowid,presentation_id,order_index) VALUES (104,32,0);
      INSERT INTO element VALUES (104,'AUDIO',0,904,NULL);
    `)
    const { cues } = await readEasyWorshipSchedule(file)
    const audio = {
      kind: 'audio', filename: 'Choir.wav', archivePath: 'media/packed-audio', role: 'background', repeat: true,
    }
    expect(cues.find((cue) => cue.id === '20')).toMatchObject({ kind: 'song', slides: [{ assets: [audio] }] })
    expect(cues.find((cue) => cue.id === '32')).toMatchObject({ kind: 'audio', slides: [{ assets: [audio] }] })
  })

  it('preserves saved scripture words and restores missing verses from the exact imported edition', async () => {
    const range = (17n << 57n) | (43n << 50n) | (3n << 42n) | (16n << 34n) | (17n << 26n)
    const file = await makeSchedule(`
      CREATE TABLE element_property_group (link_id INTEGER, group_name TEXT);
      CREATE TABLE element_property (group_id INTEGER, key TEXT, value TEXT);
      INSERT INTO presentation(rowid,presentation_type,order_index,title) VALUES (32,7,5,'John 3:16-17');
      INSERT INTO slide(rowid,presentation_id,title,order_index) VALUES (104,32,'John 3:16 (KJV)',0), (105,32,NULL,1), (106,32,NULL,2);
      INSERT INTO resource_text VALUES (904,'Edited verse wording');
      INSERT INTO element(rowid,slide_id,element_uid,order_index,foreground_resource_id) VALUES
        (1001,104,'CONTENT_SCRIPTURE',1,904), (1002,105,'CONTENT_SCRIPTURE',1,NULL),
        (1003,105,'CONTENT_SONG',2,901), (1004,106,'CONTENT_SCRIPTURE',1,904);
      INSERT INTO element_property_group(rowid,link_id,group_name) VALUES (1,1001,'Element'), (2,1002,'Element'), (3,1004,'Element');
      INSERT INTO element_property VALUES (1,'ScriptureRangeID','${range}'), (2,'ScriptureRangeID','${range}'), (3,'ScriptureRangeID','${range}');
    `)
    const unresolved = await readEasyWorshipSchedule(file, undefined, async () => null)
    const saved = await readEasyWorshipSchedule(file, undefined, async (id) => id === 17 ? {
      id: 'easyworship-17-kjv', name: 'King James Version', abbreviation: 'KJV',
      books: [{ id: '43', name: 'John', verses: [
        { chapter: 3, verse: 16, text: 'Original verse 16' },
        { chapter: 3, verse: 17, text: 'Original verse 17' },
      ] }],
    } : null)
    const restored = convertEasyWorshipCues(saved).find((cue) => cue.sourceId === '32')
    expect(restored?.kind).toBe('scripture')
    expect(restored?.slides[0]).toMatchObject({ label: 'John 3:16 (KJV)', lines: ['Edited verse wording'] })
    expect(restored?.slides[1]).toMatchObject({
      label: 'John 3:16–17 · KJV', lines: ['Original verse 16', 'Original verse 17'],
      scriptureRange: { translationId: 17, book: 43, chapter: 3, firstVerse: 16, lastVerse: 17 },
      scriptureVerseStarts: [{ line: 0, verse: 16 }, { line: 1, verse: 17 }],
      design: { layers: [{ slot: 'content', text: 'Original verse 16\nOriginal verse 17' }] },
    })
    expect(unresolved.cues.find((cue) => cue.id === '32')?.slides[1].warnings[0]).toContain('รหัสฉบับ 17')
    expect(saved.source.importId).toBe(unresolved.source.importId)
    expect(saved.source.previousScriptureImportId).toBe(await importIdentity([
      'easyworship-schedule-scripture-v1', unresolved.source.importId, [
        ['105', 'John 3:16–17 · KJV', ['Original verse 16', 'Original verse 17']],
        ['106', 'John 3:16–17 · KJV', ['Edited verse wording']],
      ],
    ]))

    const existing = convertEasyWorshipCues(unresolved).find((cue) => cue.sourceId === '32')!
    const [archived, missing, unnamed] = existing.slides
    const moved = { ...missing, label: 'อ้างอิงที่แก้ในแอป', advanceMs: 2500, design: {
      ...missing.design!, layers: missing.design!.layers.map((layer) => ({ ...layer, frame: { ...layer.frame, x: .21 } })),
    } }
    const local = { ...existing, label: 'ตารางที่เปลี่ยนชื่อ', warnings: [...existing.warnings!, 'ตรวจสื่อท้องถิ่น'],
      slides: [moved, { ...archived, lines: ['ข้อความที่แก้ในแอป'] }, unnamed] }
    const recovery = recoveredScheduleScripture(saved)
    const filled = fillScheduleScripture(local, recovery)
    expect(filled?.count).toBe(2)
    const oldSlide = { ...filled!.cue.slides[0], scriptureVerseStarts: undefined }
    const upgraded = fillScheduleScripture({ ...filled!.cue, slides: [oldSlide] }, recovery)
    expect(upgraded?.cue.slides[0]).toEqual({ ...oldSlide,
      scriptureVerseStarts: [{ line: 0, verse: 16 }, { line: 1, verse: 17 }] })
    expect(filled?.cue.warnings).not.toContainEqual(expect.stringContaining('รหัสฉบับ 17'))
    expect(filled?.cue.warnings).toContain('ตรวจสื่อท้องถิ่น')
    expect(filled?.cue).toMatchObject({ label: local.label, slides: [
      { label: moved.label, advanceMs: 2500, lines: ['Original verse 16', 'Original verse 17'], design: { layers: [
        { slot: 'content', frame: { x: .21 }, text: 'Original verse 16\nOriginal verse 17' },
      ] } },
      { lines: ['ข้อความที่แก้ในแอป'] },
      { label: 'John 3:16–17 · KJV', lines: ['Edited verse wording'] },
    ] })
    expect(fillScheduleScripture(filled!.cue, recovery)).toBeUndefined()
    expect(fillScheduleScripture({ ...existing, slides: [{ ...missing, textEdited: true, labelEdited: true }] }, recovery)).toBeUndefined()
    expect(fillScheduleScripture({ ...existing, slides: [{ ...missing, scriptureRange: { ...missing.scriptureRange!, lastVerse: 18 } }] }, recovery)).toBeUndefined()
  })

  it('recovers book-name metadata from the named edition on a schedule without ScriptureRangeID', async () => {
    const file = await makeSchedule(`
      INSERT INTO presentation(rowid,presentation_type,order_index,title) VALUES (32,7,5,'Juan 3:16 (RVA)');
      INSERT INTO slide(rowid,presentation_id,title,order_index) VALUES (104,32,'Juan 3:16 (RVA)',0);
      INSERT INTO resource_text VALUES (904,'Texto que estaba guardado');
      INSERT INTO element(rowid,slide_id,element_uid,order_index,foreground_resource_id) VALUES (1001,104,'CONTENT_SCRIPTURE',1,904);
    `)
    const lookup = Object.assign(async () => null, { byAbbreviation: async (marker: string) => marker === 'RVA' ? {
      id: 'easyworship-36-rva', name: 'Reina Valera Antigua', abbreviation: 'RVA',
      books: [{ id: '43', name: 'Juan', abbreviation: 'Jn', verses: [] }],
    } : null })
    const before = await readEasyWorshipSchedule(file, undefined, async () => null)
    const after = await readEasyWorshipSchedule(file, undefined, lookup)
    expect(after.source.importId).toBe(before.source.importId)
    const existing = convertEasyWorshipCues(before).find(({ sourceId }) => sourceId === '32')!
    const recovered = recoveredScheduleScripture(after)
    const patched = fillScheduleScripture(existing, recovered)
    expect(patched?.cue.slides[0]).toMatchObject({ label: 'Juan 3:16 (RVA)', lines: ['Texto que estaba guardado'],
      scriptureBookNames: expect.arrayContaining([{ name: 'Juan', abbreviation: 'Jn' }]) })
    expect(fillScheduleScripture(patched!.cue, recovered)).toBeUndefined()
    const [[id, sources]] = recovered.entries()
    expect(id).toBe(existing.sourceId)
    expect(sources.size).toBe(1)
    expect(fillScheduleScripture({ ...existing, slides: [{ ...existing.slides[0], labelEdited: true }] }, recovered)).toBeUndefined()
  })

  it('decodes a signed scripture ID above JavaScript’s safe integer range', () => {
    const signed = BigInt.asIntN(64, (91n << 57n) | (43n << 50n) | (1n << 42n) | (2n << 34n))
    expect(decodeEasyWorshipScriptureRange(String(signed))).toEqual({
      translationId: 91, book: 43, chapter: 1, firstVerse: 2, lastVerse: 2,
    })
    expect(decodeEasyWorshipScriptureRange(Number(signed))).toBeUndefined()
    expect(decodeEasyWorshipScriptureRange('18446744073709551616')).toBeUndefined()
  })

  it('keeps cue order and duplicate songs while retaining verified text and packed asset references', async () => {
    const file = await makeSchedule()
    const result = await readEasyWorshipSchedule(file)

    expect(result.source).toMatchObject({ filename: 'service.ewsx', version: '7.3.0.11' })
    expect(result.source.importId).toMatch(/^[a-f0-9-]{36}$/)
    expect(result.cues.map((cue) => [cue.id, cue.order, cue.kind])).toEqual([
      ['30', 1, 'presentation'], ['20', 2, 'song'], ['21', 3, 'song'], ['31', 4, 'unknown'],
    ])
    expect(result.cues[0].slides[0]).toMatchObject({
      id: '100', label: 'Welcome slide', lines: ['Welcome', 'Home'],
      assets: [
        { kind: 'image', filename: 'Original Background.jpg', archivePath: 'media/packed-bg.jpg', role: 'background' },
        { kind: 'video', filename: 'Background.mp4', archivePath: 'media/packed-video.mp4', role: 'background' },
      ],
    })
    expect(result.cues[1].slides[0].lines).toEqual(['Verse 1', 'Song lyric'])
    expect(result.cues[1].metadata.presentationUid).toBe('song-a')
    expect(result.cues[2].metadata.presentationUid).toBe('song-a')
    expect(result.cues[3].metadata.groupLevel).toBe(1)
    expect(result.unsupported).toEqual([{ cueId: '31', message: 'ชนิดกำหนดการ EasyWorship 12 ยังไม่รองรับ' }])

    const renamed = await readEasyWorshipSchedule(new File([file], 'renamed.ewsx'))
    expect(renamed.source.importId).toBe(result.source.importId)
  })

  it('keeps same-named absolute references distinct and repairs a previously imported schedule slot', async () => {
    const result = await readEasyWorshipSchedule(await makeSchedule(String.raw`
      ALTER TABLE resource_video ADD COLUMN filesize INTEGER;
      UPDATE resource_video SET file_id=NULL, original_filename='D:\Service\Offering\Background.mp4', filesize=7;
      INSERT INTO resource_video VALUES (904, NULL, '\\server\share\Baptism\Background.mp4', 7);
      INSERT INTO element VALUES (101,'BACKGROUND',3,NULL,904);
    `))
    const cues = convertEasyWorshipCues(result)
    const assets = [...missingEasyWorshipScheduleMedia(cues)]
    expect(assets).toHaveLength(2)
    const links = new Map(assets.map(([key, asset]) => {
      expect(asset).toMatchObject({ filename: 'Background.mp4', easyWorshipFileSize: 7 })
      const original = result.externalMediaLocations?.get(asset.easyWorshipSourceLocationId!)
      return [key, { libraryId: original?.includes('Offering') ? 'offering' : 'baptism' }]
    }))
    const [presentation, song] = relinkEasyWorshipScheduleMedia(cues, links)
    expect(presentation.slides[0].assets?.find(({ kind }) => kind === 'video')?.libraryId).toBe('offering')
    expect(song.slides[0].assets?.find(({ kind }) => kind === 'video')?.libraryId).toBe('baptism')
    expect(JSON.stringify([presentation, song])).not.toContain('Offering')

    const original = JSON.parse(JSON.stringify(cues[0], (name, value) =>
      ['easyWorshipSourceLocationId', 'easyWorshipFileSize'].includes(name) ? undefined : value))
    const recovery = recoverableScheduleMedia({ sourceId: result.source.importId }, cues, links)!
    expect(fillScheduleMedia(original, recovery)?.cue?.slides[0].assets?.find(({ kind }) => kind === 'video')?.libraryId).toBe('offering')

    const otherFolder = Object.defineProperty(new File(['wrong!!'], 'Background.mp4'), 'webkitRelativePath', { value: 'Copy/Unknown/Background.mp4' })
    const wrong = await reviewEasyWorshipScheduleMedia([cues[0]], [otherFolder], false, undefined, undefined, result.externalMediaLocations)
    expect(wrong.links.size).toBe(0)
    const file = new File(['origins'], 'Background.mp4')
    const attached = await reviewEasyWorshipScheduleMedia([cues[0]], [file], false, undefined, undefined, result.externalMediaLocations)
    expect(attached.cues[0].slides[0].assets?.find(({ kind }) => kind === 'video')?.archivePath).toBeDefined()
    const oldAttachment = await reviewEasyWorshipScheduleMedia([original], [file], false)
    expect(await attached.sourceId(result.source.importId)).toBe(await oldAttachment.sourceId(result.source.importId))
  })

  it('rejects damaged and substituted packed media before saving and repairs the original slot', async () => {
    const video = new File(['original video bytes'], 'Renamed video.mp4')
    const hash = await mediaFileHash(video)
    const file = await makeSchedule(`ALTER TABLE file ADD COLUMN file_hash TEXT;
      UPDATE file SET file_hash='${hash}' WHERE rowid=51;`)
    const bytes = new Uint8Array(await file.arrayBuffer())
    const image = new TextEncoder().encode('image bytes')
    const imageStart = bytes.findIndex((_, offset) => image.every((byte, index) => bytes[offset + index] === byte))
    expect(imageStart).toBeGreaterThan(0)
    bytes[imageStart] ^= 1

    const schedule = await readEasyWorshipSchedule(new File([bytes], 'damaged.ewsx'))
    const cues = convertEasyWorshipCues(schedule)
    const [broken] = cues
    const [damagedImage, wrongVideo] = broken.slides[0].assets!
    expect(damagedImage.archivePath).toBeUndefined()
    expect(wrongVideo.archivePath).toBeUndefined()
    expect(wrongVideo.easyWorshipFileHash).toBe(hash)
    const preview = await reviewEasyWorshipScheduleMedia(cues, [video], false, undefined, schedule.rejectedPackedMedia)
    expect(preview.unresolved).toEqual(['อ่านไฟล์ Original Background.jpg ที่บรรจุใน .ewsx ไม่สำเร็จ'])
    expect(preview.cues[0].warnings).not.toContain('ไฟล์ Background.mp4 ที่บรรจุใน .ewsx มีเนื้อหาไม่ตรงกับต้นฉบับ')

    const old = structuredClone(broken)
    old.label = 'Local title'
    const oldVideo = old.slides[0].assets![1]
    oldVideo.archivePath = 'media/packed-video.mp4'
    oldVideo.crc32 = 123
    const recovery = recoverableScheduleMedia({ sourceId: schedule.source.importId }, cues, preview.links, schedule.rejectedPackedMedia)!
    const repaired = fillScheduleMedia(old, recovery)?.cue
    expect(repaired?.label).toBe('Local title')
    expect(repaired?.slides[0].assets?.[1]).toEqual(preview.cues[0].slides[0].assets?.[1])
    oldVideo.libraryId = 'user-selected-video'
    expect(fillScheduleMedia(old, recovery)?.cue?.slides[0].assets?.[1]).toEqual(oldVideo)
  })
})
