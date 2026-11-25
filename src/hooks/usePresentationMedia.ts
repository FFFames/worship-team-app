/** Resolves and controls a single browser-local audience media element. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { presentationMediaKey, type PresentationMedia, type PresentationPlayback } from '../utils/presentationChannel'
import { readPlaylistMedia } from '../utils/scheduleMedia'
import { useMediaClip } from './useMediaClip'
import { mediaClipKey } from '../utils/mediaClip'
import { mediaVolume } from '../utils/mediaPlayback'

type PlaybackOptions = { loop?: boolean; onEnded?: () => void; onUnavailable?: () => void }

export function usePresentationMedia(media: PresentationMedia | null, playback: PresentationPlayback | null, options: PlaybackOptions = {}) {
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null)
  const [lockedKey, setLockedKey] = useState<string | null>(null)
  const libraryId = media && 'libraryId' in media ? media.libraryId : undefined
  const playlistId = media && 'playlistId' in media ? media.playlistId : undefined
  const archivePath = media && 'archivePath' in media ? media.archivePath : undefined
  const assetKey = libraryId ? `library:${libraryId}` : playlistId && archivePath ? `schedule:${playlistId}:${archivePath}` : undefined
  const playbackKey = media ? presentationMediaKey(media) : undefined
  const volume = mediaVolume(media?.playback ?? media?.dvdPlayback)
  const url = loaded?.key === assetKey ? loaded?.url : undefined
  const elementRef = useRef<HTMLMediaElement | null>(null)
  const { loop, onEnded, onUnavailable } = options
  const bindClip = useMediaClip(media?.clip, loop, onEnded)
  const unavailable = useRef(onUnavailable)
  useEffect(() => { unavailable.current = onUnavailable }, [onUnavailable])

  const bindElement = useCallback((element: HTMLMediaElement | null) => {
    if (elementRef.current !== element) elementRef.current?.pause()
    elementRef.current = element
    bindClip(element)
  }, [bindClip])

  useEffect(() => {
    if (!assetKey) {
      setLoaded(null)
      return
    }
    let cancelled = false
    let objectUrl: string | undefined
    const read = readPlaylistMedia(playlistId, archivePath, libraryId)
    void read.then((blob) => {
      if (cancelled) return
      if (!blob) { unavailable.current?.(); return }
      objectUrl = URL.createObjectURL(blob)
      setLoaded({ key: assetKey, url: objectUrl })
    }).catch(() => { if (!cancelled) unavailable.current?.() })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [assetKey, libraryId, playlistId, archivePath])

  useEffect(() => {
    const element = elementRef.current
    if (!url || !element || !playback || playback.key !== playbackKey) return
    element.volume = volume
    element.muted = playback.muted
    setLockedKey(null)
    if (!playback.playing) {
      element.pause()
      return
    }
    let cancelled = false
    void element.play().catch((error: unknown) => {
      if (!cancelled && error instanceof DOMException && error.name === 'NotAllowedError') setLockedKey(playback.key)
    })
    return () => { cancelled = true }
  }, [url, playback, playbackKey, volume, bindClip])

  return {
    url, bindElement, playbackKey, nativeLoop: !mediaClipKey(media?.clip) && Boolean(loop),
    locked: playback?.playing === true && lockedKey === playbackKey,
    unlock: () => { void elementRef.current?.play().then(() => setLockedKey(null)).catch(() => {}) },
  }
}
