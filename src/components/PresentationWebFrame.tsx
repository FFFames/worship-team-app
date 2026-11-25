/** Renders a webpage in an isolated browsing context. */

import { useCallback, type CSSProperties } from 'react'
import { powerPointOnlineVideoUrl } from '../utils/powerPoint/onlineVideo'

export function PresentationWebFrame({ url, hideScrollbars, style, onlineVideo, passive = false, title = passive ? 'เว็บบนจอแสดงผล' : 'เว็บบนจอผู้ชม' }: {
  url: string; hideScrollbars?: boolean; style?: CSSProperties; onlineVideo?: boolean; passive?: boolean; title?: string
}) {
  const setFrame = useCallback((frame: HTMLIFrameElement | null) => {
    if (frame) frame.inert = passive
  }, [passive])
  const permissions = "camera 'none'; microphone 'none'; geolocation 'none'"
  let src = url
  if (onlineVideo) {
    const provider = powerPointOnlineVideoUrl(url)
    if (!provider || passive) return null
    const player = new URL(provider)
    if (player.origin === window.location.origin) return null
    player.searchParams.set('autoplay', '1')
    if (player.hostname !== 'player.vimeo.com') player.searchParams.set('playsinline', '1')
    src = player.href
  }
  return <iframe ref={setFrame} title={title} src={src} className={`absolute border-0 bg-black ${style ? '' : 'inset-0 h-full w-full'}`}
    style={passive ? { ...style, pointerEvents: 'none' } : style} tabIndex={passive ? -1 : undefined}
    scrolling={hideScrollbars ? 'no' : undefined}
    sandbox={onlineVideo ? 'allow-scripts allow-same-origin' : 'allow-scripts allow-forms'}
    allow={onlineVideo ? permissions + '; autoplay; fullscreen; encrypted-media' : passive ? permissions + "; autoplay 'none'" : permissions}
    referrerPolicy={onlineVideo ? 'strict-origin-when-cross-origin' : 'no-referrer'} />
}
