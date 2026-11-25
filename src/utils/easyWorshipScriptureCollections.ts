/** Opens the individual verses and text rules saved in EasyWorship scripture collections. */

import type { LocatedVerse, ScriptureEdition, ScriptureEditionInfo } from '../types/scripture'
import { collectionTextRule, normalizeCollectionText } from './collectionTextRule'
import type { CollectionRule, EasyWorshipCollection } from './easyWorshipCollections'
import { decodeEasyWorshipScriptureVerse } from './easyWorshipScheduleScripture'
import { compileScriptureTextQuery } from './scripture'

type TranslationNames = [string, string]
type VerseIdentity = { editionId: number | string; bookId: string; chapter: number; verse: number }
const savedVersePrefix = 'verse:'
export const scriptureEditionRuleField = 'worshipteamEdition'

export function scriptureCollectionVerseKey(edition: ScriptureEditionInfo, verse: LocatedVerse) {
  return savedVersePrefix + JSON.stringify([edition.id, verse.bookId, verse.chapter, verse.verse])
}

export function readScriptureCollectionVerse(value: string): VerseIdentity | undefined {
  if (!value.startsWith(savedVersePrefix)) {
    const native = decodeEasyWorshipScriptureVerse(value)
    return native && { editionId: native.translationId, bookId: String(native.book), chapter: native.chapter, verse: native.verse }
  }
  try {
    const data: unknown = JSON.parse(value.slice(savedVersePrefix.length))
    if (!Array.isArray(data) || data.length !== 4) return
    const [editionId, bookId, chapter, verse] = data
    if (typeof editionId === 'string' && editionId && typeof bookId === 'string' && bookId
      && Number.isSafeInteger(chapter) && chapter > 0 && Number.isSafeInteger(verse) && verse > 0) {
      return { editionId, bookId, chapter, verse }
    }
  } catch { /* An invalid reference remains visible as unsupported. */ }
}

function verseIds(raw: string[]) {
  const verses = new Map<VerseIdentity['editionId'], Set<string>>()
  let invalid = false
  for (const id of raw) {
    const verse = readScriptureCollectionVerse(id)
    if (!verse) {
      invalid = true
      continue
    }
    const entries = verses.get(verse.editionId) ?? new Set<string>()
    entries.add(versePosition(verse.bookId, verse.chapter, verse.verse))
    verses.set(verse.editionId, entries)
  }
  return { verses, invalid }
}

const versePosition = (book: string, chapter: number, verse: number) => `${book}:${chapter}:${verse}`

function translationNames(value: string | null): TranslationNames[] | undefined {
  if (!value) return undefined
  const names: TranslationNames[] = []
  for (const line of value.trim().split(/\r\n?|\n/)) {
    // The two quoted names are followed by a catalog list position, which can change on another PC.
    const fields = line.match(/^\s*"((?:[^"\r\n]|"")+)"\s*,\s*"((?:[^"\r\n]|"")+)"\s*,\s*\d+\s*$/)
    if (!fields) return undefined
    names.push([fields[1].replace(/""/g, '"'), fields[2].replace(/""/g, '"')])
  }
  return names
}

function editionMatchesNames(edition: ScriptureEditionInfo, names: TranslationNames) {
  const saved = names.map(normalizeCollectionText)
  return saved.includes(normalizeCollectionText(edition.name)) && saved.includes(normalizeCollectionText(edition.abbreviation))
}

export function scriptureRuleEditionLabel(rule: CollectionRule) {
  return translationNames(rule.value)?.map((names) => names.join(' · ')).join(', ')
}

function localEditionRule(rule: CollectionRule) {
  return rule.field === scriptureEditionRuleField && rule.operator === 0 && rule.value?.trim() ? rule.value : undefined
}

export function sourceScriptureTranslationId(edition: ScriptureEditionInfo) {
  const id = /^easyworship-(\d+)-/.exec(edition.id)?.[1]
  return id === undefined ? undefined : Number(id)
}

function scriptureTextRule(rule: CollectionRule): ((text: string) => boolean) | undefined {
  if (rule.field.toLowerCase() !== 'scripturetext' || !rule.value?.trim()) return undefined
  if (rule.operator === null || rule.operator === 9 || rule.operator === 10) {
    const matches = compileScriptureTextQuery(rule.value)
    return matches && (rule.operator === 10 ? (text) => !matches(text) : matches)
  }
  const matches = collectionTextRule(rule)
  return matches && ((text) => matches([text]))
}

export function validScriptureTextRule(rule: CollectionRule) {
  return Boolean(scriptureTextRule(rule))
}

