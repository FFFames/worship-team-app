/** Reads song activity and song metadata from a native EasyWorship history database. */

import { getEasyWorshipSql, isEasyWorshipSqliteDatabase } from './easyWorship'
import { importIdentity } from './importIdentity'

export const SONG_ACTION_LABELS: Readonly<Record<string, string>> = { '0': 'เพิ่ม', '1': 'พิมพ์', '2': 'ฉาย' }

export type SongHistorySong = {
  id: string
  uid: string | null
  title: string
  author: string | null
  copyright: string | null
  administrator: string | null
  reference: string | null
  providerId: string | null
  providerError: string | null
}

export type SongHistoryAction = {
  id: string
  songId: string | null
  type: string | null
  originalDate: string | null
  originalTransmitDate: string | null
  songSnapshot?: SongHistorySong
}

export type SongHistory = {
  id: string
  name: string
  filename: string
  songs: SongHistorySong[]
  actions: SongHistoryAction[]
  origin?: 'worshipteam'
}

const WINDOWS_EPOCH_MS = Date.UTC(1601, 0, 1)
const MAX_DATABASE_BYTES = 128 * 1024 * 1024

/** A native TInstant is stored in 100 ns ticks since 1601-01-01 UTC. */
export function songHistoryDate(raw: string | null): Date | undefined {
  if (!raw) return undefined
  if (/^\d{17,19}$/.test(raw)) {
    const date = new Date(Number(BigInt(raw) / 10000n) + WINDOWS_EPOCH_MS)
    return Number.isFinite(date.getTime()) ? date : undefined
  }
  if (!/^\d{4}-\d{2}-\d{2}(?:(?:T| )\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(raw)) return undefined
  const day = new Date(`${raw.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== raw.slice(0, 10)) return undefined
  // A textual timestamp without a zone keeps the time on its original clock.
  const date = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw.replace(' ', 'T'))
  return Number.isFinite(date.getTime()) ? date : undefined
}

export async function readEasyWorshipSongHistory(file: File, name = file.name): Promise<SongHistory> {
  if (file.size > MAX_DATABASE_BYTES) throw new Error('ไฟล์ประวัติการใช้เพลงมีขนาดเกิน 128 MB')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isEasyWorshipSqliteDatabase(bytes)) throw new Error('ไฟล์ประวัติการใช้เพลงต้องเป็นฐานข้อมูล SQLite ของ EasyWorship')
  const SQL = await getEasyWorshipSql()
  const database = new SQL.Database(bytes)
  function read(query: string) {
    const statement = database.prepare(query)
    const records: Record<string, string | null>[] = []
    try {
      while (statement.step()) records.push(statement.getAsObject() as Record<string, string | null>)
    } finally {
      statement.free()
    }
    return records
  }

  let songs: SongHistorySong[]
  let actions: SongHistoryAction[]
  try {
    // Cast IDs and dates in SQLite, since JavaScript numbers cannot hold every int64 exactly.
    songs = read(`SELECT CAST(rowid AS TEXT) AS id, CAST(song_uid AS TEXT) AS uid, CAST(title AS TEXT) AS title,
      CAST(author AS TEXT) AS author, CAST(copyright AS TEXT) AS copyright, CAST(administrator AS TEXT) AS administrator,
      CAST(reference_number AS TEXT) AS reference, CAST(provider_id AS TEXT) AS providerId,
      CAST(provider_error AS TEXT) AS providerError FROM song ORDER BY rowid`)
      .map(({ id, uid, title, author, copyright, administrator, reference, providerId, providerError }) => ({
        id: id!, uid, title: title ?? '', author, copyright, administrator, reference, providerId, providerError,
      }))
    actions = read(`SELECT CAST(rowid AS TEXT) AS id, CAST(song_id AS TEXT) AS songId, CAST(action_type AS TEXT) AS type,
      CAST(date AS TEXT) AS originalDate, CAST(transmit_date AS TEXT) AS originalTransmitDate FROM action ORDER BY rowid`)
      .map(({ id, songId, type, originalDate, originalTransmitDate }) => ({
        id: id!, songId, type, originalDate, originalTransmitDate,
      }))
  } catch {
    throw new Error('ไม่พบตาราง song และ action ของ SongHistory.db ที่รองรับ')
  } finally {
    database.close()
  }
  const id = await importIdentity(['easyworship-song-history-v1', songs, actions])
  return { id, name, filename: file.name, songs, actions }
}
