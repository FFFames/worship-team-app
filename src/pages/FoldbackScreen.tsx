import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { PresentationVideo } from '../components/PresentationVideo'
import { PresentationCamera } from '../components/PresentationCamera'
import { PresentationWebFrame } from '../components/PresentationWebFrame'
import { presentationWebUrl } from '../utils/livePresentation'
import { mediaObjectFit } from '../utils/mediaPlayback'
import { LayeredSlide } from '../components/LayeredSlide'
import { OutputAlertBanner } from '../components/OutputAlertBanner'
import { textEffectStyle } from '../components/StyledTextRuns'
import { useOutputSettings } from '../hooks/useOutputSettings'
import { useMessageAlertSettings } from '../hooks/useMessageAlertSettings'
import { useOutputFullscreen } from '../hooks/useOutputFullscreen'
import { usePresentationMedia } from '../hooks/usePresentationMedia'
import { useFittedText } from '../hooks/useFittedText'
import { listenToFoldback, type FoldbackState } from '../utils/foldbackChannel'
import { outputInsets } from '../utils/outputSettings'
import { presentationMediaKey } from '../utils/presentationChannel'
import { formatClock } from '../utils/alertTokens'
import { foldbackDefaultClockFormat, formatFoldbackContent, type FoldbackContentStyle, type FoldbackTextAppearance } from '../utils/foldbackAppearance'
import { foldbackServiceCountdown } from '../utils/foldbackServiceCountdown'
import { visibleNote } from '../utils/speakerNotes'

const audienceStatus = {
  live: '',
  black: 'จอผู้ชมมืด',
  clear: 'จอผู้ชมล้างข้อความ',
  welcome: 'จอผู้ชมแสดงภาพต้อนรับ',
}
const countdownLabels = { start: 'เริ่มนมัสการ', end: 'จบนมัสการ' }
const timeClass = 'min-w-0 wrap-anywhere font-mono text-[clamp(1.2rem,3.8vw,3.6rem)] tabular-nums'

const stageCameraPlayback = { report: () => {}, audio: false, audioPrompt: false }

function backgroundStyle(appearance: FoldbackTextAppearance | undefined, fallback: string): CSSProperties {
  if (!appearance?.backgroundColor && appearance?.opacity === undefined) return {}
  const color = appearance?.backgroundColor ?? fallback
  const alpha = Math.round((appearance?.opacity ?? 100) * 255 / 100).toString(16).padStart(2, '0')
  return { backgroundColor: color + alpha }
}

function textStyle(appearance?: FoldbackTextAppearance): CSSProperties {
  if (!appearance) return {}
  const { textColor, effects, fontFamily, fontRatio, bold, italic } = appearance
  return {
    ...textEffectStyle(effects, { color: textColor }),
    fontFamily,
    fontSize: fontRatio === undefined ? undefined : `max(.75rem, ${fontRatio * 100}dvh)`,
    fontWeight: bold === undefined ? undefined : bold ? 700 : 400,
    fontStyle: italic === undefined ? undefined : italic ? 'italic' : 'normal',
  }
}

