/** Plays an assigned display logo independently of the current playlist. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePresentationMedia } from '../hooks/usePresentationMedia'
import type { DefaultTheme } from '../utils/defaultThemes'
import { readLibraryMedia } from '../utils/mediaLibrary'
import { defaultMediaMuted, presentationMediaKey, type PresentationSoundtrack } from '../utils/presentationChannel'
import { getSlideAdvance, type MediaOutcome } from '../utils/slidePlayback'
import { LayeredSlide } from './LayeredSlide'

function LogoSlide({ logo, index, onAdvance, audio, preview, transparent, web }: {
  logo: DefaultTheme; index: number; onAdvance: (index: number) => void
  audio: boolean; preview?: boolean; transparent?: boolean; web?: 'passive' | 'mask'
}) {
  const slide = logo.slides[index]
  const [ended, setEnded] = useState<Set<string>>(new Set())
  const advance = preview ? null : getSlideAdvance(logo.slides, index, logo.looping)
  const finished = useCallback((id: string, outcome: MediaOutcome) => {
    if (outcome !== 'ended') return
    setEnded((current) => current.has(id) ? current : new Set([...current, id]))
  }, [])
  const track = preview ? undefined : slide.design.soundtracks?.find((asset) => asset.libraryId)
  const soundtrack: PresentationSoundtrack | null = track?.libraryId
    ? { kind: 'audio', libraryId: track.libraryId, clip: track.clip, playback: track.playback, role: track.role } : null
  const trackKey = soundtrack && presentationMediaKey(soundtrack)
  const muted = !audio || !soundtrack || defaultMediaMuted(soundtrack)
  const trackPlayback = useMemo(() => trackKey ? { key: trackKey, playing: true, muted } : null, [muted, trackKey])
  const sound = usePresentationMedia(soundtrack, trackPlayback,
    { loop: !advance?.afterMedia && track?.repeat, onEnded: () => finished('logo-soundtrack', 'ended') })
  const videoIds = slide.design.layers.filter((layer) => layer.kind === 'media' && layer.asset.kind === 'video').map(({ id }) => id)
  const pendingMedia = videoIds.some((id) => !ended.has(id)) || Boolean(track && !ended.has('logo-soundtrack'))
  const next = advance?.index
  const delay = advance?.delay
  const ready = advance && (!advance.afterMedia || (!pendingMedia && (videoIds.length > 0 || track || advance.delay > 0)))

  useEffect(() => {
    if (!ready || next === undefined || delay === undefined) return
    const timer = window.setTimeout(() => onAdvance(next), delay)
    return () => window.clearTimeout(timer)
  }, [ready, next, delay, onAdvance])

  return <div className="relative h-full w-full" data-logo-slide={slide.id}>
    <LayeredSlide design={slide.design} preview={preview} transparent={transparent} web={web}
      videoPlayback={{ loop: advance?.afterMedia ? false : slide.playback?.loop, audio: audio && !track,
        audioPrompt: audio, onOutcome: advance?.afterMedia ? finished : undefined }} />
    {sound.url && <audio ref={sound.bindElement} src={sound.url} loop={sound.nativeLoop} className="hidden" />}
    {sound.locked && audio && <button type="button" className="btn-secondary absolute bottom-3 left-3" onClick={sound.unlock}>เปิดเสียงโลโก้</button>}
  </div>
}

export function LogoScreen({ logo, fallback, preview, audio = false, transparent, web }: {
  logo?: DefaultTheme; fallback: string; preview?: boolean; audio?: boolean; transparent?: boolean; web?: 'passive' | 'mask'
}) {
  const [index, setIndex] = useState(0)
  const [available, setAvailable] = useState<string>()
  const layers = logo?.slides.length === 1 ? logo.slides[0].design.layers : undefined
  const assetId = layers?.length === 1 && layers[0].kind === 'media' ? layers[0].asset.libraryId : undefined
  useEffect(() => {
    if (!assetId) return
    let active = true
    void readLibraryMedia(assetId).then((blob) => {
      if (blob && active) setAvailable(assetId)
    }).catch(() => {})
    return () => { active = false }
  }, [assetId])
  return logo?.slides.length && (!assetId || assetId === available)
    ? <LogoSlide key={index} logo={logo} index={index} onAdvance={setIndex} preview={preview} audio={audio} transparent={transparent} web={web} />
    : <img src={fallback} alt="Welcome" className="h-full w-full object-contain" />
}
