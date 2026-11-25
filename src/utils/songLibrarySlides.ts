/** Stores library slide boundaries alongside the source sections and keeps them aligned during edits. */

import { SECTION_LABELS, type PlaylistCue, type Section, type Song, type SongContent } from '../types/database'
import type { SlideDesign, SongSlideLayout } from '../types/slideDesign'
import { getSectionDisplayLabel, getSectionSlideLabel, isChordRowsChart, isLyricsOnlyChart, parseChordLyrics } from './chordParser'
import { compactTextRuns, designSoundtrackAssets, editTextRuns } from './slideDesign'
import { songCueLyrics, songLyricSplitPosition, splitSongCueSlide } from './songCueLayout'
import { alignedLyricRuns, applySongLyricRuns } from './songLyricFormatting'
import { applySongSlideLayout, mergeSongSlideLayout } from './songSlideLayout'

type CueSlide = PlaylistCue['slides'][number]

export function songLibrarySections(song: Pick<Song, 'raw_content' | 'sections'>): Section[] {
  const sections = song.sections ?? parseChordLyrics(song.raw_content).sections
  // Imported charts have one section per prepared slide unless the editor enables reflow.
  return isLyricsOnlyChart(song.raw_content) || isChordRowsChart(song.raw_content)
    ? sections.map((section) => section.slideBreaks === undefined ? { ...section, slideBreaks: [] } : section)
    : sections
}

export function sectionLyricText(section: Section) {
  return section.lines.map(({ lyrics }) => lyrics).join('\n')
}

export function songUsesAutomaticLayout(song: Pick<Song, 'raw_content' | 'sections'>) {
  return songLibrarySections(song).some((section) => !Array.isArray(section.slideBreaks) && sectionLyricText(section).trim())
}

export function songBreakOffset(text: string, caret: number) {
  return songLyricSplitPosition(text, caret)?.headEnd
}

export function librarySectionCue(section: Section, design?: SlideDesign): CueSlide {
  const text = sectionLyricText(section)
  const assets = designSoundtrackAssets(design)
  const lyricRuns = alignedLyricRuns(text, section.lyricRuns)
  const styled = design && applySongLyricRuns(design, text, lyricRuns)
  const initial: CueSlide = {
    label: getSectionSlideLabel(section) || SECTION_LABELS[section.type],
    sectionType: section.type,
    lines: section.lines.map(({ lyrics }) => lyrics),
    chords: section.lines.map(({ chords }) => chords),
    ...(section.transition ? { transition: section.transition } : {}),
    ...(section.playback ? { playback: section.playback } : {}),
    ...(styled ? { design: styled } : {}),
    ...(assets?.length ? { assets } : {}),
  }
  return lyricRuns && !songCueLyrics(initial)?.layer ? { ...initial, lyricRuns } : initial
}

export function preparedLibrarySection(section: Section, design?: SlideDesign, master?: SongSlideLayout): CueSlide[] {
  const initial = librarySectionCue(section, design)
  const { design: styled } = initial
  const text = sectionLyricText(section)
  const slides: CueSlide[] = []
  const starts = [0]
  const linkedLyrics = songCueLyrics(initial)?.text === text
  let remainder = linkedLyrics ? initial : { ...initial, design: undefined }
  let start = 0
  for (const offset of section.slideBreaks ?? []) {
    const position = songLyricSplitPosition(text, offset)
    if (!position || position.headEnd <= start) continue
    const parts = splitSongCueSlide(remainder, position.headEnd - start)
    if (!parts) continue
    slides.push(parts[0])
    starts.push(offset)
    remainder = parts[1]
    start = position.tailStart
  }
  slides.push(remainder)
  const layouts = new Map(Array.isArray(section.slideBreaks) ? section.slideLayouts?.map(({ start, layout }) => [start, layout]) : undefined)
  return slides.map((slide, index) => {
    const base = styled && !linkedLyrics ? { ...slide, design: applySongLyricRuns(styled, slide.lines.join('\n'), slide.lyricRuns) } : slide
    const layout = mergeSongSlideLayout(master, layouts.get(starts[index]))
    const projected = applySongSlideLayout({ ...base, ...(section.transition ? { transition: section.transition } : {}),
      ...(section.playback ? { playback: section.playback } : {}) }, layout)
    return layout?.elementEffects?.length
      ? { ...projected, slideLayout: { ...projected.slideLayout, elementEffects: layout.elementEffects } } : projected
  })
}

