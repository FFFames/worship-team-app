/** Reads the browser alert library and refreshes when another editor or import updates it. */

import { useEffect, useState } from 'react'
import { alertLibraryChannel, listAlertResourceCatalogs, listAlertTemplates } from '../utils/alertTemplateLibrary'

function useAlertLibrary<T>(list: () => Promise<T[]>) {
  const [items, setItems] = useState<T[]>([])
  const [error, setError] = useState(false)
  useEffect(() => {
    let revision = 0
    function refresh() {
      const current = ++revision
      void list().then((items) => {
        if (revision !== current) return
        setItems(items)
        setError(false)
      }).catch(() => { if (revision === current) setError(true) })
    }
    const channel = new BroadcastChannel(alertLibraryChannel)
    channel.onmessage = refresh
    refresh()
    return () => { revision++; channel.close() }
  }, [list])
  return { items, error }
}

export function useAlertTemplates() {
  const { items, error } = useAlertLibrary(listAlertTemplates)
  return { templates: items, error }
}

export function useAlertResourceCatalogs() {
  return useAlertLibrary(listAlertResourceCatalogs)
}
