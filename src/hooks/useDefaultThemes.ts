import { useMemo, useSyncExternalStore } from 'react'
import { decodeDefaultThemes, defaultThemesChanged, defaultThemesStorageKey } from '../utils/defaultThemes'

function currentValue() {
  try {
    return localStorage.getItem(defaultThemesStorageKey)
  } catch {
    return null
  }
}

function subscribe(listener: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key === defaultThemesStorageKey || event.key === null) listener()
  }
  window.addEventListener('storage', handleStorage)
  window.addEventListener(defaultThemesChanged, listener)
  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(defaultThemesChanged, listener)
  }
}

export function useDefaultThemes() {
  const value = useSyncExternalStore(subscribe, currentValue)
  return useMemo(() => decodeDefaultThemes(value), [value])
}
