import type { Database } from 'sql.js'
import type { MediaPlayback } from '../types/media'

function numericProperty(value: unknown): number | undefined {
  const parsed = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value
  return typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}

export function readEasyWorshipMediaFlag(value: unknown): boolean | undefined {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim().toLowerCase() : ''
  return ['1', '-1', 'true'].includes(text) ? true : ['0', 'false'].includes(text) ? false : undefined
}

export function readEasyWorshipMediaUsage(value: unknown) {
  const usage = numericProperty(value)
  return usage === undefined ? undefined : (['auto', 'background', 'foreground'] as const)[usage]
}

export function readEasyWorshipMediaPlayback(volumeValue: unknown, muteValue: unknown, aspectValue: unknown): MediaPlayback | undefined {
  const percentage = numericProperty(volumeValue)
  const volume = percentage !== undefined && percentage <= 100 ? percentage / 100 : undefined
  const muted = readEasyWorshipMediaFlag(muteValue)
  const aspect = numericProperty(aspectValue)
  const fit = aspect === undefined ? undefined : (['auto', 'contain', 'fill', 'cover'] as const)[aspect]
  if (volume === undefined && muted === undefined && fit === undefined) return undefined
  return { ...(volume === undefined ? {} : { volume }), ...(muted === undefined ? {} : { muted }), ...(fit === undefined ? {} : { fit }) }
}

/** Native schedules keep audio and aspect properties on the element that uses the media. */
export function readEasyWorshipElementPlayback(db: Database) {
  const settings = new Map<string, MediaPlayback>()
  const columns = (table: string) => new Set(db.exec(`PRAGMA table_info(${table})`)[0]?.values.map((row) => String(row[1]).toLowerCase()))
  const props = columns('element_property')
  const groups = columns('element_property_group')
  if (!['group_id', 'key', 'value'].every((name) => props.has(name)) || !groups.has('link_id') || !groups.has('group_name')) return settings
  const properties = db.exec(`SELECT CAST(g.link_id AS TEXT), g.group_name, p.key, p.value
    FROM element_property_group g JOIN element_property p ON p.group_id = g.rowid
    WHERE g.group_name IN ('Foreground', 'Background') AND p.key IN ('Volume', 'Mute', 'AspectRatio')
    ORDER BY p.rowid`)[0]?.values ?? []
  const grouped = new Map<string, Map<string, unknown>>()
  for (const [id, group, field, value] of properties) {
    const key = `${id}:${group === 'Background' ? 'background' : 'foreground'}`
    const values = grouped.get(key) ?? new Map<string, unknown>()
    values.set(String(field), value)
    grouped.set(key, values)
  }
  for (const [key, values] of grouped) {
    const playback = readEasyWorshipMediaPlayback(values.get('Volume'), values.get('Mute'), values.get('AspectRatio'))
    if (playback) settings.set(key, playback)
  }
  return settings
}
