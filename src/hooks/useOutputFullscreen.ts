import { useCallback, useEffect, useState } from 'react'

export function useOutputFullscreen() {
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState(false)

  const toggleFullscreen = useCallback(async () => {
    setFullscreenError(false)
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    } catch { setFullscreenError(true) }
  }, [])

  useEffect(() => {
    function syncFullscreen() { setFullscreen(Boolean(document.fullscreenElement)) }
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'f' || event.repeat || event.altKey || event.ctrlKey || event.metaKey
        || (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.matches('input, textarea, select')))) return
      event.preventDefault()
      void toggleFullscreen()
    }
    syncFullscreen()
    document.addEventListener('fullscreenchange', syncFullscreen)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen)
      window.removeEventListener('keydown', onKey)
    }
  }, [toggleFullscreen])

  return { fullscreen, fullscreenError, toggleFullscreen }
}
