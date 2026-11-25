/** Resolves collection membership through each source catalog's IDs and stable resource UIDs. */

import type { EasyWorshipMediaEntry } from './easyWorshipMedia'
import type { EasyWorshipFeedEntry } from './easyWorshipFeedCatalog'
import type { DvdClip } from '../types/dvdClip'
import { dvdCollectionKey, feedCollectionKey, mediaCollectionKey } from './collectionLibrary'
import { compileDesignCollectionRules } from './designCollectionRules'
import { compileMediaCollectionRules, mediaCollectionFields } from './mediaCollectionRules'
import type { CollectionResource, EasyWorshipCollectionSet } from './easyWorshipCollections'

type CatalogResource = Extract<CollectionResource, 'media' | 'presentations' | 'themes'>
export type ResourceCollectionRow = { id: string; key?: string; fields: Record<string, string | null> }
export type ResourceCollectionCatalog = Partial<Record<CatalogResource, ResourceCollectionRow[]>>

export function mediaCollectionRows(entries: EasyWorshipMediaEntry[], feeds: EasyWorshipFeedEntry[] = [],
  dvds: Array<[string, DvdClip]> = []): ResourceCollectionRow[] {
  return [
    ...entries.map((item) => ({ id: item.sourceId, key: mediaCollectionKey(item.metadata?.mediaUid), fields: mediaCollectionFields(item) })),
    ...feeds.map((feed) => ({ id: feed.sourceId, key: feedCollectionKey(feed.id), fields: mediaCollectionFields(feed) })),
    ...dvds.map(([id, dvd]) => ({ id, key: dvdCollectionKey(dvd.id), fields: mediaCollectionFields(dvd) })),
  ]
}

export function resolveResourceCollections(set: EasyWorshipCollectionSet, catalog: ResourceCollectionCatalog): EasyWorshipCollectionSet {
  const warnings = [...set.warnings]
  const collections = set.collections.map((group) => {
    const resource = group.resource
    if (group.nativeType !== 1 || (resource !== 'media' && resource !== 'presentations' && resource !== 'themes')) return group
    const rows = catalog[resource] ?? []
    const ids = new Set(group.inclusions)
    if (group.rulesEnabled && group.cachedResults) {
      for (const id of group.cachedResults) ids.add(id)
    } else if (group.rulesEnabled && group.rules.length) {
      const matches = resource === 'media' ? compileMediaCollectionRules(group) : compileDesignCollectionRules(group)
      if (matches) {
        for (const row of rows) if (matches(row.fields)) ids.add(row.id)
      } else warnings.push(`กลุ่ม ${group.name} มีกฎที่ยังประเมินไม่ได้จากแค็ตตาล็อกในโปรไฟล์นี้`)
    }
    for (const id of group.exclusions) ids.delete(id)
    const resourceItems = Object.fromEntries(rows.flatMap(({ id, key }) => key && ids.has(id) ? [[id, key]] : []))
    const unresolved = ids.size - Object.keys(resourceItems).length
    if (unresolved > 0) warnings.push(`กลุ่ม ${group.name} มี ${unresolved} รายการที่จับคู่กับแค็ตตาล็อกต้นทางไม่ได้`)
    const overrides = new Set([...group.inclusions, ...group.exclusions])
    const resourceOverrides = overrides.size
      ? Object.fromEntries(rows.flatMap(({ id, key }) => key && overrides.has(id) ? [[id, key]] : [])) : undefined
    return { ...group, resourceItems, ...(resourceOverrides ? { resourceOverrides } : {}) }
  })
  return { ...set, collections, warnings: [...new Set(warnings)] }
}
