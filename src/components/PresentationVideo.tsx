/** Displays video directly or paints frames on a compositable canvas. */

import { forwardRef, useCallback, useEffect, useRef, useState, type ComponentPropsWithoutRef } from 'react'
import type { VideoAlphaMode } from '../types/media'
import { splitVideoAlpha } from '../utils/videoAlpha'
import { createSplitAlphaRenderer } from '../utils/splitAlphaRenderer'

type VideoProps = ComponentPropsWithoutRef<'video'> & {
  alphaMode?: VideoAlphaMode
  onAlphaError?: () => void
  renderSurface?: boolean
}

export const PresentationVideo = forwardRef<HTMLVideoElement, VideoProps>(function PresentationVideo(
  { alphaMode, onAlphaError, renderSurface, ...props }, ref,
) {
  const mode = splitVideoAlpha(alphaMode)
  if (!mode && !renderSurface) return <video {...props} ref={ref} />
  return <CompositedVideo {...props} ref={ref} alphaMode={mode} onAlphaError={onAlphaError} />
})

const CompositedVideo = forwardRef<HTMLVideoElement, VideoProps>(function CompositedVideo(
  { alphaMode, onAlphaError, style, className, controls, ...props }, ref,
) {
  const video = useRef<HTMLVideoElement | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const report = useRef(onAlphaError)
  const [preview, setPreview] = useState({ playing: false, duration: 0, time: 0 })
  const [failed, setFailed] = useState(false)

  const bind = useCallback((element: HTMLVideoElement | null) => {
    video.current = element
    if (typeof ref === 'function') ref(element)
    else if (ref) ref.current = element
  }, [ref])

  useEffect(() => { report.current = onAlphaError }, [onAlphaError])

  useEffect(() => {
    const media = video.current
    const surface = canvas.current
    if (!media || !surface) return
    let renderer: ReturnType<typeof createSplitAlphaRenderer> | undefined
    let context: CanvasRenderingContext2D | null = null
    let pending: number | undefined
    let failed = false
    let lost = false
    const frameCallbacks = typeof media.requestVideoFrameCallback === 'function'
    setFailed(false)

    function cancel() {
      if (pending === undefined || !media) return
      if (frameCallbacks) media.cancelVideoFrameCallback(pending)
      else window.cancelAnimationFrame(pending)
      pending = undefined
    }

    function draw() {
      if (!media || !surface || failed || lost || media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
      try {
        if (alphaMode) {
          renderer ??= createSplitAlphaRenderer(surface)
          renderer.draw(media, alphaMode)
        } else {
          const { videoWidth: width, videoHeight: height } = media
          if (!width || !height) return
          context ??= surface.getContext('2d')
          if (!context) throw new Error('Video compositing canvas is unavailable')
          if (surface.width !== width) surface.width = width
          if (surface.height !== height) surface.height = height
          context.drawImage(media, 0, 0)
        }
      } catch {
        failed = true
        cancel()
        surface.width = 0
        setFailed(true)
        report.current?.()
      }
    }

    function frame() {
      pending = undefined
      draw()
      schedule()
    }

    function schedule() {
      if (!media || pending !== undefined || failed || lost || media.paused || media.ended) return
      pending = frameCallbacks ? media.requestVideoFrameCallback(frame) : window.requestAnimationFrame(frame)
    }

    function update() {
      draw()
      if (media?.paused) cancel()
      else schedule()
    }

    function clear() {
      cancel()
      if (surface) surface.width = 0
    }

    function contextLost(event: Event) {
      event.preventDefault()
      cancel()
      lost = true
      renderer?.dispose()
      renderer = undefined
    }

    function contextRestored() {
      lost = false
      update()
    }

    const updates = ['loadeddata', 'playing', 'pause', 'seeked', 'resize', 'ended']
    for (const event of updates) media.addEventListener(event, update)
    media.addEventListener('emptied', clear)
    surface.addEventListener('webglcontextlost', contextLost)
    surface.addEventListener('webglcontextrestored', contextRestored)
    update()
    return () => {
      cancel()
      for (const event of updates) media.removeEventListener(event, update)
      media.removeEventListener('emptied', clear)
      surface.removeEventListener('webglcontextlost', contextLost)
      surface.removeEventListener('webglcontextrestored', contextRestored)
      renderer?.dispose()
    }
  }, [alphaMode, props.src])

  useEffect(() => {
    if (!controls || !video.current) return
    const media = video.current
    const update = () => setPreview({ playing: !media.paused && !media.ended,
      time: media.currentTime, duration: Number.isFinite(media.duration) ? media.duration : 0 })
    const events = ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended', 'emptied']
    for (const event of events) media.addEventListener(event, update)
    update()
    return () => { for (const event of events) media.removeEventListener(event, update) }
  }, [controls, props.src])

  function toggle() {
    const media = video.current
    if (!media) return
    if (media.paused || media.ended) void media.play().catch(() => {})
    else media.pause()
  }

  return (
    <>
      <canvas ref={canvas} data-video-alpha={alphaMode} className={className} style={style}
        aria-label={props['aria-label']} aria-hidden={props['aria-label'] ? undefined : true} />
      <video {...props} ref={bind} aria-hidden="true" tabIndex={-1} style={{
        position: 'absolute', top: 0, left: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none',
      }} />
      {controls && <div className="mt-2! flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary" disabled={failed || !preview.duration} onClick={toggle}>
          {preview.playing ? 'พักวิดีโอ' : 'เล่นวิดีโอ'}
        </button>
        <input type="range" className="min-w-24 flex-1" aria-label="ตำแหน่งเล่นวิดีโอ"
          min={0} max={preview.duration || 0} step={0.01} value={Math.min(preview.time, preview.duration)}
          disabled={failed || !preview.duration}
          onChange={(event) => { if (video.current) video.current.currentTime = event.currentTarget.valueAsNumber }} />
        {failed && <p role="alert" className="w-full text-sm text-[var(--status-error-text)]">เปิดวิดีโอแบบแยกภาพและมาสก์ไม่ได้</p>}
      </div>}
    </>
  )
})
