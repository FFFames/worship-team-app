import { changedOutputAppearance, decodeSavedOutputSettings, defaultOutputSettings, outputAppearanceKeys, sameScriptureOutput,
  type AlphaSource, type OutputAppearance, type OutputAppearanceKey, type OutputSettings, type ScriptureOutputSettings } from './outputSettings'
import { foldbackContentRoles, type FoldbackServiceSettings } from './foldbackAppearance'

export const outputSettingsStorageKey = 'worshipteam.outputSettings.v1'
export const outputSettingsChanged = 'worshipteam:output-settings'
const scriptureOutputs = ['live', 'alternate'] as const

export function storedOutputSettings() {
  try { return localStorage.getItem(outputSettingsStorageKey) }
  catch { return null }
}

export function readOutputSettings() {
  return decodeSavedOutputSettings(storedOutputSettings())
}

function readSnapshot() {
  const stored = storedOutputSettings()
  const settings = decodeSavedOutputSettings(stored)
  const configured = new Set(changedOutputAppearance(defaultOutputSettings, settings))
  const configuredScripture = new Set(scriptureOutputs.filter((output) => !sameScriptureOutput(defaultOutputSettings.scripture[output], settings.scripture[output])))
  try {
    const previous = JSON.parse(stored ?? 'null')
    if (Array.isArray(previous?.configuredAppearance)) {
      for (const key of outputAppearanceKeys) if (previous.configuredAppearance.includes(key)) configured.add(key)
    }
    for (const output of scriptureOutputs) {
      if (Array.isArray(previous?.configuredScripture) ? previous.configuredScripture.includes(output) : configured.has('scripture')) {
        configuredScripture.add(output)
      }
    }
  } catch { /* Invalid saved settings use the application defaults. */ }
  return { settings, configured, configuredScripture }
}

function writeSettings(settings: OutputSettings, configuredAppearance: Iterable<OutputAppearanceKey>, configuredScripture: Iterable<AlphaSource>) {
  localStorage.setItem(outputSettingsStorageKey, JSON.stringify({ ...settings, configuredAppearance: [...configuredAppearance],
    configuredScripture: [...configuredScripture] }))
  window.dispatchEvent(new Event(outputSettingsChanged))
}

export function saveOutputSettings(settings: OutputSettings, touched: Iterable<OutputAppearanceKey> = []) {
  const current = readSnapshot()
  const touchedKeys = new Set(touched)
  const changes = scriptureOutputs.filter((output) => touchedKeys.has('scripture')
    || !sameScriptureOutput(current.settings.scripture[output], settings.scripture[output]))
  writeSettings(settings, new Set([...current.configured, ...changedOutputAppearance(current.settings, settings), ...touchedKeys]),
    new Set([...current.configuredScripture, ...changes]))
}

export function restoreScriptureOutputSettings(output: AlphaSource, settings: ScriptureOutputSettings) {
  const current = readSnapshot()
  if (current.configuredScripture.has(output)) return false
  const scripture = { ...current.settings.scripture, [output]: settings }
  writeSettings({ ...current.settings, scripture }, new Set([...current.configured, 'scripture']),
    new Set([...current.configuredScripture, output]))
  return true
}

export function readOutputAppearanceBackup(): OutputAppearance {
  const { settings, configured } = readSnapshot()
  return Object.fromEntries(outputAppearanceKeys.filter((key) => configured.has(key)).map((key) => [key, settings[key]]))
}

function completeFoldbackService(current: FoldbackServiceSettings, incoming: FoldbackServiceSettings): FoldbackServiceSettings | undefined {
  // An explicitly reset group and a deliberately emptied list stay as configured on this device.
  if (!Object.keys(current).length) return undefined
  const { intervals, ...style } = current
  const { intervals: incomingIntervals, ...incomingStyle } = incoming
  const fillStyles = !Object.keys(style).length && Object.values(incomingStyle).some((value) => value !== undefined)
  const fillIntervals = intervals === undefined && Boolean(incomingIntervals?.length)
  if (!fillStyles && !fillIntervals) return undefined
  return { ...(fillStyles ? incomingStyle : style), intervals: fillIntervals ? incomingIntervals : intervals }
}

export function restoreOutputAppearanceBackup(backup: OutputAppearance): number {
  const { settings, configured, configuredScripture } = readSnapshot()
  const keys = outputAppearanceKeys.filter((key) => backup[key] !== undefined && !configured.has(key))
  const restored = Object.fromEntries(keys.map((key) => [key, backup[key]]))
  if (backup.foldbackService && configured.has('foldbackService')) {
    const completed = completeFoldbackService(settings.foldbackService, backup.foldbackService)
    if (completed) {
      restored.foldbackService = completed
      keys.push('foldbackService')
    }
  }
  if (backup.foldbackContent && configured.has('foldbackContent') && Object.keys(settings.foldbackContent).length) {
    const missing = foldbackContentRoles.filter((role) => settings.foldbackContent[role] === undefined && backup.foldbackContent?.[role] !== undefined)
    if (missing.length) {
      restored.foldbackContent = { ...settings.foldbackContent, ...Object.fromEntries(missing.map((role) => [role, backup.foldbackContent?.[role]])) }
      keys.push('foldbackContent')
    }
  }
  if (keys.length) {
    writeSettings({ ...settings, ...restored }, new Set([...configured, ...keys]),
      keys.includes('scripture') ? scriptureOutputs : configuredScripture)
  }
  return keys.length
}
