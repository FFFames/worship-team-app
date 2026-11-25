import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'
import type { Song } from '../types/database'
import { formatLyricsOnly } from './chordParser'
import { reviewEasyWorshipProfile } from './easyWorshipProfile'
import { attachEasyWorshipProfileResources, createEasyWorshipProfileFiles } from './easyWorshipProfileFiles'
import { readEasyWorshipSongLibrary, reviewEasyWorshipSqliteFiles } from './easyWorshipSongLibrary'
import { getSongPresentationSlides } from './playlistCues'
import { mediaFileHash } from './easyWorshipMedia'
import { getSlideAdvance } from './slidePlayback'
import { cueForEditing } from './playlistCueEditing'

async function songFiles(slideUids: string, withBackground = false, backgroundHash?: string) {
  const SQL = await initSqlJs()
  function file(name: string, statements: string) {
    const db = new SQL.Database()
    try {
      db.run(statements)
      return new File([new Uint8Array(db.export())], name)
    } finally {
      db.close()
    }
  }
  const songs = file('Songs.db', "CREATE TABLE song (title TEXT, presentation_id INTEGER); INSERT INTO song VALUES ('Test song', 10);")
  const words = file('SongWords.db', String.raw`
    CREATE TABLE word (song_id INTEGER, words TEXT, slide_uids TEXT);
    INSERT INTO word VALUES (1, '{\rtf1\ansi Verse 1\par First line\page Chorus\par Second line}', '${slideUids}');
  `)
  const layouts = file('PresentationLayouts.db', String.raw`
    CREATE TABLE presentation (presentation_uid TEXT, presentation_type INTEGER, aspect_ratio TEXT);
    CREATE TABLE slide (presentation_id INTEGER, slide_uid TEXT, order_index INTEGER);
    CREATE TABLE element (slide_id INTEGER, element_uid TEXT, order_index INTEGER, x REAL, y REAL, width REAL, height REAL, foreground_resource_id INTEGER);
    CREATE TABLE resource_text (resource_id INTEGER, rtf TEXT);
    CREATE TABLE resource_image (resource_id INTEGER, original_filename TEXT);
    INSERT INTO presentation(rowid,presentation_uid,presentation_type,aspect_ratio) VALUES (10,'native-song',6,'4:3');
    INSERT INTO slide(rowid,presentation_id,slide_uid,order_index) VALUES (11,10,'1-IDA',0), (12,10,'1-IDB',1);
    ALTER TABLE slide ADD COLUMN title TEXT;
    UPDATE slide SET title='Repeated end' WHERE rowid=11;
    INSERT INTO element VALUES (11,'CONTENT_SONG',0,0.1,0,0.9,1,20), (12,'CONTENT_SONG',0,0.2,0,0.8,1,20);
    INSERT INTO resource_text VALUES (20,'{\rtf1\ansi{\pard\sdparawysiwghidden\fs40 \u3585? Native\par}{\pard Old placeholder}}');
    ${withBackground ? `INSERT INTO element VALUES (11,'BACKGROUND',1,0,0,1,1,23);
    INSERT INTO resource_image VALUES (23,'<images>Original.jpg');` : ''}
    ${backgroundHash ? `CREATE TABLE file (file_hash TEXT, filename TEXT);
      INSERT INTO file VALUES ('${backgroundHash}','Original.jpg');
      ALTER TABLE resource_image ADD COLUMN file_id INTEGER;
      UPDATE resource_image SET file_id=1;` : ''}
  `)
  return { songs, words, layouts, file }
}

async function library(slideUids: string) {
  const { songs, words, layouts } = await songFiles(slideUids)
  return readEasyWorshipSongLibrary(songs, { songWords: async () => words, layouts: async () => layouts })
}

async function editDatabase(file: File, sql: string) {
  const SQL = await initSqlJs()
  const db = new SQL.Database(new Uint8Array(await file.arrayBuffer()))
  try {
    db.run(sql)
    return new File([new Uint8Array(db.export())], file.name)
  } finally {
    db.close()
  }
}

