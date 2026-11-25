/** Reads EasyWorship message templates, their reusable token catalog and weekly service times. */

import type { AlertOutput, AlertResourceCatalog, AlertServiceInterval, AlertTemplate, AlertToken } from '../types/alertTemplate'
import { getEasyWorshipSql, isEasyWorshipSqliteDatabase } from './easyWorship'
import { importIdentity } from './importIdentity'
import { recoverAlertTagText } from './easyWorshipAlertTags'
import { nativeServiceTime } from './alertTokens'

const outputs: Readonly<Record<string, AlertOutput>> = { '0': 'live', '1': 'stage', '2': 'alternate' }
const MAX_DATABASE_BYTES = 32 * 1024 * 1024

type AlertRow = {
  id: string
  target: number
  name: string | null
  rtf: string | null
  displayType: number | null
  alignment: number | null
  endType: number | null
  repeatCount: number | null
  endToken: string | null
}

export async function readEasyWorshipAlerts(file: File, profileName = 'EasyWorship', serviceIntervals?: AlertServiceInterval[]) {
  if (file.size > MAX_DATABASE_BYTES) throw new Error('ไฟล์ Alerts.db มีขนาดเกิน 32 MB')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isEasyWorshipSqliteDatabase(bytes)) throw new Error('ไฟล์ Alerts.db ต้องเป็นฐานข้อมูล SQLite ของ EasyWorship')
  const SQL = await getEasyWorshipSql()
  const database = new SQL.Database(bytes)

  function read<T>(query: string) {
    const statement = database.prepare(query)
    const records: T[] = []
    try {
      while (statement.step()) records.push(statement.getAsObject() as T)
    } finally {
      statement.free()
    }
    return records
  }

  let rows: AlertRow[]
  const catalogTokens: AlertResourceCatalog['tokens'] = []
  const tokensByAlert = new Map<string, AlertToken[]>()
  try {
    rows = read<AlertRow>(`
      SELECT CAST(rowid AS TEXT) AS id, alert_type AS target, name, CAST(rtf AS TEXT) AS rtf,
        display_type AS displayType, text_alignment AS alignment, end_type AS endType,
        repeat_count AS repeatCount, CAST(end_token AS TEXT) AS endToken
      FROM alert ORDER BY rowid`)
    const tokenTables = read<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('alert_token_link', 'token')")
    const tokens = new Map<string, AlertToken>()
    if (tokenTables.some(({ name }) => name === 'token')) {
      const fields = new Set(read<{ name: string }>('PRAGMA table_info(token)').map(({ name }) => name.toLowerCase()))
      for (const { target, ...token } of read<AlertToken & { target: number | null }>(`
        SELECT CAST(rowid AS TEXT) AS id, COALESCE(token_name, '') AS name, uid, token_type AS type,
          token_format AS format, token_interval AS interval, CAST(token_time_value AS TEXT) AS timeValue,
          CAST(token_time_value_fixed AS TEXT) AS fixedTime, token_allow_overrun AS allowOverrun,
          ${fields.has('alert_type') ? 'alert_type' : '0'} AS target
          ${fields.has('token_value') ? ', CAST(token_value AS TEXT) AS value' : ''}
        FROM token ORDER BY rowid`)) {
        tokens.set(token.id, token)
        const output = target == null ? undefined : outputs[target]
        if (output) catalogTokens.push({ output, token })
      }
    }
    if (tokenTables.length === 2) {
      for (const { alertId, tokenId } of read<{ alertId: string; tokenId: string }>(`
        SELECT CAST(alert_id AS TEXT) AS alertId, CAST(token_id AS TEXT) AS tokenId FROM alert_token_link ORDER BY rowid`)) {
        const token = tokens.get(tokenId)
        if (!token) continue
        const prior = tokensByAlert.get(alertId)
        if (prior) {
          if (!prior.includes(token)) prior.push(token)
        }
        else tokensByAlert.set(alertId, [token])
      }
    }
  } catch {
    throw new Error('ไม่พบโครงสร้างตารางของ Alerts.db ที่รองรับ')
  } finally {
    database.close()
  }

  const alerts: AlertTemplate[] = []
  const warnings: string[] = []
  for (const row of rows) {
    const title = row.name?.trim() || `ข้อความ ${row.id}`
    const output = outputs[row.target]
    if (!output) {
      warnings.push(`${title} · ไม่รู้จักประเภทจอ ${row.target ?? ''}`)
      continue
    }
    const rtf = row.rtf ?? ''
    const tokens = tokensByAlert.get(row.id) ?? []
    const text = recoverAlertTagText(rtf, tokens)
    const source = {
      profileName, rowId: row.id, rtf, tokens, displayType: row.displayType, alignment: row.alignment,
      endType: row.endType, repeatCount: row.repeatCount, endToken: row.endToken, serviceIntervals,
    }
    const id = await importIdentity(['easyworship-alert-v1', output, title, row, tokens])
    alerts.push({ id, title, text, output, source })
  }
  return { alerts, catalogTokens, warnings }
}

export async function makeAlertResourceCatalog(
  sourceName: string, tokens: AlertResourceCatalog['tokens'] = [], serviceIntervals: AlertServiceInterval[] = [],
): Promise<AlertResourceCatalog | undefined> {
  if (!tokens.length && !serviceIntervals.length) return undefined
  const id = await importIdentity(['easyworship-alert-catalog-v1', sourceName, tokens, serviceIntervals])
  return { id, sourceName, tokens, serviceIntervals }
}

export async function readEasyWorshipServiceIntervals(file: File) {
  if (file.size > MAX_DATABASE_BYTES) throw new Error('ไฟล์ ServiceIntervals.db มีขนาดเกิน 32 MB')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isEasyWorshipSqliteDatabase(bytes)) throw new Error('ไฟล์ ServiceIntervals.db ต้องเป็น SQLite')
  const SQL = await getEasyWorshipSql()
  const database = new SQL.Database(bytes)
  try {
    const [result] = database.exec(`
      SELECT CAST(start_time_fixed AS TEXT), CAST(start_time AS TEXT),
        CAST(end_time_fixed AS TEXT), CAST(end_time AS TEXT) FROM interval ORDER BY rowid`)
    return (result?.values ?? []).flatMap((row) => {
      const [fixedStart, start, fixedEnd, end] = row as (string | null)[]
      const startTime = nativeServiceTime(fixedStart, start)
      const endTime = nativeServiceTime(fixedEnd, end)
      return startTime && endTime ? [{
        startDay: startTime.day, startSeconds: startTime.seconds, endDay: endTime.day, endSeconds: endTime.seconds,
      }] : []
    })
  } finally {
    database.close()
  }
}
