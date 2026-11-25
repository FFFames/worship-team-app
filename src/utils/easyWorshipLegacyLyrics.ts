/** Decodes and splits legacy text while keeping style fragments aligned with retained lyrics. */

import { legacyRunsFromEasyWorshipRtf, type EasyWorshipSection } from './easyWorship'
import { decodeEasyWorshipText } from './easyWorshipEncoding'
import type { DesignTextRun } from '../types/slideDesign'
import { compactTextRuns } from './slideDesign'

const SECTION_NAME = /^(?:verse|chorus|bridge|pre[- ]?chorus|intro|outro|ending|end|tag|interlude|instrumental|solo|slide)(?:\s*\d+)?(?:\s+\([^\n]*\))?\s*:?$/i

function decodeLegacyText(bytes: Uint8Array, codePage: string) {
  const end = bytes.indexOf(0)
  const raw = end < 0 ? bytes : bytes.subarray(0, end)
  // RTF control words are ASCII. Literal text can be UTF-8 in some saved rows.
  try { return new TextDecoder('utf-8', { fatal: true }).decode(raw) }
  catch { return decodeEasyWorshipText(raw, codePage) }
}

export function readEasyWorshipLegacySections(bytes: Uint8Array | undefined, codePage: string): EasyWorshipSection[] {
  if (!bytes?.length) return []
  const { text, runs = [] } = legacyRunsFromEasyWorshipRtf(decodeLegacyText(bytes, codePage), codePage)
  const sections: EasyWorshipSection[] = []
  let blockOffset = 0
  let runOffset = 0
  let runIndex = 0

  function runsBetween(start: number, end: number) {
    const output: DesignTextRun[] = []
    while (runIndex < runs.length && runOffset < end) {
      const run = runs[runIndex]
      const next = runOffset + run.text.length
      const fragment = run.text.slice(Math.max(0, start - runOffset), end - runOffset)
      if (fragment) output.push({ ...run, text: fragment })
      if (next > end) break
      runOffset = next
      runIndex++
    }
    return output
  }

  for (const paragraph of text.split(/\n?\f\n?|\n(?:[^\S\n]*\n)+/)) {
    const start = text.indexOf(paragraph, blockOffset)
    blockOffset = start + paragraph.length
    const lines = [...paragraph.matchAll(/[^\n]+/g)].filter(([line]) => line.trim())
    if (!lines.length) continue
    const heading = lines[0][0].trim()
    const hasHeading = SECTION_NAME.test(heading)
    const label = hasHeading ? heading.replace(/:$/, '').trim() : `Slide ${sections.length + 1}`
    if (hasHeading) lines.shift()
    const section: EasyWorshipSection = { label, lines: lines.map(([line]) => line.trim()) }
    if (runs.length && lines.length) {
      const fragments: DesignTextRun[] = []
      for (const [index, { 0: line, index: position }] of lines.entries()) {
        const from = start + position + line.length - line.trimStart().length
        if (fragments.length) fragments.push({ ...fragments[fragments.length - 1], text: '\n' })
        for (const run of runsBetween(from, from + section.lines[index].length)) fragments.push(run)
      }
      if (fragments.some((run) => run.style || run.align || run.paragraph)) section.lyricRuns = compactTextRuns(fragments)
    }
    sections.push(section)
  }
  return sections
}
