/** Protects binary membership, hierarchy, stable resource links, and live collection rules. */

import { describe, expect, it } from 'vitest'
import { getEasyWorshipSql, type EasyWorshipSong } from './easyWorship'
import { readEasyWorshipCollections } from './easyWorshipCollections'
import { easyWorshipSongIdentity } from './easyWorshipSongIdentity'
import { collectionOptions, designCollectionKey, localMediaCollectionKey, mediaCollectionKey } from './collectionLibrary'
import { mediaCollectionRows, resolveResourceCollections } from './easyWorshipResourceCollections'
import { prepareSongCollectionFilter, type CollectionSong } from './songCollectionRules'
import { importIdentity } from './importIdentity'
import { prepareMediaCollectionFilter } from './mediaCollectionRules'
import { prepareDesignCollectionFilter } from './designCollectionRules'
import type { MediaLibraryItem } from '../types/media'
import type { LibraryDesign } from '../types/slideDesign'

const songs: EasyWorshipSong[] = [
  { sourceId: '1', title: 'พระคุณ', author: null, copyright: null, ccli: null, sections: [] },
  { sourceId: '2', title: 'รุ่งเช้า', author: null, copyright: null, ccli: null, administrator: 'Local Press', sections: [] },
  { sourceId: '9007199254740999', title: 'Grace', author: null, copyright: null, ccli: null, sections: [] },
]

async function makeExample() {
  const SQL = await getEasyWorshipSql()
  const db = new SQL.Database()
  try {
    db.run(`CREATE TABLE collection (rowid INTEGER PRIMARY KEY, parent_id INTEGER, collection_type INTEGER, user_id INTEGER, name TEXT);
      CREATE TABLE detail (rowid INTEGER PRIMARY KEY, collection_id INTEGER, use_rules INTEGER, match_type INTEGER,
        inclusions INT64A, exclusions INT64A, condition_results INT64A, condition_results_ver INTEGER);
      CREATE TABLE condition (rowid INTEGER PRIMARY KEY, detail_id INTEGER, field TEXT, condition INTEGER, value1 TEXT, value2 TEXT);
      INSERT INTO collection VALUES (1,-1001,0,NULL,'ช่วงเวลา'), (2,1,1,NULL,'เพลงเช้า'), (3,1,0,NULL,'ชั้นใน'),
        (4,3,1,NULL,'กลุ่มอัตโนมัติ'), (5,-1002,1,12,'ซ้อมส่วนตัว'), (6,-3001,1,NULL,'ภาพ'), (7,7,0,NULL,'วงวน');
      INSERT INTO detail VALUES (1,2,0,0,x'010000000000000007000000000020002a00000000000000',x'0100000000000000',NULL,0),
        (2,4,1,0,NULL,x'0100000000000000',NULL,0), (3,5,1,1,NULL,NULL,x'0100000000000000',120), (4,6,0,0,x'0200000000000000',NULL,NULL,0);
      INSERT INTO condition VALUES (1,2,'title',10,'พระคุณ',NULL), (2,2,'administrator',11,'local',NULL), (3,3,'title',9,'Other',NULL);`)
    return new File([new Uint8Array(db.export())], 'Collections.db')
  } finally {
    db.close()
  }
}

