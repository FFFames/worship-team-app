import { useCallback, useLayoutEffect, useRef } from 'react'
import type { MediaClip } from '../types/media'
import { attachMediaClip } from '../utils/mediaClip'

export function useMediaClip(clip: MediaClip | undefined, repeat = false, onEnded?: () => void) {
  const cleanup = useRef<(() => void) | undefined>(undefined)
  const notify = useRef(onEnded)
  const startSeconds = clip?.startSeconds
  const endSeconds = clip?.endSeconds
  const endTrimSeconds = clip?.endTrimSeconds
  const hasMarks = startSeconds !== undefined || endSeconds !== undefined || endTrimSeconds !== undefined
  const repeatClip = hasMarks && repeat
  useLayoutEffect(() => { notify.current = onEnded }, [onEnded])

  return useCallback((media: HTMLMediaElement | null) => {
    cleanup.current?.()
    cleanup.current = undefined
    if (!media) return
    const completed = () => notify.current?.()
    if (hasMarks) {
      cleanup.current = attachMediaClip(media, { startSeconds, endSeconds, endTrimSeconds }, repeatClip, completed)
    } else {
      media.addEventListener('ended', completed)
      cleanup.current = () => media.removeEventListener('ended', completed)
    }
  }, [startSeconds, endSeconds, endTrimSeconds, hasMarks, repeatClip])
}
