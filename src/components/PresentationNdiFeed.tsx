/** Draws straight-alpha NDI video in the same layer as a local camera. */

import { useEffect, useRef } from 'react'
import { ndiInputError } from '../utils/ndiInput'
import { createNdiAudioPlayer } from '../utils/ndiAudioPlayer'
import type { FeedVideo } from '../types/liveFeed'
import { feedObjectFit } from '../utils/livePresentation'

export function PresentationNdiFeed({ name, feedKey, background, hasText, feedVideo, audioLevel, audioMuted, report }: {
  name: string
  feedKey: string
  background: boolean
  hasText: boolean
  feedVideo?: FeedVideo
  audioLevel?: number
  audioMuted?: boolean
  report: (key: string, status: string | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<ReturnType<typeof createNdiAudioPlayer> | undefined>(undefined)
  const receiveAudio = audioLevel !== undefined
  const fit = feedObjectFit(feedVideo?.fit, background)
  const size = fit === 'cover' ? 'max' : 'min'
  const aspect = 'var(--ndi-aspect, 1)'
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    const bridge = window.worshipNdiInput
    if (!canvas || !context || !bridge) {
      report(feedKey, 'รับสัญญาณ NDI ได้ในแอป WorshipTeam Desktop')
      return
    }
    const audio = receiveAudio ? createNdiAudioPlayer() : undefined
    audioRef.current = audio
    let currentAspect: number | undefined
    let showing = false
    const disconnect = bridge.watch(name, (update) => {
      if (update.kind === 'audio') {
        audio?.push(update)
        return
      }
      if (update.kind === 'status') {
        showing = false
        audio?.reset()
        context.clearRect(0, 0, canvas.width, canvas.height)
        report(feedKey, update.state === 'error' ? ndiInputError(update.error)
          : update.state === 'lost' ? 'สัญญาณ NDI ขาด กำลังรอเชื่อมต่อใหม่' : 'กำลังรอภาพจากแหล่ง NDI')
        return
      }
      const { width, height, aspect, pixels } = update
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      if (currentAspect !== aspect) {
        currentAspect = aspect
        canvas.style.setProperty('--ndi-aspect', String(aspect))
      }
      const rgba = new Uint8ClampedArray(pixels.buffer as ArrayBuffer, pixels.byteOffset, pixels.byteLength)
      context.putImageData(new ImageData(rgba, width, height), 0, 0)
      if (!showing) {
        showing = true
        report(feedKey, null)
      }
    }, receiveAudio)
    return () => {
      disconnect()
      audio?.close()
      audioRef.current = undefined
      context.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [name, feedKey, receiveAudio, report])

  useEffect(() => {
    audioRef.current?.setGain(audioLevel ?? 0, Boolean(audioMuted))
  }, [name, feedKey, audioLevel, audioMuted, report])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden [container-type:size]">
      <canvas ref={canvasRef} aria-label={`NDI · ${name}`} data-ndi-feed
        style={{ width: fit === 'fill' ? '100%' : `${size}(100cqw, calc(100cqh * ${aspect}))`,
          height: fit === 'fill' ? '100%' : `${size}(100cqh, calc(100cqw / ${aspect}))` }}
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${hasText ? 'opacity-60' : ''}`} />
    </div>
  )
}