function MainStageText({ lines, subtitle, appearance, textSamples }: {
  lines: string[]; subtitle?: string; appearance: FoldbackContentStyle; textSamples?: string[][]
}) {
  const frame = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLSpanElement>(null)
  const text = useMemo(() => formatFoldbackContent(lines, appearance), [lines, appearance])
  const samples = useMemo(() => appearance.normalize && appearance.layout?.sizing === 'fit' && textSamples?.length
    ? [...new Set(textSamples.map((sample) => formatFoldbackContent(sample, appearance)))] : undefined, [appearance, textSamples])
  const insets = appearance.layout?.insets
  const inset = (value?: number) => value === undefined ? undefined : `${Math.min(0.49, value) * 100}%`
  const heightInset = (value?: number) => value === undefined ? undefined : `${Math.min(0.49, value) * 100}cqh`
  const vertical = appearance.verticalAlign ?? 'center'
  const { fontFamily, fontWeight, fontStyle } = textStyle(appearance)
  const style: CSSProperties = {
    fontFamily, fontWeight, fontStyle,
    fontSize: appearance.fontRatio === undefined
      ? `clamp(1.25rem, min(5vw, ${47 / (samples ? 1 : lines.length)}dvh), 5.25rem)` : `${appearance.fontRatio * 100}dvh`,
    textAlign: appearance.align ?? 'center',
    alignItems: 'stretch',
    justifyContent: vertical === 'top' ? 'start' : vertical === 'bottom' ? 'safe end' : 'safe center',
    whiteSpace: appearance.wrap === false ? 'pre' : 'pre-wrap',
    overflowWrap: appearance.wrap === false ? undefined : 'anywhere',
    paddingTop: heightInset(insets?.top) ?? '0.75rem',
    paddingBottom: heightInset(insets?.bottom) ?? '0.75rem',
    paddingLeft: inset(insets?.left) ?? '4%',
    paddingRight: inset(insets?.right) ?? '4%',
  }
  useFittedText(frame, body, { text, style, enabled: appearance.layout?.sizing === 'fit', fitWidth: appearance.wrap === false, samples })
  return (
    <div className="absolute inset-0 flex min-h-0 flex-col" style={backgroundStyle(appearance, '#000000')}>
      {subtitle && <p className="shrink-0 px-[4%]! py-1! text-center text-[clamp(1rem,2.5vw,2rem)] text-emerald-200">{subtitle}</p>}
      <div ref={frame} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto leading-tight font-medium" style={style}>
        <span ref={body} className="block w-full min-w-0 shrink-0"
          style={textEffectStyle(appearance.effects, { color: appearance.textColor })}>{text}</span>
      </div>
    </div>
  )
}

