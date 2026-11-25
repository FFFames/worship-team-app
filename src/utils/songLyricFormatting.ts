/** Applies character formatting to a lyric selection without changing the chart text. */

import type { DesignTextRun, SlideDesign } from '../types/slideDesign'
import { applyThemeText, compactTextRuns, sliceTextRuns } from './slideDesign'

export type LyricRunStyle = NonNullable<DesignTextRun['style']>
export type LyricSelection = { start: number; end: number }
type LyricStylePatch = LyricRunStyle | ((current: LyricRunStyle | undefined) => LyricRunStyle)

const graphemes = new Intl.Segmenter('th', { granularity: 'grapheme' })

export function lyricSelection(text: string, { start, end }: LyricSelection) {
  if (start >= end || start < 0 || end > text.length) return
  const segments = graphemes.segment(text)
  const first = segments.containing(start)
  const last = segments.containing(end - 1)
  if (first && last) return { start: first.index, end: last.index + last.segment.length }
}

export function alignedLyricRuns(text: string, runs?: DesignTextRun[]) {
  return runs?.map((run) => run.text).join('') === text ? runs : undefined
}

export function lyricRunsByLine(text: string, runs?: DesignTextRun[]) {
  const aligned = alignedLyricRuns(text, runs)
  if (!aligned) return
  let offset = 0
  return text.split('\n').map((line) => {
    const part = sliceTextRuns(aligned, offset, offset + line.length)
    offset += line.length + 1
    return part
  })
}

export function formatLyricRuns(text: string, runs: DesignTextRun[] | undefined, selection: LyricSelection, patch: LyricStylePatch | null) {
  const range = lyricSelection(text, selection)
  if (!range) return runs
  const source = alignedLyricRuns(text, runs) ?? [{ text }]
  const { start, end } = range
  return compactTextRuns([
    ...sliceTextRuns(source, 0, start),
    ...sliceTextRuns(source, start, end).map((run) => {
      const style = typeof patch === 'function' ? patch(run.style) : patch
      return { ...run, style: style ? {
        ...run.style, ...style,
        ...(style.outline && run.style?.outline ? { outline: { ...run.style.outline, ...style.outline } } : {}),
        ...(style.textShadow && run.style?.textShadow ? { textShadow: { ...run.style.textShadow, ...style.textShadow } } : {}),
      } : undefined }
    }),
    ...sliceTextRuns(source, end, text.length),
  ])
}

export function applySongLyricRuns(design: SlideDesign, text: string, runs?: DesignTextRun[]) {
  const applied = applyThemeText(design, text)
  const formatted = alignedLyricRuns(text, runs)
  if (!formatted) return applied
  const matches = applied.layers.filter((layer) => layer.kind === 'text' && layer.text === text)
  const slots = matches.filter((layer) => layer.kind === 'text' && layer.slot === 'content')
  const target = slots.length ? slots : matches.length === 1 ? matches : []
  return { ...applied, layers: applied.layers.map((layer) => layer.kind === 'text' && target.includes(layer) ? { ...layer, runs: formatted } : layer) }
}
