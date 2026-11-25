/** Covers native verse IDs, exclusions, and translation rules used by scripture collections. */

import { describe, expect, it } from 'vitest'
import type { ScriptureEdition } from '../types/scripture'
import type { EasyWorshipCollection } from './easyWorshipCollections'
import { decodeEasyWorshipScriptureVerse } from './easyWorshipScheduleScripture'
import { planScriptureCollection, scriptureCollectionEditions, scriptureCollectionVerseKey, scriptureCollectionVerses,
  scriptureEditionRuleField } from './easyWorshipScriptureCollections'

const id = (edition: number, verse: number, tail: number) => BigInt.asIntN(64,
  BigInt(edition) << 57n | 43n << 50n | 3n << 42n | BigInt(verse) << 34n | BigInt(tail)).toString()

const kjv: ScriptureEdition = {
  id: 'easyworship-17-kjv', name: 'King James Version', abbreviation: 'KJV',
  books: [{ id: '43', name: 'John', verses: [
    { chapter: 3, verse: 16, text: 'For God so loved the world' },
    { chapter: 3, verse: 17, text: 'For God sent not his Son into the world to condemn the world' },
  ] }],
}
const es: ScriptureEdition = { ...kjv, id: 'easyworship-36-rva', name: 'Reina Valera Antigua', abbreviation: 'RVA' }
const base: EasyWorshipCollection = {
  id: '1', name: 'For Sunday', path: ['For Sunday'], parentId: '-2001', nativeType: 1, ownerId: null, resource: 'scripture',
  rulesEnabled: false, matchType: 0, rules: [], inclusions: [], exclusions: [], cachedResults: null, cachedVersion: null,
  songIds: [], unresolvedSongs: 0,
}

