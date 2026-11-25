import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { decodeNurserySettings, defaultNurserySettings, nurseryNoticeVisible, nurseryOutputs, nurserySettingsChanged,
  nurserySettingsStorageKey, storedNurserySettings, type NurseryDisplay, type NurseryNotice, type NurseryOutput } from '../utils/nurseryAlerts'

function subscribe(refresh: () => void) {
  function refreshStorage(event: StorageEvent) {
    if (event.key === nurserySettingsStorageKey || event.key === null) refresh()
  }
  window.addEventListener('storage', refreshStorage)
  window.addEventListener(nurserySettingsChanged, refresh)
  return () => {
    window.removeEventListener('storage', refreshStorage)
    window.removeEventListener(nurserySettingsChanged, refresh)
  }
}

export function useNurserySettings() {
  const stored = useSyncExternalStore(subscribe, storedNurserySettings)
  return useMemo(() => ({ ...defaultNurserySettings, ...decodeNurserySettings(stored) }), [stored])
}

type NurseryCalls = Record<NurseryOutput, NurseryNotice[]>
const emptyCalls: NurseryCalls = { live: [], alternate: [] }

export function useNurseryAlerts(publish: (output: NurseryOutput, display: NurseryDisplay | null) => void, session?: string) {
  const settings = useNurserySettings()
  const [state, setState] = useState<{ session?: string; calls: NurseryCalls }>({ session, calls: emptyCalls })
  const displayed = useRef({ live: false, alternate: false })
  const calls = state.session === session ? state.calls : emptyCalls

  useEffect(() => {
    function clearOnExit() {
      for (const output of nurseryOutputs) {
        if (displayed.current[output]) publish(output, null)
        displayed.current[output] = false
      }
      setState({ session, calls: emptyCalls })
    }
    window.addEventListener('pagehide', clearOnExit)
    return () => window.removeEventListener('pagehide', clearOnExit)
  }, [publish, session])

  useEffect(() => {
    const now = Date.now()
    const visible = (output: NurseryOutput) => settings[output].enabled ? calls[output].filter((notice) => nurseryNoticeVisible(notice, now)) : []
    const live = visible('live')
    const alternate = visible('alternate')
    for (const [output, notices] of [['live', live], ['alternate', alternate]] as const) {
      if (notices.length || displayed.current[output]) publish(output, notices.length ? { style: settings[output], notices } : null)
      displayed.current[output] = notices.length > 0
    }
    if (nurseryOutputs.some((output) => !settings[output].enabled && calls[output].length)) {
      setState({ session, calls: { live: settings.live.enabled ? calls.live : [], alternate: settings.alternate.enabled ? calls.alternate : [] } })
    }
    const expiresAt = Math.min(...[...live, ...alternate].flatMap(({ expiresAt }) => expiresAt ?? []))
    if (!Number.isFinite(expiresAt)) return
    const timer = window.setTimeout(() => {
      const at = Date.now()
      setState((current) => current.session !== session ? current : { session, calls: {
        live: current.calls.live.filter((notice) => nurseryNoticeVisible(notice, at)),
        alternate: current.calls.alternate.filter((notice) => nurseryNoticeVisible(notice, at)),
      } })
    }, Math.max(0, expiresAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [calls, publish, session, settings])

  function add(code: string) {
    const now = Date.now()
    function addFor(output: NurseryOutput, notices: NurseryNotice[]) {
      const { enabled, seconds } = settings[output]
      if (!enabled) return []
      const next = notices.filter((notice) => notice.code !== code && nurseryNoticeVisible(notice, now))
      return [...next, { code, expiresAt: seconds === null ? null : now + seconds * 1000 }]
    }
    setState((current) => {
      const previous = current.session === session ? current.calls : emptyCalls
      return { session, calls: { live: addFor('live', previous.live), alternate: addFor('alternate', previous.alternate) } }
    })
  }

  function remove(code: string) {
    setState((current) => current.session !== session ? current : { session, calls: {
      live: current.calls.live.filter((notice) => notice.code !== code),
      alternate: current.calls.alternate.filter((notice) => notice.code !== code),
    } })
  }

  const codes = [...new Set(nurseryOutputs.flatMap((output) => settings[output].enabled
    ? calls[output].filter((notice) => nurseryNoticeVisible(notice, Date.now())).map(({ code }) => code) : []))]
  return { codes, enabled: nurseryOutputs.some((output) => settings[output].enabled), add, remove,
    clear: () => setState({ session, calls: emptyCalls }) }
}
