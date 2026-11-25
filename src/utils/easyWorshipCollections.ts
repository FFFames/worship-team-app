/** Reads EasyWorship collection trees, membership lists, and rules from a profile. */

import type { Database } from 'sql.js'
import { getEasyWorshipSql, isEasyWorshipSqliteDatabase, type EasyWorshipSong } from './easyWorship'
import { easyWorshipSongIdentity } from './easyWorshipSongIdentity'
import { importIdentity } from './importIdentity'
import { compileSongCollectionRules } from './songCollectionRules'

const resources = ['songs', 'scripture', 'media', 'presentations', 'themes', 'scripture-downloads'] as const
export type CollectionResource = typeof resources[number]
export type CollectionRule = { id: string; field: string; operator: number | null; value: string | null; secondValue: string | null }
type Scope = 'shared' | 'personal'

export type EasyWorshipCollection = {
  id: string
  parentId: string | null
  nativeType: number | null
  ownerId: string | null
  name: string
  resource?: CollectionResource
  scope?: Scope
  path: string[]
  rulesEnabled: boolean
  matchType: number | null
  rules: CollectionRule[]
  inclusions: string[]
  exclusions: string[]
  cachedResults: string[] | null
  cachedVersion: number | null
  songIds: string[]
  unresolvedSongs: number
  resourceItems?: Record<string, string>
  resourceOverrides?: Record<string, string>
}

export type EasyWorshipCollectionSet = {
  id: string
  name: string
  filename: string
  collections: EasyWorshipCollection[]
  warnings: string[]
  songEdits?: Record<string, CollectionEdit>
  collectionEdits?: Record<string, CollectionEdit>
  removedCollections?: string[]
}

export type CollectionDefinition = {
  matchType: 0 | 1
  rules: CollectionRule[]
  inclusions: string[]
  exclusions: string[]
}

export type CollectionEdit = {
  revision: string
  name: string
  parentId: string | null
  definition?: CollectionDefinition
}

type Row = Record<string, unknown>
const MAX_COLLECTION_BYTES = 128 * 1024 * 1024

function readRows(database: Database, query: string) {
  const statement = database.prepare(query)
  const rows: Row[] = []
  try {
    while (statement.step()) rows.push(statement.getAsObject())
    return rows
  } finally {
    statement.free()
  }
}

const string = (value: unknown) => typeof value === 'string' ? value : null
const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) ? value : null

function numericIds(value: unknown, onInvalid: () => void): string[] | null {
  if (value === null) return null
  // The native int64a type is a contiguous, little-endian array with no header.
  if (!(value instanceof Uint8Array) || value.byteLength % 8 !== 0) {
    onInvalid()
    return null
  }
  const buffer = new DataView(value.buffer, value.byteOffset, value.byteLength)
  const ids = new Set<string>()
  for (let offset = 0; offset < value.byteLength; offset += 8) ids.add(buffer.getBigInt64(offset, true).toString())
  return [...ids]
}

function rootGroup(id: string): { resource: CollectionResource; scope: Scope } | undefined {
  // Each resource tab has two reserved root IDs. The DB only stores their children.
  const index = Math.floor(-Number(id) / 1000) - 1
  const resource = resources[index]
  const scope = -Number(id) % 1000
  return resource && (scope === 1 || scope === 2) ? { resource, scope: scope === 1 ? 'shared' : 'personal' } : undefined
}

function getPath(node: EasyWorshipCollection, nodesById: ReadonlyMap<string, EasyWorshipCollection>) {
  const path: string[] = [node.name]
  const visited = new Set([node.id])
  let parent = node.parentId
  while (parent && !visited.has(parent)) {
    const node = nodesById.get(parent)
    if (!node) return { path: path.reverse(), ...rootGroup(parent) }
    visited.add(parent)
    path.push(node.name)
    parent = node.parentId
  }
  return { path: path.reverse() }
}

