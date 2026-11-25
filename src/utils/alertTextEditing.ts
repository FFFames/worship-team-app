/** Keeps alert text formatting attached to its text and token placeholders as they change. */

import type { AlertTemplate } from '../types/alertTemplate'
import type { DesignTextRun } from '../types/slideDesign'
import { alertTokenPattern } from './alertTokens'
import { importedAlertRuns } from './easyWorshipAlertTags'
import { compactTextRuns, editTextRuns, sliceTextRuns } from './slideDesign'

type Draft = Omit<AlertTemplate, 'id'>
export type AlertRunStyle = NonNullable<DesignTextRun['style']>
export type AlertTextSelection = { start: number; end: number }

export function alertTemplateTextRuns(template: Draft) {
  return template.runs ?? importedAlertRuns(template, template.text)
}

export function liveAlertTextRuns(template: AlertTemplate | undefined, text: string) {
  if (!template?.runs) return importedAlertRuns(template, text)
  const runs = updateAlertText(template, text).runs
  return runs?.some((run) => run.style || run.align) ? runs : undefined
}

export function updateAlertText(template: Draft, text: string): Draft {
  if (template.text === text) return template
  const runs = alertTemplateTextRuns(template)
  if (!runs) return { ...template, text }
  const aligned = editTextRuns(runs, template.text, text) ?? [{ text }]
  return { ...template, text, runs: compactTextRuns(aligned) }
}

export function replaceAlertTextRange(template: Draft, selection: AlertTextSelection, replacement: string): Draft {
  const { start, end } = selection
  const text = template.text.slice(0, start) + replacement + template.text.slice(end)
  const runs = alertTemplateTextRuns(template)
  if (!runs) return { ...template, text }
  const before = sliceTextRuns(runs, 0, start)
  const first = sliceTextRuns(runs, start, start + 1)[0] ?? before[before.length - 1]
  return { ...template, text, runs: compactTextRuns([
    ...before, { ...first, text: replacement }, ...sliceTextRuns(runs, end, template.text.length),
  ]) }
}

export function trimAlertText(template: Draft): Draft {
  const trimmed = template.text.trim()
  if (trimmed === template.text) return template
  const start = template.text.length - template.text.trimStart().length
  const runs = template.runs && sliceTextRuns(template.runs, start, start + trimmed.length)
  return { ...template, text: trimmed, runs }
}

export function alertFormatRange(text: string, selection: AlertTextSelection): AlertTextSelection {
  let { start, end } = selection
  if (start === end || end > text.length) return { start: 0, end: text.length }
  if (/[\uDC00-\uDFFF]/.test(text[start] ?? '')) start--
  if (/[\uD800-\uDBFF]/.test(text[end - 1] ?? '')) end++
  for (const { 0: marker, index } of text.matchAll(alertTokenPattern)) {
    const markerEnd = index + marker.length
    if (index < end && markerEnd > start) {
      start = Math.min(start, index)
      end = Math.max(end, markerEnd)
    }
  }
  return { start, end }
}

export function formatAlertText(template: Draft, selection: AlertTextSelection, style: AlertRunStyle | null): Draft {
  const { start, end } = alertFormatRange(template.text, selection)
  const runs = alertTemplateTextRuns(template) ?? [{ text: template.text }]
  const edited = sliceTextRuns(runs, start, end).map((run) => ({ ...run, style: style ? {
    ...run.style, ...style,
    ...(style.outline && run.style?.outline ? { outline: { ...run.style.outline, ...style.outline } } : {}),
    ...(style.textShadow && run.style?.textShadow ? { textShadow: { ...run.style.textShadow, ...style.textShadow } } : {}),
  } : undefined }))
  return { ...template, runs: compactTextRuns([
    ...sliceTextRuns(runs, 0, start), ...edited, ...sliceTextRuns(runs, end, template.text.length),
  ]) }
}
