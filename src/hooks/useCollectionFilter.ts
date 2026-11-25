/** Loads saved collections for a library and keeps the filter in the current URL. */

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { CollectionResource, EasyWorshipCollectionSet } from '../utils/easyWorshipCollections'
import { collectionLibraryChannel, collectionOptions, listEasyWorshipCollectionSets } from '../utils/collectionLibrary'

const libraryResources: Record<'songs' | 'media' | 'designs' | 'scripture', readonly CollectionResource[]> = {
  songs: ['songs'], media: ['media'], designs: ['presentations', 'themes'], scripture: ['scripture'],
}

export function useLibraryCollections(library: keyof typeof libraryResources, enabled = true) {
  const [sets, setSets] = useState<EasyWorshipCollectionSet[]>([])
  const [ready, setReady] = useState(false)
  const [version, setVersion] = useState(0)
  const options = useMemo(() => collectionOptions(sets, libraryResources[library]), [sets, library])

  useEffect(() => {
    if (!enabled) return
    let revision = 0
    function read() {
      const current = ++revision
      void listEasyWorshipCollectionSets().then((sets) => {
        if (revision === current) setSets(sets)
      }).catch(() => {
        // The base library still works when browser storage is disabled.
      }).finally(() => { if (revision === current) setReady(true) })
    }
    const channel = new BroadcastChannel(collectionLibraryChannel)
    channel.onmessage = read
    read()
    return () => { revision++; channel.close() }
  }, [enabled, version])

  return { options, ready, refresh: () => setVersion((value) => value + 1) }
}

export function useCollectionFilter(library: keyof typeof libraryResources) {
  const [params, setParams] = useSearchParams()
  const { options, ready, refresh } = useLibraryCollections(library)
  const selected = options.find((option) => option.id === params.get('collection'))

  function select(id: string) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (id) next.set('collection', id)
      else next.delete('collection')
      return next
    }, { replace: true })
  }

  return { options, selected, select, refresh, ready }
}
