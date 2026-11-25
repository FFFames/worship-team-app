/** Opens and drives an independent audience window for a resource library. */

import { useCallback, useEffect, useRef } from 'react'
import { createControlChannel, type PresentationMessage } from '../utils/presentationChannel'
import type { MediaOutcome } from '../utils/slidePlayback'
import { loadOutputDisplays, openOutputWindow } from '../utils/outputWindows'

type PresenterWindow = {
  session: string
  channel: ReturnType<typeof createControlChannel>
  window: Window | null
}

export function useStandalonePresenter(
  name: 'scripture' | 'media' | 'design' | 'song' | 'web',
  onMediaComplete?: (id: string, outcome: MediaOutcome) => void,
  onCameraStatus?: (status: string | null) => void,
  onSongProjectionFailure?: () => void,
) {
  const output = useRef<PresenterWindow | null>(null)

  useEffect(() => {
    void loadOutputDisplays()
    const stopLiveInput = () => output.current?.channel.stopLiveInputs()
    window.addEventListener('pagehide', stopLiveInput)
    return () => {
      window.removeEventListener('pagehide', stopLiveInput)
      stopLiveInput()
      output.current?.channel.close()
      output.current = null
    }
  }, [])

  return useCallback((message: PresentationMessage, openWindow = true) => {
    if (!openWindow && (!output.current?.window || output.current.window.closed)) return false

    if (!output.current) {
      const session = crypto.randomUUID()
      output.current = { session, channel: createControlChannel(session, onCameraStatus, undefined, onMediaComplete, onSongProjectionFailure), window: null }
    }
    if ((!output.current.window || output.current.window.closed) && openWindow) {
      output.current.window = openOutputWindow('live', `/presenter?session=${output.current.session}`, `worshipteam-${name}`)
    }
    if (openWindow && !output.current.window) throw new Error('เบราว์เซอร์ไม่เปิดหน้าต่างจอผู้ชม กรุณาอนุญาตหน้าต่างป๊อปอัปแล้วลองอีกครั้ง')

    output.current.channel.send(message)
    return true
  }, [name, onMediaComplete, onCameraStatus, onSongProjectionFailure])
}
