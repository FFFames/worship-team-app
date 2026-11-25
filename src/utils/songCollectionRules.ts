/** Evaluates native song collection rules against either source or library lyrics. */

import type { Song, SongListItem } from '../types/database'
import { parseChordLyrics } from './chordParser'
import { collectionTextRule } from './collectionTextRule'
import type { EasyWorshipCollection } from './easyWorshipCollections'

type RuleSong = {
  title: string
  author?: string | null
  copyright?: string | null
  administrator?: string | null
  words: () => string
}

type SongRuleDetails = Partial<Pick<Song, 'copyright' | 'copyright_administrator' | 'ccli_number' | 'sections' | 'raw_content'>>
export type CollectionSong = SongListItem & SongRuleDetails
type CompiledSongRules = { needsDetails: boolean; matches: (song: RuleSong) => boolean }

const fields: Record<string, (song: RuleSong) => (string | null | undefined)[]> = {
  title: (song) => [song.title],
  author: (song) => [song.author],
  copyright: (song) => [song.copyright],
  administrator: (song) => [song.administrator],
  words: (song) => [song.words()],
  'any field': (song) => [song.title, song.author, song.copyright, song.administrator, song.words()],
}

export function compileSongCollectionRules(group: EasyWorshipCollection): CompiledSongRules | undefined {
  if (!group.rulesEnabled || !group.rules.length || (group.matchType !== 0 && group.matchType !== 1)) return
  const conditions: ((song: RuleSong) => boolean)[] = []
  for (const rule of group.rules) {
    const compare = collectionTextRule(rule)
    if (!compare || !Object.prototype.hasOwnProperty.call(fields, rule.field)) return
    const read = fields[rule.field]
    conditions.push((song: RuleSong) => compare(read(song)))
  }
  return {
    needsDetails: group.rules.some((rule) => rule.field !== 'title' && rule.field !== 'author'),
    matches: (song: RuleSong) => {
      const matches = (test: (song: RuleSong) => boolean) => test(song)
      return group.matchType === 0 ? conditions.every(matches) : conditions.some(matches)
    },
  }
}

export function prepareSongCollectionFilter(leaves: readonly EasyWorshipCollection[]) {
  const fixed = new Set<string>()
  const live: (CompiledSongRules & { included: Set<string>; excluded: Set<string> })[] = []
  for (const group of leaves) {
    const rules = compileSongCollectionRules(group)
    const keys = group.resourceItems ?? {}
    const included = group.inclusions.map((id) => keys[id])
    const excluded = group.exclusions.map((id) => keys[id])
    // Older stored groups and incomplete catalogs may lack a stable ID for a manual override.
    if (!rules || !included.every(Boolean) || !excluded.every(Boolean)) {
      for (const id of group.songIds) fixed.add(id)
      continue
    }
    live.push({ ...rules, included: new Set(included), excluded: new Set(excluded) })
  }

  return {
    needsDetails: live.some((group) => group.needsDetails),
    includesSong(song: CollectionSong) {
      if (fixed.has(song.id)) return true
      if (!live.length) return false
      let words: string | undefined
      const candidate: RuleSong = {
        title: song.title,
        author: song.artist,
        copyright: song.copyright,
        administrator: song.copyright_administrator,
        words: () => words ??= (song.sections ?? parseChordLyrics(song.raw_content ?? '').sections)
          .flatMap((section) => section.lines.map((line) => line.lyrics)).join('\n'),
      }
      return live.some((group) =>
        !group.excluded.has(song.id) && (group.included.has(song.id) || group.matches(candidate)))
    },
  }
}
