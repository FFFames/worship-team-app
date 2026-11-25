/** Reads saved EasyWorship Feed definitions and their portable device names. */

import type { Database } from 'sql.js'
import type { LiveFeed } from '../types/liveFeed'
import type { MediaMetadata } from '../types/media'
import { importIdentity } from './importIdentity'
import { readEasyWorshipFeedCapture } from './easyWorshipFeedVideo'
import { feedDimension } from './livePresentation'

export type EasyWorshipFeedEntry = LiveFeed & { sourceId: string }

type Row = Record<string, unknown>

function rows(db: Database, query: string): Row[] {
  const statement = db.prepare(query)
  const result: Row[] = []
  try {
    while (statement.step()) result.push(statement.getAsObject())
    return result
  } finally { statement.free() }
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function hasColumns(db: Database, table: string, ...columns: string[]) {
  const names = new Set(rows(db, `PRAGMA table_info(${table})`).map((row) => String(row.name).toLowerCase()))
  return columns.every((column) => names.has(column))
}

export async function readEasyWorshipFeedCatalog(db: Database, catalogPath: string): Promise<EasyWorshipFeedEntry[]> {
  if (!hasColumns(db, 'media_feed', 'media_id')) return []
  const media = rows(db, 'SELECT CAST(rowid AS TEXT) AS source_id, * FROM media NOT INDEXED WHERE rowid IN (SELECT media_id FROM media_feed) ORDER BY rowid')
  if (!media.length) return []
  const declarations = new Map<string, number>()
  if (hasColumns(db, 'media_feed', 'feed_type')) {
    for (const row of rows(db, 'SELECT CAST(media_id AS TEXT) AS id, feed_type FROM media_feed ORDER BY rowid')) {
      if (typeof row.feed_type === 'number') declarations.set(String(row.id), row.feed_type)
    }
  }

  const devices = new Map<string, Set<string>>()
  const audio = new Map<string, Set<string>>()
  const videoFormats = new Map<string, Row[]>()
  const legacyFormats = new Map<string, Row[]>()
  function addVideoFormats(target: Map<string, Row[]>, formats: Row[]) {
    for (const row of formats) {
      const id = String(row.id)
      const existing = target.get(id) ?? []
      existing.push(row)
      target.set(id, existing)
      addName(devices, id, row.device_name)
    }
  }
  function addName(target: Map<string, Set<string>>, id: string, value: unknown) {
    const name = text(value)
    if (!name) return
    const names = target.get(id) ?? new Set<string>()
    names.add(name)
    target.set(id, names)
  }
  if (hasColumns(db, 'device_link', 'media_id', 'device_video_id') && hasColumns(db, 'device_video', 'device_name')) {
    addVideoFormats(videoFormats, rows(db, 'SELECT CAST(l.media_id AS TEXT) AS id, v.* FROM device_link l JOIN device_video v ON v.rowid=l.device_video_id ORDER BY l.rowid'))
  }
  if (hasColumns(db, 'feed_pc', 'media_id', 'device_name')) {
    addVideoFormats(legacyFormats, rows(db, 'SELECT CAST(media_id AS TEXT) AS id, * FROM feed_pc NOT INDEXED ORDER BY rowid'))
  }
  if (hasColumns(db, 'device_link', 'media_id', 'device_audio_id') && hasColumns(db, 'device_audio', 'device_name')) {
    for (const row of rows(db, 'SELECT CAST(l.media_id AS TEXT) AS id, a.device_name FROM device_link l JOIN device_audio a ON a.rowid=l.device_audio_id ORDER BY l.rowid')) {
      addName(audio, String(row.id), row.device_name)
    }
  }

  return Promise.all(media.map(async (row) => {
    const sourceId = String(row.source_id)
    const uid = text(row.media_uid)
    const deviceHints = [...(devices.get(sourceId) ?? [])]
    const audioDevices = audio.get(sourceId)
    const name = text(row.title) ?? deviceHints[0] ?? `Feed ${sourceId}`
    const id = await importIdentity(['easyworship-live-feed-v1', uid ?? [catalogPath.toLowerCase(), sourceId, name]])
    const formats = videoFormats.get(sourceId) ?? legacyFormats.get(sourceId) ?? []
    const capture = readEasyWorshipFeedCapture(formats)
    const legacyCapture = !formats.some((format) => typeof format.frame_rate === 'number' && format.frame_rate > 0)
      ? readEasyWorshipFeedCapture(legacyFormats.get(sourceId) ?? []) : undefined
    const metadata: MediaMetadata = {
      mediaUid: uid ?? null, feedType: declarations.get(sourceId) ?? null,
      author: text(row.author) ?? null, description: text(row.description) ?? null,
      tags: text(row.tags) ?? null, sourceFolder: text(row.folder) ?? null,
      audioDeviceNames: audioDevices ? [...audioDevices].join(', ') : null,
    }
    for (const [field, value] of Object.entries({
      width: feedDimension(row.width) ?? capture?.width, height: feedDimension(row.height) ?? capture?.height,
      frameRate: capture?.frameRate ?? legacyCapture?.frameRate, aspectType: row.aspect_type, mute: row.mute, volume: row.volume,
    })) {
      if (typeof value === 'number' && Number.isFinite(value)) metadata[field] = value
    }
    return { id, sourceId, name, deviceHints, metadata }
  }))
}
