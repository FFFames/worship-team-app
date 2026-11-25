/** Builds a reusable chart from one reviewed schedule occurrence. */

import type { PlaylistCue, PlaylistSong, Section, Song } from '../types/database'
import type { SongAppearance } from '../types/slideDesign'
import { detectKey, formatChordRows, formatLyricsOnly, getSectionDisplayLabel, parseChordLyrics } from './chordParser'
import { contentLines, songCuePlayback, songSlideAppearance, type ScheduleSongCatalogEntry } from './easyWorshipScheduleSongs'
import { scheduleSongSourceUid } from './easyWorshipSongIdentity'
import { songCueLyrics, songSlideLyricRuns } from './songCueLayout'
import { alignedLyricRuns } from './songLyricFormatting'
import { songLibrarySections } from './songLibrarySlides'
import { songTagsFromText } from './songTags'

export type SongDecision = 'add' | 'replace' | 'link' | 'use_library'
export type LibraryChart = Pick<Song, 'raw_content' | 'sections'> & { looping?: boolean | null }

const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value).trim() || null : null
const normalize = (value: string) => value.normalize('NFC').trim()

export function readCueSongVersion(cue: PlaylistCue): { sections: Section[]; appearance?: SongAppearance } {
  const sections: Section[] = []
  const appearance: NonNullable<SongAppearance['sections']> = []
  for (const slide of cue.slides) {
    const lyrics = songCueLyrics(slide)?.text.split('\n') ?? contentLines(slide)
    const lines = Array.from({ length: Math.max(lyrics.length, slide.chords?.length ?? 0) }, (_, index) => ({
      lyrics: lyrics[index] ?? '', chords: slide.chords?.[index] ?? '',
    }))
    if (!lines.some((line) => line.lyrics.trim() || line.chords.trim())) continue
    const label = slide.label.trim() || `Verse ${sections.length + 1}`
    const type = slide.sectionType ?? parseChordLyrics(formatLyricsOnly([{ label, lines: ['lyric'] }])).sections[0].type
    const design = songSlideAppearance(slide)
    if (design) appearance.push({ index: sections.length, label, design })
    const lyricRuns = alignedLyricRuns(lines.map((line) => line.lyrics).join('\n'), songSlideLyricRuns(slide))
    const playback = songCuePlayback(slide)
    sections.push({ type, label, marker: '', lines, slideBreaks: [], ...(lyricRuns ? { lyricRuns } : {}),
      ...(slide.transition ? { transition: slide.transition } : {}),
      ...(playback ? { playback } : {}),
      ...(slide.slideLayout ? { slideLayouts: [{ start: 0, layout: slide.slideLayout }] } : {}) })
  }
  return { sections, appearance: appearance.length || cue.slideLayout || cue.looping !== undefined ? {
    ...(appearance.length ? { sections: appearance } : {}), ...(cue.slideLayout ? { slideLayout: cue.slideLayout } : {}),
    ...(cue.looping !== undefined ? { looping: cue.looping } : {}),
  } : undefined }
}

function keepMatchingChords(sections: Section[], target: LibraryChart) {
  const chords = new Map<string, Set<string>>()
  for (const section of songLibrarySections(target)) for (const line of section.lines) {
    const key = JSON.stringify([normalize(getSectionDisplayLabel(section)), normalize(line.lyrics)])
    const values = chords.get(key) ?? new Set<string>()
    values.add(line.chords)
    chords.set(key, values)
  }
  return sections.map((section) => ({ ...section, lines: section.lines.map((line) => {
    if (line.chords || !line.lyrics.trim()) return line
    const values = chords.get(JSON.stringify([normalize(getSectionDisplayLabel(section)), normalize(line.lyrics)]))
    const chord = values?.size === 1 ? [...values][0] : undefined
    return chord ? { ...line, chords: chord } : line
  }) }))
}

export function lyricsMatch(a: Section[], b: Section[]) {
  const comparable = (sections: Section[]) => sections.flatMap((section) =>
    section.lines.map(({ lyrics }) => normalize(lyrics)).filter(Boolean))
  return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b))
}

export function reviewSongMatches<T extends ScheduleSongCatalogEntry>(cue: PlaylistCue, linkedId: string | null,
  library: readonly T[], sections: Section[]) {
  const uid = scheduleSongSourceUid(cue)
  const linked = library.find((song) => song.id === linkedId)
  const originals = uid ? library.filter((song) => song.easyworship_uid === uid) : []
  const candidates = originals.length
    ? [...originals, ...(linked && !originals.includes(linked) ? [linked] : [])]
    : library.filter((song) => song === linked || song.title === cue.label)
  const eligible = originals.length ? originals : candidates.filter((song) => !uid || !song.easyworship_uid)
  const sameLyrics = eligible.filter((song) => lyricsMatch(sections, songLibrarySections(song)))
  const suggested = linked ?? (sameLyrics.length === 1 ? sameLyrics[0] : undefined) ?? (eligible.length === 1 ? eligible[0] : undefined)
  return { candidates, suggested }
}

export function songPayloadFromOccurrence(entry: PlaylistSong, target?: LibraryChart) {
  const cue = entry.cue
  if (cue?.kind !== 'song') throw new Error('ไม่พบเพลงฉบับในตาราง')
  const version = readCueSongVersion(cue)
  if (!version.sections.length) throw new Error('เพลงฉบับในตารางไม่มีเนื้อร้องหรือคอร์ด')
  const sections = target ? keepMatchingChords(version.sections, target) : version.sections
  const raw_content = sections.some((section) => section.lines.some((line) => line.chords))
    ? formatChordRows(sections) : formatLyricsOnly(sections.map((section) => ({ label: section.label, lines: section.lines.map((line) => line.lyrics) })))
  const appearance = cue.looping === undefined && target?.looping === true
    ? { ...version.appearance, looping: false } : version.appearance
  return {
    title: cue.label,
    artist: text(cue.metadata?.author) ?? entry.song?.artist ?? null,
    copyright: text(cue.metadata?.copyright) ?? entry.song?.copyright ?? null,
    copyright_administrator: text(cue.metadata?.administrator) ?? entry.song?.copyright_administrator ?? null,
    ccli_number: text(cue.metadata?.referenceNumber) ?? entry.song?.ccli_number ?? null,
    description: text(cue.metadata?.description) ?? entry.song?.description ?? null,
    tags: cue.metadata?.tags == null ? entry.song?.tags ?? [] : songTagsFromText(text(cue.metadata.tags) ?? ''),
    original_key: entry.song?.original_key ?? detectKey(sections),
    raw_content, sections, appearance,
  }
}
