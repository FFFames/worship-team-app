import { hasMidiInputConfiguration, readMidiPreferences, saveMidiPreferences, type MidiPreferences } from './midiControls'
import { hasMidiOutputConfiguration, readMidiOutputPreferences, saveMidiOutputPreferences, type MidiOutputPreferences } from './midiOutput'
import { hasSavedKeyboardProfile, readKeyboardProfile, saveKeyboardProfile, type KeyboardProfile } from './presentationKeyboard'

export type PresentationControlBackup = {
  keyboard?: KeyboardProfile | null
  midiInput?: Pick<MidiPreferences, 'channel' | 'bindings' | 'followMaster'>
  midiOutput?: Pick<MidiOutputPreferences, 'channel' | 'notes' | 'groups' | 'forwardInput'>
}

export function readPresentationControlBackup(): PresentationControlBackup {
  const input = readMidiPreferences()
  const output = readMidiOutputPreferences()
  return {
    ...(hasSavedKeyboardProfile() ? { keyboard: readKeyboardProfile() ?? null } : {}),
    ...(hasMidiInputConfiguration(input) ? {
      midiInput: { channel: input.channel, bindings: input.bindings, followMaster: input.followMaster },
    } : {}),
    ...(hasMidiOutputConfiguration(output) ? {
      midiOutput: { channel: output.channel, notes: output.notes, groups: output.groups, forwardInput: output.forwardInput },
    } : {}),
  }
}

export function restorePresentationControlBackup(backup: PresentationControlBackup): number {
  let restored = 0
  const { keyboard, midiInput, midiOutput } = backup
  if (keyboard !== undefined && !hasSavedKeyboardProfile()) {
    saveKeyboardProfile(keyboard ?? undefined)
    restored++
  }
  const input = readMidiPreferences()
  if (midiInput && !hasMidiInputConfiguration(input)) {
    saveMidiPreferences({ ...midiInput, inputId: input.inputId, configured: true })
    restored++
  }
  const output = readMidiOutputPreferences()
  if (midiOutput && !hasMidiOutputConfiguration(output)) {
    saveMidiOutputPreferences({ ...midiOutput, outputId: output.outputId, configured: true })
    restored++
  }
  return restored
}
