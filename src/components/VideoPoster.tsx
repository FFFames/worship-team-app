/** Decodes a still without seeking or playing the video used for preview. */

import { useEffect, useState } from 'react'
import type { VideoAlphaMode } from '../types/media'
import { createSplitAlphaRenderer } from '../utils/splitAlphaRenderer'
import { videoPosterPosition } from '../utils/mediaClip'

function stillImage(video: HTMLVideoElement, alphaMode?: VideoAlphaMode) {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return undefined
  const packed = alphaMode ? document.createElement('canvas') : undefined
  const renderer = packed ? createSplitAlphaRenderer(packed) : undefined
  try {
    if (alphaMode) renderer?.draw(video, alphaMode)
    const width = packed?.width ?? video.videoWidth
    const height = packed?.height ?? video.videoHeight
    if (!width || !height) return undefined
    const scale = Math.min(1, 320 / width, 240 / height)
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    context.drawImage(packed ?? video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL(alphaMode ? 'image/png' : 'image/jpeg', 0.85)
  } finally { renderer?.dispose() }
}

export function VideoPoster({ src, seconds, alphaMode, name }: {
  src: string; seconds: number; alphaMode?: VideoAlphaMode; name: string
}) {
  const [image, setImage] = useState<string | null>()

  useEffect(() => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    let target: number | undefined
    let pending = true
    const timeout = window.setTimeout(fail, 10_000)

    function release() {
      pending = false
      window.clearTimeout(timeout)
      video.removeEventListener('loadedmetadata', seek)
      video.removeEventListener('loadeddata', draw)
      video.removeEventListener('seeked', draw)
      video.removeEventListener('error', fail)
      video.removeAttribute('src')
      video.load()
    }

    function fail() {
      setImage(null)
      release()
    }

    function seek() {
      target = videoPosterPosition(seconds, video.duration)
      if (target === undefined) return fail()
      if (video.currentTime !== target) video.currentTime = target
      draw()
    }

    function draw() {
      if (target === undefined || video.seeking || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
        || Math.abs(video.currentTime - target) > 0.05) return
      try { setImage(stillImage(video, alphaMode) ?? null) }
      catch { setImage(null) }
      finally { release() }
    }

    video.addEventListener('loadedmetadata', seek)
    video.addEventListener('loadeddata', draw)
    video.addEventListener('seeked', draw)
    video.addEventListener('error', fail)
    video.src = src
    return () => { if (pending) release() }
  }, [src, seconds, alphaMode])

  if (image === undefined) return <p className="text-sm text-[var(--fg-secondary)]" role="status">กำลังสร้างภาพตัวอย่าง</p>
  if (image === null) return <p className="text-sm text-[var(--status-error-text)]" role="status">เปิดภาพตัวอย่างที่บันทึกไว้ไม่ได้</p>
  return <img className="max-h-32 max-w-full rounded-md bg-black object-contain" src={image} alt={`ภาพตัวอย่าง ${name}`} />
}
