/** Evaluates the text comparisons shared by EasyWorship collection catalogs. */

import type { CollectionRule } from './easyWorshipCollections'

export function normalizeCollectionText(value: string) {
  return value.normalize('NFKC').toLowerCase()
}

export function collectionTextRule(rule: CollectionRule): ((values: (string | null | undefined)[]) => boolean) | undefined {
  if (rule.value === null || rule.operator === null) return undefined
  const target = normalizeCollectionText(rule.value)
  let compare: (text: string) => boolean
  switch (rule.operator) {
    case 0: case 1: compare = (text) => text === target; break
    case 9: case 10: compare = (text) => text.includes(target); break
    case 11: compare = (text) => text.startsWith(target); break
    case 12: compare = (text) => text.endsWith(target); break
    default: return undefined
  }
  const reversed = rule.operator === 1 || rule.operator === 10
  return (values) => reversed !== values.some((value) => value !== null && value !== undefined && compare(normalizeCollectionText(value)))
}
