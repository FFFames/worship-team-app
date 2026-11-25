import { describe, expect, it } from 'vitest'
import { getEasyWorshipSql } from './easyWorship'
import { makeAlertResourceCatalog, readEasyWorshipAlerts } from './easyWorshipAlerts'
import { reviewEasyWorshipProfile } from './easyWorshipProfile'
import { createEasyWorshipProfileFiles } from './easyWorshipProfileFiles'

function placed(filename: string, path: string, bytes: BlobPart = '') {
  const file = new File([bytes], filename)
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}

describe('EasyWorship Alerts.db', () => {
  it('reads RTF text, output types, and the exact linked token and alert data', async () => {
    const SQL = await getEasyWorshipSql()
    const db = new SQL.Database()
    let file: File
    const rtf = String.raw`{\rtf1\ansi \u3585?\u3634?\u3619?\par Test}`
    try {
      db.run(`CREATE TABLE alert (rowid INTEGER PRIMARY KEY, alert_type INT8, name TEXT, rtf RTF, display_type INT8,
        text_alignment INT8, end_type INT8, end_token TEXT, repeat_count INT);
        CREATE TABLE alert_token_link (rowid INTEGER PRIMARY KEY, alert_id INT, token_id INT);
        CREATE TABLE token (rowid INTEGER PRIMARY KEY, uid TEXT, token_name TEXT, token_type INT8, token_format TEXT,
          token_interval INT8, token_time_value DATETIME, token_time_value_fixed DATETIME, token_allow_overrun BOOLEAN);
        INSERT INTO alert VALUES (2,1,'ซ้อม', 'ข้อความบนเวที',0,0,0,NULL,1),
          (3,2,'ออนไลน์','ข้อความถ่ายทอดสด',0,0,0,NULL,1),(4,8,'Other','other',0,0,0,NULL,0);
        INSERT INTO token VALUES (9007199254740999,'clock-id','เวลา',1,'hh:nn',2,134398919471490016,NULL,0);
        INSERT INTO alert_token_link VALUES (1,9007199254740997,9007199254740999);`)
      db.run(`INSERT INTO alert VALUES (9007199254740997,0,'ประกาศ',?,2,1,2,'clock-id',3)`, [rtf])
      file = new File([new Uint8Array(db.export())], 'Alerts.db')
    } finally {
      db.close()
    }
    const result = await readEasyWorshipAlerts(file, 'Church')
    expect(result.alerts.map((item) => item.output)).toEqual(['stage', 'alternate', 'live'])
    expect(result.alerts[2]).toMatchObject({
      title: 'ประกาศ', text: 'การ\nTest', source: {
        profileName: 'Church', rowId: '9007199254740997', rtf, displayType: 2, alignment: 1, endType: 2, repeatCount: 3,
        endToken: 'clock-id', tokens: [{ id: '9007199254740999', name: 'เวลา', type: 1, timeValue: '134398919471490016' }],
      },
    })
    expect(result.warnings).toHaveLength(1)
    expect((await readEasyWorshipAlerts(file, 'Another copy')).alerts[2].id).toBe(result.alerts[2].id)
    await expect(readEasyWorshipAlerts(new File(['bad data'], 'Alerts.db'))).rejects.toThrow('SQLite')
  })

  it('scopes alert options to their containing profile without producing an extra profile', async () => {
    const first = 'Church/Service/v6.1/Options/Default.ewo/Data/Alerts.db'
    const second = 'Church/Team/v6.1/Options/Evening.ewo/Data/Alerts.db'
    const library = await createEasyWorshipProfileFiles([
      placed('Songs.db', 'Church/Service/v6.1/Databases/Data/Songs.db'),
      placed('Songs.db', 'Church/Team/v6.1/Databases/Data/Songs.db'),
      placed('Alerts.db', first, 'first'),
      placed('Alerts.db', second, 'second'),
      placed('Alerts.db', 'Church/Team/Resources/Alerts.db'),
    ])
    expect(library.profiles).toHaveLength(2)
    expect(library.profiles.map((profile) => profile.optionSets.map((set) => set.alertFile))).toEqual([[first], [second]])
    await expect(library.file(library.profiles[0].id, second)).rejects.toThrow()
    expect(await (await library.file(library.profiles[0].id, first)).text()).toBe('first')
  })

  it('preserves unlinked tokens and imports weekly times from an option set without Alerts.db', async () => {
    const SQL = await getEasyWorshipSql()
    const db = new SQL.Database()
    const root = 'Church/v6.1/Options'
    try {
      db.run(`CREATE TABLE alert (rowid INTEGER PRIMARY KEY, alert_type INT8, name TEXT, rtf RTF, display_type INT8,
        text_alignment INT8, end_type INT8, end_token TEXT, repeat_count INT);
        CREATE TABLE token (rowid INTEGER PRIMARY KEY, alert_type INT8, uid TEXT, token_name TEXT, token_type INT8,
          token_format TEXT, token_interval INT8, token_time_value DATETIME, token_time_value_fixed DATETIME,
          token_allow_overrun BOOLEAN, token_value TEXT);
        INSERT INTO token VALUES (1,0,'duration','เวลาซ้อม',6,'nn:ss',0,NULL,'00:10:00',0,NULL),
          (2,1,'text','เวลาซ้อม',0,NULL,NULL,NULL,NULL,0,'เริ่มแล้ว');`)
      const alerts = placed('Alerts.db', `${root}/Youth.ewo/Data/Alerts.db`, new Uint8Array(db.export()))
      db.run(`CREATE TABLE interval (start_time_fixed DATETIME, start_time DATETIME, end_time_fixed DATETIME, end_time DATETIME);
        INSERT INTO interval VALUES (NULL, '2026-11-23T09:00:00', NULL, '2026-11-23T10:00:00');`)
      const intervals = placed('ServiceIntervals.db', `${root}/Sunday.ewo/Data/ServiceIntervals.db`, new Uint8Array(db.export()))
      const sources = [placed('Songs.db', 'Church/v6.1/Databases/Data/Songs.db'), alerts, intervals]
      const { review: sunday, files } = await reviewEasyWorshipProfile(sources, undefined, undefined, 'v6.1/options/sunday.ewo')
      expect(sunday?.alertCatalog).toMatchObject({ tokens: [], serviceIntervals: [{ startDay: 1, startSeconds: 32400, endDay: 1, endSeconds: 36000 }] })
      const { review: youth } = await reviewEasyWorshipProfile(files, undefined, undefined, 'v6.1/options/youth.ewo')
      expect(youth?.alerts).toEqual([])
      expect(youth?.alertCatalog).toMatchObject({ serviceIntervals: [], tokens: [
        { output: 'live', token: { id: '1', name: 'เวลาซ้อม', fixedTime: '00:10:00' } },
        { output: 'stage', token: { id: '2', name: 'เวลาซ้อม', value: 'เริ่มแล้ว' } },
      ] })
      const { catalogTokens } = await readEasyWorshipAlerts(alerts)
      expect(await makeAlertResourceCatalog('Church · Youth', catalogTokens)).toEqual(youth?.alertCatalog)
    } finally {
      db.close()
    }
  })
})