function remapBreakOffset(before: string, after: string) {
  if (before === after) return (offset: number) => offset
  const common = Math.min(before.length, after.length)
  let prefix = 0
  let suffix = 0
  while (prefix < common && before[prefix] === after[prefix]) prefix++
  while (suffix < common - prefix && before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++
  return (offset: number) => {
    if (offset === 0) return 0
    const shifted = offset <= prefix ? offset : offset >= before.length - suffix ? offset + after.length - before.length : undefined
    return shifted === undefined ? undefined : songBreakOffset(after, shifted)
  }
}

export function reparseLibrarySong(raw: string, previous?: SongContent | null): SongContent {
  const parsed = parseChordLyrics(raw)
  const old = previous?.sections ?? []
  if (!old.some((section) => section.slideBreaks !== undefined || section.lyricRuns || section.slideLayouts || section.slideLabel
    || section.transition !== undefined || section.playback)) return { sections: songLibrarySections({ raw_content: raw, sections: parsed.sections }) }

  const label = (section: Section) => `${section.type}\0${getSectionDisplayLabel(section).trim().toLowerCase()}`
  const earlier = old.map((section) => ({ section, label: label(section), text: sectionLyricText(section) }))
  const used = new Set<number>()
  const sections = parsed.sections.map((section, index) => {
    const next = sectionLyricText(section)
    const heading = label(section)
    const exact = earlier.findIndex((source, position) => !used.has(position) && source.label === heading && source.text === next)
    const sameLabel = earlier.flatMap((source, position) => !used.has(position) && source.label === heading ? [position] : [])
    const sameText = sameLabel.length === 0
      ? earlier.flatMap((source, position) => !used.has(position) && source.text === next ? [position] : []) : []
    const matching = exact >= 0 ? exact : sameLabel.length === 1 ? sameLabel[0]
      : sameLabel.includes(index) ? index : sameText.length === 1 ? sameText[0] : -1
    if (matching < 0) return section
    used.add(matching)
    const source = earlier[matching]
    const { slideBreaks, slideLayouts } = source.section
    const remap = remapBreakOffset(source.text, next)
    const nextBreaks = Array.isArray(slideBreaks)
      ? [...new Set(slideBreaks.flatMap((offset) => remap(offset) ?? []))].sort((a, b) => a - b) : slideBreaks
    const mappedLayouts = new Map<number, SongSlideLayout>()
    for (const { start, layout } of slideLayouts ?? []) {
      const shifted = remap(start)
      if (shifted !== undefined && !mappedLayouts.has(shifted)) mappedLayouts.set(shifted, layout)
    }
    const originalRuns = alignedLyricRuns(source.text, source.section.lyricRuns)
    return { ...section,
      ...(source.label === heading && source.section.slideLabel ? { slideLabel: source.section.slideLabel } : {}),
      ...(source.section.transition !== undefined ? { transition: source.section.transition } : {}),
      ...(source.section.playback ? { playback: source.section.playback } : {}),
      ...(nextBreaks !== undefined ? { slideBreaks: nextBreaks } : {}),
      ...(mappedLayouts.size ? { slideLayouts: [...mappedLayouts].map(([start, layout]) => ({ start, layout })) } : {}),
      ...(originalRuns && next ? { lyricRuns: compactTextRuns(editTextRuns(originalRuns, source.text, next) ?? [{ text: next }]) } : {}),
    }
  })
  return { sections: songLibrarySections({ raw_content: raw, sections }) }
}
