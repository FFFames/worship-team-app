/** PresenterScreen — Fullscreen display window for live presentation
 *
 * Design system:
 * - Dark theme with warm-tinted neutrals (OKLCH)
 * - Accent: warm emerald green used ≤10% of surface
 * - Balanced, centered layouts (NEVER left-leaning)
 * - Kanit font for display/body, Source Code Pro for chords
 * - Exponential ease-out motion curves only
 */

import { useCallback, useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  createPresenterChannel,
  defaultMediaMuted,
  presentationMediaKey,
  type CueMediaPlayback,
  type PresentationMedia,
  type PresentationMessage,
  type PresentationPlayback,
  type PresentationSoundtrack,
} from '../utils/presentationChannel'
import { usePresentationMedia } from '../hooks/usePresentationMedia'
import { mediaObjectFit } from '../utils/mediaPlayback'
import { useOutputSettings } from '../hooks/useOutputSettings'
import { useMessageAlertSettings } from '../hooks/useMessageAlertSettings'
import { useOutputFullscreen } from '../hooks/useOutputFullscreen'
import { useAudienceKeyboard } from '../hooks/usePresentationKeyboard'
import { PresentationVideo } from '../components/PresentationVideo'
import { LogoScreen } from '../components/LogoScreen'
import { splitVideoAlpha } from '../utils/videoAlpha'
import { LayeredSlide } from '../components/LayeredSlide'
import { outputTextInsetsStyle, ParagraphTextRuns, StyledTextRuns } from '../components/StyledTextRuns'
import type { DesignTextRun } from '../types/slideDesign'
import { lyricRunsByLine } from '../utils/songLyricFormatting'
import { PresentationCamera } from '../components/PresentationCamera'
import { PresentationWebFrame } from '../components/PresentationWebFrame'
import { OutputAlertBanner } from '../components/OutputAlertBanner'
import { NurseryAlertBanner } from '../components/NurseryAlertBanner'
import type { NurseryDisplay } from '../utils/nurseryAlerts'
import type { OutputAlert } from '../types/alertTemplate'
import { presentationWebUrl } from '../utils/livePresentation'
import { outputInsets } from '../utils/outputSettings'
import { withoutCanvasBackground } from '../utils/slideDesign'
import { createSlideTransitionPlayer } from '../utils/slideTransitions'
import type { SlideDesign } from '../types/slideDesign'
import { recordSongProjection } from '../utils/songHistoryLibrary'
import type { SongProjection } from '../utils/songProjection'
import { scriptureOutputDesign, scriptureOutputLayout, scriptureOutputText, type ScriptureReference } from '../utils/scriptureOutput'

type DisplayMode = 'lyrics' | 'design' | 'welcome' | 'black'

