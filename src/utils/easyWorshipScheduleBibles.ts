/** Resolves schedule references from explicitly attached Bible plug-ins. */

import { readEasyWorshipBible, readEasyWorshipBibleInfo } from './easyWorshipBible'
import { createEasyWorshipScriptureLookup, scriptureAbbreviationKey, type EasyWorshipScriptureLookup } from './easyWorshipScheduleScripture'

export type EasyWorshipScheduleBibleReview = { matched: string[]; warnings: string[] }

export async function reviewEasyWorshipScheduleBibles(files: readonly File[], installed = createEasyWorshipScriptureLookup()) {
  const byTranslation = new Map<number, File[]>()
  const byAbbreviation = new Map<string, Set<number>>()
  const requested = new Set<number>()
  const matched = new Set<string>()
  const warnings = new Set<string>()
  function reportError(file: File, cause: unknown) {
    warnings.add(`${file.name} · ${cause instanceof Error ? cause.message : 'อ่านไฟล์พระคัมภีร์ไม่สำเร็จ'}`)
  }
  for (const file of files) {
    try {
      const { translationId, edition, warning } = await readEasyWorshipBibleInfo(file)
      if (warning) warnings.add(`${file.name} · ${warning}`)
      else {
        const entries = byTranslation.get(translationId) ?? []
        entries.push(file)
        byTranslation.set(translationId, entries)
        const key = scriptureAbbreviationKey(edition.abbreviation)
        const ids = byAbbreviation.get(key) ?? new Set<number>()
        ids.add(translationId)
        byAbbreviation.set(key, ids)
      }
    } catch (cause) {
      reportError(file, cause)
    }
  }

  const lookup: EasyWorshipScriptureLookup = async (translationId) => {
    requested.add(translationId)
    const entries = byTranslation.get(translationId)
    if (entries?.length === 1) {
      const [file] = entries
      try {
        const edition = await readEasyWorshipBible(file)
        matched.add(`${edition.abbreviation} · รหัส EasyWorship ${translationId}`)
        return edition
      } catch (cause) {
        reportError(file, cause)
      }
    } else if (entries?.length) {
      warnings.add(`แนบพระคัมภีร์รหัส EasyWorship ${translationId} หลายไฟล์ เลือกไฟล์ของฉบับนี้เพียงไฟล์เดียว`)
    }
    return installed(translationId)
  }
  lookup.byAbbreviation = async (abbreviation) => {
    const key = scriptureAbbreviationKey(abbreviation)
    const ids = [...(byAbbreviation.get(key) ?? [])]
    if (ids.length > 1) {
      for (const id of ids) requested.add(id)
      warnings.add(`แนบพระคัมภีร์ตัวย่อ ${abbreviation} หลายฉบับ เลือกฉบับที่ตรงกับตารางเพียงไฟล์เดียว`)
      return null
    }
    if (!ids.length) return installed.byAbbreviation?.(abbreviation) ?? null
    const edition = await lookup(ids[0])
    return edition && scriptureAbbreviationKey(edition.abbreviation) === key ? edition : null
  }

  function results(): EasyWorshipScheduleBibleReview {
    const notes = [...warnings]
    for (const [translationId, entries] of byTranslation) {
      if (!requested.has(translationId)) {
        for (const { name } of entries) notes.push(`${name} · ตารางนี้ไม่มีข้อที่อ้างรหัส EasyWorship ${translationId}`)
      }
    }
    return { matched: [...matched].sort(), warnings: notes.sort() }
  }
  return { lookup, results }
}
