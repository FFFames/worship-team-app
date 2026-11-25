/** Stores imported collections in this browser and makes their groups selectable. */

import type { CollectionEdit, CollectionResource, EasyWorshipCollection, EasyWorshipCollectionSet } from './easyWorshipCollections'
import type { DesignContent } from '../types/slideDesign'
import { importIdentity } from './importIdentity'

const STORE = 'profiles'
// Use the persisted ID from the original song collection library.
export const localCollectionSet = 'worshipteam-song-collections'
export const collectionLibraryChannel = 'worshipteam:collections'

function announceChange() {
  const channel = new BroadcastChannel(collectionLibraryChannel)
  channel.postMessage('changed')
  channel.close()
}

export function feedCollectionKey(id: string) {
  return 'feed:' + id
}

export function dvdCollectionKey(id: string) {
  return 'dvd:' + id
}

export function mediaCollectionKey(uid: unknown) {
  return typeof uid === 'string' && uid ? `media:${uid}` : undefined
}

export function localMediaCollectionKey(id: string) {
  return `library-media:${id}`
}

export function designCollectionKey(source: DesignContent['source']) {
  if (source?.format === 'powerpoint' && source.catalogUid) return `powerpoint:${source.catalogUid}`
  if (source?.format === 'easyworship' && source.uid && !/^\d+$/.test(source.uid)) return `design:${source.uid}`
  return undefined
}

export function localDesignCollectionKey(id: string) {
  return `library-design:${id}`
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('worship-team-collections', 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('เปิดกลุ่ม EasyWorship ไม่สำเร็จ'))
  })
}

export async function listEasyWorshipCollectionSets(): Promise<EasyWorshipCollectionSet[]> {
  const db = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).getAll()
      request.onsuccess = () => resolve(request.result as EasyWorshipCollectionSet[])
      request.onerror = () => reject(request.error ?? new Error('อ่านกลุ่ม EasyWorship ไม่สำเร็จ'))
    })
  } finally {
    db.close()
  }
}

function mergeResourceItems(previous: EasyWorshipCollectionSet, incoming: EasyWorshipCollectionSet) {
  const priorGroups = new Map(previous.collections.map((group) => [group.id, group]))
  let changed = false
  let conflict = false
  function merge(before?: Record<string, string>, after?: Record<string, string>) {
    const keys = { ...before }
    for (const [id, key] of Object.entries(after ?? {})) {
      if (keys[id] && keys[id] !== key) conflict = true
      if (keys[id] !== key) changed = true
      keys[id] = key
    }
    return keys
  }
  const collections = incoming.collections.map((group) => {
    const prior = priorGroups.get(group.id)
    const resourceItems = merge(prior?.resourceItems, group.resourceItems)
    const resourceOverrides = merge(prior?.resourceOverrides, group.resourceOverrides)
    return { ...group, resourceItems, ...(Object.keys(resourceOverrides).length ? { resourceOverrides } : {}) }
  })
  return { collections, changed, conflict }
}

function mergedImport(previous: EasyWorshipCollectionSet, incoming: EasyWorshipCollectionSet, collections: EasyWorshipCollection[]) {
  const ids = new Set(collections.map((group) => group.id))
  return { ...previous, warnings: incoming.warnings, collections: [...collections, ...previous.collections.filter((group) => !ids.has(group.id))] }
}

