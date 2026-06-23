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

/** Human-readable label for each section type. */
const FALLBACK_SECTION_LABELS: Record<SectionType, string> = {
  verse: 'Verse',
  prehook: 'Prehook',
  hook: 'Hook',
  bridge: 'Bridge',
  intro: 'Intro',
  outro: 'Outro',
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
    const lines = section.lines
      .map((l) => l.lyrics)
      .filter((lyrics) => lyrics.trim().length > 0)

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
