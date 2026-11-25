/** Captures video in an output window and releases the device on every exit. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { cameraConstraints, cameraErrorMessage, feedObjectFit, microphoneConstraints, microphoneErrorMessage } from '../utils/livePresentation'
import type { FeedVideo } from '../types/liveFeed'
import { ndiDeviceName } from '../utils/ndiInput'
import { PresentationNdiFeed } from './PresentationNdiFeed'
import { PresentationVideo } from './PresentationVideo'

type CameraProps = {
  deviceId: string
  feedKey: string
  background: boolean
  hasText: boolean
  feedVideo?: FeedVideo
  audioDeviceId?: string
  audioLevel?: number
  audioMuted?: boolean
  audioPrompt?: boolean
  report: (key: string, status: string | null) => void
  label?: string
  renderSurface?: boolean
}

export function PresentationCamera(props: CameraProps) {
  const name = ndiDeviceName(props.deviceId)
  return name ? <PresentationNdiFeed {...props} name={name} /> : <BrowserCamera key={props.feedKey} {...props} />
}

function BrowserCamera({ deviceId, feedKey, background, hasText, report, label = 'กล้องบนจอผู้ชม',
  feedVideo, audioDeviceId, audioLevel, audioMuted, audioPrompt, renderSurface }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { width, height, frameRate, fit } = feedVideo ?? {}
  const [videoStatus, setVideoStatus] = useState<string | null>()
  const [audioStatus, setAudioStatus] = useState<string | null>(null)
  const receiveAudio = Boolean(audioDeviceId) && audioLevel !== undefined
  useEffect(() => {
    const warning = videoStatus ?? (receiveAudio ? audioStatus : null)
    if (videoStatus !== undefined || warning) report(feedKey, warning)
  }, [videoStatus, audioStatus, receiveAudio, feedKey, report])

  useEffect(() => {
    const element = videoRef.current
    const devices = navigator.mediaDevices
    if (!element || !devices?.getUserMedia) {
      setVideoStatus('กล้องต้องใช้เบราว์เซอร์ที่รองรับและเปิดแอปผ่าน HTTPS หรือ localhost')
      return
    }

    let active = true
    let stream: MediaStream | undefined
    const lost = () => {
      release()
      if (active) setVideoStatus('สัญญาณกล้องขาด กรุณาตรวจสายหรือเลือกกล้องอีกครั้ง')
    }
    function release() {
      if (element) element.srcObject = null
      for (const track of stream?.getTracks() ?? []) {
        track.removeEventListener('ended', lost)
        track.stop()
      }
      stream = undefined
    }
    void devices.getUserMedia(cameraConstraints(deviceId, { width, height, frameRate })).then((result) => {
      if (!active) {
        result.getTracks().forEach((track) => track.stop())
        return
      }
      stream = result
      for (const track of stream.getVideoTracks()) track.addEventListener('ended', lost)
      element.srcObject = stream
      return element.play().then(() => {
        if (active) setVideoStatus(null)
      })
    }).catch((error: unknown) => {
      if (active) {
        release()
        setVideoStatus(cameraErrorMessage(error))
      }
    })

    return () => {
      active = false
      release()
    }
  }, [deviceId, width, height, frameRate])

  return <>
    <PresentationVideo ref={videoRef} aria-label={label} muted playsInline renderSurface={renderSurface}
      style={{ objectFit: feedObjectFit(fit, background) }}
      className={`absolute inset-0 h-full w-full ${hasText ? 'opacity-60' : ''}`} />
    {audioDeviceId && audioLevel !== undefined && <CameraMicrophone key={audioDeviceId} deviceId={audioDeviceId}
      level={audioLevel} muted={Boolean(audioMuted)} prompt={Boolean(audioPrompt)} report={setAudioStatus} />}
  </>
}

function CameraMicrophone({ deviceId, level, muted, prompt, report }: {
  deviceId: string
  level: number
  muted: boolean
  prompt: boolean
  report: (status: string | null) => void
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [stream, setStream] = useState<MediaStream>()
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    const devices = navigator.mediaDevices
    if (!devices?.getUserMedia) {
      report('ไมโครโฟนต้องใช้เบราว์เซอร์ที่รองรับและเปิดแอปผ่าน HTTPS หรือ localhost')
      return
    }
    let active = true
    let captured: MediaStream | undefined
    const lost = () => {
      release()
      setStream(undefined)
      report('สัญญาณไมโครโฟนขาด กรุณาตรวจการเชื่อมต่อหรือเลือกไมโครโฟนอีกครั้ง')
    }
    function release() {
      for (const track of captured?.getTracks() ?? []) {
        track.removeEventListener('ended', lost)
        track.stop()
      }
      captured = undefined
    }
    report(null)
    void devices.getUserMedia(microphoneConstraints(deviceId)).then((result) => {
      captured = result
      if (!active) { release(); return }
      for (const track of result.getAudioTracks()) track.addEventListener('ended', lost)
      setStream(result)
    }).catch((error: unknown) => {
      if (active) report(microphoneErrorMessage(error))
    })
    return () => {
      active = false
      release()
    }
  }, [deviceId, report])

  const play = useCallback((element: HTMLAudioElement) => {
    const source = element.srcObject
    function handleLock(blocked: boolean) {
      if (element.srcObject !== source || element.muted) return
      setLocked(blocked)
      report(blocked ? 'แตะเปิดเสียงไมโครโฟนในหน้าต่างจอผู้ชม' : null)
    }
    void element.play().then(() => handleLock(false)).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'NotAllowedError') handleLock(true)
    })
  }, [report])

  useEffect(() => {
    const element = audioRef.current
    if (!element || !stream) return
    element.srcObject = stream
    return () => {
      element.pause()
      element.srcObject = null
    }
  }, [stream])

  useEffect(() => {
    const element = audioRef.current
    if (!element || !stream) return
    element.volume = level / 100
    element.muted = muted
    if (muted) {
      element.pause()
      setLocked(false)
      report(null)
    } else {
      play(element)
    }
  }, [stream, level, muted, play, report])

  useEffect(() => {
    if (!locked || prompt) return
    function unlock(event: KeyboardEvent) {
      if (event.code === 'Space' && audioRef.current) play(audioRef.current)
    }
    window.addEventListener('keydown', unlock)
    return () => window.removeEventListener('keydown', unlock)
  }, [locked, prompt, play])

  return <>
    <audio ref={audioRef} hidden aria-label="เสียงไมโครโฟนของสัญญาณสด" />
    {locked && stream && !muted && prompt && <button type="button" onClick={() => {
      if (audioRef.current) play(audioRef.current)
    }} className="pointer-events-auto absolute left-1/2 top-6 z-40 -translate-x-1/2 rounded-full bg-white px-4! py-2! text-sm text-black">
      เปิดเสียงไมโครโฟน
    </button>}
  </>
}