export async function saveEasyWorshipCollectionSet(set: EasyWorshipCollectionSet): Promise<'saved' | 'duplicate'> {
  // Two catalogs can contain the same numeric collection and member IDs. Keep conflicting identities apart.
  const variantId = await importIdentity(['easyworship-collection-catalog-v1', set.id, set.collections.map((group) => group.resourceItems)])
  const previousVariantId = set.collections.some((group) => group.resource === 'songs' && group.resourceItems)
    ? await importIdentity(['easyworship-collection-catalog-v1', set.id,
      set.collections.map((group) => group.resource === 'songs' ? undefined : group.resourceItems)])
    : variantId
  const overrides = set.collections.map((group) => group.resourceOverrides)
  const overrideVariantId = overrides.some((links) => links && Object.keys(links).length)
    ? await importIdentity(['easyworship-collection-overrides-v1', variantId, overrides]) : variantId
  const variantIds = [...new Set([previousVariantId, variantId, overrideVariantId])]
  const db = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const existing = store.get(set.id)
      let saved = false

      function saveVariant(index: number) {
        const id = variantIds[index]
        const hasNext = index + 1 < variantIds.length
        const request = store.get(id)
        request.onsuccess = () => {
          const previous = request.result as EasyWorshipCollectionSet | undefined
          if (!previous) {
            if (id === previousVariantId && id !== variantId) saveVariant(index + 1)
            else {
              store.add({ ...set, id })
              saved = true
            }
            return
          }
          const { changed, conflict, collections } = mergeResourceItems(previous, set)
          if (conflict && hasNext) saveVariant(index + 1)
          else if (changed && !conflict) {
            store.put(mergedImport(previous, set, collections))
            saved = true
          }
        }
      }

      existing.onsuccess = () => {
        const previous = existing.result as EasyWorshipCollectionSet | undefined
        if (!previous) {
          store.add(set)
          saved = true
          return
        }
        const { changed, conflict, collections } = mergeResourceItems(previous, set)
        if (conflict) {
          saveVariant(0)
        } else if (changed) {
          store.put(mergedImport(previous, set, collections))
          saved = true
        }
      }
      tx.oncomplete = () => {
        if (saved) announceChange()
        resolve(saved ? 'saved' : 'duplicate')
      }
      tx.onabort = () => reject(tx.error ?? new Error('บันทึกกลุ่ม EasyWorship ไม่สำเร็จ'))
    })
  } finally {
    db.close()
  }
}

/** Restores backup groups by ID while keeping edits and links already saved on this computer. */
export async function restoreCollectionSets(sets: EasyWorshipCollectionSet[]): Promise<number> {
  const db = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      let saved = 0
      for (const set of sets) {
        const existing = store.get(set.id)
        existing.onsuccess = () => {
          const current = existing.result as EasyWorshipCollectionSet | undefined
          if (!current) {
            store.add(set)
            saved++
            return
          }
          const prior = new Map(current.collections.map((group) => [group.id, group]))
          const newGroups = set.collections.filter(({ id }) => !prior.has(id))
          const { collections, conflict } = mergeResourceItems(set, current)
          const incomingEdits = { ...set.songEdits, ...set.collectionEdits }
          const newEdits = Object.entries(incomingEdits).filter(([id]) => !collectionEdit(current, id))
          const removed = (set.removedCollections ?? []).filter((id) => !prior.has(id))
          const linksAdded = !conflict && current.collections.some((group, index) => {
            const merged = collections[index]
            return Object.keys(merged.resourceItems ?? {}).length > Object.keys(group.resourceItems ?? {}).length
              || Object.keys(merged.resourceOverrides ?? {}).length > Object.keys(group.resourceOverrides ?? {}).length
          })
          if (!newGroups.length && !newEdits.length && !linksAdded) return
          store.put({ ...current, collections: [...(linksAdded ? collections : current.collections), ...newGroups],
            collectionEdits: { ...current.collectionEdits, ...Object.fromEntries(newEdits) },
            removedCollections: [...new Set([...(current.removedCollections ?? []), ...removed])] })
          saved++
        }
      }
      tx.oncomplete = () => {
        if (saved) announceChange()
        resolve(saved)
      }
      tx.onabort = () => reject(tx.error ?? new Error('เรียกคืนกลุ่มไม่สำเร็จ'))
    })
  } finally { db.close() }
}

function collectionEdit(set: EasyWorshipCollectionSet, id: string) {
  return set.collectionEdits?.[id] ?? set.songEdits?.[id]
}

