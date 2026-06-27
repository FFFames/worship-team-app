/** slideBuilder — builds presentation slides from song sections.
 *
 * Each slide contains content from EXACTLY ONE section. Lines from different
 * sections are NEVER combined on the same slide. Sections that exceed the
 * per-slide line limit are split into multiple slides, all within that section. */

import type { Section, SectionType } from '../types/database'
import { getSectionDisplayLabel } from './chordParser'

/** A single presentation slide built from one section (or part of one). */
export type Slide = {
  sectionType: SectionType
  sectionLabel: string
  lines: string[]
}

/** Maximum number of lyric lines placed on a single slide. */
export const MAX_LINES_PER_SLIDE = 4

/** Conservative width that stays on one rendered line in the presenter. */
export const MAX_GRAPHEMES_PER_LINE = 30

const graphemeSegmenter = new Intl.Segmenter('th', { granularity: 'grapheme' })
const wordSegmenter = new Intl.Segmenter('th', { granularity: 'word' })

function graphemeLength(value: string): number {
  return Array.from(graphemeSegmenter.segment(value)).length
}

function splitLongToken(token: string): string[] {
  const graphemes = Array.from(graphemeSegmenter.segment(token), ({ segment }) => segment)
  const chunks: string[] = []
  for (let index = 0; index < graphemes.length; index += MAX_GRAPHEMES_PER_LINE) {
    chunks.push(graphemes.slice(index, index + MAX_GRAPHEMES_PER_LINE).join(''))
  }
  return chunks
}

/** Wrap one stored lyric line into deterministic presenter-safe display lines. */
export function wrapLyricLine(line: string): string[] {
  const tokens = Array.from(wordSegmenter.segment(line.trim()), ({ segment }) => segment)
  const wrapped: string[] = []
  let current = ''

  for (const token of tokens) {
    if (graphemeLength(current + token) <= MAX_GRAPHEMES_PER_LINE) {
      current += token
      continue
    }

    if (current.trim()) wrapped.push(current.trim())
    current = ''

    if (graphemeLength(token.trim()) > MAX_GRAPHEMES_PER_LINE) {
      const chunks = splitLongToken(token.trim())
      wrapped.push(...chunks.slice(0, -1))
      current = chunks[chunks.length - 1] ?? ''
    } else {
      current = token.trimStart()
    }
  }

  if (current.trim()) wrapped.push(current.trim())
  return wrapped
}

/** Human-readable label for each section type. */
const FALLBACK_SECTION_LABELS: Record<SectionType, string> = {
  verse: 'Verse',
  prehook: 'Prehook',
  hook: 'Hook',
  bridge: 'Bridge',
  intro: 'Intro',
  outro: 'Outro',
  end: 'End',
  instrumental: 'Instrumental',
  tag: 'Tag',
}

/**
 * Build a flat list of slides from song sections.
 *
 * Rules:
 *  - Each section yields at least one slide (if it has any non-empty lines).
 *  - If a section fits within MAX_LINES_PER_SLIDE it becomes a single slide.
 *  - If a section is longer, it is chunked into consecutive slides of
 *    MAX_LINES_PER_SLIDE — every chunk still belongs to the SAME section.
 *  - Slides never mix lines from two different sections.
 */
export function buildSlides(sections: Section[]): Slide[] {
  const slides: Slide[] = []

  for (const section of sections) {
    const lines = section.lines.flatMap((line) => (
      line.lyrics.trim() ? wrapLyricLine(line.lyrics) : []
    ))

    if (lines.length === 0) continue

    const sectionLabel = getSectionDisplayLabel(section) || FALLBACK_SECTION_LABELS[section.type] || section.type

    for (let i = 0; i < lines.length; i += MAX_LINES_PER_SLIDE) {
      slides.push({
        sectionType: section.type,
        sectionLabel,
        lines: lines.slice(i, i + MAX_LINES_PER_SLIDE),
      })
    }
  }

  return slides
}