describe('EasyWorship Collections.db', () => {
  it('keeps resource and owner scopes, exact IDs, exclusions, and cached and uncached membership', async () => {
    const fixture = await makeExample()
    const review = await readEasyWorshipCollections(fixture, 'Church', songs)
    const [songOne, songTwo, grace] = await Promise.all(songs.map((song) => easyWorshipSongIdentity(song)))
    expect(review.collections[1]).toMatchObject({ path: ['ช่วงเวลา', 'เพลงเช้า'], scope: 'shared',
      inclusions: ['1', '9007199254740999', '42'], exclusions: ['1'], songIds: [grace], unresolvedSongs: 1 })
    expect(review.collections[3]).toMatchObject({ path: ['ช่วงเวลา', 'ชั้นใน', 'กลุ่มอัตโนมัติ'], songIds: [songTwo] })
    expect(review.collections[3].resourceItems).toEqual({ '1': songOne })
    expect(review.collections[4]).toMatchObject({ scope: 'personal', ownerId: '12', cachedVersion: 120, songIds: [songOne] })
    expect(review.collections[5]).toMatchObject({ resource: 'media', inclusions: ['2'], songIds: [] })
    expect(review.collections[6].resource).toBeUndefined()
    expect(review.warnings).toHaveLength(1)
    const options = collectionOptions([review], ['songs'])
    expect(options.find((item) => item.collection.id === '1')?.members).toEqual(new Set([grace, songTwo]))
    expect(options.find((item) => item.collection.id === '3')?.members).toEqual(new Set([songTwo]))
    expect(options).toHaveLength(5)
    expect((await readEasyWorshipCollections(fixture, 'Copy', songs)).id).toBe(review.id)
    expect(review.id).toBe(await importIdentity(['easyworship-collections-v1',
      review.collections.map(({ resourceItems: _links, ...group }) => group)]))
  })

  it('refreshes supported rules with current lyrics and metadata while respecting manual decisions and saved fallbacks', async () => {
    const review = await readEasyWorshipCollections(await makeExample(), 'Church', songs)
    const [excluded, included, saved] = await Promise.all(songs.map((song) => easyWorshipSongIdentity(song)))
    const template = review.collections[3]
    const automatic = {
      ...template,
      rules: [
        { id: 'a', field: 'words', operator: 9, value: 'พระคุณ', secondValue: null },
        { id: 'b', field: 'administrator', operator: 11, value: 'Local', secondValue: null },
      ],
      inclusions: ['2'], resourceItems: { 1: excluded, 2: included },
      songIds: [saved],
    }
    const candidate: CollectionSong = {
      id: 'new', title: 'เพลงใหม่', artist: null, original_key: 'G', updated_at: '',
      copyright_administrator: 'LOCAL MUSIC', raw_content: 'C G\nพระคุณ',
    }
    const live = prepareSongCollectionFilter([automatic])
    expect(live.needsDetails).toBe(true)
    expect(live.includesSong(candidate)).toBe(true)
    expect(live.includesSong({ ...candidate, id: excluded })).toBe(false)
    expect(live.includesSong({ ...candidate, id: included, raw_content: '' })).toBe(true)
    expect(live.includesSong({ ...candidate, raw_content: 'C G\nเนื้อเพลงใหม่' })).toBe(false)
    expect(live.includesSong({ ...candidate, copyright_administrator: null })).toBe(false)
    expect(live.includesSong({ ...candidate, id: saved, copyright_administrator: null })).toBe(false)
    const anyRule = prepareSongCollectionFilter([{ ...automatic, matchType: 1 }])
    expect(anyRule.includesSong({ ...candidate, copyright_administrator: null })).toBe(true)

    const older = prepareSongCollectionFilter([{ ...automatic, resourceItems: undefined }])
    expect(older.needsDetails).toBe(false)
    expect(older.includesSong(candidate)).toBe(false)
    expect(older.includesSong({ ...candidate, id: saved })).toBe(true)
    const unsupported = { ...automatic, rules: [{ ...automatic.rules[0], field: 'unrecognized' }] }
    const folder = prepareSongCollectionFilter([automatic, unsupported])
    expect(folder.includesSong(candidate)).toBe(true)
    expect(folder.includesSong({ ...candidate, id: saved, copyright_administrator: null })).toBe(true)
  })

  it('applies editable song rules and folder names without changing the imported catalog', async () => {
    const review = await readEasyWorshipCollections(await makeExample(), 'Church', songs)
    const folder = review.collections[0]
    const child = review.collections[3]
    const manual = 'another-song'
    const edited = {
      ...review,
      songEdits: {
        [folder.id]: { name: 'ตารางงาน', parentId: folder.parentId, revision: 'renamed' },
        [child.id]: {
          name: 'เพลงที่จัดใหม่', parentId: child.parentId, revision: 'changed',
          definition: { matchType: 0 as const, rules: [], inclusions: [manual], exclusions: [] },
        },
      },
    }
    const options = collectionOptions([edited], ['songs'])
    const updated = options.find((option) => option.collection.id === child.id)
    expect(updated).toMatchObject({
      id: `${review.id}/${child.id}`, revision: 'changed',
      collection: { path: ['ตารางงาน', 'ชั้นใน', 'เพลงที่จัดใหม่'], rulesEnabled: false, songIds: [manual] },
    })
    expect(options.find((option) => option.collection.id === folder.id)?.members.has(manual)).toBe(true)
    expect(child.path).toEqual(['ช่วงเวลา', 'ชั้นใน', 'กลุ่มอัตโนมัติ'])
    expect(child.rulesEnabled).toBe(true)
  })

  it('applies media edits to local and imported identities and hides removed branches', async () => {
    const source = await readEasyWorshipCollections(await makeExample(), 'Church', songs)
    const media = source.collections.find((group) => group.resource === 'media')!
    const folder = { ...media, id: 'folder', nativeType: 0, name: 'Media folder' }
    const kept = { ...media, parentId: folder.id }
    const removed = { ...media, id: 'removed', parentId: folder.id }
    const set = { ...source, collections: [...source.collections.filter(({ id }) => id !== media.id), folder, kept, removed],
      removedCollections: [removed.id], collectionEdits: {
        [kept.id]: { name: 'Sunday', parentId: folder.id, revision: 'rev', definition: {
          matchType: 0 as const, rules: [{ id: 'rule', field: 'title', operator: 9, value: 'sky', secondValue: null }],
          inclusions: [localMediaCollectionKey('handpicked')], exclusions: [localMediaCollectionKey('excluded')],
        } },
      } }
    const choices = collectionOptions([set], ['media'])
    expect(choices.map(({ collection }) => collection.path)).toEqual([['Media folder'], ['Media folder', 'Sunday']])
    const includes = prepareMediaCollectionFilter(choices[0].leaves).includesMedia
    const file: MediaLibraryItem = { id: 'rule-match', assetId: 'asset', name: 'Bright sky', kind: 'image', filename: 'test.png',
      mediaType: 'image/png', size: 1, addedAt: '' }
    expect(includes(file)).toBe(true)
    expect(includes({ ...file, id: 'excluded', metadata: { mediaUid: 'newly-mapped' } })).toBe(false)
    expect(includes({ ...file, id: 'handpicked', name: 'Manual' })).toBe(true)
    expect(media.name).toBe('ภาพ')
  })

  it('resolves only within each media, presentation, or theme catalog and aggregates descendants', async () => {
    const review = await readEasyWorshipCollections(await makeExample(), 'Church')
    const media = review.collections[5]
    review.collections.push(
      { ...media, id: '8', resource: 'themes', inclusions: ['2'], path: ['Themes'] },
      { ...media, id: '9', resource: 'presentations', inclusions: ['7'], path: ['Presentations'], rulesEnabled: true,
        rules: [{ id: '4', field: 'folder', operator: 0, value: 'Sundays', secondValue: null }] },
      { ...media, id: '10', resource: 'media', inclusions: [], nativeType: 0, path: ['Folder'] },
    )
    media.parentId = '10'
    const resolved = resolveResourceCollections(review, {
      media: [{ id: '2', key: mediaCollectionKey('asset-2'), fields: { title: 'Media' } }],
      presentations: [
        { id: '2', key: designCollectionKey({ format: 'powerpoint', uid: 'blob', catalogUid: 'deck-2' }), fields: { folder: 'sundays' } },
        { id: '7', key: 'design:always', fields: { folder: 'Common' } },
      ],
      themes: [{ id: '2', key: designCollectionKey({ format: 'easyworship', uid: 'theme-2' }), fields: { title: 'Theme' } }],
    })
    expect(resolved.id).toBe(review.id)
    const options = collectionOptions([resolved], ['media', 'themes', 'presentations'])
    expect(options.find((group) => group.collection.id === '10')?.members).toEqual(new Set(['media:asset-2']))
    expect(options.find((group) => group.collection.id === '9')?.members).toEqual(new Set(['powerpoint:deck-2', 'design:always']))
    expect(options.find((group) => group.collection.id === '8')?.members).toEqual(new Set(['design:theme-2']))
    expect(designCollectionKey({ format: 'easyworship', uid: '2' })).toBeUndefined()
  })

  it('recalculates media membership with live metadata and stable file, feed and DVD overrides', async () => {
    const source = await readEasyWorshipCollections(await makeExample(), 'Church')
    const template = source.collections[5]
    const folder = { ...template, id: '8', nativeType: 0, inclusions: [] }
    const automatic = { ...template, parentId: folder.id, rulesEnabled: true, matchType: 0,
      rules: [{ id: 'a', field: 'title', operator: 9, value: 'sky', secondValue: null },
        { id: 'b', field: 'folder', operator: 0, value: 'Services\\Sunday\\', secondValue: null }],
      inclusions: ['2', '4'], exclusions: ['1', '6'], cachedResults: ['1', '3'] }
    const fixed = { ...template, id: '9', parentId: folder.id, inclusions: ['6'] }
    const file: MediaLibraryItem = { id: 'local', assetId: 'blob', name: 'Sky photo', filename: 'Image.jpg',
      kind: 'image', mediaType: 'image/jpeg', size: 10, addedAt: '', metadata: { sourceFolder: 'services/sunday' } }
    const excluded = { ...file, metadata: { ...file.metadata, mediaUid: 'excluded' } }
    const included = { ...file, name: 'Handpicked', metadata: { mediaUid: 'included' } }
    const stale = { ...file, name: 'Renamed photo', metadata: { ...file.metadata, mediaUid: 'stale' } }
    const feed = { id: 'camera', name: 'Sky feed', deviceHints: [], metadata: file.metadata }
    const dvd = { id: 'disc/bookmark', name: 'Archived video', sourceFolder: 'Services\\Sunday' }
    const otherDvd = { ...dvd, id: 'disc/other', name: 'Sky DVD' }
    const catalog = mediaCollectionRows([excluded, included, stale].map((item, index) => ({
      ...item, sourceId: String(index + 1), catalogPath: item.filename,
    })), [{ ...feed, sourceId: '5' }], [['4', dvd], ['6', otherDvd]])
    const resolved = resolveResourceCollections({ ...source, collections: [folder, automatic, fixed] }, { media: catalog })
    const [, group] = resolved.collections
    expect(group.resourceItems).toEqual({ '2': 'media:included', '3': 'media:stale', '4': 'dvd:disc/bookmark' })
    expect(group.resourceOverrides).toEqual({
      '1': 'media:excluded', '2': 'media:included', '4': 'dvd:disc/bookmark', '6': 'dvd:disc/other',
    })
    const live = prepareMediaCollectionFilter([group])
    expect([file, excluded, included, stale].map(live.includesMedia)).toEqual([true, false, true, false])
    expect(live.includesFeed(feed)).toBe(true)
    expect([dvd, otherDvd].map(live.includesDvd)).toEqual([true, false])
    const all = collectionOptions([resolved], ['media']).find((option) => option.collection.id === folder.id)
    expect(prepareMediaCollectionFilter(all?.leaves ?? []).includesDvd(otherDvd)).toBe(true)
    const older = prepareMediaCollectionFilter([{ ...group, resourceOverrides: undefined }])
    const unsupported = prepareMediaCollectionFilter([{ ...group, rules: group.rules.map((rule) => ({ ...rule, operator: 99 })) }])
    for (const filter of [older, unsupported]) {
      expect([file, excluded, included, stale].map(filter.includesMedia)).toEqual([false, false, true, true])
    }
  })

  it('updates presentation and theme groups independently while retaining saved links and missing metadata', async () => {
    const source = await readEasyWorshipCollections(await makeExample(), 'Church')
    const presentations = { ...source.collections[5], resource: 'presentations' as const, rulesEnabled: true, matchType: 0,
      rules: [{ id: '1', field: 'title', operator: 9, value: 'Sunday', secondValue: null },
        { id: '2', field: 'folder', operator: 0, value: 'Services\\Weekends', secondValue: null }],
      inclusions: ['2'], exclusions: ['3'], cachedResults: ['1', '3'] }
    const themes = { ...presentations, id: 'theme', resource: 'themes' as const, inclusions: [], exclusions: [], cachedResults: [],
      rules: presentations.rules.slice(0, 1) }
    const review = resolveResourceCollections({ ...source, collections: [presentations, themes] }, {
      presentations: ['design:local', 'powerpoint:pinned', 'design:excluded'].map((key, index) => ({ id: String(index + 1), key, fields: {} })),
    })
    const [decks, templates] = review.collections
    const native = { format: 'easyworship' as const, uid: 'local' }
    const candidate: LibraryDesign = { id: '1', title: 'Sunday notes', kind: 'presentation', created_at: '', content: { slides: [], source: native } }
    const matchesDecks = prepareDesignCollectionFilter(decks, [decks])
    expect(matchesDecks(candidate)).toBe(true)
    expect(matchesDecks({ ...candidate, title: 'Weekday notes' })).toBe(false)
    const updated = { ...candidate, content: { slides: [], source: { ...native, collectionDetails: { folder: 'services/weekends/' } } } }
    expect(matchesDecks(updated)).toBe(true)
    expect(matchesDecks({ ...updated, content: { ...updated.content, source: { ...updated.content.source, uid: 'excluded' } } })).toBe(false)
    const pinned = { ...candidate, title: 'Any title', content: { slides: [], source: { format: 'powerpoint' as const, uid: 'file', catalogUid: 'pinned' } } }
    expect(matchesDecks(pinned)).toBe(true)
    const theme = { ...updated, kind: 'song-theme' as const }
    expect(matchesDecks(theme)).toBe(false)
    const matchesThemes = prepareDesignCollectionFilter(templates, [templates])
    expect(matchesThemes(theme)).toBe(true)
    expect(matchesThemes(updated)).toBe(false)
  })
})
