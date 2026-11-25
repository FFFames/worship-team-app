import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { OutputAlert } from '../types/alertTemplate'
import { shouldScrollAlert } from '../utils/alertPlayback'
import { renderAlertTokens } from '../utils/alertTokens'
import { replaceInTextRuns } from '../utils/textRunReplacement'
import { StyledTextRuns, safeFont, textEffectStyle } from './StyledTextRuns'
import { alertMarqueeDuration, type MessageAlertStyle } from '../utils/messageAlertSettings'

const staticPassMs = 6000
export function OutputAlertBanner({ alert, visible = true, onProgress, style, className, appearance }: {
  alert: OutputAlert
  visible?: boolean
  onProgress: (id: string, remaining: number, revision?: number) => void
  style?: CSSProperties
  className?: string
  appearance?: MessageAlertStyle
}) {
  const frame = useRef<HTMLDivElement>(null)
  const text = useRef<HTMLSpanElement>(null)
  const probe = useRef<HTMLSpanElement>(null)
  const animation = useRef<Animation | null>(null)
  const frozen = useRef(!visible)
  const finishAfterPass = useRef(false)
  const passProgress = useRef(0)
  const remaining = useRef(alert.playback.passes)
  const revision = useRef(alert.revision ?? 0)
  const progress = useRef(onProgress)
  const [finished, setFinished] = useState(false)
  const [metrics, setMetrics] = useState({ frameWidth: 0, labelWidth: 0 })
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [now, setNow] = useState(() => new Date())
  const { mode, alignment } = alert.playback
  const scrollSpeed = appearance?.scrollSpeed
  const scrolling = shouldScrollAlert(mode, reducedMotion, metrics.labelWidth, metrics.frameWidth)
  const rendered = renderAlertTokens(alert, now)
  const compact = replaceInTextRuns(rendered.text, rendered.runs, /\s+/g, () => ' ')
  const line = scrolling ? compact : rendered

  useEffect(() => {
    if (!alert.clock || finished) return
    const update = () => setNow(new Date())
    update()
    const timer = window.setInterval(update, 200)
    return () => window.clearInterval(timer)
  }, [alert.clock, finished])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const track = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    media.addEventListener('change', track)
    return () => media.removeEventListener('change', track)
  }, [])

  useLayoutEffect(() => {
    const element = frame.current
    if (!element) return
    let active = true
    const measure = () => {
      if (!active) return
      const frameWidth = element.clientWidth
      const labelWidth = probe.current?.offsetWidth ?? 0
      setMetrics((previous) => previous.frameWidth === frameWidth && previous.labelWidth === labelWidth ? previous : { frameWidth, labelWidth })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    if (probe.current) observer.observe(probe.current)
    measure()
    return () => { active = false; observer.disconnect() }
  }, [mode, finished])

  useLayoutEffect(() => {
    progress.current = onProgress
  }, [onProgress])

  useLayoutEffect(() => {
    const version = alert.revision ?? 0
    if (revision.current === version) return
    revision.current = version
    remaining.current = alert.playback.passes
    setFinished(false)
  }, [alert.revision, alert.playback.passes])

  useLayoutEffect(() => {
    finishAfterPass.current = rendered.expired
    if (rendered.expired && (!scrolling || !animation.current) && !finished) {
      progress.current(alert.id, 0, revision.current)
      setFinished(true)
    }
  }, [alert.id, rendered.expired, scrolling, finished])

  useLayoutEffect(() => {
    frozen.current = !visible
    if (visible) animation.current?.play()
    else animation.current?.pause()
  }, [visible])

  useLayoutEffect(() => {
    const element = text.current
    if (!element || finished || !metrics.frameWidth || remaining.current === 0 || (!scrolling && remaining.current === null)) return

    let active = true
    const run = () => {
      const frames = scrolling
        ? [{ transform: `translateX(${metrics.frameWidth}px)` }, { transform: 'translateX(-100%)' }]
        : [{ opacity: 1 }, { opacity: 1 }]
      const duration = scrolling ? alertMarqueeDuration(metrics.frameWidth, metrics.labelWidth, scrollSpeed) : staticPassMs
      const pass = element.animate(frames, { duration, fill: 'both' })
      animation.current = pass
      const startProgress = passProgress.current
      passProgress.current = 0
      if (startProgress) pass.currentTime = startProgress * duration
      if (frozen.current) pass.pause()
      void pass.finished.then(() => {
        if (!active || animation.current !== pass) return
        pass.cancel()
        if (finishAfterPass.current) {
          progress.current(alert.id, 0, revision.current)
          setFinished(true)
          return
        }
        if (remaining.current === null) {
          run()
          return
        }
        remaining.current--
        progress.current(alert.id, remaining.current, revision.current)
        if (remaining.current > 0) run()
        else setFinished(true)
      }).catch(() => {})
    }

    run()
    return () => {
      active = false
      const current = animation.current
      const duration = Number(current?.effect?.getTiming().duration)
      const time = Number(current?.currentTime)
      if (duration > 0 && time > 0) passProgress.current = Math.min(0.999, time / duration)
      animation.current?.cancel()
      animation.current = null
    }
  }, [alert.id, metrics.frameWidth, metrics.labelWidth, scrolling, scrollSpeed, finished])

  if (finished) return null
  const defaultTextStyle = appearance ? { color: appearance.textColor } : undefined
  const plainEffects = textEffectStyle(appearance?.effects, undefined, defaultTextStyle)
  const visualStyle: CSSProperties = {
    ...style,
    ...(appearance && {
      background: appearance.backgroundColor + Math.round(appearance.opacity * 255 / 100).toString(16).padStart(2, '0'),
      color: appearance.textColor,
    }),
    ...(appearance?.fontFamily && { fontFamily: `${safeFont(appearance.fontFamily)}, sans-serif` }),
    ...(appearance?.fontRatio && { fontSize: `min(${appearance.fontRatio * 100}dvh, 25dvw)` }),
    fontWeight: appearance?.bold === undefined ? (alert.runs ? 400 : style?.fontWeight) : appearance.bold ? 700 : 400,
    fontStyle: appearance?.italic === undefined ? style?.fontStyle : appearance.italic ? 'italic' : 'normal',
    visibility: visible ? undefined : 'hidden',
  }
  return (
    <div role={visible ? 'alert' : undefined} aria-hidden={!visible || undefined} className={className}
      data-alert-mode={scrolling ? 'scroll' : 'static'} data-alert-position={appearance?.position} style={visualStyle}>
      <div ref={frame} style={{ position: 'relative', overflow: 'hidden', textAlign: scrolling ? 'left' : alignment }}>
        {mode !== 'static' && <span ref={probe} aria-hidden="true"
          style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden', whiteSpace: 'nowrap',
            ...(!compact.runs && plainEffects) }}>
          {compact.runs ? <StyledTextRuns runs={compact.runs} base={defaultTextStyle} effects={appearance?.effects} /> : compact.text}
        </span>}
        <span ref={text} style={{ display: 'inline-block', whiteSpace: scrolling ? 'nowrap' : 'pre-wrap', overflowWrap: 'anywhere',
          ...(!line.runs && plainEffects) }}>
          {line.runs ? <StyledTextRuns runs={line.runs} base={defaultTextStyle} effects={appearance?.effects} /> : line.text}
        </span>
      </div>
    </div>
  )
}
