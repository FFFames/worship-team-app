/** Reads DVD definitions from both the Media.db catalogue and native layouts. */

import type { Database } from 'sql.js'
import { dvdTextFields, type DvdClip, type DvdMetadata, type DvdPlayback } from '../types/dvdClip'
import { encodeDvdThumbnail } from './dvdThumbnail'
import { readEasyWorshipMediaClip } from './easyWorshipMediaClip'
import { readEasyWorshipMediaPlayback } from './easyWorshipMediaPlayback'

type Row = Record<string, unknown>

function rows(db: Database, table: string, ids: string[] = []): Row[] {
  const columns = db.exec(`PRAGMA table_info(${table})`)[0]?.values.map((column) => column[1])
  if (!columns?.length) return []
  const exact = ids.filter((id) => columns.includes(id)).map((id) => `, CAST(${id} AS TEXT) AS _${id}`).join('')
  const statement = db.prepare(`SELECT CAST(rowid AS TEXT) AS _id, *${exact} FROM ${table} NOT INDEXED ORDER BY rowid`)
  const result: Row[] = []
  try {
    while (statement.step()) result.push(statement.getAsObject())
    return result
  } finally { statement.free() }
}

const text = (value: unknown, limit = 240) => typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : undefined
const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined

export function dvdWithElementPlayback(dvd: DvdClip, settings: DvdPlayback | undefined): DvdClip {
  return settings ? { ...dvd, playback: { ...dvd.playback, ...settings } } : dvd
}

export function readEasyWorshipDvds(db: Database, layout = false): Map<string, DvdClip> {
  const parentId = layout ? 'resource_id' : 'media_id'
  const discId = layout ? 'resource_dvd_disk_id' : 'dvd_disk_id'
  const definitions = rows(db, layout ? 'resource_dvd' : 'media_dvd', [parentId, discId])
  const result = new Map<string, DvdClip>()
  if (!definitions.length) return result
  const parents = new Map(rows(db, layout ? 'resource' : 'media').map((row) => [String(row._id), row]))
  const discs = new Map(rows(db, layout ? 'resource_dvd_disk' : 'dvd_disk').map((row) => [String(row._id), row]))
  for (const record of definitions) {
    const rowId = String(record[`_${parentId}`])
    const parent = parents.get(rowId)
    if (!parent || result.has(rowId)) continue
    const disc = discs.get(String(record[`_${discId}`]))
    const details = {
      discName: text(disc?.disk_name), discUid: text(disc?.disk_uid),
      title: integer(record.clip_title), chapter: integer(record.clip_chapter), angle: integer(record.clip_angle),
      audioTrack: integer(record.clip_audio), subtitleTrack: integer(record.clip_subpicture),
      segmentStart: integer(record.clip_segment_start_pos), segmentDuration: integer(record.clip_segment_duration),
      frameRateFlag: integer(record.clip_fps_flag),
      repeat: (layout ? record.repeating : parent.repeating) === 1 || undefined,
      clip: readEasyWorshipMediaClip(layout ? record.start_pos : parent.start_pos, layout ? record.end_pos : parent.end_pos),
    }
    const name = text(parent.title) ?? details.discName ?? `DVD ${rowId}`
    const sourceFolder = text(parent.folder, 4_000)
    const discKey = details.discUid ?? details.discName ?? text(parent.media_uid ?? parent.resource_uid) ?? name
    const id = JSON.stringify([discKey.toLowerCase(), details.title, details.chapter, details.angle, details.audioTrack,
      details.subtitleTrack, details.segmentStart, details.segmentDuration, details.clip])
    const thumbnail = encodeDvdThumbnail(record.thumbnail)
    const metadata: DvdMetadata = {}
    for (const field of dvdTextFields) {
      const value = text(parent[field], 4_000)
      if (value !== undefined) metadata[field] = value
    }
    const playback = layout ? undefined : readEasyWorshipMediaPlayback(parent.volume, parent.mute, parent.aspect_type)
    result.set(rowId, { id, name, ...details, ...(sourceFolder ? { sourceFolder } : {}),
      ...(thumbnail ? { thumbnail } : {}), ...(playback ? { playback } : {}),
      ...(Object.keys(metadata).length ? { metadata } : {}) })
  }
  return result
}