function effectiveCollections(set: EasyWorshipCollectionSet): EasyWorshipCollection[] {
  if (!set.songEdits && !set.collectionEdits && !set.removedCollections?.length) return set.collections
  const removed = new Set(set.removedCollections)
  const collections = set.collections.filter((group) => !removed.has(group.id)).map((group) => {
    const edit = collectionEdit(set, group.id)
    if (!edit) return group
    const { name, parentId, definition } = edit
    if (!definition) return { ...group, name, parentId }
    const { rules, matchType, inclusions, exclusions } = definition
    const exclusionSet = new Set(exclusions)
    const included = inclusions.filter((id) => !exclusionSet.has(id))
    const overrides = Object.fromEntries([...inclusions, ...exclusions].map((id) => [id, id]))
    return {
      ...group, name, parentId, rules, matchType, inclusions, exclusions,
      rulesEnabled: rules.length > 0,
      resourceItems: group.resource === 'songs' ? overrides : Object.fromEntries(included.map((id) => [id, id])),
      resourceOverrides: overrides,
      songIds: group.resource === 'songs' ? included : [],
      unresolvedSongs: 0,
    }
  })
  const nodes = new Map(collections.map((group) => [group.id, group]))
  return collections.map((group) => {
    const path = [group.name]
    const visited = new Set([group.id])
    let parentId = group.parentId
    while (parentId && !visited.has(parentId)) {
      const parent = nodes.get(parentId)
      if (!parent || parent.resource !== group.resource) break
      path.push(parent.name)
      visited.add(parentId)
      parentId = parent.parentId
    }
    return { ...group, path: path.reverse() }
  })
}

async function updateCollectionSet<T>(setId: string, update: (set: EasyWorshipCollectionSet | undefined) => {
  set: EasyWorshipCollectionSet; result: T
}): Promise<T> {
  const db = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const request = store.get(setId)
      let result: T
      request.onsuccess = () => {
        try {
          const change = update(request.result as EasyWorshipCollectionSet | undefined)
          result = change.result
          store.put(change.set)
        } catch (error) {
          reject(error)
          tx.abort()
        }
      }
      tx.oncomplete = () => { announceChange(); resolve(result) }
      tx.onabort = () => reject(tx.error ?? new Error('บันทึกกลุ่มไม่สำเร็จ'))
    })
  } finally { db.close() }
}

function checkCollectionRevision(set: EasyWorshipCollectionSet, id: string, revision: string | undefined) {
  if (collectionEdit(set, id)?.revision !== revision) {
    throw new Error('กลุ่มนี้ถูกแก้จากอีกหน้าต่าง กรุณาเปิดใหม่เพื่อดูข้อมูลล่าสุด')
  }
}

export async function saveLibraryCollection(input: {
  setId: string
  groupId?: string
  revision?: string
  resource: CollectionResource
  kind: 0 | 1
  edit: Omit<CollectionEdit, 'revision'>
}): Promise<string> {
  const name = input.edit.name.trim()
  if (!name) throw new Error('กรุณาใส่ชื่อกลุ่มหรือโฟลเดอร์')
  const id = input.groupId ?? crypto.randomUUID()
  return updateCollectionSet(input.setId, (previous) => {
    if (!previous && input.setId !== localCollectionSet) throw new Error('ไม่พบชุดกลุ่มนี้')
    const set = previous ?? { id: input.setId, name: 'WorshipTeam', filename: '', warnings: [], collections: [] }
    const effective = effectiveCollections(set)
    const existing = effective.find((group) => group.id === id && group.resource === input.resource)
    if (input.groupId && (!existing || existing.nativeType !== input.kind)) throw new Error('ไม่พบกลุ่มนี้')
    checkCollectionRevision(set, id, input.revision)
    const { parentId } = input.edit
    const folders = new Map(effective.filter((group) => group.nativeType === 0 && group.resource === input.resource)
      .map((group) => [group.id, group]))
    if (parentId && parentId !== existing?.parentId) {
      const visited = new Set([id])
      if (!folders.has(parentId)) throw new Error('เลือกโฟลเดอร์ปลายทางอื่น')
      for (let parent: string | null = parentId; parent !== null; parent = folders.get(parent)?.parentId ?? null) {
        if (visited.has(parent)) throw new Error('เลือกโฟลเดอร์ปลายทางอื่น')
        visited.add(parent)
      }
    }
    const parent = parentId ? folders.get(parentId) : undefined
    const collections: EasyWorshipCollection[] = existing ? set.collections : [...set.collections, {
      id, name, parentId, resource: input.resource, nativeType: input.kind, ownerId: parent?.ownerId ?? null, scope: parent?.scope,
      path: [name], rulesEnabled: false, matchType: null, rules: [], inclusions: [], exclusions: [],
      cachedResults: null, cachedVersion: null, songIds: [], unresolvedSongs: 0,
    }]
    const definition = input.kind === 1 ? input.edit.definition ?? collectionEdit(set, id)?.definition : undefined
    const edit = { name, parentId, revision: crypto.randomUUID(), definition }
    return { set: { ...set, collections, collectionEdits: { ...set.collectionEdits, [id]: edit } }, result: `${input.setId}/${id}` }
  })
}

