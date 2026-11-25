/** Compiles text rules and combines saved membership with live resource matches. */

import { collectionTextRule } from './collectionTextRule'
import type { EasyWorshipCollection } from './easyWorshipCollections'

export type ResourceRuleFields = Record<string, string | null | undefined>
type Matches = (fields: ResourceRuleFields) => boolean | undefined

const directory = (text: string) => text.replace(/\\/g, '/').replace(/\/+$/, '')

export function compileResourceCollectionRules(group: EasyWorshipCollection, allowedFields: readonly string[]): Matches | undefined {
  const { matchType } = group
  if (!group.rulesEnabled || !group.rules.length || (matchType !== 0 && matchType !== 1)) return
  const conditions: Matches[] = []
  for (const rule of group.rules) {
    if (!allowedFields.includes(rule.field)) return
    const folder = rule.field === 'folder'
    const compare = collectionTextRule(folder && rule.value !== null ? { ...rule, value: directory(rule.value) } : rule)
    if (!compare) return
    conditions.push((fields) => {
      const value = fields[rule.field]
      return value === undefined ? undefined : compare([folder && value ? directory(value) : value])
    })
  }
  return (fields) => {
    const decisive = matchType === 1
    let missing = false
    for (const condition of conditions) {
      const result = condition(fields)
      if (result === decisive) return decisive
      missing ||= result === undefined
    }
    return missing ? undefined : !decisive
  }
}

export function prepareResourceCollectionFilter(leaves: readonly EasyWorshipCollection[], compile: (group: EasyWorshipCollection) => Matches | undefined) {
  const fixed = new Set<string>()
  const live: Array<{ matches: Matches; include: Set<string>; exclude: Set<string>; saved: Set<string> }> = []
  for (const group of leaves) {
    const matches = compile(group)
    const include = group.inclusions.map((id) => group.resourceOverrides?.[id] ?? group.resourceItems?.[id])
    const exclude = group.exclusions.map((id) => group.resourceOverrides?.[id])
    const saved = Object.values(group.resourceItems ?? {})
    if (!matches || !include.every((id) => id !== undefined) || !exclude.every((id) => id !== undefined)) {
      for (const key of saved) fixed.add(key)
      continue
    }
    live.push({ matches, include: new Set(include), exclude: new Set(exclude), saved: new Set(saved) })
  }

  return (key: string | readonly (string | undefined)[] | undefined, readFields: () => ResourceRuleFields) => {
    const keys = typeof key === 'string' || key === undefined ? [key] : key
    const has = (members: Set<string | undefined>) => keys.some((id) => id !== undefined && members.has(id))
    if (has(fixed)) return true
    let fields: ResourceRuleFields | undefined
    return live.some(({ matches, include, exclude, saved }) => {
      if (has(exclude)) return false
      if (has(include)) return true
      return matches(fields ??= readFields()) ?? has(saved)
    })
  }
}