async function linkSongs(collections: EasyWorshipCollection[], songs: EasyWorshipSong[], warnings: string[]) {
  const source = new Map(songs.map((song) => [song.sourceId, song]))
  const imported = new Map<string, Promise<string>>()
  function songId(id: string) {
    const song = source.get(id)
    if (!song) return
    let resolved = imported.get(id)
    if (!resolved) {
      resolved = easyWorshipSongIdentity(song)
      imported.set(id, resolved)
    }
    return resolved
  }

  for (const group of collections) {
    if (group.resource !== 'songs' || group.nativeType !== 1) continue
    const ids = new Set(group.inclusions)
    const rules = compileSongCollectionRules(group)
    if (group.rulesEnabled) {
      if (group.cachedResults) {
        for (const id of group.cachedResults) ids.add(id)
      } else if (rules) {
        for (const song of songs) {
          if (rules.matches({ ...song, words: () => song.sections.flatMap((section) => section.lines).join('\n') })) ids.add(song.sourceId)
        }
      } else if (group.rules.length) warnings.push(`กลุ่ม ${group.name} มีกฎคัดเพลงที่ยังประเมินไม่ได้`)
    }

    if ((rules || !group.rulesEnabled) && (group.inclusions.length || group.exclusions.length)) {
      const manualIds = new Set([...group.inclusions, ...group.exclusions])
      const links = await Promise.all([...manualIds].map(async (id) => [id, await songId(id)] as const))
      group.resourceItems = Object.fromEntries(links.flatMap(([id, key]) => key ? [[id, key]] : []))
    }

    for (const id of group.exclusions) ids.delete(id)
    for (const id of ids) {
      const resolved = await songId(id)
      if (resolved) group.songIds.push(resolved)
      else group.unresolvedSongs++
    }
  }
}

export async function readEasyWorshipCollections(file: File, name: string, songs: EasyWorshipSong[] = []): Promise<EasyWorshipCollectionSet> {
  if (file.size > MAX_COLLECTION_BYTES) throw new Error('ไฟล์ Collections.db มีขนาดเกิน 128 MB')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isEasyWorshipSqliteDatabase(bytes)) throw new Error('ไฟล์ Collections.db ต้องเป็นฐานข้อมูล SQLite ของ EasyWorship')
  const SQL = await getEasyWorshipSql()
  const database = new SQL.Database(bytes)
  const warnings: string[] = []
  let collections: EasyWorshipCollection[]
  try {
    const rules = new Map<string, CollectionRule[]>()
    for (const row of readRows(database, `SELECT CAST(rowid AS TEXT) AS id, CAST(detail_id AS TEXT) AS detailId,
      field, condition AS operator, CAST(value1 AS TEXT) AS value, CAST(value2 AS TEXT) AS secondValue FROM condition ORDER BY rowid`)) {
      const detailId = string(row.detailId)
      const id = string(row.id)
      if (detailId === null || id === null) continue
      const items = rules.get(detailId) ?? []
      items.push({ id, field: string(row.field) ?? '', operator: integer(row.operator), value: string(row.value), secondValue: string(row.secondValue) })
      rules.set(detailId, items)
    }
    collections = readRows(database, `SELECT CAST(c.rowid AS TEXT) AS id, CAST(c.parent_id AS TEXT) AS parentId, c.name,
      c.collection_type AS nativeType, CAST(c.user_id AS TEXT) AS ownerId, CAST(d.rowid AS TEXT) AS detailId, d.use_rules AS rulesEnabled,
      d.match_type AS matchType, d.inclusions, d.exclusions, d.condition_results AS cachedResults, d.condition_results_ver AS cachedVersion
      FROM collection c LEFT JOIN detail d ON d.collection_id = c.rowid ORDER BY c.rowid`).flatMap((row) => {
      const id = string(row.id)
      const name = string(row.name)
      if (id === null || name === null) return []
      const invalid = () => warnings.push(`กลุ่ม ${name} มีรายการสมาชิกแบบไบนารีที่อ่านไม่ได้`)
      return [{ id, name, parentId: string(row.parentId), nativeType: integer(row.nativeType), ownerId: string(row.ownerId), path: [],
        rulesEnabled: row.rulesEnabled === 1, matchType: integer(row.matchType), rules: rules.get(string(row.detailId) ?? '') ?? [],
        inclusions: numericIds(row.inclusions, invalid) ?? [], exclusions: numericIds(row.exclusions, invalid) ?? [],
        cachedResults: numericIds(row.cachedResults, invalid), cachedVersion: integer(row.cachedVersion), songIds: [], unresolvedSongs: 0 }]
    })
  } catch {
    throw new Error('ไม่พบตาราง collection, detail และ condition ของ Collections.db ที่รองรับ')
  } finally {
    database.close()
  }
  const nodesById = new Map(collections.map((node) => [node.id, node]))
  collections = collections.map((node) => ({ ...node, ...getPath(node, nodesById) }))
  const unassigned = collections.filter(({ resource }) => !resource).length
  if (unassigned) warnings.push(`พบ ${unassigned} กลุ่มที่ระบุคลังต้นทางไม่ได้`)
  await linkSongs(collections, songs, warnings)
  // Catalog links can be supplemented by another import without creating another copy of the group.
  const id = await importIdentity(['easyworship-collections-v1', collections.map(({ resourceItems: _, resourceOverrides: _overrides, ...group }) => group)])
  return { id, name, filename: file.name, collections, warnings: [...new Set(warnings)] }
}