export default function FoldbackScreen() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const isNdi = searchParams.get('signal') === 'ndi'
  const code = searchParams.get('session') ?? ''
  const session = id && /^[a-f\d-]{36}$/i.test(code) ? `${id}:${code}` : ''
  const { stage: margins, foldback, foldbackContent, foldbackService } = useOutputSettings()
  const messageAppearance = useMessageAlertSettings().stage
  const [state, setState] = useState<FoldbackState | null>(null)
  const foldbackRef = useRef<ReturnType<typeof listenToFoldback> | null>(null)
  const reportAlertProgress = useCallback((id: string, remaining: number, revision?: number) => foldbackRef.current?.reportAlertProgress(id, remaining, revision), [])
  const [now, setNow] = useState(() => new Date())
  const { fullscreen, fullscreenError, toggleFullscreen } = useOutputFullscreen()
  const slide = state?.slide
  const speakerNotes = visibleNote(slide?.speakerNotes)
  const cueNotes = slide?.cueNotes
  const notesPanel = useRef<HTMLElement>(null)
  const media = slide?.media ?? null
  const playing = state?.playing ?? true
  const playback = useMemo(() => media?.kind === 'video'
    ? { key: presentationMediaKey(media), playing, muted: true }
    : null, [media, playing])
  const { url, playbackKey, bindElement, locked, unlock, nativeLoop } = usePresentationMedia(media, playback, {
    loop: slide?.videoPlayback?.loop ?? media?.repeat ?? (media?.role === 'background'),
  })

  useEffect(() => {
    setState(null)
    if (!session) return
    const connection = listenToFoldback(session, setState)
    foldbackRef.current = connection
    return () => {
      foldbackRef.current = null
      connection.close()
    }
  }, [session])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000)
    return () => { window.clearInterval(interval) }
  }, [])

  useEffect(() => {
    if (notesPanel.current) notesPanel.current.scrollTop = 0
  }, [speakerNotes, cueNotes])

  const nextLines = state?.nextLines ?? foldback.nextLines ?? 2
  const lines = slide?.lines ?? []
  const camera = media?.kind === 'camera' ? media : undefined
  const webUrl = media?.kind === 'web' ? presentationWebUrl(media.url) : undefined
  const contentAppearance = slide?.textRole && foldbackContent[slide.textRole]
  const status = state && audienceStatus[state.audience]
  const clock = foldback.clock
  const clockPosition = clock?.position ?? 'top-right'
  const servicePosition = foldbackService.position ?? 'top-left'
  const countdown = foldbackServiceCountdown(foldbackService, now)
  const clockText = clock?.enabled !== false ? (
    <time aria-label="เวลา" dateTime={now.toISOString()} className={timeClass}
      style={{ ...backgroundStyle(clock, '#000000'), ...textStyle(clock) }}>
      {formatClock(now, clock?.format ?? foldbackDefaultClockFormat)}
    </time>
  ) : null
  const countdownText = countdown ? (
    <div role="timer" aria-label={countdownLabels[countdown.phase]} className="flex min-w-0 flex-wrap items-baseline gap-x-2"
      style={backgroundStyle(foldbackService, '#000000')}>
      <span className="text-xs text-zinc-300">{countdownLabels[countdown.phase]}</span>
      <span className={timeClass} style={textStyle(foldbackService)}>{countdown.text}</span>
    </div>
  ) : null

  function timers(position: typeof clockPosition) {
    const atClock = clockPosition === position && clockText
    const atService = servicePosition === position && countdownText
    return (atClock || atService) && (
      <div className="flex min-w-0 flex-wrap items-baseline justify-end gap-x-4">
        {atClock}
        {atService}
      </div>
    )
  }

  return (
    <main data-output="foldback" aria-label="จอเวทีสด" className="fixed flex min-h-0 flex-col overflow-y-auto bg-black text-white"
      style={{ ...outputInsets(margins), boxShadow: '0 0 0 100vmax black' }}>
      <header className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-4 border-b border-white/20 px-[3%]! py-[1%]!">
        {timers('top-left')}
        <h1 className="min-w-0 flex-1 wrap-break-word text-[clamp(1rem,2.5vw,2.1rem)]! font-medium!">{slide?.title || 'จอเวทีสด'}</h1>
        {timers('top-right')}
      </header>

      {state?.alert && messageAppearance?.enabled !== false && (
        <OutputAlertBanner key={state.alert.id} alert={state.alert} onProgress={reportAlertProgress}
          appearance={messageAppearance}
          style={{ order: messageAppearance?.position === 'bottom' ? 1 : undefined, fontSize: 'clamp(1rem,3vw,2.75rem)' }}
          className="max-h-[30%] shrink-0 overflow-y-auto bg-amber-300 px-[3%]! py-[1%]! font-semibold text-zinc-950" />
      )}

      <section aria-label="สไลด์ปัจจุบัน" className="relative grid min-h-36 flex-1 overflow-y-auto" style={{ containerType: 'size' }}>
        {webUrl && media?.kind === 'web' && <PresentationWebFrame key={playbackKey} url={webUrl} hideScrollbars={media.hideScrollbars} passive />}
        {camera && playbackKey && (
          <PresentationCamera deviceId={camera.deviceId} feedKey={playbackKey} background={camera.role === 'background'}
            hasText={!slide?.design && lines.length > 0} feedVideo={camera.feedVideo} audioPrompt={false}
            label="กล้องบนจอเวที" report={stageCameraPlayback.report} />
        )}
        {slide?.design ? (
          <LayeredSlide design={slide.design} playlistId={id} videoPlayback={slide.videoPlayback} web="passive"
            cameraPlayback={stageCameraPlayback} transparent={Boolean(camera || webUrl)} />
        ) : url && media?.kind === 'video' && lines.length === 0 ? (
          <PresentationVideo key={playbackKey} ref={bindElement} src={url} alphaMode={media.alphaMode} className="absolute inset-0 h-full w-full object-contain"
            style={{ objectFit: mediaObjectFit(media.playback ?? media.dvdPlayback, media.role === 'background') }} playsInline muted loop={nativeLoop} />
        ) : url && media?.kind === 'image' && lines.length === 0 ? (
          <img src={url} alt="" className="absolute inset-0 h-full w-full object-contain"
            style={{ objectFit: mediaObjectFit(media.playback, media.role === 'background') }} />
        ) : lines.length > 0 && contentAppearance && Object.keys(contentAppearance).length > 0 ? (
          <MainStageText lines={lines} subtitle={slide?.subtitle} appearance={contentAppearance} textSamples={slide?.textSamples} />
        ) : (camera || webUrl) && lines.length === 0 ? null : (
          <div className="relative m-auto! w-full px-[4%]! py-3! text-center wrap-break-word">
            {slide?.subtitle && <p className="mb-2! max-w-none! text-[clamp(1rem,2.5vw,2rem)]! text-emerald-200">{slide.subtitle}</p>}
            {lines.length > 0 ? (
              <p className="max-w-none! leading-tight! font-medium whitespace-pre-wrap"
                style={{ fontSize: `clamp(1.25rem, min(5vw, ${47 / lines.length}dvh), 5.25rem)` }}>{lines.join('\n')}</p>
            ) : (
              <p className="max-w-none! text-[clamp(1.1rem,3vw,2.25rem)]! text-zinc-300">
                {slide?.title || (state ? 'รอเริ่มฉาย' : session ? 'รอเชื่อมต่อกับหน้าควบคุม' : 'เปิดจอนี้จากหน้าควบคุมการนำเสนอ')}
              </p>
            )}
          </div>
        )}
        {!isNdi && locked && <button type="button" className="btn-secondary absolute top-2 left-2" onClick={unlock}>แตะเพื่อเล่นวิดีโอ</button>}
      </section>

      {(speakerNotes || cueNotes) && (
        <section ref={notesPanel} aria-label="โน้ตทีมงาน" tabIndex={0}
          className="grid max-h-[27dvh] shrink-0 gap-2 overflow-y-auto border-t border-white/20 bg-zinc-950 px-[3%]! py-2! focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-emerald-200">
          {speakerNotes && <div>
            <h2 className="text-[clamp(.85rem,1.5vw,1.25rem)]! text-emerald-200">โน้ตผู้บรรยาย</h2>
            <p className="max-w-none! text-[clamp(1rem,2.25vw,2rem)] leading-snug! whitespace-pre-wrap wrap-anywhere">{speakerNotes}</p>
          </div>}
          {cueNotes && <div>
            <h2 className="text-[clamp(.85rem,1.5vw,1.25rem)]! text-emerald-200">บันทึกรายการ</h2>
            <p className="max-w-none! text-[clamp(1rem,2.25vw,2rem)] leading-snug! whitespace-pre-wrap wrap-anywhere">{cueNotes}</p>
          </div>}
        </section>
      )}

      {nextLines > 0 && state?.next && (
        <section aria-label="ถัดไป" className="max-h-[36%] shrink-0 overflow-y-auto border-t border-white/20 bg-zinc-900 px-[3%]! py-[1%]! wrap-break-word"
          style={backgroundStyle(foldback.next, '#18181b')}>
          <p className="max-w-none! text-[clamp(0.9rem,1.7vw,1.4rem)] text-emerald-200"
            style={state.next.lines?.length ? { color: foldback.next?.textColor } : textStyle(foldback.next)}>ถัดไป · {state.next.label}</p>
          {state.next.lines?.length ? (
            <p className="max-w-none! text-[clamp(1.1rem,3.1vw,2.8rem)] leading-tight! whitespace-pre-wrap"
              style={textStyle(foldback.next)}>{state.next.lines.slice(0, nextLines).join('\n')}</p>
          ) : null}
        </section>
      )}

      <footer className="order-last flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/20 px-[3%]! py-1! text-sm">
        {timers('bottom-left')}
        <p role="status" className="min-w-0 flex-1 text-zinc-300">{!isNdi && fullscreenError ? 'เบราว์เซอร์เปิดเต็มจอไม่ได้' : status}</p>
        {!isNdi && document.fullscreenEnabled && <button type="button" className="btn-secondary text-sm!"
          onClick={() => void toggleFullscreen()}>{fullscreen ? 'ออกจากเต็มจอ' : 'เต็มจอ'}</button>}
        {timers('bottom-right')}
      </footer>
    </main>
  )
}
