/** Verifies exact native timestamp and action metadata migration and report filters. */

import { describe, expect, it } from 'vitest'
import { getEasyWorshipSql } from './easyWorship'
import { readEasyWorshipSongHistory, songHistoryDate } from './easyWorshipSongHistory'
import { exportSongHistoryCsv, localSongHistoryDay, songHistoryReport, summarizeSongHistory } from './songHistoryReport'

async function historyFile(name = 'SongHistory.db') {
  const SQL = await getEasyWorshipSql()
  const db = new SQL.Database()
  try {
    db.run(`CREATE TABLE song (rowid INTEGER PRIMARY KEY, song_uid TEXT, title TEXT, author TEXT, copyright TEXT,
      administrator TEXT, reference_number TEXT, provider_id INTEGER, provider_error INTEGER);
      CREATE TABLE action (rowid INTEGER PRIMARY KEY, song_id INTEGER, date DATETIME, action_type INTEGER, transmit_date DATETIME);
      INSERT INTO song VALUES (1, 'ext-1', '=ใช้ "เพลง"', 'ผู้แต่ง', 'Copyright', 'Publisher', '492', -1, NULL);
      INSERT INTO action VALUES
        (9007199254740999, 1, 134398919471490016, 2, 134398919471490017),
        (2, 1, '2026-11-23 06:00:00', 1, NULL),
        (3, 1, '2025-01-02', 0, NULL),
        (4, 99, 'unparseable', 18, NULL);`)
    return new File([new Uint8Array(db.export())], name)
  } finally {
    db.close()
  }
}

describe('EasyWorship SongHistory.db', () => {
  it('preserves long IDs, 100 ns ticks, metadata, unknown actions and history for missing songs', async () => {
    const data = await readEasyWorshipSongHistory(await historyFile())
    expect(data.actions).toHaveLength(4)
    const latest = data.actions[3]
    expect(latest).toEqual({
      id: '9007199254740999', songId: '1', type: '2', originalDate: '134398919471490016', originalTransmitDate: '134398919471490017',
    })
    expect(data.songs[0]).toMatchObject({ title: '=ใช้ "เพลง"', uid: 'ext-1', reference: '492', administrator: 'Publisher', providerId: '-1' })
    expect(songHistoryDate(latest.originalDate)?.toISOString()).toBe('2026-11-23T07:19:07.149Z')
    expect(songHistoryDate('2026-02-30')).toBeUndefined()
    expect((await readEasyWorshipSongHistory(await historyFile('copy.db'), 'Other copy')).id).toBe(data.id)
    expect(songHistoryReport(data, '', '', '')).toContainEqual({ action: data.actions[2], date: undefined, song: undefined })
    await expect(readEasyWorshipSongHistory(new File(['test'], 'SongHistory.db'))).rejects.toThrow('SQLite')
  })

  it('uses inclusive local dates, counts each activity type, and escapes CSV values', async () => {
    const data = await readEasyWorshipSongHistory(await historyFile())
    const projected = songHistoryDate(data.actions[3].originalDate)!
    const day = localSongHistoryDay(projected)
    const rows = songHistoryReport(data, day, day, '2')
    expect(rows.map(({ action }) => action.id)).toEqual(['9007199254740999'])
    expect(summarizeSongHistory(songHistoryReport(data, '', '', ''))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: '1', added: 1, printed: 1, projected: 1, other: 0 }),
      expect.objectContaining({ id: '99', other: 1 }),
    ]))
    const csv = exportSongHistoryCsv(rows)
    expect(csv).toContain(`"'=ใช้ ""เพลง"""`)
    expect(csv).toContain('"134398919471490016","134398919471490017"')
    expect(csv).not.toContain('2025-01-02')
  })
})
