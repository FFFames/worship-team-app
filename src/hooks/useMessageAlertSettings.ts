import { useMemo, useSyncExternalStore } from 'react'
import { decodeMessageAlertSettings, messageAlertSettingsChanged, messageAlertSettingsKey, storedMessageAlertSettings } from '../utils/messageAlertSettings'

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === messageAlertSettingsKey || event.key === null) notify()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(messageAlertSettingsChanged, notify)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(messageAlertSettingsChanged, notify)
  }
}

export function useMessageAlertSettings() {
  const serialized = useSyncExternalStore(subscribe, storedMessageAlertSettings)
  return useMemo(() => decodeMessageAlertSettings(serialized), [serialized])
}
