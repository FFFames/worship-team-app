import type { Database } from 'sql.js'
import type { FeedAsset, FeedVideo } from '../types/liveFeed'
import type { DvdPlayback } from '../types/dvdClip'
import { feedDimension, feedFrameRate } from './livePresentation'

/** The native camera formats store a frame interval in 100 ns units. */
function frameRateFromInterval(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return undefined
  return feedFrameRate(Math.round(10_000_000_000 / value) / 1000)
}

function commonValue(values: (number | undefined)[]): number | undefined {
  const distinct = new Set(values.filter((value) => value !== undefined))
  return distinct.size === 1 ? distinct.values().next().value : undefined
}

/** Multiple saved computer assignments can disagree. Keep only compatible preferences. */
export function readEasyWorshipFeedCapture(rows: Record<string, unknown>[]): FeedVideo | undefined {
  const width = commonValue(rows.map((row) => feedDimension(row.width)))
  const height = commonValue(rows.map((row) => feedDimension(row.height)))
  const frameRate = commonValue(rows.map((row) => frameRateFromInterval(row.frame_rate)))
  if (width === undefined && height === undefined && frameRate === undefined) return undefined
  return { ...(width !== undefined ? { width } : {}), ...(height !== undefined ? { height } : {}),
    ...(frameRate !== undefined ? { frameRate } : {}) }
}

export function readEasyWorshipLayoutFeeds(db: Database) {
  function read(table: string, column: string, query: string) {
    if (!db.exec(`PRAGMA table_info(${table})`)[0]?.values.some((entry) => entry[1] === column)) return []
    const statement = db.prepare(query)
    const result: Record<string, unknown>[] = []
    try {
      while (statement.step()) result.push(statement.getAsObject())
      return result
    } finally { statement.free() }
  }
  const devices = new Map<string, Record<string, unknown>[]>()
  for (const row of read('resource_feed_pc', 'resource_id', 'SELECT CAST(resource_id AS TEXT) AS feed_resource, * FROM resource_feed_pc NOT INDEXED ORDER BY rowid')) {
    const id = String(row.feed_resource)
    const related = devices.get(id) ?? []
    related.push(row)
    devices.set(id, related)
  }
  const declared = read('resource_feed', 'resource_id', 'SELECT CAST(resource_id AS TEXT) AS id, CAST(rowid AS TEXT) AS feed FROM resource_feed NOT INDEXED')
  const fallback = new Map(declared.map((row) => [String(row.id), String(row.feed)]))
  const titles = declared.length ? new Map(read('resource', 'title', 'SELECT CAST(rowid AS TEXT) AS feed_resource, title FROM resource NOT INDEXED WHERE rowid IN (SELECT resource_id FROM resource_feed)')
    .map((row) => [String(row.feed_resource), row.title])) : new Map<string, unknown>()
  const lookup = new Map<string, Pick<FeedAsset, 'filename' | 'deviceHints' | 'feedVideo'>>()
  const ids = new Set([...declared.map((row) => String(row.id)), ...devices.keys()])
  for (const id of ids) {
    const inputs = devices.get(id) ?? []
    const names = [...new Set(inputs.flatMap((device) => typeof device.device_name === 'string' && device.device_name.trim() ? [device.device_name.trim()] : []))]
    const sourceTitle = titles.get(id)
    const filename = typeof sourceTitle === 'string' && sourceTitle.trim() ? sourceTitle.trim() : names[0] ?? `กล้อง ${fallback.get(id) ?? id}`
    const deviceHints = names.filter((name) => name !== filename)
    const feedVideo = readEasyWorshipFeedCapture(inputs)
    lookup.set(id, { filename, ...(deviceHints.length ? { deviceHints } : {}), ...(feedVideo ? { feedVideo } : {}) })
  }
  return lookup
}

export function easyWorshipFeedAsset(feed: Pick<FeedAsset, 'filename' | 'deviceHints' | 'feedVideo'>, role: 'foreground' | 'background', playback?: DvdPlayback): FeedAsset {
  return { ...feed, kind: 'camera', role, ...(playback?.fit ? { feedVideo: { ...feed.feedVideo, fit: playback.fit } } : {}),
    ...(playback?.muted !== undefined || playback?.volume !== undefined ? {
      feedSound: { muted: playback.muted ?? true, level: Math.round(100 * (playback.volume ?? 1)) },
    } : {}) }
}
