import { useMemo, useSyncExternalStore } from 'react'
import { decodeSavedOutputSettings } from '../utils/outputSettings'
import { outputSettingsChanged, outputSettingsStorageKey, storedOutputSettings } from '../utils/outputSettingsStorage'

function subscribe(listener: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key === outputSettingsStorageKey || event.key === null) listener()
  }
  window.addEventListener('storage', handleStorage)
  window.addEventListener(outputSettingsChanged, listener)
  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(outputSettingsChanged, listener)
  }
}

export function useOutputSettings() {
  const value = useSyncExternalStore(subscribe, storedOutputSettings)
  return useMemo(() => decodeSavedOutputSettings(value), [value])
}
