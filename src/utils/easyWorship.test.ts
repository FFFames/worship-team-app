/** Regression coverage for the EasyWorship 6.1/7 browser database reader. */

import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { readEasyWorshipSongs, recoverEasyWorshipLyrics } from './easyWorship';
import { easyWorshipSongIdentity } from './easyWorshipSongIdentity';

async function createDatabaseFile(
  name: string,
  statements: string,
): Promise<File> {
  const SQL = await initSqlJs();
  const database = new SQL.Database();
  database.run(statements);
  const data = database.export();
  database.close();
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return new File([copy], name);
}

function quoteSqlText(value: string): string {
  return value.replace(/'/g, "''");
}

describe('readEasyWorshipSongs', () => {
  it('reads metadata, Unicode RTF lyrics, and keeps lyric slide order', async () => {
    const songs = await createDatabaseFile('Songs.db', `
      CREATE TABLE song (title TEXT, author TEXT, copyright TEXT, song_number TEXT, administrator TEXT, description TEXT, tags TEXT,
        song_uid TEXT, song_item_uid TEXT);
      INSERT INTO song VALUES ('เพลงพระคุณ', 'ผู้แต่ง', '© 2026 Church', '12345', 'ผู้ดูแล',
        'คำอธิบายเพลง' || char(10) || 'บรรทัดสอง', 'เพลงไทย;นมัสการ' || char(13) || char(10) || 'ขอบคุณ',
        ' PCI-Native-Abc ', 'separate-local-item');
    `);
    const words = await createDatabaseFile('SongWords.db', `
      CREATE TABLE word (song_id INTEGER, words TEXT);
      INSERT INTO word VALUES (1, '{\\rtf1\\ansi Verse 1\\par พระคุณพระเจ้า\\page Chorus\\par เราร้องสรรเสริญ}');
    `);

    const result = await readEasyWorshipSongs(songs, words);

    expect(result.skipped).toEqual([]);
    expect(result.songs).toEqual([
      {
        sourceId: '1',
        wordsRecovery: { id: expect.any(String), lyricsOnly: false, title: 'เพลงกู้คืน #1 · พระคุณพระเจ้า' },
        sourceUid: 'pci-native-abc',
        title: 'เพลงพระคุณ',
        author: 'ผู้แต่ง',
        copyright: '© 2026 Church',
        administrator: 'ผู้ดูแล',
        description: 'คำอธิบายเพลง\nบรรทัดสอง',
        tags: ['เพลงไทย;นมัสการ', 'ขอบคุณ'],
        ccli: '12345',
        sections: [
          { label: 'Verse 1', lines: ['พระคุณพระเจ้า'] },
          { label: 'Chorus', lines: ['เราร้องสรรเสริญ'] },
        ],
      },
    ]);
  });

  it('reports songs with no matching readable lyric record without dropping valid songs', async () => {
    const songs = await createDatabaseFile('Songs.db', `
      CREATE TABLE song (title TEXT);
      INSERT INTO song VALUES ('Has lyrics');
      INSERT INTO song VALUES ('No lyrics');
    `);
    const words = await createDatabaseFile('SongWords.db', `
      CREATE TABLE word (song_id INTEGER, words TEXT);
      INSERT INTO word VALUES (1, 'First line
Second line');
    `);

    const result = await readEasyWorshipSongs(songs, words);

    expect(result.songs).toMatchObject([
      {
        sourceId: '1',
        title: 'Has lyrics',
        sections: [{ label: 'Slide 1', lines: ['First line', 'Second line'] }],
      },
    ]);
    expect(result.skipped).toEqual([
      { sourceId: '2', title: 'No lyrics', reason: 'ไม่พบสไลด์เนื้อร้องที่อ่านได้' },
    ]);
  });

  it('keeps paragraph layout from SongWords when a song has no companion slide design', async () => {
    const songs = await createDatabaseFile('Songs.db', "CREATE TABLE song (title TEXT); INSERT INTO song VALUES ('Thai chorus');");
    const raw = '{\\rtf1\\ansi\\pard\\fs48 Verse 1\\par\\li480\\fi240 \\u3585?\\line Soft\\par'
      + '\\pard Next\\page Chorus\\par Only plain text}';
    const words = await createDatabaseFile('SongWords.db', 'CREATE TABLE word (song_id INTEGER, words TEXT);'
      + "INSERT INTO word VALUES (1, '" + quoteSqlText(raw) + "');");

    const result = await readEasyWorshipSongs(songs, words);
    expect(result.songs[0].sections).toEqual([
      { label: 'Verse 1', lines: ['ก', 'Soft', 'Next'], lyricRuns: [
        { text: 'ก\nSoft', paragraph: { index: 1, leftIndent: 1, firstLineIndent: 0.5 } },
        { text: '\nNext', paragraph: { index: 2 } },
      ] },
      { label: 'Chorus', lines: ['Only plain text'] },
    ]);
  });

  it('recovers character formatting and alignment without overriding the theme font on automatic runs', async () => {
    const songs = await createDatabaseFile('Songs.db', "CREATE TABLE song (title TEXT); INSERT INTO song VALUES ('Styled lyrics');");
    const raw = String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0 Verdana;}{\f1 Tahoma;}}{\colortbl;\red231\green40\blue69;\red0\green0\blue0;}
\pard\f0\fntnamaut\fs24 Verse 1\par\ql เพลง {\f1\b\i\ul\cf1\fs36\sdstroke\sdstrokecolor2\sdstrokealpha128{\*\sdstrokewidthf 0.05}ทดสอบ}\par
\pard\qr {\shad\sdshadcolor2\sdshadalpha200{\*\sdshadoffsf 0.1}อีกครั้ง}\page\pard\plain Chorus\par ร้องพร้อมกัน}`;
    const words = await createDatabaseFile('SongWords.dat', 'CREATE TABLE word (song_id INTEGER, words TEXT);'
      + "INSERT INTO word VALUES (1, '" + quoteSqlText(raw) + "');");

    const [paired, recovered] = await Promise.all([readEasyWorshipSongs(songs, words), recoverEasyWorshipLyrics(words)]);
    const sections = paired.songs[0].sections;
    expect(recovered.songs[0].sections).toEqual(sections);
    expect(sections).toEqual([
      { label: 'Verse 1', lines: ['เพลง ทดสอบ', 'อีกครั้ง'], lyricRuns: [
        { text: 'เพลง ', align: 'left', paragraph: { index: 1 } },
        { text: 'ทดสอบ', align: 'left', paragraph: { index: 1 },
          style: { color: '#e72845', fontFamily: 'Tahoma', sizeScale: 1.5, bold: true, italic: true, underline: true,
            outline: { color: '#00000080', width: .05 } } },
        { text: '\nอีกครั้ง', align: 'right', paragraph: { index: 2 },
          style: { textShadow: { color: '#000000c8', offset: .1 } } },
      ] },
      { label: 'Chorus', lines: ['ร้องพร้อมกัน'] },
    ]);
  });

  it('rejects database pairs that do not expose EasyWorship song tables', async () => {
    const songs = await createDatabaseFile('Songs.db', 'CREATE TABLE unrelated (name TEXT);');
    const words = await createDatabaseFile('SongWords.db', 'CREATE TABLE word (song_id INTEGER, words TEXT);');

    await expect(readEasyWorshipSongs(songs, words)).rejects.toThrow(
      'ไม่พบตารางเพลงและเนื้อร้องของ EasyWorship ในไฟล์ที่เลือก',
    );
  });

  it('reads independent RTF word records, ignores font metadata, and retains non-contiguous row ids', async () => {
    const songs = await createDatabaseFile('Songs.db', `
      CREATE TABLE song (title TEXT, song_number INTEGER);
      INSERT INTO song(rowid, title, song_number) VALUES (4, 'Missing lyrics', 42);
      INSERT INTO song(rowid, title, song_number) VALUES (9, 'Database song', 101);
    `);
    const firstRecord = String.raw`{\rtf1\ansi\ansicpg874\uc1{\fonttbl{\f0 Arial;}}\f0\fntnamaut Verse 1\par\'a1\'a2\par\par Chorus\par{\*\generator EasyWorship;}\u3585?}`;
    const secondRecord = String.raw`{\rtf1\ansi Verse 2\par second record}`;
    const words = await createDatabaseFile('SongWords.db', `
      CREATE TABLE word (song_id INTEGER, words TEXT);
      INSERT INTO word VALUES (9, '${quoteSqlText(firstRecord)}');
      INSERT INTO word VALUES (9, '${quoteSqlText(secondRecord)}');
    `);

    const result = await readEasyWorshipSongs(songs, words);

    expect(result.songs).toEqual([
      {
        sourceId: '9',
        wordsRecovery: { id: expect.any(String), lyricsOnly: false, title: 'เพลงกู้คืน #9 · กข' },
        title: 'Database song',
        author: null,
        copyright: null,
        ccli: '101',
        sections: [
          { label: 'Verse 1', lines: ['กข'] },
          { label: 'Chorus', lines: ['ก'] },
          { label: 'Verse 2', lines: ['second record'] },
        ],
      },
    ]);
    expect(result.skipped).toEqual([
      { sourceId: '4', title: 'Missing lyrics', reason: 'ไม่พบสไลด์เนื้อร้องที่อ่านได้' },
    ]);
  });

  it('rejects the binary EasyWorship 2009 database family clearly', async () => {
    const songs = new File([new Uint8Array([0, 1, 2, 3])], 'Songs.DB');
    const words = await createDatabaseFile('SongWords.db', 'CREATE TABLE word (song_id INTEGER, words TEXT);');

    await expect(readEasyWorshipSongs(songs, words)).rejects.toThrow(
      'เปิดฐานข้อมูล EasyWorship ไม่สำเร็จ',
    );
  });
});

