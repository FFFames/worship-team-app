/** Splits and projects prepared song slides while keeping lyric formatting and chord positions. */

import type { PlaylistCue } from '../types/database'
import type { DesignLayer, DesignTextRun } from '../types/slideDesign'
import { isLyricLayout, wrapLyricLine, type LyricLayout } from './slideBuilder'
import { sliceTextRuns, visibleDesignTextRuns } from './slideDesign'
import { alignedLyricRuns } from './songLyricFormatting'

type CueSlide = PlaylistCue['slides'][number]
type TextLayer = Extract<DesignLayer, { kind: 'text' }>
type Lyrics = { text: string; layer?: TextLayer }
type Range = { start: number; end: number }
const lyricGraphemes = new Intl.Segmenter('th', { granularity: 'grapheme' })

export function songCueLyrics(slide: CueSlide): Lyrics | undefined {
  const fallback = { text: slide.lines.join('\n') }
  if (!slide.design) return fallback
  const textLayers = slide.design.layers.filter((layer) => layer.kind === 'text')
  const slots = textLayers.filter((layer) => layer.slot === 'content')
  if (slots.length === 1) return { text: slots[0].text, layer: slots[0] }
  const matches = (slots.length ? slots : textLayers).filter((layer) => layer.text === fallback.text && layer.text)
  if (matches.length === 1) return { text: matches[0].text, layer: matches[0] }
  if (!textLayers.some((layer) => layer.text.trim())) return fallback
}

export function songSlideLyricRuns(slide: CueSlide) {
  const text = slide.lines.join('\n')
  const layer = songCueLyrics(slide)?.layer
  return alignedLyricRuns(text, layer?.runs) ?? alignedLyricRuns(text, slide.lyricRuns)
}

function withLyrics(slide: CueSlide, lyrics: Lyrics, ranges: Range[]): CueSlide {
  const parts = ranges.map(({ start, end }) => lyrics.text.slice(start, end))
  const lines = parts.flatMap((part) => part.split('\n'))
  const fragments = (source?: DesignTextRun[]) => source && ranges.flatMap(({ start, end }, i) => {
    const run = sliceTextRuns(source, start, end)
    return i === 0 ? run : [{ ...run[0], text: '\n' }, ...run]
  })
  const lyricRuns = fragments(alignedLyricRuns(lyrics.text, slide.lyricRuns))
  const changed = { ...slide, lines, ...(slide.lyricRuns ? { lyricRuns } : {}) }
  if (!lyrics.layer || !slide.design) return changed
  const text = parts.join('\n')
  const runs = fragments(visibleDesignTextRuns(lyrics.layer))
  return { ...changed, design: { ...slide.design,
    layers: slide.design.layers.map((layer) => layer.id === lyrics.layer?.id && layer.kind === 'text' ? { ...layer, text, runs } : layer),
  } }
}

function continuation(slide: CueSlide): CueSlide {
  const { sourceId: _id, sourceOrder: _order, transition: _transition, transitionEdited: _transitionEdited,
    advanceMs: _advance, playback: _playback, ...rest } = slide
  return rest
}

function splitChordRow(row: string, column: number) {
  let head = ''
  let tail = ''
  for (const { 0: chord, index } of row.matchAll(/\S+/g)) {
    if (index < column) head = head.padEnd(index) + chord
    else tail = tail.padEnd(index - column) + chord
  }
  return [head, tail]
}

export function songLyricSplitPosition(text: string, caret: number) {
  if (!Number.isInteger(caret) || caret <= 0 || caret >= text.length) return
  const grapheme = lyricGraphemes.segment(text).containing(caret)
  const splitAt = grapheme && grapheme.index < caret ? grapheme.index + grapheme.segment.length : caret
  const headEnd = text[splitAt - 1] === '\n' ? splitAt - 1 : splitAt
  const tailStart = headEnd === splitAt && text[splitAt] === '\n' ? splitAt + 1 : splitAt
  if (!text.slice(0, headEnd).trim() || !text.slice(tailStart).trim()) return
  return { headEnd, tailStart }
}

export function splitSongCueSlide(slide: CueSlide, caret: number): [CueSlide, CueSlide] | undefined {
  const lyrics = songCueLyrics(slide)
  const position = lyrics && songLyricSplitPosition(lyrics.text, caret)
  if (!lyrics || !position) return
  const { text } = lyrics
  const { headEnd, tailStart } = position
  const head = withLyrics(slide, lyrics, [{ start: 0, end: headEnd }])
  const tail = withLyrics(continuation(slide), lyrics, [{ start: tailStart, end: text.length }])
  if (slide.chords) {
    const tailLine = text.slice(0, tailStart).split('\n').length - 1
    head.chords = slide.chords.slice(0, head.lines.length)
    tail.chords = slide.chords.slice(tailLine)
    if (tailLine === head.lines.length - 1 && slide.chords[tailLine]) {
      const column = tailStart - (text.lastIndexOf('\n', tailStart - 1) + 1)
      const [before, after] = splitChordRow(slide.chords[tailLine], column)
      head.chords[tailLine] = before
      tail.chords[0] = after
    }
  }
  return [head, tail]
}

export function reflowSongCueSlide(slide: CueSlide, layout: LyricLayout): CueSlide[] {
  const lyrics = songCueLyrics(slide)
  if (!lyrics?.text.trim()) return [slide]
  const fragments: Range[] = []
  let start = 0
  for (const line of lyrics.text.split('\n')) {
    let offset = start
    for (const part of wrapLyricLine(line)) {
      const next = lyrics.text.indexOf(part, offset)
      if (next < 0 || next + part.length > start + line.length) return [slide]
      fragments.push({ start: next, end: next + part.length })
      offset = next + part.length
    }
    start += line.length + 1
  }
  if (!fragments.length) return [slide]
  const size = layout === 'stanza' ? fragments.length : layout
  const slides: CueSlide[] = []
  for (let index = 0; index < fragments.length; index += size) {
    slides.push(withLyrics(index ? continuation(slide) : slide, lyrics, fragments.slice(index, index + size)))
  }
  return slides
}

export function arrangedCueSlides(cue: PlaylistCue): CueSlide[] {
  const { lyricLayout } = cue
  return cue.kind === 'song' && isLyricLayout(lyricLayout)
    ? cue.slides.flatMap((slide) => reflowSongCueSlide(slide, lyricLayout)) : cue.slides
}
