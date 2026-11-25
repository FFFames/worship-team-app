/** Finds and formats lyric paragraphs while preserving characters, inline styles and soft line breaks. */

import type { DesignParagraphFormat, DesignTextRun } from '../types/slideDesign'
import { compactTextRuns, sliceTextRuns } from './slideDesign'
import { alignedLyricRuns, type LyricSelection } from './songLyricFormatting'

type ParagraphFormat = Omit<DesignParagraphFormat, 'index'>
export type LyricParagraphStyle = ParagraphFormat & Pick<DesignTextRun, 'align'>
export type LyricParagraph = { start: number; end: number; format: LyricParagraphStyle; runs: DesignTextRun[] }
export type LyricParagraphChange = (format: LyricParagraphStyle, paragraph: LyricParagraph) => Partial<LyricParagraphStyle> | null

export function lyricParagraphs(text: string, runs?: DesignTextRun[]): LyricParagraph[] {
  if (!text) return []
  const source = alignedLyricRuns(text, runs) ?? [{ text }]
  const starts = new Set([0])
  let offset = 0
  let previous: number | undefined
  for (const run of source) {
    if (!run.text) continue
    const index = run.paragraph?.index
    if (offset && index !== previous) {
      // Reflow can attach the paragraph separator to the next run.
      const start = text[offset] === '\n' && text[offset - 1] !== '\n' ? offset + 1 : offset
      starts.add(start)
    }
    if (index === undefined) {
      for (const line of run.text.matchAll(/\n/g)) starts.add(offset + line.index + 1)
    }
    offset += run.text.length
    previous = index
  }
  const boundaries = [...starts].filter((start) => start < text.length).sort((left, right) => left - right)
  return boundaries.map((start, index) => {
    const end = boundaries[index + 1] ?? text.length
    const fragments = sliceTextRuns(source, start, end)
    const first = fragments[0]
    const { index: _index, ...format } = first.paragraph ?? {}
    return { start, end, format: { ...format, align: first.align }, runs: fragments }
  })
}

export function selectedLyricParagraphs(paragraphs: LyricParagraph[], selection?: LyricSelection): LyricParagraph[] {
  if (!selection || selection.start < 0 || selection.end < selection.start || selection.end > (paragraphs[paragraphs.length - 1]?.end ?? 0)) return []
  const { start, end } = selection
  if (start === end && start === paragraphs[paragraphs.length - 1]?.end) return paragraphs.slice(-1)
  return paragraphs.filter((paragraph) => paragraph.end > start && (start === end ? paragraph.start <= start : paragraph.start < end))
}

export function formatLyricParagraphs(paragraphs: LyricParagraph[], selection: LyricParagraph[], change: LyricParagraphChange): DesignTextRun[] {
  const selected = new Set(selection)
  return compactTextRuns(paragraphs.flatMap((paragraph, index) => {
    const patch = selected.has(paragraph) ? change(paragraph.format, paragraph) : {}
    const { align, ...format } = patch === null ? {} : { ...paragraph.format, ...patch }
    return paragraph.runs.map((run) => {
      const { align: oldAlignment, paragraph: _oldParagraph, ...rest } = run
      const alignment = patch === null || 'align' in patch ? align : oldAlignment
      return { ...rest, ...(alignment ? { align: alignment } : {}), paragraph: { index, ...format } }
    })
  }))
}

export function hasParagraphList(runs?: DesignTextRun[]) {
  return runs?.some((run) => Boolean(run.paragraph?.list)) ?? false
}

/** Merge incoming markers into the same paragraphs of an older import. */
export function recoverMissingParagraphLists(text: string, saved?: DesignTextRun[], incoming?: DesignTextRun[]) {
  if (!hasParagraphList(incoming) || !alignedLyricRuns(text, incoming)) return undefined
  const source = lyricParagraphs(text, incoming)
  const sourceByRange = new Map(source.map((paragraph) => [paragraph.start, paragraph]))
  const previous = alignedLyricRuns(text, saved)
  if (saved && !previous) return undefined
  const paragraphs = previous?.some((run) => run.paragraph) ? lyricParagraphs(text, previous)
    : source.map(({ start, end }) => ({
      start, end, format: {} as LyricParagraphStyle, runs: sliceTextRuns(previous ?? [{ text }], start, end),
    }))
  const missing = paragraphs.filter(({ start, end, format }) => {
    const paragraph = sourceByRange.get(start)
    return format.list === undefined && paragraph?.end === end && paragraph.format.list
  })
  return missing.length ? formatLyricParagraphs(paragraphs, missing,
    (_, { start }) => ({ list: sourceByRange.get(start)?.format.list })) : undefined
}