describe('EasyWorship scripture collections', () => {
  it('uses signed verse IDs and ignores their text-position bits when matching verses', () => {
    expect(decodeEasyWorshipScriptureVerse(id(100, 16, 2 ** 33 + 7002)))
      .toEqual({ translationId: 100, book: 43, chapter: 3, verse: 16 })
    expect(decodeEasyWorshipScriptureVerse('18446744073709551616')).toBeUndefined()
    const plan = planScriptureCollection([{ ...base, inclusions: [id(17, 16, 40), id(17, 17, 44), id(36, 17, 54)],
      exclusions: [id(17, 17, 1030)] }])
    expect(scriptureCollectionVerses(plan, kjv).map(({ verse }) => verse)).toEqual([16])
    expect(scriptureCollectionVerses(plan, es).map(({ verse }) => verse)).toEqual([17])
    expect(scriptureCollectionEditions(plan, [kjv])).toEqual({ compatible: [kjv], missingIds: [36], missingEditionIds: [], missingNames: [] })
  })

  it('combines folder leaves after their own exclusions and keeps cached membership for unsupported rules', () => {
    const plan = planScriptureCollection([
      { ...base, rulesEnabled: true,
        rules: [{ id: '2', field: 'translation', operator: null, value: '"King James Version","KJV",0\r\n', secondValue: null },
          { id: '3', field: 'ScriptureText', operator: 9, value: 'LOVED', secondValue: null }],
        exclusions: [id(17, 17, 60)] },
      { ...base, id: '4', rulesEnabled: true, cachedResults: [id(17, 17, 30)],
        rules: [{ id: '5', field: 'unrecognized', operator: 9, value: 'loved', secondValue: null }] },
    ])
    expect(plan.hasUnsupported).toBe(true)
    expect(scriptureCollectionVerses(plan, kjv).map(({ verse }) => verse)).toEqual([16, 17])
    expect(scriptureCollectionVerses(plan, es)).toEqual([])
    expect(scriptureCollectionEditions(plan, [es]).missingNames).toEqual(['King James Version · KJV'])
  })

  it('rebuilds cached groups in the named editions and keeps manual choices scoped to the original edition', () => {
    const plan = planScriptureCollection([{ ...base, rulesEnabled: true, cachedResults: [id(17, 17, 6)],
      rules: [{ id: '2', field: 'translation', operator: null, value: '"King James Version","KJV",0', secondValue: null },
        { id: '3', field: 'translation', operator: null, value: '"Reina Valera Antigua","RVA",4', secondValue: null },
        { id: '4', field: 'ScriptureText', operator: 9, value: 'WORLD "God so loved"', secondValue: null }],
      inclusions: [id(17, 17, 10)], exclusions: [id(17, 16, 100)] }])
    const unrelated = { ...kjv, id: 'easyworship-14-test', name: 'Other Edition', abbreviation: 'OTHER' }
    expect(plan.hasUnsupported).toBe(false)
    expect(scriptureCollectionEditions(plan, [kjv, unrelated]).missingNames).toEqual(['Reina Valera Antigua · RVA'])
    expect(scriptureCollectionEditions(plan, [kjv, es, unrelated]).compatible).toEqual([kjv, es])
    expect(scriptureCollectionVerses(plan, kjv).map(({ verse }) => verse)).toEqual([17])
    expect(scriptureCollectionVerses(plan, es).map(({ verse }) => verse)).toEqual([16])
    expect(scriptureCollectionVerses(plan, unrelated)).toEqual([])
  })

  it('applies all or any keyword rules without retaining stale results from the cache', () => {
    const rules = ['loved', 'condemn'].map((value, index) => ({ id: String(index), field: 'ScriptureText', operator: 9, value, secondValue: null }))
    const baseWithRules = { ...base, rulesEnabled: true, rules, cachedResults: [id(17, 17, 5)] }
    const all = planScriptureCollection([baseWithRules])
    expect(scriptureCollectionVerses(all, kjv)).toEqual([])
    const any = planScriptureCollection([{ ...baseWithRules, matchType: 1 }])
    expect(scriptureCollectionEditions(any, [kjv, es])).toEqual({ compatible: [kjv, es], missingIds: [], missingEditionIds: [], missingNames: [] })
    expect(scriptureCollectionVerses(any, kjv).map(({ verse }) => verse)).toEqual([16, 17])
    const unsupported = planScriptureCollection([{ ...baseWithRules, exclusions: ['invalid'] }])
    expect(unsupported.hasUnsupported).toBe(true)
    expect(scriptureCollectionVerses(unsupported, kjv).map(({ verse }) => verse)).toEqual([17])
  })

  it('keeps explicit verses when an unsupported rule has no saved results', () => {
    const plan = planScriptureCollection([{ ...base, inclusions: [id(17, 16, 5), '12'], rulesEnabled: true,
      rules: [{ id: '2', field: 'translation', operator: null, value: 'unrecognized', secondValue: null },
        { id: '3', field: 'ScriptureText', operator: 9, value: 'world', secondValue: null }] }])
    expect(plan.hasUnsupported).toBe(true)
    expect(scriptureCollectionVerses(plan, kjv).map(({ verse }) => verse)).toEqual([16])
  })

  it('unions local edition-scoped rules and native references with exact manual exclusions', () => {
    const local = { ...es, id: 'local-thai' }
    const namedElsewhere = { ...local, id: 'different-edition' }
    const verse = { ...local.books[0].verses[0], bookId: '43', bookName: 'John' }
    const plan = planScriptureCollection([{ ...base, rulesEnabled: true,
      rules: [{ id: 'scope', field: scriptureEditionRuleField, operator: 0, value: local.id, secondValue: null },
        { id: 'text', field: 'ScriptureText', operator: 9, value: 'world', secondValue: null }],
      inclusions: [id(17, 16, 3)], exclusions: [scriptureCollectionVerseKey(local, verse)] }])
    expect(plan.hasUnsupported).toBe(false)
    expect(scriptureCollectionVerses(plan, local).map(({ verse }) => verse)).toEqual([17])
    expect(scriptureCollectionVerses(plan, kjv).map(({ verse }) => verse)).toEqual([16])
    expect(scriptureCollectionVerses(plan, namedElsewhere)).toEqual([])
    expect(scriptureCollectionEditions(plan, [kjv, es]).missingEditionIds).toEqual([local.id])
    const manual = planScriptureCollection([{ ...base, inclusions: [scriptureCollectionVerseKey(local, verse)] }])
    expect(scriptureCollectionVerses(manual, local).map(({ verse }) => verse)).toEqual([16])
    expect(scriptureCollectionVerses(manual, namedElsewhere)).toEqual([])
  })
})