export default function PresenterScreen() {
  const settings = useOutputSettings()
  const [searchParams] = useSearchParams()
  const isAlternate = searchParams.get('output') === 'alternate'
  const output = isAlternate ? 'alternate' : 'live'
  const messageAppearance = useMessageAlertSettings()[output]
  const isKey = searchParams.get('signal') === 'key'
  const isNdi = searchParams.get('signal') === 'ndi'
  const ndiAudio = isNdi && searchParams.get('ndiAudio') === '1'
  const keying = settings.alphaSource === output
  const silentFeed = isAlternate || isKey
  const cleanOutput = keying || isKey || isNdi
  const { fullscreen, fullscreenError, toggleFullscreen } = useOutputFullscreen()
  const margins = settings[output]
  const sessionParam = searchParams.get('session') ?? ''
  const session = /^[a-f\d-]{36}$/i.test(sessionParam) ? sessionParam : undefined
  const keyboard = searchParams.get('keyboard') ?? ''
  useAudienceKeyboard(!isAlternate && !isKey && !isNdi && /^[a-f\d-]{36}$/i.test(keyboard) ? keyboard : undefined)
  const [sourceMode, setMode] = useState<DisplayMode>(isAlternate || isNdi ? 'black' : 'welcome')
  const [outputBlanked, setBlanked] = useState(false)
  const blanked = (isAlternate && outputBlanked) || (isKey && !keying)
  const audioOff = isKey || ((isAlternate || isNdi) && !ndiAudio)
  const muteSignal = audioOff || (isNdi && blanked)
  const [lyrics, setLyrics] = useState('')
  const [lyricRuns, setLyricRuns] = useState<DesignTextRun[]>()
  const [subtitle, setSubtitle] = useState('')
  const [scripture, setScripture] = useState<ScriptureReference>()
  const [songLabel, setSongLabel] = useState<string>()
  const [sourceBackground, setBackgroundUrl] = useState<string | null>(null)
  const [welcomeImageUrl, setWelcomeImageUrl] = useState<string>('/welcome.png')
  const [welcome, setWelcome] = useState<Extract<PresentationMessage, { type: 'SHOW_WELCOME' }>>()
  const [textVerticalOffset, setTextVerticalOffset] = useState<number>(50)
  const [textHidden, setTextHidden] = useState(false)
  const [foregroundCleared, setForegroundCleared] = useState(false)
  const [alert, setAlert] = useState<OutputAlert | null>(null)
  const [sourceMedia, setMedia] = useState<PresentationMedia | null>(null)
  const [nursery, setNursery] = useState<NurseryDisplay | null>(null)
  const [soundtrack, setSoundtrack] = useState<PresentationSoundtrack | null>(null)
  const [transitionSound, setTransitionSound] = useState<PresentationSoundtrack | null>(null)
  const [finishedTransitionSound, setFinishedTransitionSound] = useState<string>()
  const [sourceDesign, setDesign] = useState<{ design: SlideDesign; playlistId?: string } | null>(null)
  const [blendMedia, setBlendMedia] = useState(false)
  const [alternateCue, setAlternateCue] = useState<Extract<PresentationMessage, { type: 'SHOW_DESIGN' }>['alternate']>()
  const [cuePlayback, setCuePlayback] = useState<CueMediaPlayback>()
  const [songProjection, setSongProjection] = useState<SongProjection>()
  const recordedProjection = useRef<string | undefined>(undefined)
  const [playback, setPlayback] = useState<PresentationPlayback | null>(null)
  const [trackPlayback, setTrackPlayback] = useState<PresentationPlayback | null>(null)
  const acceptBackground = !(isKey && !keying) && (!isAlternate || settings.alternateLayers.background)
  const backgroundUrl = acceptBackground ? sourceBackground : null
  const override = alternateCue?.mediaOverride
  const mediaHidden = (isKey && (sourceMedia?.kind === 'audio' || !keying))
    || (isAlternate && ((sourceMedia?.kind === 'audio' && !ndiAudio) || Boolean(override && !settings.alternateLayers[override])))
  const media = mediaHidden ? null : sourceMedia
  const hideMedia = foregroundCleared && media?.role !== 'background'
  const hideSoundtrack = foregroundCleared && soundtrack?.role !== 'background'
  const activeSoundtrack = hideSoundtrack ? null : soundtrack
  const hideText = textHidden || foregroundCleared
  const mediaAlpha = media?.kind === 'video' ? splitVideoAlpha(media.alphaMode) : undefined
  const useOriginal = isAlternate && alternateCue?.originalDesign
    && (mediaHidden || (alternateCue.designBackgroundOverride && !settings.alternateLayers.background))
  const design = useOriginal ? alternateCue.originalDesign : sourceDesign
  const mode = useOriginal ? 'design' : sourceMode
  const scriptureSettings = settings.scripture[output]
  const scriptureLayout = useMemo(() => scripture && scriptureOutputLayout(scripture, scriptureSettings), [scripture, scriptureSettings])
  const outputDesign = useMemo(() => design && scriptureLayout ? scriptureOutputDesign(design.design, scriptureLayout) : design?.design,
    [design, scriptureLayout])
  const caption = scriptureLayout?.reference ?? subtitle
  const captionText = scriptureLayout?.referenceRuns ? <StyledTextRuns runs={scriptureLayout.referenceRuns} /> : caption
  const captionSpacing = outputTextInsetsStyle(scriptureLayout?.referenceInsets)
  const showLyrics = scriptureLayout?.showText !== false
  const outputPlayback = useMemo(() => playback && (muteSignal || hideMedia)
    ? { ...playback, muted: true, playing: !hideMedia && playback.playing } : playback, [muteSignal, hideMedia, playback])
  const outputTrack = useMemo(() => trackPlayback && (muteSignal || hideSoundtrack)
    ? { ...trackPlayback, muted: true, playing: !hideSoundtrack && trackPlayback.playing } : trackPlayback, [muteSignal, hideSoundtrack, trackPlayback])
  const channelRef = useRef<ReturnType<typeof createPresenterChannel> | null>(null)
  const completionId = silentFeed ? undefined : cuePlayback?.completionId
  const reportOutcome = useCallback((slot: string, outcome: 'ended' | 'failed') => {
    if (completionId) channelRef.current?.reportMediaProgress(completionId, slot, outcome)
  }, [completionId])
  const reportLayer = useCallback((id: string, outcome: 'ended' | 'failed') => reportOutcome(`layer:${id}`, outcome), [reportOutcome])
  const loopMedia = cuePlayback?.loop ? true : cuePlayback?.once ? false : undefined
  const { url: localUrl, playbackKey, bindElement, locked, unlock, nativeLoop } = usePresentationMedia(media, outputPlayback, {
    loop: loopMedia ?? media?.repeat ?? (media?.kind === 'video' && media.role === 'background'),
    onEnded: () => reportOutcome('media', 'ended'), onUnavailable: () => reportOutcome('media', 'failed'),
  })
  const track = usePresentationMedia(silentFeed && !ndiAudio ? null : soundtrack, outputTrack, {
    loop: loopMedia ?? soundtrack?.repeat,
    onEnded: () => reportOutcome('soundtrack', 'ended'), onUnavailable: () => reportOutcome('soundtrack', 'failed'),
  })
  const soundKey = transitionSound ? presentationMediaKey(transitionSound) : undefined
  const soundMuted = muteSignal || Boolean(transitionSound && defaultMediaMuted(transitionSound))
  const soundPlaying = !blanked && !foregroundCleared && soundKey !== finishedTransitionSound
  const soundPlayback = useMemo(() => soundKey ? { key: soundKey, playing: soundPlaying, muted: soundMuted } : null,
    [soundKey, soundPlaying, soundMuted])
  const transitionTrack = usePresentationMedia(audioOff ? null : transitionSound, soundPlayback, {
    loop: transitionSound?.repeat, onEnded: () => setFinishedTransitionSound(soundKey),
  })
  const webUrl = !hideMedia && media?.kind === 'web' ? presentationWebUrl(media.url) : undefined
  const overlayMedia = !hideMedia && mode === 'design' && blendMedia && (localUrl || webUrl || media?.kind === 'camera')
  const showFallbackBackground = (!localUrl || hideMedia || mediaAlpha) && !webUrl && (hideMedia || media?.kind !== 'camera')
  const dimMedia = !foregroundCleared && Boolean(lyrics)
  const outputLyrics = useMemo(() => scriptureOutputText(lyrics, scriptureLayout, lyricRuns), [lyrics, scriptureLayout, lyricRuns])
  const lyricLines = outputLyrics.text.split('\n')
  const styledLyrics = useMemo(() => lyricRunsByLine(outputLyrics.text, outputLyrics.runs), [outputLyrics])
  const paragraphLyrics = styledLyrics && outputLyrics.runs?.some((run) => run.paragraph) ? outputLyrics.runs : undefined
  const fontRange = caption ? 'clamp(1rem, 4.2vw, 3.5rem)' : 'clamp(2rem, 5vw, 3.5rem)'
  const fontSize = `min(${fontRange}, ${(caption ? 64 : 75) / (lyricLines.length * 1.65)}dvh)`
  const videoRef = useRef<HTMLVideoElement>(null)
  const reportCamera = useCallback((key: string, status: string | null) => {
    if (!isKey) channelRef.current?.reportCamera(key, status)
  }, [isKey])
  const reportAlertProgress = useCallback((id: string, remaining: number, revision?: number) => {
    if (!isKey) channelRef.current?.reportAlertProgress(id, remaining, revision)
  }, [isKey])

  useEffect(() => {
    if (!isAlternate && !cleanOutput) return
    const previousTitle = document.title
    const title = isKey ? 'จอ Alpha Key' : isAlternate ? 'จอถ่ายทอดสด' : 'จอผู้ชม'
    document.title = `WorshipTeam · ${title}${keying && !isKey ? ' (Fill)' : ''}`
    return () => { document.title = previousTitle }
  }, [isAlternate, cleanOutput, isKey, keying])

  useEffect(() => {
    if (!keying || isKey || isNdi || (!locked && !track.locked && !transitionTrack.locked)) return
    function unlockFill(event: KeyboardEvent) {
      if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
      event.preventDefault()
      if (locked) unlock()
      if (track.locked) track.unlock()
      if (transitionTrack.locked) transitionTrack.unlock()
    }
    window.addEventListener('keydown', unlockFill)
    return () => window.removeEventListener('keydown', unlockFill)
  }, [keying, isKey, isNdi, locked, unlock, track, transitionTrack])

  const keyedCuts = useRef(cleanOutput)
  useEffect(() => { keyedCuts.current = cleanOutput }, [cleanOutput])

  useEffect(() => {
    if (silentFeed || !songProjection || recordedProjection.current === songProjection.id) return
    const record = songProjection.id
    recordedProjection.current = record
    void recordSongProjection(songProjection).catch((error) => {
      if (recordedProjection.current === record) recordedProjection.current = undefined
      channelRef.current?.reportSongProjectionFailure(record)
      console.error('Could not save projected song history', error)
    })
  }, [silentFeed, songProjection])

  // Listen for control messages
  useEffect(() => {
    if (isAlternate && !session) return
    const transitions = createSlideTransitionPlayer()

    function showMedia(next: PresentationMedia | null, hasSoundtrack = false) {
      setMedia(next)
      if (!next || next.kind === 'image' || next.kind === 'web' || (next.kind === 'camera' && next.audioLevel === undefined)) {
        setPlayback(null)
        return
      }
      const key = presentationMediaKey(next)
      setPlayback((current) => current?.key === key
        ? current : { key, playing: true, muted: (hasSoundtrack && next.kind !== 'camera') || defaultMediaMuted(next) })
    }

    function showSoundtrack(next: PresentationSoundtrack | null) {
      setSoundtrack(next)
      setTrackPlayback((current) => {
        if (!next) return null
        const key = presentationMediaKey(next)
        return current?.key === key ? current : { key, playing: true, muted: defaultMediaMuted(next) }
      })
    }

    function update(msg: PresentationMessage) {
      switch (msg.type) {
        case 'SHOW_LYRICS':
          setMode('lyrics')
          setScripture(msg.scripture)
          setSongLabel(msg.songLabel)
          setSongProjection(msg.songProjection)
          setCuePlayback(msg.cuePlayback)
          setDesign(null)
          setAlternateCue(msg.alternate)
          setLyrics(msg.lyrics)
          setLyricRuns(msg.lyricRuns)
          setSubtitle(msg.subtitle ?? '')
          showMedia(msg.media ?? null, Boolean(msg.soundtrack))
          showSoundtrack(msg.soundtrack ?? null)
          setTransitionSound(msg.transitionSound ?? null)
          if (msg.background) setBackgroundUrl(msg.background)
          break
        case 'SHOW_DESIGN':
          setMode('design')
          setScripture(msg.scripture)
          setSongLabel(msg.songLabel)
          setSongProjection(msg.songProjection)
          setCuePlayback(msg.cuePlayback)
          setBlendMedia(Boolean(msg.overlayMedia))
          setAlternateCue(msg.alternate)
          showMedia(msg.media ?? null, Boolean(msg.soundtrack))
          showSoundtrack(msg.soundtrack ?? null)
          setTransitionSound(msg.transitionSound ?? null)
          setDesign({ design: msg.design, playlistId: msg.playlistId })
          if (msg.background !== undefined) setBackgroundUrl(msg.background)
          break
        case 'SHOW_WELCOME':
          setMode('welcome')
          setWelcome(msg)
          setScripture(undefined)
          setSongLabel(undefined)
          setSongProjection(undefined)
          setCuePlayback(undefined)
          setDesign(null)
          setAlternateCue(undefined)
          showMedia(null)
          showSoundtrack(null)
          setTransitionSound(null)
          if (msg.welcomeImageUrl) setWelcomeImageUrl(msg.welcomeImageUrl)
          if (msg.background) setBackgroundUrl(msg.background)
          break
        case 'SHOW_BLACK':
          setMode('black')
          setScripture(undefined)
          setSongLabel(undefined)
          setSongProjection(undefined)
          setCuePlayback(undefined)
          setDesign(null)
          setAlternateCue(undefined)
          showMedia(null)
          showSoundtrack(null)
          setTransitionSound(null)
          break
        case 'SHOW_ALERT':
          setAlert(msg.alert)
          break
        case 'CLEAR_ALERT':
          setAlert(null)
          break
        case 'SET_NURSERY_ALERTS':
          setNursery(msg.display)
          break
        case 'SET_BACKGROUND':
          setBackgroundUrl(msg.url)
          break
        case 'SET_TEXT_POSITION':
          setTextVerticalOffset(Math.max(0, Math.min(100, msg.offset)))
          break
        case 'SET_TEXT_HIDDEN':
          setTextHidden(msg.hidden)
          break
        case 'SET_FOREGROUND_CLEARED':
          setForegroundCleared(msg.cleared)
          break
        case 'SET_OUTPUT_BLANKED':
          if (isAlternate) setBlanked(msg.blanked)
          break
        case 'SET_MEDIA_PLAYBACK':
          const update = (current: PresentationPlayback | null) => current?.key === msg.key ? {
            key: current.key,
            muted: msg.muted ?? current.muted,
            playing: msg.playing ?? current.playing,
          } : current
          setPlayback(update)
          setTrackPlayback(update)
          break
        case 'STOP_CAMERA':
          setMedia((current) => current?.kind === 'camera' && presentationMediaKey(current) === msg.key ? null : current)
          break
        case 'CLOSE':
          window.close()
          break
      }
    }

    const channel = createPresenterChannel((msg) => {
      if (msg.type === 'SHOW_LYRICS' || msg.type === 'SHOW_DESIGN') {
        transitions.show(() => update(msg), keyedCuts.current ? undefined : msg.transition)
        return
      }
      if (msg.type === 'SHOW_BLACK' || msg.type === 'SHOW_WELCOME' || msg.type === 'CLOSE'
        || msg.type === 'SET_FOREGROUND_CLEARED') transitions.reset()
      if (isAlternate && msg.type === 'SET_OUTPUT_BLANKED') transitions.setMasked(msg.blanked)
      update(msg)
    }, session)

    channelRef.current = channel
    return () => { channelRef.current = null; channel.close(); transitions.reset() }
  }, [isAlternate, session])

  // Play video background when URL changes
  useEffect(() => {
    if (videoRef.current && backgroundUrl) {
      videoRef.current.play().catch(() => {})
    }
  }, [backgroundUrl])

  return (
    <div data-output={isKey ? 'key' : output} data-signal={isKey ? 'key' : isNdi ? 'ndi' : keying ? 'fill' : undefined}
      aria-hidden={blanked || undefined} style={{
      position: 'fixed', ...outputInsets(margins), background: isNdi ? 'transparent' : 'black',
      overflow: 'hidden', boxShadow: isNdi ? undefined : '0 0 0 100vmax black', isolation: 'isolate',
    }}>
      {isKey && (
        <svg aria-hidden="true" width="0" height="0" className="absolute" focusable="false">
          <defs>
            <filter id="worship-alpha-key" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
              <feColorMatrix type="matrix" values="0 0 0 1 0  0 0 0 1 0  0 0 0 1 0  0 0 0 0 1" />
            </filter>
          </defs>
        </svg>
      )}
      <div className="absolute inset-0 overflow-hidden" style={{
        filter: isKey ? 'url(#worship-alpha-key)' : undefined,
        visibility: isNdi && blanked ? 'hidden' : undefined,
      }}>
        <div data-presentation-frame style={{ containerType: 'size' }} className={`absolute inset-0 overflow-hidden ${cleanOutput ? '' : 'bg-black'}`}>
          {/* Video background */}
          {backgroundUrl && (mode === 'lyrics' || mode === 'welcome' || (mode === 'design' && design?.design.inheritBackground))
            && (showFallbackBackground || media?.role !== 'background') && (
            <video
              ref={videoRef}
              src={backgroundUrl}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3,
                visibility: showFallbackBackground ? undefined : 'hidden' }}
              loop
              muted
              playsInline
              autoPlay
            />
          )}

          {(mode === 'lyrics' || mode === 'design') && webUrl && media?.kind === 'web' && (isKey
            ? <div aria-hidden="true" className="absolute inset-0 bg-black" />
            : <PresentationWebFrame key={playbackKey} url={webUrl} hideScrollbars={media.hideScrollbars} passive={isAlternate || isNdi} />)}
          {(!hideMedia && (mode === 'lyrics' || mode === 'design')) && media?.kind === 'camera' && playbackKey && (
            <PresentationCamera deviceId={media.deviceId} feedKey={playbackKey} background={media.role === 'background'}
              feedVideo={media.feedVideo}
              audioDeviceId={audioOff ? undefined : media.audioDeviceId}
              audioLevel={audioOff ? undefined : media.audioLevel}
              audioMuted={muteSignal || Boolean(activeSoundtrack) || outputPlayback?.muted || outputPlayback?.playing === false}
              audioPrompt={!cleanOutput && !blanked}
              label={isAlternate ? 'กล้องบนจอถ่ายทอดสด' : undefined}
              hasText={!hideText && (mode === 'design' ? Boolean(design?.design.layers.some((layer) => layer.kind === 'text' && layer.text.trim()))
                  : Boolean((showLyrics && lyrics) || caption))} report={reportCamera} />
          )}
          {(mode === 'lyrics' || (mode === 'design' && blendMedia)) && media && localUrl && (
            <div className={`absolute inset-0 ${cleanOutput || mediaAlpha ? '' : 'bg-black'}`}
              style={hideMedia ? { visibility: 'hidden' } : undefined}>
              {media.kind === 'image' ? (
                <img src={localUrl} alt="" style={{ objectFit: mediaObjectFit(media.playback, media.role === 'background') }}
                  className={`h-full w-full ${media.role === 'background' ? 'object-cover' : 'object-contain'} ${dimMedia ? 'opacity-60' : ''}`} />
              ) : media.kind === 'audio' ? (
                <audio key={playbackKey} ref={bindElement} src={localUrl} className="hidden" loop={nativeLoop}
                  onError={() => reportOutcome('media', 'failed')} />
              ) : (
                <PresentationVideo key={playbackKey} ref={bindElement} src={localUrl} alphaMode={mediaAlpha} playsInline loop={nativeLoop} muted={muteSignal || undefined}
                  onError={() => reportOutcome('media', 'failed')} onAlphaError={() => reportOutcome('media', 'failed')}
                  style={{ objectFit: mediaObjectFit(media.playback ?? media.dvdPlayback, media.role === 'background') }}
                  className={`h-full w-full ${media.role === 'background' ? 'object-cover' : 'object-contain'} ${dimMedia ? 'opacity-60' : ''}`} />
              )}
            </div>
          )}
          {soundtrack && track.url && (
            <audio key={track.playbackKey} ref={track.bindElement} src={track.url} loop={track.nativeLoop} muted={muteSignal || undefined} className="hidden"
              onError={() => reportOutcome('soundtrack', 'failed')} />
          )}
          {transitionSound && transitionTrack.url && (
            <audio key={transitionTrack.playbackKey} ref={transitionTrack.bindElement} src={transitionTrack.url}
              loop={transitionTrack.nativeLoop} muted={soundMuted || undefined} className="hidden" data-powerpoint-transition-audio />
          )}

          {/* Content overlay */}
          {mode === 'black' ? null : mode === 'design' && design && outputDesign ? (
            <LayeredSlide className="absolute inset-0 pointer-events-none" playlistId={design.playlistId}
              design={overlayMedia ? withoutCanvasBackground(outputDesign) : outputDesign}
              web={isKey ? 'mask' : isAlternate || isNdi ? 'passive' : 'live'}
              hideText={hideText} clearForeground={foregroundCleared}
              cameraPlayback={{ report: reportCamera, audio: !muteSignal && !blanked && !activeSoundtrack, audioPrompt: !cleanOutput && !blanked }}
              videoPlayback={{ runId: cuePlayback?.runId, loop: loopMedia, onOutcome: completionId ? reportLayer : undefined,
                audio: !muteSignal && !blanked, soundtrackActive: Boolean(activeSoundtrack), audioPrompt: !cleanOutput && !blanked }}
              transparent={cleanOutput || Boolean(overlayMedia || webUrl) || (!hideMedia && media?.kind === 'camera') || design.design.inheritBackground} />
          ) : mode === 'welcome' ? (
            <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: cleanOutput ? 'transparent' : 'black' }}>
              <LogoScreen key={welcome?.runId} logo={welcome?.logo} fallback={welcomeImageUrl} transparent={cleanOutput}
                audio={!muteSignal && !blanked} web={isKey ? 'mask' : isAlternate || isNdi ? 'passive' : undefined} />
            </div>
          ) : hideText ? null : (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 10,
                display: 'flex',
                flexDirection: 'column',
                minHeight: '100%',
                padding: 'var(--space-2xl) var(--space-4xl)',
                pointerEvents: webUrl ? 'none' : undefined,
              }}
            >
              {/* Top spacer — grows as offset increases (pushes content down) */}
              <div style={{ flex: `${textVerticalOffset} 0 0` }} />
              {/* Lyric content — horizontally centered via alignSelf (not marginLeft:auto) */}
              <div style={{ alignSelf: 'center', textAlign: 'center', maxWidth: 'min(100%, 64rem)', width: paragraphLyrics ? '100%' : undefined }}>
                {caption && scriptureLayout?.before && <p style={captionSpacing} className="mb-4 text-[clamp(1rem,2.6vw,2rem)] text-white/85 wrap-break-word">{captionText}</p>}
                {showLyrics && (paragraphLyrics ? <div style={{ fontSize, fontWeight: 300, color: 'white', lineHeight: 1.4, fontFamily: 'var(--font-display)', overflowWrap: 'anywhere' }}>
                  <ParagraphTextRuns runs={paragraphLyrics} />
                </div> : lyricLines.map((line, i) => (
                  <p
                    key={i}
                    style={{ fontSize, fontWeight: 300, color: 'white', lineHeight: 1.4, marginBottom: '0.2em', fontFamily: 'var(--font-display)', overflowWrap: 'anywhere' }}
                  >
                    {styledLyrics ? <StyledTextRuns runs={styledLyrics[i]} /> : line}
                  </p>
                )))}
                {caption && !scriptureLayout?.before && <p style={captionSpacing} className={`${showLyrics ? 'mt-4 ' : ''}text-[clamp(1rem,2.6vw,2rem)] text-white/85 wrap-break-word`}>{captionText}</p>}
              </div>
              {/* Bottom spacer — shrinks as offset increases */}
              <div style={{ flex: `${100 - textVerticalOffset} 0 0` }} />
            </div>
          )}
          {songLabel && settings.songLabels[output] && !hideText && !blanked && (mode === 'lyrics' || mode === 'design') && (
            <p data-song-slide-label className="pointer-events-none absolute top-[4%] left-[4%] z-20 line-clamp-2 max-w-[80%] wrap-anywhere text-white"
              style={{ fontSize: 'clamp(.75rem, 2.6vmin, 2rem)', textShadow: '0 1px 4px #000' }}>{songLabel}</p>
          )}
        </div>
        <div data-presentation-overlays className="pointer-events-none absolute inset-0 z-30">
          {!cleanOutput && !fullscreen && !blanked && (
            <button type="button" onClick={() => void toggleFullscreen()}
              className="pointer-events-auto absolute right-3 top-3 rounded-md bg-black/80 px-3! py-2! text-sm text-white opacity-0 hover:opacity-100 focus:opacity-100 focus-visible:outline-2 focus-visible:outline-white">
              เต็มจอ
            </button>
          )}
          {!cleanOutput && fullscreenError && <p className="absolute right-3 top-16 rounded bg-black/85 p-2! text-sm text-white" role="alert">
            เปิดเต็มจอไม่ได้ ลองใช้ปุ่มเต็มจอของเบราว์เซอร์
          </p>}
          {(alert || nursery) && <div className="pointer-events-none absolute inset-[5%] z-30 flex min-h-0 flex-col gap-2">
            {nursery?.style.position.startsWith('top') && mode !== 'black' && !blanked && <NurseryAlertBanner display={nursery} />}
            <div className="min-h-0 flex-1" />
            {nursery?.style.position.startsWith('bottom') && mode !== 'black' && !blanked && <NurseryAlertBanner display={nursery} />}
            {alert && messageAppearance?.enabled !== false && <OutputAlertBanner key={alert.id} alert={alert} visible={mode !== 'black' && !blanked} onProgress={reportAlertProgress}
              appearance={messageAppearance}
              style={{ order: messageAppearance?.position === 'top' ? -1 : undefined, flexShrink: 0, pointerEvents: 'auto', padding: '0.8rem 1.2rem', borderRadius: '0.5rem', background: 'rgba(180, 30, 30, 0.92)', color: 'white', fontSize: 'clamp(1rem, 2.4vw, 2rem)', fontFamily: 'var(--font-display)', maxHeight: '80%', overflowY: 'auto' }} />}
          </div>}
          {!cleanOutput && !blanked && ((!hideMedia && locked) || (!hideSoundtrack && track.locked) || transitionTrack.locked) && (
            <button type="button" onClick={() => {
              if (locked) unlock()
              if (track.locked) track.unlock()
              if (transitionTrack.locked) transitionTrack.unlock()
            }} className="pointer-events-auto absolute left-1/2 top-6 z-40 -translate-x-1/2 rounded-full bg-white px-4! py-2! text-sm text-black">
              แตะเพื่อเปิดสื่อ
            </button>
          )}
        </div>
      </div>
      {blanked && !isNdi && <div className="absolute inset-0 bg-black" style={{ zIndex: 2_147_483_647 }} />}
    </div>
  )
}