export async function removeLibraryCollection(option: LibraryCollectionOption) {
  const { setId, collection, revision } = option
  return updateCollectionSet(setId, (set) => {
    if (!set) throw new Error('ไม่พบชุดกลุ่มนี้')
    const nodes = effectiveCollections(set).filter((group) => group.resource === collection.resource)
    if (!nodes.some((group) => group.id === collection.id)) throw new Error('ไม่พบกลุ่มนี้')
    checkCollectionRevision(set, collection.id, revision)
    const children = new Map<string, string[]>()
    for (const group of nodes) {
      if (!group.parentId) continue
      const siblings = children.get(group.parentId) ?? []
      if (!children.has(group.parentId)) children.set(group.parentId, siblings)
      siblings.push(group.id)
    }
    const removed = new Set([collection.id])
    for (const id of removed) for (const child of children.get(id) ?? []) removed.add(child)
    return { set: { ...set, removedCollections: [...new Set([...(set.removedCollections ?? []), ...removed])] }, result: removed.size }
  })
}

export function collectionOptions(sets: EasyWorshipCollectionSet[], resources: readonly CollectionResource[]) {
  return sets.flatMap((set) => {
    const nodes = new Map<string, { collection: EasyWorshipCollection; ownItems: string[]; members: Set<string>; leaves: EasyWorshipCollection[] }>()
    for (const collection of effectiveCollections(set)) {
      if (!collection.resource || !resources.includes(collection.resource) || (collection.nativeType !== 0 && collection.nativeType !== 1)) continue
      const ownItems = collection.resource === 'songs' ? collection.songIds : Object.values(collection.resourceItems ?? {})
      nodes.set(collection.id, { collection, ownItems, members: new Set(ownItems), leaves: collection.nativeType === 1 ? [collection] : [] })
    }
    for (const { collection, ownItems } of nodes.values()) {
      if (collection.nativeType !== 1) continue
      const seen = new Set([collection.id])
      let parent = collection.parentId
      while (parent && !seen.has(parent)) {
        const folder = nodes.get(parent)
        if (!folder || folder.collection.nativeType !== 0 || folder.collection.resource !== collection.resource) break
        seen.add(parent)
        for (const id of ownItems) folder.members.add(id)
        folder.leaves.push(collection)
        parent = folder.collection.parentId
      }
    }
    return [...nodes.values()].map(({ collection, members, leaves }) => ({
      id: `${set.id}/${collection.id}`, setId: set.id, profile: set.name, collection, members, leaves,
      revision: collectionEdit(set, collection.id)?.revision,
    }))
  }).sort((a, b) => a.profile.localeCompare(b.profile, 'th')
    || a.collection.path.join(' › ').localeCompare(b.collection.path.join(' › '), 'th'))
}

export type LibraryCollectionOption = ReturnType<typeof collectionOptions>[number]