describe('EasyWorship song appearances', () => {
  it('restores native song timers and looping in the library and a copied playlist cue', async () => {
    const { songs, words, layouts } = await songFiles('1-IDA,1-IDB')
    const withPlayback = await editDatabase(layouts, `
      ALTER TABLE presentation ADD COLUMN looping INTEGER;
      UPDATE presentation SET looping=1;
      CREATE TABLE slide_property_group (link_id INTEGER, group_name TEXT);
      CREATE TABLE slide_property (group_id INTEGER, key TEXT, value TEXT);
      INSERT INTO slide_property_group VALUES (11,'SlideAdvance'),(12,'SlideAdvance'),(12,'TransitionIn');
      INSERT INTO slide_property VALUES (1,'Action','1'),(1,'Delay','850'),(2,'Action','2'),(2,'Delay','0'),(3,'AlwaysReset','1');
    `)
    const { preview } = await readEasyWorshipSongLibrary(songs, { songWords: async () => words, layouts: async () => withPlayback })
    const [imported] = preview.songs
    expect(imported.appearance?.looping).toBe(true)
    const expected = [{ mode: 'timer', delayMs: 850 }, { mode: 'media', delayMs: 0, restart: true }]
    expect(imported.sections.map(({ playback }) => playback)).toEqual(expected)
    const song: Song = {
      id: 'song-test', title: imported.title, artist: imported.author, raw_content: formatLyricsOnly(imported.sections),
      appearance: imported.appearance, original_key: 'C', tempo: null, time_signature: null, youtube_url: null,
      user_id: null, tags: null, favorite: false, created_at: '', updated_at: '',
      sections: imported.sections.map((section) => ({ ...section, type: 'verse', marker: '', slideBreaks: [],
        lines: section.lines.map((lyrics) => ({ lyrics, chords: '' })) })),
    }
    const slides = getSongPresentationSlides(song, 'stanza')
    expect(slides.map(({ playback }) => playback)).toEqual(expected)
    expect(getSlideAdvance(slides, 1, song.appearance?.looping)).toEqual({ index: 0, delay: 0, afterMedia: true })
    const copy = cueForEditing({ song, id: 'cue-test', playlist_id: 'playlist-test', song_id: song.id,
      order: 0, transpose: 0, created_at: '' })
    expect(copy?.looping).toBe(true)
    expect(copy?.slides.map(({ playback }) => playback)).toEqual(expected)
  })

  it('verifies the layout hash for a linked song even without Media.db', async () => {
    const original = new File(['original image'], 'Moved.jpg')
    Object.defineProperty(original, 'webkitRelativePath', { value: 'Resources/Images/Moved.jpg' })
    const decoy = new File(['changed image'], 'Original.jpg')
    Object.defineProperty(decoy, 'webkitRelativePath', { value: 'Resources/Images/Original.jpg' })
    const { songs, words, layouts } = await songFiles('1-IDA,1-IDB', true, await mediaFileHash(original))
    const { review } = await reviewEasyWorshipProfile([songs, words, layouts, decoy, original])
    const layer = review?.songs?.songs[0]?.appearance?.sections?.[0]?.design.layers.find((item) => item.kind === 'media')
    expect(layer).toMatchObject({ asset: { filename: 'Original.jpg', sourcePath: 'Resources/Images/Moved.jpg' } })
  })

  it('matches layout slides by UID and inserts the current lyrics into their assigned frames', async () => {
    const { preview } = await library('1-idb,1-IDA')
    const [imported] = preview.songs
    expect(preview.warnings).toEqual([])
    expect(imported.appearance?.sections?.map((section) => [section.index, section.label])).toEqual([[0, 'Verse 1'], [1, 'Chorus']])
    expect(imported.sections.map(({ label, slideLabel, lines }) => [label, slideLabel, lines]))
      .toEqual([['Verse 1', 'ก Native', ['First line']], ['Chorus', 'Repeated end', ['Second line']]])
    const song = { raw_content: formatLyricsOnly(imported.sections), appearance: imported.appearance } as Song
    const slides = getSongPresentationSlides(song, 'stanza')
    expect(slides.map((slide) => slide.design?.layers[0])).toMatchObject([
      { kind: 'text', text: 'First line', frame: { x: 0.2 }, style: { fitText: true } },
      { kind: 'text', text: 'Second line', frame: { x: 0.1 }, style: { fitText: true } },
    ])
  })

  it('keeps all lyrics when the source UID list has a different length', async () => {
    const { preview } = await library('1-IDB')
    expect(preview.songs[0].appearance).toBeUndefined()
    expect(preview.songs[0].sections.map((section) => section.lines)).toEqual([['First line'], ['Second line']])
    expect(preview.warnings).toEqual(['ไม่พบเลย์เอาต์ที่จับคู่กับเพลง Test song'])
  })

  it('recovers layouts and labels by their lyrics when the source UID list is incomplete', async () => {
    const { songs, words, layouts } = await songFiles('1-IDA')
    const changed = await editDatabase(layouts, String.raw`
      UPDATE resource_text SET rtf='{\rtf1\ansi Second line}' WHERE resource_id=20;
      INSERT INTO resource_text VALUES (21,'{\rtf1\ansi{\pard\sdparawysiwghidden ท่อนเปิด\par}{\pard First\line \b line}}');
      UPDATE element SET foreground_resource_id=21 WHERE slide_id=12;
    `)
    const { preview } = await readEasyWorshipSongLibrary(songs, { songWords: async () => words, layouts: async () => changed })
    const [imported] = preview.songs
    expect(preview.warnings).toEqual([])
    expect(imported.appearance?.warnings).toBeUndefined()
    expect(imported.sections.map(({ label, slideLabel, lines }) => [label, slideLabel, lines])).toEqual([
      ['Verse 1', 'ท่อนเปิด', ['First line']], ['Chorus', 'Repeated end', ['Second line']],
    ])
    const slides = getSongPresentationSlides({ raw_content: formatLyricsOnly(imported.sections), appearance: imported.appearance } as Song, 'stanza')
    expect(slides.map((slide) => slide.design?.layers[0])).toMatchObject([
      { text: 'First line', frame: { x: .2 }, runs: [{ text: 'First' }, { text: ' line', style: { bold: true } }] },
      { text: 'Second line', frame: { x: .1 } },
    ])
  })

  it('uses labels to distinguish repeated lyrics and leaves indistinguishable repeats without a layout', async () => {
    const { songs, words, layouts } = await songFiles('1-IDB')
    const changedWords = await editDatabase(words, String.raw`
      UPDATE word SET words='{\rtf1\ansi Verse 1\par Repeat\page Chorus\par Repeat\page Outro\par Repeat\page Outro\par Repeat}';
    `)
    const changedLayouts = await editDatabase(layouts, String.raw`
      UPDATE resource_text SET rtf='{\rtf1\ansi Repeat}' WHERE resource_id=20;
      UPDATE slide SET title='Chorus' WHERE rowid=11;
      UPDATE slide SET title='Verse 1' WHERE rowid=12;
      INSERT INTO slide(rowid,presentation_id,slide_uid,order_index,title)
        VALUES (13,10,'1-IDC',2,'Outro'), (14,10,'1-IDD',3,'Outro');
      INSERT INTO element VALUES (13,'CONTENT_SONG',0,.3,0,.7,1,20), (14,'CONTENT_SONG',0,.4,0,.6,1,20);
    `)
    const { preview } = await readEasyWorshipSongLibrary(songs, { songWords: async () => changedWords, layouts: async () => changedLayouts })
    const [song] = preview.songs
    expect(song.sections.map(({ slideLabel, lines }) => [slideLabel, lines])).toEqual([
      ['Verse 1', ['Repeat']], ['Chorus', ['Repeat']], [undefined, ['Repeat']], [undefined, ['Repeat']],
    ])
    expect(song.appearance?.sections?.map(({ index, design }) => [index, design.layers[0].frame.x])).toEqual([[0, .2], [1, .1]])
    expect(song.appearance?.warnings).toEqual(['เลย์เอาต์บางท่อนไม่ตรงกับรหัสสไลด์ของเนื้อร้อง'])
  })

  it('resolves the original background reference through a relocated profile catalog asset', async () => {
    const { songs, words, layouts, file } = await songFiles('1-IDA,1-IDB', true)
    const original = new TextEncoder().encode('worship-team-test-background')
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', original))
    const digest = Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('')
    const catalog = file('Media.db', `
      CREATE TABLE media (media_type INTEGER, title TEXT, path TEXT, filename TEXT, filesize INTEGER, file_hash TEXT);
      INSERT INTO media VALUES (2,'Original JPEG','<images>','Original.jpg',${original.length},'${digest}');
    `)
    const renamed = new File([original], 'Renamed.jpg')
    Object.defineProperty(renamed, 'webkitRelativePath', { value: 'Resources/Images/Rehearsal/Renamed.jpg' })

    const { review } = await reviewEasyWorshipProfile([songs, words, layouts, catalog, renamed])
    const layer = review?.songs?.songs[0]?.appearance?.sections?.[0]?.design.layers.find((item) => item.kind === 'media')
    expect(layer).toMatchObject({ asset: { filename: 'Original.jpg', sourcePath: 'Resources/Images/Rehearsal/Renamed.jpg' } })
    expect(await (await review?.songs?.readAppearanceAsset?.('Resources/Images/Rehearsal/Renamed.jpg'))?.text())
      .toBe('worship-team-test-background')
  })

  it.each(['layout', 'catalog'] as const)('verifies loose song media using the %s checksum', async (checksum) => {
    const original = new File(['real image'], 'Renamed.jpg')
    const decoy = new File(['fake image'], 'Original.jpg')
    const hash = await mediaFileHash(original)
    const { songs, words, layouts, file } = await songFiles('1-IDA,1-IDB', true, checksum === 'layout' ? hash : undefined)
    const media = checksum === 'catalog' ? file('Media.db', `
      CREATE TABLE media (media_type INTEGER, title TEXT, path TEXT, filename TEXT, filesize INTEGER, file_hash TEXT);
      INSERT INTO media VALUES (2,'Original JPEG','<images>','Original.jpg',${original.size},'${hash}');
    `) : undefined
    const layout = checksum === 'layout' ? await editDatabase(layouts, `
      ALTER TABLE resource_image ADD COLUMN filesize INTEGER;
      UPDATE resource_image SET filesize=${original.size + 7};
    `) : layouts
    const input = { songs, words, layouts: layout, media }
    const asset = (preview: Awaited<ReturnType<typeof reviewEasyWorshipSqliteFiles>>) =>
      preview.songs[0]?.appearance?.sections?.[0]?.design.layers.find((layer) => layer.kind === 'media')?.asset

    const missing = await reviewEasyWorshipSqliteFiles({ ...input, attachedMedia: [decoy] })
    expect(asset(missing)).toMatchObject({ filename: 'Original.jpg', easyWorshipFileHash: hash })
    expect(asset(missing)?.sourcePath).toBeUndefined()

    const recovered = await reviewEasyWorshipSqliteFiles({ ...input, attachedMedia: [decoy, original] })
    const path = asset(recovered)?.sourcePath
    expect(path).toMatch(/\/Renamed\.jpg$/)
    expect(await recovered.withAppearanceAsset?.(path ?? '', (blob) => blob.text())).toBe('real image')
  })

  it('uses a colliding resource attachment only for the matching native reference', async () => {
    const archiveCopy = new File(['fake image'], 'Original.jpg')
    const original = new File(['real image'], 'Original.jpg')
    for (const image of [archiveCopy, original]) Object.defineProperty(image, 'webkitRelativePath', { value: 'Resources/Images/Original.jpg' })
    const digest = await mediaFileHash(original)
    const { songs, words, layouts, file } = await songFiles('1-IDA,1-IDB', true, digest)
    const catalog = file('Media.db', `
      CREATE TABLE media (media_type INTEGER, title TEXT, path TEXT, filename TEXT, filesize INTEGER, file_hash TEXT);
      INSERT INTO media VALUES (2,'Same name comparison','<images>','Original.jpg',${original.size},NULL);
    `)
    const source = await createEasyWorshipProfileFiles([songs, words, layouts, catalog, archiveCopy])
    const files = attachEasyWorshipProfileResources(source, source.profiles[0].id, [original])
    const { review } = await reviewEasyWorshipProfile(files)
    const recognized = review?.songs?.songs[0]?.appearance?.sections?.[0]?.design.layers.find((layer) => layer.kind === 'media')
    const recognizedPath = recognized?.asset.sourcePath ?? ''
    expect(recognizedPath).toMatch(/^@attached-resources\//)
    expect(await review?.songs?.withAppearanceAsset?.(recognizedPath, (blob) => blob.text())).toBe('real image')
    expect(review?.media?.entries).toHaveLength(1)
    expect(await review?.media?.entries?.[0]?.withFile?.((blob) => blob.text())).toBe('fake image')
  })
})