describe('recoverEasyWorshipLyrics', () => {
  it('keeps lyrics ordered by song and reports missing or unusable rows', async () => {
    const fixture = await createDatabaseFile('SongWords.dat', String.raw`
      CREATE TABLE word (song_id INTEGER, words TEXT);
      INSERT INTO word VALUES (7, '{\rtf1\ansi Verse 1\par เพลงทดสอบ\page Chorus\par ร้องอีกครั้ง}'),
        (7, 'Encore'), (8, NULL), (NULL, 'Orphaned text');
    `);
    const result = await recoverEasyWorshipLyrics(fixture);
    expect(result).toMatchObject({
      recoveredLyricsOnly: true,
      songs: [{ sourceId: '7', title: 'เพลงกู้คืน #7 · เพลงทดสอบ', author: null, copyright: null, ccli: null, sections: [
        { label: 'Verse 1', lines: ['เพลงทดสอบ'] }, { label: 'Chorus', lines: ['ร้องอีกครั้ง'] }, { lines: ['Encore'] },
      ] }],
      skipped: [{ sourceId: '8', reason: 'ไม่พบสไลด์เนื้อร้องที่อ่านได้' }],
      warnings: ['ข้ามเนื้อร้องที่ไม่มีรหัสเพลงที่อ่านได้ 1 กลุ่ม'],
    });
    expect(result.songs[0].sourceUid).toBeUndefined();
  });

  it('links the same words snapshot across recovery and full import, including after a file rename', async () => {
    const schema = "CREATE TABLE word (song_id INTEGER, words TEXT); INSERT INTO word VALUES (1, 'Same lyric');";
    const words = await createDatabaseFile('SongWords.db', schema);
    const renamed = new File([words], 'SongWords.dat');
    const otherWords = await createDatabaseFile('SongWords.db', schema + 'PRAGMA user_version = 2;');
    const catalog = await createDatabaseFile('Songs.db', "CREATE TABLE song (title TEXT); INSERT INTO song VALUES ('Catalog title');");
    const [recovery, paired, other] = await Promise.all([
      recoverEasyWorshipLyrics(renamed), readEasyWorshipSongs(catalog, words), recoverEasyWorshipLyrics(otherWords),
    ]);
    const [recovered] = recovery.songs;
    const [full] = paired.songs;
    const [unrelated] = other.songs;

    expect(recovered.wordsRecovery).toEqual({ ...full.wordsRecovery, lyricsOnly: true });
    expect(await easyWorshipSongIdentity(recovered)).toBe(full.wordsRecovery?.id);
    expect(await easyWorshipSongIdentity(full)).not.toBe(full.wordsRecovery?.id);
    expect(unrelated.sections).toEqual(recovered.sections);
    expect(await easyWorshipSongIdentity(unrelated)).not.toBe(await easyWorshipSongIdentity(recovered));
  });

  it('recognizes an unchanged native word record across different SQLite snapshots', async () => {
    const schema = "CREATE TABLE word (song_id INTEGER, words TEXT, slide_uids TEXT);";
    const uid = '1-0B288661-4078-4334-AE9B-F726BEBA18C2';
    const record = (words: string, slideId: string, songId = 1) => `INSERT INTO word VALUES (${songId}, '${words}', '${slideId}');`;
    const first = await createDatabaseFile('SongWords.db', schema + record('Same lyric', uid));
    const later = await createDatabaseFile('SongWords.db', schema + record('Same lyric', uid.toLowerCase())
      + record('Different song', '1-B0CE2010-8085-4F99-AB86-D8E3D8845FC4', 2));
    const changed = await createDatabaseFile('SongWords.db', schema + record('Edited lyric', uid));
    const other = await createDatabaseFile('SongWords.db', schema + record('Same lyric', '1-B0CE2010-8085-4F99-AB86-D8E3D8845FC4'));
    const duplicate = await createDatabaseFile('SongWords.db', schema + record('Same lyric', uid) + record('Other row', uid, 2));
    const catalog = await createDatabaseFile('Songs.db', "CREATE TABLE song (title TEXT); INSERT INTO song VALUES ('Catalog title');");
    const [recovery, paired, edit, unrelated, ambiguous] = await Promise.all([
      recoverEasyWorshipLyrics(first), readEasyWorshipSongs(catalog, later), recoverEasyWorshipLyrics(changed),
      recoverEasyWorshipLyrics(other), recoverEasyWorshipLyrics(duplicate),
    ]);
    const [original] = recovery.songs;
    const [repacked] = paired.songs;
    const recordId = original.wordsRecovery?.recordId;
    expect(recordId).toBeDefined();
    expect(await easyWorshipSongIdentity(original)).toBe(recordId);
    expect(repacked.wordsRecovery?.id).not.toBe(original.wordsRecovery?.id);
    expect(repacked.wordsRecovery?.recordId).toBe(recordId);
    expect(edit.songs[0].wordsRecovery?.recordId).not.toBe(recordId);
    expect(unrelated.songs[0].wordsRecovery?.recordId).not.toBe(recordId);
    expect(ambiguous.songs.every(({ wordsRecovery }) => wordsRecovery?.recordId === undefined)).toBe(true);
  });
});