export function planScriptureCollection(collections: EasyWorshipCollection[]) {
  const translationIds = new Set<number>()
  const editionIds = new Set<string>()
  const namedTranslations: TranslationNames[] = []
  let searchesAllEditions = false
  let hasUnsupported = false
  const groups = collections.map((collection) => {
    const excluded = verseIds(collection.exclusions)
    const rules = collection.rulesEnabled ? collection.rules : []
    const translations: TranslationNames[] = []
    const ruleEditions = new Set<string>()
    const textFilters: ((text: string) => boolean)[] = []
    let unsupported = excluded.invalid
    for (const rule of rules) {
      const editionId = localEditionRule(rule)
      if (editionId) ruleEditions.add(editionId)
      else if (rule.field.toLowerCase() === 'translation') {
        const names = translationNames(rule.value)
        if (names) translations.push(...names)
        else unsupported = true
      } else {
        const matches = scriptureTextRule(rule)
        if (matches) textFilters.push(matches)
        else unsupported = true
      }
    }
    if (textFilters.length > 1 && collection.matchType !== 0 && collection.matchType !== 1) unsupported = true
    const live = rules.length > 0 && !unsupported
    const cached = collection.rulesEnabled && !live ? collection.cachedResults : null
    const included = verseIds([...collection.inclusions, ...(cached ?? [])])
    if (included.invalid || unsupported) hasUnsupported = true

    for (const [id, addresses] of included.verses) {
      const excludedAddresses = excluded.verses.get(id)
      if ([...addresses].some((address) => !excludedAddresses?.has(address))) {
        if (typeof id === 'number') translationIds.add(id)
        else editionIds.add(id)
      }
    }
    if (live) {
      namedTranslations.push(...translations)
      for (const id of ruleEditions) editionIds.add(id)
      searchesAllEditions ||= !translations.length && !ruleEditions.size
    }
    return { included: included.verses, excluded: excluded.verses, translations, ruleEditions, textFilters, live, any: collection.matchType === 1 }
  })

  return { translationIds, editionIds, namedTranslations, searchesAllEditions, hasUnsupported, groups }
}

type Plan = ReturnType<typeof planScriptureCollection>

export function scriptureCollectionEditions(plan: Plan, editions: ScriptureEditionInfo[]) {
  const compatible = editions.filter((edition) => {
    const id = sourceScriptureTranslationId(edition)
    return plan.searchesAllEditions || plan.editionIds.has(edition.id) || (id !== undefined && plan.translationIds.has(id))
      || plan.namedTranslations.some((names) => editionMatchesNames(edition, names))
  })
  const missingIds = [...plan.translationIds].filter((id) => !compatible.some((edition) => sourceScriptureTranslationId(edition) === id))
  const missingNames = [...new Set(plan.namedTranslations.filter((names) => !compatible.some((edition) => editionMatchesNames(edition, names)))
    .map((names) => names.join(' · ')))]
  const missingEditionIds = [...plan.editionIds].filter((id) => !editions.some((edition) => edition.id === id))
  return { compatible, missingIds, missingEditionIds, missingNames }
}

export function scriptureCollectionVerses(plan: Plan, edition: ScriptureEdition): LocatedVerse[] {
  const sourceId = sourceScriptureTranslationId(edition)
  const groups = plan.groups.flatMap((group) => {
    const included = new Set([...(group.included.get(edition.id) ?? []), ...(sourceId === undefined ? [] : group.included.get(sourceId) ?? [])])
    const excluded = new Set([...(group.excluded.get(edition.id) ?? []), ...(sourceId === undefined ? [] : group.excluded.get(sourceId) ?? [])])
    const canSearch = group.live && ((!group.translations.length && !group.ruleEditions.size)
      || group.ruleEditions.has(edition.id) || group.translations.some((names) => editionMatchesNames(edition, names)))
    return included.size || canSearch ? [{ group, included, excluded, canSearch }] : []
  })
  if (!groups.length) return []

  const passages: LocatedVerse[] = []
  for (const book of edition.books) {
    for (const verse of book.verses) {
      const address = versePosition(book.id, verse.chapter, verse.verse)
      if (!groups.some(({ group, included, excluded, canSearch }) => {
        if (excluded.has(address)) return false
        if (included.has(address)) return true
        if (!canSearch) return false
        if (!group.textFilters.length) return true
        const matches = (condition: typeof group.textFilters[number]) => condition(verse.text)
        return group.any ? group.textFilters.some(matches) : group.textFilters.every(matches)
      })) continue
      passages.push({ ...verse, bookId: book.id, bookName: book.name })
    }
  }
  return passages
}
