import type { AlertTemplate, AlertToken } from '../types/alertTemplate'
import { alertTokenMarker, nativeAlertTokenNames, normalizedTokenId } from './alertTokens'
import { alertRunsFromEasyWorshipRtf, textFromEasyWorshipRtf, textFromEasyWorshipTaggedRtf } from './easyWorship'
import { editTextRuns } from './slideDesign'
import { replaceAlertTokenMarkers } from './alertTokenEditing'

function replaceNativeTags(tokens: AlertToken[]) {
  const lookup = new Map(tokens.filter((token) => token.uid).map((token) => [normalizedTokenId(token.uid!), token]))
  return (uid: string, fallback: string) => {
    const token = lookup.get(normalizedTokenId(uid))
    if (!token || token.type == null || nativeAlertTokenNames[token.type] === undefined) return fallback
    if (token.type === 0 && token.value == null) return fallback
    return alertTokenMarker(token, tokens)
  }
}

export function recoverAlertTagText(rtf: string, tokens: AlertToken[]) {
  return textFromEasyWorshipTaggedRtf(rtf, replaceNativeTags(tokens))
}

export function importedAlertRuns(template: Pick<AlertTemplate, 'source' | 'tokenSettings'> | undefined, text: string) {
  if (!template?.source) return undefined
  const { rtf, tokens } = template.source
  const original = alertRunsFromEasyWorshipRtf(rtf, replaceNativeTags(tokens))
  const styled = template.tokenSettings
    ? replaceAlertTokenMarkers(original.text, tokens, template.tokenSettings.tokens, original.runs) : original
  return editTextRuns(styled.runs, styled.text, text)
}

/** Older imported rows stored the visible RTF text without EasyWorship's tag positions. */
export function restoreUneditedNativeTags(template: AlertTemplate) {
  const { source } = template
  if (template.runs || template.tokenSettings || !source?.tokens.length || template.text !== textFromEasyWorshipRtf(source.rtf)) return template
  return { ...template, text: recoverAlertTagText(source.rtf, source.tokens) }
}
