import type { DesignTextRun } from '../types/slideDesign'

export function replaceInTextRuns(
  text: string,
  runs: DesignTextRun[] | undefined,
  globalPattern: RegExp,
  replace: (match: string) => string | { prefix: string; style: (previous: DesignTextRun['style']) => DesignTextRun['style'] },
): { text: string; runs?: DesignTextRun[] } {
  if (!runs || runs.map((run) => run.text).join('') !== text) return { text: text.replace(globalPattern, (match) => {
    const replacement = replace(match)
    return typeof replacement === 'string' ? replacement : replacement.prefix + match
  }) }

  const source = runs.filter((run) => run.text)
  const result: DesignTextRun[] = []
  let runIndex = 0
  let runStart = 0
  let offset = 0

  function consume(end: number, copy: boolean) {
    while (offset < end) {
      const run = source[runIndex]
      const runEnd = runStart + run.text.length
      const next = Math.min(end, runEnd)
      if (copy && next > offset) result.push({ ...run, text: run.text.slice(offset - runStart, next - runStart) })
      offset = next
      if (offset === runEnd) {
        runIndex++
        runStart = runEnd
      }
    }
  }

  for (const { 0: match, index } of text.matchAll(globalPattern)) {
    const replacement = replace(match)
    if (replacement === match) continue
    consume(index, true)
    if (typeof replacement !== 'string') {
      const run = source[runIndex]
      result.push({ ...run, text: replacement.prefix, style: replacement.style(run.style) })
      continue
    }
    // A token or collapsed space adopts the style of its first character.
    const first = runIndex
    consume(index + 1, false)
    if (replacement) result.push({ ...source[first], text: replacement })
    consume(index + match.length, false)
  }
  if (!offset && !result.length) return { text, runs }
  consume(text.length, true)
  return { text: result.map((run) => run.text).join(''), runs: result }
}
